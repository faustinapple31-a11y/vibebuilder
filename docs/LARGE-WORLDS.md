# Large worlds: no budget, chunks, levels of detail

## What limited a map before
| Limit | Where | Now |
|---|---|---|
| 3200 plants, 450 rocks, 110 buildings, 500 props, 48 000 parts per 1024² (x2.5 at most); the rest was dropped | `pipeline/optimize.ts` | removed; `measureStats` only measures |
| 700 verge plants, 650 horizon objects, 86 towers, 380 shore objects | `pipeline/detail.ts` | removed |
| 60 fields, 420 stripes, 420 kerbs | `pipeline/dressing.ts` | removed |
| 70 blocks a town, 12 clearings, 26 groves | `blocks.ts`, `regions.ts` | grow with the map |
| 80 buildings a settlement, 4096 studs, 9 islands, 200 plots | `world-spec.ts` | 4000, 16 384, 60, 2000 (guards, not budgets) |
| 60 buildings and 1536 studs from a prompt | `interpreter.ts` | size read from the request |
| one JSON, one server build, 512-2048 streaming | `export.ts`, `WorldBuilder.ts` | chunks, profiles |

## Pipeline
1. **Size** (`worldWidth`): "3 km", "4000 studs", "immense", or the scale of the setting.
2. **Relief**: hills of constant size, ranges that grow with the map, provinces of climate (`biomes.ts`, four biomes or more from 2000 studs).
3. **Country** (`populate.ts`): towns, villages, hamlets, farms, camps per square of 1024 studs and per environment, joined to the roads with loops.
4. **Towns** (`blocks.ts`): blocks in a grid, curved, radial or linear shape; places with a function (`facilities.ts`).
5. **Places** (`places.ts`): the emptiest point of the land gets a mine, a jetty, a relay, a ruined keep... until nothing is further than about 270 studs from something.
6. **Discoveries**: number grows with the area.
7. **Nature** (`sampling.ts`): hashed scatter, identical drawn whole or by window.

## Chunks (256 studs)
`chunkWorld(bake)` gives id, rectangle, region, district, kind, seams (where roads and rivers cross into the neighbour), dependencies and hash. `serializeChunks` / `deserializeChunks` save and load them; heights are 16-bit and neighbours share their edge. `regenerateWindow(spec, style, bake, rect, { salt })` draws the nature and the props of a window again: ground, streets and everything outside stay. Trees come back exactly without salt; about four fifths of the small props do (their draws depend on one another).

## Capacity and profiles
`measureCapacity(bake)`: models, parts (total, server, around a player), meshes, triangles, colliders, lights, chunks, export size, memory, render cost per profile, and advice. Advice never removes anything: it names a real limit (server memory, 100 MB place file, precision far from the origin) and a way round.

`spec.detail` = `performance`, `balanced`, `high`, `maximum`: detail, shape and silhouette radii, streaming radii, shadows. Tested: the same placements are exported for all four.

## In Roblox
- `WorldAssets.WorldBake` is the index, `WorldAssets.prefabs` the models, `ServerStorage.WorldChunks` the chunks (never replicated).
- `ChunkBuilder` writes the terrain, then the models from the spawn outward: `Workspace.World / region / chunk / model`. The server holds colliding, named and gameplay parts. Buildings and landmarks use `ModelLevelOfDetail.StreamingMesh`.
- `WorldView` (client) asks for the chunks it needs and builds what is only seen in cells of 64 studs: every detail, main shapes, two-part silhouettes, nothing. Levels are different instances, so a far one costs no memory and no draw call. Things destroyed on the server disappear on the clients.
- `buildWorld(bake, { static: true })` builds everything in the place (Studio bake).

## Measured in Studio (desktop)
| World | Parts in full | On the server | Built by the client | Build | Frames/s |
|---|---|---|---|---|---|
| RPG 1536 | 149 413 | 17 716 | 34 400 | 3.6 s | 123 |
| Open world 4096 | 717 137 | 77 232 | 25 000-38 000 | 13.5 s | 60 (capped), worst frame 21 ms |
| City 2560 | about 266 000 | 72 419 | 25 000 | - | 116 |

Not measured: a phone, a published server, a world above 4096 studs in Studio (7168 was generated, not opened).

## Before and after
| Request | Studs | Models | Buildings | Places to live | Dropped |
|---|---|---|---|---|---|
| petit village médiéval | 768 → 768 | 2241 → 2368 | 12 → 14 | 1 → 1 | 70 → 0 |
| grande ville moderne | 1280 → 2560 | 6526 → 22 762 | 54 → 492 | 1 → 8 | 0 → 0 |
| immense forêt | 2048 → 3072 | 8453 → 97 030 | 23 → 187 | 1 → 12 | 27 263 → 0 |
| carte milsim | 1024 → 2560 | 3692 → 33 695 | 13 → 124 | 1 → 10 | 0 → 0 |
| île tropicale | 1024 → 2048 | 3263 → 19 643 | 14 → 40 | 1 → 1 | 0 → 0 |
| complexe industriel | 1024 → 1536 | 2276 → 6043 | 46 → 54 | 1 → 1 | 8 → 0 |
| open world, plusieurs biomes | 1024 → 4096 | 3620 → 90 017 | 15 → 245 | 1 → 12 | 4206 → 0 |

Old numbers: generator of 70a1e53. Commands: `npx tsx scripts/export-place.ts "<prompt>" --size 4096 --detail high`, `npx tsx scripts/world-bench.ts --improve`.

## Known limits
Generation runs on one thread (24 s for 4096 studs, about 8 min for 7168 before the last optimisations). Meshes are not merged without uploading the kit. The grid of a town is still regular inside a block town; a chunk cannot redraw its streets alone.
