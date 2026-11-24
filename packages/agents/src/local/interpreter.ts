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
import { STRONG_STYLES, matchSetting, type SettingDef } from "./settings";
import type { GenLayer } from "@worldforge/world-gen";
import { defaultGameContent } from "@worldforge/roblox-export";

/**
 * Local rule-based interpreter (FR/EN). Not an AI: a deterministic keyword compiler that turns a
 * natural-language brief into a valid WorldSpec/GameSpec. It is driven by the universal taxonomy
 * (every style family and genre carries its own keywords, kits, biomes, landmarks, systems and
 * layout), so any genre × any style resolves to a coherent world. It powers generation when no
 * agent is installed and gives agents a solid draft to refine.
 */
/** Keywords match at the start of a word: "pic" is a peak, not the end of "tropical"; "port" is not in "aeroport". */
const HAS = new Map<string, RegExp>();
const has = (text: string, ...words: string[]) =>
  words.some((w) => {
    let re = HAS.get(w);
    if (!re) HAS.set(w, (re = new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)));
    return re.test(text);
  });
/** Genre words strong enough to overrule what the setting suggests. */
const GENRE_WORDS = /(^|[^a-z0-9])(tycoon|simulator|simulateur|obby|rpg|fps|racing|tower defense|battle royale|horreur|horror|roleplay|survie|survival|sandbox|parkour|puzzle|pvp|minigame|mini-jeu|hangout|farming|mining)/;

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
  ["manor", ["manoir", "mansion", "manor", "demeure", "hotel particulier"], "hill"],
  ["chalet", ["chalet", "lodge", "cabane de montagne", "refuge de montagne", "log cabin"], "plateau"],
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

/** Studs across, by what kind of place it is. A stud is 28 cm. */
const SCALE_WIDTH: Record<string, number> = { arena: 1024, neighbourhood: 1536, settlement: 1280, town: 1536, city: 2048, metropolis: 2560, region: 2560, island: 2048, archipelago: 1536, massive: 4096 };
const STUDS_PER_KM = 3571;

/** The width a request asks for: in so many words ("3 km", "4000 studs"), by an adjective, or by what it is. */
function worldWidth(t: string, setting: SettingDef | undefined, bigTown: boolean): number {
  const clampW = (w: number) => Math.round(Math.max(512, Math.min(16384, w)) / 64) * 64;
  const km = /(\d+(?:[.,]\d+)?)\s*(?:km|kilometre|kilometer)/.exec(t);
  if (km) return clampW(Number(km[1]!.replace(",", ".")) * STUDS_PER_KM);
  const studs = /(\d{3,5})\s*(?:studs|blocs de large|stud)/.exec(t);
  if (studs) return clampW(Number(studs[1]));
  const says = (...words: string[]) => words.some((w) => new RegExp(`(^|[^a-z])${w}`).test(t));
  const arena = setting?.scale === "arena";
  const base = setting ? (arena ? (setting.width ?? 1024) : Math.max(setting.width ?? 0, SCALE_WIDTH[setting.scale] ?? 1024)) : bigTown ? 1536 : 1024;
  if (says("plusieurs kilometres", "several kilometers", "several kilometres")) return clampW(Math.max(base * 2, STUDS_PER_KM * 2));
  if (says("immense", "gigantesque", "colossal", "massive", "huge", "enorme", "infini", "tres grande map", "tres grand monde")) return clampW(arena ? base * 1.5 : Math.max(base * 1.7, 3072));
  if (says("petit", "small", "tiny", "mini")) return clampW(arena ? base : Math.min(base, setting ? 1024 : 768));
  if (!setting && says("grand", "large", "big", "vaste")) return clampW(base * 1.5);
  return clampW(base);
}

/** How many buildings the place has: the size of its map, unless the request counts them. */
const GROWTH: Record<string, number> = { city: 2.4, metropolis: 3, town: 1.9, neighbourhood: 2.2, settlement: 1.3, region: 1.6, island: 1.4 };

