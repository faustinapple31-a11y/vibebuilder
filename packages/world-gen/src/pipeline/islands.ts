import { type Rng, type Vec2, type Vec3 } from "@worldforge/core";
import { PLANK_BRIDGE_LENGTHS, STAIRS_RISES } from "@worldforge/prefabs";
import { progress, type GenContext } from "../context";
import type { Island, Terrace } from "./archipelago";
import { carveRoad, routeRoad } from "./roads";

/**
 * Island hopping for archipelago worlds: a spanning tree of plank bridges between the islands (rim to rim,
 * tilted when the plateaus differ in height), a staircase up every terrace, and sandy paths from each
 * bridge landing to the island's roads / site. Runs after the spec roads, before the buildings.
 */
export function connectIslands(ctx: GenContext, rng: Rng): void {
  const islands = ctx.islands;
  const plateau = ctx.plateau;
  if (!islands || !plateau || islands.length === 0) return;
  progress(ctx, "roads:islands", 0.9);
  const levelAt = (p: Vec2) => plateau.sample(p[0], p[1]);
  const isLand = (p: Vec2) => levelAt(p) > -0.5;

  // --- bridges: Prim's spanning tree from the main island
  const main = islands.find((i) => i.main) ?? islands[0]!;
  const linked = new Set<string>([main.id]);
  const edges: [Island, Island][] = [];
  while (linked.size < islands.length) {
    let best: [Island, Island] | null = null;
    let bestD = Infinity;
    for (const a of islands) {
      if (!linked.has(a.id)) continue;
      for (const b of islands) {
        if (linked.has(b.id)) continue;
        const d = Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1]) - a.radius - b.radius;
        if (d < bestD) {
          bestD = d;
          best = [a, b];
        }
      }
    }
    if (!best) break;
    linked.add(best[1].id);
    edges.push(best);
  }

  const landings: { island: Island; point: Vec2 }[] = [];
  let n = 0;
  for (const [a, b] of edges) {
    const dir = norm2([b.center[0] - a.center[0], b.center[1] - a.center[1]]);
    // rim points: walk out of each island along the line between the centres, stop at the last land cell
    const pa = rimPoint(a.center, dir, isLand);
    const pb = rimPoint(b.center, [-dir[0], -dir[1]], isLand);
    if (!pa || !pb) continue;
    // land the deck 3 studs onto each plateau
    const start: Vec2 = [pa[0] - dir[0] * 3, pa[1] - dir[1] * 3];
    const end: Vec2 = [pb[0] + dir[0] * 3, pb[1] + dir[1] * 3];
    const span = Math.hypot(end[0] - start[0], end[1] - start[1]);
    if (span < 12) continue;
    const ha = ctx.heights.sample(start[0], start[1]);
    const hb = ctx.heights.sample(end[0], end[1]);
    // longest ladder length ≤ span × 1.08 scaled up, else the next one scaled down a little
    let variant = PLANK_BRIDGE_LENGTHS.findIndex((l) => l >= span * 0.93);
    if (variant < 0) variant = PLANK_BRIDGE_LENGTHS.length - 1;
    const scale = span / PLANK_BRIDGE_LENGTHS[variant]!;
    const pitch = Math.atan2(hb - ha, span);
    const mid: Vec3 = [(start[0] + end[0]) / 2, (ha + hb) / 2 + 0.2, (start[1] + end[1]) / 2];
    // local +X = deck direction; alignUp(up) tilts it by the pitch (see Placement.up)
    const up: Vec3 = [-dir[0] * Math.sin(pitch), Math.cos(pitch), -dir[1] * Math.sin(pitch)];
    ctx.placements.push({
      id: `island_bridge_${n++}`,
      prefab: "plank_bridge",
      variant,
      category: "building",
      position: mid,
      rotationY: Math.atan2(-dir[1], dir[0]),
      scale,
      up,
      layer: "midground",
      importance: 10,
      fixed: true,
      zone: "islands",
    });
    ctx.occupants.push({ position: mid, radius: span / 2 + 4, kind: "building" });
    landings.push({ island: a, point: [pa[0] - dir[0] * 7, pa[1] - dir[1] * 7] });
    landings.push({ island: b, point: [pb[0] + dir[0] * 7, pb[1] + dir[1] * 7] });
  }

  // --- stairs up every terrace: a rim point whose outside lies on the level below
  let s = 0;
  for (const isl of islands) {
    for (const t of isl.terraces) {
      const spot = stairSpot(t, isl, levelAt, rng);
      if (!spot) continue;
      const rise = t.height - (t.level === 1 ? isl.height : isl.terraces[t.level - 2]!.height);
      let variant = STAIRS_RISES.findIndex((r) => r >= rise - 0.5);
      if (variant < 0) variant = STAIRS_RISES.length - 1;
      const scale = rise / STAIRS_RISES[variant]!;
      const run = (Math.round(STAIRS_RISES[variant]! / 2) * 2.5 * scale) / 2;
      // pivot = foot of the stairs, climbing toward the terrace centre
      const foot: Vec2 = [spot.point[0] - spot.dir[0] * (run + 1), spot.point[1] - spot.dir[1] * (run + 1)];
      const position: Vec3 = [foot[0], ctx.heights.sample(foot[0], foot[1]), foot[1]];
      ctx.placements.push({
        id: `island_stairs_${s++}`,
        prefab: "stairs",
        variant,
        category: "path",
        position,
        rotationY: Math.atan2(-spot.dir[1], spot.dir[0]),
        scale,
        layer: "midground",
        importance: 10,
        fixed: true,
        zone: "islands",
      });
      ctx.occupants.push({ position: [spot.point[0], position[1], spot.point[1]], radius: run + 4, kind: "building" });
      landings.push({ island: isl, point: foot });
    }
  }

  // --- paths: every landing joins the island's existing paths / site (same plateau level: the router
  // cannot climb cliffs, stairs and bridges are the only level changes)
  let p = 0;
  for (const l of landings) {
    const target = pathTarget(ctx, l.island, l.point, levelAt);
    if (!target) continue;
    const route = routeRoad(ctx, rng, [l.point, target], { waterCost: 40 });
    if (!route || route.length < 2) continue;
    const id = `island_path_${p++}`;
    ctx.paths.push({ id, kind: "road", type: "dirt", points: route, width: 5 });
    carveRoad(ctx, route, 5, "dirt");
  }
}

