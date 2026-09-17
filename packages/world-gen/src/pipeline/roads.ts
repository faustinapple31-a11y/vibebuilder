import { TERRAIN_MATERIAL_INDEX, chaikin, deriveSeed, lerp, resamplePolyline, smoothstep, type Vec2, type Vec3 } from "@worldforge/core";
import { Rng } from "@worldforge/core";
import { astar } from "../pathfinding";
import { distanceToPolylinesGrid } from "../grid";
import { edgeToWorld, progress, type GenContext } from "../context";
import { connectIslands } from "./islands";
import { GROUND_STEP } from "./ground";
import { PLANK_BRIDGE_LENGTHS, STAIRS_RISES } from "@worldforge/prefabs";

/**
 * Stage 9: roads. A* over a coarse grid with slope-aware cost (cliffs are impassable),
 * water is expensive (creates a bridge), landmark footprints are avoided.
 * The road is then smoothed, resampled, flattened across its width and marked with a material.
 */
export function generateRoads(ctx: GenContext): void {
  const { spec } = ctx;
  const rng = new Rng(deriveSeed(ctx.seed, "roads"));
  const reuse = !ctx.regenerate.has("roads") && ctx.previous;
  let idx = 0;
  for (const road of spec.roads) {
    progress(ctx, `roads:${road.id}`, idx++ / Math.max(1, spec.roads.length));
    const prev = reuse ? ctx.previous!.paths.find((p) => p.kind === "road" && p.id === road.id) : undefined;
    if (prev) {
      ctx.paths.push({ ...prev, points: prev.points.map((p) => [p[0], p[1]] as Vec2) });
      carveRoad(ctx, prev.points, road.width, road.type);
      placeBridges(ctx, road.id, prev.points, road.width);
      placeStairs(ctx, road.id, prev.points);
      continue;
    }
    const nodes = road.connects.map((n) => resolveNode(ctx, n)).filter((n): n is Vec2 => !!n);
    if (nodes.length < 2) continue;
    const smooth = routeRoad(ctx, rng, nodes);
    if (!smooth) continue;
    ctx.paths.push({ id: road.id, kind: "road", type: road.type, points: smooth, width: road.width });
    carveRoad(ctx, smooth, road.width, road.type);
    placeBridges(ctx, road.id, smooth, road.width);
    placeStairs(ctx, road.id, smooth);
  }
  if (ctx.islands) connectIslands(ctx, rng);
  const roads = ctx.paths.filter((p) => p.kind === "road").map((p) => ({ points: p.points, width: p.width }));
  ctx.roadDistance = distanceToPolylinesGrid(ctx.heights, roads, 300);
  progress(ctx, "roads:done", 1);
}

/**
 * A* route through the given world points (coarse grid, slope-aware, water expensive, landmark footprints
 * avoided), smoothed and wobbled; null when no leg is reachable.
 */
