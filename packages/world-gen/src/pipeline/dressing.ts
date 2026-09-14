import { Rng, TERRAIN_MATERIAL_INDEX, deriveSeed, lerp, smootherstep, type Placement, type PrefabVariant, type Vec2 } from "@worldforge/core";
import { WALL_SEGMENT } from "@worldforge/prefabs";
import { inBounds, isWaterAt, progress, slopeAtWorld, type GenContext, type SettlementSite } from "../context";
import { SpatialHash } from "../grid";
import { roadMaterial } from "./roads";

/**
 * Stage 10b: settlement & landmark dressing — the details that make a generated map read as a
 * place rather than a scatter of prefabs:
 *  - ring walls with gate towers around the main settlement (kit from the style: crenellated stone,
 *    palisade, sandbags, scrap, bamboo, adobe, marble, energy fence, picket, ice),
 *  - crop fields around farms and villages,
 *  - a pier from a harbor (or any shore-side settlement) into the water, boats moored,
 *  - a graveyard behind the church,
 *  - paved grounds with lights and benches around focal landmarks,
 *  - lane stripes, zebra crossings and kerbs on asphalt / concrete streets.
 * Every placement id starts with `dress_`: never trimmed by the budget, restored with the buildings layer.
 */
type Add = (prefab: string, x: number, y: number, z: number, rotationY: number, opts?: { scale?: number; zone?: string; importance?: number; variant?: number }) => Placement | undefined;

export function placeDressing(ctx: GenContext): void {
  const rng = new Rng(deriveSeed(ctx.seed, "dressing"));
  let n = 0;
  const add: Add = (prefab, x, y, z, rotationY, opts = {}) => {
    const variants = ctx.prefabs[prefab];
    if (!variants || variants.length === 0) return undefined;
    const vi = opts.variant ?? rng.int(0, variants.length - 1);
    const v = variants[vi]!;
    const p: Placement = {
      id: `dress_${prefab}_${n++}`,
      prefab,
      variant: vi,
      category: v.category,
      position: [x, y, z],
      rotationY,
      scale: opts.scale ?? 1,
      layer: "midground",
      zone: opts.zone,
      importance: opts.importance ?? 8,
    };
    ctx.placements.push(p);
    return p;
  };
  progress(ctx, "dressing:walls", 0);
  placeWalls(ctx, rng, add);
  progress(ctx, "dressing:fields", 0.25);
  placeFields(ctx, rng, add);
  progress(ctx, "dressing:docks", 0.45);
  placeDocks(ctx, rng, add);
  progress(ctx, "dressing:graveyard", 0.6);
  placeGraveyard(ctx, rng, add);
  progress(ctx, "dressing:landmarks", 0.7);
  placeLandmarkGrounds(ctx, rng, add);
  progress(ctx, "dressing:roads", 0.85);
  placeRoadMarkings(ctx, add);
  progress(ctx, "dressing:done", 1);
}

/** Blend the terrain toward `target` inside `radius` (no material change; water untouched). */
function levelDisc(ctx: GenContext, c: Vec2, radius: number, target: number, strength: number): void {
  const h = ctx.heights;
  const [ccx, ccz] = h.toCell(c[0], c[1]);
  const rc = Math.ceil(radius / ctx.cellSize) + 1;
  for (let dz = -rc; dz <= rc; dz++) {
    for (let dx = -rc; dx <= rc; dx++) {
      const x = Math.round(ccx) + dx;
      const z = Math.round(ccz) + dz;
      if (x < 0 || z < 0 || x >= ctx.width || z >= ctx.depth) continue;
      const [wx, wz] = h.toWorld(x, z);
      const d = Math.hypot(wx - c[0], wz - c[1]);
      if (d > radius) continue;
      const i = z * ctx.width + x;
      if (!Number.isNaN(ctx.water.data[i]!)) continue;
      const w = (1 - smootherstep(radius * 0.45, radius, d)) * strength;
      h.data[i] = lerp(h.data[i]!, target, w);
    }
  }
}