export function interpretPrompt(prompt: string, seed?: number): Interpretation {
  const t = prompt.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const detected: string[] = [];
  const tag = (s: string) => detected.push(s);

  // ---- genre + style family (taxonomy keyword matching; the genre suggests a style when none is named)
  const setting = matchSetting(t)?.def;
  const genreWord = GENRE_WORDS.exec(t)?.[2];
  const genre: GenreDef = (setting ? ((genreWord ? matchGenre(genreWord, GENRES) : undefined) ?? GENRE_INDEX[setting.genre ?? ""]) : undefined) ?? matchGenre(t, GENRES) ?? GENRE_INDEX.adventure!;
  if (setting) tag(`setting:${setting.id}`);
  tag(`genre:${genre.id}`);
  const spoken = matchStyleFamily(t);
  // the place decides, unless the request names a style of its own ("un aeroport cyberpunk")
  const named = setting && !(setting.openStyle && spoken && STRONG_STYLES.has(spoken.id)) ? (STYLE_FAMILY_INDEX[setting.style] ?? spoken) : spoken;
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
  // a volcano is a place, not just a landmark: black rock over the slopes, no canopy on them. Without
  // this, "une arène dans un volcan" came out as a green forest hill with a cone in it.
  // "montagne enneigée" asks for snow on the heights, not an arctic world: the style stays what the rest
  // of the prompt chose and a snow biome takes the summits. Without it the word did nothing at all.
  if (has(t, "neige", "enneig", "snow", "snowy", "glace", "givre", "frost") && !biomes.some((b) => b.id === "snow" || b.id === "tundra")) {
    biomes.push({ id: "snow", weight: 0.35, vegetation: "sparse", elevation: [0.55, 1] });
    if (!biomes.some((b) => b.id === "rocky")) biomes.push({ id: "rocky", weight: 0.2, vegetation: "sparse", elevation: [0.5, 1] });
  }
  if (has(t, "volcan", "volcano", "lave", "lava", "magma")) {
    if (!biomes.some((b) => b.id === "volcanic")) biomes.push({ id: "volcanic", weight: 0.55, vegetation: "sparse", elevation: [0.4, 1] });
    if (!biomes.some((b) => b.id === "rocky")) biomes.push({ id: "rocky", weight: 0.25, vegetation: "sparse", elevation: [0.55, 1] });
    for (const b of biomes) if (b.id !== "volcanic" && b.id !== "rocky") b.weight = Math.min(b.weight ?? 0.3, 0.22);
  }
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
    return m ? Math.max(1, Math.min(4000, Number(m[1]))) : undefined;
  })();
  const interiors = has(t, "interieur", "interior", "inside", "meuble", "furnish", "entrer dans", "walk in") ? true : undefined;
  if (has(t, "ville", "town", "city", "cite", "metropole", "downtown", "quartier", "bourg", "bourgade")) {
    // "une ville" in a modern, future or apocalyptic style *is* a city district, not a 16-house town: a
    // cyberpunk or downtown prompt used to come out as a village-sized cluster on an empty map
    const city = modern || famType === "city_district" || has(t, "city", "cite", "metropole", "downtown", "gratte", "skyscraper", "immeuble");
    settlements.push({ id: "town", type: abandoned ? (modern ? "abandoned_village" : "ruined_town") : city ? "city_district" : "town", buildings: count ?? (city ? 34 : 16), layout: city || modern ? "grid" : "organic", near: rivers[0]?.id, weathering: abandoned ? 0.9 : 0.3, interiors });
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
    settlements.push({ id: "hub", type: abandoned ? "abandoned_village" : (famType as never), buildings: count ?? (famType === "city_district" ? 30 : 8), layout: modern ? "grid" : "organic", weathering: abandoned ? 0.8 : 0.35, interiors });
  }

  const mapWidth0 = worldWidth(t, setting, false);
  // ---- the setting: what the request is about overrules what single words suggested
  if (setting) {
    if (setting.settlement === null) settlements.length = 0;
    else if (setting.settlement) {
      const q = setting.settlement;
      settlements.splice(0, settlements.length, { id: settlements[0]?.id ?? "town", type: q.type, buildings: count ?? Math.round(q.buildings * (GROWTH[setting.scale] ?? 1) * (has(t, "immense", "gigantesque", "huge", "enorme", "massive") ? 1.6 : has(t, "petit", "small") ? 0.6 : 1)), layout: q.layout ?? "organic", weathering: q.weathering ?? 0.35, interiors });
    }
    for (let k = 0; k < (setting.satellites?.count ?? 0); k++) {
      const q = setting.satellites!;
      settlements.push({ id: `${q.type}_${k + 1}`, type: q.type, buildings: Math.max(1, q.buildings + ((hashString(`${prompt}${k}`) % 3) - 1)), layout: "organic", weathering: 0.4, interiors });
    }
    if (setting.biomes) biomes.splice(0, biomes.length, ...setting.biomes.map(([id, weight, vegetation]) => ({ id, weight, vegetation, ...(id === "beach" ? { elevation: [0, 0.2] as [number, number] } : {}) })));
    if (setting.features) features.splice(0, features.length, ...setting.features.map((f) => ({ ...f })));
    if (setting.landmarks) {
      const kept = landmarks.filter((l) => LANDMARK_KEYWORDS.some(([type, words]) => type === l.type && has(t, ...words)) && !setting.landmarks!.some(([type]) => type === l.type));
      landmarks.length = 0;
      for (const [type, role, zone] of setting.landmarks) landmarks.push({ id: type, type, role, preferredZone: zone as ZoneHint, scale: 1 });
      for (const l of kept.slice(0, 2)) landmarks.push({ ...l, role: "secondary" });
    }
    if (setting.water) {
      const has1 = (w: NonNullable<typeof setting.water>[number]) => setting.water!.includes(w);
      for (let k = features.length - 1; k >= 0; k--) if (["coast", "island", "archipelago"].includes(features[k]!.type)) features.splice(k, 1);
      if (has1("coast")) features.push({ type: "coast", edges: ["south"], reach: 0.22, ruggedness: 0.5 });
      if (has1("island")) features.push({ type: "island", center: [0.5, 0.5], radius: 0.4, ruggedness: 0.55 });
      if (has1("archipelago")) features.splice(0, features.length, { type: "archipelago", islands: 5, terraces: 3, cliffHeight: 0.5, mainRadius: 0.24, ruggedness: 0.35 });
      if (has1("river") && !rivers.length) rivers.push({ id: "river_1", from: "north", to: "south-east", width: mapWidth0 > 1100 ? Math.min(60, 22 * Math.sqrt(mapWidth0 / 1280)) : 18, depth: 6, meander: 0.65 });
      if (has1("lake") && !lakes.length) lakes.push({ id: "lake_1", center: [0.3, 0.34], radius: mapWidth0 * 0.06 });
    } else if (setting.settlement === null) rivers.length = 0;
  }

  // ---- a settlement in proportion with its map: nine houses fill a small map and get lost on a large one
  const bigTown = has(t, "grand bourg", "grande ville", "grand village", "grande cite", "large settlement", "big town", "large town", "large village", "tres dense", "dense");
  const mapWidth = worldWidth(t, setting, bigTown);
  const populated = genre.layout === "settlement" || genre.layout === "open_world" || genre.layout === "city_grid" || genre.layout === "campus";
  if (!setting?.settlement && count === undefined && populated && settlements[0] && !["camp", "outpost", "farmstead", "hamlet"].includes(settlements[0].type as string)) {
    const k = Math.min(2.2, (mapWidth / 768) ** 1.15) * (bigTown ? 1.35 : 1);
    settlements[0].buildings = Math.min(settlements[0].type === "city_district" ? 60 : 40, Math.round((settlements[0].buildings ?? 8) * k));
  }
  // the ranges do not always stand to the north-west
  const turn = hashString(prompt) % 4;
  for (const f of features) if (!setting?.features && f.type === "mountains" && f.edges && !mountains) f.edges = (coast ? [["north", "west"], ["north"], ["north", "east"], ["west"]] : [["north", "west"], ["north", "east"], ["east", "south"], ["south", "west"]])[turn] as typeof f.edges;
  // people settle by water: a rural map without any gets a river, away from its ranges
  if (!setting && !rivers.length && !lakes.length && !coast && !island && !archipelago && !dry && !modern && settlements.length && fam.group !== "future" && hashString(prompt + "river") % 10 < 7) {
    rivers.push({ id: "river_1", from: (["north", "east", "south", "west"] as const)[turn]!, to: (["south-east", "south-west", "north-west", "north-east"] as const)[turn]!, width: mapWidth > 900 ? 20 : 15, depth: 6, meander: 0.7 });
    settlements[0]!.near ??= "river_1";
  }

  // ---- roads
  const roads: WorldSpecInput["roads"] = [];
  const roadType = has(t, "pave", "cobble") ? "cobblestone_road" : has(t, "terre", "dirt", "sentier", "trail") ? "dirt_path" : fam.roadKit;
  const focalId = landmarks.find((l) => l.role === "focal")?.id;
  const mainNodes = ["spawn", ...(settlements[0] ? [settlements[0].id] : []), ...(focalId ? [focalId] : [])];
  if (mainNodes.length >= 2) roads.push({ id: "main_path", type: roadType, connects: mainNodes, width: modern ? 12 : 7 });
  const secondary = landmarks.find((l) => l.role === "secondary");
  if (secondary && settlements[0]) roads.push({ id: "side_path", type: roadType === "asphalt_road" ? "concrete_road" : "dirt_path", connects: [settlements[0].id, secondary.id], width: modern ? 9 : 5 });

  // every other place is on the way to somewhere: each joins the nearest end of the chain, so the network has loops
  settlements.slice(1).forEach((q, k) => roads.push({ id: `road_${q.id}`, type: modern ? "asphalt_road" : "dirt_path", connects: [settlements[0]!.id!, q.id!], width: modern ? 9 : 6 }));
  for (let k = 2; k < settlements.length; k++) roads.push({ id: `loop_${k}`, type: "dirt_path", connects: [settlements[k - 1]!.id!, settlements[k]!.id!], width: 5 });

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
  // a volcanic world needs the flora its biome asks for, or `treeMix` falls back to the style kit and
  // grows green conifers on black basalt
  if (has(t, "volcan", "volcano", "lave", "lava", "magma")) pushSp("dead_tree", "burnt_tree");
  if (has(t, "neige", "enneig", "snow", "snowy")) pushSp("snow_pine", "dead_tree");
  let density = has(t, "dense", "epais", "thick", "luxuriant", "lush") ? 0.85 : has(t, "clairsem", "sparse", "vide", "empty", "aride") ? 0.3 : Math.min(0.85, 0.25 + fam.vegetationDensity * 0.75);
  if (has(t, "volcan", "volcano", "lave", "lava", "magma")) density = Math.min(density, 0.35);
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
  const timeOfDay = setting?.time !== undefined && !night && !dusk && !dawn ? setting.time : night ? 20.5 : dusk ? 18.2 : dawn ? 6.5 : fam.lighting.timeOfDay;
  const mood = setting?.mood && !night && !dusk && !dawn ? (setting.mood as "eerie") : night ? "moonlit" : dusk ? "dusk" : dawn ? "dawn" : has(t, "orage", "storm", "pluie", "rain") ? "stormy" : has(t, "nuage", "cloud", "gris", "overcast") ? "overcast" : fam.lighting.mood;
  const volcanic = has(t, "volcan", "volcano", "magma");
  const fogDensity = has(t, "brume", "brouillard", "fog", "mist", "myster") ? Math.max(0.55, fam.fog.density) : fam.fog.density;

  // ---- gameplay layout from the genre (stage / plot / checkpoint counts from the prompt when given)
  const layoutCount = (() => {
    const m = /(\d+)\s*(stages|etapes|niveaux|levels|plots|parcelles|checkpoints|salles|rooms|portails|portals|vagues|waves)/.exec(t);
    return m ? Math.max(2, Math.min(4000, Number(m[1]))) : undefined;
  })();
  const layout: WorldSpecInput["layout"] = {
    archetype: setting && setting.settlement !== null && !genreWord ? "open_world" : genre.layout,
    count: layoutCount ?? { obby_course: 12, tycoon_plots: 8, lobby_portals: 6, base_defense: 10, dungeon: 6, arena: 14, race_track: 8, linear_story: 6 }[genre.layout as string] ?? 8,
    intensity: has(t, "difficile", "hard", "extreme", "hardcore") ? 0.85 : has(t, "facile", "easy", "casual") ? 0.25 : 0.5,
    extent: 0.45,
  };

  // ---- size
  const width = mapWidth;

  const name = titleFromPrompt(prompt, fam);

  const specInput: WorldSpecInput = {
    ...MOONLIT_FOREST_VILLAGE,
    id: "main",
    name,
    seed: seed ?? hashString(prompt) % 1_000_000,
    theme,
    stylePreset,
    size: { width, depth: width },
    terrain: { baseHeight: 40, relief: setting?.relief ?? relief, roughness: fam.geometry === "blocky" ? 0.3 : 0.45, erosion: 0.55, features },
    biomes,
    rivers,
    lakes,
    landmarks,
    settlements,
    roads,
    vegetation: { density, clustering: 0.8, species, sizeVariation: 0.65, giantMushrooms },
    props: { density: 0.55, sets: [...sets] },
    // a volcano burns: warm dusk and ash haze, whatever the style's own fog says
    lighting: { timeOfDay: volcanic ? 18 : timeOfDay, mood: volcanic ? "dusk" : mood, brightness: night ? 0.5 : 0.75, shadows: true },
    atmosphere: volcanic ? { fogDensity: 0.2, fogColor: "#8a3f22", haze: 0.2, skyTint: "#c8552a" } : { fogDensity, fogColor: fam.fog.color, haze: fogDensity, skyTint: fam.palette.sky },
    colorPalette: { primary: fam.palette.primary, secondary: fam.palette.secondary, accent: fam.palette.accent, ground: fam.palette.ground, stone: fam.palette.stone, wood: fam.palette.wood, foliage: fam.palette.foliage, water: fam.palette.water },
    cameraComposition: { spawnFacing: focalId, spawnZone: "clearing" },
    layout,
    design: designOf(setting, genre, fam, t, { settlements, landmarks, biomes, features, rivers, lakes, width }),
    gameplayHints: [genre.id, ...gameplayHints(t)],
    notes: prompt,
  };
  const spec = WorldSpecSchema.parse(specInput);
  const game = interpretGame(prompt, spec, genre, fam);
  return { spec, game, detected };
}

