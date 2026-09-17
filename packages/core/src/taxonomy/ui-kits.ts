import type { UiTheme } from "./types";

/**
 * UI kit libraries — the look of every screen of a generated game (packages/roblox-export ships them
 * into `src/ui/kits.generated.ts`, `src/ui/kit.ts` renders them). One kit is a complete design system:
 * colour tokens, shape language (radius, outline, gradients, shadow, bevel), fonts, an ornament drawn
 * on every panel and the button feedback. A prompt like "je veux une UI retro" picks one by keyword;
 * otherwise the world's style family decides through its `ui` theme.
 */
export interface UiKitTokens {
  /** panel background (+ its darker shade for rows and tiles) */
  paper: string;
  paperDark: string;
  /** outline / shadow colour and its softer variant */
  ink: string;
  inkSoft: string;
  /** text on coloured surfaces / on paper */
  text: string;
  textDark: string;
  /** button + banner gradient (top, bottom) */
  primary: [string, string];
  /** premium / bundle gradient */
  gold: [string, string];
  danger: [string, string];
  info: [string, string];
  /** price pills */
  pill: string;
  pillStroke: string;
  /** dark item tiles */
  tile: string;
  tileStroke: string;
}

/** Decoration the kit draws on every panel (all of it from UI parts — no image assets). */
export type UiOrnament =
  | "none"
  /** bolts in the corners (steampunk, military crates) */
  | "rivets"
  /** horizontal CRT lines over the panel */
  | "scanlines"
  /** L-shaped corner brackets (HUD / hologram) */
  | "brackets"
  /** small diamonds on the top and bottom edges (fantasy, luxury) */
  | "filigree"
  /** diagonal hazard band under the title */
  | "stripes"
  /** outer glow stroke (neon) */
  | "glow"
  /** speckled noise (horror, grunge) */
  | "grain"
  /** cut corner + a notch line (stone, wood) */
  | "notch";

/** Button feedback. */
export type UiPress = "squash" | "slide" | "flicker" | "pulse" | "none";

export interface UiKitShape {
  radius: number;
  strokeThickness: number;
  /** vertical gradients on panels, buttons and bars */
  gradients: boolean;
  /** drop shadow offset in pixels (0 = flat) */
  shadow: number;
  shadowTransparency: number;
  /** darker band at the bottom of buttons */
  bevel: boolean;
  /** text outline thickness (0 = flat text) */
  textOutline: number;
  /** panel background transparency (glass kits) */
  panelTransparency: number;
  /** Roblox Enum.Font names */
  font: string;
  fontBody: string;
  ornament: UiOrnament;
  press: UiPress;
}

export interface UiKitDef {
  id: string;
  name: string;
  description: string;
  /** prompt keywords (English + French) that select this kit */
  keywords: string[];
  /** UI themes (StyleFamilyDef.ui) this kit is a default for */
  themes: UiTheme[];
  /** genres it suits best — breaks the tie when several kits share a theme */
  genres: string[];
  tokens: UiKitTokens;
  shape: UiKitShape;
}

const base: UiKitShape = {
  radius: 14,
  strokeThickness: 3,
  gradients: true,
  shadow: 5,
  shadowTransparency: 0.55,
  bevel: true,
  textOutline: 2.5,
  panelTransparency: 0,
  font: "FredokaOne",
  fontBody: "GothamBold",
  ornament: "none",
  press: "squash",
};

