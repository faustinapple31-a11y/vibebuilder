import { deriveSeed, type Vec2, type Vec3 } from "@worldforge/core";
import { Rng } from "@worldforge/core";
import { hasLineOfSight, inBounds, isWaterAt, normToWorld, slopeAtWorld, type GenContext } from "../context";
import { flattenArea, circlePoly } from "./sites";

/**
 * Spawn composition: the player should spawn on a flat clearing, looking across the
 * settlement (midground) toward the focal landmark (background) whenever possible.
 */
export function chooseSpawn(ctx: GenContext): void {
  const { spec } = ctx;
  const rng = new Rng(deriveSeed(ctx.seed, "spawn"));
  const focal = ctx.landmarks.find((l) => l.role === "focal") ?? ctx.landmarks[0];
  const site = ctx.sites[0];
  const facingId = spec.cameraComposition.spawnFacing;
  const facing = facingId ? ctx.landmarks.find((l) => l.id === facingId) ?? null : null;
  const facingSite = facingId ? ctx.sites.find((s) => s.id === facingId) ?? null : null;
  /** What the first view must show: the spawnFacing target when the spec names one. */
  const viewTarget: Vec3 | null = facing ? [facing.position[0], facing.position[1] + 30, facing.position[2]] : facingSite ? [facingSite.center[0], facingSite.baseHeight + 8, facingSite.center[1]] : null;
  let pos: Vec2 | null = null;
  if (spec.cameraComposition.spawnPosition) {
    pos = nearestClearView(ctx, normToWorld(ctx, spec.cameraComposition.spawnPosition), viewTarget ?? (site ? [site.center[0], site.baseHeight + 8, site.center[1]] : focal ? [focal.position[0], focal.position[1] + 30, focal.position[2]] : null));
  } else if (site) {
    const target: Vec2 = focal ? [focal.position[0], focal.position[2]] : [ctx.origin[0] + ctx.worldW / 2, ctx.origin[1] + ctx.worldD / 2];
    // direction from landmark to village, continue past the village
    let dx = site.center[0] - target[0];
    let dz = site.center[1] - target[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const dist = site.radius + 90 + rng.float(0, 40);
    let best: Vec2 | null = null;
    let bestScore = -Infinity;
    for (let attempt = 0; attempt < 40; attempt++) {
      const spread = (attempt / 40) * Math.PI * 0.9;
      const a = Math.atan2(dz, dx) + (attempt % 2 === 0 ? spread : -spread);
      const x = site.center[0] + Math.cos(a) * dist;
      const z = site.center[1] + Math.sin(a) * dist;
      if (!inBounds(ctx, x, z, ctx.worldW * 0.12)) continue;
      if (isWaterAt(ctx, x, z)) continue;
      const s = slopeAtWorld(ctx, x, z);
      if (s > 0.3) continue;
      // mesa islands: the whole plaza (radius 30) must sit on one plateau level
      if (ctx.plateau) {
        const level = Math.round(ctx.plateau.sample(x, z));
        let flat = level >= 0;
        for (let k = 0; k < 8 && flat; k++) {
          const a = (k / 8) * Math.PI * 2;
          if (Math.round(ctx.plateau.sample(x + Math.cos(a) * 26, z + Math.sin(a) * 26)) !== level) flat = false;
        }
        if (!flat) continue;
      }
      const y = ctx.heights.sample(x, z) + 5;
      const seesVillage = hasLineOfSight(ctx, [x, y, z], [site.center[0], site.baseHeight + 8, site.center[1]]);
      const seesLandmark = focal ? hasLineOfSight(ctx, [x, y, z], [focal.position[0], focal.position[1] + 40, focal.position[2]]) : false;
      const seesTarget = viewTarget ? hasLineOfSight(ctx, [x, y, z], viewTarget) : false;
      const looks = viewTarget ?? [site.center[0], site.baseHeight + 8, site.center[1]];
      const score = (seesVillage ? 2 : 0) + (seesLandmark ? 2.5 : 0) + (seesTarget ? 3 : 0) + terrainFan(ctx, x, z, looks) * 2 - s * 2 - attempt * 0.03;
      if (score > bestScore) {
        bestScore = score;
        best = [x, z];
      }
    }
    pos = best ?? [site.center[0] + dx * dist, site.center[1] + dz * dist];
  } else {
    pos = [ctx.origin[0] + ctx.worldW * 0.5, ctx.origin[1] + ctx.worldD * 0.72];
  }
  const y = flattenArea(ctx, pos, 30, 0.95);
  const lookTarget: Vec3 = site ? [site.center[0], site.baseHeight, site.center[1]] : focal ? focal.position : [pos[0], y, pos[1] - 100];
  const lookAt: Vec3 = facing ? facing.position : facingSite ? [facingSite.center[0], facingSite.baseHeight, facingSite.center[1]] : lookTarget;
  ctx.spawn = { position: [pos[0], y, pos[1]], lookAt };
  ctx.zones.push({ id: "spawn", kind: "spawn", polygon: circlePoly(pos, 30, 12), center: pos, radius: 30 });
  ctx.occupants.push({ position: [pos[0], y, pos[1]], radius: 24, kind: "keep" });
  // the arrival plaza (compass rose + welcome sign), facing the look target
  if (ctx.prefabs["spawn_plaza"]) {
    ctx.placements.push({
      id: "spawn_plaza",
      prefab: "spawn_plaza",
      variant: 0,
      category: "prop",
      position: [pos[0], y, pos[1]],
      rotationY: Math.atan2(-(lookAt[2] - pos[1]), lookAt[0] - pos[0]),
      scale: 1,
      layer: "foreground",
      importance: 10,
      locked: true,
      zone: "spawn",
    });
  }
}

/**
 * Last pass of the generator: no tall vegetation in the axis of the first view, whichever stage placed it
 * (the vegetation stage already avoids it, but dressing adds trees of its own, e.g. by a graveyard).
 * The two framing trees of the spawn apron stand at ±0.75 rad and stay.
 */
export function clearViewAxis(ctx: GenContext): void {
  const [sx, sy, sz] = ctx.spawn.position;
  const [lx, , lz] = ctx.spawn.lookAt;
  const heading = Math.atan2(lz - sz, lx - sx);
  const reach = Math.min(220, Math.hypot(lx - sx, lz - sz) * 0.9);
  ctx.placements = ctx.placements.filter((p) => {
    if (p.category !== "vegetation" || p.locked || p.fixed) return true;
    const d = Math.hypot(p.position[0] - sx, p.position[2] - sz);
    if (d < 30 || d > reach) return true;
    const a = Math.atan2(p.position[2] - sz, p.position[0] - sx) - heading;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) > VIEW_AXIS_HALF_ANGLE) return true;
    const v = ctx.prefabs[p.prefab]?.[p.variant] ?? ctx.prefabs[p.prefab]?.[0];
    return !v || p.position[1] + v.bounds.max[1] * p.scale < sy + 6;
  });
}