function paintDisc(ctx: GenContext, c: Vec2, r: number, material: number, inner = 0): void {
  const h = ctx.heights;
  const [cx, cz] = h.toCell(c[0], c[1]);
  const rc = Math.ceil(r / ctx.cellSize);
  for (let dz = -rc; dz <= rc; dz++) {
    for (let dx = -rc; dx <= rc; dx++) {
      const x = Math.round(cx) + dx;
      const z = Math.round(cz) + dz;
      if (x < 0 || z < 0 || x >= ctx.width || z >= ctx.depth) continue;
      const [wx, wz] = h.toWorld(x, z);
      const d = Math.hypot(wx - c[0], wz - c[1]);
      if (d > r || d < inner) continue;
      const i = z * ctx.width + x;
      if (ctx.materials[i] === TERRAIN_MATERIAL_INDEX.Water) continue;
      ctx.materials[i] = material;
    }
  }
}

const rotFacingOut = (a: number) => Math.atan2(-Math.cos(a), -Math.sin(a)); // local -Z → (cos a, sin a)
const rotAlongX = (tx: number, tz: number) => Math.atan2(-tz, tx); // local +X → (tx, tz)

function mainSite(ctx: GenContext): SettlementSite | undefined {
  const ok = new Set(["village", "hamlet", "town", "base", "harbor", "abandoned_village", "ruined_town", "farmstead"]);
  return [...ctx.sites].filter((s) => ok.has(s.spec.type)).sort((a, b) => b.radius - a.radius)[0];
}

