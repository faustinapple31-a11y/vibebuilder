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
| 1 | `terrain.ts` | base fbm → features in order (mountains, hills, valley, plateau, cliffs, crater) → border rise (not over the ocean) → **island / coast** (`computeOceanMask` → `applyOcean`, sea level = `seaLevelOf(spec)`) → detail → strata → thermal erosion → **hydraulic erosion** (`hydraulicErosion`: droplets, per-cell budget, smoothed delta) (sea floor clamped) |
| 2 | `water.ts` | rivers (A* downhill, carved bed + banks), lakes, **ocean fill** under sea level, `waterDistance` (polylines + chamfer distance from water cells) |
| 3 | `biomes.ts` | biome per cell (weight × elevation × moisture × noise) → material (slope rock, shore sand/mud, **beach ring**, **style snow line**) |
| 4 | `sites.ts` | flat site per settlement (harbor = on the shore), flattened, plaza kept clear |
| 5 | `landmarks.ts` | position search per `preferredZone`, view corridors from spawn |
| 6 | `spawn.ts` | clearing facing the focal landmark |
| 7 | `roads.ts` | A* roads (water expensive → bridges, landmarks avoided), carved materials + shoulders, `roadDistance` |
| 8 | `buildings.ts` | organic ring or street grid per settlement type; `prefabMix`; footprints flattened; plaza paved |
| 9 | `dressing.ts` | `dress_*` placements: ring walls + gates (style `environment.walls`), crop fields, pier + boats, graveyard, landmark grounds (paved disc + lights + seats), stripes / crossings / kerbs on asphalt & concrete |
| 10 | `layout.ts` | gameplay archetype structures + zones (`layout_*`, tag `layout`) |
| 10b | `relief.ts` | `ctx.terrainOps` voxel ops (carve / fill balls, blocks, cylinders): cave tunnel + chamber behind `cave` landmarks (+ `fixed` interior placements, `cave_chamber` zone), overhang ledges, natural arches, lava lakes |
| 11 | `vegetation.ts` | poisson scatter by biome density, kit species blend, clearings around sites / roads / water / occupants |
| 12 | `props.ts`, `kit-props.ts` | rocks, kit props by tag (roadside lights, walls tangent to houses, shore, plaza…), waterside, ambience |
| 12b | `detail.ts` | `detail_*`: road verges (tufts, pebbles, fence runs), the spawn apron (+ two trees framing the view corridor), the waterline (bank pebbles, reeds, driftwood, rocks breaking the surface), horizon silhouettes in the border band and sea stacks off an island's coast |
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

## Measure, then look

Two tools, and a generator change is not finished until both have been run before and after it.

- `npx tsx scripts/audit-maps.ts` — a 12-prompt panel: critic score per world, the composition split
  (foreground / midground / background), height σ, vegetation cover, parts, then every complaint grouped
  by frequency **and** the two geometry defects the critic cannot see (a footprint hanging over an edge,
  a base under the ground). Numbers, so a change can be judged instead of argued.
- `npx tsx scripts/preview-map.ts "<prompt>"` (or `--panel`) — renders the bake to PNGs from four cameras
  (the player's first frame at the spawn, the focal landmark, the village, a wide sweep) with a software
  rasterizer: real prefab geometry, the bake's own terrain colours, lighting and fog. Half the defects
  that matter — a green desert, a black lantern, a row of identical props, a bare verge — are invisible in
  the score and obvious in the image.

## Invariants with a test behind them

- **nothing hangs over an edge**: every scattered placement goes through `settleOnGround` (`context.ts`),
  which measures every heightmap cell its base disc touches (a ring of samples aliases past the one cell a
  terrace lower), steps away from the drop and gives up rather than leaving an object in the air. A settled
  point must be **re-gated** — stepping off a lip can walk a tree into a road, the water or a village.
- **parts mode has no slope**: the ground is flat terraces, so `conformFactor` is forced to 0 and
  `snapHeightsToLevels` re-rounds the heightmap onto the levels the slabs are built from, right before the
  snap. Any stage that edits heights after `quantizeHeights` (a flattened pad, a carved road, a levelled
  disc) otherwise leaves objects up to half a step out.
- **a pad targets a level**: `padHeight` in `dressing.ts` — a wall, a gate tower or a field levelled to an
  in-between height ends up hanging over the neighbouring slab.
- **biome shares match the spec**: `generateBiomes` calibrates a per-biome bias over a few passes until the
  shares approach the requested weights, and `climateMoisture` centres the moisture field on the world's
  own climate. Winner-takes-all scoring has no sense of proportion: a 55/30/15 desert spec used to come out
  96/3/1 and rendered green.
- **no duplicated placement**: anything a stage rebuilds every run (bridges, stairs, talus, the parts
  ground, the detail pass) must be in `isGroundwork` or excluded from the inherited layers, or a partial
  regeneration leaves two copies.

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

## Ground (parts, not voxels)

- `pipeline/ground.ts`: heights are quantized to `GROUND_STEP` terraces (`quantizeHeights` after terrain
  and after water), every plateau region becomes a `ground_block` prefab (slab + walls), roads become
  `road_strip`, water becomes fill ops; `terrain.mode = "parts"`. Objects sit exactly on the slab tops
  (heights = slabs). Roads may only change one level per step (stairs are placed by `placeStairs`);
  `flattenArea` snaps pads to a level. Budget: keep ground parts ≈ 20–30k (region count × contour
  length) — raise `MIN_REGION_CELLS` / simplification eps before anything else.

## Meshes & textures

- Rock prefabs use the 6-mesh library (`packages/prefabs/src/meshes/library.ts`); `PrefabContext.meshes`
  carries it. Runtime + viewer + `.obj` export read `PrefabVariant.meshes`. Server EditableMeshes do not
  render on clients: `client/MeshRender.ts` rebuilds them from `ReplicatedStorage.WorldAssets.Meshes`.
  Roblox client budget ≈ 6–8 EditableMeshes → never add per-variant geometry (unless the meshes are
  published: `mesh-assets.ts` FBX → Open Cloud Model → MeshId via Studio → `MeshData.assetId`, then the
  runtime uses real mesh assets and the budget no longer applies).
- Textures: `packages/textures` (tileable noise, 14 programs, PNG encoder); the app generates / uploads
  sets, the template's `Materials.ts` applies MaterialVariants, the viewer's `terrainMaterial.ts` splats
  grass / ground / rock / sand-or-snow by the `weights` attribute of `terrainGeometry`.

## Adding a dressing element

Add a builder in `packages/prefabs/src/kits/dressing.ts` + registry def, list the id in `requiredPrefabs`,
write a `placeX(ctx, rng, add)` in `pipeline/dressing.ts` (check `inBounds`, `isWaterAt`, `waterDistance`,
`roadDistance`, slope, `SpatialHash` of `ctx.occupants`; level the ground with `levelDisc`; push an occupant
so vegetation / props keep clear; push a `gameplay` zone with `meta.kind` when the runtime may use it), make
`conformFactor` return 0 for rigid structures (tag), and extend the critic (`packages/quality/src/critic.ts`)
if the element should count toward a score.