/**
 * The design plan of the request: what kind of place, how it is laid out, and the list of what the finished map must
 * show. The generator reads the first half, the critic checks the second on the map that was really built.
 */
function designOf(
  setting: SettingDef | undefined,
  genre: GenreDef,
  fam: StyleFamilyDef,
  t: string,
  made: { settlements: NonNullable<WorldSpecInput["settlements"]>; landmarks: NonNullable<WorldSpecInput["landmarks"]>; biomes: NonNullable<WorldSpecInput["biomes"]>; features: NonNullable<NonNullable<WorldSpecInput["terrain"]>["features"]>; rivers: NonNullable<WorldSpecInput["rivers"]>; lakes: NonNullable<WorldSpecInput["lakes"]>; width: number },
): NonNullable<WorldSpecInput["design"]> {
  const first = made.settlements[0];
  const n = first?.buildings ?? 0;
  const expects: NonNullable<NonNullable<WorldSpecInput["design"]>["expects"]> = [
    { kind: "style", any: [fam.id], label: `the ${fam.id} style` },
    { kind: "genre", any: [genre.id], label: `a ${genre.id} game` },
  ];
  if (first) expects.push({ kind: "buildings", any: [], min: Math.max(1, Math.round(n * 0.7)), label: `about ${n} buildings` });
  if (made.settlements.length > 1) expects.push({ kind: "settlements", any: [], min: made.settlements.length, label: `${made.settlements.length} places to live` });
  for (const l of made.landmarks.filter((q) => q.role !== "hidden").slice(0, 3)) expects.push({ kind: "landmark", any: [l.type], label: `the ${l.type}` });
  if (made.rivers.length) expects.push({ kind: "water", any: ["river"], label: "a river" });
  if (made.lakes.length) expects.push({ kind: "water", any: ["lake"], label: "a lake" });
  if (made.features.some((f) => ["coast", "island", "archipelago"].includes(f.type))) expects.push({ kind: "water", any: ["sea"], label: "the sea" });
  const main = [...made.biomes].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0];
  if (main) expects.push({ kind: "biome", any: [main.id], min: 0.25, label: `mostly ${main.id}` });
  if (made.features.some((f) => f.type === "mountains" && (f.reach ?? 0) >= 0.3)) expects.push({ kind: "relief", any: [], min: 110, label: "real mountains" });
  if (setting?.relief !== undefined && setting.relief <= 0.2) expects.push({ kind: "flat", any: [], min: 0.55, label: "flat ground" });
  for (const f of new Set(setting?.facilities ?? [])) expects.push({ kind: "facility", any: [f], min: setting!.facilities!.filter((q) => q === f).length, label: f.replace("_", " ") });
  const density = setting?.density ?? (has(t, "dense") ? "dense" : first ? "medium" : "open");
  return {
    setting: setting?.id ?? `${fam.id}_${genre.id}`,
    environment: setting?.env ?? (first?.type === "city_district" ? "urban" : fam.group === "nature" ? "forest" : "rural"),
    scale: setting?.scale ?? (n >= 40 ? "city" : n >= 16 ? "town" : made.width >= 1500 ? "region" : first ? "settlement" : "arena"),
    morphology: setting?.morphology ?? (first?.layout === "grid" ? "grid" : first?.layout === "linear" ? "linear" : first?.layout === "ring" ? "radial" : "organic"),
    density,
    camera: setting?.camera ?? "third_person",
    players: setting?.players ?? 12,
    openness: setting?.openness ?? 0.5,
    verticality: setting?.verticality ?? 0.3,
    discoveries: setting?.discoveries === 0 ? 0 : Math.max(setting?.discoveries ?? 2, Math.round((made.width / 1024) ** 2 * 2)),
    facilities: setting?.facilities ?? [],
    expects,
  };
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
  // goals are shown and tracked in every genre; open worlds need something to pick up for them
  ids.add("quests");
  const fixedGoals = ["obby_course", "arena", "race_track", "base_defense", "dungeon"].includes(genre.layout) || ids.has("tycoon") || ids.has("building");
  if (!fixedGoals && !["collectibles", "simulator_loop", "farming", "mining", "pets"].some((s) => ids.has(s))) ids.add("collectibles");
  // playing together is a discovery signal and the main long-term lever: never ship a game with nothing social
  if (!["leaderboards", "trading", "teams", "matchmaking", "rounds", "capture_points", "minigames", "housing"].some((s) => ids.has(s))) ids.add("leaderboards");
  const systems: GameSpec["systems"] = [...ids].map((id) => ({ id: id as never, description: SYSTEM_DESCRIPTIONS[id] ?? id, params: {} }));
  // a prompt can ask for a UI library directly ("UI rétro", "interface néon") — otherwise the style decides
  const ui: GameSpec["ui"] = { screens: [...new Set([...genre.screens, "quests", ...(ids.has("leaderboards") ? ["leaderboard"] : [])])] as never, style: fam.ui as never, accentColor: fam.uiAccent, kit: pickUiKit(prompt, fam.ui, genre.id), locale: detectLocale(prompt) };
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
    currencies: [{ id: genre.currency, name: currencyName, icon: "coin", startingAmount: 50 }],
    items: itemsFor(genre, fam),
    npcs,
    quests: questsFor(genre, spec, ids),
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