// ---------------------------------------------------------------- walls
function placeWalls(ctx: GenContext, rng: Rng, add: Add): void {
  if (ctx.style.environment.walls === "none" || !ctx.prefabs["town_wall"]?.length) return;
  const site = mainSite(ctx);
  if (!site) return;
  const ruined = site.spec.type === "abandoned_village" || site.spec.type === "ruined_town";
  const R = site.radius * 1.12 + 10;
  const n = Math.max(12, Math.round((2 * Math.PI * R) / WALL_SEGMENT));
  const step = (2 * Math.PI) / n;
  type Seg = { a: number; c: Vec2; y: number; gate: boolean; skip: boolean };
  const segs: Seg[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * step;
    const c: Vec2 = [site.center[0] + Math.cos(a) * R, site.center[1] + Math.sin(a) * R];
    const water = isWaterAt(ctx, c[0], c[1]) || ctx.waterDistance.sample(c[0], c[1]) < 4;
    const steep = slopeAtWorld(ctx, c[0], c[1]) > 0.9;
    const out = !inBounds(ctx, c[0], c[1], 6);
    const gate = ctx.roadDistance.sample(c[0], c[1]) < WALL_SEGMENT * 0.55;
    segs.push({ a, c, y: ctx.heights.sample(c[0], c[1]), gate, skip: water || steep || out || (ruined && rng.chance(0.4)) });
  }
  // at least one gate: open the segment facing the spawn / the nearest road
  if (!segs.some((s) => s.gate)) {
    const [sx, , sz] = ctx.spawn.position;
    let best = 0;
    let bestD = Infinity;
    segs.forEach((s, i) => {
      const d = Math.hypot(s.c[0] - sx, s.c[1] - sz) + ctx.roadDistance.sample(s.c[0], s.c[1]) * 0.5;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    segs[best]!.gate = true;
  }
  // smooth the ring height so neighbouring segments meet, then level the ground under each segment
  for (let pass = 0; pass < 2; pass++) {
    const ys = segs.map((s) => s.y);
    segs.forEach((s, i) => {
      s.y = (ys[(i + n - 1) % n]! + ys[i]! * 2 + ys[(i + 1) % n]!) / 4;
    });
  }
  for (const s of segs) if (!s.skip) levelDisc(ctx, s.c, WALL_SEGMENT * 0.75, s.y, 0.9);
  const towerV = ctx.prefabs["gate_tower"];
  let walls = 0;
  segs.forEach((s, i) => {
    if (s.skip) return;
    const prev = segs[(i + n - 1) % n]!;
    const next = segs[(i + 1) % n]!;
    if (s.gate) {
      // towers at both ends of a gate run (the boundary with a standing wall segment)
      if (towerV?.length) {
        const tx = -Math.sin(s.a);
        const tz = Math.cos(s.a);
        const half = WALL_SEGMENT / 2 + 0.5;
        if (!prev.gate && !prev.skip) add("gate_tower", s.c[0] - tx * half, s.y, s.c[1] - tz * half, rotFacingOut(s.a), { zone: site.id, importance: 9 });
        if (!next.gate && !next.skip) add("gate_tower", s.c[0] + tx * half, s.y, s.c[1] + tz * half, rotFacingOut(s.a), { zone: site.id, importance: 9 });
      }
      return;
    }
    add("town_wall", s.c[0], s.y, s.c[1], rotFacingOut(s.a), { zone: site.id, importance: 9 });
    ctx.occupants.push({ position: [s.c[0], s.y, s.c[1]], radius: WALL_SEGMENT * 0.55, kind: "building" });
    walls++;
  });
  if (walls > 0) ctx.zones.push({ id: `${site.id}_walls`, kind: "gameplay", polygon: [], center: site.center, radius: R, meta: { kind: "walls", segments: walls } });
}

// ---------------------------------------------------------------- fields
function placeFields(ctx: GenContext, rng: Rng, add: Add): void {
  if (!ctx.prefabs["farm_field"]?.length) return;
  const spec = ctx.spec;
  const farmy = spec.biomes.some((b) => b.id === "farmland") || spec.settlements.some((s) => s.type === "farmstead") || spec.props.sets.includes("farm") || ctx.style.kits.props.includes("farm");
  if (!farmy) return;
  const hash = new SpatialHash<{ position: [number, number, number]; radius: number }>(32);
  for (const o of ctx.occupants) hash.insert({ position: o.position, radius: o.radius });
  const fieldR = 13;
  let placed = 0;
  for (const site of ctx.sites) {
    const want = site.spec.type === "farmstead" ? 4 : 2;
    let got = 0;
    for (let attempt = 0; attempt < 40 && got < want; attempt++) {
      const a = rng.float(0, Math.PI * 2);
      const r = site.radius * rng.float(1.25, 1.75) + fieldR;
      const x = site.center[0] + Math.cos(a) * r;
      const z = site.center[1] + Math.sin(a) * r;
      if (!inBounds(ctx, x, z, fieldR + 8)) continue;
      if (isWaterAt(ctx, x, z) || ctx.waterDistance.sample(x, z) < fieldR + 2) continue;
      if (ctx.roadDistance.sample(x, z) < fieldR + 2) continue;
      if (slopeAtWorld(ctx, x, z) > 0.3) continue;
      if (hash.overlaps(x, z, fieldR, 4)) continue;
      const y = ctx.heights.sample(x, z);
      levelDisc(ctx, [x, z], fieldR * 1.3, y, 1.0);
      paintDisc(ctx, [x, z], fieldR * 1.05, TERRAIN_MATERIAL_INDEX.Ground);
      const rot = rng.chance(0.5) ? rng.float(0, Math.PI * 2) : Math.atan2(-(site.center[0] - x), -(site.center[1] - z));
      add("farm_field", x, y, z, rot, { zone: site.id, importance: 8 });
      const occ = { position: [x, y, z] as [number, number, number], radius: fieldR + 1 };
      hash.insert(occ);
      ctx.occupants.push({ ...occ, kind: "building" });
      got++;
      placed++;
      if (placed >= 6) return;
    }
  }
}

// ---------------------------------------------------------------- docks
function placeDocks(ctx: GenContext, rng: Rng, add: Add): void {
  if (!ctx.prefabs["pier"]?.length) return;
  const harbor = ctx.sites.find((s) => s.spec.type === "harbor");
  const wantsDocks = !!harbor || ctx.spec.props.sets.includes("docks") || ctx.style.kits.props.includes("pirate") || !!ctx.ocean;
  if (!wantsDocks) return;
  const sites = harbor ? [harbor] : [...ctx.sites].sort((a, b) => ctx.waterDistance.sample(a.center[0], a.center[1]) - ctx.waterDistance.sample(b.center[0], b.center[1]));
  for (const site of sites) {
    // march outward from the settlement until water: the shortest ray gives the shoreline point
    let best: { shore: Vec2; dir: Vec2; dist: number } | undefined;
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      const dir: Vec2 = [Math.cos(a), Math.sin(a)];
      for (let d = site.radius * 0.6; d < 260; d += 4) {
        const x = site.center[0] + dir[0] * d;
        const z = site.center[1] + dir[1] * d;
        if (!inBounds(ctx, x, z, 8)) break;
        if (isWaterAt(ctx, x, z)) {
          // need at least 30 studs of water ahead so the pier is not lying on the far bank
          let deep = true;
          for (let e = 6; e <= 30; e += 6) if (!isWaterAt(ctx, x + dir[0] * e, z + dir[1] * e)) deep = false;
          if (deep && (!best || d < best.dist)) best = { shore: [x - dir[0] * 4, z - dir[1] * 4], dir, dist: d };
          break;
        }
      }
    }
    if (!best || best.dist > 240) continue;
    const { shore, dir } = best;
    const level = ctx.water.sample(shore[0] + dir[0] * 12, shore[1] + dir[1] * 12);
    if (Number.isNaN(level)) continue;
    const rot = Math.atan2(dir[0], dir[1]); // local +Z → dir
    const y = level - 0.2;
    // the pier starts on the bank: level a small landing so the deck meets the ground
    levelDisc(ctx, shore, 9, y + 1.0, 0.9);
    add("pier", shore[0], y, shore[1], rot, { zone: site.id, importance: 9 });
    ctx.occupants.push({ position: [shore[0] + dir[0] * 17, y, shore[1] + dir[1] * 17], radius: 18, kind: "building" });
    // boats and posts around the pier end
    const end: Vec2 = [shore[0] + dir[0] * 30, shore[1] + dir[1] * 30];
    const side: Vec2 = [-dir[1], dir[0]];
    for (const boat of ["rowboat", "surfboard"]) {
      if (!ctx.prefabs[boat]?.length) continue;
      for (const sgn of [-1, 1]) {
        const bx = end[0] + side[0] * sgn * 7 + dir[0] * rng.float(-8, 2);
        const bz = end[1] + side[1] * sgn * 7 + dir[1] * rng.float(-8, 2);
        if (isWaterAt(ctx, bx, bz)) add(boat, bx, level + 0.05, bz, rot + rng.float(-0.4, 0.4), { zone: site.id, importance: 6 });
      }
      break;
    }
    if (ctx.prefabs["dock_post"]?.length) for (const sgn of [-1, 1]) add("dock_post", end[0] + side[0] * sgn * 4.6 + dir[0] * 4, level, end[1] + side[1] * sgn * 4.6 + dir[1] * 4, rot, { zone: site.id, importance: 5 });
    ctx.zones.push({ id: `${site.id}_docks`, kind: "gameplay", polygon: [], center: end, radius: 16, y: y + 1.5, meta: { kind: "docks" } });
    return;
  }
}

// ---------------------------------------------------------------- graveyard
function placeGraveyard(ctx: GenContext, rng: Rng, add: Add): void {
  if (!ctx.prefabs["gravestone"]?.length) return;
  const church = ctx.placements.find((p) => p.prefab === "church");
  const wantsGraves = !!church || ctx.spec.props.sets.includes("graveyard") || ctx.style.kits.props.includes("horror");
  if (!wantsGraves) return;
  const hash = new SpatialHash<{ position: [number, number, number]; radius: number }>(32);
  for (const o of ctx.occupants) hash.insert({ position: o.position, radius: o.radius });
  const candidates: { c: Vec2; facing: number }[] = [];
  if (church) {
    const v = ctx.prefabs[church.prefab]?.[church.variant];
    const foot = (v?.footprintRadius ?? 14) * church.scale;
    // behind the church first (prefab front is -Z, so +Z rotated by rotationY = (sin θ, cos θ)), then the sides
    for (const [side, dist] of [
      [Math.PI, foot + 14],
      [Math.PI, foot + 24],
      [Math.PI / 2, foot + 16],
      [-Math.PI / 2, foot + 16],
      [Math.PI / 2, foot + 26],
      [-Math.PI / 2, foot + 26],
    ] as const) {
      const a = church.rotationY + side;
      candidates.push({ c: [church.position[0] + Math.sin(a) * dist, church.position[2] + Math.cos(a) * dist], facing: church.rotationY });
    }
  }
  // fallback (or no church): outside the main settlement, just past the wall ring
  const site = mainSite(ctx);
  if (site) {
    for (let k = 0; k < 10; k++) {
      const a = rng.float(0, Math.PI * 2);
      const r = site.radius * 1.35 + 22;
      candidates.push({ c: [site.center[0] + Math.cos(a) * r, site.center[1] + Math.sin(a) * r], facing: a + Math.PI / 2 });
    }
  }
  if (candidates.length === 0) return;
  const pick = candidates.find(({ c }) => inBounds(ctx, c[0], c[1], 20) && !isWaterAt(ctx, c[0], c[1]) && ctx.waterDistance.sample(c[0], c[1]) > 12 && ctx.roadDistance.sample(c[0], c[1]) > 7 && slopeAtWorld(ctx, c[0], c[1]) < 0.35 && !hash.overlaps(c[0], c[1], 11, 2));
  if (!pick) return;
  const { c, facing } = pick;
  const y = ctx.heights.sample(c[0], c[1]);
  levelDisc(ctx, c, 16, y, 0.9);
  paintDisc(ctx, c, 12, TERRAIN_MATERIAL_INDEX.Ground);
  const cosF = Math.cos(facing);
  const sinF = Math.sin(facing);
  const local = (lx: number, lz: number): Vec2 => [c[0] + lx * cosF + lz * sinF, c[1] - lx * sinF + lz * cosF];
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 4; i++) {
      if (rng.chance(0.18)) continue;
      const [x, z] = local(-6 + i * 4 + rng.float(-0.4, 0.4), -5 + r * 5 + rng.float(-0.4, 0.4));
      add("gravestone", x, ctx.heights.sample(x, z), z, facing + rng.float(-0.15, 0.15), { importance: 5 });
    }
  }
  if (ctx.prefabs["fence"]?.length) {
    for (const [lx, lz, rot] of [
      [0, -9.5, 0],
      [0, 9.5, 0],
      [-10, 0, Math.PI / 2],
      [10, 0, Math.PI / 2],
    ] as const) {
      const [x, z] = local(lx, lz);
      add("fence", x, ctx.heights.sample(x, z), z, facing + rot, { importance: 4 });
    }
  }
  if (ctx.prefabs["dead_tree"]?.length) {
    const [x, z] = local(8, -8);
    add("dead_tree", x, ctx.heights.sample(x, z), z, rng.float(0, Math.PI * 2), { importance: 5 });
  }
  if (ctx.prefabs["coffin"]?.length && rng.chance(0.5)) {
    const [x, z] = local(-8, 7);
    add("coffin", x, ctx.heights.sample(x, z), z, facing, { importance: 4 });
  }
  ctx.occupants.push({ position: [c[0], y, c[1]], radius: 13, kind: "building" });
  ctx.zones.push({ id: "graveyard", kind: "gameplay", polygon: [], center: c, radius: 13, meta: { kind: "graveyard" } });
}

