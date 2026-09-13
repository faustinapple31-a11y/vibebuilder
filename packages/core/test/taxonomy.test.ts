import { describe, expect, it } from "vitest";
import { ARCHITECTURE_KITS, BIOME_IDS, GENRES, GENRE_INDEX, GAMEPLAY_SYSTEMS, LANDMARK_TYPES, LAYOUT_ARCHETYPES, PROP_KITS, PROP_SETS, STYLE_FAMILIES, STYLE_PRESET_IDS, VEGETATION_KIT_SPECIES, VEGETATION_SPECIES, getStylePreset, matchGenre, matchStyleFamily } from "../src";

describe("universal taxonomy", () => {
  it("every style family is a schema-valid preset with consistent kit references", () => {
    for (const fam of STYLE_FAMILIES) {
      expect(STYLE_PRESET_IDS, fam.id).toContain(fam.id);
      const bible = getStylePreset(fam.id as never);
      expect(bible.id).toBe(fam.id);
      expect(ARCHITECTURE_KITS).toContain(fam.architecture.kit);
      for (const kit of fam.propKits) expect(PROP_KITS, `${fam.id} prop kit ${kit}`).toContain(kit);
      for (const kit of fam.propKits) expect(PROP_SETS as readonly string[], `${fam.id} prop set ${kit}`).toContain(kit);
      for (const b of fam.biomes) expect(BIOME_IDS as readonly string[], `${fam.id} biome ${b}`).toContain(b);
      for (const l of fam.landmarks) expect(LANDMARK_TYPES as readonly string[], `${fam.id} landmark ${l}`).toContain(l);
      for (const [sp] of VEGETATION_KIT_SPECIES[fam.vegetationKit]) expect(VEGETATION_SPECIES as readonly string[], `${fam.id} species ${sp}`).toContain(sp);
      expect(fam.keywords.length).toBeGreaterThan(3);
    }
    expect(STYLE_FAMILIES.length).toBe(STYLE_PRESET_IDS.length);
  });

  it("every genre references implemented systems, a layout archetype and existing styles", () => {
    for (const g of GENRES) {
      for (const s of g.systems) expect(GAMEPLAY_SYSTEMS as readonly string[], `${g.id} system ${s}`).toContain(s);
      expect(LAYOUT_ARCHETYPES as readonly string[]).toContain(g.layout);
      for (const st of g.defaultStyles) expect(STYLE_PRESET_IDS as readonly string[], `${g.id} style ${st}`).toContain(st);
      expect(g.keywords.length).toBeGreaterThan(3);
    }
    expect(GENRES.length).toBeGreaterThanOrEqual(28);
  });

  it("matches French and English prompts to the right style and genre", () => {
    const cases: [string, string, string][] = [
      ["jeu de survie zombie apocalypse avec un avion crashé", "post_apocalyptic", "survival"],
      ["un obby cartoon avec 20 stages", "cartoon", "obby"],
      ["tycoon dans une ville moderne", "modern_suburban", "tycoon"],
      ["course futuriste cyberpunk la nuit", "cyberpunk", "racing"],
      ["battle royale sur une base militaire", "military", "battle_royale"],
      ["tower defense médiéval avec un château", "medieval", "tower_defense"],
      ["horror game in a haunted gothic mansion", "horror_gothic", "horror"],
      ["colonie spatiale sur mars avec une fusée", "sci_fi", "adventure"],
      ["mine de minerai style voxel", "voxel", "mining"],
      ["football match in a stadium", "modern_city", "sports"],
      ["pirate treasure hunt on a tropical cove", "pirate", "adventure"],
      ["candy land pet collecting game", "candy", "pet_collecting"],
    ];
    for (const [prompt, style, genre] of cases) {
      const g = matchGenre(prompt, GENRES);
      const genreId = g?.id ?? "adventure";
      // same fallback as the interpreter: an unnamed style comes from the genre's default styles
      const fam = matchStyleFamily(prompt) ?? { id: GENRE_INDEX[genreId]!.defaultStyles[0] };
      expect(fam.id, prompt).toBe(style);
      expect(genreId, prompt).toBe(genre);
    }
  });
});
