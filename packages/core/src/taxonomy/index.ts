import type { StyleBibleInput } from "../schemas/style-bible";
import { STYLE_FAMILIES_FANTASY } from "./styles-fantasy";
import { STYLE_FAMILIES_MODERN } from "./styles-modern";
import { STYLE_FAMILIES_NATURE } from "./styles-nature";
import type { GenreDef, StyleFamilyDef } from "./types";

export * from "./types";
export * from "./genres";
export * from "./kits";
export * from "./ui-kits";
export * from "./ui-strings";

export const STYLE_FAMILIES: StyleFamilyDef[] = [...STYLE_FAMILIES_FANTASY, ...STYLE_FAMILIES_MODERN, ...STYLE_FAMILIES_NATURE];
export const STYLE_FAMILY_INDEX: Record<string, StyleFamilyDef> = Object.fromEntries(STYLE_FAMILIES.map((s) => [s.id, s]));
export const STYLE_FAMILY_IDS = STYLE_FAMILIES.map((s) => s.id);

/** Expands a compact style family into a full StyleBible input (defaults fill the rest). */
export function styleFamilyToBible(def: StyleFamilyDef): StyleBibleInput {
  const p = def.palette;
  const mushroom = p.mushroom ?? p.accent;
  const mushroomAlt = p.mushroomAlt ?? p.glow;
  const materials = { ...(def.materials ?? {}) } as StyleBibleInput["materials"];
  return {
    id: def.id,
    name: def.name,
    geometry: def.geometry,
    palette: { ...p, mushroom, mushroomAlt },
    materials,
    tree: { style: def.tree, scale: def.tree === "conifer" ? [1.0, 1.9] : def.tree === "blocky" ? [0.9, 1.4] : [1.0, 1.8], rotationJitterDeg: def.geometry === "blocky" || def.geometry === "angular" ? 8 : 22, canopyLayers: def.tree === "conifer" ? [3, 5] : [2, 4], trunkTaper: 0.7, hueJitterDeg: def.group === "themed" ? 18 : 10 },
    mushroom: { scaleMultiplier: def.mushrooms && def.mushrooms > 0.3 ? [2, 6] : [1, 2.5], capColors: [mushroom, mushroomAlt, p.accent, p.glow], glow: def.mushrooms ?? 0, spots: true },
    rock: { variation: def.geometry === "blocky" ? "low" : "high", clusterChance: 0.55, mossChance: def.vegetationKit === "desert" || def.vegetationKit === "none" ? 0.05 : 0.5 },
    architecture: { style: def.architecture.kit, roofPitch: def.architecture.roofPitch ?? 0.9, weathering: def.architecture.weathering ?? 0.5, scaleVariance: def.architecture.scaleVariance ?? 0.25, chimneyChance: def.architecture.chimneyChance ?? 0.5, interiors: def.architecture.interiors ?? true, floors: def.architecture.floors ?? [1, 1] },
    kits: { vegetation: def.vegetationKit, props: def.propKits, road: def.roadKit, biomes: def.biomes, landmarks: def.landmarks, settlement: def.settlementType ?? "village" },
    ui: { theme: def.ui, accent: def.uiAccent },
    environment: {
      weather: def.weather ?? "none",
      weatherIntensity: def.weatherIntensity ?? 0.5,
      cloudCover: def.clouds ?? 0.45,
      snowLine: def.snowLine ?? (def.vegetationKit === "arctic" ? 0.3 : def.vegetationKit === "desert" || def.group === "future" ? 1.2 : 0.9),
      terrainTint: def.terrainTint ?? 0.55,
      grassDecoration: def.vegetationKit !== "none" && def.vegetationKit !== "desert" && def.vegetationKit !== "arctic",
      walls: def.walls ?? "none",
    },
    audioMood: def.audio,
    vegetationDensity: def.vegetationDensity,
    propDensity: def.propDensity ?? 0.5,
    lighting: {
      ambient: def.lighting.ambient,
      outdoorAmbient: def.lighting.outdoorAmbient,
      sunColor: def.lighting.sunColor,
      brightness: def.lighting.brightness,
      shadowSoftness: 0.6,
      exposure: def.lighting.exposure,
      colorCorrection: { saturation: def.lighting.saturation, contrast: def.lighting.contrast, tint: def.lighting.tint },
    },
    fog: { start: def.fog.start, end: def.fog.end, color: def.fog.color, atmosphereDensity: def.fog.density, haze: def.fog.haze, glare: def.fog.glare ?? 0.2 },
    biomeTransition: 0.35,
    scaleRules: { landmarkMultiplier: def.group === "modern" || def.group === "future" ? 2.5 : 3.5, foregroundDetail: 1.0, buildingScale: def.group === "modern" || def.group === "future" ? 1.15 : 1.0 },
    randomness: def.geometry === "angular" ? 0.35 : 0.5,
  };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Keyword score: each matched keyword adds its length (longer = more specific), short keywords
 * must match whole words ("spa" never matches "spatiale"), a matched region is consumed so
 * "pyramide" and "pyramid" count once, and naming the id/name outright adds a large bonus.
 */
function scoreKeywords(text: string, keywords: string[], id: string, name: string): number {
  let score = 0;
  let rest = text;
  const sorted = [...keywords].map(norm).sort((a, b) => b.length - a.length);
  for (const kk of sorted) {
    if (!kk) continue;
    const re = new RegExp(kk.length <= 4 ? `(^|[^a-z0-9])${escapeRe(kk)}(?![a-z0-9])` : `(^|[^a-z0-9])${escapeRe(kk)}`);
    const m = re.exec(rest);
    if (!m) continue;
    score += kk.length;
    rest = rest.slice(0, m.index) + " ".repeat(m[0].length) + rest.slice(m.index + m[0].length);
  }
  const idWords = norm(id).replace(/_/g, " ");
  const nm = norm(name);
  if (new RegExp(`(^|[^a-z0-9])${escapeRe(idWords)}(?![a-z0-9])`).test(text) || (nm.length > 4 && text.includes(nm))) score += 20;
  return score;
}

/** Best-matching style family for a free-form prompt (French/English), or undefined when nothing matches. */
export function matchStyleFamily(prompt: string): StyleFamilyDef | undefined {
  const t = norm(prompt);
  let best: { def: StyleFamilyDef; score: number } | undefined;
  for (const def of STYLE_FAMILIES) {
    const score = scoreKeywords(t, def.keywords, def.id, def.name);
    if (score > 0 && (!best || score > best.score)) best = { def, score };
  }
  return best?.def;
}

/** Best-matching genre for a prompt, or undefined. */
export function matchGenre(prompt: string, genres: GenreDef[]): GenreDef | undefined {
  const t = norm(prompt);
  let best: { def: GenreDef; score: number } | undefined;
  for (const def of genres) {
    const score = scoreKeywords(t, def.keywords, def.id, def.name);
    if (score > 0 && (!best || score > best.score)) best = { def, score };
  }
  return best?.def;
}

/** Human-readable catalogue for agent prompts / docs. */
export function describeTaxonomy(genres: GenreDef[]): string {
  const styles = STYLE_FAMILIES.map((s) => `- ${s.id} (${s.name}, ${s.group}): ${s.description} kit=${s.architecture.kit}, vegetation=${s.vegetationKit}, props=[${s.propKits.join(",")}], biomes=[${s.biomes.join(",")}], landmarks=[${s.landmarks.join(",")}]`);
  const gs = genres.map((g) => `- ${g.id} (${g.name}): ${g.description} layout=${g.layout}, systems=[${g.systems.join(",")}], camera=${g.camera}, styles=[${g.defaultStyles.join(",")}]`);
  return `STYLE PRESETS (stylePreset):\n${styles.join("\n")}\n\nGENRES (genre):\n${gs.join("\n")}`;
}
