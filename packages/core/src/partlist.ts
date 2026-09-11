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
 *  - rotation = Euler XYZ in degrees (Roblox CFrame.Angles(rx, ry, rz)).
 *  - `cylinder` axis is +Y (the exporter rotates it to Roblox's X-axis cylinder).
 *  - `wedge` = Roblox WedgePart: vertical face at +Z, slope descends toward -Z.
 *  - `sphere` size must be uniform (Roblox Ball).
 */
export type PartShape = "box" | "sphere" | "cylinder" | "wedge" | "cornerWedge";

export const ROBLOX_MATERIALS = [
  "Plastic",
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
};

export interface PartLight {
  type: "point";
  color: string;
  brightness: number;
  range: number;
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
  name?: string;
  /**
   * LOD tier at which this part still exists.
   * 0 = full detail only, 1 = full + simple, 2 = all tiers (silhouette).
   */
  lod?: 0 | 1 | 2;
}

export type PrefabCategory = "vegetation" | "rock" | "building" | "prop" | "landmark" | "path" | "water" | "npc";

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
  tags: string[];
}

export function computeBounds(parts: Part[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    // conservative: use the bounding sphere of the rotated box
    const r = Math.hypot(p.size[0], p.size[1], p.size[2]) / 2;
    const isAxisAligned = p.rotation[0] === 0 && p.rotation[1] === 0 && p.rotation[2] === 0;
    const hx = isAxisAligned ? p.size[0] / 2 : r;
    const hy = isAxisAligned ? p.size[1] / 2 : r;
    const hz = isAxisAligned ? p.size[2] / 2 : r;
    min[0] = Math.min(min[0], p.position[0] - hx);
    min[1] = Math.min(min[1], p.position[1] - hy);
    min[2] = Math.min(min[2], p.position[2] - hz);
    max[0] = Math.max(max[0], p.position[0] + hx);
    max[1] = Math.max(max[1], p.position[1] + hy);
    max[2] = Math.max(max[2], p.position[2] + hz);
  }
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min, max };
}

export function countParts(variants: PrefabVariant[]): number {
  return variants.reduce((s, v) => s + v.parts.length, 0);
}
