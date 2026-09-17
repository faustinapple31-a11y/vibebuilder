import {
  GENRES,
  GENRE_INDEX,
  GameSpecSchema,
  MOONLIT_FOREST_VILLAGE,
  STYLE_FAMILY_INDEX,
  VEGETATION_KIT_SPECIES,
  WorldSpecSchema,
  hashString,
  matchGenre,
  matchStyleFamily,
  detectLocale,
  pickUiKit,
  type GameSpec,
  type GenreDef,
  type StyleFamilyDef,
  type StylePresetId,
  type WorldSpec,
  type WorldSpecInput,
} from "@worldforge/core";
import type { GenLayer } from "@worldforge/world-gen";
import { defaultGameContent } from "@worldforge/roblox-export";

/**
 * Local rule-based interpreter (FR/EN). Not an AI: a deterministic keyword compiler that turns a
 * natural-language brief into a valid WorldSpec/GameSpec. It is driven by the universal taxonomy
 * (every style family and genre carries its own keywords, kits, biomes, landmarks, systems and
 * layout), so any genre × any style resolves to a coherent world. It powers generation when no
 * agent is installed and gives agents a solid draft to refine.
 */
const has = (text: string, ...words: string[]) => words.some((w) => text.includes(w));

export interface Interpretation {
  spec: WorldSpec;
  game: GameSpec;
  detected: string[];
}

type LandmarkType = NonNullable<WorldSpecInput["landmarks"]>[number]["type"];
type ZoneHint = NonNullable<WorldSpecInput["landmarks"]>[number]["preferredZone"];

/** Prompt keywords → landmark type (checked in order; the first match becomes the focal landmark). */
const LANDMARK_KEYWORDS: [LandmarkType, string[], ZoneHint][] = [
  ["crashed_plane", ["avion", "plane", "airliner", "crash", "boeing", "airbus", "jet"], "clearing"],
  ["castle", ["chateau", "castle", "forteresse", "fortress", "keep"], "hill"],
  ["giant_tree", ["arbre geant", "giant tree", "grand arbre", "arbre-monde", "world tree", "arbre ancien"], "hill"],
  ["pyramid", ["pyramide", "pyramid"], "flat"],
  ["colosseum", ["colisee", "colosseum", "amphitheatre", "arene antique"], "flat"],
  ["torii_gate", ["torii", "portique", "sanctuaire", "shrine"], "clearing"],
  ["lighthouse", ["phare", "lighthouse"], "coast"],
  ["cave", ["grotte", "cave", "caverne", "cavern", "souterrain", "underground", "mine abandonnee", "abandoned mine"], "hill"],
  ["pirate_ship", ["navire", "galion", "galleon", "bateau pirate", "pirate ship", "epave", "shipwreck", "vaisseau pirate"], "coast"],
  ["rocket", ["fusee", "rocket", "lanceur", "launch pad"], "flat"],
  ["ufo", ["ovni", "ufo", "soucoupe", "saucer"], "clearing"],
  ["dome_base", ["dome", "biodome", "habitat"], "flat"],
  ["crystal_spire", ["cristal geant", "crystal spire", "flechecristal", "cristaux geants", "giant crystal"], "ridge"],
  ["ferris_wheel", ["grande roue", "ferris", "fete foraine", "carnival", "parc d'attraction", "amusement"], "flat"],
  ["stadium", ["stade", "stadium", "arene sportive"], "flat"],
  ["radio_tower", ["antenne", "radio tower", "tour radio", "pylone", "relais"], "ridge"],
  ["skyscraper", ["gratte-ciel", "skyscraper", "tour de bureaux", "office tower"], "flat"],
  ["skyscraper_ruin", ["immeuble effondre", "ruined skyscraper", "tour effondree", "collapsed tower"], "flat"],
  ["water_tower", ["chateau d'eau", "water tower"], "hill"],
  ["gas_station", ["station-service", "station service", "gas station", "pompe a essence"], "flat"],
  ["church", ["eglise", "church", "chapelle", "chapel", "cathedrale", "cathedral"], "village"],
  ["barn", ["grange", "barn", "etable", "silo"], "flat"],
  ["obelisk", ["obelisque", "obelisk"], "flat"],
  ["fountain", ["fontaine", "fountain"], "village"],
  ["waterfall_cliff", ["cascade", "waterfall", "chute d'eau"], "riverbank"],
  ["temple", ["temple", "sanctuaire perdu", "lost temple"], "valley"],
  ["windmill", ["moulin", "windmill"], "hill"],
  ["statue", ["statue", "monument", "colosse"], "clearing"],
  ["portal", ["portail", "portal", "gate magique", "magic gate"], "forest_edge"],
  ["tower", ["tour de guet", "watchtower", "donjon", "tour"], "ridge"],
  ["ruins", ["ruine", "ruin", "vestige", "ancien", "ancient", "abandon"], "forest_edge"],
  ["volcano", ["volcan", "volcano"], "ridge"],
  ["well", ["puits", "well"], "village"],
];

