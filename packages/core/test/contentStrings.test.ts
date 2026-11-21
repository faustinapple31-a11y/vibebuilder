import { describe, expect, it } from "vitest";
import { localizeGameSpec, localizeText, type GameSpec } from "@worldforge/core";

/** Seen in Studio on 7 Nov 2026: a French interface sold "Luck Boost" and asked for "Veteran". */
describe("the starter content speaks the game's language", () => {
  it("translates exact phrases and the patterns with a number", () => {
    expect(localizeText("Luck Boost", "fr")).toBe("Chance boostée");
    expect(localizeText("Defeat 25 opponents.", "fr")).toBe("Bats 25 adversaires.");
    expect(localizeText("Collect 5 items on your way to the castle.", "fr")).toBe("Ramasse 5 objets sur le chemin du castle.");
    expect(localizeText("Luck Boost", "en")).toBe("Luck Boost");
  });

  it("leaves ids and text an agent wrote alone", () => {
    const game = { ui: { locale: "fr" }, shop: { title: "Shop", items: [{ id: "luck_boost", name: "Luck Boost", description: "Trouve des trésors." }] } } as unknown as GameSpec;
    const out = localizeGameSpec(game) as unknown as { shop: { title: string; items: { id: string; name: string; description: string }[] } };
    expect(out.shop.title).toBe("Boutique");
    expect(out.shop.items[0]).toEqual({ id: "luck_boost", name: "Chance boostée", description: "Trouve des trésors." });
  });
});
