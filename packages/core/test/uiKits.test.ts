import { describe, expect, it } from "vitest";
import { GENRES, STYLE_FAMILIES, UI_KITS, UI_KIT_IDS, UI_KIT_INDEX, UI_THEMES, UI_THEME_DEFAULT_KIT, pickUiKit } from "../src";

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
      for (const genre of kit.genres) expect(GENRES.some((g) => g.id === genre), `${kit.id} → ${genre}`).toBe(true);
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
    ];
    // "stylized" is the most neutral theme: the keyword must win on its own
    for (const [prompt, expected] of cases) expect(pickUiKit(prompt, "stylized"), prompt).toBe(expected);
  });

  it("falls back to the theme default when the prompt says nothing about the UI", () => {
    expect(pickUiKit("a big island with a village", "cartoon")).toBe(UI_THEME_DEFAULT_KIT.cartoon);
    expect(pickUiKit("a big island with a village", "military")).toBe(UI_THEME_DEFAULT_KIT.military);
  });
});
