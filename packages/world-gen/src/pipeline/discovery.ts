import { Rng, deriveSeed, type Placement, type Vec2 } from "@worldforge/core";
import { baseRelief, distanceToEdge, hasLineOfSight, isWaterAt, layerFor, progress, type GenContext } from "../context";
import { layoutKeepOut } from "./layout";
import { carveRoad, placeStairs, refreshRoadDistance, routeRoad } from "./roads";
import { nearestRoadPoint } from "./urban-plan";

/**
 * What a player finds by leaving the road: a viewpoint a trail climbs to, and a hidden spot no trail leads to and
 * nobody sees from the spawn. Chosen from the terrain analysis, never at random.
 */
export function placeDiscoveries(ctx: GenContext): void {
  if (ctx.islands || layoutKeepOut(ctx) || ctx.spec.layout?.archetype === "obby_course") return;
  if (ctx.sites.length === 0 && ctx.landmarks.length === 0) return;
  progress(ctx, "discovery", 0);
  const rng = new Rng(deriveSeed(ctx.seed, "discovery"));
  const [sx, sy, sz] = ctx.spawn.position;
  const targets: [number, number, number][] = [
    ...ctx.landmarks.map((l) => [l.position[0], l.position[1] + 18, l.position[2]] as [number, number, number]),
    ...ctx.sites.map((s) => [s.center[0], s.baseHeight + 14, s.center[1]] as [number, number, number]),
  ];
  const spots: { x: number; z: number; rd: number; tpi: number; seen: number; spawnSees: boolean; ds: number }[] = [];
  const step = 16;
  const margin = Math.max(44, Math.min(ctx.worldW, ctx.worldD) * 0.07);
  for (let z = ctx.origin[1] + margin; z < ctx.origin[1] + ctx.worldD - margin; z += step) {
    for (let x = ctx.origin[0] + margin; x < ctx.origin[0] + ctx.worldW - margin; x += step) {
      if (isWaterAt(ctx, x, z) || ctx.waterDistance.sample(x, z) < 10) continue;
      const g = ctx.analysis!.at(x, z);
      if (g.slope > 0.4) continue;
      if (ctx.sites.some((s) => Math.hypot(x - s.center[0], z - s.center[1]) < s.radius * 1.35)) continue;
      if (ctx.occupants.some((o) => Math.hypot(x - o.position[0], z - o.position[2]) < o.radius + 16)) continue;
      if (baseRelief(ctx, x, z, 7) > (ctx.terrainMode === "parts" ? 0.5 : 5)) continue;
      const y = ctx.heights.sample(x, z);
      const ds = Math.hypot(x - sx, z - sz);
      if (ds < 90) continue;
      spots.push({ x, z, rd: ctx.roadDistance.sample(x, z), tpi: g.tpi, ds, seen: targets.filter((t) => hasLineOfSight(ctx, [x, y + 6, z], t)).length, spawnSees: hasLineOfSight(ctx, [sx, sy + 5, sz], [x, y + 4, z]) });
    }
  }
  let n = 0;
  const add = (prefab: string, x: number, z: number, rotationY: number, zone: string, scale = 1): Placement | undefined => {
    const variants = ctx.prefabs[prefab];
    if (!variants?.length || isWaterAt(ctx, x, z)) return undefined;
    const vi = rng.int(0, variants.length - 1);
    const p: Placement = { id: `dress_find_${n++}`, prefab, variant: vi, category: variants[vi]!.category, position: [x, ctx.heights.sample(x, z), z], rotationY, scale, layer: layerFor(ctx, x, z, false), zone, importance: 9 };
    ctx.placements.push(p);
    return p;
  };
  const trailType = ["snow_path", "sand_path"].includes(ctx.style.kits.road) ? ctx.style.kits.road : "dirt_path";

  // ---- the viewpoint: high, open, with a trail
  const high = spots
    .filter((s) => s.rd > 22 && s.rd < 190 && s.seen > 0)
    .map((s) => ({ s, v: s.seen * 1.1 + s.tpi * 0.14 - s.rd / 130 + rng.next() * 0.2 }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 14);
  let view: Vec2 | null = null;
  for (const { s } of high) {
    const from = nearestRoadPoint(ctx, [s.x, s.z]);
    if (!from) break;
    const pts = routeRoad(ctx, rng, [from, [s.x, s.z]], { waterCost: 80 });
    if (!pts || pts.length < 4) continue;
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
    const onBuilding = pts.some((q) => isWaterAt(ctx, q[0], q[1]) || distanceToEdge(ctx, q[0], q[1]) < 20 || ctx.placements.some((p) => p.category === "building" && Math.hypot(p.position[0] - q[0], p.position[2] - q[1]) < (ctx.prefabs[p.prefab]?.[p.variant]?.footprintRadius ?? 8) * 0.95));
    if (onBuilding || length > Math.hypot(from[0] - s.x, from[1] - s.z) * 2.4 + 20) continue;
    ctx.paths.push({ id: "trail_viewpoint", kind: "road", type: trailType, points: pts, width: 4 });
    carveRoad(ctx, pts, 4, trailType);
    placeStairs(ctx, "trail_viewpoint", pts);
    refreshRoadDistance(ctx);
    const y = ctx.heights.sample(s.x, s.z);
    const t = targets.find((q) => hasLineOfSight(ctx, [s.x, y + 6, s.z], q))!;
    const a = Math.atan2(t[2] - s.z, t[0] - s.x);
    // the bench looks at what there is to see; its front is -Z
    add("bench", s.x - Math.cos(a) * 4 - Math.sin(a) * 4.5, s.z - Math.sin(a) * 4 + Math.cos(a) * 4.5, Math.atan2(-Math.cos(a), -Math.sin(a)), "viewpoint");
    add("signpost", s.x - Math.sin(a) * -6, s.z + Math.cos(a) * -6, rng.float(0, 6.28), "viewpoint");
    ctx.occupants.push({ position: [s.x, y, s.z], radius: 10, kind: "keep" });
    ctx.zones.push({ id: "viewpoint", kind: "gameplay", polygon: [], center: [s.x, s.z], radius: 14, meta: { kind: "viewpoint" } });
    view = [s.x, s.z];
    break;
  }

  // ---- the hidden spot: out of sight of the spawn, off every path, low or behind something
  const hidden = spots
    .filter((s) => !s.spawnSees && s.rd > 34 && s.rd < 170 && s.ds > 130 && (!view || Math.hypot(s.x - view[0], s.z - view[1]) > 90))
    .map((s) => ({ s, v: -s.tpi * 0.08 - Math.abs(s.rd - 80) / 70 + rng.next() * 0.5 }))
    .sort((a, b) => b.v - a.v)[0];
  // on open ground the trees hide it instead: the furthest place from the spawn and the roads
  const fallback = [...spots].filter((s) => s.rd > 50 && (!view || Math.hypot(s.x - view[0], s.z - view[1]) > 90)).sort((a, b) => b.rd + b.ds * 0.3 - (a.rd + a.ds * 0.3))[0];
  const spot = hidden?.s ?? fallback;
  if (spot) {
    const a = rng.float(0, Math.PI * 2);
    add("treasure_chest", spot.x, spot.z, a, "secret");
    add("torch_post", spot.x + Math.cos(a) * 4.5, spot.z + Math.sin(a) * 4.5, 0, "secret");
    for (let i = 0; i < 3; i++) {
      const b = a + Math.PI * 0.6 + i * 1.25;
      add(i === 0 ? "boulder" : "ruin_wall", spot.x + Math.cos(b) * 12, spot.z + Math.sin(b) * 12, Math.PI / 2 - b, "secret", i === 0 ? 1.2 : 0.8);
    }
    ctx.occupants.push({ position: [spot.x, ctx.heights.sample(spot.x, spot.z), spot.z], radius: 11, kind: "keep" });
    ctx.zones.push({ id: "secret", kind: "gameplay", polygon: [], center: [spot.x, spot.z], radius: 12, meta: { kind: "secret" } });
  }
  progress(ctx, "discovery", 1);
}
