import type {
  BiomeId,
  LandmarkPlacement,
  PathPolyline,
  Placement,
  PlacementLayer,
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

/**
 * Composition layer of a world position: `foreground` near a road / the spawn (what the player sees
 * up close), `background` in the border band (the silhouette on the horizon), `midground` otherwise.
 * Every stage that pushes a placement uses this — a house on a street is foreground, an edge tree is
 * a silhouette. `big` widens the foreground band, because a tall object reads as near from further.
 */
export function layerFor(ctx: GenContext, x: number, z: number, big: boolean): PlacementLayer {
  const rd = ctx.roadDistance.sample(x, z);
  const ds = Math.hypot(x - ctx.spawn.position[0], z - ctx.spawn.position[2]);
  const near = Math.min(rd, ds);
  if (near < (big ? 26 : 18)) return "foreground";
  // the places the player actually stands are near field too, even off the road network: a settlement,
  // a gameplay zone, the paved ground of a landmark
  for (const zone of ctx.zones) {
    if (zone.kind !== "settlement" && zone.kind !== "gameplay") continue;
    if (Math.hypot(x - zone.center[0], z - zone.center[1]) < zone.radius * 1.05) return "foreground";
  }
  if (distanceToEdge(ctx, x, z) < Math.min(ctx.worldW, ctx.worldD) * 0.12) return "background";
  return "midground";
}

/**
 * Ground under a footprint of radius `r`, measured over every heightmap cell the disc touches (not a
 * ring of samples: a ring aliases straight past the one cell that is 40 studs lower). Returns the
 * lowest and highest column and the direction of the lowest one.
 */
export function baseGround(ctx: GenContext, x: number, z: number, r: number): { lo: number; hi: number; dir: Vec2 } {
  const [fcx, fcz] = ctx.heights.toCell(x, z);
  const rc = Math.ceil(r / ctx.cellSize) + 1;
  const cx = Math.round(fcx);
  const cz = Math.round(fcz);
  const reach = r + ctx.cellSize * 0.5;
  let lo = Infinity;
  let hi = -Infinity;
  let dir: Vec2 = [0, 0];
  for (let dz = -rc; dz <= rc; dz++) {
    for (let dx = -rc; dx <= rc; dx++) {
      const gx = Math.max(0, Math.min(ctx.width - 1, cx + dx));
      const gz = Math.max(0, Math.min(ctx.depth - 1, cz + dz));
      const [wx, wz] = ctx.heights.toWorld(gx, gz);
      const d = Math.hypot(wx - x, wz - z);
      if (d > reach) continue;
      const h = ctx.heights.data[gz * ctx.width + gx]!;
      if (h < lo) {
        lo = h;
        if (d > 1e-3) dir = [(wx - x) / d, (wz - z) / d];
      }
      if (h > hi) hi = h;
    }
  }
  if (lo === Infinity) {
    const h = ctx.heights.sample(x, z);
    return { lo: h, hi: h, dir: [0, 0] };
  }
  return { lo, hi, dir };
}

/** Height spread of the ground under a footprint: how uneven the base of an object would be. */
export function baseRelief(ctx: GenContext, x: number, z: number, r: number): number {
  const g = baseGround(ctx, x, z, r);
  return g.hi - g.lo;
}

/**
 * Finds a spot near (x, z) where a footprint of radius `r` meets the ground within `tolerance` studs —
 * the fix for the classic generated-map defect: a tree, rock or crate standing at the lip of a cliff or
 * a terrace with a third of its base in the air. Steps away from the drop and gives up after a few
 * tries, in which case the caller skips the placement rather than leaving it hanging.
 */
export function settleOnGround(ctx: GenContext, x: number, z: number, r: number, tolerance: number, tries = 3): Vec2 | undefined {
  let px = x;
  let pz = z;
  for (let t = 0; t < tries; t++) {
    const g = baseGround(ctx, px, pz, r);
    if (g.hi - g.lo <= tolerance) return [px, pz];
    if (g.dir[0] === 0 && g.dir[1] === 0) return undefined;
    // step away from the drop, a little further than the footprint so the whole base clears the edge
    px -= g.dir[0] * (r + ctx.cellSize);
    pz -= g.dir[1] * (r + ctx.cellSize);
    if (px < ctx.origin[0] || pz < ctx.origin[1] || px > ctx.origin[0] + ctx.worldW || pz > ctx.origin[1] + ctx.worldD) return undefined;
  }
  return undefined;
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
