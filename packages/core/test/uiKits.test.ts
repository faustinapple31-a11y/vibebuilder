import { describe, expect, it } from "vitest";
import { GENRES, STYLE_FAMILIES, UI_KITS, UI_KIT_IDS, UI_KIT_INDEX, UI_THEMES, UI_THEME_DEFAULT_KIT, bestTextOn, bestTextOnGradient, contrastRatio, panelEdge, pickUiKit, textStroke } from "../src";

/** Fonts that exist in Roblox's Enum.Font (a typo here would break rbxtsc in every generated project). */
const ROBLOX_FONTS = [
  "Legacy", "Arial", "ArialBold", "SourceSans", "SourceSansBold", "SourceSansSemibold", "SourceSansLight", "SourceSansItalic",
  "Bodoni", "Garamond", "Cartoon", "Code", "Highway", "SciFi", "Arcade", "Fantasy", "Antique", "Gotham", "GothamMedium",
  "GothamBold", "GothamBlack", "AmaticSC", "Bangers", "Creepster", "DenkOne", "Fondamento", "FredokaOne", "Grenze",
  "IndieFlower", "JosefinSans", "Jura", "Kalam", "LuckiestGuy", "Merriweather", "Michroma", "Nunito", "Oswald",
  "PatrickHand", "PermanentMarker", "Roboto", "RobotoCondensed", "RobotoMono", "Sarpanch", "SpecialElite", "TitilliumWeb", "Ubuntu",
];

