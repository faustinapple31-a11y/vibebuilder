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
  | "notch"
  /** dashed stitch just inside the border (fabric, jersey, western) */
  | "stitch"
  /** row of chevrons along the top edge (sport, speed) */
  | "chevrons"
  /** rising bubbles in the corners (underwater, soda) */
  | "bubbles"
  /** perspective grid at the bottom (vaporwave, synth) */
  | "grid";

/** Button feedback. */
export type UiPress = "squash" | "slide" | "flicker" | "pulse" | "none";

/** How a screen (kit.Window) appears. */
export type UiEnter = "pop" | "slide" | "fade" | "none";

/** Click feedback of the library (Roblox built-in sounds — nothing to upload). */
export type UiSound = "soft" | "click" | "beep" | "pop" | "thud" | "none";

/** What a control does under the cursor (or the gamepad selection). */
export type UiHover = "lift" | "glow" | "tint" | "outline" | "none";

/** What a click leaves behind at the cursor. */
export type UiClickFx = "ripple" | "burst" | "flash" | "none";

/** How loudly the library expresses item rarity on a tile. */
export type UiRarityFx = "glow" | "sparkle" | "shine" | "none";

/** What a win looks like: a purchase going through, a quest completed, a level gained. */
export type UiCelebrate = "confetti" | "coins" | "sparks" | "rays" | "none";

