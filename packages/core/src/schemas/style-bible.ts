import { z } from "zod";
import { ROBLOX_MATERIALS } from "../partlist";

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const Range = z.tuple([z.number(), z.number()]);
const Material = z.enum(ROBLOX_MATERIALS);

/**
 * StyleBible — procedural art direction. Every prefab and every generation stage reads
 * from it so all assets look like they belong to the same game.
 */
export const StyleBibleSchema = z.object({
  id: z.string().min(1).default("stylized_mystical"),
  name: z.string().default("Stylized Mystical"),
  geometry: z.enum(["chunky_low_poly", "smooth_low_poly", "blocky", "angular", "rounded"]).default("chunky_low_poly"),
  palette: z
    .object({
      primary: Hex.default("#3e5a45"),
      secondary: Hex.default("#6d7a8c"),
      accent: Hex.default("#7b4f8f"),
      ground: Hex.default("#4a3b2c"),
      stone: Hex.default("#7c7f86"),
      wood: Hex.default("#5c3a2a"),
      foliage: Hex.default("#2f4b36"),
      foliageAlt: Hex.default("#4a6b3f"),
      water: Hex.default("#4d6f86"),
      roof: Hex.default("#5a4a52"),
      wall: Hex.default("#8a7b6a"),
      mushroom: Hex.default("#7b4f8f"),
      mushroomAlt: Hex.default("#8a3f5f"),
      glow: Hex.default("#b48cff"),
      sky: Hex.default("#6d7d9a"),
    })
    .prefault({}),
  materials: z
    .object({
      trunk: Material.default("Wood"),
      canopy: Material.default("Grass"),
      rock: Material.default("Slate"),
      wall: Material.default("WoodPlanks"),
      stoneWall: Material.default("Cobblestone"),
      roof: Material.default("Slate"),
      path: Material.default("Cobblestone"),
      ground: Material.default("Grass"),
      mushroom: Material.default("SmoothPlastic"),
      prop: Material.default("Wood"),
      metal: Material.default("Metal"),
    })
    .prefault({}),
  tree: z
    .object({
      style: z.enum(["chunky_fantasy", "conifer", "round", "twisted", "blocky"]).default("chunky_fantasy"),
      scale: Range.default([1.0, 1.8]),
      rotationJitterDeg: z.number().min(0).max(45).default(25),
      canopyLayers: z.tuple([z.number().int(), z.number().int()]).default([2, 4]),
      trunkTaper: z.number().min(0).max(1).default(0.7),
      hueJitterDeg: z.number().min(0).max(60).default(12),
    })
    .prefault({}),
  mushroom: z
    .object({
      scaleMultiplier: Range.default([2, 6]),
      capColors: z.array(Hex).default(["#7b4f8f", "#8a3f5f", "#5f4b8b", "#9a5f8f"]),
      glow: z.number().min(0).max(1).default(0.35),
      spots: z.boolean().default(true),
    })
    .prefault({}),
  rock: z
    .object({
      variation: z.enum(["low", "medium", "high"]).default("high"),
      clusterChance: z.number().min(0).max(1).default(0.6),
      mossChance: z.number().min(0).max(1).default(0.5),
    })
    .prefault({}),
  architecture: z
    .object({
      style: z.enum(["medieval_cottage", "timber_frame", "stone_hut", "elven", "ruined", "desert_adobe", "nordic", "cyber_block"]).default("medieval_cottage"),
      roofPitch: z.number().min(0.3).max(1.5).default(0.9),
      weathering: z.number().min(0).max(1).default(0.7),
      scaleVariance: z.number().min(0).max(0.6).default(0.25),
      chimneyChance: z.number().min(0).max(1).default(0.6),
    })
    .prefault({}),
  vegetationDensity: z.number().min(0).max(1).default(0.72),
  propDensity: z.number().min(0).max(1).default(0.5),
  lighting: z
    .object({
      ambient: Hex.default("#5d6b85"),
      outdoorAmbient: Hex.default("#6b7690"),
      sunColor: Hex.default("#cfd6e6"),
      brightness: z.number().min(0).max(5).default(1.2),
      shadowSoftness: z.number().min(0).max(1).default(0.7),
      exposure: z.number().min(-2).max(2).default(-0.1),
      colorCorrection: z
        .object({
          saturation: z.number().min(-1).max(1).default(-0.1),
          contrast: z.number().min(-1).max(1).default(0.08),
          tint: Hex.default("#e6ecff"),
        })
        .prefault({}),
    })
    .prefault({}),
  fog: z
    .object({
      start: z.number().min(0).default(60),
      end: z.number().min(1).default(520),
      color: Hex.default("#7d8aa3"),
      atmosphereDensity: z.number().min(0).max(1).default(0.42),
      haze: z.number().min(0).max(10).default(1.8),
      glare: z.number().min(0).max(10).default(0.1),
    })
    .prefault({}),
  biomeTransition: z.number().min(0).max(1).default(0.35),
  scaleRules: z
    .object({
      landmarkMultiplier: z.number().min(1).max(8).default(3.5),
      foregroundDetail: z.number().min(0).max(2).default(1.0),
      buildingScale: z.number().min(0.5).max(2).default(1.0),
    })
    .prefault({}),
  /** 0 = tidy, 1 = wild placement jitter. */
  randomness: z.number().min(0).max(1).default(0.5),
});

export type StyleBible = z.infer<typeof StyleBibleSchema>;
export type StyleBibleInput = z.input<typeof StyleBibleSchema>;

export function parseStyleBible(input: unknown): StyleBible {
  return StyleBibleSchema.parse(input);
}
