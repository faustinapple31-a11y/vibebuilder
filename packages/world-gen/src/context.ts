import type {
  BiomeId,
  LandmarkPlacement,
  PathPolyline,
  Placement,
  PrefabVariant,
  Rng,
  RobloxLightingSettings,
  StyleBible,
  TerrainOp,
  TerrainMaterial,
  Vec2,
  Vec3,
  WorldBake,
  WorldSpec,
  Zone,
} from "@worldforge/core";
import { Simplex2D } from "./noise";
import { Grid } from "./grid";
import type { Island } from "./pipeline/archipelago";

export type GenLayer = "terrain" | "water" | "roads" | "landmarks" | "buildings" | "vegetation" | "props" | "lighting";
export const GEN_LAYERS: GenLayer[] = ["terrain", "water", "roads", "landmarks", "buildings", "vegetation", "props", "lighting"];

export interface GenerateOptions {
  /** Extra prefab variants (AI-generated hero meshes, imports) merged into the library; kept across regenerations. */
  customPrefabs?: Record<string, PrefabVariant[]>;
  /** Previous bake for partial regeneration. */
  previous?: WorldBake;
  /** Layers to regenerate. Default: all unlocked layers (or all when no previous bake). */
  regenerate?: GenLayer[];
  /** Override seed for regenerated layers (keeps locked ones). */
  seedOverride?: number;
  /** Cell size in studs (default 4). */
  cellSize?: number;
  /** Version label stored in meta. */
  version?: string;
  /** Progress callback. */
  onProgress?: (stage: string, progress: number) => void;
  /** Variant counts per prefab (defaults from the registry). */
  variantCounts?: Record<string, number>;
}

export interface Occupant {
  position: Vec3;
  radius: number;
  kind: "building" | "landmark" | "tree" | "rock" | "prop" | "keep";
}

export interface SettlementSite {
  id: string;
  center: Vec2;
  radius: number;
  baseHeight: number;
  spec: WorldSpec["settlements"][number];
}

export interface GenContext {
  spec: WorldSpec;
  style: StyleBible;
  seed: number;
  rng: Rng;
  noise: Simplex2D;
  cellSize: number;
  width: number; // cells
  depth: number; // cells
  worldW: number; // studs
  worldD: number; // studs
  origin: Vec2;

  // grids
  heights: Grid;
  moisture: Grid;
  water: Grid; // water surface height per cell, NaN if none
  materials: Uint8Array;
  biomes: Uint8Array;
  biomeIds: BiomeId[];
  /** Distance (studs) to nearest road centerline edge; large when none. */
  roadDistance: Grid;
  /** Distance to river/lake/ocean edge. */
  waterDistance: Grid;
  /** Ocean mask 0..1 (island / coast features); undefined when the spec has no ocean. */
  ocean?: Grid;
  /** Signed shoreline distance (fraction of the feature size, negative inland) for the ocean features. */
  shore?: Grid;
  /** Archipelago: terrace level per cell (0 = island base, -1 = sea) and the island layout. */
  plateau?: Grid;
  islands?: Island[];
  /** Cliff faces material when a feature wants something other than bedded rock (mesas: brown earth). */
  cliffMaterial?: TerrainMaterial;
  /** "parts" when the ground is built from part prefabs (island blocks) instead of voxels. */
  terrainMode?: "voxels" | "parts";
  /** 3D voxel ops (caves, overhangs, arches, craters) the runtime applies after the heightmap columns. */
  terrainOps: TerrainOp[];

  // structures
  zones: Zone[];
  paths: PathPolyline[];
  landmarks: LandmarkPlacement[];
  sites: SettlementSite[];
  placements: Placement[];
  prefabs: Record<string, PrefabVariant[]>;
  occupants: Occupant[];
  spawn: { position: Vec3; lookAt: Vec3 };
  lighting: RobloxLightingSettings | null;