/** Bars: one smooth fill, or notched segments (consoles, field manuals, engineering consoles). */
export type UiBarStyle = "smooth" | "segmented";

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
  /** how a window opens */
  enter: UiEnter;
  /** multiplies every text size — decorative fonts (pixel, horror, handwritten) need > 1 */
  textScale: number;
  /** sound a button plays (built-in Roblox sounds) */
  sound: UiSound;
  /** hover / selection feedback */
  hover: UiHover;
  /** click effect left at the cursor */
  clickFx: UiClickFx;
  /** rarity treatment of item tiles */
  rarityFx: UiRarityFx;
  /**
   * Animation intensity, 0…1.4 — multiplies every duration and amplitude of the decorative effects
   * (0 disables the looping ones entirely: a pixel console or a field manual does not breathe).
   */
  motion: number;
  /** celebration of a win (purchase, quest, level) */
  celebrate: UiCelebrate;
  /** shape of a progress / countdown bar */
  barStyle: UiBarStyle;
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
  enter: "pop",
  textScale: 1,
  sound: "soft",
  hover: "lift",
  clickFx: "ripple",
  rarityFx: "glow",
  motion: 1,
  celebrate: "confetti",
  barStyle: "smooth",
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
    shape: { ...base, hover: "lift", clickFx: "ripple", rarityFx: "glow", motion: 1.0, celebrate: "confetti", barStyle: "smooth" },
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
      info: ["#9ad8ff", "#2f6fa8"],
      pill: "#7a2a5a",
      pillStroke: "#4d1538",
      tile: "#5a2a4a",
      tileStroke: "#2d1224",
    },
    shape: { ...base, radius: 24, strokeThickness: 4, font: "LuckiestGuy", fontBody: "Nunito", press: "pulse", shadow: 6, enter: "pop", sound: "pop", hover: "tint", clickFx: "burst", rarityFx: "sparkle", motion: 1.35, celebrate: "confetti", barStyle: "smooth" },
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
      gold: ["#ffd965", "#b84a12"],
      danger: ["#ff4f7a", "#9a0f3a"],
      info: ["#9a7aff", "#4a2fd0"],
      pill: "#0a1a26",
      pillStroke: "#35f0ff",
      tile: "#121a2a",
      tileStroke: "#35f0ff",
    },
    shape: { ...base, radius: 8, strokeThickness: 2.5, gradients: true, shadow: 0, bevel: false, textOutline: 1.5, panelTransparency: 0.08, font: "Michroma", fontBody: "Gotham", ornament: "glow", press: "flicker", enter: "fade", textScale: 0.95, sound: "beep", hover: "glow", clickFx: "ripple", rarityFx: "glow", motion: 1.1, celebrate: "sparks", barStyle: "segmented" },
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
      primary: ["#4fb0e0", "#134f7a"],
      gold: ["#d8b45a", "#6a4308"],
      danger: ["#ff8a6a", "#b03a20"],
      info: ["#58d8ae", "#0c523f"],
      pill: "#06121c",
      pillStroke: "#7fd8ff",
      tile: "#0b1a26",
      tileStroke: "#4a90b0",
    },
    shape: { ...base, radius: 2, strokeThickness: 1.5, gradients: false, shadow: 0, bevel: false, textOutline: 0, panelTransparency: 0.25, font: "Jura", fontBody: "Gotham", ornament: "brackets", press: "slide", enter: "slide", sound: "beep", hover: "outline", clickFx: "flash", rarityFx: "shine", motion: 0.9, celebrate: "rays", barStyle: "segmented" },
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
    shape: { ...base, radius: 4, strokeThickness: 2.5, gradients: false, shadow: 4, shadowTransparency: 0.35, bevel: false, textOutline: 1.5, font: "Creepster", fontBody: "SpecialElite", ornament: "grain", press: "none", enter: "fade", textScale: 1.12, sound: "thud", hover: "tint", clickFx: "flash", rarityFx: "none", motion: 0.35, celebrate: "none", barStyle: "segmented" },
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
      primary: ["#3aa84f", "#1b6529"],
      gold: ["#d9a91f", "#775207"],
      danger: ["#ff5a5a", "#a01f1f"],
      info: ["#5ab4ff", "#1f5fb0"],
      pill: "#14141d",
      pillStroke: "#0b0b12",
      tile: "#1d1d29",
      tileStroke: "#0b0b12",
    },
    shape: { ...base, radius: 0, strokeThickness: 4, gradients: false, shadow: 6, shadowTransparency: 0.2, bevel: false, textOutline: 0, font: "Arcade", fontBody: "Code", ornament: "none", press: "none", enter: "none", textScale: 0.88, sound: "click", hover: "outline", clickFx: "none", rarityFx: "shine", motion: 0.0, celebrate: "coins", barStyle: "segmented" },
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
      inkSoft: "#8f6ad0",
      text: "#ffffff",
      textDark: "#ffd9f6",
      primary: ["#ff5ad4", "#7a1fb4"],
      gold: ["#ffe15a", "#c56b1b"],
      danger: ["#ff4f5e", "#a01f3a"],
      info: ["#5affe1", "#1f8fb4"],
      pill: "#12061f",
      pillStroke: "#ff5ad4",
      tile: "#1f1136",
      tileStroke: "#5affe1",
    },
    shape: { ...base, radius: 6, strokeThickness: 3, shadow: 4, shadowTransparency: 0.4, textOutline: 2.5, font: "Arcade", fontBody: "Michroma", ornament: "scanlines", press: "pulse", enter: "slide", textScale: 0.88, sound: "beep", hover: "glow", clickFx: "burst", rarityFx: "sparkle", motion: 1.25, celebrate: "sparks", barStyle: "segmented" },
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
    shape: { ...base, radius: 12, strokeThickness: 1.5, gradients: false, shadow: 4, shadowTransparency: 0.75, bevel: false, textOutline: 0, font: "GothamBlack", fontBody: "Gotham", ornament: "none", press: "slide", enter: "slide", sound: "click", hover: "lift", clickFx: "ripple", rarityFx: "shine", motion: 0.8, celebrate: "rays", barStyle: "smooth" },
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
    shape: { ...base, radius: 20, strokeThickness: 1.5, gradients: true, shadow: 3, shadowTransparency: 0.8, bevel: false, textOutline: 0, panelTransparency: 0.18, font: "Nunito", fontBody: "Nunito", ornament: "none", press: "slide", enter: "fade", textScale: 1.05, sound: "soft", hover: "glow", clickFx: "ripple", rarityFx: "shine", motion: 0.85, celebrate: "rays", barStyle: "smooth" },
  },
  {
    id: "parchment_fantasy",
    name: "Parchment & Gold",
    description: "Quest-log fantasy UI: parchment panels, gold filigree edges, serif type.",
    // look words only: "quest" alone would grab any RPG prompt, which is a mechanic, not a look
    keywords: ["fantasy", "fantaisie", "parchment", "parchemin", "quest log", "journal de quêtes", "medieval", "médiéval", "elf", "magic", "magie", "rpg ui", "scroll", "grimoire"],
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
    shape: { ...base, radius: 10, strokeThickness: 3.5, font: "Fondamento", fontBody: "Merriweather", ornament: "filigree", press: "squash", textScale: 1.08, sound: "soft", hover: "lift", clickFx: "ripple", rarityFx: "sparkle", motion: 0.95, celebrate: "sparks", barStyle: "smooth" },
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
      gold: ["#e0c070", "#9a751f"],
      danger: ["#d06a5a", "#8a2a20"],
      info: ["#9ac0d0", "#4a7a90"],
      pill: "#2a2a2e",
      pillStroke: "#141418",
      tile: "#3a3a3e",
      tileStroke: "#141418",
    },
    shape: { ...base, radius: 4, strokeThickness: 3.5, gradients: true, shadow: 5, shadowTransparency: 0.45, bevel: false, textOutline: 2, font: "Antique", fontBody: "Merriweather", ornament: "notch", press: "squash", enter: "slide", sound: "thud", hover: "tint", clickFx: "flash", rarityFx: "glow", motion: 0.7, celebrate: "sparks", barStyle: "segmented" },
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
      inkSoft: "#9aa06a",
      text: "#e8e6d6",
      textDark: "#dcdcc4",
      primary: ["#9dbf5a", "#4d6b23"],
      gold: ["#e8c25a", "#946a17"],
      danger: ["#d4603a", "#8a2a12"],
      info: ["#7a9ab0", "#35566a"],
      pill: "#171c12",
      pillStroke: "#9aa06a",
      tile: "#1f221b",
      tileStroke: "#9aa06a",
    },
    shape: { ...base, radius: 3, strokeThickness: 3, gradients: false, shadow: 4, shadowTransparency: 0.4, bevel: false, textOutline: 1.5, font: "GothamBlack", fontBody: "Code", ornament: "stripes", press: "none", enter: "none", textScale: 0.95, sound: "click", hover: "outline", clickFx: "none", rarityFx: "none", motion: 0.25, celebrate: "none", barStyle: "segmented" },
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
      gold: ["#f0c56e", "#8b5f12"],
      danger: ["#c8562e", "#7a2a10"],
      info: ["#8aa8a0", "#3a5a54"],
      pill: "#2e2012",
      pillStroke: "#a88452",
      tile: "#3a2a18",
      tileStroke: "#a88452",
    },
    shape: { ...base, radius: 8, strokeThickness: 3.5, shadow: 5, shadowTransparency: 0.45, textOutline: 2, font: "Bodoni", fontBody: "Merriweather", ornament: "rivets", press: "squash", textScale: 1.06, sound: "thud", hover: "lift", clickFx: "burst", rarityFx: "glow", motion: 0.9, celebrate: "coins", barStyle: "segmented" },
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
      gold: ["#ffd07a", "#a87423"],
      danger: ["#e08a5a", "#a04a20"],
      info: ["#8ac0d0", "#3a7a90"],
      pill: "#3d2a14",
      pillStroke: "#221507",
      tile: "#4f361b",
      tileStroke: "#221507",
    },
    shape: { ...base, radius: 12, strokeThickness: 3.5, shadow: 5, textOutline: 2, font: "PatrickHand", fontBody: "Nunito", ornament: "notch", press: "squash", textScale: 1.12, sound: "soft", hover: "lift", clickFx: "ripple", rarityFx: "sparkle", motion: 1.0, celebrate: "confetti", barStyle: "smooth" },
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
      primary: ["#b2914a", "#55400f"],
      gold: ["#c9aa5f", "#5c4713"],
      danger: ["#d05a5a", "#8a2020"],
      info: ["#9aa8d0", "#4a558a"],
      pill: "#0d0d10",
      pillStroke: "#d4af37",
      tile: "#1a1a20",
      tileStroke: "#d4af37",
    },
    shape: { ...base, radius: 6, strokeThickness: 2, gradients: true, shadow: 4, shadowTransparency: 0.5, bevel: false, textOutline: 0, font: "Bodoni", fontBody: "Merriweather", ornament: "filigree", press: "slide", enter: "fade", textScale: 1.06, sound: "soft", hover: "glow", clickFx: "flash", rarityFx: "shine", motion: 0.8, celebrate: "coins", barStyle: "smooth" },
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
      primary: ["#ffb3e0", "#c066a9"],
      gold: ["#ffe6a8", "#e0b060"],
      danger: ["#ffa8b8", "#c8667b"],
      info: ["#b8e0ff", "#3f7fa8"],
      pill: "#6a4a7a",
      pillStroke: "#43284f",
      tile: "#7a5a8a",
      tileStroke: "#43284f",
    },
    shape: { ...base, radius: 26, strokeThickness: 3.5, shadow: 5, shadowTransparency: 0.6, textOutline: 2, font: "Kalam", fontBody: "Nunito", ornament: "none", press: "pulse", textScale: 1.12, sound: "pop", hover: "tint", clickFx: "burst", rarityFx: "sparkle", motion: 1.4, celebrate: "confetti", barStyle: "smooth" },
  },
  {
    id: "western_saloon",
    name: "Western Saloon",
    description: "Wanted-poster UI: sun-bleached paper, burnt wood frame, stitched edge and a rope-brown palette.",
    keywords: ["western", "far west", "cowboy", "saloon", "desert town", "wanted", "sheriff", "ranch", "gold rush", "bandit"],
    themes: [],
    genres: ["adventure", "roleplay", "battle", "tycoon", "survival"],
    tokens: {
      paper: "#e8d4ab",
      paperDark: "#cdb385",
      ink: "#3a2412",
      inkSoft: "#8a6236",
      text: "#fff3d8",
      textDark: "#3a2412",
      primary: ["#c98f3e", "#8a5418"],
      gold: ["#f0c669", "#9c6f14"],
      danger: ["#c6533a", "#7c2211"],
      info: ["#8aa38a", "#43613f"],
      pill: "#3a2412",
      pillStroke: "#1e1206",
      tile: "#51371c",
      tileStroke: "#1e1206",
    },
    shape: { ...base, radius: 6, strokeThickness: 3.5, shadow: 5, textOutline: 2, font: "Antique", fontBody: "SpecialElite", ornament: "stitch", press: "squash", enter: "slide", textScale: 1.06, sound: "thud", hover: "tint", clickFx: "flash", rarityFx: "glow", motion: 0.7, celebrate: "coins", barStyle: "segmented" },
  },
  {
    id: "vapor_wave",
    name: "Vapor Wave",
    description: "Sunset gradients, chrome type and a perspective grid — 90s mall aesthetic.",
    keywords: ["vaporwave", "vapor", "aesthetic", "sunset grid", "mall", "chrome", "pastel neon", "lofi", "dreamcore"],
    themes: [],
    genres: ["rhythm", "hangout", "racing", "minigames", "simulator"],
    tokens: {
      paper: "#2a1442",
      paperDark: "#3a1c58",
      ink: "#12051f",
      inkSoft: "#a07ad0",
      text: "#fff0ff",
      textDark: "#ffd9f6",
      primary: ["#ff8ad8", "#8a2fa8"],
      gold: ["#f0d271", "#8f5b12"],
      danger: ["#ff6f8a", "#9a1f45"],
      info: ["#8ae7ff", "#1f7aa8"],
      pill: "#180a28",
      pillStroke: "#ff8ad8",
      tile: "#24123a",
      tileStroke: "#8ae7ff",
    },
    shape: { ...base, radius: 10, strokeThickness: 2.5, shadow: 4, shadowTransparency: 0.45, bevel: false, textOutline: 2, font: "Michroma", fontBody: "Gotham", ornament: "grid", press: "pulse", enter: "fade", textScale: 0.95, sound: "beep", hover: "glow", clickFx: "ripple", rarityFx: "sparkle", motion: 1.2, celebrate: "sparks", barStyle: "segmented" },
  },
  {
    id: "y2k_bubble",
    name: "Y2K Bubble",
    description: "Early-2000s software: glossy blue bubbles, chrome rims, soda-bubble corners.",
    keywords: ["y2k", "2000s", "bubble", "glossy", "aqua", "chrome", "frutiger", "cd player", "rétro futuriste"],
    themes: [],
    genres: ["minigames", "hangout", "clicker", "simulator", "rhythm"],
    tokens: {
      paper: "#e6f2ff",
      paperDark: "#c6dcf5",
      ink: "#1a3a63",
      inkSoft: "#6e9ac9",
      text: "#ffffff",
      textDark: "#132a47",
      primary: ["#7ec8ff", "#1f6fc0"],
      gold: ["#ffe08a", "#b07f14"],
      danger: ["#ff9a9a", "#c2342f"],
      info: ["#b9a8ff", "#5a43c8"],
      pill: "#132a47",
      pillStroke: "#0a1a2e",
      tile: "#25456e",
      tileStroke: "#0a1a2e",
    },
    shape: { ...base, radius: 20, strokeThickness: 2.5, shadow: 4, shadowTransparency: 0.6, textOutline: 0, font: "GothamBlack", fontBody: "Gotham", ornament: "bubbles", press: "pulse", enter: "pop", sound: "pop", hover: "glow", clickFx: "burst", rarityFx: "shine", motion: 1.25, celebrate: "confetti", barStyle: "smooth" },
  },
  {
    id: "frost_ice",
    name: "Frost & Ice",
    description: "Frozen glass plates with pale blue light and a frosted stitch of ice on the edge.",
    keywords: ["ice", "glace", "frost", "givre", "frozen", "gelé", "winter", "hiver", "snow", "neige", "arctic", "glacier"],
    themes: [],
    genres: ["survival", "adventure", "obby", "racing", "battle_royale"],
    tokens: {
      paper: "#dff0fa",
      paperDark: "#bfdcee",
      ink: "#123a52",
      inkSoft: "#6aa4c4",
      text: "#ffffff",
      textDark: "#0f2f44",
      primary: ["#8fdcff", "#1f7fa8"],
      gold: ["#ffe9a8", "#a8791a"],
      danger: ["#ff9aa8", "#b02f45"],
      info: ["#b9d8ff", "#3f5fa8"],
      pill: "#0f2f44",
      pillStroke: "#071b28",
      tile: "#1e4c66",
      tileStroke: "#071b28",
    },
    shape: { ...base, radius: 16, strokeThickness: 2.5, shadow: 3, shadowTransparency: 0.75, bevel: false, textOutline: 0, panelTransparency: 0.12, font: "Nunito", fontBody: "Nunito", ornament: "stitch", press: "slide", enter: "fade", textScale: 1.05, sound: "soft", hover: "glow", clickFx: "ripple", rarityFx: "sparkle", motion: 0.9, celebrate: "sparks", barStyle: "smooth" },
  },
  {
    id: "sand_temple",
    name: "Sand Temple",
    description: "Carved sandstone tablets with turquoise inlays and notched corners — deserts and tombs.",
    keywords: ["desert", "désert", "egypt", "égypte", "pyramid", "pyramide", "temple", "tomb", "tombeau", "sand", "sable", "oasis", "pharaoh", "aztec", "maya"],
    themes: [],
    genres: ["adventure", "dungeon_crawler", "rpg", "mining", "puzzle"],
    tokens: {
      paper: "#d9bc86",
      paperDark: "#bd9d68",
      ink: "#3f2c12",
      inkSoft: "#8a6c3a",
      text: "#fff6e0",
      textDark: "#3f2c12",
      primary: ["#5ec2b0", "#1d7a6c"],
      gold: ["#f4d071", "#9a7014"],
      danger: ["#d06a3a", "#8a2c10"],
      info: ["#8ab8c8", "#3a6a7a"],
      pill: "#3f2c12",
      pillStroke: "#231705",
      tile: "#5a4020",
      tileStroke: "#231705",
    },
    shape: { ...base, radius: 4, strokeThickness: 3.5, shadow: 5, shadowTransparency: 0.45, bevel: false, textOutline: 2, font: "Antique", fontBody: "Merriweather", ornament: "notch", press: "squash", enter: "slide", textScale: 1.05, sound: "thud", hover: "tint", clickFx: "flash", rarityFx: "glow", motion: 0.7, celebrate: "rays", barStyle: "segmented" },
  },
  {
    id: "deep_sea",
    name: "Deep Sea",
    description: "Submarine portholes: deep teal glass, bio-luminescent accents and rising bubbles.",
    keywords: ["ocean", "océan", "sea", "mer", "underwater", "sous-marin", "aquarium", "diving", "plongée", "fishing", "pêche", "coral", "corail", "abyss"],
    themes: [],
    genres: ["simulator", "adventure", "farming", "survival", "hangout"],
    tokens: {
      paper: "#07303c",
      paperDark: "#0b4050",
      ink: "#02161d",
      inkSoft: "#4aa8b8",
      text: "#e8ffff",
      textDark: "#aef0ff",
      primary: ["#4fe0c8", "#12867a"],
      gold: ["#ffe08a", "#a8761a"],
      danger: ["#ff8a8a", "#a82f3a"],
      info: ["#7ec8ff", "#1f6fa8"],
      pill: "#02161d",
      pillStroke: "#4aa8b8",
      tile: "#0a2c38",
      tileStroke: "#4aa8b8",
    },
    shape: { ...base, radius: 18, strokeThickness: 3, shadow: 4, shadowTransparency: 0.5, bevel: false, textOutline: 1.5, panelTransparency: 0.06, font: "Nunito", fontBody: "Gotham", ornament: "bubbles", press: "slide", enter: "fade", textScale: 1.05, sound: "soft", hover: "glow", clickFx: "ripple", rarityFx: "sparkle", motion: 1.05, celebrate: "sparks", barStyle: "smooth" },
  },
  {
    id: "noir_detective",
    name: "Noir Detective",
    description: "Black-and-white case file: newsprint paper, hard ink rules, film grain, no colour but one red stamp.",
    keywords: ["noir", "detective", "détective", "mystery", "mystère", "crime", "enquête", "1920", "mafia", "black and white", "journal", "newspaper"],
    themes: [],
    genres: ["story", "puzzle", "horror", "roleplay", "dungeon_crawler"],
    tokens: {
      paper: "#ded9cf",
      paperDark: "#bdb7ac",
      ink: "#14120f",
      inkSoft: "#6a665e",
      text: "#f4f1ea",
      textDark: "#14120f",
      primary: ["#6e6a62", "#2e2c28"],
      gold: ["#d8cfae", "#7a6e42"],
      danger: ["#c8402f", "#7a1c12"],
      info: ["#8a98a0", "#3c4850"],
      pill: "#14120f",
      pillStroke: "#000000",
      tile: "#2a2723",
      tileStroke: "#000000",
    },
    shape: { ...base, radius: 2, strokeThickness: 3, gradients: false, shadow: 5, shadowTransparency: 0.35, bevel: false, textOutline: 0, font: "SpecialElite", fontBody: "SpecialElite", ornament: "grain", press: "none", enter: "fade", textScale: 1.08, sound: "click", hover: "outline", clickFx: "none", rarityFx: "none", motion: 0.3, celebrate: "none", barStyle: "segmented" },
  },
  {
    id: "sport_jersey",
    name: "Sport Jersey",
    description: "Stadium scoreboard: jersey stripes, chevrons, bold condensed caps on a deep field green.",
    keywords: ["sport", "football", "soccer", "basket", "stadium", "stade", "jersey", "maillot", "league", "championnat", "esport", "tournament", "tournoi"],
    themes: [],
    genres: ["sports", "racing", "battle", "fps", "minigames"],
    tokens: {
      paper: "#123a24",
      paperDark: "#0d2c1b",
      ink: "#05160c",
      inkSoft: "#4a8a5f",
      text: "#f2fff5",
      textDark: "#d8ffe4",
      primary: ["#6ee88a", "#17913f"],
      gold: ["#ffdf6a", "#a87a10"],
      danger: ["#ff7a6a", "#a82a18"],
      info: ["#7ec4ff", "#1f6cb0"],
      pill: "#05160c",
      pillStroke: "#000000",
      tile: "#0f2e1d",
      tileStroke: "#000000",
    },
    shape: { ...base, radius: 6, strokeThickness: 3, shadow: 4, shadowTransparency: 0.4, textOutline: 2, font: "GothamBlack", fontBody: "GothamBold", ornament: "chevrons", press: "slide", enter: "slide", textScale: 0.98, sound: "click", hover: "lift", clickFx: "burst", rarityFx: "shine", motion: 1.15, celebrate: "confetti", barStyle: "segmented" },
  },
  {
    id: "graffiti_street",
    name: "Graffiti Street",
    description: "Spray-can street UI: concrete panels, tag-green and hot-pink sprays, taped corners.",
    keywords: ["graffiti", "street", "rue", "urban", "urbain", "skate", "hip hop", "spray", "tag", "parkour city", "banlieue", "block"],
    themes: [],
    genres: ["parkour", "hangout", "racing", "minigames", "roleplay"],
    tokens: {
      paper: "#3a3a3d",
      paperDark: "#2b2b2e",
      ink: "#131315",
      inkSoft: "#7a7a80",
      text: "#f6fff0",
      textDark: "#f0f0ea",
      primary: ["#b8ff4a", "#538e11"],
      gold: ["#ffd84a", "#a87a10"],
      danger: ["#ff4fa0", "#a8156a"],
      info: ["#4ad8ff", "#1478a8"],
      pill: "#131315",
      pillStroke: "#000000",
      tile: "#242427",
      tileStroke: "#000000",
    },
    shape: { ...base, radius: 4, strokeThickness: 3.5, shadow: 5, shadowTransparency: 0.4, textOutline: 2.5, font: "PermanentMarker", fontBody: "GothamBold", ornament: "stitch", press: "squash", enter: "pop", textScale: 1.05, sound: "pop", hover: "tint", clickFx: "burst", rarityFx: "glow", motion: 1.2, celebrate: "confetti", barStyle: "segmented" },
  },
  {
    id: "mission_control",
    name: "Mission Control",
    description: "Space-agency console: off-white panels, orange safety accents, technical mono type and corner brackets.",
    keywords: ["nasa", "mission", "space agency", "astronaut", "astronaute", "rocket", "fusée", "launch", "orbital", "technical", "engineering", "ingénieur", "lab", "laboratoire"],
    themes: [],
    genres: ["tycoon", "strategy", "simulator", "sandbox", "story"],
    tokens: {
      paper: "#e9e7e2",
      paperDark: "#cfccc4",
      ink: "#1f2226",
      inkSoft: "#7d8288",
      text: "#ffffff",
      textDark: "#1f2226",
      primary: ["#ff9a4a", "#c25510"],
      gold: ["#ffd76a", "#9a6f10"],
      danger: ["#ff6a5a", "#a8231a"],
      info: ["#6ab4ff", "#1f5fa8"],
      pill: "#1f2226",
      pillStroke: "#0d0f12",
      tile: "#2e3339",
      tileStroke: "#0d0f12",
    },
    shape: { ...base, radius: 3, strokeThickness: 2, gradients: false, shadow: 3, shadowTransparency: 0.7, bevel: false, textOutline: 0, font: "GothamBlack", fontBody: "Code", ornament: "brackets", press: "slide", enter: "slide", textScale: 0.95, sound: "beep", hover: "outline", clickFx: "flash", rarityFx: "shine", motion: 0.6, celebrate: "rays", barStyle: "segmented" },
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

// ---------------------------------------------------------------- readability helpers

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a `#rrggbb` token. */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio between two `#rrggbb` tokens (1 = identical, 21 = black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The label colour a kit uses on a given surface: whichever of `text` / `textDark` reads better —
 * the same choice `textOn()` makes at runtime in the template's kit.ts.
 */
export function bestTextOn(kit: UiKitDef, background: string): string {
  return contrastRatio(kit.tokens.text, background) >= contrastRatio(kit.tokens.textDark, background) ? kit.tokens.text : kit.tokens.textDark;
}

/**
 * Outline colour for the kit's panels: `ink`, unless it disappears into the panel (dark libraries),
 * in which case the softer ink reads better. Mirrors `theme.edge` in the template.
 */
export function panelEdge(kit: UiKitDef): string {
  const ink = contrastRatio(kit.tokens.ink, kit.tokens.paper);
  const soft = contrastRatio(kit.tokens.inkSoft, kit.tokens.paper);
  return ink >= 1.8 || ink >= soft ? kit.tokens.ink : kit.tokens.inkSoft;
}

/**
 * Outline colour for the kit's type. `ink` doubles as the text rim, but a library whose ink is light
 * (neon cyan, gold, pale HUD blue) would then put a light rim around light text — gold on gold. Those
 * kits get a deepened ink instead, which is what `theme.textStroke` resolves to at runtime.
 */
export function textStroke(kit: UiKitDef): string {
  const ink = kit.tokens.ink;
  if (luminance(ink) < 0.25) return ink;
  const n = Number.parseInt(ink.slice(1), 16);
  const deep = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * 0.22));
  return `#${deep.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Label colour for a gradient: the text sits across both stops, so the choice maximises the *worst*
 * of the two contrasts (a cream label on a gradient that starts pale gold would pass on the dark
 * bottom and vanish at the top). `textOnGradient` in the template mirrors this.
 */
export function bestTextOnGradient(kit: UiKitDef, gradient: [string, string]): string {
  const worst = (color: string) => Math.min(contrastRatio(color, gradient[0]), contrastRatio(color, gradient[1]));
  return worst(kit.tokens.text) >= worst(kit.tokens.textDark) ? kit.tokens.text : kit.tokens.textDark;
}

/** Contrast of the label a gradient actually gets, against its worst stop. */
export function gradientContrast(kit: UiKitDef, gradient: [string, string]): number {
  const label = bestTextOnGradient(kit, gradient);
  return Math.min(contrastRatio(label, gradient[0]), contrastRatio(label, gradient[1]));
}