// ---------------------------------------------------------------- landmark grounds
const LIGHT_PROPS = ["lantern_post", "torch_post", "stone_lantern", "streetlight", "tiki_torch", "brazier", "floodlight", "energy_pylon", "hologram"];
const SEAT_PROPS = ["bench", "picnic_table", "hay_bale", "crate", "sci_crate"];
const NO_GROUNDS = new Set(["pirate_ship", "waterfall_cliff", "crashed_plane", "skyscraper_landmark", "skyscraper_ruin", "stadium", "colosseum", "ferris_wheel", "gas_station", "barn", "dome_base", "radio_tower"]);

function placeLandmarkGrounds(ctx: GenContext, rng: Rng, add: Add): void {
  const light = LIGHT_PROPS.find((id) => ctx.prefabs[id]?.length);
  const seat = SEAT_PROPS.find((id) => ctx.prefabs[id]?.length);
  const pave = roadMaterial(ctx.style.kits.road);
  for (const p of ctx.placements) {
    if (p.category !== "landmark" || NO_GROUNDS.has(p.prefab)) continue;
    const lm = ctx.landmarks.find((l) => l.id === p.zone || l.id === p.id.replace(/^landmark_/, ""));
    if (lm && lm.role === "hidden") continue;
    const v: PrefabVariant | undefined = ctx.prefabs[p.prefab]?.[p.variant];
    if (!v || v.tags.includes("water") || v.tags.includes("vehicle")) continue;
    const foot = v.footprintRadius * p.scale;
    if (foot > 34 || isWaterAt(ctx, p.position[0], p.position[2])) continue;
    const c: Vec2 = [p.position[0], p.position[2]];
    const ring = foot + 5;
    paintDisc(ctx, c, ring + 3, pave === TERRAIN_MATERIAL_INDEX.Ground ? TERRAIN_MATERIAL_INDEX.Ground : pave, 0);
    const start = rng.float(0, Math.PI * 2);
    for (let i = 0; i < 4; i++) {
      const a = start + (i / 4) * Math.PI * 2;
      const x = c[0] + Math.cos(a) * ring;
      const z = c[1] + Math.sin(a) * ring;
      if (isWaterAt(ctx, x, z) || ctx.roadDistance.sample(x, z) < 3 || slopeAtWorld(ctx, x, z) > 0.5) continue;
      if (light) add(light, x, ctx.heights.sample(x, z), z, rotFacingOut(a) + Math.PI, { zone: p.zone, importance: 6 });
      if (seat && i % 2 === 0) {
        const a2 = a + Math.PI / 4;
        const sx = c[0] + Math.cos(a2) * (ring - 1);
        const sz = c[1] + Math.sin(a2) * (ring - 1);
        if (!isWaterAt(ctx, sx, sz) && ctx.roadDistance.sample(sx, sz) > 3) add(seat, sx, ctx.heights.sample(sx, sz), sz, rotFacingOut(a2) + Math.PI, { zone: p.zone, importance: 5 });
      }
    }
  }
}

