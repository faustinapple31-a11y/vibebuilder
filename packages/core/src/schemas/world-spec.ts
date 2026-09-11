import { z } from "zod";

/**
 * WorldSpec — the intermediate representation the AI produces BEFORE anything is generated.
 * It is editable, versioned, diffable, and deterministic to bake (with `seed`).
 */

export const EdgeSchema = z.enum(["north", "south", "east", "west", "north-east", "north-west", "south-east", "south-west", "center"]);
export type Edge = z.infer<typeof EdgeSchema>;

export const TerrainFeatureSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("mountains"),
    placement: z.enum(["edge", "point"]).default("edge"),
    edges: z.array(EdgeSchema).default(["north"]),
    center: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
    intensity: z.number().min(0).max(1).default(0.8),
    /** Fraction of the world size the mountain band occupies from the edge. */
    reach: z.number().min(0.05).max(0.6).default(0.25),
  }),
  z.object({
    type: z.literal("hills"),
    intensity: z.number().min(0).max(1).default(0.5),
    scale: z.number().min(0.2).max(3).default(1),
  }),
  z.object({
    type: z.literal("valley"),
    center: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).default([0.5, 0.5]),
    radius: z.number().min(0.05).max(0.6).default(0.25),
    depth: z.number().min(0).max(1).default(0.5),
  }),
  z.object({
    type: z.literal("plateau"),
    center: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).default([0.5, 0.5]),
    radius: z.number().min(0.05).max(0.6).default(0.2),
    height: z.number().min(0).max(1).default(0.5),
  }),
  z.object({
    type: z.literal("cliffs"),
    intensity: z.number().min(0).max(1).default(0.5),
  }),
  z.object({
    type: z.literal("crater"),
    center: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).default([0.5, 0.5]),
    radius: z.number().min(0.05).max(0.5).default(0.15),
  }),
]);
export type TerrainFeature = z.infer<typeof TerrainFeatureSchema>;

export const BIOME_IDS = [
  "dark_forest",
  "forest",
  "pine_forest",
  "mushroom_grove",
  "meadow",
  "swamp",
  "rocky",
  "highlands",
  "desert",
  "snow",
  "beach",
  "ruins_field",
] as const;
export const BiomeIdSchema = z.enum(BIOME_IDS);
export type BiomeId = z.infer<typeof BiomeIdSchema>;

export const BiomeSchema = z.object({
  id: BiomeIdSchema,
  weight: z.number().min(0).max(1).default(0.3),
  vegetation: z.enum(["none", "sparse", "medium", "dense"]).default("medium"),
  /** Preferred elevation band (0 low .. 1 high), optional. */
  elevation: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
  /** Preferred moisture band (0 dry .. 1 wet), optional. */
  moisture: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
});
export type BiomeSpec = z.infer<typeof BiomeSchema>;

export const RiverSchema = z.object({
  id: z.string().min(1),
  from: EdgeSchema.default("north"),
  to: EdgeSchema.default("south"),
  width: z.number().min(4).max(80).default(14),
  depth: z.number().min(1).max(30).default(6),
  meander: z.number().min(0).max(1).default(0.5),
});
export type RiverSpec = z.infer<typeof RiverSchema>;

export const LakeSchema = z.object({
  id: z.string().min(1),
  center: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).default([0.5, 0.5]),
  radius: z.number().min(10).max(400).default(60),
});
export type LakeSpec = z.infer<typeof LakeSchema>;

export const LANDMARK_TYPES = [
  "giant_tree",
  "ruins",
  "tower",
  "castle",
  "statue",
  "windmill",
  "temple",
  "portal",
  "well",
  "mountain_peak",
  "volcano",
  "campfire",
  "bridge",
] as const;
export const LandmarkTypeSchema = z.enum(LANDMARK_TYPES);
export type LandmarkType = z.infer<typeof LandmarkTypeSchema>;

export const ZONE_HINTS = ["hill", "ridge", "forest_edge", "riverbank", "plateau", "clearing", "village", "valley", "any"] as const;
export const ZoneHintSchema = z.enum(ZONE_HINTS);

export const LandmarkSchema = z.object({
  id: z.string().min(1),
  type: LandmarkTypeSchema,
  role: z.enum(["focal", "secondary", "hidden"]).default("secondary"),
  preferredZone: ZoneHintSchema.default("any"),
  /** Optional explicit position in normalized world coords. */
  position: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
  scale: z.number().min(0.5).max(6).default(1),
});
export type LandmarkSpec = z.infer<typeof LandmarkSchema>;

export const SettlementSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["village", "abandoned_village", "hamlet", "camp", "outpost", "ruined_town"]).default("village"),
  buildings: z.number().int().min(1).max(40).default(6),
  layout: z.enum(["organic", "grid", "ring", "linear"]).default("organic"),
  /** Prefer to be near this river/lake/landmark id, or a zone hint. */
  near: z.string().optional(),
  position: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
  weathering: z.number().min(0).max(1).default(0.5),
});
export type SettlementSpec = z.infer<typeof SettlementSchema>;

export const RoadSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["stone_path", "dirt_path", "cobblestone_road", "wooden_walkway"]).default("stone_path"),
  /** Ordered list of node ids: "spawn", settlement ids, landmark ids, or edges. */
  connects: z.array(z.string().min(1)).min(2),
  width: z.number().min(3).max(24).default(7),
});
export type RoadSpec = z.infer<typeof RoadSchema>;