const LANDMARK_ZONE: Partial<Record<LandmarkType, ZoneHint>> = Object.fromEntries(LANDMARK_KEYWORDS.map(([t, , z]) => [t, z]));

export function interpretPrompt(prompt: string, seed?: number): Interpretation {
  const t = prompt.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const detected: string[] = [];
  const tag = (s: string) => detected.push(s);

  // ---- genre + style family (taxonomy keyword matching; the genre suggests a style when none is named)
  const genre: GenreDef = matchGenre(t, GENRES) ?? GENRE_INDEX.adventure!;
  tag(`genre:${genre.id}`);
  const named = matchStyleFamily(t);
  const fam: StyleFamilyDef = named ?? STYLE_FAMILY_INDEX[genre.defaultStyles[0]!] ?? STYLE_FAMILY_INDEX.stylized_mystical!;
  tag(`style:${fam.id}${named ? "" : " (from genre)"}`);
  const stylePreset = fam.id as StylePresetId;
  const modern = fam.group === "modern" || fam.group === "future" || fam.group === "apocalyptic";
  const theme = `${fam.id}_${genre.id}`;

  // ---- biomes: the family's preferred biomes, nudged by the prompt
  const forest = has(t, "foret", "forest", "bois", "woods", "arbre", "tree", "jungle");
  const dark = has(t, "myster", "sombre", "dark", "brume", "fog", "mist", "nuit", "night", "hante");
  const biomes: WorldSpecInput["biomes"] = fam.biomes.slice(0, 3).map((id, i) => ({ id: id as never, weight: [0.55, 0.3, 0.15][i]!, vegetation: fam.vegetationDensity > 0.6 ? "dense" : fam.vegetationDensity > 0.3 ? "medium" : "sparse" }));
  if (forest && !biomes.some((b) => b.id === "forest" || b.id === "jungle" || b.id === "dark_forest" || b.id === "pine_forest")) biomes.push({ id: dark ? "dark_forest" : fam.vegetationKit === "jungle" ? "jungle" : fam.vegetationKit === "conifer" || fam.vegetationKit === "arctic" ? "pine_forest" : "forest", weight: 0.45, vegetation: "dense" });
  if (has(t, "montagne", "mountain", "rocher", "rock", "falaise", "cliff") && !biomes.some((b) => b.id === "rocky")) biomes.push({ id: "rocky", weight: 0.2, vegetation: "sparse", elevation: [0.7, 1] });
  if (has(t, "champignon", "mushroom", "fungi") && !biomes.some((b) => b.id === "mushroom_grove")) biomes.push({ id: "mushroom_grove", weight: 0.3, vegetation: "medium" });
  if (has(t, "marais", "swamp", "marecage") && !biomes.some((b) => b.id === "swamp")) biomes.push({ id: "swamp", weight: 0.3, vegetation: "medium" });
  if (has(t, "plage", "beach", "cote", "coast") && !biomes.some((b) => b.id === "beach")) biomes.push({ id: "beach", weight: 0.25, vegetation: "sparse", elevation: [0, 0.2] });

  const famType = fam.settlementType ?? "village";

  // ---- terrain
  const features: NonNullable<WorldSpecInput["terrain"]>["features"] = [];
  const mountains = has(t, "montagne", "mountain", "pic", "peak", "alpin", "sommet");
  const flatGenre = genre.layout === "city_grid" || genre.layout === "race_track" || genre.layout === "sports_field" || genre.layout === "tycoon_plots";
  const flat = has(t, "plat", "flat") || (flatGenre && !mountains);
  if (mountains || (!flat && fam.group !== "future")) features.push({ type: "mountains", placement: "edge", edges: mountains ? ["north", "west", "east"] : ["north", "west"], intensity: mountains ? 1 : 0.85, reach: mountains ? 0.3 : 0.25 });
  features.push({ type: "hills", intensity: flat ? 0.15 : has(t, "vallonn", "hilly", "colline", "hill") ? 0.8 : 0.55, scale: 1.1 });
  if (has(t, "vallee", "valley", "village", "lac", "lake")) features.push({ type: "valley", center: [0.52, 0.56], radius: 0.3, depth: 0.5 });
  if (has(t, "plateau")) features.push({ type: "plateau", center: [0.3, 0.3], radius: 0.18, height: 0.6 });
  if (has(t, "falaise", "cliff", "canyon")) features.push({ type: "cliffs", intensity: 0.7 });
  if (has(t, "cratere", "crater", "volcan", "volcano", "meteor") || fam.id === "space_station") features.push({ type: "crater", center: [0.65, 0.4], radius: 0.15 });
  // ocean: an island (prompt, battle-royale layout, tropical / pirate families) or a coast (beach, harbor, lighthouse…)
  const dry = fam.id === "space_station" || fam.id === "underwater" || fam.id === "desert" || fam.id === "wasteland";
  // archipelago: several stylized mesa islands joined by bridges (floating / flying islands, island hopping, "des îles")
  const archipelago = !dry && has(t, "archipel", "archipelago", "iles ", "iles,", "iles.", "islands", "ile flottante", "iles flottantes", "floating island", "sky island", "island hopping", "plateaux flottants", "ilots", "islets");
  const island = !dry && !archipelago && (has(t, "ile ", "ile,", "ile.", "island", "lagon", "lagoon", "atoll") || genre.layout === "island" || fam.id === "tropical" || fam.id === "pirate");
  const coast = !dry && !island && !archipelago && (has(t, "littoral", "coast", "plage", "beach", "port", "harbor", "harbour", "docks", "phare", "lighthouse", "bord de mer", "rivage", "seaside", "ocean") || famType === "harbor");
  if (archipelago) {
    // mesas replace the relief: no mountain band, no hills
    features.length = 0;
    const many = has(t, "beaucoup", "many", "plein", "lots");
    features.push({ type: "archipelago", islands: many ? 7 : 5, terraces: has(t, "plat", "flat") ? 1 : 3, cliffHeight: has(t, "haut", "high", "tall") ? 0.8 : 0.5, mainRadius: 0.22, ruggedness: 0.35 });
    tag("archipelago");
  } else if (island) features.push({ type: "island", center: [0.5, 0.5], radius: has(t, "grande ile", "big island", "large island") ? 0.44 : 0.36, ruggedness: 0.55 }), tag("island");
  else if (coast) features.push({ type: "coast", edges: ["south"], reach: 0.22, ruggedness: 0.5 }), tag("coast");
  const relief = archipelago ? 0.4 : flat ? 0.25 : mountains ? 0.75 : 0.6;

  // ---- water
  const rivers: WorldSpecInput["rivers"] = [];
  const lakes: WorldSpecInput["lakes"] = [];
  if (has(t, "riviere", "river", "ruisseau", "stream", "fleuve", "cours d'eau")) rivers.push({ id: "river_1", from: "north", to: "south-east", width: 16, depth: 6, meander: 0.65 }), tag("river");
  if (has(t, "lac", "lake", "etang", "pond")) lakes.push({ id: "lake_1", center: [0.32, 0.36], radius: 80 }), tag("lake");
  if (fam.id === "space_station" || fam.id === "underwater") rivers.length = 0;

  // ---- landmarks: prompt keywords first, then the family's signature landmarks
  const landmarks: WorldSpecInput["landmarks"] = [];
  const addLm = (id: string, type: LandmarkType, role: "focal" | "secondary" | "hidden", zone: ZoneHint) => {
    if (!landmarks.some((l) => l.id === id || l.type === type)) landmarks.push({ id, type, role, preferredZone: zone, scale: 1 });
  };
  for (const [type, words, zone] of LANDMARK_KEYWORDS) {
    if (!has(t, ...words)) continue;
    addLm(type, type, landmarks.length ? "secondary" : "focal", zone);
    tag(`landmark:${type}`);
    if (landmarks.length >= 4) break;
  }
  if (landmarks.length === 0) addLm(fam.landmarks[0]!, fam.landmarks[0] as LandmarkType, "focal", LANDMARK_ZONE[fam.landmarks[0] as LandmarkType] ?? "hill");
  if (!landmarks.some((l) => l.role === "secondary") && !has(t, "minimal", "simple")) {
    const second = fam.landmarks.find((l) => !landmarks.some((x) => x.type === l)) ?? "ruins";
    addLm(second, second as LandmarkType, "secondary", LANDMARK_ZONE[second as LandmarkType] ?? "forest_edge");
  }

  // ---- settlements
  const settlements: WorldSpecInput["settlements"] = [];
  const abandoned = has(t, "abandon", "deserted", "ruine", "hante", "haunted", "fantome", "ghost", "zombie", "apocalyp", "infect");
  const count = (() => {
    const m = /(\d+)\s*(maisons|houses|batiments|buildings|huttes|huts|cabanes|cabins|immeubles|blocs)/.exec(t);
    return m ? Math.max(1, Math.min(60, Number(m[1]))) : undefined;
  })();
  const interiors = has(t, "interieur", "interior", "inside", "meuble", "furnish", "entrer dans", "walk in") ? true : undefined;
  if (has(t, "ville", "town", "city", "cite", "metropole", "downtown", "quartier")) {
    const city = modern && has(t, "city", "cite", "metropole", "downtown", "gratte", "skyscraper", "immeuble");
    settlements.push({ id: "town", type: abandoned ? (modern ? "abandoned_village" : "ruined_town") : city ? "city_district" : "town", buildings: count ?? (city ? 18 : 14), layout: city || modern ? "grid" : "organic", near: rivers[0]?.id, weathering: abandoned ? 0.9 : 0.3, interiors });
    tag("town");
  } else if (has(t, "village", "hameau", "hamlet", "colonie", "settlement", "banlieue", "suburb", "neighborhood", "neighbourhood", "quartier residentiel")) {
    settlements.push({ id: "village", type: abandoned ? "abandoned_village" : has(t, "hameau", "hamlet") ? "hamlet" : famType === "city_district" ? "town" : famType, buildings: count ?? 9, layout: modern ? "grid" : "organic", near: rivers[0]?.id ?? lakes[0]?.id, weathering: abandoned ? 0.75 : 0.35, interiors });
    tag("village");
  } else if (has(t, "base", "camp", "campement", "bivouac", "avant-poste", "outpost", "station", "colonie")) {
    settlements.push({ id: "base", type: has(t, "outpost", "avant-poste") ? "outpost" : has(t, "camp", "bivouac") ? "camp" : "base", buildings: count ?? 5, layout: has(t, "camp") ? "ring" : "grid", weathering: 0.4, interiors });
    tag("base");
  } else if (has(t, "port", "harbor", "harbour", "docks", "crique", "cove")) {
    settlements.push({ id: "harbor", type: "harbor", buildings: count ?? 8, layout: "organic", near: rivers[0]?.id ?? lakes[0]?.id, weathering: 0.5, interiors });
    tag("harbor");
  } else if (has(t, "ferme", "farm", "ranch")) {
    settlements.push({ id: "farm", type: "farmstead", buildings: count ?? 4, layout: "organic", weathering: 0.35, interiors });
  } else if (has(t, "maison", "house", "cabane", "cabin", "chaumiere", "cottage", "manoir", "mansion")) {
    settlements.push({ id: "hamlet", type: "hamlet", buildings: count ?? 3, layout: "organic", weathering: 0.3, interiors });
  } else if (genre.layout === "settlement" || genre.layout === "open_world" || genre.layout === "city_grid") {
    // most genres want a hub: the family's default settlement
    settlements.push({ id: "hub", type: abandoned ? "abandoned_village" : (famType as never), buildings: count ?? (famType === "city_district" ? 16 : 7), layout: modern ? "grid" : "organic", weathering: abandoned ? 0.8 : 0.35, interiors });
  }

  // ---- roads
  const roads: WorldSpecInput["roads"] = [];
  const roadType = has(t, "pave", "cobble") ? "cobblestone_road" : has(t, "terre", "dirt", "sentier", "trail") ? "dirt_path" : fam.roadKit;
  const focalId = landmarks.find((l) => l.role === "focal")?.id;
  const mainNodes = ["spawn", ...(settlements[0] ? [settlements[0].id] : []), ...(focalId ? [focalId] : [])];
  if (mainNodes.length >= 2) roads.push({ id: "main_path", type: roadType, connects: mainNodes, width: modern ? 12 : 7 });
  const secondary = landmarks.find((l) => l.role === "secondary");
  if (secondary && settlements[0]) roads.push({ id: "side_path", type: roadType === "asphalt_road" ? "concrete_road" : "dirt_path", connects: [settlements[0].id, secondary.id], width: modern ? 9 : 5 });

  // ---- vegetation: the family's kit species (+ prompt extras)
  type Species = NonNullable<NonNullable<WorldSpecInput["vegetation"]>["species"]>[number];
  const species: Species[] = (VEGETATION_KIT_SPECIES[fam.vegetationKit] ?? []).map(([sp]) => sp);
  const pushSp = (...list: Species[]) => {
    for (const x of list) if (!species.includes(x)) species.push(x);
  };
  if (species.length === 0) pushSp("bush", "grass");
  if (has(t, "champignon", "mushroom")) pushSp("giant_mushroom", "small_mushroom"), tag("mushrooms");
  if (has(t, "fleur", "flower")) pushSp("flower");
  if (has(t, "palmier", "palm")) pushSp("palm");
  if (has(t, "cerisier", "sakura", "cherry")) pushSp("cherry_tree");
  if (has(t, "bambou", "bamboo")) pushSp("bamboo");
  if (has(t, "cactus")) pushSp("cactus");
  let density = has(t, "dense", "epais", "thick", "luxuriant", "lush") ? 0.85 : has(t, "clairsem", "sparse", "vide", "empty", "aride") ? 0.3 : Math.min(0.85, 0.25 + fam.vegetationDensity * 0.75);
  if (archipelago) {
    // mesa islands read as open lawns with a few palms: sparse, no forest biome
    density = Math.min(density, 0.22);
    for (const b of biomes) b.vegetation = "sparse";
    for (let i = biomes.length - 1; i >= 0; i--) if (["forest", "jungle", "dark_forest", "pine_forest"].includes(biomes[i]!.id)) biomes.splice(i, 1);
    if (biomes.length === 0) biomes.push({ id: "meadow", weight: 0.6, vegetation: "sparse" });
    species.length = 0;
    pushSp("palm", "bush", "flower", "grass");
  }
  const giantMushrooms = has(t, "champignons geants", "giant mushroom", "champignon geant") ? 0.7 : species.includes("giant_mushroom") ? Math.max(0.3, fam.mushrooms ?? 0) : 0;

  // ---- props: the family's kits + prompt extras
  type PropSet = NonNullable<NonNullable<WorldSpecInput["props"]>["sets"]>[number];
  const sets = new Set<PropSet>(fam.propKits as PropSet[]);
  if (settlements.length && !modern) sets.add("village");
  if (forest || fam.vegetationKit === "mushroom" || fam.vegetationKit === "conifer") sets.add("forest");
  if (landmarks.some((l) => l.type === "ruins" || l.type === "temple" || l.type === "skyscraper_ruin") || abandoned) sets.add("ruins");
  if (has(t, "camp", "feu de camp", "campfire", "bivouac")) sets.add("camp");
  if (has(t, "cimetiere", "graveyard", "tombe", "grave")) sets.add("graveyard");
  if (has(t, "ferme", "farm", "moulin", "champ", "crops")) sets.add("farm");
  if (has(t, "zombie", "apocalyp", "infect", "barricade")) sets.add("apocalypse");
  if (has(t, "militaire", "military", "soldat", "army")) sets.add("military");
  if (has(t, "aire de jeu", "playground", "parc", "park")) sets.add("playground");
  if (has(t, "port", "docks", "harbor", "harbour")) sets.add("docks");
  if (sets.size === 0) sets.add("forest");

  // ---- lighting & atmosphere: the family's look, overridden by the prompt
  const night = has(t, "nuit", "night", "lune", "moon", "nocturne", "etoile", "star");
  const dusk = has(t, "crepuscule", "dusk", "coucher", "sunset");
  const dawn = has(t, "aube", "dawn", "lever", "sunrise", "matin", "morning");
  const timeOfDay = night ? 20.5 : dusk ? 18.2 : dawn ? 6.5 : fam.lighting.timeOfDay;
  const mood = night ? "moonlit" : dusk ? "dusk" : dawn ? "dawn" : has(t, "orage", "storm", "pluie", "rain") ? "stormy" : has(t, "nuage", "cloud", "gris", "overcast") ? "overcast" : fam.lighting.mood;
  const fogDensity = has(t, "brume", "brouillard", "fog", "mist", "myster") ? Math.max(0.55, fam.fog.density) : fam.fog.density;

  // ---- gameplay layout from the genre (stage / plot / checkpoint counts from the prompt when given)
  const layoutCount = (() => {
    const m = /(\d+)\s*(stages|etapes|niveaux|levels|plots|parcelles|checkpoints|salles|rooms|portails|portals|vagues|waves)/.exec(t);
    return m ? Math.max(2, Math.min(60, Number(m[1]))) : undefined;
  })();
  const layout: WorldSpecInput["layout"] = {
    archetype: genre.layout,
    count: layoutCount ?? { obby_course: 12, tycoon_plots: 8, lobby_portals: 6, base_defense: 10, dungeon: 6, arena: 14, race_track: 8, linear_story: 6 }[genre.layout as string] ?? 8,
    intensity: has(t, "difficile", "hard", "extreme", "hardcore") ? 0.85 : has(t, "facile", "easy", "casual") ? 0.25 : 0.5,
    extent: 0.45,
  };

  // ---- size
  const width = has(t, "immense", "enorme", "huge", "gigantesque", "massive") ? 2048 : has(t, "grand", "large", "big", "vaste") ? 1536 : has(t, "petit", "small", "tiny", "mini") ? 768 : 1024;

  const name = titleFromPrompt(prompt, fam);

  const specInput: WorldSpecInput = {
    ...MOONLIT_FOREST_VILLAGE,
    id: "main",
    name,
    seed: seed ?? hashString(prompt) % 1_000_000,
    theme,
    stylePreset,
    size: { width, depth: width },
    terrain: { baseHeight: 40, relief, roughness: fam.geometry === "blocky" ? 0.3 : 0.45, erosion: 0.55, features },
    biomes,
    rivers,
    lakes,
    landmarks,
    settlements,
    roads,
    vegetation: { density, clustering: 0.6, species, sizeVariation: 0.55, giantMushrooms },
    props: { density: 0.55, sets: [...sets] },
    lighting: { timeOfDay, mood, brightness: night ? 0.5 : 0.75, shadows: true },
    atmosphere: { fogDensity, fogColor: fam.fog.color, haze: fogDensity, skyTint: fam.palette.sky },
    colorPalette: { primary: fam.palette.primary, secondary: fam.palette.secondary, accent: fam.palette.accent, ground: fam.palette.ground, stone: fam.palette.stone, wood: fam.palette.wood, foliage: fam.palette.foliage, water: fam.palette.water },
    cameraComposition: { spawnFacing: focalId, spawnZone: "clearing" },
    layout,
    gameplayHints: [genre.id, ...gameplayHints(t)],
    notes: prompt,
  };
  const spec = WorldSpecSchema.parse(specInput);
  const game = interpretGame(prompt, spec, genre, fam);
  return { spec, game, detected };
}