describe("UI kit libraries", () => {
  it("are well formed (unique ids, hex tokens, real fonts)", () => {
    expect(new Set(UI_KIT_IDS).size).toBe(UI_KITS.length);
    for (const kit of UI_KITS) {
      expect(kit.keywords.length, kit.id).toBeGreaterThan(3);
      expect(kit.description.length, kit.id).toBeGreaterThan(20);
      const colors = [kit.tokens.paper, kit.tokens.paperDark, kit.tokens.ink, kit.tokens.inkSoft, kit.tokens.text, kit.tokens.textDark, kit.tokens.pill, kit.tokens.pillStroke, kit.tokens.tile, kit.tokens.tileStroke, ...kit.tokens.primary, ...kit.tokens.gold, ...kit.tokens.danger, ...kit.tokens.info];
      for (const c of colors) expect(c, `${kit.id}: ${c}`).toMatch(/^#[0-9a-f]{6}$/);
      expect(ROBLOX_FONTS, `${kit.id} font`).toContain(kit.shape.font);
      expect(ROBLOX_FONTS, `${kit.id} body font`).toContain(kit.shape.fontBody);
      expect(kit.shape.radius, kit.id).toBeGreaterThanOrEqual(0);
      expect(kit.shape.strokeThickness, kit.id).toBeGreaterThan(0);
      expect(kit.shape.textScale, kit.id).toBeGreaterThanOrEqual(0.8);
      expect(kit.shape.textScale, kit.id).toBeLessThanOrEqual(1.25);
      expect(["pop", "slide", "fade", "none"], `${kit.id} enter`).toContain(kit.shape.enter);
      expect(["soft", "click", "beep", "pop", "thud", "none"], `${kit.id} sound`).toContain(kit.shape.sound);
      expect(["lift", "glow", "tint", "outline", "none"], `${kit.id} hover`).toContain(kit.shape.hover);
      expect(["ripple", "burst", "flash", "none"], `${kit.id} clickFx`).toContain(kit.shape.clickFx);
      expect(["glow", "sparkle", "shine", "none"], `${kit.id} rarityFx`).toContain(kit.shape.rarityFx);
      expect(["confetti", "coins", "sparks", "rays", "none"], `${kit.id} celebrate`).toContain(kit.shape.celebrate);
      expect(["smooth", "segmented"], `${kit.id} barStyle`).toContain(kit.shape.barStyle);
      expect(kit.shape.motion, `${kit.id} motion`).toBeGreaterThanOrEqual(0);
      expect(kit.shape.motion, `${kit.id} motion`).toBeLessThanOrEqual(1.4);
      for (const genre of kit.genres) expect(GENRES.some((g) => g.id === genre), `${kit.id} → ${genre}`).toBe(true);
    }
  });

  it("keeps the still libraries still and the playful ones lively", () => {
    // a pixel console, a field manual and a case file must not breathe; candy and kawaii must
    const still = ["pixel_retro", "military_stencil", "noir_detective", "grim_horror"];
    for (const id of still) expect(UI_KIT_INDEX[id]!.shape.motion, id).toBeLessThanOrEqual(0.4);
    for (const id of ["candy_pop", "kawaii_pastel", "arcade_synth"]) expect(UI_KIT_INDEX[id]!.shape.motion, id).toBeGreaterThanOrEqual(1.2);
    // a library with no animation budget should not claim a looping rarity effect either
    for (const kit of UI_KITS) {
      if (kit.shape.motion > 0) continue;
      expect(["none", "shine"], `${kit.id} asks for ${kit.shape.rarityFx} with motion 0`).toContain(kit.shape.rarityFx);
    }
    // a horror, military or noir UI does not throw a party
    for (const id of ["grim_horror", "military_stencil", "noir_detective"]) {
      expect(UI_KIT_INDEX[id]!.shape.celebrate, `${id} should not celebrate`).toBe("none");
    }
    // consoles and manuals read their bars in steps
    for (const id of ["pixel_retro", "military_stencil", "mission_control"]) {
      expect(UI_KIT_INDEX[id]!.shape.barStyle, id).toBe("segmented");
    }
  });

  it("covers every UI theme with an existing default kit", () => {
    for (const theme of UI_THEMES) {
      const id = UI_THEME_DEFAULT_KIT[theme];
      expect(UI_KIT_INDEX[id], `${theme} → ${id}`).toBeTruthy();
    }
  });

  it("resolves a kit for every style family × genre, with no prompt", () => {
    for (const style of STYLE_FAMILIES) {
      for (const genre of GENRES) {
        const id = pickUiKit("", style.ui, genre.id);
        expect(UI_KIT_INDEX[id], `${style.id} / ${genre.id} → ${id}`).toBeTruthy();
      }
    }
  });

  it("honours an explicit UI request in the prompt, whatever the world style", () => {
    const cases: [string, string][] = [
      ["je veux un ui style retro pixel", "pixel_retro"],
      ["village médiéval avec une interface néon cyberpunk", "neon_cyber"],
      ["simulateur de pets avec une UI kawaii pastel", "kawaii_pastel"],
      ["tycoon de casino, ui luxe or", "luxury_gold"],
      ["base militaire, interface tactique", "military_stencil"],
      ["steampunk airship adventure", "steampunk_brass"],
      ["cozy farm in wood and leaves", "wood_nature"],
      ["arcade racing, années 80 synthwave", "arcade_synth"],
      ["space station hologram hud", "holo_hud"],
      ["minimal frosted glass puzzle", "glass_soft"],
      ["dungeon of carved stone and runes", "stone_rune"],
      ["horror manor, creepy dark ui", "grim_horror"],
      ["parchment quest log, medieval rpg", "parchment_fantasy"],
      ["candy shop simulator, bonbon", "candy_pop"],
      ["modern city roleplay, clean flat app ui", "clean_modern"],
      ["far west cowboy town, wanted posters", "western_saloon"],
      ["vaporwave mall aesthetic", "vapor_wave"],
      ["y2k glossy bubble interface", "y2k_bubble"],
      ["frozen glacier survival, ui de glace", "frost_ice"],
      ["pyramide égyptienne, temple du désert", "sand_temple"],
      ["underwater fishing, ui océan", "deep_sea"],
      ["détective noir, enquête en noir et blanc", "noir_detective"],
      ["football stadium league, maillot", "sport_jersey"],
      ["street skate graffiti city", "graffiti_street"],
      ["nasa rocket launch mission control", "mission_control"],
    ];
    // "stylized" is the most neutral theme: the keyword must win on its own
    for (const [prompt, expected] of cases) expect(pickUiKit(prompt, "stylized"), prompt).toBe(expected);
  });

  it("falls back to the theme default when the prompt says nothing about the UI", () => {
    expect(pickUiKit("a big island with a village", "cartoon")).toBe(UI_THEME_DEFAULT_KIT.cartoon);
    expect(pickUiKit("a big island with a village", "military")).toBe(UI_THEME_DEFAULT_KIT.military);
  });
});

describe("UI kit readability (WCAG)", () => {
  /** Flat surfaces carry no gradient: the label must read on them outright. */
  const flat = (kit: (typeof UI_KITS)[number]): [string, string][] => [
    ["paper", kit.tokens.paper],
    ["paperDark", kit.tokens.paperDark],
    ["pill", kit.tokens.pill],
    ["tile", kit.tokens.tile],
  ];

  const parse = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  /** What a glyph spanning a vertical gradient effectively sits on. */
  const midpoint = (a: string, b: string) => {
    const [r1, g1, b1] = parse(a);
    const [r2, g2, b2] = parse(b);
    return `#${[(r1 + r2) / 2, (g1 + g2) / 2, (b1 + b2) / 2].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  };

  it("keeps labels readable on the flat surfaces", () => {
    for (const kit of UI_KITS) {
      for (const [name, background] of flat(kit)) {
        const ratio = contrastRatio(bestTextOn(kit, background), background);
        expect(ratio, `${kit.id}: text on ${name} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps labels readable on the gradients (an outlined glyph needs less)", () => {
    for (const kit of UI_KITS) {
      // the kit's type carries a UIStroke in `textStroke`, which separates it from the fill; a kit
      // that draws flat type (textOutline 0) has to earn the contrast from the colours alone
      const min = kit.shape.textOutline > 0 ? 2 : 3;
      const gradients: [string, [string, string]][] = [
        ["primary", kit.tokens.primary],
        ["gold", kit.tokens.gold],
        ["danger", kit.tokens.danger],
        ["info", kit.tokens.info],
      ];
      for (const [name, pair] of gradients) {
        const label = bestTextOnGradient(kit, pair);
        const ratio = contrastRatio(label, midpoint(pair[0], pair[1]));
        expect(ratio, `${kit.id}: label on the ${name} gradient is ${ratio.toFixed(2)}:1 (outline ${kit.shape.textOutline})`).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it("keeps the panel outline, the text rim and the highlight usable", () => {
    for (const kit of UI_KITS) {
      const edge = contrastRatio(panelEdge(kit), kit.tokens.paper);
      expect(edge, `${kit.id}: panel outline is ${edge.toFixed(2)}:1 against the panel`).toBeGreaterThanOrEqual(1.8);
      // the rim has to separate the glyph from its fill, so it must contrast with the type itself
      const rim = contrastRatio(textStroke(kit), kit.tokens.text);
      expect(rim, `${kit.id}: text rim vs text is ${rim.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
      const highlight = contrastRatio(kit.tokens.gold[0], kit.tokens.pill);
      expect(highlight, `${kit.id}: highlight on the pill is ${highlight.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
  });
});