export function routeRoad(ctx: GenContext, rng: Rng, nodes: Vec2[], opts: { waterCost?: number } = {}): Vec2[] | null {
  const coarse = 2; // cells per node
  const cw = Math.floor(ctx.width / coarse);
  const cd = Math.floor(ctx.depth / coarse);
  const h = ctx.heights;
  const maxSlope = 0.62; // ~35°
  const nodeH = (x: number, z: number) => h.get(x * coarse, z * coarse);
  const nodeWater = (x: number, z: number) => !Number.isNaN(ctx.water.get(x * coarse, z * coarse));
  const blocked = (x: number, z: number): boolean => {
    const [wx, wz] = h.toWorld(x * coarse, z * coarse);
    for (const o of ctx.occupants) {
      if (o.kind !== "landmark") continue;
      if (Math.hypot(wx - o.position[0], wz - o.position[2]) < o.radius * 0.9) return true;
    }
    return false;
  };

  const full: Vec2[] = [];
  {
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1]!;
      const b = nodes[i]!;
      const [ax, az] = h.toCell(a[0], a[1]);
      const [bx, bz] = h.toCell(b[0], b[1]);
      const start: Vec2 = [clampI(Math.round(ax / coarse), 0, cw - 1), clampI(Math.round(az / coarse), 0, cd - 1)];
      const goal: Vec2 = [clampI(Math.round(bx / coarse), 0, cw - 1), clampI(Math.round(bz / coarse), 0, cd - 1)];
      const isGoalLandmark = ctx.landmarks.some((l) => Math.hypot(b[0] - l.position[0], b[1] - l.position[2]) < 1);
      const path = astar(start, goal, {
        width: cw,
        depth: cd,
        cost: (x0, z0, x1, z1, dist) => {
          if (x1 <= 0 || z1 <= 0 || x1 >= cw - 1 || z1 >= cd - 1) return Infinity;
          const dh = Math.abs(nodeH(x1, z1) - nodeH(x0, z0));
          const run = dist * coarse * ctx.cellSize;
          const slope = Math.atan2(dh, run);
          if (ctx.terrainMode === "parts") {
            // terraces: flat or exactly one step (a staircase), never more
            if (dh > GROUND_STEP * 1.05) return Infinity;
          } else if (slope > maxSlope) return Infinity;
          if (!isGoalLandmark && blocked(x1, z1)) return Infinity;
          const nearGoal = Math.hypot(x1 - goal[0], z1 - goal[1]) < 3;
          if (isGoalLandmark && !nearGoal && blocked(x1, z1)) return Infinity;
          let c = ctx.terrainMode === "parts" ? run * (dh > 0.5 ? 4 : 1) : run * (1 + slope * slope * 14);
          if (nodeWater(x1, z1)) c *= opts.waterCost ?? 7;
          return c;
        },
        heuristicWeight: 1.05,
      });
      if (!path) continue;
      const seg = path.map(([x, z]) => h.toWorld(x * coarse, z * coarse));
      if (full.length > 0) seg.shift();
      full.push(...seg);
    }
  }
  if (full.length < 2) return null;
  const smooth = resamplePolyline(chaikin(full, 2), ctx.cellSize);
  // jitter slightly with a low-frequency wobble for organic feel (not on bridges)
  const wobble = 0.8 + ctx.style.randomness * 1.4;
  for (let i = 1; i < smooth.length - 1; i++) {
    const p = smooth[i]!;
    const w = Math.sin(i * 0.31 + rng.next() * 0.2) * wobble;
    smooth[i] = [p[0] + w, p[1] + Math.cos(i * 0.27) * wobble];
  }
  return smooth;
}

