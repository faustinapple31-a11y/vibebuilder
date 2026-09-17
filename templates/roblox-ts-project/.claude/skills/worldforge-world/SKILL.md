---
name: worldforge-world
description: "Edit the generated Roblox map of a WorldForge project through worlds/main/world.spec.json (WorldSpec) and worlds/main/style.bible.json (StyleBible): terrain features (mountains, hills, valley, plateau, cliffs, crater, island, coast, archipelago = part-built mesa islands with bridges), biomes, rivers/lakes, landmarks, settlements (walls, kits, interiors), roads, vegetation, props, lighting/mood, weather, clouds, gameplay layout archetypes. Use when asked to change the world, the map, the terrain, the village/town, the atmosphere, add an island / beach / harbor / walls / fields, or when a QA report proposes a spec_patch. Never edit assets/world/WorldBake.json."
---

# WorldForge — world editing

The map is **generated**: `worlds/main/world.spec.json` (WorldSpec) + `worlds/main/style.bible.json`
(StyleBible) → deterministic generator (seeded) → `assets/world/WorldBake.json` → built at runtime by
`src/world/WorldBuilder.ts`. Edit the spec / bible, then let WorldForge regenerate (Workshop → Generate,
or the app does it when the spec file changes). **Never edit WorldBake.json.**

## Workflow

1. Read the current `worlds/main/world.spec.json`; keep ids stable (roads and `near` refer to them).
2. Change only the fields needed. Validate mentally against the enums below (the schema rejects unknown ids).
3. Keep the `seed` unless a different random arrangement is wanted; use `locks` to freeze layers
   (`terrain`, `water`, `roads`, `landmarks`, `buildings`, `vegetation`, `props`, `lighting`) that must survive a regeneration.
4. Say what was changed and what to look at in the viewer / Studio.

## WorldSpec cheat-sheet

```jsonc
{
  "name": "…", "seed": 1337, "stylePreset": "medieval",          // 34 presets, see below
  "size": { "width": 1024, "depth": 1024 },                       // studs (512…2048)
  "terrain": {
    "baseHeight": 40, "relief": 0.6, "roughness": 0.4, "erosion": 0.5,
    "features": [                                                 // macro composition, applied in order
      { "type": "mountains", "placement": "edge", "edges": ["north","west"], "intensity": 0.85, "reach": 0.25 },
      { "type": "hills", "intensity": 0.55, "scale": 1.1 },
      { "type": "valley", "center": [0.52,0.56], "radius": 0.3, "depth": 0.5 },
      { "type": "plateau", "center": [0.3,0.3], "radius": 0.18, "height": 0.6 },
      { "type": "cliffs", "intensity": 0.7 },
      { "type": "crater", "center": [0.65,0.4], "radius": 0.15 },
      { "type": "island", "center": [0.5,0.5], "radius": 0.36, "ruggedness": 0.55 },   // land inside, ocean + beaches outside
      { "type": "coast", "edges": ["south"], "reach": 0.22, "ruggedness": 0.5 },       // ocean along an edge
      { "type": "archipelago", "islands": 5, "terraces": 3, "cliffHeight": 0.5, "mainRadius": 0.22, "ruggedness": 0.35 }
      // stylized mesa islands built from PARTS (flat lawn slabs, stepped brown cliff walls) instead of voxel
      // terrain: plank bridges join the islands, stairs climb the terraces, a compass plaza marks the spawn.
      // Replaces the other relief features; the runtime pours only the sea (terrain.mode = "parts").
    ],
    "seaLevel": 34,                                                // optional; default baseHeight - 6 (island / coast only)
    "groundMode": "parts"                                          // "parts" (default: terraces of part slabs + cliff walls) | "voxels" (smooth terrain)
  },
  "biomes": [ { "id": "forest", "weight": 0.6, "vegetation": "dense", "elevation": [0.1,0.65], "moisture": [0.35,0.85] } ],
  "rivers": [ { "id": "river_1", "from": "north", "to": "south-east", "width": 16, "depth": 6, "meander": 0.65 } ],
  "lakes":  [ { "id": "lake_1", "center": [0.32,0.36], "radius": 80 } ],
  "landmarks": [ { "id": "church", "type": "church", "role": "focal", "preferredZone": "hill", "scale": 1 } ],
  "settlements": [ { "id": "village", "type": "town", "buildings": 9, "layout": "organic", "near": "river_1", "interiors": true, "weathering": 0.35 } ],
  "roads": [ { "id": "main_path", "type": "cobblestone_road", "connects": ["spawn","village","church"], "width": 8 } ],
  "vegetation": { "density": 0.7, "clustering": 0.6, "species": ["round_tree","pine","bush","grass"] },
  "props": { "density": 0.5, "sets": ["village","forest","farm"] },
  "lighting": { "timeOfDay": 14, "mood": "soft", "brightness": 0.7, "shadows": true },
  "atmosphere": { "fogDensity": 0.3, "fogColor": "#9aa5b8", "haze": 0.4, "skyTint": "#6d7d9a" },
  "layout": { "archetype": "settlement", "count": 12, "extent": 0.45, "intensity": 0.5 },
  "cameraComposition": { "spawnFacing": "church", "spawnZone": "clearing" },
  "locks": { "terrain": false, "water": false, "roads": false, "landmarks": false, "buildings": false, "vegetation": false, "props": false, "lighting": false }
}
```

