import type { Vec2, Vec3 } from "./math";
import type { PrefabCategory, PrefabVariant } from "./partlist";
import type { BiomeId, LandmarkType } from "./schemas/world-spec";

/** Roblox Terrain materials we write. Index = value stored in `materials` array. */
export const TERRAIN_MATERIALS = [
  "Air",
  "Grass",
  "LeafyGrass",
  "Ground",
  "Mud",
  "Rock",
  "Slate",
  "Sand",
  "Snow",
  "Water",
  "Cobblestone",
  "Basalt",
  "Limestone",
  "Sandstone",
  "Ice",
  "Asphalt",
  "Pavement",
] as const;
export type TerrainMaterial = (typeof TERRAIN_MATERIALS)[number];
export const TERRAIN_MATERIAL_INDEX: Record<TerrainMaterial, number> = Object.fromEntries(
  TERRAIN_MATERIALS.map((m, i) => [m, i]),
) as Record<TerrainMaterial, number>;

/** Viewer/critic colors for terrain materials (hex). */
export const TERRAIN_MATERIAL_COLORS: Record<TerrainMaterial, string> = {
  Air: "#000000",
  Grass: "#4f6b3a",
  LeafyGrass: "#3f5d33",
  Ground: "#6b5a44",
  Mud: "#4f4232",
  Rock: "#6f6f74",
  Slate: "#5f6168",
  Sand: "#c8b688",
  Snow: "#e8ecf2",
  Water: "#4d6f86",
  Cobblestone: "#7a7670",
  Basalt: "#3d3d42",
  Limestone: "#b9b09a",
  Sandstone: "#c2a374",
  Ice: "#bcd8ec",
  Asphalt: "#3b3b3b",
  Pavement: "#8f8c86",
};

export type PlacementLayer = "foreground" | "midground" | "background";
export type LodTier = "full" | "simple" | "silhouette";

export interface Placement {
  /** Unique id (stable across regenerations when locked). */
  id: string;
  prefab: string;
  variant: number;
  category: PrefabCategory;
  position: Vec3;
  /** Y rotation in radians. */
  rotationY: number;
  scale: number;
  layer: PlacementLayer;
  biome?: BiomeId;
  zone?: string;
  locked?: boolean;
  /** Importance used when trimming to budgets (higher = keep). */
  importance: number;
}

export interface Zone {
  id: string;
  kind: "settlement" | "clearing" | "grove" | "landmark" | "spawn" | "keep";
  /** World-space polygon (x, z). */
  polygon: Vec2[];
  center: Vec2;
  radius: number;
}

export interface PathPolyline {
  id: string;
  kind: "road" | "river";
  type: string;
  points: Vec2[];
  width: number;
}

export interface LandmarkPlacement {
  id: string;
  type: LandmarkType;
  role: "focal" | "secondary" | "hidden";
  position: Vec3;
  scale: number;
  viewCorridors: { from: string; fromPosition: Vec2; visible: boolean }[];
}

export interface RobloxLightingSettings {
  clockTime: number;
  brightness: number;
  ambient: string;
  outdoorAmbient: string;
  colorShiftTop: string;
  colorShiftBottom: string;
  exposureCompensation: number;
  globalShadows: boolean;
  shadowSoftness: number;
  fogStart: number;
  fogEnd: number;
  fogColor: string;
  atmosphere: { density: number; offset: number; color: string; decay: string; glare: number; haze: number };
  colorCorrection: { saturation: number; contrast: number; tintColor: string; brightness: number };
  bloom: { intensity: number; size: number; threshold: number };
  sunRays: { intensity: number; spread: number };
  sky: { sunAngularSize: number; moonAngularSize: number; starCount: number };
}

export interface BakeStats {
  counts: Record<PrefabCategory, number>;
  partsEstimate: number;
  variantsUsed: Record<string, number>;
  variantsAvailable: Record<string, number>;
  layerCounts: Record<PlacementLayer, number>;
  heightStd: number;
  heightMin: number;
  heightMax: number;
  slopeMean: number;
  waterCoverage: number;
  vegetationCoverage: number;
  buildingCount: number;
  budgets: Record<PrefabCategory, { max: number; used: number; trimmed: number }>;
  generationMs: number;
}

