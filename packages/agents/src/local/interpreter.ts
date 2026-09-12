import {
  GameSpecSchema,
  MOONLIT_FOREST_VILLAGE,
  WorldSpecSchema,
  hashString,
  type GameSpec,
  type StylePresetId,
  type WorldSpec,
  type WorldSpecInput,
} from "@worldforge/core";
import type { GenLayer } from "@worldforge/world-gen";
import { defaultGameContent } from "@worldforge/roblox-export";

/**
 * Local rule-based interpreter (FR/EN). Not an AI: a deterministic keyword compiler that turns a
 * natural-language brief into a valid WorldSpec/GameSpec. It powers world generation when no agent
 * is installed and gives agents a solid draft to refine.
 */
const has = (text: string, ...words: string[]) => words.some((w) => text.includes(w));

export interface Interpretation {
  spec: WorldSpec;
  game: GameSpec;
  detected: string[];
}

export function interpretPrompt(prompt: string, seed?: number): Interpretation {
  const t = prompt.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const detected: string[] = [];
  const tag = (s: string) => detected.push(s);

  // ---- style / theme
  let stylePreset: StylePresetId = "stylized_mystical";
  let theme = "mysterious_forest";
  if (has(t, "cyberpunk", "neon", "futurist", "sci-fi", "scifi")) (stylePreset = "cyberpunk"), (theme = "neon_city"), tag("cyberpunk");
  else if (has(t, "desert", "sable", "dune", "oasis")) (stylePreset = "desert"), (theme = "desert"), tag("desert");
  else if (has(t, "neige", "snow", "hiver", "winter", "glace", "ice")) (stylePreset = "winter"), (theme = "winter"), tag("winter");
  else if (has(t, "marais", "swamp", "marecage", "bog")) (stylePreset = "swamp"), (theme = "swamp"), tag("swamp");
  else if (has(t, "tropical", "ile ", "island", "plage", "beach", "jungle", "paradis")) (stylePreset = "tropical"), (theme = "tropical_island"), tag("tropical");
  else if (has(t, "cartoon", "toon", "mignon", "cute", "kawaii")) (stylePreset = "cartoon"), (theme = "cartoon_meadow"), tag("cartoon");
  else if (has(t, "dark fantasy", "maudit", "cursed", "horreur", "horror", "sombre", "hante", "haunted", "demon")) (stylePreset = "dark_fantasy"), (theme = "cursed_lands"), tag("dark_fantasy");
  else if (has(t, "medieval", "chateau", "castle", "chevalier", "knight", "royaume", "kingdom")) (stylePreset = "medieval"), (theme = "medieval_kingdom"), tag("medieval");
  else if (has(t, "fantasy", "fantastique", "feerique", "magie", "magic", "enchant")) (stylePreset = "fantasy"), (theme = "fantasy_realm"), tag("fantasy");
  else if (has(t, "myster", "brume", "brouillard", "fog", "mist", "lune", "moon", "nuit", "night")) (stylePreset = "stylized_mystical"), (theme = "mysterious_forest"), tag("mystical");
  else if (has(t, "foret", "forest", "bois", "woods")) (stylePreset = "stylized_mystical"), (theme = "forest"), tag("forest");
  else if (has(t, "prairie", "meadow", "campagne", "countryside", "ferme", "farm")) (stylePreset = "fantasy"), (theme = "meadow"), tag("meadow");

  // ---- biomes
  const biomes: WorldSpecInput["biomes"] = [];
  const forest = has(t, "foret", "forest", "bois", "woods", "arbre", "tree", "jungle");
  const dark = has(t, "myster", "sombre", "dark", "brume", "fog", "mist", "nuit", "night", "hante");
  switch (stylePreset) {
    case "desert":
      biomes.push({ id: "desert", weight: 0.7, vegetation: "sparse" }, { id: "rocky", weight: 0.3, vegetation: "sparse" });
      break;
    case "winter":
      biomes.push({ id: "snow", weight: 0.6, vegetation: "sparse" }, { id: "pine_forest", weight: 0.4, vegetation: "medium" });
      break;
    case "swamp":
      biomes.push({ id: "swamp", weight: 0.6, vegetation: "dense" }, { id: "dark_forest", weight: 0.4, vegetation: "dense" });
      break;
    case "tropical":
      biomes.push({ id: "beach", weight: 0.3, vegetation: "sparse", elevation: [0, 0.2] }, { id: "forest", weight: 0.5, vegetation: "dense" }, { id: "highlands", weight: 0.2, vegetation: "sparse" });
      break;
    case "cyberpunk":
      biomes.push({ id: "rocky", weight: 0.6, vegetation: "none" }, { id: "meadow", weight: 0.4, vegetation: "sparse" });
      break;
    case "dark_fantasy":
      biomes.push({ id: "dark_forest", weight: 0.5, vegetation: "dense" }, { id: "ruins_field", weight: 0.3, vegetation: "sparse" }, { id: "swamp", weight: 0.2, vegetation: "medium" });
      break;
    case "medieval":
    case "fantasy":
      biomes.push({ id: "meadow", weight: forest ? 0.4 : 0.6, vegetation: "sparse" }, { id: "forest", weight: forest ? 0.6 : 0.4, vegetation: "medium" });
      break;
    default:
      biomes.push({ id: dark ? "dark_forest" : "forest", weight: 0.55, vegetation: "dense" }, { id: "meadow", weight: 0.3, vegetation: "sparse" });
      if (has(t, "champignon", "mushroom", "fungi")) biomes.push({ id: "mushroom_grove", weight: 0.3, vegetation: "medium" });
      if (has(t, "montagne", "mountain", "rocher", "rock", "falaise", "cliff")) biomes.push({ id: "rocky", weight: 0.2, vegetation: "sparse", elevation: [0.7, 1] });
  }

  // ---- terrain
  const features: NonNullable<WorldSpecInput["terrain"]>["features"] = [];
  const mountains = has(t, "montagne", "mountain", "pic", "peak", "alpin", "sommet");
  if (mountains || stylePreset !== "cyberpunk") features.push({ type: "mountains", placement: "edge", edges: mountains ? ["north", "west", "east"] : ["north", "west"], intensity: mountains ? 1 : 0.85, reach: mountains ? 0.3 : 0.25 });
  features.push({ type: "hills", intensity: has(t, "plat", "flat") ? 0.2 : has(t, "vallonn", "hilly", "colline", "hill") ? 0.8 : 0.55, scale: 1.1 });
  if (has(t, "vallee", "valley", "village", "lac", "lake")) features.push({ type: "valley", center: [0.52, 0.56], radius: 0.3, depth: 0.5 });
  if (has(t, "plateau")) features.push({ type: "plateau", center: [0.3, 0.3], radius: 0.18, height: 0.6 });
  if (has(t, "falaise", "cliff", "canyon")) features.push({ type: "cliffs", intensity: 0.7 });
  if (has(t, "cratere", "crater", "volcan", "volcano", "meteor")) features.push({ type: "crater", center: [0.65, 0.4], radius: 0.15 });
  const relief = has(t, "plat", "flat") ? 0.3 : mountains ? 0.75 : 0.62;

  // ---- water
  const rivers: WorldSpecInput["rivers"] = [];
  const lakes: WorldSpecInput["lakes"] = [];
  if (has(t, "riviere", "river", "ruisseau", "stream", "fleuve", "cours d'eau")) rivers.push({ id: "river_1", from: "north", to: "south-east", width: 16, depth: 6, meander: 0.65 }), tag("river");
  if (has(t, "lac", "lake", "etang", "pond")) lakes.push({ id: "lake_1", center: [0.32, 0.36], radius: 80 }), tag("lake");
  if (has(t, "ile ", "island") && lakes.length === 0 && rivers.length === 0) rivers.push({ id: "channel", from: "west", to: "east", width: 40, depth: 8, meander: 0.5 });

  // ---- landmarks
  const landmarks: WorldSpecInput["landmarks"] = [];
  const addLm = (id: string, type: NonNullable<WorldSpecInput["landmarks"]>[number]["type"], role: "focal" | "secondary" | "hidden", zone: NonNullable<WorldSpecInput["landmarks"]>[number]["preferredZone"]) => {
    if (!landmarks.some((l) => l.id === id)) landmarks.push({ id, type, role, preferredZone: zone, scale: 1 });
  };
  if (has(t, "chateau", "castle", "forteresse", "fortress")) addLm("castle", "castle", "focal", "hill");
  if (has(t, "arbre geant", "giant tree", "grand arbre", "arbre-monde", "world tree", "arbre ancien")) addLm("giant_tree", "giant_tree", "focal", "hill");
  if (has(t, "temple")) addLm("temple", "temple", landmarks.length ? "secondary" : "focal", "valley");
  if (has(t, "moulin", "windmill")) addLm("windmill", "windmill", landmarks.length ? "secondary" : "focal", "hill");
  if (has(t, "statue", "monument", "colosse")) addLm("statue", "statue", "secondary", "clearing");
  if (has(t, "portail", "portal", "gate")) addLm("portal", "portal", "hidden", "forest_edge");
  if (has(t, "tour", "tower", "phare", "lighthouse", "donjon")) addLm("tower", "tower", "secondary", "ridge");
  if (has(t, "ruine", "ruin", "vestige", "ancien", "ancient", "abandon")) addLm("old_ruins", "ruins", landmarks.length ? "secondary" : "focal", "forest_edge");
  if (has(t, "volcan", "volcano")) addLm("volcano", "volcano", "focal", "ridge");
  if (landmarks.length === 0) {
    // every world needs a focal point
    if (stylePreset === "cyberpunk") addLm("portal", "portal", "focal", "plateau");
    else if (stylePreset === "desert") addLm("temple", "temple", "focal", "plateau");
    else if (stylePreset === "medieval") addLm("castle", "castle", "focal", "hill");
    else if (stylePreset === "fantasy" || stylePreset === "cartoon") addLm("windmill", "windmill", "focal", "hill");
    else addLm("giant_tree", "giant_tree", "focal", "hill");
  }
  if (!landmarks.some((l) => l.role === "secondary") && !has(t, "minimal", "simple")) addLm("old_ruins", "ruins", "secondary", "forest_edge");

  // ---- settlements
  const settlements: WorldSpecInput["settlements"] = [];
  const abandoned = has(t, "abandon", "deserted", "ruine", "hante", "haunted", "fantome", "ghost");
  const count = (() => {
    const m = /(\d+)\s*(maisons|houses|batiments|buildings|huttes|huts|cabanes|cabins)/.exec(t);
    return m ? Math.max(1, Math.min(30, Number(m[1]))) : undefined;
  })();
  if (has(t, "ville", "town", "city", "cite")) settlements.push({ id: "town", type: abandoned ? "ruined_town" : "village", buildings: count ?? 14, layout: "organic", near: rivers[0]?.id, weathering: abandoned ? 0.9 : 0.3 }), tag("town");
  else if (has(t, "village", "hameau", "hamlet", "colonie", "settlement")) settlements.push({ id: "village", type: abandoned ? "abandoned_village" : has(t, "hameau", "hamlet") ? "hamlet" : "village", buildings: count ?? 7, layout: "organic", near: rivers[0]?.id ?? lakes[0]?.id, weathering: abandoned ? 0.7 : 0.35 }), tag("village");
  else if (has(t, "camp", "campement", "bivouac", "avant-poste", "outpost")) settlements.push({ id: "camp", type: has(t, "outpost", "avant-poste") ? "outpost" : "camp", buildings: count ?? 4, layout: "ring", weathering: 0.4 }), tag("camp");
  else if (has(t, "maison", "house", "cabane", "cabin", "chaumiere", "cottage")) settlements.push({ id: "hamlet", type: "hamlet", buildings: count ?? 3, layout: "organic", weathering: 0.3 });

  // ---- roads
  const roads: WorldSpecInput["roads"] = [];
  const roadType = has(t, "pave", "cobble") ? "cobblestone_road" : has(t, "terre", "dirt", "sentier", "trail") ? "dirt_path" : stylePreset === "tropical" || stylePreset === "swamp" ? "wooden_walkway" : "stone_path";
  const focalId = landmarks.find((l) => l.role === "focal")?.id;
  const mainNodes = ["spawn", ...(settlements[0] ? [settlements[0].id] : []), ...(focalId ? [focalId] : [])];
  if (mainNodes.length >= 2) roads.push({ id: "main_path", type: roadType, connects: mainNodes, width: 7 });
  const secondary = landmarks.find((l) => l.role === "secondary");
  if (secondary && settlements[0]) roads.push({ id: "side_path", type: "dirt_path", connects: [settlements[0].id, secondary.id], width: 5 });

  // ---- vegetation
  type Species = NonNullable<NonNullable<WorldSpecInput["vegetation"]>["species"]>[number];
  const species: Species[] = [];
  const pushSp = (...list: Species[]) => {
    for (const x of list) if (!species.includes(x)) species.push(x);
  };
  switch (stylePreset) {
    case "desert":
      pushSp("cactus", "palm", "dead_tree", "bush", "grass");
      break;
    case "winter":
      pushSp("pine", "dead_tree", "bush", "grass");
      break;
    case "swamp":
      pushSp("willow", "dead_tree", "giant_mushroom", "small_mushroom", "fern", "grass", "log");
      break;
    case "tropical":
      pushSp("palm", "round_tree", "bush", "fern", "flower", "grass");
      break;
    case "cyberpunk":
      pushSp("round_tree", "bush", "grass");
      break;
    case "dark_fantasy":
      pushSp("dead_tree", "pine", "willow", "giant_mushroom", "small_mushroom", "fern", "grass", "log");
      break;
    case "medieval":
    case "fantasy":
    case "cartoon":
      pushSp("round_tree", "birch", "pine", "bush", "grass", "flower");
      break;
    default:
      pushSp("pine", "round_tree", "dead_tree", "bush", "fern", "grass", "flower", "log");
      if (has(t, "champignon", "mushroom", "fungi") || dark) pushSp("giant_mushroom", "small_mushroom");
  }
  if (has(t, "champignon", "mushroom")) pushSp("giant_mushroom", "small_mushroom"), tag("mushrooms");
  if (has(t, "fleur", "flower")) pushSp("flower");
  const density = has(t, "dense", "epais", "thick", "luxuriant", "lush") ? 0.85 : has(t, "clairsem", "sparse", "vide", "empty", "aride") ? 0.3 : stylePreset === "desert" || stylePreset === "cyberpunk" ? 0.2 : 0.7;
  const giantMushrooms = has(t, "champignons geants", "giant mushroom", "champignon geant") ? 0.7 : species.includes("giant_mushroom") ? 0.4 : 0;

  // ---- props
  const sets: NonNullable<WorldSpecInput["props"]>["sets"] = [];
  if (settlements.length) sets.push("village");
  if (forest || stylePreset === "stylized_mystical" || stylePreset === "dark_fantasy" || stylePreset === "swamp") sets.push("forest");
  if (landmarks.some((l) => l.type === "ruins" || l.type === "temple") || abandoned) sets.push("ruins");
  if (has(t, "camp", "feu", "campfire", "bivouac")) sets.push("camp");
  if (has(t, "cimetiere", "graveyard", "tombe", "grave")) sets.push("graveyard");
  if (has(t, "ferme", "farm", "moulin")) sets.push("farm");
  if (sets.length === 0) sets.push("forest");

  // ---- lighting & atmosphere
  const night = has(t, "nuit", "night", "lune", "moon", "nocturne", "etoile", "star");
  const dusk = has(t, "crepuscule", "dusk", "coucher", "sunset");
  const dawn = has(t, "aube", "dawn", "lever", "sunrise", "matin", "morning");
  const timeOfDay = night ? 20.5 : dusk ? 18.2 : dawn ? 6.5 : stylePreset === "cyberpunk" || stylePreset === "dark_fantasy" ? 20 : 13;
  const mood = stylePreset === "dark_fantasy" ? "eerie" : night ? "moonlit" : dusk ? "dusk" : dawn ? "dawn" : has(t, "orage", "storm", "pluie", "rain") ? "stormy" : has(t, "nuage", "cloud", "gris", "overcast") ? "overcast" : stylePreset === "fantasy" || stylePreset === "desert" || stylePreset === "tropical" ? "golden" : stylePreset === "cartoon" ? "bright" : has(t, "myster", "brume", "fog", "mist") ? "moonlit" : "soft";
  const fogDensity = has(t, "brume", "brouillard", "fog", "mist", "myster") ? 0.55 : stylePreset === "dark_fantasy" || stylePreset === "swamp" ? 0.65 : stylePreset === "cartoon" || stylePreset === "tropical" ? 0.15 : 0.3;

  // ---- size
  const width = has(t, "immense", "enorme", "huge", "gigantesque", "massive") ? 2048 : has(t, "grand", "large", "big", "vaste") ? 1536 : has(t, "petit", "small", "tiny", "mini") ? 768 : 1024;

  // ---- name
  const name = titleFromPrompt(prompt, stylePreset);

  const specInput: WorldSpecInput = {
    ...MOONLIT_FOREST_VILLAGE,
    id: "main",
    name,
    seed: seed ?? hashString(prompt) % 1_000_000,
    theme,
    stylePreset,
    size: { width, depth: width },
    terrain: { baseHeight: 40, relief, roughness: 0.45, erosion: 0.55, features },
    biomes,
    rivers,
    lakes,
    landmarks,
    settlements,
    roads,
    vegetation: { density, clustering: 0.6, species, sizeVariation: 0.55, giantMushrooms },
    props: { density: 0.55, sets },
    lighting: { timeOfDay, mood, brightness: night ? 0.5 : 0.75, shadows: true },
    atmosphere: { fogDensity, fogColor: fogColorFor(stylePreset), haze: fogDensity, skyTint: skyFor(stylePreset) },
    cameraComposition: { spawnFacing: focalId, spawnZone: "clearing" },
    gameplayHints: gameplayHints(t),
    notes: prompt,
  };
  const spec = WorldSpecSchema.parse(specInput);
  const game = interpretGame(prompt, spec);
  return { spec, game, detected };
}

