# World composition, level design and the Blender kit

How a prompt becomes a composed map, how its models are built, what Roblox really shows of them, and how all of it is
measured. Numbers are from 2026-11-23, on the benchmarks named next to them.

## 1. Audit: why maps and models looked generated

| Where | Cause | Measured |
|---|---|---|
| `terrain.ts` | five octaves of noise and 46-stud detail on every slope | 1.7 studs of bumps every 12 studs of gentle ground |
| `terrain.ts` | same rocky ring on all four sides, ranges always north-west | - |
| `vegetation.ts` | noise x Worley acceptance: an even scatter | 10 % of the wooded ground in a real forest |
| `sites.ts` | radius = 34 + 7.5 x houses | settlements cover 4.1 % of the map, plazas grow with them |
| `buildings.ts` | random angle and radius round a centre | no plot, no street, 0 district, urban criterion 56/100 |
| `roads.ts` | only the roads of the spec | one way in, landmarks unconnected |
| Blender kit | vertex colours only, one house, one castle, one adobe cube, one tower facade | silhouettes 1 to 16 % apart |
| Roblox | occlusion never baked, plastic materials, sun behind the first view | - |

## 2. Order of generation

terrain (broad forms, ranges with ragged feet, calm gentle ground) → water → biomes (no speckle) → **terrain analysis**
(`terrain-analysis.ts`: 12 classes, buildability, relative height) → settlement sites → landmarks → spawn → roads
(spec + **landmark paths** + **roads to the world**) → **urban plan** (`urban-plan.ts`: districts → streets → plots → the
building a plot deserves) → fields, walls, dressing → layout → **discoveries** (`discovery.ts`: viewpoint with a trail,
hidden spot) → relief → **regions** (`regions.ts`: forest masses, edges, clearings, groves, meadows, avenues, wooded
passages of the roads) → vegetation → props → lighting (sun behind the player).

- Everything is drawn from the seed; the same spec gives the same `bake.plan` (test).
- `bake.plan` carries terrain shares, region shares, districts, plots, refused sites and why.
- Site choice is a score per function (`SITE_RULES`): ring, main street, water, height, neighbours, quarter; a free site
  may be refused (plaza, first view, slope, street level, border, water).
- Pads are levelled as rectangles and masked: nothing that comes later cuts the ground of a house.
- Cities keep `layoutGrid`, turned to the road that reaches them; roads stop on the ring street.

## 3. Evaluators

| File | Judges | Run |
|---|---|---|
| `quality/level-design.ts` | 8 criteria, weights 15/15/15/15/10/15/10/5, problems with position and fix | `npx tsx scripts/level-design.ts` |
| `quality/world-review.ts` | aerial 40, mid 30, ground 30 | `npx tsx scripts/world-atlas.ts --compare old.json` |
| `quality/visual.ts` | 8 criteria of a kit at 3 distances, from measurements | `npx tsx scripts/blender-map.ts ... --quality` |
| `blender-map/python/bench_arch.py` | 44 buildings before and after, 4 views, silhouette diversity | `blender -b --python bench_arch.py -- out` |

Level design, 8 scenarios x 3 seeds: **82.6 → 95**. World, 8 maps x 2 seeds: **78.6 → 92.6** (wooded mass 10 → 70 %,
bumps 1.7 → 0.3 studs, settlement share 4.1 → 9.6 %). Silhouette diversity: medieval 0.16 → 0.34, desert 0.12 → 0.35,
homes 0.04 → 0.40, commerce 0.28 → 0.33, towers 0.05 → 0.21, castles 0.01 → 0.30.

## 4. The Blender kit (`packages/blender-map/python`)

| File | Content |
|---|---|
| `wf_textures.py` | 24 procedural tileable sets + a 16-cell leaf atlas, neutral detail maps, relief painted in the colour |
| `wf_mesh.py` | mesh builder: material, vertex colour, UV per face; `DETAIL` levels |
| `wf_trees.py` | branching skeleton per family (oak, beech, birch, spruce, pine, willow, dead, blossom, palm, acacia...) |
| `wf_flora.py` | rocks by geology (boulder, angular, slab, cracked, spire), clusters, outcrops |
| `wf_roof.py` | gable, hip, mansard, catslide, dome; thickness, eaves, gutters, ridge |
| `wf_medieval.py` | 12 house families from a configuration, six functions |
| `wf_desert.py` | 8 families (cube, court, terrace, domed, wind tower, arcade, kasbah, vaults) |
| `wf_home.py`, `wf_city.py` | 8 home massings; facade grammar, 8 tower and 6 mid-rise families, 6 crowns |
| `wf_build.py` | towers, curtain walls, four castle plans, ramparts |
| `wf_families.py` | architecture style → builders; a style that is absent keeps its own PartList, textured |
| `wf_export.py` | checks, occlusion, one mesh per material under 20 000 triangles, GLB, manifest, budget per 128-stud zone |
| `wf_quality.py` | measurements for the visual evaluator |
| `studio_pack.py`, `studio/AssembleMap.luau` | local Studio test without upload; assembly of an imported kit |

## 5. What Roblox shows (verified in Studio)

- A **SurfaceAppearance ignores vertex colours**. A **TextureID is multiplied by them** (in sRGB). So: TextureID, white
  Color, vertex colours; relief painted into the colour map.
- Alpha of a TextureID only cuts when `Transparency` is slightly above 0: **0.02** on foliage.
- There is no ambient occlusion: it must be **baked in the vertex colours**, ground included.
- Under a TextureID the Material still sets the gloss: SmoothPlastic makes beams shine, **Slate / Wood / Concrete** do not.
- A MaterialVariant does not accept an EditableImage: its maps can only be tested after an upload.
- `EnvironmentSpecularScale` 0.2, ambient lifted by day, contrast at most 0.1, `GrassLength` 0.25.
- Sun: latitude -20 lights the -Z faces, 60 the +Z; the hour mirrored about noon picks east or west.
- Neon multiplies vertex colours too: white neon burns warm panes to yellow, grey 150 keeps them amber.

## 6. Not done

- Uploading a kit to an account (needs the owner's go-ahead; moderation is per account).
- Phone frame rate; FBX export (GLB only); the styles without a family (Japanese, Greek, sci-fi, cyberpunk, candy, voxel,
  tropical hut, bunker, elven) keep their PartList buildings, chamfered and textured.
- The correction loop is the scored choice of sites plus local rules; the evaluators do not yet rewrite a bake.