export interface TerrainData {
  cellSize: number;
  width: number;
  depth: number;
  origin: Vec2;
  heights: Float32Array;
  materials: Uint8Array;
  /** Water surface height per cell; NaN if no water. */
  water: Float32Array;
  /** Biome id index per cell. */
  biomes: Uint8Array;
  biomeIds: BiomeId[];
}

export interface WorldBake {
  meta: {
    specId: string;
    specName: string;
    seed: number;
    version: string;
    generatedAt: string;
    generatorVersion: string;
    stylePreset: string;
  };
  terrain: TerrainData;
  prefabs: Record<string, PrefabVariant[]>;
  placements: Placement[];
  zones: Zone[];
  paths: PathPolyline[];
  landmarks: LandmarkPlacement[];
  lighting: RobloxLightingSettings;
  spawn: { position: Vec3; lookAt: Vec3 };
  stats: BakeStats;
}

/** Sample terrain height with bilinear interpolation at world coordinates. */
export function sampleHeight(t: TerrainData, x: number, z: number): number {
  const fx = (x - t.origin[0]) / t.cellSize;
  const fz = (z - t.origin[1]) / t.cellSize;
  const x0 = Math.max(0, Math.min(t.width - 1, Math.floor(fx)));
  const z0 = Math.max(0, Math.min(t.depth - 1, Math.floor(fz)));
  const x1 = Math.min(t.width - 1, x0 + 1);
  const z1 = Math.min(t.depth - 1, z0 + 1);
  const tx = Math.max(0, Math.min(1, fx - x0));
  const tz = Math.max(0, Math.min(1, fz - z0));
  const h00 = t.heights[z0 * t.width + x0]!;
  const h10 = t.heights[z0 * t.width + x1]!;
  const h01 = t.heights[z1 * t.width + x0]!;
  const h11 = t.heights[z1 * t.width + x1]!;
  return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
}

export function cellIndex(t: TerrainData, x: number, z: number): number {
  const cx = Math.max(0, Math.min(t.width - 1, Math.floor((x - t.origin[0]) / t.cellSize)));
  const cz = Math.max(0, Math.min(t.depth - 1, Math.floor((z - t.origin[1]) / t.cellSize)));
  return cz * t.width + cx;
}

/** Slope in radians at world coords (central differences on the grid). */
export function sampleSlope(t: TerrainData, x: number, z: number): number {
  const d = t.cellSize;
  const hx0 = sampleHeight(t, x - d, z);
  const hx1 = sampleHeight(t, x + d, z);
  const hz0 = sampleHeight(t, x, z - d);
  const hz1 = sampleHeight(t, x, z + d);
  const gx = (hx1 - hx0) / (2 * d);
  const gz = (hz1 - hz0) / (2 * d);
  return Math.atan(Math.hypot(gx, gz));
}

// ---------------------------------------------------------------------------
// Serialization: typed arrays are base64 encoded so the bake can be stored as JSON
// and loaded by Rojo as a ModuleScript (decoded in Luau with `buffer`).
// ---------------------------------------------------------------------------

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  if (i < bytes.length) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const n = (b0 << 16) | (b1 << 8);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : "=";
    out += "=";
  }
  return out;
}

export function base64ToBytes(str: string): Uint8Array {
  const out = new Uint8Array(Math.floor((str.length * 3) / 4) + 3);
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    let v: number;
    if (c >= 65 && c <= 90) v = c - 65;
    else if (c >= 97 && c <= 122) v = c - 71;
    else if (c >= 48 && c <= 57) v = c + 4;
    else if (c === 43 || c === 45) v = 62;
    else if (c === 47 || c === 95) v = 63;
    else continue; // '=' padding, whitespace
    acc = ((acc << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 255;
    }
  }
  return out.subarray(0, o);
}