function gameplayHints(t: string): string[] {
  const hints: string[] = [];
  if (has(t, "surviv", "survie")) hints.push("survival");
  if (has(t, "obby", "parcours", "platform", "saut")) hints.push("obby");
  if (has(t, "tycoon")) hints.push("tycoon");
  if (has(t, "simulat")) hints.push("simulator");
  if (has(t, "rpg", "quete", "quest", "aventure", "adventure")) hints.push("rpg");
  if (has(t, "horreur", "horror", "peur", "scary")) hints.push("horror");
  if (has(t, "course", "racing", "race")) hints.push("racing");
  if (has(t, "roleplay", "rp ")) hints.push("roleplay");
  if (has(t, "combat", "fight", "battle", "arme", "weapon", "pvp")) hints.push("combat");
  if (has(t, "collect", "ramass", "recolte", "gather")) hints.push("collectibles");
  if (has(t, "pet", "animaux", "compagnon", "egg", "oeuf")) hints.push("pets");
  if (hints.length === 0) hints.push("exploration", "collectibles");
  return hints;
}

export function interpretGame(prompt: string, spec: WorldSpec): GameSpec {
  const t = prompt.toLowerCase();
  const hints = spec.gameplayHints;
  const genre = hints.includes("survival") ? "survival" : hints.includes("obby") ? "obby" : hints.includes("tycoon") ? "tycoon" : hints.includes("simulator") ? "simulator" : hints.includes("rpg") ? "rpg" : hints.includes("horror") ? "horror" : hints.includes("racing") ? "racing" : hints.includes("roleplay") ? "roleplay" : hints.includes("combat") ? "battle" : "adventure";
  const systems: GameSpec["systems"] = [{ id: "player_data", description: "Persistent profile, leaderstats", params: {} }, { id: "currency", description: "Main currency", params: {} }, { id: "collectibles", description: "Collect items in the world", params: {} }];
  if (genre === "survival") systems.push({ id: "survival_stats", description: "Hunger drains; eat to survive", params: {} }, { id: "day_night", description: "Day/night cycle", params: {} }, { id: "crafting", description: "Craft tools from gathered items", params: {} });
  if (genre === "obby") systems.push({ id: "checkpoints", description: "Stage checkpoints", params: {} }, { id: "obby", description: "Platforming course", params: {} });
  if (genre === "tycoon") systems.push({ id: "tycoon", description: "Buy droppers/upgrades", params: {} });
  if (genre === "simulator") systems.push({ id: "simulator_loop", description: "Click/collect → sell → upgrade", params: {} }, { id: "shop", description: "Upgrades shop", params: {} });
  if (genre === "rpg" || genre === "adventure") systems.push({ id: "quests", description: "Quest log", params: {} }, { id: "npcs", description: "Villagers & quest givers", params: {} }, { id: "inventory", description: "Inventory", params: {} });
  if (genre === "horror") systems.push({ id: "rounds", description: "Survive rounds", params: {} }, { id: "day_night", description: "Permanent night", params: {} });
  if (genre === "battle" || hints.includes("combat")) systems.push({ id: "weapons", description: "Weapons", params: {} }, { id: "combat", description: "Damage & health", params: {} });
  if (hints.includes("pets")) systems.push({ id: "pets", description: "Hatch & equip pets", params: {} });
  systems.push({ id: "leaderboards", description: "Global leaderboard", params: {} });
  const ui: GameSpec["ui"] = { screens: ["hud", "inventory", "shop", "settings", ...(systems.some((s) => s.id === "quests") ? (["quests"] as const) : []), "loading"], style: spec.stylePreset === "cyberpunk" ? "sci-fi" : spec.stylePreset === "cartoon" ? "cartoon" : "stylized", accentColor: spec.colorPalette.accent };
  return GameSpecSchema.parse({
    title: spec.name,
    tagline: `A ${genre} experience in ${spec.theme.replace(/_/g, " ")}`,
    description: prompt,
    genre,
    subGenres: hints.filter((h) => h !== genre && ["survival", "adventure", "obby", "tycoon", "simulator", "rpg", "horror", "roleplay", "battle", "exploration", "puzzle", "racing"].includes(h)),
    targetAudience: t.includes("enfant") || t.includes("kids") ? "kids" : "all",
    coreLoop: coreLoopFor(genre),
    systems,
    currencies: [{ id: "coins", name: "Coins", icon: "coin", startingAmount: 0 }],
    items: [{ id: "mushroom", name: "Glowing Mushroom", category: "food", rarity: "common", stackable: true }],
    npcs: spec.settlements.length ? defaultGameContent().npcs.map((n) => ({ ...n, location: spec.settlements[0]!.id })) : [],
    quests: [{ id: "first_light", title: "First Light", description: "Collect 5 glowing mushrooms.", objective: { type: "collect", target: "mushroom", count: 5 }, reward: { currency: "coins", amount: 50 } }],
    ui,
    monetization: defaultGameContent().monetization,
    shop: defaultGameContent().shop,
    animations: defaultGameContent().animations,
    worldBrief: spec.notes ?? "",
    audioBrief: `${spec.lighting.mood} ${spec.theme.replace(/_/g, " ")} ambience, soft music, nature SFX`,
  });
}

