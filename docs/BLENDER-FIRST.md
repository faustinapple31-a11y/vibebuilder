# Blender first: audit and migration plan

Blender makes the world, Roblox runs the game.

## Audit (what is there on the day of the plan)

| Part | Today | Verdict |
|---|---|---|
| `world-gen` (plan of the world: relief, roads, towns, places) | TypeScript, deterministic, 229 tests, critic | kept as the **planner**: it decides, it no longer draws |
| Visible geometry in a game | PartLists built by Roblox, voxel terrain | replaced by Blender meshes |
| `packages/blender-map/python` | 7 900 lines: PBR texture sets, grown trees, house grammar, city grammar, castles, three levels of detail, occlusion bake, GLB export, checks | kept, extended |
| `build_map.py` | one process, whole map in memory, 1024 studs | split by regions |
| Models | 49 of about 230 prefabs are modelled; the others are chamfered copies of their PartLists | the gap to close |
| Terrain | a smooth mesh over the 4-stud heightmap, no erosion of its own, shared textures x vertex colours | finer grid, erosion, decimation, locked borders |
| Roads | painted on the terrain | meshes: carriageway, kerbs, pavements, markings |
| Import | `AssembleMap.luau`, never run on a whole map | through the chunk runtime (`ChunkBuilder`, `WorldView`) |
| Interface | nothing: scripts only | Blender panel in the World tab |

## Responsibilities

| Blender | Roblox |
|---|---|
| terrain, water, roads, bridges, buildings, plants, props, materials, levels of detail, collision shapes, checks, `.blend` files | players, gameplay, interface, streaming of the imported pieces, dynamic objects |

## Architecture

```
request -> world-gen (plan) -> plan.json + regions/*.json
                                   |
         build_kit.py  (N processes) -> kit/<piece>_l0..l2.glb, cache shared between worlds
         build_region.py (one per region, independent) -> regions/<id>.blend, terrain, roads, water, layout, QA report
                                   |
         merge -> manifest.json (global coordinates, dependencies, hashes, QA)
                                   |
         Roblox: mesh assets (uploaded, with consent) or local preview (EditableMesh, nothing uploaded)
```

- **Regions** of 512 studs. A region reads its own slice of the plan with a margin, never its neighbours. What it computes on its border depends on global coordinates only, so two regions meet exactly; a check compares the two sides.
- **State** in `state.json`: every step has a status, a duration and an error. A run starts again at the first step that is not done. One region can be built again alone.
- **Memory**: a process holds one region; kit pieces are linked, not copied.
- **Quality gate**: a region with a critical fault is `failed`, the world is never marked as finished with one.

## Steps

1. Plan files, job runner with resume, region builder (terrain, water, roads).
2. Kit builder in parallel processes with a cache; collision boxes from the plan.
3. Models for what is still made of primitives: facilities, places, landmarks, then props.
4. Quality gate per region, seams, reports.
5. Runtime: the chunk runtime places mesh pieces instead of parts.
6. World tab: status, progress, errors, resume, sizes.
7. Eight worlds, compared with the earlier generations.

## Limits stated beforehand

- Importing meshes for good means uploading them to the creator's Roblox account; that step asks first. Without it the local preview shows the same meshes in Studio and nothing leaves the computer.
- A MeshPart holds 20 000 triangles and one texture; a SurfaceAppearance ignores vertex colours. The PBR sets are exported whole; the colour map is what a vertex-coloured MeshPart shows.
- The macro relief is decided by the planner (gameplay depends on it); Blender adds what a walker sees: erosion, cliffs, banks, roadsides.
