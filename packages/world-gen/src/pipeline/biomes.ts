import { TERRAIN_MATERIAL_INDEX, clamp, deriveSeed, type BiomeId, type TerrainMaterial } from "@worldforge/core";
import { Simplex2D } from "../noise";
import { progress, type GenContext } from "../context";

/** Default elevation / moisture preferences per biome (0..1). */
const BIOME_PREFS: Record<BiomeId, { elevation: [number, number]; moisture: [number, number]; surface: TerrainMaterial; alt: TerrainMaterial }> = {
  dark_forest: { elevation: [0.15, 0.6], moisture: [0.45, 1], surface: "LeafyGrass", alt: "Ground" },
  forest: { elevation: [0.1, 0.65], moisture: [0.35, 0.85], surface: "Grass", alt: "LeafyGrass" },
  pine_forest: { elevation: [0.35, 0.85], moisture: [0.3, 0.8], surface: "LeafyGrass", alt: "Ground" },
  mushroom_grove: { elevation: [0.05, 0.45], moisture: [0.6, 1], surface: "Mud", alt: "LeafyGrass" },
  meadow: { elevation: [0.05, 0.45], moisture: [0.2, 0.6], surface: "Grass", alt: "Grass" },
  swamp: { elevation: [0, 0.3], moisture: [0.7, 1], surface: "Mud", alt: "Ground" },
  rocky: { elevation: [0.5, 1], moisture: [0, 0.5], surface: "Rock", alt: "Slate" },
  highlands: { elevation: [0.6, 1], moisture: [0.2, 0.7], surface: "Grass", alt: "Rock" },
  desert: { elevation: [0, 0.7], moisture: [0, 0.3], surface: "Sand", alt: "Sandstone" },
  snow: { elevation: [0.7, 1], moisture: [0.3, 1], surface: "Snow", alt: "Ice" },
  beach: { elevation: [0, 0.15], moisture: [0.5, 1], surface: "Sand", alt: "Sand" },
  ruins_field: { elevation: [0.1, 0.6], moisture: [0.2, 0.7], surface: "Ground", alt: "Grass" },
  urban: { elevation: [0, 0.4], moisture: [0, 1], surface: "Pavement", alt: "Asphalt" },
  wasteland: { elevation: [0, 0.6], moisture: [0, 0.4], surface: "Ground", alt: "Sand" },
  alien: { elevation: [0.1, 0.8], moisture: [0.2, 1], surface: "Slate", alt: "Basalt" },
  moon: { elevation: [0, 1], moisture: [0, 1], surface: "Slate", alt: "Rock" },
  tundra: { elevation: [0.2, 0.8], moisture: [0.2, 0.7], surface: "Snow", alt: "Ground" },
  jungle: { elevation: [0.05, 0.6], moisture: [0.6, 1], surface: "LeafyGrass", alt: "Mud" },
  ocean_floor: { elevation: [0, 0.5], moisture: [0, 1], surface: "Sand", alt: "Rock" },
  volcanic: { elevation: [0.4, 1], moisture: [0, 0.4], surface: "Basalt", alt: "Rock" },
  savanna: { elevation: [0.05, 0.5], moisture: [0.1, 0.45], surface: "Grass", alt: "Ground" },
  farmland: { elevation: [0.05, 0.4], moisture: [0.3, 0.7], surface: "Grass", alt: "Ground" },
};

export function getBiomePrefs(id: BiomeId) {
  return BIOME_PREFS[id];
}

/**
 * Stage 6: biome masks and terrain materials.
 * Each cell gets the biome with the best score (spec weight × elevation fit × moisture fit × noise),
 * then a material from the biome, overridden by slope (rock), water proximity (mud/sand) and water.
 */
export function generateBiomes(ctx: GenContext): void {
  const { spec, width, depth, cellSize, origin } = ctx;
  const n = new Simplex2D(deriveSeed(ctx.seed, "biomes"));
  const n2 = new Simplex2D(deriveSeed(ctx.seed, "biomes2"));
  const [minH, maxH] = ctx.heights.minMax();
  const range = Math.max(1, maxH - minH);
  const slope = ctx.heights.slopeGrid();
  const transition = ctx.style.biomeTransition;
  const biomes = spec.biomes.map((b, i) => ({ ...b, prefs: BIOME_PREFS[b.id], index: i, noiseOffset: i * 37.1 }));
  ctx.biomeIds = spec.biomes.map((b) => b.id);

  progress(ctx, "biomes", 0);
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const i = z * width + x;
      const wx = origin[0] + x * cellSize;
      const wz = origin[1] + z * cellSize;
      const h = (ctx.heights.data[i]! - minH) / range;
      const m = ctx.moisture.data[i]!;
      const wd = ctx.waterDistance.data[i]!;
      let best = 0;
      let bestScore = -Infinity;
      for (const b of biomes) {
        const el = b.elevation ?? b.prefs.elevation;
        const mo = b.moisture ?? b.prefs.moisture;
        const fitE = bandFit(h, el, 0.15 + transition * 0.2);
        const fitM = bandFit(m, mo, 0.2 + transition * 0.2);
        const noise = (n.fbm(wx / 260 + b.noiseOffset, wz / 260 - b.noiseOffset, 3) + 1) * 0.5;
        const score = (0.35 + b.weight) * (0.4 + fitE) * (0.4 + fitM) * (0.55 + noise * 0.9);
        if (score > bestScore) {
          bestScore = score;
          best = b.index;
        }
      }
      ctx.biomes[i] = best;

      // materials
      const b = biomes[best]!;
      const s = slope.data[i]!;
      const detail = n2.noise2(wx / 40, wz / 40);
      const patch = n2.fbm(wx / 18 + 50, wz / 18 - 50, 2); // fine moss / bare-earth patches
      let mat: TerrainMaterial = detail > 0.35 ? b.prefs.alt : b.prefs.surface;
      const forest = b.id === "dark_forest" || b.id === "forest" || b.id === "pine_forest" || b.id === "mushroom_grove";
      if (forest && patch > 0.45) mat = "Ground"; // bare earth under dense canopy
      else if (forest && patch < -0.5) mat = "LeafyGrass"; // moss
      else if ((b.id === "meadow" || b.id === "highlands") && patch > 0.55) mat = "LeafyGrass"; // lush tufts
      const sandy = b.id === "desert" || b.id === "beach";
      if (!Number.isNaN(ctx.water.data[i]!)) mat = "Water";
      else if (s > 0.85) mat = detail > 0.2 ? "Basalt" : "Rock";
      else if (s > 0.62) mat = detail > 0 ? "Rock" : "Slate";
      else if (s > 0.45 && detail > 0.3) mat = "Ground"; // scree / bare slope
      else if (wd < 3) mat = sandy ? "Sand" : detail > 0.1 ? "Sand" : "Mud"; // sandy banks with mud
      else if (wd < 9 && detail > -0.2) mat = sandy ? "Sand" : "Ground";
      else if (h > 0.9 && b.id !== "desert") mat = detail > 0 ? "Snow" : "Rock";
      ctx.materials[i] = TERRAIN_MATERIAL_INDEX[mat];
    }
  }
  progress(ctx, "biomes", 1);
}

function bandFit(v: number, band: [number, number], soft: number): number {
  const lo = Math.min(band[0], band[1]);
  const hi = Math.max(band[0], band[1]);
  if (v >= lo && v <= hi) return 1;
  const d = v < lo ? lo - v : v - hi;
  return clamp(1 - d / soft, 0, 1);
}