function coreLoopFor(genre: string): string[] {
  switch (genre) {
    case "survival":
      return ["Explore the world", "Gather food & resources", "Manage hunger", "Craft and progress", "Discover landmarks"];
    case "obby":
      return ["Run the course", "Reach checkpoints", "Unlock stages", "Compete on the leaderboard"];
    case "tycoon":
      return ["Collect income", "Buy upgrades", "Expand the base", "Prestige"];
    case "simulator":
      return ["Collect", "Sell", "Upgrade", "Unlock areas"];
    case "horror":
      return ["Survive the night", "Find clues", "Escape"];
    default:
      return ["Explore", "Collect", "Complete quests", "Upgrade", "Discover landmarks"];
  }
}

function titleFromPrompt(prompt: string, preset: StylePresetId): string {
  const cleaned = prompt.replace(/^(cree|crée|créer|create|make|fais|fait|build|génère|genere|generate)[- ]?(moi|me)?\s*(un|une|a|an)?\s*(jeu|game)?\s*(roblox)?\s*(de|d'|of)?\s*/i, "").trim();
  const words = cleaned.split(/\s+/).slice(0, 5).join(" ");
  const base = words.length > 4 ? words.charAt(0).toUpperCase() + words.slice(1) : preset.replace(/_/g, " ");
  return base.replace(/[.,;!?]+$/, "").slice(0, 48);
}

function fogColorFor(p: StylePresetId): string {
  return { stylized_mystical: "#7d8aa3", fantasy: "#b7c8e6", medieval: "#a7b1bf", cartoon: "#cfe9ff", dark_fantasy: "#3f4656", cyberpunk: "#2a1f4a", desert: "#e8d6b8", tropical: "#cfeeff", winter: "#d3dde8", swamp: "#7d8a73" }[p];
}
function skyFor(p: StylePresetId): string {
  return { stylized_mystical: "#6d7d9a", fantasy: "#8fb4e6", medieval: "#94a5b8", cartoon: "#8fd3ff", dark_fantasy: "#2f3542", cyberpunk: "#1a1533", desert: "#9fd0ff", tropical: "#8fd8ff", winter: "#b9cce0", swamp: "#8a9a8a" }[p];
}

// ---------------------------------------------------------------------------
// Modifications: "plus médiéval", "ajoute une rivière derrière le village", "moins d'arbres"…
// ---------------------------------------------------------------------------
export interface Modification {
  spec: WorldSpec;
  regenerate: GenLayer[];
  summary: string[];
  newSeed: boolean;
}

export function interpretModification(spec: WorldSpec, prompt: string): Modification {
  const t = prompt.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const draft: WorldSpec = JSON.parse(JSON.stringify(spec));
  const layers = new Set<GenLayer>();
  const summary: string[] = [];
  let newSeed = false;
  const MORE = ["plus de", "plus d'", "more", "davantage", "beaucoup", "ajoute", "add", "augment", "increase", "dense"];
  const LESS = ["moins", "less", "fewer", "reduce", "reduis", "enleve", "supprime", "remove", "retire"];
  const more = has(t, ...MORE);
  const less = has(t, ...LESS);
  /** Polarity of the words right before a subject keyword ("moins d'arbres et plus de brume"). */
  const polarity = (...subject: string[]): number => {
    let best = 0;
    for (const w of subject) {
      const idx = t.indexOf(w);
      if (idx < 0) continue;
      const before = t.slice(Math.max(0, idx - 28), idx);
      const li = Math.max(...LESS.map((x) => before.lastIndexOf(x)));
      const mi = Math.max(...MORE.map((x) => before.lastIndexOf(x)));
      if (li < 0 && mi < 0) continue;
      best = mi > li ? 0.2 : -0.2;
      break;
    }
    if (best === 0) best = more && !less ? 0.2 : less && !more ? -0.2 : 0;
    return best;
  };
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  if (has(t, "arbre", "tree", "vegetation", "foret", "forest", "plante")) {
    const delta = polarity("arbre", "tree", "vegetation", "foret", "forest", "plante");
    if (delta !== 0) {
      draft.vegetation.density = clamp01(draft.vegetation.density + delta);
      summary.push(`vegetation density → ${draft.vegetation.density.toFixed(2)}`);
    } else newSeed = true;
    layers.add("vegetation");
  }
  if (has(t, "champignon", "mushroom")) {
    const delta = polarity("champignon", "mushroom");
    draft.vegetation.giantMushrooms = clamp01(draft.vegetation.giantMushrooms + (delta || 0.3));
    if (!draft.vegetation.species.includes("giant_mushroom")) draft.vegetation.species.push("giant_mushroom", "small_mushroom");
    layers.add("vegetation");
    summary.push(`giant mushrooms → ${draft.vegetation.giantMushrooms.toFixed(2)}`);
  }
  if (has(t, "brume", "brouillard", "fog", "mist", "haze")) {
    const delta = polarity("brume", "brouillard", "fog", "mist", "haze");
    draft.atmosphere.fogDensity = clamp01(draft.atmosphere.fogDensity + (delta || 0.2));
    layers.add("lighting");
    summary.push(`fog → ${draft.atmosphere.fogDensity.toFixed(2)}`);
  }
  if (has(t, "rocher", "rock", "pierre", "stone", "prop", "detail", "objet")) {
    const delta = polarity("rocher", "rock", "pierre", "stone", "prop", "detail", "objet");
    draft.props.density = clamp01(draft.props.density + (delta || 0.2));
    layers.add("props");
    summary.push(`props density → ${draft.props.density.toFixed(2)}`);
  }
  if (has(t, "riviere", "river", "ruisseau", "stream") && !less) {
    if (draft.rivers.length === 0 || has(t, "autre", "another", "second", "deuxieme")) {
      const id = `river_${draft.rivers.length + 1}`;
      draft.rivers.push({ id, from: has(t, "est", "east") ? "east" : has(t, "ouest", "west") ? "west" : "north", to: has(t, "sud", "south") ? "south" : "south-east", width: 14, depth: 6, meander: 0.6 });
      summary.push(`added ${id}`);
    }
    layers.add("water");
    layers.add("roads");
    layers.add("vegetation");
    layers.add("props");
  }
  if (has(t, "lac", "lake", "etang", "pond") && !less) {
    draft.lakes.push({ id: `lake_${draft.lakes.length + 1}`, center: [0.3 + draft.lakes.length * 0.2, 0.35], radius: 70 });
    layers.add("water");
    layers.add("vegetation");
    layers.add("props");
    summary.push("added lake");
  }
  if (has(t, "village", "hameau", "hamlet", "maison", "house")) {
    if (less && draft.settlements[0]) {
      draft.settlements[0].buildings = Math.max(1, draft.settlements[0].buildings - 3);
      summary.push(`buildings → ${draft.settlements[0].buildings}`);
    } else if (draft.settlements.length === 0 || has(t, "autre", "another", "second")) {
      draft.settlements.push({ id: `village_${draft.settlements.length + 1}`, type: has(t, "abandon") ? "abandoned_village" : "village", buildings: 6, layout: "organic", near: draft.rivers[0]?.id, weathering: 0.4 });
      summary.push("added village");
    } else if (more && draft.settlements[0]) {
      draft.settlements[0].buildings = Math.min(30, draft.settlements[0].buildings + 3);
      summary.push(`buildings → ${draft.settlements[0].buildings}`);
    }
    if (!draft.props.sets.includes("village")) draft.props.sets.push("village");
    layers.add("buildings");
    layers.add("roads");
    layers.add("vegetation");
    layers.add("props");
  }
  const lmTypes: [string[], WorldSpec["landmarks"][number]["type"], WorldSpec["landmarks"][number]["preferredZone"]][] = [
    [["chateau", "castle"], "castle", "hill"],
    [["tour", "tower"], "tower", "ridge"],
    [["temple"], "temple", "valley"],
    [["ruine", "ruin"], "ruins", "forest_edge"],
    [["statue"], "statue", "clearing"],
    [["portail", "portal"], "portal", "forest_edge"],
    [["moulin", "windmill"], "windmill", "hill"],
    [["arbre geant", "giant tree"], "giant_tree", "hill"],
    [["puits", "well"], "well", "village"],
  ];
  for (const [words, type, zone] of lmTypes) {
    if (has(t, ...words) && !less && !draft.landmarks.some((l) => l.type === type)) {
      draft.landmarks.push({ id: type, type, role: draft.landmarks.length === 0 ? "focal" : "secondary", preferredZone: zone, scale: 1 });
      layers.add("landmarks");
      layers.add("roads");
      layers.add("vegetation");
      layers.add("props");
      summary.push(`added landmark ${type}`);
    }
  }
  const presets: [string[], StylePresetId][] = [
    [["medieval"], "medieval"],
    [["cyberpunk", "neon"], "cyberpunk"],
    [["cartoon"], "cartoon"],
    [["dark fantasy", "sombre", "darker", "maudit", "cursed"], "dark_fantasy"],
    [["fantasy", "feerique"], "fantasy"],
    [["desert"], "desert"],
    [["neige", "snow", "hiver", "winter"], "winter"],
    [["marais", "swamp"], "swamp"],
    [["tropical", "plage", "beach"], "tropical"],
    [["mystique", "mystical", "mysterieux"], "stylized_mystical"],
  ];
  for (const [words, preset] of presets) {
    if (has(t, ...words) && draft.stylePreset !== preset) {
      draft.stylePreset = preset;
      for (const l of ["terrain", "water", "roads", "landmarks", "buildings", "vegetation", "props", "lighting"] as GenLayer[]) layers.add(l);
      summary.push(`style → ${preset}`);
    }
  }
  if (has(t, "nuit", "night", "lune", "moon")) {
    draft.lighting.timeOfDay = 20.5;
    draft.lighting.mood = "moonlit";
    layers.add("lighting");
    summary.push("time → night");
  } else if (has(t, "jour", "day", "soleil", "sun", "matin")) {
    draft.lighting.timeOfDay = 12;
    draft.lighting.mood = "golden";
    layers.add("lighting");
    summary.push("time → day");
  }
  if (has(t, "clair", "bright", "lumin") && !has(t, "nuit", "night")) {
    draft.lighting.brightness = clamp01(draft.lighting.brightness + 0.2);
    layers.add("lighting");
  }
  if (has(t, "montagne", "mountain")) {
    if (!draft.terrain.features.some((f) => f.type === "mountains")) draft.terrain.features.push({ type: "mountains", placement: "edge", edges: ["north", "west"], intensity: 0.9, reach: 0.25 });
    draft.terrain.relief = clamp01(draft.terrain.relief + 0.15);
    for (const l of ["terrain", "water", "roads", "landmarks", "buildings", "vegetation", "props"] as GenLayer[]) layers.add(l);
    summary.push("more mountains");
  }
  if (has(t, "plat", "flat", "moins de relief")) {
    draft.terrain.relief = clamp01(draft.terrain.relief - 0.2);
    for (const l of ["terrain", "water", "roads", "landmarks", "buildings", "vegetation", "props"] as GenLayer[]) layers.add(l);
    summary.push(`relief → ${draft.terrain.relief.toFixed(2)}`);
  }
  if (has(t, "plus grand", "bigger", "larger", "agrandi")) {
    draft.size.width = Math.min(4096, Math.round(draft.size.width * 1.5));
    draft.size.depth = draft.size.width;
    for (const l of ["terrain", "water", "roads", "landmarks", "buildings", "vegetation", "props"] as GenLayer[]) layers.add(l);
    summary.push(`size → ${draft.size.width}`);
  }
  if (has(t, "regenere", "regenerate", "recommence", "autre version", "different", "nouvelle", "new seed", "reroll")) {
    newSeed = true;
    if (layers.size === 0) for (const l of ["vegetation", "props"] as GenLayer[]) layers.add(l);
  }
  if (layers.size === 0) {
    // unknown request: treat as a vegetation/props refresh with the note appended
    layers.add("vegetation");
    layers.add("props");
    newSeed = true;
    summary.push("no known keyword: refreshed vegetation & props");
  }
  draft.notes = `${spec.notes ?? ""}\n${prompt}`.trim();
  return { spec: WorldSpecSchema.parse(draft), regenerate: [...layers], summary, newSeed };
}
