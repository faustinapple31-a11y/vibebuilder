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
  "urban",
  "wasteland",
  "alien",
  "moon",
  "tundra",
  "jungle",
  "ocean_floor",
  "volcanic",
  "savanna",
  "farmland",
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
  "crashed_plane",
  "radio_tower",
  "skyscraper",
  "skyscraper_ruin",
  "water_tower",
  "pyramid",
  "colosseum",
  "torii_gate",
  "lighthouse",
  "pirate_ship",
  "rocket",
  "ufo",
  "dome_base",
  "crystal_spire",
  "ferris_wheel",
  "stadium",
  "fountain",
  "obelisk",
  "waterfall_cliff",
  "gas_station",
  "church",
  "barn",
  "bridge",
] as const;
export const LandmarkTypeSchema = z.enum(LANDMARK_TYPES);
export type LandmarkType = z.infer<typeof LandmarkTypeSchema>;

export const ZONE_HINTS = ["hill", "ridge", "forest_edge", "riverbank", "plateau", "clearing", "village", "valley", "coast", "flat", "outskirts", "any"] as const;
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

export const SETTLEMENT_TYPES = ["village", "abandoned_village", "hamlet", "camp", "outpost", "ruined_town", "town", "city_district", "base", "harbor", "farmstead"] as const;
export const SettlementTypeSchema = z.enum(SETTLEMENT_TYPES);
export type SettlementType = z.infer<typeof SettlementTypeSchema>;

export const SettlementSchema = z.object({
  id: z.string().min(1),
  type: SettlementTypeSchema.default("village"),
  buildings: z.number().int().min(1).max(80).default(6),
  layout: z.enum(["organic", "grid", "ring", "linear"]).default("organic"),
  /** Building kit override (defaults to the style's architecture kit). */
  kit: z.string().optional(),
  /** Generate walk-in interiors (defaults to the style's architecture.interiors). */
  interiors: z.boolean().optional(),
  /** Prefer to be near this river/lake/landmark id, or a zone hint. */
  near: z.string().optional(),
  position: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
  weathering: z.number().min(0).max(1).default(0.5),
});
export type SettlementSpec = z.infer<typeof SettlementSchema>;

export const RoadSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["stone_path", "dirt_path", "cobblestone_road", "wooden_walkway", "asphalt_road", "concrete_road", "metal_walkway", "neon_road", "sand_path", "snow_path", "brick_road"]).default("stone_path"),
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
  "jungle_tree",
  "baobab",
  "alien_tree",
  "bamboo",
  "cherry_tree",
  "burnt_tree",
  "candy_tree",
  "coral",
  "seaweed",
  "snow_pine",
  "acacia",
  "cypress",
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

export const PROP_SETS = ["village", "forest", "ruins", "camp", "mine", "farm", "docks", "graveyard", "urban", "suburban", "apocalypse", "scifi", "cyber", "space", "western", "pirate", "industrial", "japanese", "egypt", "greek", "tropical", "arctic", "candy", "underwater", "jungle", "military", "horror", "sports", "carnival", "playground"] as const;
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

export const LAYOUT_ARCHETYPES = ["settlement", "city_grid", "obby_course", "arena", "race_track", "tycoon_plots", "lobby_portals", "base_defense", "island", "open_world", "dungeon", "sports_field", "hangout_plaza", "campus", "linear_story"] as const;
export const LayoutArchetypeSchema = z.enum(LAYOUT_ARCHETYPES);
export type LayoutArchetypeId = z.infer<typeof LayoutArchetypeSchema>;

/** Gameplay layout laid on top of the terrain (obby stages, arena, tycoon plots, race track…). */
export const LayoutSchema = z.object({
  archetype: LayoutArchetypeSchema.default("settlement"),
  /** Obby stages / tycoon plots / arena cover count / race checkpoints / TD path waypoints — meaning depends on the archetype. */
  count: z.number().int().min(1).max(200).default(12),
  /** Footprint in normalized world units (0.2 = 20% of the map). */
  extent: z.number().min(0.1).max(1).default(0.45),
  /** Difficulty / density 0..1 (gap sizes, cover density, wave path length). */
  intensity: z.number().min(0).max(1).default(0.5),
  /** Themed decoration of the gameplay structures (defaults to the style palette). */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  position: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
});
export type LayoutSpec = z.infer<typeof LayoutSchema>;

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
  "dark_fantasy",
  "elven",
  "cartoon",
  "medieval",
  "viking",
  "ancient_egypt",
  "ancient_greece",
  "feudal_japan",
  "wild_west",
  "pirate",
  "steampunk",
  "realistic",
  "modern_suburban",
  "modern_city",
  "industrial",
  "post_apocalyptic",
  "wasteland",
  "sci_fi",
  "cyberpunk",
  "space_station",
  "alien_planet",
  "horror_gothic",
  "tropical",
  "jungle",
  "desert",
  "winter",
  "swamp",
  "underwater",
  "candy",
  "low_poly_minimal",
  "voxel",
  "military",
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
  layout: LayoutSchema.prefault({}),
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