function clampI(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function resolveNode(ctx: GenContext, id: string): Vec2 | null {
  if (id === "spawn") return [ctx.spawn.position[0], ctx.spawn.position[2]];
  const site = ctx.sites.find((s) => s.id === id);
  if (site) return site.center;
  const lm = ctx.landmarks.find((l) => l.id === id);
  if (lm) return [lm.position[0], lm.position[2]];
  const zone = ctx.zones.find((z) => z.id === id);
  if (zone) return zone.center;
  if (["north", "south", "east", "west", "north-east", "north-west", "south-east", "south-west", "center"].includes(id)) return edgeToWorld(ctx, id, 0.12);
  return null;
}

/** Terrain material for a road type (asphalt/concrete/pavement for modern streets, sand, snow, metal walkways…). */
export function roadMaterial(type: string): number {
  switch (type) {
    case "dirt_path":
    case "wooden_walkway":
      return TERRAIN_MATERIAL_INDEX.Ground;
    case "asphalt_road":
    case "neon_road":
      return TERRAIN_MATERIAL_INDEX.Asphalt;
    case "concrete_road":
      return TERRAIN_MATERIAL_INDEX.Pavement;
    case "metal_walkway":
      return TERRAIN_MATERIAL_INDEX.Slate;
    case "sand_path":
      return TERRAIN_MATERIAL_INDEX.Sand;
    case "snow_path":
      return TERRAIN_MATERIAL_INDEX.Snow;
    case "brick_road":
      return TERRAIN_MATERIAL_INDEX.Cobblestone;
    default:
      return TERRAIN_MATERIAL_INDEX.Cobblestone;
  }
}

/** Recompute the road distance field after extra streets were added (grid settlements, layouts). */
export function refreshRoadDistance(ctx: GenContext): void {
  const roads = ctx.paths.filter((p) => p.kind === "road").map((p) => ({ points: p.points, width: p.width }));
  ctx.roadDistance = distanceToPolylinesGrid(ctx.heights, roads, 300);
}

/** Flatten the road cross-section along a smoothed height profile and mark the material. */
export function carveRoad(ctx: GenContext, pts: Vec2[], width: number, type: string): void {
  const h = ctx.heights;
  // height profile along the path, smoothed (moving average) to avoid bumps
  const prof = pts.map((p) => h.sample(p[0], p[1]));
  const win = 5;
  const sm = prof.map((_, i) => {
    let s = 0;
    let c = 0;
    for (let k = -win; k <= win; k++) {
      const j = i + k;
      if (j < 0 || j >= prof.length) continue;
      s += prof[j]!;
      c++;
    }
    return s / c;
  });
  const half = width / 2;
  const shoulder = width * 0.9;
  const reach = half + shoulder;
  const mat = roadMaterial(type);
  const shoulderMat = type === "asphalt_road" || type === "concrete_road" || type === "neon_road" ? TERRAIN_MATERIAL_INDEX.Pavement : type === "sand_path" ? TERRAIN_MATERIAL_INDEX.Sand : type === "snow_path" ? TERRAIN_MATERIAL_INDEX.Snow : TERRAIN_MATERIAL_INDEX.Ground;
  const dist = new Float32Array(ctx.width * ctx.depth).fill(Infinity);
  const target = new Float32Array(ctx.width * ctx.depth);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const ha = sm[i - 1]!;
    const hb = sm[i]!;
    const [cx0, cz0] = h.toCell(Math.min(a[0], b[0]) - reach, Math.min(a[1], b[1]) - reach);
    const [cx1, cz1] = h.toCell(Math.max(a[0], b[0]) + reach, Math.max(a[1], b[1]) + reach);
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const ab2 = abx * abx + abz * abz || 1e-9;
    for (let z = Math.max(0, Math.floor(cz0)); z <= Math.min(ctx.depth - 1, Math.ceil(cz1)); z++) {
      for (let x = Math.max(0, Math.floor(cx0)); x <= Math.min(ctx.width - 1, Math.ceil(cx1)); x++) {
        const [wx, wz] = h.toWorld(x, z);
        const t = Math.max(0, Math.min(1, ((wx - a[0]) * abx + (wz - a[1]) * abz) / ab2));
        const d = Math.hypot(wx - (a[0] + abx * t), wz - (a[1] + abz * t));
        const k = z * ctx.width + x;
        if (d < dist[k]!) {
          dist[k] = d;
          target[k] = ha + (hb - ha) * t;
        }
      }
    }
  }
  const parts = ctx.terrainMode === "parts"; // terraces: the road follows the slabs, stairs take the steps
  for (let k = 0; k < dist.length; k++) {
    const d = dist[k]!;
    if (d > reach) continue;
    if (!Number.isNaN(ctx.water.data[k]!)) continue; // bridges handle water
    const cur = h.data[k]!;
    if (d <= half) {
      if (!parts) h.data[k] = lerp(cur, target[k]!, 0.92);
      ctx.materials[k] = mat;
    } else {
      const w = 1 - smoothstep(half, half + shoulder, d);
      if (!parts) h.data[k] = lerp(cur, target[k]!, w * 0.7);
      // worn dirt shoulder along the road edge
      if (d <= half + 2.5 && ctx.materials[k] !== TERRAIN_MATERIAL_INDEX.Water) ctx.materials[k] = shoulderMat;
    }
  }
}

