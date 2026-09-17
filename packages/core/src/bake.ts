import type { Vec2, Vec3 } from "./math";
import type { PrefabCategory, PrefabVariant } from "./partlist";
import type { BiomeId, LandmarkType } from "./schemas/world-spec";
import type { WeatherKind } from "./taxonomy/types";

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
  "CrackedLava",
  "Glacier",
  "Salt",
  "Concrete",
  "Brick",
  "WoodPlanks",
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
  CrackedLava: "#c8401a",
  Glacier: "#a9c9e0",
  Salt: "#e6e2d8",
  Concrete: "#9a9892",
  Brick: "#8a5a48",
  WoodPlanks: "#8a6a44",
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
  /**
   * Local up axis (unit vector) when the prefab conforms to the terrain slope; omitted = world up.
   * The final rotation is alignUp(up) · Ry(rotationY), so the base sits flush on the ground.
   */
  up?: Vec3;
  layer: PlacementLayer;
  biome?: BiomeId;
  zone?: string;
  locked?: boolean;
  /** Importance used when trimming to budgets (higher = keep). */
  importance: number;
  /** Keep the given height: cave interiors and other placements below / above the heightmap (no terrain snap). */
  fixed?: boolean;
}

export interface Zone {
  id: string;
  kind: "settlement" | "clearing" | "grove" | "landmark" | "spawn" | "keep" | "gameplay";
  /** World-space polygon (x, z). */
  polygon: Vec2[];
  center: Vec2;
  radius: number;
  /** Explicit marker height (gameplay anchors on floating structures); terrain height otherwise. */
  y?: number;
  /** Gameplay attributes written on the zone marker (stage index, plot index, team, kind…). */
  meta?: Record<string, string | number>;
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
  sky: { sunAngularSize: number; moonAngularSize: number; starCount: number; celestialBodies: boolean };
  /** Lighting.Technology — "ShadowMap" is the safe default; "Future" adds dynamic light shadows (heavier on the GPU). */
  technology: "ShadowMap" | "Future";
  /** Workspace.Terrain water shader. */
  terrain: { waterColor: string; waterTransparency: number; waterReflectance: number; waterWaveSize: number; waterWaveSpeed: number };
  /**
   * Style-driven terrain material colors (Terrain:SetMaterialColor): the grass of a candy world is
   * pink, a dark-fantasy forest is desaturated, an alien planet is violet. Missing entries keep the
   * Roblox default. Also used by the viewer.
   */
  terrainColors: Partial<Record<TerrainMaterial, string>>;
  /** Terrain grass decoration (animated grass blades on Grass/LeafyGrass). */
  terrainDecoration: boolean;
  /** Lighting.Clouds. */
  clouds: { enabled: boolean; cover: number; density: number; color: string };
  /** Ambient weather / particle layer rendered by the client around the camera. */
  weather: { kind: WeatherKind; intensity: number; color: string };
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

/**
 * 3D voxel operation applied by the runtime after the heightmap columns are written: caves and tunnels
 * (carve = Air), rock overhangs, arches and crater lava (fill). Heightmaps cannot express overhangs;
 * these ops give the terrain real depth.
 */
export interface TerrainOp {
  op: "carve" | "fill";
  shape: "ball" | "cylinder" | "block";
  position: Vec3;
  /** Ball / cylinder radius (studs). */
  radius?: number;
  /** Block size (studs). */
  size?: Vec3;
  /** Cylinder length (studs). */
  height?: number;
  /** Y rotation (radians) for blocks / cylinders. */
  rotationY?: number;
  /** Tilt around the local X axis (radians) for blocks / cylinders. */
  tilt?: number;
  /** Fill material (ignored for carve). */
  material?: TerrainMaterial;
  /** Zone / landmark id that owns the op (for the critic / editor). */
  zone?: string;
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
  /** Voxel ops (caves, overhangs, arches, craters) applied after the columns. */
  ops: TerrainOp[];
  /**
   * "voxels" (default): the heightmap becomes smooth terrain. "parts": the ground is built from parts /
   * meshes carried by the bake (island blocks…) — the runtime only pours the sea; the heightmap stays the
   * placement reference.
   */
  mode?: "voxels" | "parts";
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
  // parts-built terraces: a point sits on exactly one slab (no interpolation across a step)
  if (t.mode === "parts") return t.heights[Math.max(0, Math.min(t.depth - 1, Math.round(fz))) * t.width + Math.max(0, Math.min(t.width - 1, Math.round(fx)))]!;
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
    ops?: TerrainOp[];
    mode?: "voxels" | "parts";
  };
  prefabs: Record<string, PrefabVariant[]>;
  /** Flat float32 buffer: [prefabIndex, variant, x, y, z, rotY, scale, upX, upZ] per placement (PLACEMENT_STRIDE floats). */
  placementsB64: string;
  placementCount: number;
  prefabIndex: string[];
  placementMeta: { id: string; category: PrefabCategory; layer: PlacementLayer; locked: boolean; importance: number; biome?: BiomeId; zone?: string; fixed?: boolean }[];
  zones: Zone[];
  paths: PathPolyline[];
  landmarks: LandmarkPlacement[];
  lighting: RobloxLightingSettings;
  spawn: WorldBake["spawn"];
  stats: BakeStats;
}

/** Floats per placement in the serialized buffer (see WorldBakeJSON.placementsB64). */
export const PLACEMENT_STRIDE = 9;

export function serializeBake(bake: WorldBake): WorldBakeJSON {
  const prefabIndex = Object.keys(bake.prefabs);
  const pIdx = new Map(prefabIndex.map((p, i) => [p, i]));
  const buf = new Float32Array(bake.placements.length * PLACEMENT_STRIDE);
  bake.placements.forEach((p, i) => {
    const o = i * PLACEMENT_STRIDE;
    buf[o] = pIdx.get(p.prefab) ?? 0;
    buf[o + 1] = p.variant;
    buf[o + 7] = p.up ? p.up[0] : 0;
    buf[o + 8] = p.up ? p.up[2] : 0;
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
      ops: bake.terrain.ops ?? [],
      ...(bake.terrain.mode ? { mode: bake.terrain.mode } : {}),
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
      fixed: p.fixed || undefined,
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
  // older bakes were written with 7 floats per placement (no up vector)
  const stride = buf.length >= json.placementCount * PLACEMENT_STRIDE ? PLACEMENT_STRIDE : 7;
  for (let i = 0; i < json.placementCount; i++) {
    const o = i * stride;
    const meta = json.placementMeta[i]!;
    const ux = stride > 7 ? buf[o + 7]! : 0;
    const uz = stride > 7 ? buf[o + 8]! : 0;
    const up: Vec3 | undefined = ux !== 0 || uz !== 0 ? [ux, Math.sqrt(Math.max(0, 1 - ux * ux - uz * uz)), uz] : undefined;
    placements.push({
      up,
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
      fixed: meta.fixed || undefined,
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
      ops: json.terrain.ops ?? [],
      ...(json.terrain.mode ? { mode: json.terrain.mode } : {}),
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