  // bookkeeping
  regenerate: Set<GenLayer>;
  previous?: WorldBake;
  onProgress: (stage: string, progress: number) => void;
  variantCounts: Record<string, number>;
  trimmed: Record<string, number>;
  startedAt: number;
}

/** Ocean surface height when the spec has an island / coast feature, -Infinity otherwise. */
export function seaLevelOf(spec: WorldSpec): number {
  const hasOcean = spec.terrain.features.some((f) => f.type === "island" || f.type === "coast" || f.type === "archipelago");
  if (!hasOcean) return -Infinity;
  return spec.terrain.seaLevel ?? spec.terrain.baseHeight - 6;
}

/** Normalized (0..1) → world coords. */
export function normToWorld(ctx: GenContext, n: Vec2): Vec2 {
  return [ctx.origin[0] + n[0] * ctx.worldW, ctx.origin[1] + n[1] * ctx.worldD];
}

export function worldToNorm(ctx: GenContext, w: Vec2): Vec2 {
  return [(w[0] - ctx.origin[0]) / ctx.worldW, (w[1] - ctx.origin[1]) / ctx.worldD];
}

export function edgeToWorld(ctx: GenContext, edge: string, inset = 0.04): Vec2 {
  const map: Record<string, Vec2> = {
    north: [0.5, inset],
    south: [0.5, 1 - inset],
    east: [1 - inset, 0.5],
    west: [inset, 0.5],
    "north-east": [1 - inset, inset],
    "north-west": [inset, inset],
    "south-east": [1 - inset, 1 - inset],
    "south-west": [inset, 1 - inset],
    center: [0.5, 0.5],
  };
  return normToWorld(ctx, map[edge] ?? [0.5, 0.5]);
}

export function inBounds(ctx: GenContext, x: number, z: number, margin = 0): boolean {
  return x >= ctx.origin[0] + margin && x <= ctx.origin[0] + ctx.worldW - margin && z >= ctx.origin[1] + margin && z <= ctx.origin[1] + ctx.worldD - margin;
}

export function heightAt(ctx: GenContext, x: number, z: number): number {
  return ctx.heights.sample(x, z);
}

export function slopeAtWorld(ctx: GenContext, x: number, z: number): number {
  const [cx, cz] = ctx.heights.toCell(x, z);
  return ctx.heights.slopeAt(Math.round(cx), Math.round(cz));
}

export function isWaterAt(ctx: GenContext, x: number, z: number): boolean {
  const [cx, cz] = ctx.heights.toCell(x, z);
  const v = ctx.water.get(Math.round(cx), Math.round(cz));
  return !Number.isNaN(v);
}

export function biomeAt(ctx: GenContext, x: number, z: number): BiomeId {
  const [cx, cz] = ctx.heights.toCell(x, z);
  const ix = Math.max(0, Math.min(ctx.width - 1, Math.round(cx)));
  const iz = Math.max(0, Math.min(ctx.depth - 1, Math.round(cz)));
  return ctx.biomeIds[ctx.biomes[iz * ctx.width + ix]!] ?? ctx.biomeIds[0]!;
}

export function distanceToEdge(ctx: GenContext, x: number, z: number): number {
  return Math.min(x - ctx.origin[0], ctx.origin[0] + ctx.worldW - x, z - ctx.origin[1], ctx.origin[1] + ctx.worldD - z);
}

/** Line of sight over the heightmap from A (eye) to B (target). */
export function hasLineOfSight(ctx: GenContext, from: Vec3, to: Vec3, step = 6): boolean {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const len = Math.hypot(dx, dz);
  const n = Math.max(2, Math.ceil(len / step));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = from[0] + dx * t;
    const y = from[1] + dy * t;
    const z = from[2] + dz * t;
    if (ctx.heights.sample(x, z) > y) return false;
  }
  return true;
}

export function progress(ctx: GenContext, stage: string, p: number): void {
  ctx.onProgress(stage, p);
}