/** Parts-mode terraces: a staircase wherever the road steps up or down one level. */
export function placeStairs(ctx: GenContext, roadId: string, pts: Vec2[]): void {
  if (ctx.terrainMode !== "parts") return;
  const h = ctx.heights;
  let n = 0;
  let lastAt = -10;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const ha = h.sample(a[0], a[1]);
    const hb = h.sample(b[0], b[1]);
    const rise = Math.abs(hb - ha);
    if (rise < GROUND_STEP * 0.5 || i - lastAt < 3) continue;
    if (!Number.isNaN(ctx.water.sample(a[0], a[1])) || !Number.isNaN(ctx.water.sample(b[0], b[1]))) continue;
    const low = hb > ha ? a : b;
    const high = hb > ha ? b : a;
    const dx = high[0] - low[0];
    const dz = high[1] - low[1];
    const len = Math.hypot(dx, dz) || 1;
    const dir: Vec2 = [dx / len, dz / len];
    const lowH = Math.min(ha, hb);
    // where does the ground actually step up along the segment?
    let edgeT = len / 2;
    for (let t = 0.5; t < len; t += 0.5) {
      if (h.sample(low[0] + dir[0] * t, low[1] + dir[1] * t) > lowH + 0.5) {
        edgeT = t;
        break;
      }
    }
    let variant = STAIRS_RISES.findIndex((r) => r >= rise - 0.5);
    if (variant < 0) variant = STAIRS_RISES.length - 1;
    const scale = rise / STAIRS_RISES[variant]!;
    const run = Math.round(STAIRS_RISES[variant]! / 2) * 2.5 * scale;
    const edge: Vec2 = [low[0] + dir[0] * edgeT, low[1] + dir[1] * edgeT];
    const foot: Vec2 = [edge[0] - dir[0] * (run - 1), edge[1] - dir[1] * (run - 1)];
    // the whole run must rest on the lower plateau (dry, same level)
    let grounded = true;
    for (let t = 0; t <= run - 1 && grounded; t += 2) {
      const px = foot[0] + dir[0] * t;
      const pz = foot[1] + dir[1] * t;
      if (!Number.isNaN(ctx.water.sample(px, pz)) || Math.abs(h.sample(px, pz) - lowH) > 0.5) grounded = false;
    }
    if (!grounded) continue;
    const mid = edge;
    ctx.placements.push({
      id: `stairs_${roadId}_${n++}`,
      prefab: "stairs",
      variant,
      category: "path",
      position: [foot[0], lowH, foot[1]],
      rotationY: Math.atan2(-dir[1], dir[0]),
      scale,
      layer: "midground",
      importance: 10,
      fixed: true,
      zone: roadId,
    });
    ctx.occupants.push({ position: [mid[0], lowH, mid[1]], radius: run / 2 + 4, kind: "building" });
    lastAt = i;
  }
}

/** Detect water crossings along the road and place scaled bridge prefabs. */
function placeBridges(ctx: GenContext, roadId: string, pts: Vec2[], width: number): void {
  let inWater = false;
  let start = 0;
  const crossings: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const [cx, cz] = ctx.heights.toCell(p[0], p[1]);
    const w = !Number.isNaN(ctx.water.get(Math.round(cx), Math.round(cz)));
    if (w && !inWater) {
      inWater = true;
      start = i;
    } else if (!w && inWater) {
      inWater = false;
      crossings.push([start, i]);
    }
  }
  let n = 0;
  for (const [s, e] of crossings) {
    const a = pts[Math.max(0, s - 2)]!;
    const b = pts[Math.min(pts.length - 1, e + 1)]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 6;
    if (len < 8) continue;
    const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const ha = ctx.heights.sample(a[0], a[1]);
    const hb = ctx.heights.sample(b[0], b[1]);
    const bankH = Math.max(ha, hb);
    const angle = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    if (len > 34 && ctx.prefabs["plank_bridge"]) {
      // long crossing: a plank bridge of the right length, tilted when the banks differ in height
      let variant = PLANK_BRIDGE_LENGTHS.findIndex((l) => l >= len * 0.93);
      if (variant < 0) variant = PLANK_BRIDGE_LENGTHS.length - 1;
      const scale = len / PLANK_BRIDGE_LENGTHS[variant]!;
      const dx = (b[0] - a[0]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1);
      const dz = (b[1] - a[1]) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1);
      const pitch = Math.atan2(hb - ha, len);
      const position: Vec3 = [mid[0], (ha + hb) / 2 + 0.2, mid[1]];
      ctx.placements.push({
        id: `bridge_${roadId}_${n++}`,
        prefab: "plank_bridge",
        variant,
        category: "building",
        position,
        rotationY: angle,
        scale,
        up: [-dx * Math.sin(pitch), Math.cos(pitch), -dz * Math.sin(pitch)],
        layer: "midground",
        importance: 9,
        fixed: true,
        zone: roadId,
      });
      ctx.occupants.push({ position, radius: (len / 2) * 1.1, kind: "building" });
      continue;
    }
    const scale = Math.max(0.8, Math.min(1.3, len / 28));
    const position: Vec3 = [mid[0], bankH, mid[1]];
    ctx.placements.push({
      id: `bridge_${roadId}_${n++}`,
      prefab: "bridge",
      variant: 0,
      category: "building",
      position,
      rotationY: angle,
      scale,
      layer: "midground",
      importance: 9,
      zone: roadId,
    });
    ctx.occupants.push({ position, radius: (len / 2) * 1.1, kind: "building" });
  }
  void width;
}