export const VEGETATION_SPECIES = [
  "pine",
  "round_tree",
  "dead_tree",
  "willow",
  "birch",
  "giant_mushroom",
  "small_mushroom",
  "bush",
  "fern",
  "grass",
  "flower",
  "log",
  "cactus",
  "palm",
] as const;
export const VegetationSpeciesSchema = z.enum(VEGETATION_SPECIES);
export type VegetationSpecies = z.infer<typeof VegetationSpeciesSchema>;

export const VegetationSchema = z.object({
  density: z.number().min(0).max(1).default(0.6),
  clustering: z.number().min(0).max(1).default(0.5),
  species: z.array(VegetationSpeciesSchema).min(1).default(["pine", "round_tree", "bush", "grass"]),
  /** 0 = uniform sizes, 1 = wild variation. */
  sizeVariation: z.number().min(0).max(1).default(0.5),
  giantMushrooms: z.number().min(0).max(1).default(0.3),
});

export const PROP_SETS = ["village", "forest", "ruins", "camp", "mine", "farm", "docks", "graveyard"] as const;
export const PropsSchema = z.object({
  density: z.number().min(0).max(1).default(0.5),
  sets: z.array(z.enum(PROP_SETS)).default(["village", "forest"]),
});

export const LightingSchema = z.object({
  /** 0..24 */
  timeOfDay: z.number().min(0).max(24).default(14),
  mood: z.enum(["bright", "soft", "golden", "overcast", "moonlit", "dusk", "dawn", "eerie", "stormy"]).default("soft"),
  brightness: z.number().min(0).max(1).default(0.7),
  shadows: z.boolean().default(true),
});

export const AtmosphereSchema = z.object({
  fogDensity: z.number().min(0).max(1).default(0.3),
  fogColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#9aa5b8"),
  haze: z.number().min(0).max(1).default(0.4),
  skyTint: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6d7d9a"),
});

export const ColorPaletteSchema = z.object({
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#3e5a45"),
  secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6d7a8c"),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#7b4f8f"),
  ground: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#4a3b2c"),
  stone: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#7c7f86"),
  wood: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#5c3a2a"),
  foliage: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2f4b36"),
  water: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#4d6f86"),
});

export const CameraCompositionSchema = z.object({
  /** Landmark or settlement id the spawn should face. */
  spawnFacing: z.string().optional(),
  spawnZone: ZoneHintSchema.default("clearing"),
  spawnPosition: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
});

export const LocksSchema = z.object({
  terrain: z.boolean().default(false),
  water: z.boolean().default(false),
  roads: z.boolean().default(false),
  landmarks: z.boolean().default(false),
  buildings: z.boolean().default(false),
  vegetation: z.boolean().default(false),
  props: z.boolean().default(false),
  lighting: z.boolean().default(false),
});
export type WorldLocks = z.infer<typeof LocksSchema>;

export const STYLE_PRESET_IDS = [
  "stylized_mystical",
  "fantasy",
  "medieval",
  "cartoon",
  "dark_fantasy",
  "cyberpunk",
  "desert",
  "tropical",
  "winter",
  "swamp",
] as const;
export const StylePresetIdSchema = z.enum(STYLE_PRESET_IDS);
export type StylePresetId = z.infer<typeof StylePresetIdSchema>;

export const WorldSpecSchema = z.object({
  id: z.string().min(1).default("main"),
  name: z.string().min(1).default("Untitled World"),
  seed: z.number().int().min(0).max(4294967295).default(1337),
  theme: z.string().min(1).default("mysterious_forest"),
  stylePreset: StylePresetIdSchema.default("stylized_mystical"),
  size: z
    .object({
      width: z.number().int().min(256).max(4096).default(1024),
      depth: z.number().int().min(256).max(4096).default(1024),
    })
    .default({ width: 1024, depth: 1024 }),
  terrain: z
    .object({
      baseHeight: z.number().min(0).max(200).default(40),
      /** Overall vertical amplitude 0..1. */
      relief: z.number().min(0).max(1).default(0.55),
      roughness: z.number().min(0).max(1).default(0.4),
      erosion: z.number().min(0).max(1).default(0.5),
      features: z.array(TerrainFeatureSchema).default([]),
    })
    .prefault({}),
  biomes: z.array(BiomeSchema).min(1).prefault([{ id: "forest", weight: 0.6, vegetation: "dense" }, { id: "meadow", weight: 0.4, vegetation: "sparse" }]),
  rivers: z.array(RiverSchema).default([]),
  lakes: z.array(LakeSchema).default([]),
  landmarks: z.array(LandmarkSchema).default([]),
  settlements: z.array(SettlementSchema).default([]),
  roads: z.array(RoadSchema).default([]),
  vegetation: VegetationSchema.prefault({}),
  props: PropsSchema.prefault({}),
  lighting: LightingSchema.prefault({}),
  atmosphere: AtmosphereSchema.prefault({}),
  colorPalette: ColorPaletteSchema.prefault({}),
  cameraComposition: CameraCompositionSchema.prefault({}),
  locks: LocksSchema.prefault({}),
  gameplayHints: z.array(z.string()).default([]),
  /** Free-form notes from the designer/agent (not used by the generator). */
  notes: z.string().optional(),
});

export type WorldSpec = z.infer<typeof WorldSpecSchema>;
export type WorldSpecInput = z.input<typeof WorldSpecSchema>;

export function parseWorldSpec(input: unknown): WorldSpec {
  return WorldSpecSchema.parse(input);
}

export function safeParseWorldSpec(input: unknown) {
  return WorldSpecSchema.safeParse(input);
}
