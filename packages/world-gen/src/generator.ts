import {
  Rng,
  deriveSeed,
  getStylePreset,
  type Placement,
  type PrefabVariant,
  type StyleBible,
  type Vec2,
  type WorldBake,
  type WorldSpec,
} from "@worldforge/core";
import { buildPrefabLibrary, PREFAB_INDEX } from "@worldforge/prefabs";
import { Simplex2D } from "./noise";
import { Grid } from "./grid";
import { GEN_LAYERS, type GenContext, type GenLayer, type GenerateOptions } from "./context";
import { computeMoisture, generateTerrain } from "./pipeline/terrain";
import { generateWater } from "./pipeline/water";
import { generateBiomes } from "./pipeline/biomes";
import { selectSettlementSites, flattenArea } from "./pipeline/sites";
import { placeLandmarks, LANDMARK_PREFAB } from "./pipeline/landmarks";
import { chooseSpawn } from "./pipeline/spawn";
import { generateRoads } from "./pipeline/roads";
import { placeBuildings } from "./pipeline/buildings";
import { placeVegetation, SPECIES_PREFAB } from "./pipeline/vegetation";
import { placeRocksAndProps } from "./pipeline/props";
import { computeLighting } from "./pipeline/lighting";
import { defaultBudget, optimizeAndStats } from "./pipeline/optimize";

export const GENERATOR_VERSION = "0.1.0";

/**
 * Generate a WorldBake from a WorldSpec + StyleBible.
 * Deterministic: same spec + style + seed ⇒ same bake.
 * Supports partial regeneration through `options.previous` + `options.regenerate` and `spec.locks`.
 */
