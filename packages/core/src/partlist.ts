import type { Vec3 } from "./math";

/**
 * PartList — the universal low-poly asset format of WorldForge.
 *
 * A prefab is a list of primitives with a transform relative to the prefab origin
 * (origin = ground contact point, +Y up). The same PartList is rendered by the
 * Three.js viewer, instantiated as native Parts in Roblox, and exported to .rbxmx.
 *
 * Conventions (match Roblox):
 *  - Y up, right-handed, units = studs.
 *  - rotation = Euler XYZ in degrees (Roblox CFrame.Angles(rx, ry, rz) = Rx · Ry · Rz).
 *  - `cylinder` axis is +Y (the exporter rotates it to Roblox's X-axis cylinder).
 *  - `wedge` = Roblox WedgePart: vertical face at +Z, slope descends toward -Z.
 *  - `sphere` size must be uniform (Roblox Ball).
 */
export type PartShape = "box" | "sphere" | "cylinder" | "wedge" | "cornerWedge";

export const ROBLOX_MATERIALS = [
  "Plastic",
  "ForceField",
  "SmoothPlastic",
  "Wood",
  "WoodPlanks",
  "Slate",
  "Concrete",
  "Grass",
  "LeafyGrass",
  "Cobblestone",
  "Brick",
  "Fabric",
  "Metal",
  "CorrodedMetal",
  "Neon",
  "Glass",
  "Sand",
  "Rock",
  "Marble",
  "Granite",
  "Pebble",
  "Ground",
  "Mud",
  "Ice",
  "Snow",
  "Limestone",
  "Basalt",
  "Asphalt",
  "Pavement",
  "Sandstone",
  "Foil",
  "Rubber",
  "DiamondPlate",
  "CrackedLava",
  "Salt",
] as const;
export type RobloxMaterial = (typeof ROBLOX_MATERIALS)[number];

/** Roblox Enum.Material values (needed by .rbxmx export). */
export const ROBLOX_MATERIAL_ENUM: Record<RobloxMaterial, number> = {
  Plastic: 256,
  SmoothPlastic: 272,
  Wood: 512,
  WoodPlanks: 528,
  Slate: 800,
  Concrete: 816,
  Grass: 1280,
  LeafyGrass: 1284,
  Cobblestone: 880,
  Brick: 848,
  Fabric: 1312,
  Metal: 1088,
  CorrodedMetal: 1040,
  Neon: 288,
  Glass: 1568,
  Sand: 1296,
  Rock: 896,
  Marble: 784,
  Granite: 832,
  Pebble: 864,
  Ground: 1360,
  Mud: 1344,
  Ice: 1536,
  Snow: 1328,
  Limestone: 820,
  Basalt: 788,
  Asphalt: 1376,
  Pavement: 1392,
  Sandstone: 912,
  Foil: 1056,
  ForceField: 1584,
  Rubber: 1616,
  DiamondPlate: 1584,
  CrackedLava: 1600,
  Salt: 1616,
};

export interface PartLight {
  type: "point";
  color: string;
  brightness: number;
  range: number;
}

/**
 * Ambient particle effect emitted from the part volume (Roblox ParticleEmitter).
 * The viewer approximates glowing kinds with a few static emissive motes.
 */
export type PartEffectKind = "fireflies" | "spores" | "embers" | "smoke" | "sparkle" | "mist";
export interface PartEffect {
  kind: PartEffectKind;
  /** Hex color (defaults per kind). */
  color?: string;
  /** Particles per second (defaults per kind). */
  rate?: number;
  /** Particle size multiplier (defaults per kind). */
  size?: number;
}

export interface Part {
  shape: PartShape;
  /** Center position relative to prefab origin (studs). */
  position: Vec3;
  /** Euler XYZ degrees. */
  rotation: Vec3;
  size: Vec3;
  /** Hex color. */
  color: string;
  material: RobloxMaterial;
  transparency?: number;
  reflectance?: number;
  castShadow?: boolean;
  /** Physical collision. Default: true. Foliage/small props should be false. */
  collide?: boolean;
  light?: PartLight;
  effect?: PartEffect;
  name?: string;
  /**
   * LOD tier at which this part still exists.
   * 0 = full detail only, 1 = full + simple, 2 = all tiers (silhouette).
   */
  lod?: 0 | 1 | 2;
}

export type PrefabCategory = "vegetation" | "rock" | "building" | "prop" | "landmark" | "path" | "water" | "npc";

/**
 * External high-quality mesh behind a prefab (AI-generated or imported). The PartList of such a
 * variant is only a placeholder (used when the asset cannot be loaded); the runtime spawns the real
 * Roblox Model asset and the viewer renders the local GLB.
 */
export interface PrefabMeshSource {
  kind: "roblox_asset";
  /** Roblox Model asset id (uploaded through Open Cloud) — spawned with InsertService:LoadAsset. */
  assetId?: number;
  /** Project-relative GLB for the viewer / preview. */
  glbPath?: string;
  /** Project-relative FBX (what was uploaded to Roblox). */
  fbxPath?: string;
  thumbnailPath?: string;
  provider: string;
  prompt: string;
  /** Size of the raw mesh in its own units, before fitting to `bounds`. */
  nativeSize?: Vec3;
}

