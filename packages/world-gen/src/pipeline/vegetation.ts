import { clamp, deriveSeed, smoothstep, type BiomeId, type Placement, type VegetationSpecies } from "@worldforge/core";
import { Rng } from "@worldforge/core";
import { Simplex2D, Worley2D } from "../noise";
import { SpatialHash } from "../grid";
import { VEGETATION_KIT_SPECIES } from "@worldforge/prefabs";
import { biomeAt, distanceToEdge, isWaterAt, layerFor, progress, settleOnGround, slopeAtWorld, type GenContext } from "../context";

/** Species mix per biome: [species, weight]. Filtered by spec.vegetation.species. */
const BIOME_TREES: Record<BiomeId, [VegetationSpecies, number][]> = {
  dark_forest: [["pine", 0.35], ["round_tree", 0.35], ["dead_tree", 0.15], ["giant_mushroom", 0.15], ["willow", 0.05]],
  forest: [["round_tree", 0.5], ["pine", 0.3], ["birch", 0.15], ["dead_tree", 0.05]],
  pine_forest: [["pine", 0.85], ["dead_tree", 0.1], ["birch", 0.05]],
  mushroom_grove: [["giant_mushroom", 0.6], ["dead_tree", 0.2], ["round_tree", 0.15], ["willow", 0.05]],
  meadow: [["round_tree", 0.5], ["birch", 0.35], ["pine", 0.15]],
  swamp: [["willow", 0.4], ["dead_tree", 0.35], ["giant_mushroom", 0.25]],
  rocky: [["pine", 0.6], ["dead_tree", 0.4]],
  highlands: [["pine", 0.7], ["birch", 0.2], ["dead_tree", 0.1]],
  desert: [["cactus", 0.75], ["palm", 0.1], ["dead_tree", 0.15]],
  snow: [["pine", 0.9], ["dead_tree", 0.1]],
  beach: [["palm", 0.9], ["bush", 0.1]],
  ruins_field: [["dead_tree", 0.5], ["round_tree", 0.3], ["birch", 0.2]],
  urban: [["round_tree", 0.7], ["birch", 0.3]],
  wasteland: [["dead_tree", 0.5], ["burnt_tree", 0.35], ["cactus", 0.15]],
  alien: [["alien_tree", 0.7], ["giant_mushroom", 0.3]],
  moon: [],
  tundra: [["snow_pine", 0.6], ["dead_tree", 0.3], ["pine", 0.1]],
  jungle: [["jungle_tree", 0.6], ["palm", 0.2], ["bamboo", 0.2]],
  ocean_floor: [["coral", 0.6], ["seaweed", 0.4]],
  volcanic: [["dead_tree", 0.6], ["burnt_tree", 0.4]],
  savanna: [["acacia", 0.6], ["baobab", 0.2], ["cypress", 0.2]],
  farmland: [["round_tree", 0.6], ["birch", 0.3], ["cypress", 0.1]],
};