export const UI_KITS: UiKitDef[] = [
  {
    id: "paper_cartoon",
    name: "Paper Cartoon",
    description: "The mobile-game look: cream paper panels, thick ink outline, drop shadow, rounded bold type.",
    keywords: ["cartoon", "paper", "mobile", "simulator ui", "bd", "comic", "doodle", "kid", "enfant"],
    themes: ["cartoon", "stylized"],
    genres: ["simulator", "clicker", "obby", "tycoon", "pet_collecting", "farming"],
    tokens: {
      paper: "#f6efdc",
      paperDark: "#e6d8b6",
      ink: "#3b2a1a",
      inkSoft: "#6a5140",
      text: "#ffffff",
      textDark: "#3b2a1a",
      primary: ["#8ff05a", "#2f9a2c"],
      gold: ["#ffd965", "#d4901f"],
      danger: ["#ff6b5e", "#c8332b"],
      info: ["#7fd0ff", "#2f7fd0"],
      pill: "#2b4a2e",
      pillStroke: "#173018",
      tile: "#3d3229",
      tileStroke: "#1e1710",
    },
    shape: { ...base },
  },
  {
    id: "candy_pop",
    name: "Candy Pop",
    description: "Bubbly sweet-shop UI: very round pink panels, fat outlines, bouncing buttons.",
    keywords: ["candy", "bonbon", "sweet", "sucre", "pop", "bubble", "bubblegum", "pastel pink", "dessert"],
    themes: ["candy"],
    genres: ["simulator", "clicker", "pet_collecting", "minigames", "hangout"],
    tokens: {
      paper: "#fff1f8",
      paperDark: "#ffd6ea",
      ink: "#7a2a5a",
      inkSoft: "#b05a8a",
      text: "#ffffff",
      textDark: "#7a2a5a",
      primary: ["#ff9ad5", "#e0489a"],
      gold: ["#ffe27a", "#f0a020"],
      danger: ["#ff8a8a", "#d43a5a"],
      info: ["#9ad8ff", "#4a9ae0"],
      pill: "#7a2a5a",
      pillStroke: "#4d1538",
      tile: "#5a2a4a",
      tileStroke: "#2d1224",
    },
    shape: { ...base, radius: 24, strokeThickness: 4, font: "LuckiestGuy", fontBody: "Nunito", press: "pulse", shadow: 6 },
  },
  {
    id: "neon_cyber",
    name: "Neon Cyber",
    description: "Dark glass panels with neon outlines, glow and flickering buttons — cyberpunk / night city.",
    keywords: ["neon", "néon", "cyber", "cyberpunk", "synthwave", "glow", "nuit", "night city", "hacker", "futur"],
    themes: ["sci-fi"],
    genres: ["fps", "battle", "racing", "battle_royale", "fighting"],
    tokens: {
      paper: "#0e1320",
      paperDark: "#161d2e",
      ink: "#35f0ff",
      inkSoft: "#1d6c86",
      text: "#eaffff",
      textDark: "#bdf5ff",
      primary: ["#35f0ff", "#0b6fb4"],
      gold: ["#ffd965", "#e0631f"],
      danger: ["#ff4f7a", "#9a0f3a"],
      info: ["#9a7aff", "#4a2fd0"],
      pill: "#0a1a26",
      pillStroke: "#35f0ff",
      tile: "#121a2a",
      tileStroke: "#35f0ff",
    },
    shape: { ...base, radius: 8, strokeThickness: 2.5, gradients: true, shadow: 0, bevel: false, textOutline: 1.5, panelTransparency: 0.08, font: "Michroma", fontBody: "Gotham", ornament: "glow", press: "flicker" },
  },
  {
    id: "holo_hud",
    name: "Holo HUD",
    description: "Angular hologram HUD: translucent frames, corner brackets, hairline strokes, no gradients.",
    keywords: ["hud", "holo", "hologram", "hologramme", "space", "spatial", "station", "mech", "tech", "sci-fi ui", "interface futuriste"],
    themes: ["sci-fi"],
    genres: ["tower_defense", "strategy", "sandbox", "puzzle", "story"],
    tokens: {
      paper: "#081420",
      paperDark: "#0d1e2c",
      ink: "#7fd8ff",
      inkSoft: "#2c5f7a",
      text: "#eaf8ff",
      textDark: "#aee2ff",
      primary: ["#7fd8ff", "#1d6fa8"],
      gold: ["#ffe08a", "#c8901f"],
      danger: ["#ff8a6a", "#b03a20"],
      info: ["#8affd0", "#1f9a7a"],
      pill: "#06121c",
      pillStroke: "#7fd8ff",
      tile: "#0b1a26",
      tileStroke: "#4a90b0",
    },
    shape: { ...base, radius: 2, strokeThickness: 1.5, gradients: false, shadow: 0, bevel: false, textOutline: 0, panelTransparency: 0.25, font: "Jura", fontBody: "Gotham", ornament: "brackets", press: "slide" },
  },
  {
    id: "grim_horror",
    name: "Grim Horror",
    description: "Near-black panels, dried-blood accents, speckled grain and no animation — horror and backrooms.",
    keywords: ["horror", "horreur", "creepy", "scary", "peur", "blood", "sang", "zombie", "backrooms", "asylum", "sombre", "dark ui"],
    themes: ["horror"],
    genres: ["horror", "dungeon_crawler", "story", "puzzle"],
    tokens: {
      paper: "#15100f",
      paperDark: "#1e1614",
      ink: "#6b1d1d",
      inkSoft: "#8a3a3a",
      text: "#e9dcd6",
      textDark: "#cbbdb6",
      primary: ["#8f2b22", "#41100c"],
      gold: ["#c49a3a", "#6e4a0c"],
      danger: ["#c0392b", "#5a1010"],
      info: ["#5a7a8a", "#243a46"],
      pill: "#241012",
      pillStroke: "#6b1d1d",
      tile: "#201618",
      tileStroke: "#4a1a1a",
    },
    shape: { ...base, radius: 4, strokeThickness: 2.5, gradients: false, shadow: 4, shadowTransparency: 0.35, bevel: false, textOutline: 1.5, font: "Creepster", fontBody: "SpecialElite", ornament: "grain", press: "none" },
  },
  {
    id: "pixel_retro",
    name: "Pixel Retro",
    description: "8-bit console UI: square corners, hard 4px borders, hard offset shadow, pixel type, no gradients.",
    keywords: ["pixel", "8-bit", "8 bit", "16-bit", "retro", "rétro", "nes", "gameboy", "console", "old school", "vieux jeu"],
    themes: ["retro"],
    genres: ["obby", "minigames", "puzzle", "parkour", "clicker"],
    tokens: {
      paper: "#2b2b3a",
      paperDark: "#1d1d29",
      ink: "#0b0b12",
      inkSoft: "#6a6a86",
      text: "#f7f7e8",
      textDark: "#f7f7e8",
      primary: ["#5ad46a", "#2a8f3a"],
      gold: ["#ffd24a", "#c08a10"],
      danger: ["#ff5a5a", "#a01f1f"],
      info: ["#5ab4ff", "#1f5fb0"],
      pill: "#14141d",
      pillStroke: "#0b0b12",
      tile: "#1d1d29",
      tileStroke: "#0b0b12",
    },
    shape: { ...base, radius: 0, strokeThickness: 4, gradients: false, shadow: 6, shadowTransparency: 0.2, bevel: false, textOutline: 0, font: "Arcade", fontBody: "Code", ornament: "none", press: "none" },
  },
  {
    id: "arcade_synth",
    name: "Arcade Synth",
    description: "80s arcade cabinet: magenta / cyan gradients, CRT scanlines, chrome outlined type.",
    keywords: ["arcade", "80s", "années 80", "vaporwave", "synth", "retrowave", "miami", "chrome", "cabinet", "borne"],
    themes: ["retro"],
    genres: ["racing", "fighting", "rhythm", "minigames", "sports"],
    tokens: {
      paper: "#1a0f2e",
      paperDark: "#251440",
      ink: "#12061f",
      inkSoft: "#6a4a9a",
      text: "#ffffff",
      textDark: "#ffd9f6",
      primary: ["#ff5ad4", "#7a1fb4"],
      gold: ["#ffe15a", "#e07a1f"],
      danger: ["#ff4f5e", "#a01f3a"],
      info: ["#5affe1", "#1f8fb4"],
      pill: "#12061f",
      pillStroke: "#ff5ad4",
      tile: "#1f1136",
      tileStroke: "#5affe1",
    },
    shape: { ...base, radius: 6, strokeThickness: 3, shadow: 4, shadowTransparency: 0.4, textOutline: 2.5, font: "Arcade", fontBody: "Michroma", ornament: "scanlines", press: "pulse" },
  },
  {
    id: "clean_modern",
    name: "Clean Modern",
    description: "Flat app UI: white cards, thin accent line, soft shadow, no outline on the type.",
    keywords: ["modern", "moderne", "clean", "propre", "flat", "app", "material", "corporate", "ville", "city ui", "sobre"],
    themes: ["modern", "minimal"],
    genres: ["roleplay", "sandbox", "hangout", "sports", "strategy"],
    tokens: {
      paper: "#ffffff",
      paperDark: "#eef1f5",
      ink: "#1f2937",
      inkSoft: "#9aa3ae",
      text: "#ffffff",
      textDark: "#1f2937",
      primary: ["#5aa9ff", "#1f6fd0"],
      gold: ["#fbbf24", "#d97706"],
      danger: ["#f87171", "#dc2626"],
      info: ["#a78bfa", "#7c3aed"],
      pill: "#1f2937",
      pillStroke: "#111827",
      tile: "#2b3441",
      tileStroke: "#111827",
    },
    shape: { ...base, radius: 12, strokeThickness: 1.5, gradients: false, shadow: 4, shadowTransparency: 0.75, bevel: false, textOutline: 0, font: "GothamBlack", fontBody: "Gotham", ornament: "none", press: "slide" },
  },
  {
    id: "glass_soft",
    name: "Soft Glass",
    description: "Frosted translucent panels, hairline strokes, very round corners — calm and minimal.",
    keywords: ["glass", "verre", "frosted", "translucide", "minimal", "minimaliste", "soft", "doux", "zen", "chill", "aesthetic"],
    themes: ["minimal"],
    genres: ["hangout", "story", "puzzle", "rhythm", "farming"],
    tokens: {
      paper: "#f2f6ff",
      paperDark: "#dfe7f5",
      ink: "#3a4a66",
      inkSoft: "#8ea0bd",
      text: "#ffffff",
      textDark: "#2c3a52",
      primary: ["#9ad0ff", "#4a86c8"],
      gold: ["#ffdf9a", "#d6a23a"],
      danger: ["#ffa0a0", "#c85a5a"],
      info: ["#b9a8ff", "#6a5ad0"],
      pill: "#3a4a66",
      pillStroke: "#26324a",
      tile: "#44536e",
      tileStroke: "#26324a",
    },
    shape: { ...base, radius: 20, strokeThickness: 1.5, gradients: true, shadow: 3, shadowTransparency: 0.8, bevel: false, textOutline: 0, panelTransparency: 0.18, font: "Nunito", fontBody: "Nunito", ornament: "none", press: "slide" },
  },
  {
    id: "parchment_fantasy",
    name: "Parchment & Gold",
    description: "Quest-log fantasy UI: parchment panels, gold filigree edges, serif type.",
    keywords: ["fantasy", "fantaisie", "parchment", "parchemin", "quest", "quête", "medieval", "médiéval", "elf", "magic", "magie", "rpg ui", "scroll"],
    themes: ["fantasy"],
    genres: ["rpg", "adventure", "dungeon_crawler", "story", "survival"],
    tokens: {
      paper: "#f3e7c9",
      paperDark: "#dcc89a",
      ink: "#4a2f14",
      inkSoft: "#8a6a3a",
      text: "#fff6de",
      textDark: "#4a2f14",
      primary: ["#a8e063", "#3f8f2c"],
      gold: ["#ffd36a", "#c98a1c"],
      danger: ["#e07a5a", "#a03a20"],
      info: ["#8ab4e0", "#3a6a9a"],
      pill: "#4a2f14",
      pillStroke: "#2a1a08",
      tile: "#5a3f24",
      tileStroke: "#2a1a08",
    },
    shape: { ...base, radius: 10, strokeThickness: 3.5, font: "Fondamento", fontBody: "Merriweather", ornament: "filigree", press: "squash" },
  },
  {
    id: "stone_rune",
    name: "Stone & Rune",
    description: "Carved stone slabs with notched corners and rune-blue accents — dungeons and dwarven halls.",
    keywords: ["stone", "pierre", "rune", "dwarf", "nain", "dungeon", "donjon", "cave", "temple", "ruin", "ruine", "viking", "norse"],
    themes: ["fantasy"],
    genres: ["dungeon_crawler", "mining", "strategy", "tower_defense", "puzzle"],
    tokens: {
      paper: "#5c5c5e",
      paperDark: "#46464a",
      ink: "#1c1c20",
      inkSoft: "#8a8a90",
      text: "#f0f0ea",
      textDark: "#f0f0ea",
      primary: ["#7fb0d0", "#2f6a90"],
      gold: ["#e0c070", "#a07a20"],
      danger: ["#d06a5a", "#8a2a20"],
      info: ["#9ac0d0", "#4a7a90"],
      pill: "#2a2a2e",
      pillStroke: "#141418",
      tile: "#3a3a3e",
      tileStroke: "#141418",
    },
    shape: { ...base, radius: 4, strokeThickness: 3.5, gradients: true, shadow: 5, shadowTransparency: 0.45, bevel: false, textOutline: 2, font: "Antique", fontBody: "Merriweather", ornament: "notch", press: "squash" },
  },
  {
    id: "military_stencil",
    name: "Military Stencil",
    description: "Field-manual UI: olive panels, stencil caps, hazard stripes, sharp corners.",
    keywords: ["military", "militaire", "army", "armée", "war", "guerre", "tactical", "tactique", "soldier", "bunker", "camo", "stencil"],
    themes: ["military"],
    genres: ["fps", "battle", "battle_royale", "tower_defense", "strategy"],
    tokens: {
      paper: "#2b2f26",
      paperDark: "#1f221b",
      ink: "#0f120c",
      inkSoft: "#7a8050",
      text: "#e8e6d6",
      textDark: "#dcdcc4",
      primary: ["#9dbf5a", "#4d6b23"],
      gold: ["#e8c25a", "#a8781a"],
      danger: ["#d4603a", "#8a2a12"],
      info: ["#7a9ab0", "#35566a"],
      pill: "#171c12",
      pillStroke: "#9aa06a",
      tile: "#1f221b",
      tileStroke: "#9aa06a",
    },
    shape: { ...base, radius: 3, strokeThickness: 3, gradients: false, shadow: 4, shadowTransparency: 0.4, bevel: false, textOutline: 1.5, font: "GothamBlack", fontBody: "Code", ornament: "stripes", press: "none" },
  },
  {
    id: "steampunk_brass",
    name: "Steampunk Brass",
    description: "Riveted brass plates on leather, copper gradients, victorian serif type.",
    keywords: ["steampunk", "brass", "laiton", "victorian", "victorien", "clockwork", "gear", "engrenage", "airship", "dirigeable", "industrial", "industriel"],
    themes: [],
    genres: ["adventure", "rpg", "sandbox", "tycoon", "strategy"],
    tokens: {
      paper: "#5a4028",
      paperDark: "#42301e",
      ink: "#2a1c0e",
      inkSoft: "#a88452",
      text: "#ffeccd",
      textDark: "#f5dcb4",
      primary: ["#e0a850", "#96601c"],
      gold: ["#ffd98a", "#b8801e"],
      danger: ["#c8562e", "#7a2a10"],
      info: ["#8aa8a0", "#3a5a54"],
      pill: "#2e2012",
      pillStroke: "#a88452",
      tile: "#3a2a18",
      tileStroke: "#a88452",
    },
    shape: { ...base, radius: 8, strokeThickness: 3.5, shadow: 5, shadowTransparency: 0.45, textOutline: 2, font: "Bodoni", fontBody: "Merriweather", ornament: "rivets", press: "squash" },
  },
  {
    id: "wood_nature",
    name: "Wood & Leaf",
    description: "Cozy carved-wood panels with leaf-green buttons and handwritten labels — camps and villages.",
    keywords: ["wood", "bois", "nature", "forest", "forêt", "cozy", "cottage", "camp", "farm", "ferme", "garden", "jardin", "handmade", "rustique"],
    themes: [],
    genres: ["farming", "survival", "adventure", "hangout", "pet_collecting"],
    tokens: {
      paper: "#8a6238",
      paperDark: "#6d4c29",
      ink: "#33210f",
      inkSoft: "#b08c5c",
      text: "#fff4de",
      textDark: "#fff4de",
      primary: ["#9ad55a", "#4a8a2a"],
      gold: ["#ffd07a", "#c88a2a"],
      danger: ["#e08a5a", "#a04a20"],
      info: ["#8ac0d0", "#3a7a90"],
      pill: "#3d2a14",
      pillStroke: "#221507",
      tile: "#4f361b",
      tileStroke: "#221507",
    },
    shape: { ...base, radius: 12, strokeThickness: 3.5, shadow: 5, textOutline: 2, font: "PatrickHand", fontBody: "Nunito", ornament: "notch", press: "squash" },
  },
  {
    id: "luxury_gold",
    name: "Black & Gold",
    description: "VIP / casino UI: matte black panels, thin gold filigree, restrained serif type.",
    keywords: ["luxury", "luxe", "gold", "or", "vip", "casino", "rich", "riche", "elegant", "élégant", "premium", "diamond", "diamant", "mafia", "billionaire"],
    themes: [],
    genres: ["roleplay", "tycoon", "simulator", "clicker", "hangout"],
    tokens: {
      paper: "#15151a",
      paperDark: "#1f1f26",
      ink: "#d4af37",
      inkSoft: "#8a7328",
      text: "#f7eccd",
      textDark: "#e8d8a8",
      primary: ["#e8cd7a", "#a8832a"],
      gold: ["#ffe9a8", "#c8a03a"],
      danger: ["#d05a5a", "#8a2020"],
      info: ["#9aa8d0", "#4a558a"],
      pill: "#0d0d10",
      pillStroke: "#d4af37",
      tile: "#1a1a20",
      tileStroke: "#d4af37",
    },
    shape: { ...base, radius: 6, strokeThickness: 2, gradients: true, shadow: 4, shadowTransparency: 0.5, bevel: false, textOutline: 0, font: "Bodoni", fontBody: "Merriweather", ornament: "filigree", press: "slide" },
  },
  {
    id: "kawaii_pastel",
    name: "Kawaii Pastel",
    description: "Soft pastel bubbles with sticker edges and a cute bounce — anime and cafe games.",
    keywords: ["kawaii", "cute", "mignon", "pastel", "anime", "manga", "cafe", "café", "plush", "peluche", "sanrio", "adorable", "soft"],
    themes: [],
    genres: ["hangout", "pet_collecting", "farming", "roleplay", "minigames"],
    tokens: {
      paper: "#fff7fb",
      paperDark: "#ffe3f0",
      ink: "#8a6a9a",
      inkSoft: "#c0a0d0",
      text: "#ffffff",
      textDark: "#6a4a7a",
      primary: ["#ffb3e0", "#c86ab0"],
      gold: ["#ffe6a8", "#e0b060"],
      danger: ["#ffa8b8", "#d06a80"],
      info: ["#b8e0ff", "#6aa8d0"],
      pill: "#8a6a9a",
      pillStroke: "#5a3a6a",
      tile: "#a888b8",
      tileStroke: "#5a3a6a",
    },
    shape: { ...base, radius: 26, strokeThickness: 3.5, shadow: 5, shadowTransparency: 0.6, textOutline: 2, font: "Kalam", fontBody: "Nunito", ornament: "none", press: "pulse" },
  },
];