/** Whole-word match for short keywords ("car" must not match "cartoon"). */
const hasWord = (text: string, ...words: string[]) => words.some((w) => new RegExp(`(^|[^a-z0-9])${w}(?![a-z0-9])`).test(text));

function gameplayHints(t: string): string[] {
  const hints: string[] = [];
  if (has(t, "collect", "ramass", "recolte", "gather")) hints.push("collectibles");
  if (hasWord(t, "pet", "pets", "animaux", "compagnon", "egg", "oeuf")) hints.push("pets");
  if (has(t, "combat", "fight", "battle", "arme", "weapon", "pvp", "zombie", "monstre", "monster")) hints.push("combat");
  if (has(t, "quete", "quest", "mission")) hints.push("quests");
  if (hasWord(t, "vehicule", "vehicules", "vehicle", "vehicles", "voiture", "voitures", "car", "cars", "moto")) hints.push("vehicles");
  return hints;
}

const SYSTEM_DESCRIPTIONS: Record<string, string> = {
  player_data: "Persistent profile, leaderstats, autosave",
  currency: "Main currency earned and spent in-game",
  inventory: "Items, stacks and equip slots",
  survival_stats: "Hunger / thirst / temperature drains; eat to survive",
  collectibles: "Pickups scattered in the world (respawning)",
  quests: "Quest log with objectives and rewards",
  npcs: "Villagers, merchants and quest givers with dialogue",
  shop: "In-game shop (coins) + Robux passes/products",
  pets: "Hatch eggs, equip pets with multipliers",
  weapons: "Melee and ranged tools with cooldowns",
  combat: "Health, damage, knockback, respawn",
  progression: "Levels / XP / unlock tiers",
  checkpoints: "Stage checkpoints and respawn points",
  obby: "Platforming course with kill bricks and stage counter",
  tycoon: "Plots with buy buttons, droppers, conveyors and collectors",
  simulator_loop: "Click / collect → backpack → sell → upgrade → rebirth",
  rounds: "Lobby + timed rounds with a winner",
  rng_rolls: "Weighted random rolls (rarities, luck)",
  leaderboards: "Global leaderboards (OrderedDataStore)",
  matchmaking: "Queue players into matches / teams",
  day_night: "Day/night cycle with events",
  crafting: "Recipes turning gathered items into tools",
  enemies: "AI mobs that patrol, chase and attack (zombies, monsters, guards)",
  racing: "Vehicle checkpoints, laps and best times",
  tower_defense: "Waves of enemies along a path; towers placed on pads",
  farming: "Plant seeds, grow, harvest and sell crops",
  mining: "Ore nodes, pickaxe tiers, deeper layers",
  building: "Place parts / furniture on your plot",
  jobs: "Jobs that pay cash over time",
  sports: "Ball physics, goals, score and match timer",
  puzzle: "Switches, keys, pressure plates and doors",
  story: "Chapters with dialogue beats and set pieces",
  clicker: "Tap to earn with auto-clickers and multipliers",
  parkour: "Wall runs, long jumps, timed routes",
  minigames: "Rotating minigames launched from the lobby portals",
  trading: "Player-to-player trades with confirmation",
  housing: "Claimable houses / plots with furniture",
  vehicles: "Spawnable vehicles with seats and physics",
  teams: "Team assignment, colours and spawns",
  capture_points: "Contested zones that score for the holding team",
  abilities: "Cooldown abilities / moves with combos",
  rhythm: "Note tracks synced to music with scoring",
};

