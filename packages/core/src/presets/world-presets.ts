import { WorldSpecSchema, type WorldSpec, type WorldSpecInput } from "../schemas/world-spec";

/**
 * Built-in world templates. "moonlit_forest_village" is the mandatory demo:
 * large forest, rolling terrain, small abandoned village, stone paths, giant mushrooms,
 * stylized trees, a river, rocks, ruins, mist, blue-grey sky, soft light, mysterious mood.
 */
export const MOONLIT_FOREST_VILLAGE: WorldSpecInput = {
  id: "main",
  name: "Moonlit Forest Village",
  seed: 20260911,
  theme: "mysterious_forest",
  stylePreset: "stylized_mystical",
  size: { width: 1024, depth: 1024 },
  terrain: {
    baseHeight: 40,
    relief: 0.62,
    roughness: 0.45,
    erosion: 0.55,
    features: [
      { type: "mountains", placement: "edge", edges: ["north", "west"], intensity: 0.9, reach: 0.26 },
      { type: "hills", intensity: 0.55, scale: 1.1 },
      { type: "valley", center: [0.52, 0.56], radius: 0.3, depth: 0.5 },
    ],
  },
  biomes: [
    { id: "dark_forest", weight: 0.55, vegetation: "dense" },
    { id: "mushroom_grove", weight: 0.25, vegetation: "medium", moisture: [0.55, 1] },
    { id: "meadow", weight: 0.3, vegetation: "sparse" },
    { id: "rocky", weight: 0.2, vegetation: "sparse", elevation: [0.7, 1] },
  ],
  rivers: [{ id: "river_1", from: "north", to: "south-east", width: 16, depth: 6, meander: 0.65 }],
  lakes: [],
  landmarks: [
    { id: "giant_tree", type: "giant_tree", role: "focal", preferredZone: "hill", scale: 1 },
    { id: "old_ruins", type: "ruins", role: "secondary", preferredZone: "forest_edge", scale: 1 },
    { id: "watchtower", type: "tower", role: "hidden", preferredZone: "ridge", scale: 1 },
  ],
  settlements: [{ id: "village", type: "abandoned_village", buildings: 7, layout: "organic", near: "river_1", weathering: 0.7 }],
  roads: [
    { id: "main_path", type: "stone_path", connects: ["spawn", "village", "giant_tree"], width: 7 },
    { id: "ruins_path", type: "dirt_path", connects: ["village", "old_ruins"], width: 5 },
  ],
  vegetation: {
    density: 0.72,
    clustering: 0.6,
    species: ["pine", "round_tree", "dead_tree", "giant_mushroom", "small_mushroom", "bush", "fern", "grass", "flower", "log"],
    sizeVariation: 0.55,
    giantMushrooms: 0.45,
  },
  props: { density: 0.55, sets: ["village", "forest", "ruins"] },
  lighting: { timeOfDay: 20.5, mood: "moonlit", brightness: 0.55, shadows: true },
  atmosphere: { fogDensity: 0.5, fogColor: "#7d8aa3", haze: 0.65, skyTint: "#6d7d9a" },
  colorPalette: {
    primary: "#3e5a45",
    secondary: "#6d7a8c",
    accent: "#7b4f8f",
    ground: "#4a3b2c",
    stone: "#7c7f86",
    wood: "#5c3a2a",
    foliage: "#2f4b36",
    water: "#4d6f86",
  },
  cameraComposition: { spawnFacing: "giant_tree", spawnZone: "clearing" },
  gameplayHints: ["survival", "exploration", "collectibles"],
  notes: "Reference art direction: stylized mystical low-poly forest with giant violet mushrooms, misty background mountains and an abandoned cottage village by the river.",
};