export function generateWorld(specInput: WorldSpec, styleInput?: StyleBible, options: GenerateOptions = {}): WorldBake {
  const spec = specInput;
  const style = styleInput ?? getStylePreset(spec.stylePreset);
  const started = Date.now();
  const cellSize = options.cellSize ?? 4;
  const width = Math.max(16, Math.round(spec.size.width / cellSize));
  const depth = Math.max(16, Math.round(spec.size.depth / cellSize));
  const worldW = width * cellSize;
  const worldD = depth * cellSize;
  const origin: Vec2 = [-worldW / 2, -worldD / 2];
  const seed = options.seedOverride ?? spec.seed;

  // which layers to regenerate
  const previous = options.previous;
  const regenerate = new Set<GenLayer>();
  for (const layer of GEN_LAYERS) {
    const locked = spec.locks[layer as keyof WorldSpec["locks"]] ?? false;
    if (!previous) {
      regenerate.add(layer);
      continue;
    }
    if (locked) continue;
    if (options.regenerate && !options.regenerate.includes(layer)) continue;
    regenerate.add(layer);
  }
  const compatiblePrevious = previous && previous.terrain.width === width && previous.terrain.depth === depth && previous.terrain.cellSize === cellSize ? previous : undefined;
  if (!compatiblePrevious) for (const l of GEN_LAYERS) regenerate.add(l);

  const ctx: GenContext = {
    spec,
    style,
    seed,
    rng: new Rng(seed),
    noise: new Simplex2D(seed),
    cellSize,
    width,
    depth,
    worldW,
    worldD,
    origin,
    heights: new Grid(width, depth, cellSize, origin),
    moisture: new Grid(width, depth, cellSize, origin),
    water: new Grid(width, depth, cellSize, origin),
    materials: new Uint8Array(width * depth),
    biomes: new Uint8Array(width * depth),
    biomeIds: spec.biomes.map((b) => b.id),
    roadDistance: new Grid(width, depth, cellSize, origin),
    waterDistance: new Grid(width, depth, cellSize, origin),
    zones: [],
    paths: [],
    landmarks: [],
    sites: [],
    placements: [],
    prefabs: {},
    occupants: [],
    spawn: { position: [0, 0, 0], lookAt: [0, 0, -1] },
    lighting: null,
    regenerate,
    previous: compatiblePrevious,
    onProgress: options.onProgress ?? (() => {}),
    variantCounts: options.variantCounts ?? {},
    trimmed: {},
    startedAt: started,
  };
  ctx.roadDistance.data.fill(300);
  ctx.waterDistance.data.fill(400);
  ctx.water.data.fill(NaN);

  // ---- prefab library (always rebuilt: cheap and style-dependent)
  ctx.prefabs = buildPrefabLibrary(requiredPrefabs(spec), style, deriveSeed(seed, "prefabs"), ctx.variantCounts);

  // ---- terrain
  if (regenerate.has("terrain") || !compatiblePrevious) {
    generateTerrain(ctx);
  } else {
    ctx.heights.data.set(compatiblePrevious.terrain.heights);
  }
  computeMoisture(ctx);

  // ---- water
  generateWater(ctx); // handles reuse of locked rivers internally

  // ---- biomes & materials (always recomputed: cheap, depends on terrain/water)
  generateBiomes(ctx);
  if (!regenerate.has("terrain") && compatiblePrevious) {
    // keep previous materials where they were explicitly marked (roads/village ground)
    ctx.materials.set(compatiblePrevious.terrain.materials);
  }

  // ---- settlement sites
  if (regenerate.has("buildings") || !compatiblePrevious) {
    selectSettlementSites(ctx);
  } else {
    restoreSites(ctx, compatiblePrevious);
  }

  // ---- landmarks
  if (regenerate.has("landmarks") || !compatiblePrevious) {
    placeLandmarks(ctx);
  } else {
    ctx.landmarks = compatiblePrevious.landmarks.map((l) => ({ ...l, position: [...l.position] as [number, number, number] }));
    for (const l of ctx.landmarks) {
      const info = LANDMARK_PREFAB[l.type];
      flattenArea(ctx, [l.position[0], l.position[2]], info.footprint * l.scale * 1.25, 0.9, l.position[1]);
      ctx.occupants.push({ position: l.position, radius: info.footprint * l.scale, kind: "landmark" });
      ctx.zones.push({ id: l.id, kind: "landmark", polygon: [], center: [l.position[0], l.position[2]], radius: info.footprint * l.scale });
    }
  }
  addLandmarkPlacements(ctx);

  // ---- spawn (reused when nothing that defines it changed, so locked layers stay consistent)
  const spawnInputsChanged = ["terrain", "water", "landmarks", "buildings"].some((l) => regenerate.has(l as GenLayer));
  if (compatiblePrevious && !spawnInputsChanged) {
    ctx.spawn = { position: [...compatiblePrevious.spawn.position] as [number, number, number], lookAt: [...compatiblePrevious.spawn.lookAt] as [number, number, number] };
    const prevZone = compatiblePrevious.zones.find((z) => z.kind === "spawn");
    if (prevZone) ctx.zones.push({ ...prevZone });
    ctx.occupants.push({ position: ctx.spawn.position, radius: 24, kind: "keep" });
  } else {
    chooseSpawn(ctx);
  }

  // ---- roads (handles reuse internally)
  generateRoads(ctx);

  // ---- buildings
  if (regenerate.has("buildings") || !compatiblePrevious) {
    placeBuildings(ctx);
  } else {
    for (const p of compatiblePrevious.placements) {
      if (p.category !== "building" || p.prefab === "bridge") continue;
      const v = ctx.prefabs[p.prefab]?.[p.variant];
      if (!v) continue;
      ctx.placements.push({ ...p, position: [...p.position] as [number, number, number] });
      flattenArea(ctx, [p.position[0], p.position[2]], v.footprintRadius * 1.15, 1.0, p.position[1]);
      ctx.occupants.push({ position: p.position, radius: v.footprintRadius * p.scale, kind: "building" });
    }
  }

  // ---- vegetation
  if (regenerate.has("vegetation") || !compatiblePrevious) {
    placeVegetation(ctx);
  } else {
    for (const p of compatiblePrevious.placements) if (p.category === "vegetation") ctx.placements.push({ ...p });
  }

  // ---- rocks & props
  if (regenerate.has("props") || !compatiblePrevious) {
    placeRocksAndProps(ctx);
  } else {
    for (const p of compatiblePrevious.placements) if (p.category === "rock" || p.category === "prop" || p.category === "path") ctx.placements.push({ ...p });
  }

  // ---- lighting
  ctx.lighting = regenerate.has("lighting") || !compatiblePrevious ? computeLighting(ctx) : compatiblePrevious.lighting;

  // ---- keep the spawn clearing clear (reused layers may predate a moved spawn)
  const [spx, , spz] = ctx.spawn.position;
  ctx.placements = ctx.placements.filter((p) => {
    if (p.locked || p.category === "landmark" || p.category === "path") return true;
    const d = Math.hypot(p.position[0] - spx, p.position[2] - spz);
    const v = ctx.prefabs[p.prefab]?.[p.variant];
    const big = (v?.bounds.max[1] ?? 0) * p.scale > 6 || p.category === "building";
    return !(big && d < 36) && !(d < 8);
  });

  // ---- snap everything to the final terrain (no floating objects)
  for (const p of ctx.placements) {
    const v = ctx.prefabs[p.prefab]?.[p.variant];
    if (!v) continue;
    if (p.prefab === "bridge") continue;
    p.position[1] = ctx.heights.sample(p.position[0], p.position[2]) - v.sinkDepth * p.scale;
  }

  // ---- optimize + stats
  const stats = optimizeAndStats(ctx, defaultBudget(worldW, worldD));
  stats.generationMs = Date.now() - started;

  const bake: WorldBake = {
    meta: {
      specId: spec.id,
      specName: spec.name,
      seed,
      version: options.version ?? "v0.1",
      generatedAt: new Date().toISOString(),
      generatorVersion: GENERATOR_VERSION,
      stylePreset: style.id,
    },
    terrain: {
      cellSize,
      width,
      depth,
      origin,
      heights: ctx.heights.data,
      materials: ctx.materials,
      water: ctx.water.data,
      biomes: ctx.biomes,
      biomeIds: ctx.biomeIds,
    },
    prefabs: ctx.prefabs,
    placements: ctx.placements,
    zones: ctx.zones,
    paths: ctx.paths,
    landmarks: ctx.landmarks,
    lighting: ctx.lighting!,
    spawn: ctx.spawn,
    stats,
  };
  ctx.onProgress("done", 1);
  return bake;
}

