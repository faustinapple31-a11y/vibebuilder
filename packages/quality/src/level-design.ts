import { sampleHeight, type Placement, type Vec2, type WorldBake } from "@worldforge/core";
import { measureFirstView } from "./first-view";

/**
 * Level design review: is this a place someone designed? Eight weighted criteria, each with the exact problems that
 * cost it points and, when one exists, a correction the generator can apply. It reads the bake alone, so a map from
 * the generator, from an agent or edited by hand is judged the same way.
 */
export const LEVEL_CRITERIA = ["geography", "urban", "architecture", "relief", "roads", "player", "composition", "environment"] as const;
export type LevelCriterion = (typeof LEVEL_CRITERIA)[number];
export const LEVEL_WEIGHTS: Record<LevelCriterion, number> = { geography: 15, urban: 15, architecture: 15, relief: 15, roads: 10, player: 15, composition: 10, environment: 5 };

export type LevelFix =
  | { type: "move_building"; id: string; reason: string }
  | { type: "turn_building"; id: string; rotationY: number }
  | { type: "remove_placement"; id: string }
  | { type: "connect"; zone: string; from: Vec2 }
  | { type: "flatten"; center: Vec2; radius: number };

export interface LevelProblem {
  criterion: LevelCriterion;
  id: string;
  severity: "low" | "medium" | "high";
  message: string;
  position?: Vec2;
  placement?: string;
  fix?: LevelFix;
}

export interface LevelReport {
  score: number;
  criteria: Record<LevelCriterion, number>;
  problems: LevelProblem[];
  metrics: Record<string, number>;
}

interface Footprint {
  p: Placement;
  x: number;
  z: number;
  /** Half sizes along the building's own axes. */
  hx: number;
  hz: number;
  cos: number;
  sin: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

function footprints(bake: WorldBake): Footprint[] {
  const out: Footprint[] = [];
  for (const p of bake.placements) {
    if (p.category !== "building" || p.id.startsWith("layout_") || p.prefab === "well" || p.prefab === "bridge" || p.prefab === "plank_bridge") continue;
    const v = bake.prefabs[p.prefab]?.[p.variant];
    if (!v) continue;
    const hx = ((v.bounds.max[0] - v.bounds.min[0]) / 2) * p.scale * 0.82; // eaves overhang the walls
    const hz = ((v.bounds.max[2] - v.bounds.min[2]) / 2) * p.scale * 0.82;
    out.push({ p, x: p.position[0], z: p.position[2], hx, hz, cos: Math.cos(p.rotationY), sin: Math.sin(p.rotationY) });
  }
  return out;
}

/** Separating axis test between two oriented rectangles; returns the penetration depth, 0 when apart. */
function overlap(a: Footprint, b: Footprint): number {
  let depth = Infinity;
  for (const f of [a, b]) {
    for (const [ax, az] of [
      [f.cos, -f.sin],
      [f.sin, f.cos],
    ] as const) {
      const reach = (q: Footprint) => Math.abs(q.cos * ax - q.sin * az) * q.hx + Math.abs(q.sin * ax + q.cos * az) * q.hz;
      const gap = Math.abs((a.x - b.x) * ax + (a.z - b.z) * az) - reach(a) - reach(b);
      if (gap >= 0) return 0;
      depth = Math.min(depth, -gap);
    }
  }
  return depth;
}

export function reviewLevelDesign(bake: WorldBake, weights: Partial<Record<LevelCriterion, number>> = {}): LevelReport {
  const problems: LevelProblem[] = [];
  const metrics: Record<string, number> = {};
  const lost: Record<LevelCriterion, number> = { geography: 0, urban: 0, architecture: 0, relief: 0, roads: 0, player: 0, composition: 0, environment: 0 };
  const flag = (criterion: LevelCriterion, id: string, severity: LevelProblem["severity"], cost: number, message: string, extra: Partial<LevelProblem> = {}) => {
    lost[criterion] += cost;
    problems.push({ criterion, id, severity, message, ...extra });
  };
  const t = bake.terrain;
  const h = (x: number, z: number) => sampleHeight(t, x, z);
  const slopeAt = (x: number, z: number, e = 6) => Math.hypot(h(x + e, z) - h(x - e, z), h(x, z + e) - h(x, z - e)) / (2 * e);
  const waterAt = (x: number, z: number): boolean => {
    const ix = Math.round((x - t.origin[0]) / t.cellSize);
    const iz = Math.round((z - t.origin[1]) / t.cellSize);
    if (ix < 0 || iz < 0 || ix >= t.width || iz >= t.depth) return false;
    return !Number.isNaN(t.water[iz * t.width + ix]!);
  };
  const roads = bake.paths.filter((p) => p.kind === "road" && p.points.length > 1);
  const roadDistance = (x: number, z: number): { d: number; point: Vec2 | null } => {
    let d = Infinity;
    let point: Vec2 | null = null;
    for (const r of roads) {
      for (let i = 1; i < r.points.length; i++) {
        const [ax, az] = r.points[i - 1]!;
        const [bx, bz] = r.points[i]!;
        const l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
        const k = clamp(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2, 0, 1);
        const q: Vec2 = [ax + (bx - ax) * k, az + (bz - az) * k];
        const dd = Math.hypot(x - q[0], z - q[1]) - r.width / 2;
        if (dd < d) {
          d = dd;
          point = q;
        }
      }
    }
    return { d, point };
  };
  const all = footprints(bake);
  const settlements = bake.zones.filter((z) => z.kind === "settlement");
  const districts = (bake.plan?.settlements ?? []).flatMap((s) => s.districts);
  const parcels = (bake.plan?.settlements ?? []).flatMap((s) => s.parcels);
  const sorted = Array.from(t.heights).sort((a, b) => a - b);
  const percentile = (y: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (sorted[m]! < y) lo = m + 1;
      else hi = m;
    }
    return lo / sorted.length;
  };