export const WORLD_TEMPLATES: { id: string; name: string; description: string; spec: WorldSpecInput }[] = [
  {
    id: "moonlit_forest_village",
    name: "Moonlit Forest Village",
    description: "Mysterious forest, abandoned village by a river, giant mushrooms, ruins, mist.",
    spec: MOONLIT_FOREST_VILLAGE,
  },
  {
    id: "sunny_meadow_hamlet",
    name: "Sunny Meadow Hamlet",
    description: "Bright storybook meadow with a small hamlet, a lake and a windmill.",
    spec: {
      ...MOONLIT_FOREST_VILLAGE,
      name: "Sunny Meadow Hamlet",
      seed: 4242,
      theme: "sunny_meadow",
      stylePreset: "fantasy",
      terrain: { baseHeight: 30, relief: 0.4, roughness: 0.3, erosion: 0.6, features: [{ type: "mountains", edges: ["north"], intensity: 0.6, reach: 0.2 }, { type: "hills", intensity: 0.6, scale: 1.2 }] },
      biomes: [
        { id: "meadow", weight: 0.6, vegetation: "sparse" },
        { id: "forest", weight: 0.4, vegetation: "medium" },
      ],
      rivers: [],
      lakes: [{ id: "lake_1", center: [0.3, 0.35], radius: 90 }],
      landmarks: [
        { id: "windmill", type: "windmill", role: "focal", preferredZone: "hill" },
        { id: "shrine", type: "statue", role: "secondary", preferredZone: "clearing" },
      ],
      settlements: [{ id: "hamlet", type: "hamlet", buildings: 5, layout: "organic", near: "lake_1", weathering: 0.2 }],
      roads: [{ id: "main_road", type: "cobblestone_road", connects: ["spawn", "hamlet", "windmill"], width: 8 }],
      vegetation: { density: 0.5, clustering: 0.5, species: ["round_tree", "birch", "bush", "grass", "flower"], sizeVariation: 0.4, giantMushrooms: 0 },
      props: { density: 0.6, sets: ["village", "farm"] },
      lighting: { timeOfDay: 11, mood: "golden", brightness: 0.85, shadows: true },
      atmosphere: { fogDensity: 0.15, fogColor: "#c9daf0", haze: 0.2, skyTint: "#8fb4e6" },
      cameraComposition: { spawnFacing: "windmill", spawnZone: "clearing" },
    },
  },
  {
    id: "cursed_swamp_ruins",
    name: "Cursed Swamp Ruins",
    description: "Dark fantasy swamp with twisted trees, glowing fungi and a sunken temple.",
    spec: {
      ...MOONLIT_FOREST_VILLAGE,
      name: "Cursed Swamp Ruins",
      seed: 666,
      theme: "cursed_swamp",
      stylePreset: "dark_fantasy",
      terrain: { baseHeight: 24, relief: 0.35, roughness: 0.5, erosion: 0.7, features: [{ type: "mountains", edges: ["east", "south"], intensity: 0.7, reach: 0.22 }, { type: "valley", center: [0.45, 0.5], radius: 0.35, depth: 0.4 }] },
      biomes: [
        { id: "swamp", weight: 0.6, vegetation: "dense" },
        { id: "dark_forest", weight: 0.35, vegetation: "dense" },
        { id: "ruins_field", weight: 0.25, vegetation: "sparse" },
      ],
      rivers: [{ id: "black_river", from: "west", to: "east", width: 22, depth: 5, meander: 0.8 }],
      landmarks: [
        { id: "sunken_temple", type: "temple", role: "focal", preferredZone: "valley" },
        { id: "portal", type: "portal", role: "hidden", preferredZone: "forest_edge" },
      ],
      settlements: [{ id: "ruined_town", type: "ruined_town", buildings: 6, layout: "organic", near: "black_river", weathering: 0.95 }],
      roads: [{ id: "old_road", type: "dirt_path", connects: ["spawn", "ruined_town", "sunken_temple"], width: 6 }],
      vegetation: { density: 0.75, clustering: 0.7, species: ["willow", "dead_tree", "giant_mushroom", "small_mushroom", "fern", "grass", "log"], sizeVariation: 0.6, giantMushrooms: 0.6 },
      props: { density: 0.5, sets: ["ruins", "forest", "graveyard"] },
      lighting: { timeOfDay: 19.5, mood: "eerie", brightness: 0.4, shadows: true },
      atmosphere: { fogDensity: 0.7, fogColor: "#3f4656", haze: 0.8, skyTint: "#2f3542" },
      cameraComposition: { spawnFacing: "sunken_temple", spawnZone: "clearing" },
    },
  },
];

export function getWorldTemplate(id: string): WorldSpec {
  const t = WORLD_TEMPLATES.find((w) => w.id === id) ?? WORLD_TEMPLATES[0]!;
  return WorldSpecSchema.parse(t.spec);
}