/**
 * Short, mid and long goals, as Roblox's onboarding guidance asks. Every objective is one the runtime
 * really fires (QUEST_EVENTS in game-review.ts): most of the previous ones could never be completed.
 */
function questsFor(genre: GenreDef, spec: WorldSpec, systems: Set<string>): GameSpec["quests"] {
  const q = (id: string, title: string, description: string, type: GameSpec["quests"][number]["objective"]["type"], target: string, count: number, amount: number): GameSpec["quests"][number] => ({ id, title, description, objective: { type, target, count }, reward: { currency: genre.currency, amount } });
  if (systems.has("building")) return [q("first_blocks", "First blocks", "Place 5 blocks.", "build", "block", 5, 50), q("builder", "Builder", "Place 50 blocks.", "build", "block", 50, 150), q("architect", "Architect", "Place 300 blocks.", "build", "block", 300, 500)];
  switch (systems.has("tycoon") || genre.layout !== "tycoon_plots" ? genre.layout : "open_world") {
    case "obby_course": {
      const stages = Math.max(6, spec.layout.count);
      const mid = Math.ceil(stages / 2) + 1;
      return [q("first_stages", "Warm-up", "Reach stage 3.", "reach", "obby_stage_3", 1, 50), q("halfway", "Halfway there", `Reach stage ${mid}.`, "reach", `obby_stage_${mid}`, 1, 150), q("summit", "The final stage", `Reach stage ${stages}.`, "reach", `obby_stage_${stages}`, 1, 500)];
    }
    case "tycoon_plots":
      return [q("first_plot", "Own a plot", "Claim a plot.", "build", "tycoon_plot", 1, 50), q("first_dropper", "First dropper", "Buy your first dropper.", "build", "dropper", 1, 100), q("full_line", "Full production", "Buy 4 droppers.", "build", "dropper", 4, 500)];
    case "arena":
      return [q("first_blood", "First blood", "Defeat 3 opponents.", "defeat", "any", 3, 100), q("veteran", "Veteran", "Defeat 25 opponents.", "defeat", "any", 25, 300), systems.has("rounds") ? q("champion", "Champion", "Win 10 rounds.", "win_rounds", "any", 10, 800) : q("champion", "Champion", "Defeat 100 opponents.", "defeat", "any", 100, 800)];
    case "race_track":
      return [q("first_lap", "First lap", "Complete a lap.", "reach", "race_start", 1, 75), q("regular", "Regular", "Complete 10 laps.", "reach", "race_start", 10, 250), q("road_legend", "Road legend", "Complete 50 laps.", "reach", "race_start", 50, 800)];
    case "base_defense":
      return [q("wave_5", "Hold the line", "Survive 5 waves.", "survive", "wave", 5, 150), q("wave_15", "Stand firm", "Survive 15 waves.", "survive", "wave", 15, 400), q("wave_40", "Unbroken", "Survive 40 waves.", "survive", "wave", 40, 1000)];
    case "dungeon":
      return [q("first_fight", "Into the dark", "Defeat 3 enemies.", "defeat", "any", 3, 100), q("delver", "Delver", "Defeat 25 enemies.", "defeat", "any", 25, 300), q("slayer", "Slayer", "Defeat 100 enemies.", "defeat", "any", 100, 800)];
    default: {
      const landmark = spec.landmarks.find((l) => l.role === "focal")?.type.replace(/_/g, " ");
      const goals = [q("first_light", "First steps", `Collect 5 items${landmark ? ` on your way to the ${landmark}` : ""}.`, "collect", "any", 5, 50), q("gatherer", "Gatherer", "Collect 30 items.", "collect", "any", 30, 150), q("collector", "Master collector", "Collect 150 items.", "collect", "any", 150, 500)];
      return systems.has("npcs") && spec.settlements.length ? [q("say_hello", "Say hello", "Talk to someone in town.", "talk", "any", 1, 25), ...goals] : goals;
    }
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
      draft.settlements[0].buildings += 3;
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
    draft.size.width = Math.min(16384, Math.round(draft.size.width * 1.5));
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