export function f32ToBase64(arr: Float32Array): string {
  return bytesToBase64(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
}
export function base64ToF32(str: string): Float32Array {
  const bytes = base64ToBytes(str);
  const copy = new Uint8Array(bytes.length - (bytes.length % 4));
  copy.set(bytes.subarray(0, copy.length));
  return new Float32Array(copy.buffer);
}

export interface WorldBakeJSON {
  meta: WorldBake["meta"];
  terrain: {
    cellSize: number;
    width: number;
    depth: number;
    origin: Vec2;
    heightsB64: string;
    materialsB64: string;
    waterB64: string;
    biomesB64: string;
    biomeIds: BiomeId[];
    minHeight: number;
    maxHeight: number;
  };
  prefabs: Record<string, PrefabVariant[]>;
  /** Flat float32 buffer: [prefabIndex, variant, x, y, z, rotY, scale] per placement. */
  placementsB64: string;
  placementCount: number;
  prefabIndex: string[];
  placementMeta: { id: string; category: PrefabCategory; layer: PlacementLayer; locked: boolean; importance: number; biome?: BiomeId; zone?: string }[];
  zones: Zone[];
  paths: PathPolyline[];
  landmarks: LandmarkPlacement[];
  lighting: RobloxLightingSettings;
  spawn: WorldBake["spawn"];
  stats: BakeStats;
}

export function serializeBake(bake: WorldBake): WorldBakeJSON {
  const prefabIndex = Object.keys(bake.prefabs);
  const pIdx = new Map(prefabIndex.map((p, i) => [p, i]));
  const buf = new Float32Array(bake.placements.length * 7);
  bake.placements.forEach((p, i) => {
    const o = i * 7;
    buf[o] = pIdx.get(p.prefab) ?? 0;
    buf[o + 1] = p.variant;
    buf[o + 2] = p.position[0];
    buf[o + 3] = p.position[1];
    buf[o + 4] = p.position[2];
    buf[o + 5] = p.rotationY;
    buf[o + 6] = p.scale;
  });
  let minH = Infinity;
  let maxH = -Infinity;
  for (let i = 0; i < bake.terrain.heights.length; i++) {
    const h = bake.terrain.heights[i]!;
    if (h < minH) minH = h;
    if (h > maxH) maxH = h;
  }
  return {
    meta: bake.meta,
    terrain: {
      cellSize: bake.terrain.cellSize,
      width: bake.terrain.width,
      depth: bake.terrain.depth,
      origin: bake.terrain.origin,
      heightsB64: f32ToBase64(bake.terrain.heights),
      materialsB64: bytesToBase64(bake.terrain.materials),
      waterB64: f32ToBase64(bake.terrain.water),
      biomesB64: bytesToBase64(bake.terrain.biomes),
      biomeIds: bake.terrain.biomeIds,
      minHeight: minH,
      maxHeight: maxH,
    },
    prefabs: bake.prefabs,
    placementsB64: f32ToBase64(buf),
    placementCount: bake.placements.length,
    prefabIndex,
    placementMeta: bake.placements.map((p) => ({
      id: p.id,
      category: p.category,
      layer: p.layer,
      locked: !!p.locked,
      importance: p.importance,
      biome: p.biome,
      zone: p.zone,
    })),
    zones: bake.zones,
    paths: bake.paths,
    landmarks: bake.landmarks,
    lighting: bake.lighting,
    spawn: bake.spawn,
    stats: bake.stats,
  };
}

export function deserializeBake(json: WorldBakeJSON): WorldBake {
  const placements: Placement[] = [];
  const buf = base64ToF32(json.placementsB64);
  for (let i = 0; i < json.placementCount; i++) {
    const o = i * 7;
    const meta = json.placementMeta[i]!;
    placements.push({
      id: meta.id,
      prefab: json.prefabIndex[buf[o]!]!,
      variant: buf[o + 1]!,
      category: meta.category,
      position: [buf[o + 2]!, buf[o + 3]!, buf[o + 4]!],
      rotationY: buf[o + 5]!,
      scale: buf[o + 6]!,
      layer: meta.layer,
      locked: meta.locked,
      importance: meta.importance,
      biome: meta.biome,
      zone: meta.zone,
    });
  }
  return {
    meta: json.meta,
    terrain: {
      cellSize: json.terrain.cellSize,
      width: json.terrain.width,
      depth: json.terrain.depth,
      origin: json.terrain.origin,
      heights: base64ToF32(json.terrain.heightsB64),
      materials: base64ToBytes(json.terrain.materialsB64),
      water: base64ToF32(json.terrain.waterB64),
      biomes: base64ToBytes(json.terrain.biomesB64),
      biomeIds: json.terrain.biomeIds,
    },
    prefabs: json.prefabs,
    placements,
    zones: json.zones,
    paths: json.paths,
    landmarks: json.landmarks,
    lighting: json.lighting,
    spawn: json.spawn,
    stats: json.stats,
  };
}