### Enums

- **stylePreset**: stylized_mystical, fantasy, dark_fantasy, elven, cartoon, medieval, viking, ancient_egypt,
  ancient_greece, feudal_japan, wild_west, pirate, steampunk, realistic, modern_suburban, modern_city,
  industrial, post_apocalyptic, wasteland, sci_fi, cyberpunk, space_station, alien_planet, horror_gothic,
  tropical, jungle, desert, winter, swamp, underwater, candy, low_poly_minimal, voxel, military.
- **biomes**: dark_forest, forest, pine_forest, mushroom_grove, meadow, swamp, rocky, highlands, desert, snow,
  beach, ruins_field, urban, wasteland, alien, moon, tundra, jungle, ocean_floor, volcanic, savanna, farmland.
- **landmark types**: giant_tree, ruins, tower, castle, statue, windmill, temple, portal, well, mountain_peak,
  volcano, campfire, bridge, crashed_plane, radio_tower, skyscraper, skyscraper_ruin, water_tower, pyramid,
  colosseum, torii_gate, lighthouse, pirate_ship, rocket, ufo, dome_base, crystal_spire, ferris_wheel,
  stadium, fountain, obelisk, waterfall_cliff, gas_station, church, barn, cave (a tunnel + chamber is carved
  into the hillside behind it: crystals, mushrooms, a chest — `cave_chamber` zone). `role`: focal (one, seen from spawn),
  secondary, hidden. `preferredZone`: hill, ridge, forest_edge, riverbank, plateau, clearing, village, valley, coast, flat, outskirts, any.
- **settlement types**: village, abandoned_village, hamlet, camp, outpost, ruined_town, town (grid streets),
  city_district (blocks + skyscrapers), base, harbor (placed on a shore, gets a pier), farmstead (fields).
  `kit` overrides the style's building kit (medieval_cottage, timber_frame, stone_hut, elven, ruined,
  desert_adobe, nordic, cyber_block, modern_house, apartment_block, skyscraper, scifi_module, shack, japanese,
  western_facade, industrial_shed, igloo, tropical_hut, gothic, greek_temple, egyptian, victorian, bunker, candy, voxel, brick_rowhouse).
- **road types**: stone_path, dirt_path, cobblestone_road, wooden_walkway, asphalt_road, concrete_road
  (stripes / crossings / kerbs are added automatically on asphalt & concrete streets), metal_walkway, neon_road, sand_path, snow_path, brick_road.
  `connects` uses "spawn", settlement ids, landmark ids or edges (north, south-east…).
- **vegetation species**: pine, round_tree, dead_tree, willow, birch, giant_mushroom, small_mushroom, bush, fern,
  grass, flower, log, cactus, palm, jungle_tree, baobab, alien_tree, bamboo, cherry_tree, burnt_tree,
  candy_tree, coral, seaweed, snow_pine, acacia, cypress. The style's vegetation kit is blended in automatically.
- **prop sets**: village, forest, ruins, camp, mine, farm, docks, graveyard, urban, suburban, apocalypse, scifi,
  cyber, space, western, pirate, industrial, japanese, egypt, greek, tropical, arctic, candy, underwater, jungle,
  military, horror, sports, carnival, playground.