function restoreSites(ctx: GenContext, prev: WorldBake): void {
  for (const z of prev.zones) {
    if (z.kind !== "settlement") continue;
    const specS = ctx.spec.settlements.find((s) => s.id === z.id) ?? ctx.spec.settlements[0];
    if (!specS) continue;
    const baseHeight = flattenArea(ctx, z.center, z.radius, 0.55);
    ctx.sites.push({ id: z.id, center: z.center, radius: z.radius, baseHeight, spec: specS });
    ctx.zones.push({ ...z });
    ctx.occupants.push({ position: [z.center[0], baseHeight, z.center[1]], radius: z.radius * 0.25, kind: "keep" });
  }
}

/** Convert LandmarkPlacement entries to prefab placements. */
function addLandmarkPlacements(ctx: GenContext): void {
  const rng = new Rng(deriveSeed(ctx.seed, "landmark-variants"));
  for (const l of ctx.landmarks) {
    const info = LANDMARK_PREFAB[l.type];
    const variants = ctx.prefabs[info.prefab];
    if (!variants || variants.length === 0) continue;
    const vi = rng.int(0, variants.length - 1);
    const v = variants[vi]!;
    const p: Placement = {
      id: `landmark_${l.id}`,
      prefab: info.prefab,
      variant: vi,
      category: "landmark",
      position: [l.position[0], l.position[1] - v.sinkDepth * l.scale, l.position[2]],
      rotationY: rng.float(0, Math.PI * 2),
      scale: l.scale,
      layer: l.role === "focal" ? "background" : "midground",
      zone: l.id,
      importance: 10,
    };
    ctx.placements.push(p);
  }
}

/** All prefab ids a spec can use (built once per bake). */
export function requiredPrefabs(spec: WorldSpec): string[] {
  const ids = new Set<string>();
  for (const s of spec.vegetation.species) ids.add(SPECIES_PREFAB[s]);
  for (const base of ["grass", "bush", "fern", "flower", "small_mushroom", "log", "boulder", "rock_cluster", "stone", "cliff_block", "cottage", "ruin_wall", "ruin_arch", "well", "bridge", "fence", "stone_path_slab", "lantern_post", "crate", "barrel", "bench", "signpost", "campfire", "cart_wheel", "gravestone"]) ids.add(base);
  for (const l of spec.landmarks) ids.add(LANDMARK_PREFAB[l.type].prefab);
  return [...ids].filter((id) => !!PREFAB_INDEX[id]);
}

/** Regenerate specific layers on top of a previous bake. */
export function regenerateLayers(spec: WorldSpec, style: StyleBible | undefined, previous: WorldBake, layers: GenLayer[], options: Omit<GenerateOptions, "previous" | "regenerate"> = {}): WorldBake {
  return generateWorld(spec, style, { ...options, previous, regenerate: layers });
}

export type { PrefabVariant };
