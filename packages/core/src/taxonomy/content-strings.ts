import type { GameSpec } from "../schemas/game-spec";
import type { UiLocale } from "./ui-strings";

/**
 * The words of WorldForge's starter content (shop, quests, items, villagers) in the game's language. Seen in Studio
 * on 7 Nov 2026: a French interface sold "Luck Boost" and asked for "Veteran". Exact phrases only, plus a few
 * patterns with a number: text an agent wrote in the right language never matches and is left alone.
 */
const FR: Record<string, string> = {
  // shop
  Shop: "Boutique",
  Upgrades: "Améliorations",
  Potions: "Potions",
  "x2 Coins": "Pièces x2",
  "x2 Food": "Nourriture x2",
  "Fast Hands": "Mains agiles",
  "Luck Boost": "Chance boostée",
  "Ultra Luck Boost": "Chance ultra",
  "Starter Pack": "Pack de départ",
  "Gem pack": "Pack de gemmes",
  "1,000 coins": "1 000 pièces",
  "Doubles the coins you earn, for good.": "Double les pièces gagnées, pour toujours.",
  "Doubles the food you collect, for good.": "Double la nourriture récoltée, pour toujours.",
  "Collect twice as fast.": "Récolte deux fois plus vite.",
  "Doubles your luck for 15 minutes: rarer finds and drops.": "Double ta chance pendant 15 minutes : trouvailles plus rares.",
  "Multiplies your luck by 4 for 10 minutes.": "Multiplie ta chance par 4 pendant 10 minutes.",
  "A good set of upgrades to start with.": "De bonnes améliorations pour bien commencer.",
  "A pouch of 1,000 coins.": "Une bourse de 1 000 pièces.",
  "A pack of rare gems.": "Un lot de gemmes rares.",
  "VIP tag, +25% coins and a golden lantern.": "Titre VIP, +25 % de pièces et une lanterne dorée.",
  "Lasts for 15 minutes, stackable": "Dure 15 minutes, cumulable",
  // quests
  "First blocks": "Premiers blocs",
  Builder: "Bâtisseur",
  Architect: "Architecte",
  "Warm-up": "Échauffement",
  "Halfway there": "À mi-chemin",
  "The final stage": "La dernière étape",
  "Own a plot": "Ta parcelle",
  "Claim a plot.": "Prends une parcelle.",
  "First dropper": "Premier distributeur",
  "Buy your first dropper.": "Achète ton premier distributeur.",
  "Full production": "Pleine production",
  "First blood": "Premier sang",
  Veteran: "Vétéran",
  Champion: "Champion",
  "First lap": "Premier tour",
  "Complete a lap.": "Termine un tour.",
  Regular: "Habitué",
  "Road legend": "Légende de la route",
  "Hold the line": "Tenir la ligne",
  "Stand firm": "Tenir bon",
  Unbroken: "Inébranlable",
  "Into the dark": "Dans l'obscurité",
  Delver: "Explorateur",
  Slayer: "Pourfendeur",
  "First steps": "Premiers pas",
  Gatherer: "Cueilleur",
  "Master collector": "Grand collectionneur",
  "Say hello": "Dis bonjour",
  "Talk to someone in town.": "Parle à quelqu'un au village.",
  // items and recipes
  Sword: "Épée",
  "Baseball Bat": "Batte de baseball",
  "Energy Blade": "Lame d'énergie",
  Wood: "Bois",
  Scrap: "Ferraille",
  Cloth: "Tissu",
  "Canned Food": "Conserve",
  "Ration Pack": "Ration",
  "Glowing Mushroom": "Champignon lumineux",
  "Iron Ore": "Minerai de fer",
  "Gold Ore": "Minerai d'or",
  "Carrot Seed": "Graine de carotte",
  Carrot: "Carotte",
  Bandage: "Bandage",
  Torch: "Torche",
  "Barricade spikes": "Pieux de barricade",
  "Iron ingot": "Lingot de fer",
  "Gold ingot": "Lingot d'or",
  "Carrot stew": "Ragoût de carottes",
  // villagers
  "Tobin the Trader": "Tobin le marchand",
  "Elder Maren": "Maren l'ancienne",
  "Don't wander past the stone walls after dark.": "Ne t'aventure pas au-delà des murs de pierre la nuit.",
  "I saw lights dancing over the lake!": "J'ai vu des lumières danser sur le lac !",
  "Potions, charms, lanterns — take a look at the shop!": "Potions, porte-bonheur, lanternes : jette un œil à la boutique !",
  "Luck potions make rare finds more likely.": "Les potions de chance rendent les trouvailles rares plus fréquentes.",
  "The mushrooms glow brighter every night… something stirs in the old ruins.": "Les champignons brillent plus fort chaque nuit… quelque chose remue dans les vieilles ruines.",
  "Bring me twenty glowing caps and I will tell you about the giant tree.": "Rapporte-moi vingt chapeaux lumineux et je te parlerai de l'arbre géant.",
};

const FR_PATTERNS: [RegExp, string][] = [
  [/^Place (\d+) blocks\.$/, "Pose $1 blocs."],
  [/^Reach stage (\d+)\.$/, "Atteins l'étape $1."],
  [/^Buy (\d+) droppers\.$/, "Achète $1 distributeurs."],
  [/^Defeat (\d+) opponents\.$/, "Bats $1 adversaires."],
  [/^Defeat (\d+) enemies\.$/, "Bats $1 ennemis."],
  [/^Win (\d+) rounds\.$/, "Gagne $1 manches."],
  [/^Complete (\d+) laps\.$/, "Termine $1 tours."],
  [/^Survive (\d+) waves\.$/, "Survis à $1 vagues."],
  [/^Collect (\d+) items on your way to the (.+)\.$/, "Ramasse $1 objets sur le chemin du $2."],
  [/^Collect (\d+) items\.$/, "Ramasse $1 objets."],
];

const TABLES: Partial<Record<UiLocale, { words: Record<string, string>; patterns: [RegExp, string][] }>> = {
  fr: { words: FR, patterns: FR_PATTERNS },
};

/** One phrase in the locale, or the phrase itself when nothing matches. */
export function localizeText(text: string, locale: UiLocale | undefined): string {
  const table = locale ? TABLES[locale] : undefined;
  if (!table) return text;
  const exact = table.words[text];
  if (exact !== undefined) return exact;
  for (const [pattern, out] of table.patterns) if (pattern.test(text)) return text.replace(pattern, out);
  return text;
}

const TEXT_KEYS = new Set(["name", "title", "description", "headline", "note", "dialogue", "label"]);

/** A copy of the GameSpec whose player-facing words are in its UI language. Ids never change. */
export function localizeGameSpec(game: GameSpec): GameSpec {
  const locale = (game.ui as { locale?: UiLocale } | undefined)?.locale;
  if (!locale || !TABLES[locale]) return game;
  const walk = (value: unknown, key?: string): unknown => {
    if (typeof value === "string") return key !== undefined && TEXT_KEYS.has(key) ? localizeText(value, locale) : value;
    if (Array.isArray(value)) return value.map((v) => walk(v, key));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k)]));
    return value;
  };
  return walk(game) as GameSpec;
}