export function interpretGame(prompt: string, spec: WorldSpec, genreIn?: GenreDef, famIn?: StyleFamilyDef): GameSpec {
  const t = prompt.toLowerCase();
  const hints = spec.gameplayHints;
  const genre = genreIn ?? GENRE_INDEX[hints[0] ?? ""] ?? matchGenre(t, GENRES) ?? GENRE_INDEX.adventure!;
  const fam = famIn ?? STYLE_FAMILY_INDEX[spec.stylePreset] ?? STYLE_FAMILY_INDEX.stylized_mystical!;
  const ids = new Set<string>(genre.systems);
  if (hints.includes("pets")) ids.add("pets");
  if (hints.includes("combat")) ids.add("combat"), ids.add("weapons"), ids.add("enemies");
  if (hints.includes("quests")) ids.add("quests"), ids.add("npcs");
  if (hints.includes("vehicles")) ids.add("vehicles");
  const systems: GameSpec["systems"] = [...ids].map((id) => ({ id: id as never, description: SYSTEM_DESCRIPTIONS[id] ?? id, params: {} }));
  // a prompt can ask for a UI library directly ("UI rétro", "interface néon") — otherwise the style decides
  const ui: GameSpec["ui"] = { screens: genre.screens as never, style: fam.ui as never, accentColor: fam.uiAccent, kit: pickUiKit(prompt, fam.ui, genre.id), locale: detectLocale(prompt) };
  const base = defaultGameContent();
  const currencyName = genre.currency.charAt(0).toUpperCase() + genre.currency.slice(1);
  const enemies = genre.enemies || ids.has("enemies");
  const zombie = /zombie|infect|apocalyp/.test(t);
  const npcs = [
    ...(spec.settlements.length ? base.npcs.map((n) => ({ ...n, location: spec.settlements[0]!.id })) : []),
    ...(enemies ? [{ id: zombie ? "walker" : "grunt", name: zombie ? "Walker" : genre.id === "horror" ? "The Stalker" : "Raider", role: (zombie ? "zombie" : genre.id === "horror" ? "monster" : "enemy") as never, location: "wild", dialogue: [] }] : []),
  ];
  return GameSpecSchema.parse({
    title: spec.name,
    tagline: `A ${genre.name.toLowerCase()} experience — ${fam.name}`,
    description: prompt,
    genre: genre.id,
    subGenres: hints.filter((h) => h !== genre.id && GENRE_INDEX[h]).slice(0, 3),
    targetAudience: t.includes("enfant") || t.includes("kids") ? "kids" : genre.id === "horror" || zombie ? "teens" : "all",
    coreLoop: coreLoopFor(genre),
    systems,
    currencies: [{ id: genre.currency, name: currencyName, icon: "coin", startingAmount: 0 }],
    items: itemsFor(genre, fam),
    npcs,
    quests: questsFor(genre, spec),
    ui,
    monetization: base.monetization,
    shop: { ...base.shop, title: genre.id === "survival" ? "Trader" : genre.id === "tycoon" || genre.id === "simulator" ? "Upgrades" : "Shop" },
    animations: base.animations,
    worldBrief: spec.notes ?? "",
    audioBrief: `${fam.audio} mood, ${spec.lighting.mood} ${fam.name.toLowerCase()} ambience`,
  });
}

