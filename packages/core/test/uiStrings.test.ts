import { describe, expect, it } from "vitest";
import { UI_LOCALES, UI_STRINGS, UI_STRINGS_EN, detectLocale, formatString } from "../src";

/**
 * The libraries decide how a screen looks, this table decides what it says — a generated game speaks
 * the language of the prompt, so every locale must cover every key with its placeholders intact.
 */
describe("UI strings", () => {
  const keys = Object.keys(UI_STRINGS_EN) as (keyof typeof UI_STRINGS_EN)[];

  it("covers every key in every language, with nothing empty", () => {
    for (const locale of UI_LOCALES) {
      const table = UI_STRINGS[locale];
      expect(Object.keys(table).sort(), `${locale} key set`).toEqual([...keys].sort());
      for (const key of keys) {
        expect(table[key].length, `${locale}.${key} is empty`).toBeGreaterThan(0);
        expect(table[key].length, `${locale}.${key} is suspiciously long for a label`).toBeLessThan(120);
      }
    }
  });

  it("keeps every placeholder of the English string", () => {
    for (const locale of UI_LOCALES) {
      for (const key of keys) {
        const holders = [...UI_STRINGS_EN[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        for (const holder of holders) {
          expect(UI_STRINGS[locale][key].includes(`{${holder}}`), `${locale}.${key} lost {${holder}}`).toBe(true);
        }
      }
    }
  });

  it("does not leave a locale identical to English (a copy means an untranslated table)", () => {
    for (const locale of UI_LOCALES) {
      if (locale === "en") continue;
      const same = keys.filter((k) => UI_STRINGS[locale][k] === UI_STRINGS_EN[k]).length;
      // proper nouns and a few loanwords legitimately match ("Menu", "Robux", "Audio", "Score"…)
      expect(same, `${locale} repeats ${same}/${keys.length} English strings`).toBeLessThan(keys.length / 3);
    }
  });

  it("detects the language of a prompt, defaulting to English", () => {
    expect(detectLocale("je veux un jeu de survie sur une île avec une boutique")).toBe("fr");
    expect(detectLocale("un château dans la forêt avec des joueurs qui explorent")).toBe("fr");
    expect(detectLocale("quiero un juego de supervivencia con una tienda para jugador")).toBe("es");
    expect(detectLocale("quero um jogo de sobrevivência com uma loja para jogador")).toBe("pt");
    expect(detectLocale("ich will ein spiel mit einer welt und einem laden")).toBe("de");
    expect(detectLocale("a survival island game with a shop and a village")).toBe("en");
    expect(detectLocale("obby course with neon lights")).toBe("en");
  });

  it("fills placeholders", () => {
    expect(formatString(UI_STRINGS_EN.confirmBuy, { item: "Luck Boost", price: 60, currency: "Coins" })).toBe("Buy Luck Boost for 60 Coins?");
    expect(formatString(UI_STRINGS.fr.youHave, { count: 3 })).toBe("Vous en avez : 3");
  });
});
