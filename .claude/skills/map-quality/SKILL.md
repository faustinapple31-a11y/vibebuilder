---
name: map-quality
description: "Improve or debug WorldForge map generation (packages/world-gen): pipeline stage order and contracts (terrain features incl. island/coast & sea level, water, biomes & materials, sites, landmarks, spawn, roads, buildings & grids, dressing: walls / fields / piers / graveyard / landmark grounds / road markings, layout archetypes, vegetation, props, lighting: terrain colors / clouds / weather, optimize budgets), the critic (packages/quality), how to inspect a bake with a script, common failure patterns (floating / buried objects, empty maps, water everywhere, trimmed structures). Use when asked to make maps better, fix a generation bug, add a terrain feature or a dressing element."
---

# Map generation — how to improve it

`packages/world-gen/src/generator.ts` runs the stages on a `GenContext` (grids: `heights`, `moisture`,
`water` (NaN = dry), `materials`, `biomes`, `roadDistance`, `waterDistance`, `ocean?`; structures:
`sites`, `landmarks`, `paths`, `zones`, `placements`, `occupants`, `spawn`).

| # | stage (file) | contract |
|---|---|---|
| 1 | `terrain.ts` | base fbm → features in order (mountains, hills, valley, plateau, cliffs, crater) → border rise (not over the ocean) → **island / coast** (`computeOceanMask` → `applyOcean`, sea level = `seaLevelOf(spec)`) → detail → strata → erosion (sea floor clamped) |
| 2 | `water.ts` | rivers (A* downhill, carved bed + banks), lakes, **ocean fill** under sea level, `waterDistance` (polylines + chamfer distance from water cells) |
| 3 | `biomes.ts` | biome per cell (weight × elevation × moisture × noise) → material (slope rock, shore sand/mud, **beach ring**, **style snow line**) |
| 4 | `sites.ts` | flat site per settlement (harbor = on the shore), flattened, plaza kept clear |
| 5 | `landmarks.ts` | position search per `preferredZone`, view corridors from spawn |
| 6 | `spawn.ts` | clearing facing the focal landmark |
| 7 | `roads.ts` | A* roads (water expensive → bridges, landmarks avoided), carved materials + shoulders, `roadDistance` |
| 8 | `buildings.ts` | organic ring or street grid per settlement type; `prefabMix`; footprints flattened; plaza paved |
| 9 | `dressing.ts` | `dress_*` placements: ring walls + gates (style `environment.walls`), crop fields, pier + boats, graveyard, landmark grounds (paved disc + lights + seats), stripes / crossings / kerbs on asphalt & concrete |
| 10 | `layout.ts` | gameplay archetype structures + zones (`layout_*`, tag `layout`) |
| 11 | `vegetation.ts` | poisson scatter by biome density, kit species blend, clearings around sites / roads / water / occupants |
| 12 | `props.ts`, `kitProps.ts` | rocks, kit props by tag (roadside lights, walls tangent to houses, shore, plaza…), waterside, ambience |
| 13 | `lighting.ts` | Roblox Lighting + Atmosphere + effects + **terrain colors** (palette tint) + **clouds** + **weather** |
| 14 | generator | spawn clearing, terrain snap / slope conform (`conformFactor`), `optimize.ts` budgets (`layout_*` and `dress_*` never trimmed) → stats |

## Inspect a bake without the app

```ts
// scripts/_dbg.ts (delete afterwards) — npx tsx scripts/_dbg.ts
import { readFileSync } from "node:fs";
import { generateWorld } from "@worldforge/world-gen";
import { WorldSpecSchema, StyleBibleSchema } from "@worldforge/core";
const spec = WorldSpecSchema.parse(JSON.parse(readFileSync("demo-output/<proj>/worlds/main/world.spec.json", "utf8")));
const style = StyleBibleSchema.parse(JSON.parse(readFileSync("demo-output/<proj>/worlds/main/style.bible.json", "utf8")));
const bake = generateWorld(spec, style, { onProgress: (s) => console.log(s) });
console.log(bake.stats, bake.zones.filter((z) => z.kind === "gameplay"));
console.log(bake.placements.filter((p) => p.id.startsWith("dress_")).map((p) => p.prefab));
```

`npx tsx scripts/demo-prompt.ts "<prompt>" --out demo-output/x` builds a full project from a prompt (prints
detected genre / style / layout and the critic score). Python on `assets/world/WorldBake.json` (`placementMeta`
ids, `zones`, `lighting`, `stats`) is the quickest way to count things.

## Failure patterns

| symptom | usual cause → fix |
|---|---|
| object floats / buried | wrong `sinkDepth` or missing terrain snap (tags `floating` / `layout` skip snapping); big footprints need `flattenArea` / `levelDisc` |
| structure missing | trimmed by the budget → use `layout_` / `dress_` ids or higher `importance`; or `requiredPrefabs` did not include the prefab id |
| walls cut a road | gate detection uses `roadDistance < WALL_SEGMENT*0.55` at the segment centre; roads carved *after* dressing (layout roads) need `refreshRoadDistance` first |
| settlement in water / on a cliff | `findFlatSite` scoring (water / slope penalties), `flattenArea` strength; island: keep `radius ≥ 0.3` so land exists |
| nothing on the beach | shore band = `waterDistance < 16 && h < sea + 5`; species / props with tag `water` / `tropical` |
| night unreadable | `lighting.ts` night clamps (ambient mix, exposure +1.45) |
| Studio hangs | > ~45 k parts or `Future` lighting with hundreds of lights — check `stats.partsEstimate`, `maxLights` |

## Adding a dressing element

Add a builder in `packages/prefabs/src/kits/dressing.ts` + registry def, list the id in `requiredPrefabs`,
write a `placeX(ctx, rng, add)` in `pipeline/dressing.ts` (check `inBounds`, `isWaterAt`, `waterDistance`,
`roadDistance`, slope, `SpatialHash` of `ctx.occupants`; level the ground with `levelDisc`; push an occupant
so vegetation / props keep clear; push a `gameplay` zone with `meta.kind` when the runtime may use it), make
`conformFactor` return 0 for rigid structures (tag), and extend the critic (`packages/quality/src/critic.ts`)
if the element should count toward a score.