export interface PrefabVariant {
  /** e.g. "pine_tree/03" */
  id: string;
  /** e.g. "pine_tree" */
  prefab: string;
  category: PrefabCategory;
  parts: Part[];
  /** Local AABB in studs. */
  bounds: { min: Vec3; max: Vec3 };
  /** Studs to sink into terrain so nothing floats on slopes. */
  sinkDepth: number;
  /** Horizontal radius used for spacing/avoidance during placement. */
  footprintRadius: number;
  /**
   * Horizontal radius of the parts that touch the ground (trunk, foundation, rock base).
   * The generator samples the terrain over this disk so the whole base rests on the ground.
   */
  baseRadius?: number;
  tags: string[];
  source?: PrefabMeshSource;
}

/** Row-major 3×3 rotation matrix. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export function mat3Mul(a: Mat3, b: Mat3): Mat3 {
  const r: number[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push(a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!);
  return r as Mat3;
}

export function mat3Apply(m: Mat3, v: Vec3): Vec3 {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}

const DEG = Math.PI / 180;

export function rotX(deg: number): Mat3 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}
export function rotY(deg: number): Mat3 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}
export function rotZ(deg: number): Mat3 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

/** Roblox CFrame.fromEulerAnglesXYZ = Rx · Ry · Rz (degrees in). Same as Three.js Euler order "XYZ". */
export function eulerXYZToMatrix([dx, dy, dz]: Vec3): Mat3 {
  return mat3Mul(mat3Mul(rotX(dx), rotY(dy)), rotZ(dz));
}

/** Inverse of eulerXYZToMatrix (degrees out, in (-180, 180]). */
export function matrixToEulerXYZ(m: Mat3): Vec3 {
  const sy = Math.max(-1, Math.min(1, m[2]));
  const y = Math.asin(sy);
  let x: number;
  let z: number;
  if (Math.abs(sy) < 0.999999) {
    x = Math.atan2(-m[5], m[8]);
    z = Math.atan2(-m[1], m[0]);
  } else {
    x = Math.atan2(m[7], m[4]);
    z = 0;
  }
  return [x / DEG, y / DEG, z / DEG];
}

/** Euler XYZ (degrees) whose rotation maps the local +Y axis onto `dir` (roll around that axis optional). */
export function eulerFromYAxis(dir: Vec3, rollDeg = 0): Vec3 {
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const [dx, dy, dz] = [dir[0] / len, dir[1] / len, dir[2] / len];
  const pitch = Math.acos(Math.max(-1, Math.min(1, dy))) / DEG;
  const yaw = Math.atan2(dx, dz) / DEG;
  return matrixToEulerXYZ(mat3Mul(mat3Mul(rotY(yaw), rotX(pitch)), rotY(rollDeg)));
}

/** Euler XYZ (degrees) whose rotation maps the local +X axis onto `dir` (keeps local +Y as "up" as possible). */
export function eulerFromXAxis(dir: Vec3, rollDeg = 0): Vec3 {
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const [dx, dy, dz] = [dir[0] / len, dir[1] / len, dir[2] / len];
  const a = Math.asin(Math.max(-1, Math.min(1, dy))) / DEG;
  const yaw = Math.atan2(-dz, dx) / DEG;
  return matrixToEulerXYZ(mat3Mul(mat3Mul(rotY(yaw), rotZ(a)), rotX(rollDeg)));
}

/** Corners of a part's oriented box, in prefab space. */
export function partCorners(p: Part): Vec3[] {
  const m = eulerXYZToMatrix(p.rotation);
  const [hx, hy, hz] = [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
  const out: Vec3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const v = mat3Apply(m, [sx * hx, sy * hy, sz * hz]);
    out.push([p.position[0] + v[0], p.position[1] + v[1], p.position[2] + v[2]]);
  }
  return out;
}

/** Exact AABB of a part (spheres use the sphere radius). */
export function partBounds(p: Part): { min: Vec3; max: Vec3 } {
  if (p.shape === "sphere") {
    const r = p.size[0] / 2;
    return { min: [p.position[0] - r, p.position[1] - r, p.position[2] - r], max: [p.position[0] + r, p.position[1] + r, p.position[2] + r] };
  }
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const c of partCorners(p)) {
    for (let i = 0; i < 3; i++) {
      if (c[i]! < min[i]!) min[i] = c[i]!;
      if (c[i]! > max[i]!) max[i] = c[i]!;
    }
  }
  return { min, max };
}

export function computeBounds(parts: Part[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    if ((p.transparency ?? 0) >= 1) continue;
    const b = partBounds(p);
    for (let i = 0; i < 3; i++) {
      if (b.min[i]! < min[i]!) min[i] = b.min[i]!;
      if (b.max[i]! > max[i]!) max[i] = b.max[i]!;
    }
  }
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min, max };
}

/**
 * Horizontal radius of the parts resting on the ground (bottom within `contact` studs of y=0).
 * Used to sample the terrain under the whole base of a prefab.
 */
export function computeBaseRadius(parts: Part[], contact = 1.0): number {
  let r = 0;
  for (const p of parts) {
    if ((p.transparency ?? 0) >= 1) continue;
    const b = partBounds(p);
    if (b.min[1] > contact) continue;
    const horiz = Math.max(Math.abs(b.min[0]), Math.abs(b.max[0]), Math.abs(b.min[2]), Math.abs(b.max[2]));
    if (horiz > r) r = horiz;
  }
  return r;
}

export function countParts(variants: PrefabVariant[]): number {
  return variants.reduce((s, v) => s + v.parts.length, 0);
}
