---
name: add-genre
description: "Add or extend a game genre in WorldForge: GenreDef in packages/core/src/taxonomy/genres.ts (keywords, systems, layout archetype, screens, currency, monetization, camera, default styles, enemies, multiplayer, progression), gameplay system ids (GAMEPLAY_SYSTEMS), layout archetypes (packages/world-gen/src/pipeline/layout.ts), runtime systems in the roblox-ts template (templates/roblox-ts-project/src/systems), GameConfig generation (buildConfigTs), interpreter hints. Use when asked to support a new kind of game (e.g. 'add a fishing genre', 'support a hide-and-seek mode') or when a genre's gameplay is incomplete."
---

# Add / extend a genre

A genre = a `GenreDef` (data) + the runtime systems it lists + a layout archetype that lays its structures
on the terrain. Reuse existing systems and archetypes whenever they fit; add new ones only for real gaps.

## Steps

1. **GenreDef** in `packages/core/src/taxonomy/genres.ts`: `id`, `name`, `description`, `keywords`
   (FR + EN, ≥ 4, unambiguous), `systems[]` (ids from `GAMEPLAY_SYSTEMS` in `packages/core/src/schemas/game-spec.ts`),
   `layout` (from `LAYOUT_ARCHETYPES`), `screens[]` (GameSpec `ui.screens` enum), `currency`, `monetization
   { passes[], products[] }`, `camera`, `defaultStyles[]` (existing style ids), `enemies`, `multiplayer`
   (open | rounds | teams | solo_instances), `progression`. Add the id to `GAME_GENRES` (game-spec.ts).
2. **Systems**: a new system id goes to `GAMEPLAY_SYSTEMS`, gets a description in `SYSTEM_DESCRIPTIONS`
   (`packages/agents/src/local/interpreter.ts`), a tunables block in `buildConfigTs`
   (`packages/agents/src/providers/local-rules.ts`) **and** in the template default
   (`templates/roblox-ts-project/src/shared/config.ts`), and a runtime module
   `templates/roblox-ts-project/src/systems/<Name>.ts` started from `main.server.ts` (gate on
   `GameConfig.systems.includes(id)`, wait for `WorldReady`, handle already-present players, anchor on zones).
   Add the file to `FRAMEWORK_TEMPLATE_FILES` (`packages/roblox-export/src/export.ts`) and bump
   `TEMPLATE_VERSION` when the framework shape changes (projects upgrade at open).
3. **Layout**: reuse an archetype (`obby_course`, `arena`, `race_track`, `tycoon_plots`, `lobby_portals`,
   `base_defense`, `sports_field`, `hangout_plaza`, `dungeon`, `linear_story`, `city_grid`, `settlement`,
   `island`, `open_world`, `campus`). A new one → `LAYOUT_ARCHETYPES` (world-spec.ts + taxonomy/types.ts),
   a `case` in `placeLayout` (`packages/world-gen/src/pipeline/layout.ts`): build on-the-fly prefab variants
   tagged `layout` (never trimmed / snapped), push gameplay zones with `meta` the runtime reads, set
   `ctx.spawn` when the archetype owns the spawn. Describe it in `LAYOUT_NOTES` (`packages/agents/src/roles.ts`).
4. **Interpreter**: `interpretGame` (`interpreter.ts`) derives items / quests / core loop per genre —
   add `itemsFor` / `questsFor` / `coreLoopFor` entries so the local provider produces a complete GameSpec.
   Add prompt hints (`hasWord`) only for genre-specific structures (e.g. "grille"/"grid").
5. **Client**: hotkeys / HUD values in `templates/roblox-ts-project/src/client/main.client.ts` and
   `src/ui/Hud.ts` if the genre needs new input or display.
6. **Sync + tests**: `npx tsx scripts/sync-template.ts`, `npx tsc -b tsconfig.json`, `npx vitest run`
   (add a case in `packages/world-gen/test/layouts.test.ts` for a new archetype; `taxonomy.test.ts`
   validates every genre's ids). Generate a demo: `npx tsx scripts/demo-prompt.ts "<genre prompt>" --build`
   and `npx rbxtsc` must be clean in the generated project.
7. **Play-test** in Studio (`studio-verify` skill) at least the core loop; note the zone ids the runtime uses.
8. **Docs**: `docs/TAXONOMY.md` genre table, README genre list, `docs/ROBLOX_PIPELINE.md` systems paragraph.