  // ---------------------------------------------------------------- geography
  const HIGH = new Set(["castle", "tower", "radio_tower", "windmill", "mountain_peak", "volcano", "statue", "obelisk"]);
  for (const l of bake.landmarks) {
    const pc = percentile(l.position[1]);
    if (HIGH.has(l.type)) {
      // high ground is relative to what surrounds it, not to the peaks on the border
      const ring = Array.from({ length: 16 }, (_, k) => h(l.position[0] + Math.cos((k / 16) * 6.283) * 110, l.position[2] + Math.sin((k / 16) * 6.283) * 110));
      if (l.position[1] < mean(ring) - 4 && pc < 0.4) flag("geography", "landmark_in_hollow", "medium", 18, `the ${l.type} sits in a hollow, ${Math.round(mean(ring) - l.position[1])} studs under the ground around it`, { position: [l.position[0], l.position[2]] });
    }
    if (l.type === "lighthouse" && !Array.from({ length: 24 }, (_, k) => waterAt(l.position[0] + Math.cos((k / 24) * 6.283) * 60, l.position[2] + Math.sin((k / 24) * 6.283) * 60)).some(Boolean)) {
      flag("geography", "lighthouse_inland", "high", 30, "the lighthouse stands more than 60 studs from any water", { position: [l.position[0], l.position[2]] });
    }
  }
  for (const s of settlements) {
    const rough: number[] = [];
    for (let k = 0; k < 40; k++) {
      const a = k * 2.399;
      const r = s.radius * 1.5 * Math.sqrt((k + 0.5) / 40);
      rough.push(slopeAt(s.center[0] + Math.cos(a) * r, s.center[1] + Math.sin(a) * r, 8));
    }
    const steep = rough.filter((v) => v > 0.55).length / rough.length;
    metrics[`steep_${s.id}`] = steep;
    if (steep > 0.3) flag("geography", "settlement_on_steep_ground", "medium", (steep - 0.3) * 90, `${Math.round(steep * 100)}% of the ground of "${s.id}" and its edge is too steep to build on`, { position: s.center as Vec2 });
  }
  const drowned = all.filter((f) => waterAt(f.x, f.z));
  for (const f of drowned) flag("geography", "building_in_water", "high", 12, `${f.p.prefab} stands in water`, { position: [f.x, f.z], placement: f.p.id, fix: { type: "move_building", id: f.p.id, reason: "water" } });