function itemsFor(genre: GenreDef, fam: StyleFamilyDef): GameSpec["items"] {
  const food = fam.group === "modern" || fam.group === "apocalyptic" ? { id: "canned_food", name: "Canned Food", category: "food" } : fam.group === "future" ? { id: "ration", name: "Ration Pack", category: "food" } : { id: "mushroom", name: "Glowing Mushroom", category: "food" };
  const items: GameSpec["items"] = [{ ...food, rarity: "common", stackable: true } as never];
  if (genre.systems.includes("weapons")) items.push({ id: "melee_1", name: fam.group === "modern" || fam.group === "apocalyptic" ? "Baseball Bat" : fam.group === "future" ? "Energy Blade" : "Sword", category: "weapon", rarity: "common", stackable: false } as never);
  if (genre.systems.includes("crafting")) items.push({ id: "scrap", name: fam.group === "fantasy" || fam.group === "historical" ? "Wood" : "Scrap", category: "material", rarity: "common", stackable: true } as never, { id: "cloth", name: "Cloth", category: "material", rarity: "common", stackable: true } as never);
  if (genre.systems.includes("mining")) items.push({ id: "ore_iron", name: "Iron Ore", category: "material", rarity: "common", stackable: true } as never, { id: "ore_gold", name: "Gold Ore", category: "material", rarity: "rare", stackable: true } as never);
  if (genre.systems.includes("farming")) items.push({ id: "seed_carrot", name: "Carrot Seed", category: "material", rarity: "common", stackable: true } as never, { id: "carrot", name: "Carrot", category: "food", rarity: "common", stackable: true } as never);
  return items;
}