const BIOME_UNDERGROWTH: Record<BiomeId, [VegetationSpecies, number][]> = {
  dark_forest: [["fern", 0.35], ["bush", 0.25], ["small_mushroom", 0.25], ["grass", 0.1], ["log", 0.05]],
  forest: [["bush", 0.35], ["grass", 0.3], ["fern", 0.2], ["flower", 0.1], ["log", 0.05]],
  pine_forest: [["bush", 0.3], ["fern", 0.25], ["grass", 0.25], ["small_mushroom", 0.1], ["log", 0.1]],
  mushroom_grove: [["small_mushroom", 0.55], ["fern", 0.25], ["grass", 0.1], ["log", 0.1]],
  meadow: [["grass", 0.45], ["flower", 0.35], ["bush", 0.2]],
  swamp: [["fern", 0.4], ["small_mushroom", 0.3], ["grass", 0.2], ["log", 0.1]],
  rocky: [["grass", 0.6], ["bush", 0.4]],
  highlands: [["grass", 0.6], ["bush", 0.3], ["flower", 0.1]],
  desert: [["bush", 0.5], ["grass", 0.5]],
  snow: [["bush", 0.7], ["grass", 0.3]],
  beach: [["grass", 0.6], ["bush", 0.4]],
  ruins_field: [["grass", 0.4], ["bush", 0.3], ["fern", 0.2], ["small_mushroom", 0.1]],
  urban: [["bush", 0.6], ["flower", 0.4]],
  wasteland: [["grass", 0.6], ["bush", 0.4]],
  alien: [["small_mushroom", 0.5], ["fern", 0.3], ["bush", 0.2]],
  moon: [],
  tundra: [["grass", 0.6], ["bush", 0.4]],
  jungle: [["fern", 0.5], ["bush", 0.3], ["flower", 0.2]],
  ocean_floor: [["seaweed", 0.7], ["coral", 0.3]],
  volcanic: [["grass", 0.5], ["bush", 0.5]],
  savanna: [["grass", 0.7], ["bush", 0.3]],
  farmland: [["grass", 0.5], ["flower", 0.3], ["bush", 0.2]],
};

const VEG_LEVEL: Record<string, number> = { none: 0, sparse: 0.28, medium: 0.6, dense: 1.0 };

/** Canopy species for a biome, blended with the style's vegetation kit (kit species win 65/35 when both exist). */
function treeMix(ctx: GenContext, biome: BiomeId, allowed: Set<VegetationSpecies>): [VegetationSpecies, number][] {
  const kit = VEGETATION_KIT_SPECIES[ctx.style.kits.vegetation] ?? [];
  const kitTrees = kit.filter(([sp]) => allowed.has(sp) && !UNDERGROWTH.has(sp));
  const biomeTrees = BIOME_TREES[biome].filter(([sp]) => allowed.has(sp));
  if (ctx.style.kits.vegetation === "none") return [];
  if (kitTrees.length === 0) return biomeTrees;
  if (biomeTrees.length === 0) return kitTrees;
  const out = new Map<VegetationSpecies, number>();
  for (const [sp, w] of kitTrees) out.set(sp, (out.get(sp) ?? 0) + w * 0.65);
  for (const [sp, w] of biomeTrees) out.set(sp, (out.get(sp) ?? 0) + w * 0.35);
  return [...out.entries()];
}
const UNDERGROWTH = new Set<VegetationSpecies>(["bush", "fern", "grass", "flower", "log", "small_mushroom", "seaweed"]);

/** Prefab id for a species. */
export const SPECIES_PREFAB: Record<VegetationSpecies, string> = {
  pine: "pine_tree",
  round_tree: "round_tree",
  dead_tree: "dead_tree",
  willow: "willow",
  birch: "birch",
  giant_mushroom: "giant_mushroom",
  small_mushroom: "small_mushroom",
  bush: "bush",
  fern: "fern",
  grass: "grass",
  flower: "flower",
  log: "log",
  cactus: "cactus",
  palm: "palm",
  jungle_tree: "jungle_tree",
  baobab: "baobab",
  alien_tree: "alien_tree",
  bamboo: "bamboo",
  cherry_tree: "cherry_tree",
  burnt_tree: "burnt_tree",
  candy_tree: "candy_tree",
  coral: "coral",
  seaweed: "seaweed",
  snow_pine: "snow_pine",
  acacia: "acacia",
  cypress: "cypress",
};

/**
 * Stage 12: vegetation.
 * Bridson Poisson-disk candidates → density acceptance (biome × spec × style × cluster noise × exclusions)
 * → species by biome → scale/rotation variation → layer assignment.
 */