  // ---------------------------------------------------------------- urban
  const village = settlements.length > 0 && all.length >= 4;
  if (village) {
    if (districts.length === 0) flag("urban", "no_districts", "medium", 22, "no zoning: every part of the settlement has the same function");
    else {
      const kinds = new Set(districts.map((d) => d.function));
      if (kinds.size < 3) flag("urban", "few_districts", "low", 10, `only ${kinds.size} different district functions`);
    }
    const covered = parcels.length / all.length;
    metrics.parcels = parcels.length;
    if (covered < 0.6) flag("urban", "no_parcels", "medium", 18 * (1 - covered), `${Math.round((1 - clamp(covered, 0, 1)) * 100)}% of the buildings have no plot of their own`);
    for (const s of settlements) {
      const own = all.filter((f) => Math.hypot(f.x - s.center[0], f.z - s.center[1]) < s.radius * 1.6);
      if (own.length < 5) continue;
      const dist = own.map((f) => Math.hypot(f.x - s.center[0], f.z - s.center[1])).sort((a, b) => a - b);
      const density = (r0: number, r1: number) => own.filter((_, i) => dist[i]! >= r0 && dist[i]! < r1).length / (Math.PI * (r1 * r1 - r0 * r0));
      const far = dist[dist.length - 1]! + 1;
      const core = density(0, far * 0.6);
      const edge = density(far * 0.6, far);
      metrics[`gradient_${s.id}`] = edge > 0 ? core / edge : 9;
      if (edge > 0 && core / edge < 1.15) flag("urban", "flat_density", "medium", 14, `"${s.id}" is as dense at its edge as at its centre (ratio ${(core / edge).toFixed(2)})`, { position: s.center as Vec2 });
      const gaps = own.map((f) => Math.min(...own.filter((g) => g !== f).map((g) => Math.hypot(f.x - g.x, f.z - g.z))));
      const m = mean(gaps);
      const dev = Math.sqrt(mean(gaps.map((g) => (g - m) ** 2)));
      if (dev / Math.max(1, m) < 0.08 && own.length > 6) flag("urban", "regular_spacing", "low", 8, `the buildings of "${s.id}" are evenly spaced (±${dev.toFixed(1)} studs): it reads as generated`);
      const kinds = new Set(own.map((f) => f.p.prefab));
      if (kinds.size < 2) flag("urban", "one_building_type", "medium", 12, `"${s.id}" repeats a single kind of building`);
    }
  }

  // ---------------------------------------------------------------- architecture
  let collisions = 0;
  for (let i = 0; i < all.length; i++) {
    for (let k = i + 1; k < all.length; k++) {
      const d = overlap(all[i]!, all[k]!);
      if (d > 0.8) {
        collisions++;
        flag("architecture", "buildings_overlap", d > 3 ? "high" : "medium", d > 3 ? 14 : 8, `${all[i]!.p.id} and ${all[k]!.p.id} overlap by ${d.toFixed(1)} studs`, { position: [all[k]!.x, all[k]!.z], placement: all[k]!.p.id, fix: { type: "move_building", id: all[k]!.p.id, reason: "overlap" } });
      }
    }
  }
  metrics.overlaps = collisions;
  const homes = all.filter((f) => /house|cottage|shop|apartment|skyscraper/.test(f.p.prefab));
  let unserved = 0;
  let turned = 0;
  for (const f of homes) {
    const { d, point } = roadDistance(f.x, f.z);
    const front: Vec2 = [-Math.sin(f.p.rotationY), -Math.cos(f.p.rotationY)];
    if (d - Math.max(f.hx, f.hz) > 16) {
      unserved++;
      if (unserved <= 6) flag("architecture", "no_road_access", "medium", 0, `${f.p.id} is ${Math.round(d - Math.max(f.hx, f.hz))} studs from any road`, { position: [f.x, f.z], placement: f.p.id, ...(point ? { fix: { type: "move_building", id: f.p.id, reason: "no road access" } as LevelFix } : {}) });
    } else if (point) {
      const dx = point[0] - f.x;
      const dz = point[1] - f.z;
      const k = Math.hypot(dx, dz) || 1;
      if ((front[0] * dx + front[1] * dz) / k < 0.35) {
        turned++;
        if (turned <= 6) flag("architecture", "back_to_street", "low", 0, `${f.p.id} turns its back on the street it stands on`, { position: [f.x, f.z], placement: f.p.id, fix: { type: "turn_building", id: f.p.id, rotationY: Math.atan2(-dx, -dz) } });
      }
    }
    for (const r of roads) if (r.points.some((q) => Math.abs((q[0] - f.x) * f.cos - (q[1] - f.z) * f.sin) < f.hx * 0.9 && Math.abs((q[0] - f.x) * f.sin + (q[1] - f.z) * f.cos) < f.hz * 0.9)) {
      flag("architecture", "building_on_road", "high", 12, `${f.p.id} stands on the road "${r.id}"`, { position: [f.x, f.z], placement: f.p.id, fix: { type: "move_building", id: f.p.id, reason: "on road" } });
      break;
    }
  }
  metrics.unserved = homes.length ? unserved / homes.length : 0;
  metrics.backToStreet = homes.length ? turned / homes.length : 0;
  lost.architecture += metrics.unserved * 45 + metrics.backToStreet * 25;

