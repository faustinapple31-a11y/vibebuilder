import { clamp, deriveSeed, type Vec2, type Vec3 } from "@worldforge/core";
import { Rng } from "@worldforge/core";
import { hasLineOfSight, inBounds, isWaterAt, normToWorld, slopeAtWorld, type GenContext } from "../context";
import { LANDMARK_PREFAB } from "./landmarks";
import { layoutKeepOut } from "./layout";
import { computeLighting } from "./lighting";
import { flattenArea, circlePoly } from "./sites";

/** Angular height (radians) a focal should reach from the spawn: about 11°, a sixth of a 70° view. */
const FOCAL_ANGLE = 0.2;

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
  /** Past this, the fog has eaten most of a landmark: at the right size on paper, a grey smear on screen. */
  const fogReach = computeLighting(ctx).fogEnd * 0.7;
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
    const focalHeight = focal ? LANDMARK_PREFAB[focal.type].height * focal.scale : 0;
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
      // how tall the focal stands in the first frame: seen from past the village, it can shrink to a speck
      const toFocal = focal ? Math.hypot(x - focal.position[0], z - focal.position[2]) : 0;
      const apparent = focal ? Math.atan2(focalHeight, toFocal) : 0;
      // only thick fog overrides the composition: a haunted manor beyond it is gone, a far tower in haze is fine
      const lost = focal && fogReach < 200 ? clamp((toFocal - fogReach) / fogReach, 0, 1) * 6 : 0;
      const score = Math.min(1, apparent / FOCAL_ANGLE) * 4 - lost + (seesVillage ? 2 : 0) + (seesLandmark ? 2.5 : 0) + (seesTarget ? 3 : 0) + terrainFan(ctx, x, z, looks) * 2 - (landmarkInFace(ctx, x, z, looks) ? 4 : 0) - s * 2 - attempt * 0.03;
      if (score > bestScore) {
        bestScore = score;
        best = [x, z];
      }
    }
    pos = best ?? [site.center[0] + dx * dist, site.center[1] + dz * dist];
  } else if (focal) {
    // no settlement to look across: stand where the focal fills the frame, wherever the middle of the map is
    const reach = Math.min(clamp((LANDMARK_PREFAB[focal.type].height * focal.scale) / Math.tan(FOCAL_ANGLE), 120, 300), Math.max(100, fogReach));
    const wish: Vec2 = [focal.position[0], focal.position[2]];
    const middle: Vec2 = [ctx.origin[0] + ctx.worldW / 2, ctx.origin[1] + ctx.worldD / 2];
    const toward = Math.atan2(middle[1] - wish[1], middle[0] - wish[0]);
    const look = viewTarget ?? ([focal.position[0], focal.position[1] + 30, focal.position[2]] as Vec3);
    let bestScore = -Infinity;
    for (const r of [reach, reach * 0.8, reach * 1.2]) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const spread = (attempt / 40) * Math.PI;
        const a = toward + (attempt % 2 === 0 ? spread : -spread);
        const x = wish[0] + Math.cos(a) * r;
        const z = wish[1] + Math.sin(a) * r;
        if (!inBounds(ctx, x, z, ctx.worldW * 0.1) || isWaterAt(ctx, x, z)) continue;
        const s = slopeAtWorld(ctx, x, z);
        if (s > 0.3) continue;
        const sees = hasLineOfSight(ctx, [x, ctx.heights.sample(x, z) + 5, z], look);
        // the far fan matters here: nothing stands between the player and a terrace wall 70 studs ahead
        const score = (sees ? 3 : 0) + terrainFan(ctx, x, z, look) * 2 + terrainFan(ctx, x, z, look, r * 0.8) * 4 - s * 2 - attempt * 0.01;
        if (score > bestScore) {
          bestScore = score;
          pos = [x, z];
        }
      }
    }
    pos ??= [ctx.origin[0] + ctx.worldW * 0.5, ctx.origin[1] + ctx.worldD * 0.72];
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
  // an obby's first platform is 30 studs away, but the view it opens runs on past it
  const reach = Math.max(70, Math.min(220, Math.hypot(lx - sx, lz - sz) * 0.9));
  // a low plant takes the place of a nearby tree, so the foreground keeps its dressing (the critic counts it)
  const low = ["bush", "fern", "flower_patch", "grass_tuft"].find((id) => ctx.prefabs[id]?.length);
  const replacements: typeof ctx.placements = [];
  const gameplay = layoutKeepOut(ctx) !== null;
  ctx.placements = ctx.placements.filter((p) => {
    // a tycoon spawn faces its first plot: a farmhouse of the hamlet standing in that line is the one that goes
    if (gameplay && p.category === "building" && !p.locked && !p.fixed && !p.id.startsWith("layout_")) {
      const d = Math.hypot(p.position[0] - sx, p.position[2] - sz);
      const a = Math.atan2(p.position[2] - sz, p.position[0] - sx) - heading;
      return d > reach || Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) > 0.14;
    }
    if (p.category !== "vegetation" || p.locked || p.fixed) return true;
    const d = Math.hypot(p.position[0] - sx, p.position[2] - sz);
    if (d < 30 || d > reach) return true;
    const a = Math.atan2(p.position[2] - sz, p.position[0] - sx) - heading;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) > VIEW_AXIS_HALF_ANGLE) return true;
    const v = ctx.prefabs[p.prefab]?.[p.variant] ?? ctx.prefabs[p.prefab]?.[0];
    if (!v || p.position[1] + v.bounds.max[1] * p.scale < sy + 6) return true;
    if (low && d < 120) replacements.push({ ...p, id: `${p.id}_low`, prefab: low, variant: 0, scale: 1, layer: "foreground" });
    return false;
  });
  ctx.placements.push(...replacements);
}