// ---------------------------------------------------------------- road markings
function placeRoadMarkings(ctx: GenContext, add: Add): void {
  const stripeV = ctx.prefabs["road_stripe"];
  if (!stripeV?.length) return;
  const paved = (type: string) => {
    const m = roadMaterial(type);
    return (m === TERRAIN_MATERIAL_INDEX.Asphalt || m === TERRAIN_MATERIAL_INDEX.Pavement) && type !== "metal_walkway";
  };
  const roads = ctx.paths.filter((p) => p.kind === "road" && paved(p.type));
  if (roads.length === 0) return;
  // intersections between road polylines → zebra crossings on each arm
  const crossings: { p: Vec2; w: number }[] = [];
  for (let i = 0; i < roads.length; i++) {
    for (let j = i + 1; j < roads.length; j++) {
      const A = roads[i]!.points;
      const B = roads[j]!.points;
      for (let a = 1; a < A.length; a++) {
        for (let b = 1; b < B.length; b++) {
          const hit = segmentIntersection(A[a - 1]!, A[a]!, B[b - 1]!, B[b]!);
          if (hit && !crossings.some((c) => Math.hypot(c.p[0] - hit[0], c.p[1] - hit[1]) < 12)) crossings.push({ p: hit, w: Math.max(roads[i]!.width, roads[j]!.width) });
        }
      }
    }
  }
  const nearCrossing = (x: number, z: number, extra: number) => crossings.some((c) => Math.hypot(c.p[0] - x, c.p[1] - z) < c.w / 2 + extra);
  let stripes = 0;
  let kerbs = 0;
  const kerbV = ctx.prefabs["kerb"];
  for (const road of roads) {
    const pts = road.points;
    let acc = 0;
    let kerbAcc = 4;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-3) continue;
      const tx = (b[0] - a[0]) / len;
      const tz = (b[1] - a[1]) / len;
      let t = 0;
      while (t < len) {
        const x = a[0] + tx * t;
        const z = a[1] + tz * t;
        acc += Math.min(len - t, 1);
        kerbAcc += Math.min(len - t, 1);
        if (acc >= 9 && stripes < 420 && !isWaterAt(ctx, x, z) && !nearCrossing(x, z, 7)) {
          add("road_stripe", x, ctx.heights.sample(x, z) + 0.1, z, rotAlongX(tx, tz), { importance: 2 });
          stripes++;
          acc = 0;
        }
        // kerbs only along the settlement streets (the long inter-site roads stay bare)
        if (kerbV?.length && road.id.includes("_street_") && kerbAcc >= 8 && kerbs < 420 && !nearCrossing(x, z, 5)) {
          for (const sgn of [-1, 1]) {
            const kx = x - tz * sgn * (road.width / 2 + 0.6);
            const kz = z + tx * sgn * (road.width / 2 + 0.6);
            if (!isWaterAt(ctx, kx, kz)) {
              add("kerb", kx, ctx.heights.sample(kx, kz), kz, rotAlongX(tx, tz), { importance: 2 });
              kerbs++;
            }
          }
          kerbAcc = 0;
        }
        t += 1;
      }
    }
  }
  if (ctx.prefabs["crosswalk"]?.length) {
    for (const c of crossings) {
      // one crossing on each arm: sample the road tangent 1 stud away in the 4 axis directions of the nearest road
      const near = roads.map((r) => ({ r, d: distanceToPolyline(c.p, r.points) })).sort((p, q) => p.d - q.d).slice(0, 2);
      for (const { r } of near) {
        const dir = tangentAt(r.points, c.p);
        for (const sgn of [-1, 1]) {
          const x = c.p[0] + dir[0] * sgn * (c.w / 2 + 3.5);
          const z = c.p[1] + dir[1] * sgn * (c.w / 2 + 3.5);
          if (isWaterAt(ctx, x, z) || ctx.roadDistance.sample(x, z) > 2) continue;
          add("crosswalk", x, ctx.heights.sample(x, z) + 0.1, z, rotAlongX(-dir[1], dir[0]), { importance: 3, scale: Math.max(0.8, Math.min(2.2, (r.width - 1) / 8.6)) });
        }
      }
    }
  }
}

function segmentIntersection(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | undefined {
  const r: Vec2 = [b[0] - a[0], b[1] - a[1]];
  const s: Vec2 = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-6) return undefined;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return undefined;
  return [a[0] + r[0] * t, a[1] + r[1] * t];
}

function distanceToPolyline(p: Vec2, pts: Vec2[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const ab2 = abx * abx + abz * abz || 1e-9;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / ab2));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + abz * t)));
  }
  return best;
}

function tangentAt(pts: Vec2[], p: Vec2): Vec2 {
  let best = Infinity;
  let dir: Vec2 = [1, 0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const len = Math.hypot(abx, abz) || 1e-9;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / (len * len)));
    const d = Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + abz * t));
    if (d < best) {
      best = d;
      dir = [abx / len, abz / len];
    }
  }
  return dir;
}