export const UI_KIT_INDEX: Record<string, UiKitDef> = Object.fromEntries(UI_KITS.map((k) => [k.id, k]));
export const UI_KIT_IDS = UI_KITS.map((k) => k.id);

/** Kit used when nothing matches (the look every mobile game ships with). */
export const DEFAULT_UI_KIT = "paper_cartoon";

/** Fallback kit per UI theme of a style family, so every style always has a full design system. */
export const UI_THEME_DEFAULT_KIT: Record<UiTheme, string> = {
  stylized: "paper_cartoon",
  cartoon: "paper_cartoon",
  candy: "candy_pop",
  "sci-fi": "neon_cyber",
  horror: "grim_horror",
  retro: "pixel_retro",
  modern: "clean_modern",
  minimal: "glass_soft",
  fantasy: "parchment_fantasy",
  military: "military_stencil",
};

/**
 * Picks the UI kit for a prompt: an explicit keyword wins ("UI rétro", "interface néon", "style
 * steampunk"), then the genre preference among the kits of the style's theme, then the theme default.
 * Always returns a kit id that exists.
 */
export function pickUiKit(prompt: string, theme: UiTheme, genreId?: string): string {
  const t = ` ${prompt.toLowerCase()} `;
  let best: { id: string; score: number } | undefined;
  for (const kit of UI_KITS) {
    let score = 0;
    for (const keyword of kit.keywords) {
      if (!t.includes(keyword.toLowerCase())) continue;
      // longer keywords are more specific ("8-bit" beats "retro"); a kit's own name counts double
      score += keyword.length + (keyword.toLowerCase() === kit.name.toLowerCase() ? 10 : 0);
    }
    if (score > 0 && genreId !== undefined && kit.genres.includes(genreId)) score += 2;
    if (score > 0 && kit.themes.includes(theme)) score += 1;
    if (score > 0 && (best === undefined || score > best.score)) best = { id: kit.id, score };
  }
  if (best) return best.id;
  if (genreId !== undefined) {
    const byGenre = UI_KITS.filter((k) => k.themes.includes(theme) && k.genres.includes(genreId));
    if (byGenre.length > 0) return byGenre[0]!.id;
  }
  const byTheme = UI_KITS.filter((k) => k.themes.includes(theme));
  if (byTheme.length > 0) return UI_THEME_DEFAULT_KIT[theme] ?? byTheme[0]!.id;
  return UI_THEME_DEFAULT_KIT[theme] ?? DEFAULT_UI_KIT;
}
