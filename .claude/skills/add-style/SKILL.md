---
name: add-style
description: "Add or tune a visual style family in WorldForge (packages/core/src/taxonomy/styles-fantasy.ts / styles-modern.ts / styles-nature.ts): palette, materials, tree, architecture kit, vegetation / prop / road kits, biomes, landmarks, settlement type, lighting, fog, UI theme, audio mood, environment (weather, clouds, snow line, walls, terrain tint), keywords for prompt matching. Use when asked for a new style / theme / look (e.g. 'add a steampunk-victorian style', 'make the winter style snowier') or when a style renders wrong."
---

# Add / tune a style family

A style is **data**: one `StyleFamilyDef` in the file matching its `group` —
`styles-fantasy.ts` (`fantasy`, `historical`), `styles-modern.ts` (`modern`, `future`, `apocalyptic`) or
`styles-nature.ts` (`nature`, `themed`), all under `packages/core/src/taxonomy/`. `styleFamilyToBible` (taxonomy/index.ts) turns it into
a StyleBible; every prefab, the generator, the interpreter and the agent prompts read it.

## Steps

1. **Define** the family (copy the closest existing one). Required fields: `id`, `name`, `description`,
   `group` (fantasy | historical | modern | future | apocalyptic | themed | nature), `keywords` (FR + EN, lowercase,
   accent-free, ≥ 4; short words must be unambiguous — `"spa"` matched "spatiale" once), `geometry`,
   `palette` (primary, secondary, accent, ground, stone, wood, foliage, foliageAlt, water, roof, wall, glow, sky),
   `tree`, `architecture { kit, roofPitch?, weathering?, interiors?, floors? }`, `vegetationKit`,
   `vegetationDensity`, `propKits[]`, `roadKit`, `biomes[]`, `landmarks[]`, `settlementType?`, `lighting`,
   `fog`, `ui`, `uiAccent`, `audio`, and the environment line:
   `weather, weatherIntensity, clouds, snowLine?, walls, terrainTint` (see `WEATHER_KINDS`, `WALL_KITS` in taxonomy/types.ts).
2. **Register the id** in `STYLE_PRESET_IDS` (`packages/core/src/schemas/world-spec.ts`) — presets and the
   Workshop chips are derived from the taxonomy automatically (`style-presets.ts`, group = `fam.group`).
3. **Kits**: if the style needs a building kit that does not exist, add it to `ARCHITECTURE_KITS` and a
   `case` in `buildingParams` (`packages/prefabs/src/kits/buildings.ts`, plus furniture set if new);
   a new prop kit → `PROP_KITS` + `PROP_KIT_PREFABS` (kits/index.ts) + `PROP_SETS` (world-spec.ts) + `KIT_BIOMES`
   (world-gen/pipeline/kit-props.ts); a new vegetation kit → `VEGETATION_KITS` + `VEGETATION_KIT_SPECIES`;
   a new road kit → `ROAD_KITS`, road type enum in world-spec.ts, `roadMaterial` (pipeline/roads.ts);
   a new wall kit → `WALL_KITS` + cases in `townWall` / `gateTower` (`packages/prefabs/src/kits/dressing.ts`).
4. **Interpreter**: keywords drive `matchStyleFamily`; add prompt-specific landmarks / biomes to
   `LANDMARK_KEYWORDS` / biome hints in `packages/agents/src/local/interpreter.ts` only when the style
   introduces new ones.
5. **Tests**: `npx vitest run packages/core/test/taxonomy.test.ts packages/prefabs/test/connectivity.test.ts`
   (the connectivity guard now builds every prefab with the new style — fix any loose part it reports),
   then the whole suite.
6. **Look**: `npx tsx scripts/demo-prompt.ts "<a prompt using the keywords>" --out demo-output/<id>` and
   check the viewer / Studio (`studio-verify` skill). Check terrain tint, weather, walls and the settlement kit.
7. **Docs**: add the row to `docs/TAXONOMY.md` (styles table) and the README style list.

## Tuning guidance

- Palette contrast: `foliage` vs `ground` vs `wall` must read at distance; keep `glow` saturated.
- `terrainTint` 0.3 for realistic, 0.6 stylized, 0.9 for candy / alien / voxel.
- `weather` should be rare and cheap: petals / leaves / fireflies at ≤ 0.4 intensity; rain / snow only when
  the identity needs it (cyberpunk, winter); `stormy` mood adds rain / snow automatically.
- `walls` only for styles where a ring wall is plausible (historical, military, post-apo, candy picket).
- Night styles: `lighting.timeOfDay` 21–3 with `mood` moonlit / eerie; the lighting stage keeps night readable.