export function placeVegetation(ctx: GenContext): void {
  const { spec, style } = ctx;
  const rng = new Rng(deriveSeed(ctx.seed, "vegetation"));
  const cluster = new Simplex2D(deriveSeed(ctx.seed, "veg-cluster"));
  const clearings = new Worley2D(deriveSeed(ctx.seed, "veg-clearings"));
  // the spec's species plus the style kit's species (a "candy" or "alien" style always gets its flora)
  const allowed = new Set<VegetationSpecies>([...spec.vegetation.species, ...(VEGETATION_KIT_SPECIES[style.kits.vegetation] ?? []).map(([sp]) => sp)]);
  const globalDensity = spec.vegetation.density * (0.5 + style.vegetationDensity * 0.9) * (ctx.islands ? 0.45 : 1);
  const hash = new SpatialHash<{ position: [number, number, number]; radius: number }>(32);
  for (const o of ctx.occupants) hash.insert({ position: o.position, radius: o.radius });
  const lockedPrev = ctx.previous?.placements.filter((p) => p.locked && p.category === "vegetation") ?? [];
  for (const p of lockedPrev) {
    ctx.placements.push({ ...p });
    hash.insert({ position: p.position, radius: 4 });
  }

  const spawnClear = 42;
  const edgeMargin = 6;

  const densityAt = (x: number, z: number, biome: BiomeId, big: boolean): number => {
    const b = spec.biomes.find((bb) => bb.id === biome);
    const level = VEG_LEVEL[b?.vegetation ?? "medium"] ?? 0.6;
    if (level === 0) return 0;
    const cl = (cluster.fbm(x / 95, z / 95, 3) + 1) * 0.5;
    const clearing = clearings.f1(x / 140, z / 140);
    const clusterMix = spec.vegetation.clustering;
    let d = level * globalDensity;
    d *= 1 - clusterMix + clusterMix * smoothstep(0.25, 0.75, cl) * 1.6;
    d *= 1 - clusterMix * 0.9 * (1 - smoothstep(0.08, 0.3, clearing)); // clearings
    // exclusions
    const rd = ctx.roadDistance.sample(x, z);
    if (rd < (big ? 5 : 1.5)) return 0;
    if (big) d *= smoothstep(4, 14, rd);
    const wd = ctx.waterDistance.sample(x, z);
    if (wd < (big ? 3 : 1)) return 0;
    const s = slopeAtWorld(ctx, x, z);
    if (s > (big ? 0.7 : 0.85)) return 0;
    d *= 1 - smoothstep(0.45, 0.7, s) * 0.8;
    const ds = Math.hypot(x - ctx.spawn.position[0], z - ctx.spawn.position[2]);
    if (big && ds < spawnClear) return 0;
    if (big) d *= smoothstep(spawnClear, spawnClear + 30, ds);
    // settlements sit in a clearing: no trees inside, thinning ring around (houses stay readable)
    for (const site of ctx.sites) {
      const dv = Math.hypot(x - site.center[0], z - site.center[1]);
      if (big && dv < site.radius * 0.95) return 0;
      if (big) d *= smoothstep(site.radius * 0.95, site.radius * 1.5, dv) * 0.85 + 0.15 * smoothstep(site.radius * 1.5, site.radius * 2, dv);
      else d *= 0.55 + 0.45 * smoothstep(site.radius * 0.5, site.radius * 1.1, dv);
    }
    return clamp(d, 0, 1);
  };

  // ---- pass 1: trees & giant mushrooms (big)
  progress(ctx, "vegetation:trees", 0);
  const bigR = 9 - style.vegetationDensity * 2.5;
  const treeCandidates = poissonDisk(ctx, rng, bigR);
  let treeCount = 0;
  for (const [x, z] of treeCandidates) {
    if (distanceToEdge(ctx, x, z) < edgeMargin) continue;
    if (isWaterAt(ctx, x, z)) continue;
    const biome = biomeAt(ctx, x, z);
    const d = densityAt(x, z, biome, true);
    if (d <= 0 || rng.next() > d) continue;
    const mix = treeMix(ctx, biome, allowed);
    if (mix.length === 0) continue;
    let species = rng.weighted(mix.map(([item, weight]) => ({ item, weight })));
    // giant mushrooms controlled by the spec knob
    if (species === "giant_mushroom" && rng.next() > spec.vegetation.giantMushrooms * 1.5) species = mix.find(([sp]) => sp !== "giant_mushroom")?.[0] ?? species;
    else if (species !== "giant_mushroom" && allowed.has("giant_mushroom") && rng.chance(spec.vegetation.giantMushrooms * 0.18 * (biome === "dark_forest" || biome === "mushroom_grove" || biome === "swamp" ? 1 : 0.2))) species = "giant_mushroom";
    const prefab = SPECIES_PREFAB[species];
    const variants = ctx.prefabs[prefab];
    if (!variants || variants.length === 0) continue;
    const vi = rng.int(0, variants.length - 1);
    const v = variants[vi]!;
    const scaleBase = rng.range(style.tree.scale);
    const sizeVar = 1 + (rng.next() * 2 - 1) * spec.vegetation.sizeVariation * 0.45;
    // background trees are larger for silhouettes
    const edgeD = distanceToEdge(ctx, x, z);
    const bg = 1 + (1 - smoothstep(60, 260, edgeD)) * 0.35;
    const scale = clamp(scaleBase * sizeVar * bg * (species === "giant_mushroom" ? 0.7 : 1), 0.55, 3.2);
    // a trunk must meet the ground: step away from a terrace lip or cliff edge, else skip the tree
    const trunk = Math.max(1.5, (v.baseRadius ?? 0) * scale);
    const at = settleOnGround(ctx, x, z, trunk, Math.min(4, Math.max(2.2, trunk)));
    if (!at) continue;
    const tx = at[0];
    const tz = at[1];
    // stepping off the edge may have walked into a road, the water or a settlement: re-run the gate
    if (isWaterAt(ctx, tx, tz) || densityAt(tx, tz, biome, true) <= 0) continue;
    const radius = v.footprintRadius * scale * 0.55;
    if (hash.overlaps(tx, tz, radius, 1.5)) continue;
    const y = ctx.heights.sample(tx, tz) - v.sinkDepth * scale;
    const pos: [number, number, number] = [tx, y, tz];
    hash.insert({ position: pos, radius });
    ctx.placements.push({
      id: `veg_${treeCount++}`,
      prefab,
      variant: vi,
      category: "vegetation",
      position: pos,
      rotationY: rng.float(0, Math.PI * 2),
      scale,
      layer: layerFor(ctx, tx, tz, true),
      biome,
      importance: species === "giant_mushroom" ? 6 : 4 + scale,
    });
  }

  // ---- pass 2: undergrowth (small) — denser near roads/spawn (foreground detail)
  progress(ctx, "vegetation:undergrowth", 0.6);
  const smallR = 4.2 - style.scaleRules.foregroundDetail * 0.8;
  const smallCandidates = poissonDisk(ctx, rng, smallR);
  let smallCount = 0;
  for (const [x, z] of smallCandidates) {
    if (distanceToEdge(ctx, x, z) < edgeMargin) continue;
    if (isWaterAt(ctx, x, z)) continue;
    const biome = biomeAt(ctx, x, z);
    let d = densityAt(x, z, biome, false) * 0.75 * (style.kits.vegetation === "none" ? 0.08 : 1);
    const rd = ctx.roadDistance.sample(x, z);
    const ds = Math.hypot(x - ctx.spawn.position[0], z - ctx.spawn.position[2]);
    const fg = Math.max(1 - smoothstep(2, 26, rd), 1 - smoothstep(6, 40, ds));
    d = d * (0.5 + fg * 0.9) * style.scaleRules.foregroundDetail;
    // in the background undergrowth is invisible: cull heavily
    const edgeD = distanceToEdge(ctx, x, z);
    d *= smoothstep(40, 160, edgeD);
    if (d <= 0 || rng.next() > d) continue;
    const mix = BIOME_UNDERGROWTH[biome].filter(([sp]) => allowed.has(sp) || sp === "grass");
    if (mix.length === 0) continue;
    const species = rng.weighted(mix.map(([item, weight]) => ({ item, weight })));
    const prefab = SPECIES_PREFAB[species];
    const variants = ctx.prefabs[prefab];
    if (!variants || variants.length === 0) continue;
    const vi = rng.int(0, variants.length - 1);
    const v = variants[vi]!;
    const scale = clamp(rng.float(0.8, 1.35) * (1 + (rng.next() * 2 - 1) * spec.vegetation.sizeVariation * 0.3), 0.5, 2);
    const base = Math.max(1.5, (v.baseRadius ?? 0) * scale);
    const spot = settleOnGround(ctx, x, z, base, Math.min(4, Math.max(2.2, base)), 2);
    if (!spot) continue;
    const ux = spot[0];
    const uz = spot[1];
    if (isWaterAt(ctx, ux, uz) || densityAt(ux, uz, biome, false) <= 0) continue;
    const radius = v.footprintRadius * scale * 0.5;
    if (hash.overlaps(ux, uz, radius, 0.3)) continue;
    const y = ctx.heights.sample(ux, uz) - v.sinkDepth * scale;
    const pos: [number, number, number] = [ux, y, uz];
    if (species === "log" || species === "bush") hash.insert({ position: pos, radius });
    ctx.placements.push({
      id: `ug_${smallCount++}`,
      prefab,
      variant: vi,
      category: "vegetation",
      position: pos,
      rotationY: rng.float(0, Math.PI * 2),
      scale,
      layer: layerFor(ctx, ux, uz, false),
      biome,
      importance: 1 + fg * 2 + (species === "small_mushroom" ? 0.5 : 0),
    });
  }
  progress(ctx, "vegetation:done", 1);
}