/** Matches the vegetation stage's exclusion cone. */
const VIEW_AXIS_HALF_ANGLE = 0.3;

/**
 * Share of a ±20° fan of eye-height rays toward the target that cross 60 studs without the ground rising
 * above them: a single clear line can still leave a terrace wall filling half the first frame.
 * Mirrors `measureFirstView` in the critic, which also sees the objects placed later.
 */
function terrainFan(ctx: GenContext, x: number, z: number, target: Vec3, reach = 60): number {
  const eye = ctx.heights.sample(x, z) + 6;
  const heading = Math.atan2(target[2] - z, target[0] - x);
  let open = 0;
  for (let i = 0; i < 9; i++) {
    const a = heading - 0.35 + (0.7 * i) / 8;
    let clear = true;
    for (let d = 8; d <= reach && clear; d += 4) if (ctx.heights.sample(x + Math.cos(a) * d, z + Math.sin(a) * d) > eye) clear = false;
    if (clear) open++;
  }
  return open / 9;
}

/**
 * A landmark standing within 90 studs in the view: a church a few steps ahead fills the first frame with
 * a wall (0% open on a real agent map), even when it is the target itself.
 */
function landmarkInFace(ctx: GenContext, x: number, z: number, target: Vec3): boolean {
  const heading = Math.atan2(target[2] - z, target[0] - x);
  return ctx.landmarks.some((l) => {
    const d = Math.hypot(l.position[0] - x, l.position[2] - z);
    if (d > 90) return false;
    const a = Math.atan2(l.position[2] - z, l.position[0] - x) - heading;
    return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.6;
  });
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
      const score = (sees ? 3 : 0) + terrainFan(ctx, x, z, target) * 2 - (walled ? 4 : 0) - (landmarkInFace(ctx, x, z, target) ? 4 : 0) - s * 2 - r * 0.02;
      if (score > bestScore) {
        bestScore = score;
        best = [x, z];
      }
    }
  }
  return best;
}