- **lighting.mood**: bright, soft, golden, overcast, moonlit, dusk, dawn, eerie, stormy (stormy → rain / snow weather, dark clouds).
- **layout.archetype**: settlement, city_grid, obby_course, arena, race_track, tycoon_plots, lobby_portals,
  base_defense, island, open_world, dungeon, sports_field, hangout_plaza, campus, linear_story.
  `count` = stages / plots / covers / checkpoints / waypoints; `extent` = footprint (0.1–1 of the map).

## StyleBible (worlds/main/style.bible.json)

Art direction every prefab reads: `palette` (primary, secondary, accent, ground, stone, wood, foliage,
foliageAlt, water, roof, wall, glow, sky), `materials`, `tree`, `architecture` (`style` kit, `roofPitch`,
`weathering`, `interiors`, `floors` [min,max]), `kits` (vegetation, props[], road, biomes, landmarks,
settlement), `ui` (theme, accent), `audioMood`, `lighting`, `fog`, and **`environment`**:

```jsonc
"environment": {
  "weather": "leaves",          // none, rain, snow, ash, dust, petals, spores, fireflies, embers, bubbles, leaves, sandstorm
  "weatherIntensity": 0.4,
  "cloudCover": 0.5,
  "snowLine": 0.9,              // normalized elevation above which bare ground turns to snow (>1 never, 0.2 = winter)
  "terrainTint": 0.55,          // 0 = Roblox default terrain colors, 1 = palette-driven (Terrain:SetMaterialColor)
  "grassDecoration": true,
  "walls": "stone_crenellated"  // none, stone_crenellated, palisade, sandbags, scrap, bamboo, adobe, marble, energy_fence, picket, ice
}
```

Prefer switching `stylePreset` (which rebuilds the whole bible from the taxonomy) over hand-editing many
bible fields; hand-edit for targeted tweaks (a warmer palette, more weathering, another wall kit).

## What the generator adds by itself

- Terrain: features → border rise → detail → strata → erosion; ocean floor, beaches and a shore band for
  island / coast; snow above the snow line; sand / mud along rivers and lakes.
- Settlements: flattened site, plaza, streets (grid for town / city_district / base), buildings with
  walk-in interiors and **doors that open** (`Door` parts + ProximityPrompt), ring **walls with gate towers**
  (style `environment.walls`), **crop fields** (farm sets / farmland biome / farmstead), a **pier** with
  boats (harbor or any shore-side settlement), a **graveyard** (church or graveyard/horror sets),
  paved grounds + lights + benches around focal landmarks, road markings on asphalt / concrete streets.
- Zones (`Workspace.World.Zones`, invisible markers with attributes) for every settlement, landmark,
  clearing, spawn, gameplay structure (`obby_stage_N`, `tycoon_plot_N`, `arena_spawn_a`…), plus
  `<settlement>_walls`, `<settlement>_docks`, `graveyard`. Systems anchor on them (`src/shared/zones.ts`).
- Lighting: Atmosphere, ColorCorrection, Bloom, SunRays, Sky (no celestial bodies in space styles),
  Clouds, palette-tinted terrain colors, water color, and a weather attribute set the client renders.
- Terrain detail: hydraulic erosion (gullies, fans — scaled by `terrain.erosion`), 3D voxel ops the runtime
  applies after the heightmap (`terrain.ops`): caves behind `cave` landmarks, rock overhangs on steep
  rocky slopes, natural arches on cliffs / shores, lava lakes in volcano craters (`crater` feature +
  `volcano` landmark or volcanic biome). Rocks and cliffs are procedural 3D meshes (see `worldforge-assets`).

## Diagnosing a bad map

| Symptom | Fix |
|---|---|
| Village on a slope / buildings floating | lower `terrain.relief`, add a `valley` feature under the settlement, or set `settlements[].position` on flat ground |
| Landmark invisible from spawn | `role: "focal"`, `cameraComposition.spawnFacing = <id>`, `preferredZone: "hill"` |
| Map feels empty | raise `vegetation.density` / `props.density`, add prop sets, a second settlement (`near` the first), more landmarks |
| Too dark / unreadable | `lighting.mood: "soft"`, `brightness` ≥ 0.6, `atmosphere.fogDensity` ≤ 0.35 |
| Water everywhere / no water | check `island.radius` (0.3–0.45 is a good island), remove/adjust `coast.reach`, `rivers[].width` |
| Obby stages clip the hills | `layout.extent` smaller, or add a `valley` under `layout.position` |
| Wrong look | change `stylePreset` first; then tweak `style.bible.json` palette / environment |
