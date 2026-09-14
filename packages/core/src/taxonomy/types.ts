/**
 * Universal taxonomy — every game genre and every visual style WorldForge can produce is described
 * here as data. The generator, the prefab kits, the roblox-ts template, the local interpreter and the
 * agent prompts all read these tables, so adding a style or a genre is a data change first.
 */

/** Building generator family (see packages/prefabs/src/kits/buildings). */
export const ARCHITECTURE_KITS = [
  "medieval_cottage",
  "timber_frame",
  "stone_hut",
  "elven",
  "ruined",
  "desert_adobe",
  "nordic",
  "cyber_block",
  "modern_house",
  "apartment_block",
  "skyscraper",
  "scifi_module",
  "shack",
  "japanese",
  "western_facade",
  "industrial_shed",
  "igloo",
  "tropical_hut",
  "gothic",
  "greek_temple",
  "egyptian",
  "victorian",
  "bunker",
  "candy",
  "voxel",
  "brick_rowhouse",
] as const;
export type ArchitectureKit = (typeof ARCHITECTURE_KITS)[number];

/** Prop families (each maps to a set of prefab ids in the registry). */
export const PROP_KITS = [
  "village",
  "forest",
  "ruins",
  "camp",
  "mine",
  "farm",
  "docks",
  "graveyard",
  "urban",
  "suburban",
  "apocalypse",
  "scifi",
  "cyber",
  "space",
  "western",
  "pirate",
  "industrial",
  "japanese",
  "egypt",
  "greek",
  "tropical",
  "arctic",
  "candy",
  "underwater",
  "jungle",
  "military",
  "horror",
  "sports",
  "carnival",
  "playground",
] as const;
export type PropKit = (typeof PROP_KITS)[number];

/** Vegetation families (which species the generator scatters). */
export const VEGETATION_KITS = ["temperate", "conifer", "mushroom", "dead", "tropical", "jungle", "desert", "arctic", "alien", "candy", "coral", "bamboo", "savanna", "cherry", "none"] as const;
export type VegetationKit = (typeof VEGETATION_KITS)[number];

/** Road surface families. */
export const ROAD_KITS = ["stone_path", "dirt_path", "cobblestone_road", "wooden_walkway", "asphalt_road", "concrete_road", "metal_walkway", "neon_road", "sand_path", "snow_path", "brick_road"] as const;
export type RoadKit = (typeof ROAD_KITS)[number];

/** Map layout archetypes (how the world is organised for the genre) — enum lives in schemas/world-spec. */
export type LayoutArchetype = "settlement" | "city_grid" | "obby_course" | "arena" | "race_track" | "tycoon_plots" | "lobby_portals" | "base_defense" | "island" | "open_world" | "dungeon" | "sports_field" | "hangout_plaza" | "campus" | "linear_story";

export const UI_THEMES = ["stylized", "minimal", "fantasy", "sci-fi", "cartoon", "horror", "modern", "retro", "military", "candy"] as const;
export type UiTheme = (typeof UI_THEMES)[number];

/** Ambient weather / particle layer the client renders around the camera. */
export const WEATHER_KINDS = ["none", "rain", "snow", "ash", "dust", "petals", "spores", "fireflies", "embers", "bubbles", "leaves", "sandstorm"] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

/** Ring wall built around the main settlement (see packages/prefabs/src/kits/walls). */
export const WALL_KITS = ["none", "stone_crenellated", "palisade", "sandbags", "scrap", "bamboo", "adobe", "marble", "energy_fence", "picket", "ice"] as const;
export type WallKit = (typeof WALL_KITS)[number];

export const AUDIO_MOODS = ["mystical", "cheerful", "epic", "tense", "horror", "chill", "electronic", "western", "tropical", "orchestral", "retro", "ambient_nature", "industrial"] as const;
export type AudioMood = (typeof AUDIO_MOODS)[number];

export type StyleFamilyGroup = "fantasy" | "historical" | "modern" | "future" | "apocalyptic" | "themed" | "nature";

/** Compact style descriptor — expanded into a full StyleBible by `styleFamilyToBible`. */
export interface StyleFamilyDef {
  id: string;
  name: string;
  description: string;
  group: StyleFamilyGroup;
  /** Prompt keywords (French + English, lowercase, accent-free). */
  keywords: string[];
  geometry: "chunky_low_poly" | "smooth_low_poly" | "blocky" | "angular" | "rounded";
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    ground: string;
    stone: string;
    wood: string;
    foliage: string;
    foliageAlt: string;
    water: string;
    roof: string;
    wall: string;
    mushroom?: string;
    mushroomAlt?: string;
    glow: string;
    sky: string;
  };
  materials?: Partial<{ trunk: string; canopy: string; rock: string; wall: string; stoneWall: string; roof: string; path: string; ground: string; mushroom: string; prop: string; metal: string }>;
  tree: "chunky_fantasy" | "conifer" | "round" | "twisted" | "blocky";
  architecture: { kit: ArchitectureKit; roofPitch?: number; weathering?: number; scaleVariance?: number; chimneyChance?: number; interiors?: boolean; floors?: [number, number] };
  vegetationKit: VegetationKit;
  vegetationDensity: number;
  propKits: PropKit[];
  propDensity?: number;
  roadKit: RoadKit;
  /** Preferred biomes (ids from BIOME_IDS) in priority order. */
  biomes: string[];
  /** Preferred landmark types (ids from LANDMARK_TYPES). */
  landmarks: string[];
  settlementType?: "village" | "abandoned_village" | "hamlet" | "camp" | "outpost" | "ruined_town" | "town" | "city_district" | "base" | "harbor";
  lighting: { timeOfDay: number; mood: "bright" | "soft" | "golden" | "overcast" | "moonlit" | "dusk" | "dawn" | "eerie" | "stormy"; ambient: string; outdoorAmbient: string; sunColor: string; brightness: number; exposure: number; saturation: number; contrast: number; tint: string };
  fog: { start: number; end: number; color: string; density: number; haze: number; glare?: number };
  mushrooms?: number;
  ui: UiTheme;
  uiAccent: string;
  audio: AudioMood;
  /** Ambient particle weather (defaults to none; the mood can still add rain/snow). */
  weather?: WeatherKind;
  weatherIntensity?: number;
  /** Cloud cover 0..1 (default 0.45). */
  clouds?: number;
  /** Normalized elevation above which bare ground turns to snow (default 0.9; >1 never). */
  snowLine?: number;
  /** Ring wall kit around the main settlement (default none). */
  walls?: WallKit;
  /** How strongly the palette recolors the terrain materials (default 0.55). */
  terrainTint?: number;
}

export interface GenreDef {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  /** Gameplay systems enabled in the template (ids from GAMEPLAY_SYSTEMS). */
  systems: string[];
  layout: LayoutArchetype;
  /** UI screens (ids from the GameSpec ui.screens enum). */
  screens: string[];
  /** Currency name used by the shop / HUD. */
  currency: string;
  /** Default in-game shop sections & starter monetization ids the design agent should keep. */
  monetization: { passes: string[]; products: string[] };
  camera: "third_person" | "first_person" | "top_down" | "side" | "free";
  /** Styles that fit the genre best (first = default). */
  defaultStyles: string[];
  /** Does the genre need NPC enemies / mobs. */
  enemies: boolean;
  /** Multiplayer structure. */
  multiplayer: "open" | "rounds" | "teams" | "solo_instances";
  /** Progression model shown to the design agent. */
  progression: string;
}
