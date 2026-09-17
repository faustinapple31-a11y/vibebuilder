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
  let pos: Vec2 | null = null;
  if (spec.cameraComposition.spawnPosition) {
    pos = normToWorld(ctx, spec.cameraComposition.spawnPosition);
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
      const score = (seesVillage ? 2 : 0) + (seesLandmark ? 2.5 : 0) - s * 2 - attempt * 0.03;
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
  const facingId = spec.cameraComposition.spawnFacing;
  const facing = facingId ? ctx.landmarks.find((l) => l.id === facingId) ?? null : null;
  const facingSite = facingId ? ctx.sites.find((s) => s.id === facingId) ?? null : null;
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
