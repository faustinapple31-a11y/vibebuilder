import { describe, expect, it } from "vitest";
import { GameSpecSchema } from "@worldforge/core";
import { buildGameFiles, defaultGameContent } from "../src";

describe("GameSpec → generated game data modules", () => {
  const base = defaultGameContent();
  const game = GameSpecSchema.parse({ title: "Test", ...base, monetization: { ...base.monetization, gamepasses: [{ ...base.monetization.gamepasses[0]!, robloxId: 123456 }] } });
  const files = buildGameFiles(game);

  it("writes the six data modules", () => {
    expect(files.map((f) => f.path)).toEqual(["src/shared/catalog.ts", "src/shared/animations.ts", "src/shared/audio.ts", "src/shared/npcs.ts", "src/shared/quests.ts", "src/shared/recipes.ts"]);
  });

  it("carries shop items, Robux items with their Roblox ids, NPCs and animations", () => {
    const catalog = files[0]!.content;
    expect(catalog).toContain('id: "luck_boost"');
    expect(catalog).toContain("consumable: true");
    expect(catalog).toContain('kind: "gamepass"');
    expect(catalog).toContain("robloxId: 123456");
    expect(catalog).toContain('kind: "product"');
    expect(files[1]!.content).toContain("rbxassetid://507766666");
    expect(files[1]!.content).toContain('"lantern_raise"');
    expect(files[2]!.content).toContain("rbxasset://sounds/electronicpingshort.wav");
    expect(files[3]!.content).toContain("Elder Maren");
  });

  it("produces balanced module bodies without stray undefined literals", () => {
    for (const f of files) {
      const opens = (f.content.match(/\{/g) ?? []).length;
      const closes = (f.content.match(/\}/g) ?? []).length;
      expect(opens).toBe(closes);
      expect(f.content).not.toContain(": undefined,");
    }
  });
});
