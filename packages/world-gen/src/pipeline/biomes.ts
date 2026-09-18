import { TERRAIN_MATERIAL_INDEX, clamp, deriveSeed, type BiomeId, type TerrainMaterial } from "@worldforge/core";
import { Simplex2D } from "../noise";
import { progress, seaLevelOf, type GenContext } from "../context";

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
 * The world's climate: the weight-averaged centre of its biomes' moisture bands. A desert world lands
 * near 0.2, a jungle near 0.8 — and the moisture field is shifted onto it, so the biomes the client
 * asked for are the ones that actually fit. Without this every world drifted toward the biome whose
 * band covers the middle (meadow), and a 55%-desert spec came out 62% meadow, green.
 */
export function climateMoisture(spec: { biomes: { id: BiomeId; weight: number; moisture?: [number, number] }[] }): number {
  let sum = 0;
  let total = 0;
  for (const b of spec.biomes) {
    const band = b.moisture ?? BIOME_PREFS[b.id]?.moisture ?? [0.3, 0.7];
    sum += b.weight * (band[0] + band[1]) * 0.5;
    total += b.weight;
  }
  return total > 0 ? clamp(sum / total, 0, 1) : 0.5;
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
  const snowLine = ctx.style.environment.snowLine;
  const sea = seaLevelOf(spec);
  const arctic = ctx.style.kits.vegetation === "arctic";
  const beachMat: TerrainMaterial = arctic ? "Snow" : ctx.style.id === "alien_planet" ? "Slate" : "Sand";
  ctx.biomeIds = spec.biomes.map((b) => b.id);

  progress(ctx, "biomes", 0);
  // Which biome wins a cell: elevation fit × moisture fit × a per-biome noise field (the regions), times
  // a bias calibrated below so the *shares* come out as the spec asked. Winner-takes-all scoring is
  // spatially coherent but has no sense of proportion — the strongest biome used to swallow the map
  // (a 55/30/15 desert spec came out 96/3/1) and the small ones vanished.
  const bias = new Float64Array(biomes.length).fill(1);
  const pick = (i: number, wx: number, wz: number): number => {
    const h = (ctx.heights.data[i]! - minH) / range;
    const wd = ctx.waterDistance.data[i]!;
    // a bank, a lake shore or an oasis is wet whatever the climate: greener biomes win right there
    const m = clamp(ctx.moisture.data[i]! + (1 - Math.min(1, wd / 70)) * 0.28, 0, 1);
    let best = 0;
    let bestScore = -Infinity;
    for (const b of biomes) {
      const el = b.elevation ?? b.prefs.elevation;
      const mo = b.moisture ?? b.prefs.moisture;
      const fitE = bandFit(h, el, 0.15 + transition * 0.2);
      const fitM = bandFit(m, mo, 0.2 + transition * 0.2);
      const noise = (n.fbm(wx / 260 + b.noiseOffset, wz / 260 - b.noiseOffset, 3) + 1) * 0.5;
      const score = bias[b.index]! * (0.3 + b.weight * 0.9) * (0.4 + fitE) * (0.4 + fitM) * (0.55 + noise * 0.9);
      if (score > bestScore) {
        bestScore = score;
        best = b.index;
      }
    }
    return best;
  };
  // calibration: sample the grid, compare the shares with the requested weights, nudge the biases
  if (biomes.length > 1) {
    const stride = Math.max(1, Math.round(Math.min(width, depth) / 48));
    const totalWeight = biomes.reduce((a, b) => a + b.weight, 0) || 1;
    for (let pass = 0; pass < 10; pass++) {
      // a decreasing step: a fixed one oscillates (a biome overshoots, then the next pass overcorrects)
      const step = 0.55 / (1 + pass * 0.6);
      const share = new Float64Array(biomes.length);
      let n0 = 0;
      for (let z = 0; z < depth; z += stride) {
        for (let x = 0; x < width; x += stride) {
          const i = z * width + x;
          if (!Number.isNaN(ctx.water.data[i]!)) continue; // water cells carry no biome the player sees
          share[pick(i, origin[0] + x * cellSize, origin[1] + z * cellSize)]! += 1;
          n0++;
        }
      }
      if (n0 === 0) break;
      for (const b of biomes) {
        const want = b.weight / totalWeight;
        const got = share[b.index]! / n0;
        // move toward the target but stay gentle: a biome whose bands fit nowhere must not explode
        const ratio = clamp(want / Math.max(got, 0.002), 0.25, 4);
        bias[b.index] = clamp(bias[b.index]! * Math.pow(ratio, step), 0.02, 50);
      }
    }
  }
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const i = z * width + x;
      const wx = origin[0] + x * cellSize;
      const wz = origin[1] + z * cellSize;
      const h = (ctx.heights.data[i]! - minH) / range;
      const wd = ctx.waterDistance.data[i]!;
      const best = pick(i, wx, wz);
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
      const hAbs = ctx.heights.data[i]!;
      const seaShore = Number.isFinite(sea) && hAbs < sea + 5 && wd < 16 && !ctx.cliffMaterial;
      if (!Number.isNaN(ctx.water.data[i]!)) mat = "Water";
      else if (seaShore) mat = s > 0.7 ? "Rock" : beachMat; // beach ring around the ocean
      else if (s > 0.4 && ctx.cliffMaterial) {
        // mesa walls: brown earth with darker bands (stylized islands)
        mat = Math.floor((hAbs + detail * 4) / 7) % 3 === 1 ? "Mud" : ctx.cliffMaterial;
      } else if (s > 0.62) {
        // cliff faces read as bedded rock: material bands by height (wobbled by noise), darker on the steepest faces
        const band = Math.floor((hAbs + detail * 6) / 9) % 3;
        mat = s > 0.85 && detail > 0.25 ? "Basalt" : band === 0 ? "Rock" : band === 1 ? "Slate" : arctic ? "Rock" : "Limestone";
        // snow does lie on a slope: on a snowy or tundra summit only the sheer faces stay bare rock,
        // otherwise a "montagne enneigée" turns back into a grey mountain the moment it gets steep
        if ((b.id === "snow" || b.id === "tundra") && s < 0.82) mat = detail > -0.3 ? "Snow" : "Ice";
        if (mat === "Limestone" && (ctx.style.id === "alien_planet" || ctx.style.kits.biomes.includes("volcanic"))) mat = "Basalt";
      }
      else if (s > 0.45 && detail > 0.3 && !ctx.cliffMaterial) mat = b.id === "snow" ? "Snow" : "Ground"; // scree / bare slope
      // a bank in the snow is snow and ice, not sand and mud
      else if (wd < 3) mat = b.id === "snow" ? (detail > 0 ? "Ice" : "Snow") : sandy ? "Sand" : detail > 0.1 ? "Sand" : "Mud";
      else if (wd < 9 && detail > -0.2) mat = b.id === "snow" ? "Snow" : sandy ? "Sand" : "Ground";
      else if (h > snowLine && b.id !== "desert" && !ctx.cliffMaterial) mat = detail > 0 || h > snowLine + 0.05 ? "Snow" : "Rock"; // snow line (style-driven)
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
