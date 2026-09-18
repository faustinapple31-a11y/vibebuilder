import {
  clamp,
  colorDistance,
  sampleHeight,
  sampleSlope,
  type QAFix,
  type QAProblem,
  type QAReport,
  type QAScores,
  type StyleBible,
  type WorldBake,
  type WorldSpec,
} from "@worldforge/core";

/**
 * Visual Quality Critic — deterministic metrics over a WorldBake.
 * Scores each axis /10, lists problems and proposes machine-applicable fixes.
 * A vision agent can later merge its own scores (see mergeReports).
 */
export interface CriticOptions {
  /** Target vegetation coverage per 100×100 studs (defaults from spec density). */
  targetVegetationPer10k?: number;
}

export function critiqueBake(bake: WorldBake, spec: WorldSpec, style: StyleBible, _opts: CriticOptions = {}): QAReport {
  const problems: QAProblem[] = [];
  const fixes: QAFix[] = [];
  const s = bake.stats;

  // ---------------- composition
  let composition = 10;
  const focal = bake.landmarks.find((l) => l.role === "focal");
  if (!focal) {
    composition -= 3;
    problems.push({ id: "no_focal_landmark", severity: "high", message: "no focal landmark: the scene has no point of interest", layer: "landmarks" });
    fixes.push({ type: "spec_patch", path: "landmarks", op: "add", value: { id: "focal_tree", type: "giant_tree", role: "focal", preferredZone: "hill" } });
  } else {
    const visibleFrom = focal.viewCorridors.filter((c) => c.visible).length;
    if (focal.viewCorridors.length > 0 && visibleFrom === 0) {
      composition -= 2.5;
      problems.push({ id: "focal_not_visible", severity: "high", message: "focal landmark is not visible from the settlement/spawn (no view corridor)", layer: "landmarks", location: focal.position });
      fixes.push({ type: "regenerate", layers: ["landmarks"], newSeed: true });
    }
  }
  const total = Math.max(1, bake.placements.length);
  const fg = s.layerCounts.foreground / total;
  const bg = s.layerCounts.background / total;
  if (fg < 0.08) {
    composition -= 2;
    problems.push({ id: "foreground_empty", severity: "medium", message: `foreground is empty (${(fg * 100).toFixed(0)}% of placements near paths/spawn)`, layer: "composition" });
    fixes.push({ type: "spec_patch", path: "props.density", op: "set", value: clamp(spec.props.density + 0.2, 0, 1) });
  }
  // silhouettes stand in the border band, and on an island or an archipelago most of that band is open
  // sea: expect them in proportion to the land there (sea stacks aside, nothing can be planted on water)
  const t = bake.terrain;
  const bandCells = Math.max(1, Math.floor(Math.min(t.width, t.depth) * 0.13));
  let bandLand = 0;
  let bandTotal = 0;
  for (let z = 0; z < t.depth; z++) {
    for (let x = 0; x < t.width; x++) {
      if (x >= bandCells && x < t.width - bandCells && z >= bandCells && z < t.depth - bandCells) continue;
      bandTotal++;
      if (Number.isNaN(t.water[z * t.width + x]!)) bandLand++;
    }
  }
  const bandLandFraction = bandTotal > 0 ? bandLand / bandTotal : 1;
  if (bg < 0.08 * Math.max(0.25, bandLandFraction)) {
    composition -= 1.5;
    problems.push({ id: "background_empty", severity: "medium", message: `background has too few silhouettes (${(bg * 100).toFixed(0)}% of placements in the edge band, ${(bandLandFraction * 100).toFixed(0)}% of it is land)`, layer: "composition" });
  }
  const plazaProps = new Set(["well", "campfire", "fountain", "marble_statue", "totem", "small_shrine", "tiki_statue", "gingerbread_man", "sphinx_statue", "hologram", "energy_pylon", "flag_pole", "burning_barrel", "water_tower"]);
  const villageLandmark = bake.landmarks.some((l) => l.type === "well" || l.type === "statue" || l.type === "windmill" || l.type === "fountain" || l.type === "church" || l.type === "gas_station" || l.type === "water_tower") || bake.placements.some((p) => plazaProps.has(p.prefab)) || bake.zones.some((z) => z.kind === "gameplay");
  if (spec.settlements.length > 0 && !villageLandmark) {
    composition -= 1;
    problems.push({ id: "village_no_landmark", severity: "medium", message: "village lacks a central landmark (well, statue, campfire)", layer: "buildings" });
    fixes.push({ type: "spec_patch", path: "props.sets", op: "add", value: "village" });
  }

  // ---------------- terrain
  let terrain = 10;
  if (s.heightStd < 8) {
    terrain -= 4;
    problems.push({ id: "terrain_flat", severity: "high", message: `terrain too flat (height σ ${s.heightStd.toFixed(1)} studs)`, layer: "terrain" });
    fixes.push({ type: "spec_patch", path: "terrain.relief", op: "set", value: clamp(spec.terrain.relief + 0.25, 0, 1) });
  } else if (s.heightStd < 16) {
    terrain -= 1.5;
    problems.push({ id: "terrain_soft", severity: "low", message: `terrain relief is mild (σ ${s.heightStd.toFixed(1)} studs)`, layer: "terrain" });
  }
  if (s.slopeMean > 0.55) {
    terrain -= 2;
    problems.push({ id: "terrain_too_steep", severity: "medium", message: `terrain is very steep on average (${((s.slopeMean * 180) / Math.PI).toFixed(0)}°)`, layer: "terrain" });
    fixes.push({ type: "spec_patch", path: "terrain.erosion", op: "set", value: clamp(spec.terrain.erosion + 0.2, 0, 1) });
  }
  if (spec.rivers.length > 0 && s.waterCoverage < 0.004) {
    terrain -= 1.5;
    problems.push({ id: "river_missing", severity: "medium", message: "a river was requested but almost no water was carved", layer: "water" });
    fixes.push({ type: "regenerate", layers: ["water"], newSeed: true });
  }
  // ocean features: an island needs real sea around it (and land inside), a coast a real shoreline
  const island = spec.terrain.features.find((f) => f.type === "island");
  const coast = spec.terrain.features.find((f) => f.type === "coast");
  if (island && s.waterCoverage < 0.12) {
    terrain -= 2;
    problems.push({ id: "island_no_ocean", severity: "high", message: `island requested but only ${(s.waterCoverage * 100).toFixed(0)}% of the map is water`, layer: "terrain" });
    fixes.push({ type: "spec_patch", path: "terrain.features", op: "set", value: spec.terrain.features.map((f) => (f.type === "island" ? { ...f, radius: Math.max(0.2, f.radius - 0.08) } : f)) });
  }
  if (island && s.waterCoverage > 0.8) {
    terrain -= 3;
    problems.push({ id: "island_drowned", severity: "critical", message: "the island is almost entirely under water", layer: "terrain" });
    fixes.push({ type: "spec_patch", path: "terrain.features", op: "set", value: spec.terrain.features.map((f) => (f.type === "island" ? { ...f, radius: Math.min(0.6, f.radius + 0.1) } : f)) });
  }
  if (coast && s.waterCoverage < 0.05) {
    terrain -= 1.5;
    problems.push({ id: "coast_no_sea", severity: "medium", message: "a coast was requested but the sea did not form", layer: "terrain" });
    fixes.push({ type: "spec_patch", path: "terrain.features", op: "set", value: spec.terrain.features.map((f) => (f.type === "coast" ? { ...f, reach: Math.min(0.6, f.reach + 0.08) } : f)) });
  }
  // road slopes
  for (const road of bake.paths.filter((p) => p.kind === "road")) {
    let steep = 0;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1]!;
      const b = road.points[i]!;
      const dh = Math.abs(sampleHeight(bake.terrain, a[0], a[1]) - sampleHeight(bake.terrain, b[0], b[1]));
      const run = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      if (bake.terrain.mode === "parts" && dh <= 8.5) continue; // one terrace step = stairs
      if (Math.atan2(dh, run) > 0.65) steep++;
    }
    if (steep > road.points.length * 0.08) {
      terrain -= 1;
      problems.push({ id: `road_steep_${road.id}`, severity: "medium", message: `road "${road.id}" has ${steep} steep segments (> 37°)`, layer: "roads" });
    }
  }

  // ---------------- vegetation
  let vegetation = 10;
  // expected cover per 10k studs², over the ground that can actually grow anything: plants do not grow
  // on the sea (an archipelago is mostly water), in a biome set to `none` (a moon, a wasteland) or in a
  // style with no vegetation kit (a space station gets planters, not a forest)
  const VEG_LEVEL: Record<string, number> = { none: 0, sparse: 0.28, medium: 0.6, dense: 1 };
  const biomeWeight = spec.biomes.reduce((a, b) => a + b.weight, 0) || 1;
  const biomeLevel = spec.biomes.reduce((a, b) => a + b.weight * (VEG_LEVEL[b.vegetation] ?? 0.6), 0) / biomeWeight;
  const land = Math.max(0.1, 1 - s.waterCoverage);
  const kitless = style.kits.vegetation === "none" ? 0.1 : 1;
  const target = spec.vegetation.density * (0.5 + style.vegetationDensity * 0.9) * 32 * land * (0.45 + biomeLevel * 0.9) * kitless;
  const ratio = s.vegetationCoverage / Math.max(1, target);
  if (target >= 1 && ratio < 0.5) {
    vegetation -= 3;
    problems.push({ id: "vegetation_sparse", severity: "medium", message: `vegetation is sparse (${s.vegetationCoverage.toFixed(1)} / 100×100 studs, target ≈ ${target.toFixed(1)})`, layer: "vegetation" });
    fixes.push({ type: "spec_patch", path: "vegetation.density", op: "set", value: clamp(spec.vegetation.density + 0.2, 0, 1) });
  }
  const treePrefabs = ["pine_tree", "round_tree", "dead_tree", "willow", "birch", "giant_mushroom", "palm", "cactus"];
  let usedVariants = 0;
  let availVariants = 0;
  let treeCount = 0;
  for (const p of treePrefabs) {
    if (s.variantsAvailable[p]) {
      availVariants += s.variantsAvailable[p]!;
      usedVariants += s.variantsUsed[p] ?? 0;
    }
  }
  for (const p of bake.placements) if (treePrefabs.includes(p.prefab)) treeCount++;
  if (treeCount > 40 && usedVariants < availVariants * 0.6) {
    vegetation -= 2;
    problems.push({ id: "vegetation_repetitive", severity: "medium", message: `vegetation too repetitive (variants used ${usedVariants}/${availVariants})`, layer: "vegetation" });
    fixes.push({ type: "regenerate", layers: ["vegetation"], newSeed: true });
  }
  const speciesUsed = new Set(bake.placements.filter((p) => treePrefabs.includes(p.prefab)).map((p) => p.prefab)).size;
  if (treeCount > 40 && speciesUsed < 2) {
    vegetation -= 1.5;
    problems.push({ id: "vegetation_monoculture", severity: "low", message: "only one tree species is used", layer: "vegetation" });
    fixes.push({ type: "spec_patch", path: "vegetation.species", op: "add", value: "dead_tree" });
  }
  // scale variation
  const scales = bake.placements.filter((p) => treePrefabs.includes(p.prefab)).map((p) => p.scale);
  if (scales.length > 20) {
    const mean = scales.reduce((a, b) => a + b, 0) / scales.length;
    const sd = Math.sqrt(scales.reduce((a, b) => a + (b - mean) ** 2, 0) / scales.length);
    if (sd / mean < 0.12) {
      vegetation -= 1;
      problems.push({ id: "vegetation_uniform_scale", severity: "low", message: "tree sizes are too uniform", layer: "vegetation" });
      fixes.push({ type: "spec_patch", path: "vegetation.sizeVariation", op: "set", value: clamp(spec.vegetation.sizeVariation + 0.25, 0, 1) });
    }
  }
  // vegetation inside buildings
  const buildings = bake.placements.filter((p) => p.category === "building");
  let intrusions = 0;
  for (const b of buildings) {
    const r = (bake.prefabs[b.prefab]?.[b.variant]?.footprintRadius ?? 10) * b.scale * 0.8;
    for (const v of bake.placements) {
      if (v.category !== "vegetation" || !treePrefabs.includes(v.prefab)) continue;
      if (Math.hypot(v.position[0] - b.position[0], v.position[2] - b.position[2]) < r) intrusions++;
    }
  }
  if (intrusions > 0) {
    vegetation -= Math.min(3, intrusions * 0.5);
    problems.push({ id: "vegetation_in_buildings", severity: "high", message: `${intrusions} trees intersect buildings`, layer: "vegetation" });
    fixes.push({ type: "regenerate", layers: ["vegetation"], newSeed: false });
  }

  // ---------------- architecture
  let architecture = 10;
  if (spec.settlements.length > 0) {
    const houses = buildings.filter((p) => p.category === "building" && !p.id.startsWith("layout_") && p.prefab !== "well" && p.prefab !== "bridge");
    const wanted = spec.settlements.reduce((a, b) => a + b.buildings, 0);
    if (houses.length < wanted * 0.7) {
      architecture -= 2;
      problems.push({ id: "buildings_missing", severity: "medium", message: `only ${houses.length}/${wanted} buildings could be placed`, layer: "buildings" });
      fixes.push({ type: "regenerate", layers: ["buildings"], newSeed: true });
    }
    const hv = new Set(houses.map((p) => `${p.prefab}/${p.variant}`)).size;
    if (houses.length >= 4 && hv < Math.min(houses.length, 3)) {
      architecture -= 2;
      problems.push({ id: "buildings_identical", severity: "medium", message: "houses look identical (too few variants used)", layer: "buildings" });
    }
    // settlement dressing the style / spec calls for
    const dress = bake.placements.filter((p) => p.id.startsWith("dress_"));
    const wallSegments = dress.filter((p) => p.prefab === "town_wall").length;
    if (style.environment.walls !== "none" && spec.settlements.some((st) => st.type !== "camp" && st.type !== "outpost" && st.type !== "city_district") && wallSegments < 8) {
      architecture -= 1;
      problems.push({ id: "walls_missing", severity: "low", message: `the style has a ${style.environment.walls} wall kit but the settlement got ${wallSegments} wall segments`, layer: "buildings" });
    }
    if (spec.settlements.some((st) => st.type === "harbor") && !dress.some((p) => p.prefab === "pier")) {
      architecture -= 1;
      problems.push({ id: "harbor_no_pier", severity: "medium", message: "harbor settlement without a pier (no reachable shore)", layer: "buildings" });
      fixes.push({ type: "regenerate", layers: ["buildings"], newSeed: true });
    }
    if ((spec.settlements.some((st) => st.type === "farmstead") || spec.props.sets.includes("farm")) && !dress.some((p) => p.prefab === "farm_field")) {
      architecture -= 0.5;
      problems.push({ id: "fields_missing", severity: "low", message: "farm requested but no field could be placed (no flat ground near the settlement)", layer: "buildings" });
    }
    // slope under buildings
    let steep = 0;
    for (const b of buildings) {
      if (b.prefab === "bridge" || b.prefab === "ruin_wall" || b.prefab === "ruin_arch") continue;
      if (sampleSlope(bake.terrain, b.position[0], b.position[2]) > 0.25) steep++;
    }
    if (steep > 0) {
      architecture -= Math.min(3, steep);
      problems.push({ id: "buildings_on_slope", severity: "high", message: `${steep} buildings sit on slopes > 14°`, layer: "buildings" });
    }
  }

  // ---------------- asset consistency (palette)
  let assetConsistency = 10;
  const paletteColors = Object.values(style.palette);
  let colorSamples = 0;
  let farColors = 0;
  for (const variants of Object.values(bake.prefabs)) {
    for (const v of variants) {
      for (const part of v.parts) {
        if (part.material === "Neon") continue;
        colorSamples++;
        let best = Infinity;
        for (const c of paletteColors) best = Math.min(best, colorDistance(part.color, c));
        if (best > 0.42) farColors++;
      }
    }
  }
  const farRatio = colorSamples ? farColors / colorSamples : 0;
  if (farRatio > 0.25) {
    assetConsistency -= 3;
    problems.push({ id: "palette_inconsistent", severity: "medium", message: `${(farRatio * 100).toFixed(0)}% of asset colors are far from the style palette`, layer: "props" });
  } else if (farRatio > 0.12) assetConsistency -= 1;

  // ---------------- atmosphere & lighting
  let atmosphere = 10;
  let lighting = 10;
  const L = bake.lighting;
  const night = L.clockTime < 5.5 || L.clockTime > 19;
  if (night && L.brightness > 2) {
    lighting -= 2;
    problems.push({ id: "lighting_too_bright", severity: "low", message: "night scene but lighting is too bright", layer: "lighting" });
    fixes.push({ type: "spec_patch", path: "lighting.brightness", op: "set", value: clamp(spec.lighting.brightness - 0.25, 0, 1) });
  }
  if (spec.lighting.mood === "moonlit" || spec.lighting.mood === "eerie") {
    if (L.atmosphere.density < 0.3) {
      atmosphere -= 2;
      problems.push({ id: "fog_too_thin", severity: "low", message: "mysterious mood but fog is thin", layer: "lighting" });
      fixes.push({ type: "spec_patch", path: "atmosphere.fogDensity", op: "set", value: clamp(spec.atmosphere.fogDensity + 0.2, 0, 1) });
    }
  }
  if (L.fogEnd < 150) {
    atmosphere -= 1.5;
    problems.push({ id: "fog_too_thick", severity: "low", message: "fog is so thick landmarks will not read", layer: "lighting" });
  }

  // ---------------- variety
  let variety = 10;
  const prefabsUsed = Object.keys(s.variantsUsed).length;
  if (prefabsUsed < 8) {
    variety -= 3;
    problems.push({ id: "few_prefab_types", severity: "medium", message: `only ${prefabsUsed} prefab types used`, layer: "props" });
  }
  if (s.counts.rock < 20) {
    variety -= 1;
    problems.push({ id: "few_rocks", severity: "low", message: "very few rocks", layer: "props" });
  }
  if (s.counts.prop < 15 && spec.props.sets.length > 0) {
    variety -= 1.5;
    problems.push({ id: "few_props", severity: "low", message: `few props (${s.counts.prop})`, layer: "props" });
    fixes.push({ type: "spec_patch", path: "props.density", op: "set", value: clamp(spec.props.density + 0.2, 0, 1) });
  }

  // ---------------- performance
  let performance = 10;
  // full-detail estimate; background placements are instantiated at LOD 1 in Roblox (~10 % fewer parts)
  if (s.partsEstimate > 48000) {
    performance -= 3;
    problems.push({ id: "too_many_parts", severity: "high", message: `≈${s.partsEstimate} parts exceeds the 48k budget`, layer: "performance" });
  } else if (s.partsEstimate > 42000) performance -= 1;
  const overBudget = Object.entries(s.budgets).filter(([, b]) => b.trimmed > b.max * 0.5);
  if (overBudget.length > 0) performance -= 0.5;

  const scores: QAScores = {
    composition: r10(composition),
    lighting: r10(lighting),
    terrain: r10(terrain),
    vegetation: r10(vegetation),
    architecture: r10(architecture),
    assetConsistency: r10(assetConsistency),
    atmosphere: r10(atmosphere),
    variety: r10(variety),
    performance: r10(performance),
  };
  const weights: Record<keyof QAScores, number> = { composition: 1.5, lighting: 1, terrain: 1.2, vegetation: 1.2, architecture: 1, assetConsistency: 1, atmosphere: 1, variety: 1, performance: 1.1 };
  let sum = 0;
  let wsum = 0;
  for (const k of Object.keys(scores) as (keyof QAScores)[]) {
    sum += scores[k] * weights[k];
    wsum += weights[k];
  }
  const score = Math.round((sum / wsum) * 10);
  return { score, scores, problems, fixes: dedupeFixes(fixes), source: "metrics", createdAt: new Date().toISOString() };
}

function r10(v: number): number {
  return Math.round(clamp(v, 0, 10) * 10) / 10;
}

function dedupeFixes(fixes: QAFix[]): QAFix[] {
  const seen = new Set<string>();
  return fixes.filter((f) => {
    const k = JSON.stringify(f);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Merge a vision-agent report with the metrics report (average scores, union of problems/fixes). */
export function mergeReports(metrics: QAReport, vision: QAReport): QAReport {
  const scores = { ...metrics.scores };
  for (const k of Object.keys(scores) as (keyof QAScores)[]) scores[k] = r10((metrics.scores[k] + vision.scores[k]) / 2);
  const score = Math.round((Object.values(scores).reduce((a, b) => a + b, 0) / 9) * 10);
  return {
    score,
    scores,
    problems: [...metrics.problems, ...vision.problems],
    fixes: dedupeFixes([...metrics.fixes, ...vision.fixes]),
    source: "combined",
    createdAt: new Date().toISOString(),
  };
}