function questsFor(genre: GenreDef, spec: WorldSpec): GameSpec["quests"] {
  const cur = genre.currency;
  switch (genre.layout) {
    case "obby_course":
      return [{ id: "first_stages", title: "Warm-up", description: "Reach stage 3.", objective: { type: "reach", target: "obby_stage_3", count: 1 }, reward: { currency: cur, amount: 50 } }];
    case "tycoon_plots":
      return [{ id: "first_plot", title: "Own a plot", description: "Claim a plot and buy your first dropper.", objective: { type: "build", target: "tycoon_plot", count: 1 }, reward: { currency: cur, amount: 100 } }];
    case "arena":
      return [{ id: "first_blood", title: "First blood", description: "Defeat 3 opponents in the arena.", objective: { type: "defeat", target: "player", count: 3 }, reward: { currency: cur, amount: 100 } }];
    case "race_track":
      return [{ id: "first_lap", title: "First lap", description: "Complete a lap of the track.", objective: { type: "reach", target: "race_start", count: 1 }, reward: { currency: cur, amount: 80 } }];
    case "base_defense":
      return [{ id: "wave_5", title: "Hold the line", description: "Survive 5 waves.", objective: { type: "survive", target: "wave", count: 5 }, reward: { currency: cur, amount: 150 } }];
    case "dungeon":
      return [{ id: "boss", title: "Into the dark", description: "Reach the boss room.", objective: { type: "reach", target: "dungeon_boss", count: 1 }, reward: { currency: cur, amount: 200 } }];
    default:
      return [{ id: "first_light", title: "First steps", description: `Collect 5 items and visit ${spec.landmarks[0]?.id ?? "the landmark"}.`, objective: { type: "collect", target: "any", count: 5 }, reward: { currency: cur, amount: 50 } }];
  }
}