/** Matches the vegetation stage's exclusion cone. */
const VIEW_AXIS_HALF_ANGLE = 0.3;

/**
 * Share of a ±20° fan of eye-height rays toward the target that cross 60 studs without the ground rising
 * above them: a single clear line can still leave a terrace wall filling half the first frame.
 * Mirrors `measureFirstView` in the critic, which also sees the objects placed later.
 */
function terrainFan(ctx: GenContext, x: number, z: number, target: Vec3): number {
  const eye = ctx.heights.sample(x, z) + 6;
  const heading = Math.atan2(target[2] - z, target[0] - x);
  let open = 0;
  for (let i = 0; i < 9; i++) {
    const a = heading - 0.35 + (0.7 * i) / 8;
    let clear = true;
    for (let d = 8; d <= 60 && clear; d += 4) if (ctx.heights.sample(x + Math.cos(a) * d, z + Math.sin(a) * d) > eye) clear = false;
    if (clear) open++;
  }
  return open / 9;
}

/**
 * An explicit spawn position is a wish, not a coordinate: at the foot of a terrace wall it looks at the
 * wall. Search rings around the wish (up to 60 studs) for the closest flat, dry point that sees the target.
 */
function nearestClearView(ctx: GenContext, wish: Vec2, target: Vec3 | null): Vec2 {
  if (!target) return wish;
  let best = wish;
  let bestScore = -Infinity;
  for (let ring = 0; ring <= 8; ring++) {
    const r = ring * 15;
    const count = ring === 0 ? 1 : 12 + ring * 2;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      const x = wish[0] + Math.cos(a) * r;
      const z = wish[1] + Math.sin(a) * r;
      if (!inBounds(ctx, x, z, ctx.worldW * 0.08) || isWaterAt(ctx, x, z)) continue;
      const s = slopeAtWorld(ctx, x, z);
      if (s > 0.3) continue;
      const sees = hasLineOfSight(ctx, [x, ctx.heights.sample(x, z) + 5, z], target);
      // inside a settlement or near its wall ring (radius × 1.12 + 10, see dressing.ts) the first frame is
      // a rampart or a house front: stand far enough back that the wall reads as a skyline, not a screen
      const walled = ctx.sites.some((site) => Math.hypot(x - site.center[0], z - site.center[1]) < site.radius * 1.12 + 75);
      const score = (sees ? 3 : 0) + terrainFan(ctx, x, z, target) * 2 - (walled ? 4 : 0) - s * 2 - r * 0.02;
      if (score > bestScore) {
        bestScore = score;
        best = [x, z];
      }
    }
  }
  return best;
}
