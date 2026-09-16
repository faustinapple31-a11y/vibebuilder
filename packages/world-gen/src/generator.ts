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
import { buildPrefabLibrary, PREFAB_INDEX, PROP_KIT_PREFABS, VEGETATION_KIT_SPECIES } from "@worldforge/prefabs";
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
import { placeLayout } from "./pipeline/layout";
import { placeDressing } from "./pipeline/dressing";
import { placeRelief } from "./pipeline/relief";
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
    terrainOps: [],
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

  // ---- prefab library (always rebuilt: cheap and style-dependent) + external mesh assets
  ctx.prefabs = buildPrefabLibrary(requiredPrefabs(spec, style), style, deriveSeed(seed, "prefabs"), ctx.variantCounts);
  for (const [id, variants] of Object.entries(options.customPrefabs ?? {})) if (variants.length > 0) ctx.prefabs[id] = variants;
  if (compatiblePrevious) {
    for (const [id, variants] of Object.entries(compatiblePrevious.prefabs)) {
      if (!ctx.prefabs[id] && variants[0]?.source) ctx.prefabs[id] = variants;
    }
  }

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
    placeDressing(ctx);
  } else {
    for (const p of compatiblePrevious.placements) {
      if (p.id.startsWith("dress_")) {
        // settlement dressing (walls, fields, piers, markings) belongs to the buildings layer
        const dv = ctx.prefabs[p.prefab]?.[p.variant];
        if (!dv) continue;
        ctx.placements.push({ ...p, position: [...p.position] as [number, number, number] });
        if (dv.tags.includes("wall") || dv.tags.includes("field")) ctx.occupants.push({ position: p.position, radius: dv.footprintRadius * p.scale, kind: "building" });
        continue;
      }
      if (p.category !== "building" || p.prefab === "bridge") continue;
      const v = ctx.prefabs[p.prefab]?.[p.variant];
      if (!v) continue;
      ctx.placements.push({ ...p, position: [...p.position] as [number, number, number] });
      flattenArea(ctx, [p.position[0], p.position[2]], v.footprintRadius * 1.15, 1.0, p.position[1]);
      ctx.occupants.push({ position: p.position, radius: v.footprintRadius * p.scale, kind: "building" });
    }
    for (const z of compatiblePrevious.zones) if (z.kind === "gameplay" && (z.id.endsWith("_walls") || z.id.endsWith("_docks") || z.id === "graveyard")) ctx.zones.push({ ...z });
  }

  // ---- gameplay layout (obby / arena / race track / tycoon plots / lobby / TD path / field / plaza / dungeon)
  if (regenerate.has("buildings") || !compatiblePrevious) {
    placeLayout(ctx);
  } else {
    for (const p of compatiblePrevious.placements) if (p.id.startsWith("layout_")) ctx.placements.push({ ...p, position: [...p.position] as [number, number, number] });
    for (const z of compatiblePrevious.zones) if (z.kind === "gameplay") ctx.zones.push({ ...z });
    for (const [id, variants] of Object.entries(compatiblePrevious.prefabs)) if (!ctx.prefabs[id] && variants[0]?.tags.includes("layout")) ctx.prefabs[id] = variants;
  }

  // ---- 3D relief: caves behind cave landmarks, overhangs, arches, lava (voxel ops + fixed interior props)
  if (regenerate.has("landmarks") || regenerate.has("terrain") || !compatiblePrevious) {
    placeRelief(ctx);
  } else {
    ctx.terrainOps = compatiblePrevious.terrain.ops.map((o) => ({ ...o, position: [...o.position] as [number, number, number] }));
    for (const p of compatiblePrevious.placements) if (p.fixed) ctx.placements.push({ ...p, position: [...p.position] as [number, number, number] });
    for (const z of compatiblePrevious.zones) if (z.kind === "gameplay" && (z.meta?.kind === "cave" || z.meta?.kind === "lava")) ctx.zones.push({ ...z });
  }

  // ---- vegetation
  if (regenerate.has("vegetation") || !compatiblePrevious) {
    placeVegetation(ctx);
  } else {
    for (const p of compatiblePrevious.placements) if (p.category === "vegetation" && !p.fixed) ctx.placements.push({ ...p });
  }

  // ---- rocks & props
  if (regenerate.has("props") || !compatiblePrevious) {
    placeRocksAndProps(ctx);
  } else {
    for (const p of compatiblePrevious.placements) if ((p.category === "rock" || p.category === "prop" || p.category === "path") && !p.id.startsWith("dress_") && !p.fixed) ctx.placements.push({ ...p });
  }

  // ---- locked placements survive the regeneration of their layer (manual inserts, hero meshes)
  if (compatiblePrevious) {
    const have = new Set(ctx.placements.map((p) => p.id));
    for (const p of compatiblePrevious.placements) {
      if (!p.locked || have.has(p.id) || !ctx.prefabs[p.prefab]?.[p.variant]) continue;
      ctx.placements.push({ ...p, position: [p.position[0], p.position[1], p.position[2]] });
    }
  }

  // ---- lighting
  ctx.lighting = regenerate.has("lighting") || !compatiblePrevious ? computeLighting(ctx) : compatiblePrevious.lighting;

  // ---- keep the spawn clearing clear (reused layers may predate a moved spawn)
  const [spx, , spz] = ctx.spawn.position;
  ctx.placements = ctx.placements.filter((p) => {
    if (p.locked || p.fixed || p.category === "landmark" || p.category === "path" || p.id.startsWith("layout_")) return true; // gameplay structures may host the spawn
    const d = Math.hypot(p.position[0] - spx, p.position[2] - spz);
    const v = ctx.prefabs[p.prefab]?.[p.variant];
    const big = (v?.bounds.max[1] ?? 0) * p.scale > 6 || p.category === "building";
    return !(big && d < 36) && !(d < 8);
  });

  // ---- snap everything to the final terrain (no floating objects) and conform small things to the slope
  for (const p of ctx.placements) {
    const v = ctx.prefabs[p.prefab]?.[p.variant];
    if (!v) continue;
    if (p.prefab === "bridge" || p.fixed) continue; // fixed = cave interiors and other placements off the heightmap
    if (p.id.startsWith("layout_") || v.tags.includes("layout")) continue; // gameplay structures keep their designed height (floating obby platforms…)
    if (v.tags.includes("floating")) {
      // on water: the hull sits at its waterline (sinkDepth); vines / balloons keep their height
      const w = ctx.water.sample(p.position[0], p.position[2]);
      if (!Number.isNaN(w)) p.position[1] = w + 0.05 - (v.tags.includes("water") ? v.sinkDepth * p.scale : 0);
      continue;
    }
    const conform = conformFactor(p, v);
    if (conform > 0) {
      const n = terrainNormal(ctx, p.position[0], p.position[2], Math.max(2, (v.baseRadius ?? 2) * p.scale));
      // blend between world up and the terrain normal (trees only lean a little with the slope)
      const blended: [number, number, number] = [n[0] * conform, n[1] * conform + (1 - conform), n[2] * conform];
      const len = Math.hypot(blended[0], blended[1], blended[2]) || 1;
      const up: [number, number, number] = [blended[0] / len, blended[1] / len, blended[2] / len];
      p.up = up[1] > 0.9995 ? undefined : up;
    }
    p.position[1] = groundHeightFor(ctx, v, p.position[0], p.position[2], p.scale, p.rotationY, conform);
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
      ops: ctx.terrainOps,
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

/**
 * Ground height for a prefab base: the terrain is sampled over the disk of parts that touch the
 * ground (`baseRadius`), and the lowest sample wins so the whole base rests on or in the terrain on
 * slopes — the uphill side sinks a little instead of the downhill side floating. The extra sink is
 * capped relative to the prefab height so tall slim objects are never buried.
 */
export function groundHeightFor(ctx: GenContext, v: PrefabVariant, x: number, z: number, scale: number, rotationY: number, conform = 0): number {
  const center = ctx.heights.sample(x, z);
  const r = (v.baseRadius ?? Math.min(v.footprintRadius, 2)) * scale;
  const sink = v.sinkDepth * scale;
  // a prefab tilted onto the terrain normal already has its base flush with the slope
  if (r < 1.5 || conform >= 0.99) return center - sink;
  let min = center;
  const rings = r > 8 ? 2 : 1;
  for (let ring = 1; ring <= rings; ring++) {
    const rr = (r * ring) / rings;
    for (let i = 0; i < 8; i++) {
      const a = rotationY + (i / 8) * Math.PI * 2;
      const h = ctx.heights.sample(x + Math.cos(a) * rr, z + Math.sin(a) * rr);
      if (h < min) min = h;
    }
  }
  const height = Math.max(1, v.bounds.max[1]) * scale;
  // buildings/landmarks sit on flattened ground (small drop is enough); trees only ever sink their root flare
  const cap = v.category === "vegetation" ? 1.5 : v.category === "landmark" ? 1.5 : 1.2;
  const maxExtra = Math.min(cap, Math.max(0.5, Math.min(height * 0.3, r * 0.9)));
  const drop = Math.min(center - min, maxExtra) * (1 - conform);
  return center - drop - sink;
}

/** How much a placement follows the terrain normal: 1 = flush with the slope, 0 = always upright. */
function conformFactor(p: Placement, v: PrefabVariant): number {
  if (p.category === "building" || p.category === "landmark") return 0;
  if (p.category === "rock" || p.category === "path") return 1;
  if (p.category === "prop") return v.tags.includes("ambience") || v.tags.includes("glow") || v.tags.includes("wall") || v.tags.includes("field") || v.tags.includes("docks") ? 0 : 1;
  if (p.category === "vegetation") {
    if (v.tags.includes("tree") || v.tags.includes("giant")) return 0.3;
    return 0.85;
  }
  return 0;
}

/** Unit terrain normal at (x, z) from central differences over `r` studs. */
function terrainNormal(ctx: GenContext, x: number, z: number, r: number): [number, number, number] {
  const dx = (ctx.heights.sample(x + r, z) - ctx.heights.sample(x - r, z)) / (2 * r);
  const dz = (ctx.heights.sample(x, z + r) - ctx.heights.sample(x, z - r)) / (2 * r);
  const len = Math.hypot(dx, 1, dz);
  return [-dx / len, 1 / len, -dz / len];
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
export function requiredPrefabs(spec: WorldSpec, style?: StyleBible): string[] {
  const ids = new Set<string>();
  for (const s of spec.vegetation.species) ids.add(SPECIES_PREFAB[s]);
  // buildings for every settlement type + kit props + kit vegetation
  for (const id of ["house", "house_large", "shop_building", "apartment_block", "skyscraper"]) ids.add(id);
  const kits = new Set<string>([...spec.props.sets, ...(style?.kits.props ?? [])]);
  for (const kit of kits) for (const id of PROP_KIT_PREFABS[kit as keyof typeof PROP_KIT_PREFABS] ?? []) ids.add(id);
  if (style) for (const [sp] of VEGETATION_KIT_SPECIES[style.kits.vegetation] ?? []) ids.add(SPECIES_PREFAB[sp] ?? sp);
  for (const base of ["grass", "bush", "fern", "flower", "small_mushroom", "log", "boulder", "rock_cluster", "stone", "cliff_block", "cottage", "ruin_wall", "ruin_arch", "well", "bridge", "fence", "stone_path_slab", "lantern_post", "crate", "barrel", "bench", "signpost", "campfire", "cart_wheel", "gravestone", "crystal_cluster", "wisp", "tent", "hay_bale", "cart", "firefly_swarm", "mist_patch", "reeds", "lily_pad", "stone_wall", "market_stall", "lantern_string", "waterfall", "crop_plot", "flower_patch"]) ids.add(base);
  for (const l of spec.landmarks) ids.add(LANDMARK_PREFAB[l.type].prefab);
  // settlement dressing: walls & gates (when the style has a wall kit), fields, piers, road markings
  if (style && style.environment.walls !== "none") for (const id of ["town_wall", "gate_tower"]) ids.add(id);
  for (const id of ["pier", "farm_field", "road_stripe", "crosswalk", "kerb", "dead_tree", "rowboat", "dock_post"]) ids.add(id);
  if (spec.landmarks.some((l) => l.type === "cave")) for (const id of ["treasure_chest", "torch_post", "small_mushroom", "crystal_cluster"]) ids.add(id);
  return [...ids].filter((id) => !!PREFAB_INDEX[id]);
}

/** Regenerate specific layers on top of a previous bake. */
export function regenerateLayers(spec: WorldSpec, style: StyleBible | undefined, previous: WorldBake, layers: GenLayer[], options: Omit<GenerateOptions, "previous" | "regenerate"> = {}): WorldBake {
  return generateWorld(spec, style, { ...options, previous, regenerate: layers });
}

export type { PrefabVariant };