function coreLoopFor(genre: GenreDef): string[] {
  switch (genre.id) {
    case "survival":
      return ["Explore and scavenge", "Manage hunger and threats", "Craft gear and fortify", "Survive the night", "Push further"];
    case "obby":
    case "parkour":
      return ["Run the course", "Reach checkpoints", "Unlock stages", "Compete on the leaderboard"];
    case "tycoon":
      return ["Collect income", "Buy upgrades", "Expand the base", "Rebirth"];
    case "simulator":
    case "clicker":
      return ["Collect", "Sell", "Upgrade", "Unlock areas", "Rebirth"];
    case "horror":
      return ["Explore in the dark", "Find keys", "Avoid the monster", "Escape"];
    case "battle":
    case "fps":
    case "battle_royale":
    case "fighting":
      return ["Queue for a round", "Fight", "Earn rewards", "Unlock loadouts"];
    case "racing":
      return ["Pick a vehicle", "Race laps", "Beat times", "Unlock cars"];
    case "tower_defense":
    case "strategy":
      return ["Place towers", "Survive waves", "Upgrade", "Unlock maps"];
    case "roleplay":
    case "hangout":
      return ["Meet people", "Work jobs / hang out", "Buy houses and cars", "Customise"];
    case "farming":
      return ["Plant", "Water and wait", "Harvest", "Sell", "Expand"];
    case "mining":
      return ["Dig", "Sell ore", "Upgrade pickaxe", "Go deeper"];
    default:
      return ["Explore", "Collect", "Complete quests", "Upgrade", "Discover landmarks"];
  }
}

function titleFromPrompt(prompt: string, fam: StyleFamilyDef): string {
  const cleaned = prompt
    .replace(/^(cree|crée|créer|create|make|fais|fait|build|génère|genere|generate)[- ]?(moi|me)?\s*(une|un|an|a)?\s*(jeu|game|map|carte|monde|world)?\s*(roblox)?\s*(pour|for)?\s*(mon|ma|my)?\s*(jeu|game)?\s*(de|d'|of)?\s*/i, "")
    .trim();
  const words = cleaned.split(/\s+/).slice(0, 5).join(" ");
  const base = words.length > 4 ? words.charAt(0).toUpperCase() + words.slice(1) : fam.name;
  return base.replace(/[.,;!?]+$/, "").slice(0, 48);
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