  // ---------------------------------------------------------------- relief
  let hanging = 0;
  for (const f of all) {
    const ys: number[] = [];
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
      const lx = a * f.hx;
      const lz = b * f.hz;
      ys.push(h(f.x + lx * f.cos + lz * f.sin, f.z - lx * f.sin + lz * f.cos));
    }
    const v = bake.prefabs[f.p.prefab]![f.p.variant]!;
    const base = f.p.position[1] + v.sinkDepth * f.p.scale;
    const air = base - Math.min(...ys);
    const buried = Math.max(...ys) - base;
    if (air > 2.5) {
      hanging++;
      flag("relief", "building_hangs", air > 6 ? "high" : "medium", air > 6 ? 14 : 7, `${f.p.id} hangs ${air.toFixed(1)} studs over the ground at one corner`, { position: [f.x, f.z], placement: f.p.id, fix: { type: "flatten", center: [f.x, f.z], radius: Math.hypot(f.hx, f.hz) } });
    } else if (buried > 4) flag("relief", "building_buried", "medium", 7, `${f.p.id} is buried ${buried.toFixed(1)} studs on one side`, { position: [f.x, f.z], placement: f.p.id, fix: { type: "flatten", center: [f.x, f.z], radius: Math.hypot(f.hx, f.hz) } });
    // a wall of earth right against a facade
    const wall = Math.max(...Array.from({ length: 12 }, (_, k) => h(f.x + Math.cos((k / 12) * 6.283) * (Math.max(f.hx, f.hz) + 6), f.z + Math.sin((k / 12) * 6.283) * (Math.max(f.hx, f.hz) + 6)))) - base;
    if (wall > 14) flag("relief", "building_against_cliff", "low", 4, `${f.p.id} has a ${Math.round(wall)}-stud wall of earth against it`, { position: [f.x, f.z], placement: f.p.id });
  }
  metrics.hanging = hanging;

  // ---------------------------------------------------------------- roads
  if (roads.length === 0 && (settlements.length > 0 || bake.landmarks.length > 1)) flag("roads", "no_roads", "high", 60, "nothing connects the places of this map");
  const ends: { p: Vec2; road: string }[] = [];
  let steep = 0;
  let segments = 0;
  for (const r of roads) {
    for (let i = 1; i < r.points.length; i++) {
      const [ax, az] = r.points[i - 1]!;
      const [bx, bz] = r.points[i]!;
      const run = Math.hypot(bx - ax, bz - az) || 1;
      const dh = Math.abs(h(ax, az) - h(bx, bz));
      if (t.mode === "parts" && dh <= 8.5) continue; // one terrace step = stairs
      segments++;
      if (dh / run > 0.6) steep++;
    }
    ends.push({ p: r.points[0]! as Vec2, road: r.id }, { p: r.points[r.points.length - 1]! as Vec2, road: r.id });
  }
  metrics.steepRoad = segments ? steep / segments : 0;
  if (metrics.steepRoad > 0.06) flag("roads", "steep_roads", "medium", (metrics.steepRoad - 0.06) * 260, `${Math.round(metrics.steepRoad * 100)}% of the road length climbs more than 31°`);
  // a road end must meet another road, a settlement, a landmark, the spawn or the border
  let dead = 0;
  for (const e of ends) {
    const meets =
      roads.some((r) => r.id !== e.road && r.points.some((q) => Math.hypot(q[0] - e.p[0], q[1] - e.p[1]) < 14)) ||
      bake.zones.some((z) => (z.kind === "settlement" || z.kind === "landmark" || z.kind === "spawn" || z.kind === "gameplay") && Math.hypot(z.center[0] - e.p[0], z.center[1] - e.p[1]) < z.radius + 18) ||
      e.p[0] < t.origin[0] + 60 || e.p[1] < t.origin[1] + 60 || e.p[0] > t.origin[0] + t.width * t.cellSize - 60 || e.p[1] > t.origin[1] + t.depth * t.cellSize - 60;
    if (!meets) {
      dead++;
      flag("roads", "dead_end", "low", 7, `the road "${e.road}" ends nowhere`, { position: e.p });
    }
  }
  metrics.deadEnds = dead;
  const widths = new Set(roads.map((r) => Math.round(r.width)));
  if (roads.length >= 3 && widths.size < 2) flag("roads", "no_hierarchy", "medium", 16, `${roads.length} roads, all ${[...widths][0]} studs wide: no main street, no lane`);
  if (homes.length >= 6 && roads.length < 3) flag("roads", "no_street_network", "medium", 22, `${homes.length} homes on ${roads.length} road(s): nothing is a street`);

  // ---------------------------------------------------------------- player
  const view = measureFirstView(bake);
  metrics.openness = view.openness;
  metrics.focalAngle = view.focalAngle ?? -1;
  if (view.openness < 0.6) flag("player", "view_blocked", "high", 30, `the first view is ${Math.round(view.openness * 100)}% open`);
  if (!view.targetVisible) flag("player", "target_hidden", "medium", 16, `the spawn faces a target hidden by ${view.targetBlocker}`);
  if (view.focalAngle !== undefined && view.focalAngle < 8) flag("player", "focal_small", "medium", 14, `the focal stands ${view.focalAngle.toFixed(1)}° tall in the first view`);
  const pois = [...bake.landmarks.map((l) => ({ id: l.id, x: l.position[0], z: l.position[2], r: 34 })), ...settlements.map((s) => ({ id: s.id, x: s.center[0], z: s.center[1], r: s.radius }))];
  for (const p of pois) {
    const d = roadDistance(p.x, p.z).d;
    if (d > p.r + 25) flag("player", "poi_unreached", "medium", 12, `no path leads to "${p.id}" (${Math.round(d)} studs away)`, { position: [p.x, p.z], fix: { type: "connect", zone: p.id, from: [p.x, p.z] } });
  }
  if (pois.length < 3 && bake.zones.filter((z) => z.kind === "gameplay").length < 2) flag("player", "few_places", "medium", 14, `only ${pois.length} places to discover`);
  if (!bake.zones.some((z) => z.meta?.kind === "viewpoint" || z.meta?.kind === "secret")) flag("player", "nothing_hidden", "low", 8, "no viewpoint and no hidden place: everything is found at once");
  // alternative routes: the road graph should contain at least one loop
  const nodes: Vec2[] = [];
  const nodeOf = (q: Vec2): number => {
    const i = nodes.findIndex((n) => Math.hypot(n[0] - q[0], n[1] - q[1]) < 22);
    if (i >= 0) return i;
    nodes.push(q);
    return nodes.length - 1;
  };
  let edges = 0;
  for (const r of roads) {
    const touch = new Set<number>([nodeOf(r.points[0]! as Vec2), nodeOf(r.points[r.points.length - 1]! as Vec2)]);
    for (const other of roads) if (other !== r) for (const q of [other.points[0]!, other.points[other.points.length - 1]!]) if (r.points.some((w) => Math.hypot(w[0] - q[0], w[1] - q[1]) < 14)) touch.add(nodeOf(q as Vec2));
    edges += Math.max(0, touch.size - 1);
  }
  const loops = Math.max(0, edges - nodes.length + 1);
  metrics.loops = loops;
  if (roads.length >= 2 && loops === 0) flag("player", "no_alternative_route", "low", 8, "a single way to every place: no loop in the road network");

  // ---------------------------------------------------------------- composition
  const tall = bake.placements.filter((p) => (p.category === "building" || p.category === "landmark") && (bake.prefabs[p.prefab]?.[p.variant]?.bounds.max[1] ?? 0) * p.scale > 6);
  const heights = tall.map((p) => (bake.prefabs[p.prefab]![p.variant]!.bounds.max[1] ?? 0) * p.scale);
  if (heights.length >= 5) {
    const m = mean(heights);
    const dev = Math.sqrt(mean(heights.map((v) => (v - m) ** 2))) / m;
    metrics.heightVariety = dev;
    if (dev < 0.16) flag("composition", "flat_skyline", "low", 14, `the roofs are all ${m.toFixed(0)} studs tall (±${Math.round(dev * 100)}%)`);
  }
  // open and closed spaces alternate along the way from the spawn to the focal
  const trees = new Map<string, number>();
  for (const p of bake.placements) if (p.category === "vegetation" && (bake.prefabs[p.prefab]?.[p.variant]?.bounds.max[1] ?? 0) * p.scale > 8) {
    const k = `${Math.floor(p.position[0] / 32)},${Math.floor(p.position[2] / 32)}`;
    trees.set(k, (trees.get(k) ?? 0) + 1);
  }
  const cells = [...trees.values()];
  if (cells.length > 12) {
    const m = mean(cells);
    const dev = Math.sqrt(mean(cells.map((v) => (v - m) ** 2))) / Math.max(0.1, m);
    metrics.treeClumping = dev;
    if (dev < 0.35) flag("composition", "even_forest", "medium", 14, "the trees are spread evenly: no clearing, no grove");
  }
  const [sx, sy, sz] = bake.spawn.position;
  const seen = pois.filter((p) => {
    const d = Math.hypot(p.x - sx, p.z - sz);
    const py = h(p.x, p.z) + 18;
    for (let k = 1; k < 24; k++) {
      const f = k / 24;
      if (h(sx + (p.x - sx) * f, sz + (p.z - sz) * f) > sy + 6 + (py - sy - 6) * f) return false;
    }
    return d < bake.lighting.fogEnd;
  }).length;
  metrics.seenAtSpawn = pois.length ? seen / pois.length : 0;
  if (pois.length >= 4 && seen === pois.length) flag("composition", "all_visible", "low", 10, "every place is in sight from the spawn: nothing left to discover");
  if (pois.length >= 2 && seen === 0) flag("composition", "none_visible", "medium", 18, "no place is in sight from the spawn");
  const layers = { foreground: 0, midground: 0, background: 0 };
  for (const p of bake.placements) layers[p.layer]++;
  const n = Math.max(1, bake.placements.length);
  if (layers.midground / n < 0.12) flag("composition", "no_midground", "low", 10, "almost nothing between the foreground and the horizon");

  // ---------------------------------------------------------------- environment
  const fields = bake.placements.filter((p) => p.prefab === "farm_field" || p.prefab === "crop_plot");
  for (const f of fields) {
    const d = Math.min(...all.map((b) => Math.hypot(b.x - f.position[0], b.z - f.position[2])), Infinity);
    if (d > 90) flag("environment", "lonely_field", "low", 12, `a field lies ${Math.round(d)} studs from any building`, { position: [f.position[0], f.position[2]], placement: f.id, fix: { type: "remove_placement", id: f.id } });
  }
  for (const b of bake.placements.filter((p) => p.prefab === "bridge")) {
    const wet = [-14, -7, 0, 7, 14].some((o) => waterAt(b.position[0] + Math.sin(b.rotationY) * o, b.position[2] + Math.cos(b.rotationY) * o));
    if (!wet) flag("environment", "dry_bridge", "medium", 20, "a bridge crosses no water", { position: [b.position[0], b.position[2]], placement: b.id, fix: { type: "remove_placement", id: b.id } });
  }
  for (const p of bake.placements) if ((p.prefab === "anchor" || p.prefab === "dock_post") && !Array.from({ length: 12 }, (_, k) => waterAt(p.position[0] + Math.cos(k * 0.52) * 24, p.position[2] + Math.sin(k * 0.52) * 24)).some(Boolean)) {
    flag("environment", "harbour_prop_inland", "low", 4, `${p.prefab} stands far from any water`, { placement: p.id, position: [p.position[0], p.position[2]], fix: { type: "remove_placement", id: p.id } });
  }

  const w = { ...LEVEL_WEIGHTS, ...weights };
  const criteria = Object.fromEntries(LEVEL_CRITERIA.map((c) => [c, Math.round(clamp(100 - lost[c], 0, 100))])) as Record<LevelCriterion, number>;
  const total = LEVEL_CRITERIA.reduce((s, c) => s + w[c], 0) || 1;
  const score = Math.round((LEVEL_CRITERIA.reduce((s, c) => s + criteria[c] * w[c], 0) / total) * 10) / 10;
  const rank = { high: 0, medium: 1, low: 2 };
  problems.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return { score, criteria, problems, metrics };
}
