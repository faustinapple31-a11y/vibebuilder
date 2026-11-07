import { sampleHeight, type WorldBake } from "@worldforge/core";

export interface FirstView {
  /** Share of the view rays (a ±20° fan at eye height) that run 60 studs without hitting anything. */
  openness: number;
  /** Whether the central ray reaches the look target (or 420 studs) unobstructed. */
  targetVisible: boolean;
  /** What hides the target, when it is hidden. */
  targetBlocker?: string;
  /** Height of the target landmark in the first frame, in degrees of a 70° view; undefined without a landmark target. */
  focalAngle?: number;
  /** Share of the fog range the target stands at: past 0.85 the fog has eaten most of it. */
  focalFog?: number;
  /** Objects within 45 studs of the spawn, ground and road pieces aside: what dresses the first frame. */
  dressing: number;
  /** What stops each blocked ray first, e.g. "terrain", "round_tree", "ground_block". */
  blockers: string[];
}

const EYE = 6;
const NEAR = 60;
const FAR = 420;
const RAYS = 9;
const FAN = 0.35;

/**
 * The first frame the player sees, measured without rendering: rays from the spawn eye toward the look
 * target, stopped by terrain rising above them or by a placement whose footprint they cross below its top.
 * A tree trunk or a terrace wall right in front of the camera shows up here, while the score of every
 * other axis stays perfect.
 */
export function measureFirstView(bake: WorldBake): FirstView {
  const [sx, sy, sz] = bake.spawn.position;
  const [lx, ly, lz] = bake.spawn.lookAt;
  const eyeY = sy + EYE;
  const heading = Math.atan2(lz - sz, lx - sx);
  const targetDist = Math.hypot(lx - sx, lz - sz);
  // aim at the upper part of the target: a lighthouse is seen as soon as its top clears the hill in front
  const landmark = bake.placements.find((p) => p.category === "landmark" && Math.hypot(p.position[0] - lx, p.position[2] - lz) < 15);
  const lv = landmark ? bake.prefabs[landmark.prefab]?.[landmark.variant] ?? bake.prefabs[landmark.prefab]?.[0] : undefined;
  // only what stands tall enough near the view can block it, and a target does not hide itself
  const obstacles = bake.placements
    .filter((p) => p !== landmark)
    // gameplay structures (obby steps, arena walls) are what a layout spawn is meant to face
    .filter((p) => p.prefab !== "spawn_plaza" && !p.id.startsWith("layout_") && Math.hypot(p.position[0] - sx, p.position[2] - sz) < FAR + 20)
    .map((p) => {
      const v = bake.prefabs[p.prefab]?.[p.variant] ?? bake.prefabs[p.prefab]?.[0];
      // a signpost or a lantern post is seen around, not through: thin props do not block a view
      if (!v || (p.category === "prop" && v.footprintRadius * p.scale <= 2.2)) return null;
      return { prefab: p.prefab, x: p.position[0], z: p.position[2], r: Math.max(0.5, v.footprintRadius * p.scale * 0.7), top: p.position[1] + v.bounds.max[1] * p.scale };
    })
    .filter((o): o is NonNullable<typeof o> => !!o && o.top > eyeY - 1);

  /** A ray climbing (or dropping) from the eye to `targetY` at `targetDist`, checked up to `reach`. */
  const castRay = (angle: number, reach: number, targetY: number, targetDistance: number): string | null => {
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    for (let d = 8; d <= reach; d += 3) {
      const x = sx + dx * d;
      const z = sz + dz * d;
      const rayY = eyeY + (targetY - eyeY) * (d / Math.max(targetDistance, 1));
      if (sampleHeight(bake.terrain, x, z) > rayY) return "terrain";
      for (const o of obstacles) if (o.top > rayY && (x - o.x) ** 2 + (z - o.z) ** 2 < o.r * o.r) return o.prefab;
    }
    return null;
  };

  const blockers: string[] = [];
  let open = 0;
  for (let i = 0; i < RAYS; i++) {
    const hit = castRay(heading - FAN + (2 * FAN * i) / (RAYS - 1), NEAR, eyeY, NEAR);
    if (hit) blockers.push(hit);
    else open++;
  }
  const aimY = ly + Math.max(4, lv && landmark ? lv.bounds.max[1] * landmark.scale * 0.6 : 0);
  const targetBlocker = castRay(heading, Math.min(FAR, targetDist * 0.9), aimY, targetDist) ?? undefined;
  const dressing = bake.placements.filter((p) => {
    if (p.prefab === "spawn_plaza" || p.category === "path" || bake.prefabs[p.prefab]?.[p.variant]?.tags.includes("ground")) return false;
    return Math.hypot(p.position[0] - sx, p.position[2] - sz) < 45;
  }).length;
  // a summit block sits on the mountain itself: what reads is how far it rises above the eye
  const rise = lv && landmark ? (landmark.prefab === "cliff_block" || landmark.prefab === "lava_vent" ? landmark.position[1] + lv.bounds.max[1] * landmark.scale - eyeY : lv.bounds.max[1] * landmark.scale) : 0;
  const focalAngle = lv && landmark ? (Math.atan2(rise, targetDist) * 180) / Math.PI : undefined;
  const focalFog = landmark && bake.lighting.fogEnd ? targetDist / bake.lighting.fogEnd : undefined;
  return { openness: open / RAYS, targetVisible: !targetBlocker, targetBlocker, focalAngle, focalFog, dressing, blockers };
}