/** Bridson Poisson-disk sampling over the whole world (world coords). */
export function poissonDisk(ctx: GenContext, rng: Rng, r: number, k = 12): [number, number][] {
  const cell = r / Math.SQRT2;
  const gw = Math.ceil(ctx.worldW / cell);
  const gd = Math.ceil(ctx.worldD / cell);
  const grid = new Int32Array(gw * gd).fill(-1);
  const pts: [number, number][] = [];
  const active: number[] = [];
  const ox = ctx.origin[0];
  const oz = ctx.origin[1];
  const push = (x: number, z: number) => {
    const i = pts.length;
    pts.push([x, z]);
    active.push(i);
    grid[Math.floor((z - oz) / cell) * gw + Math.floor((x - ox) / cell)] = i;
  };
  push(ox + rng.next() * ctx.worldW, oz + rng.next() * ctx.worldD);
  while (active.length > 0) {
    const ai = rng.int(0, active.length - 1);
    const p = pts[active[ai]!]!;
    let found = false;
    for (let t = 0; t < k; t++) {
      const a = rng.next() * Math.PI * 2;
      const d = r * (1 + rng.next());
      const x = p[0] + Math.cos(a) * d;
      const z = p[1] + Math.sin(a) * d;
      if (x < ox || z < oz || x >= ox + ctx.worldW || z >= oz + ctx.worldD) continue;
      const gx = Math.floor((x - ox) / cell);
      const gz = Math.floor((z - oz) / cell);
      let ok = true;
      for (let dz = -2; dz <= 2 && ok; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = gx + dx;
          const nz = gz + dz;
          if (nx < 0 || nz < 0 || nx >= gw || nz >= gd) continue;
          const j = grid[nz * gw + nx]!;
          if (j < 0) continue;
          const q = pts[j]!;
          if (Math.hypot(q[0] - x, q[1] - z) < r) {
            ok = false;
            break;
          }
        }
      }
      if (ok) {
        push(x, z);
        found = true;
        break;
      }
    }
    if (!found) {
      active[ai] = active[active.length - 1]!;
      active.pop();
    }
  }
  return pts;
}