function norm2(v: Vec2): Vec2 {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}

/** Last land point walking from `from` along `dir` (2-stud steps, up to 600 studs). */
function rimPoint(from: Vec2, dir: Vec2, isLand: (p: Vec2) => boolean): Vec2 | null {
  let last: Vec2 | null = null;
  for (let d = 0; d < 600; d += 2) {
    const q: Vec2 = [from[0] + dir[0] * d, from[1] + dir[1] * d];
    if (isLand(q)) last = q;
    else if (last) return last;
  }
  return last;
}

/** A point on the terrace rim with the level below outside it, plus the inward direction. */
function stairSpot(t: Terrace, isl: Island, levelAt: (p: Vec2) => number, rng: Rng): { point: Vec2; dir: Vec2 } | null {
  const a0 = rng.float(0, Math.PI * 2);
  for (let k = 0; k < 16; k++) {
    const a = a0 + (k / 16) * Math.PI * 2;
    const dir: Vec2 = [Math.cos(a), Math.sin(a)];
    // walk outward from the terrace centre until the level drops
    let rim: Vec2 | null = null;
    for (let d = 4; d < t.radius * 1.6; d += 2) {
      const q: Vec2 = [t.center[0] + dir[0] * d, t.center[1] + dir[1] * d];
      if (Math.round(levelAt(q)) < t.level) {
        rim = [t.center[0] + dir[0] * (d - 2), t.center[1] + dir[1] * (d - 2)];
        break;
      }
    }
    if (!rim) continue;
    // the level below must extend far enough for the staircase run (≈ 1.5 × rise) plus a landing
    const need = (t.height - (t.level === 1 ? isl.height : isl.terraces[t.level - 2]!.height)) * 1.3 + 8;
    let ok = true;
    for (let d = 4; d <= need; d += 4) {
      const q: Vec2 = [rim[0] + dir[0] * d, rim[1] + dir[1] * d];
      if (Math.round(levelAt(q)) !== t.level - 1) {
        ok = false;
        break;
      }
    }
    if (ok) return { point: rim, dir: [-dir[0], -dir[1]] };
  }
  return null;
}

/** Nearest existing path point / site centre on the same plateau level as `from`, else the island centre when on that level. */
function pathTarget(ctx: GenContext, isl: Island, from: Vec2, levelAt: (p: Vec2) => number): Vec2 | null {
  const level = Math.round(levelAt(from));
  let best: Vec2 | null = null;
  let bestD = Infinity;
  const consider = (q: Vec2) => {
    if (Math.hypot(q[0] - isl.center[0], q[1] - isl.center[1]) > isl.radius * 1.3) return;
    if (Math.round(levelAt(q)) !== level) return;
    const d = Math.hypot(q[0] - from[0], q[1] - from[1]);
    if (d > 6 && d < bestD) {
      bestD = d;
      best = q;
    }
  };
  for (const s of ctx.sites) consider(s.center);
  for (const path of ctx.paths) for (let i = 0; i < path.points.length; i += 3) consider(path.points[i]!);
  if (!best && Math.round(levelAt(isl.center)) === level) consider(isl.center);
  if (!best) {
    // nothing on this level yet: a short path inward, up to the next terrace wall
    const dir = norm2([isl.center[0] - from[0], isl.center[1] - from[1]]);
    let last: Vec2 | null = null;
    for (let d = 6; d < isl.radius; d += 2) {
      const q: Vec2 = [from[0] + dir[0] * d, from[1] + dir[1] * d];
      if (Math.round(levelAt(q)) !== level) break;
      last = q;
    }
    best = last;
  }
  return best;
}
