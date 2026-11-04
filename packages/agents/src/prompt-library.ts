/**
 * What the prompt enhancer knows: prompting rules, map art direction, worked examples and reference
 * prompts. It ships with the app, so it is plain data here, not files read at runtime.
 */

/** Lighting moods a WorldSpec accepts (a test keeps this list in step with the schema). */
export const BRIEF_MOODS = ["bright", "soft", "golden", "overcast", "moonlit", "dusk", "dawn", "eerie", "stormy"] as const;

export const TERRAIN_FEATURES = ["mountains", "hills", "valley", "plateau", "cliffs", "crater", "island", "archipelago", "coast"] as const;

export const PROMPT_CRAFT = `- Write for a brilliant colleague who has never seen this project: concrete and specific, never vague praise such as "beautiful" or "immersive".
- Give the reason for a choice when it steers other choices ("the church sits high so the player can navigate by it").
- Say what to do, not what to avoid. Keep AVOID for the two or three real risks of this map.
- Decide. A brief full of "maybe" or "could" leaves the agent with the same blank page.
- Stay short: every line must change what the agent builds.`;

export const MAP_ART_DIRECTION = `- One focal landmark per map, visible from the spawn, larger or brighter than everything around it. It attracts without blocking the way.
- Design the player's first view on purpose: two trees or rocks framing it, a road leading the eye, a readable skyline behind.
- Fill three planes: foreground detail near paths, buildings and trees in the middle, silhouettes on the horizon.
- Give each place one sentence of story (who lives here, what happened) and let the settlement type and landmarks tell it.
- Density belongs to zones, not to the whole map: dense clumps, real clearings, calm areas next to busy ones.
- Nothing lines up like a grid unless it was built that way. Vary size and rotation.
- Palette: 5 to 7 base colours plus one strong accent kept for the focal point. Ground and buildings must not share a value, or they merge.
- Depth comes from coloured haze: one colour near, another far. Plain fog looks milky.
- Use the map's edges: mountains or coast close the horizon so the world does not just stop.
- Hide one thing to discover away from the main road.`;

export interface BriefExample {
  id: string;
  request: string;
  brief: string;
}

export const BRIEF_EXAMPLES: BriefExample[] = [
  {
    id: "vague_village",
    request: "fait moi un village",
    brief: `INTENT: A village to explore. Nothing else was asked for, so every choice below only serves that village.
GENRE: adventure | STYLE: medieval | LAYOUT: settlement
SETTING: A lived-in hill-country farming village the morning after market day.
FIRST VIEW: From the spawn a road climbs between two big oaks toward the square, with the church tower rising behind the roofs.
FOCAL: church, on the high side of the village so it can be seen from the spawn and from the whole road.
SECONDARY: well on the square as a meeting point; windmill on a hill outside the walls; ruins hidden at the forest edge as the thing to discover.
SETTLEMENTS: village, 12 buildings around a paved square, houses turned at slightly different angles.
TERRAIN AND WATER: hills at medium intensity, a valley holding the village, mountains on the north and west edges for the skyline, one river crossed by the road on a bridge.
VEGETATION: forest in clumps with clearings, open meadow around the houses, sparse near the square.
MOOD: golden
PALETTE: #6F8F3C meadow, #4B6B35 forest, #9A8F7E stone, #B98B52 timber, #7C4A32 roof, accent #C8452F on the church banners.
ATMOSPHERE: light haze, warm cream near the village, blue-grey on the mountains.
AVOID: a flat map; a uniform forest hiding the village from the spawn.`,
  },
  {
    id: "themed_obby",
    request: "an obby on a tropical island",
    brief: `INTENT: An obby course on a tropical island. The course is the game; the island is its setting.
GENRE: obby | STYLE: tropical | LAYOUT: obby_course
SETTING: A small volcanic island where an old lighthouse keeper left a trail of platforms up to the light.
FIRST VIEW: From a beach spawn the first stages rise over the lagoon, and the lighthouse at the top shows the goal at once.
FOCAL: lighthouse, on the highest coast point, so the finish is in sight from the first jump.
SECONDARY: pirate_ship wrecked on the far beach, seen from the upper stages; campfire at the spawn.
SETTLEMENTS: camp, 3 buildings by the spawn, nothing else competing with the course.
TERRAIN AND WATER: island, radius about 0.36, hills at medium intensity to give the course height, ocean all around.
VEGETATION: palms in clumps along the beach, denser jungle inland, open sand around every stage.
MOOD: bright
PALETTE: #F2DFA7 sand, #2FB7B0 lagoon, #3F9B4F palm, #8A6A4A wood, #E9E4D8 stone, accent #FF6B35 on checkpoints.
ATMOSPHERE: almost clear, pale turquoise near, soft warm white on the horizon.
AVOID: vegetation on the jumps; stages hidden behind palms.`,
  },
  {
    id: "detailed_cyberpunk",
    request: "une ville cyberpunk de nuit sous la pluie avec une course de voitures dans les rues néon, et une grande antenne au centre",
    brief: `INTENT: A cyberpunk city at night in the rain, a car race through neon streets, and a big antenna in the centre. All four are required.
GENRE: racing | STYLE: cyberpunk | LAYOUT: race_track
SETTING: An illegal street race run through a district that never sleeps, around the broadcast tower that films it.
FIRST VIEW: The start line faces down a long avenue of neon towers with the antenna straight ahead on the skyline.
FOCAL: radio_tower, in the centre of the city as requested, visible from most of the circuit so drivers keep their bearings.
SECONDARY: skyscraper blocks along the straights; gas_station on the outer loop as a landmark for the hard corner.
SETTLEMENTS: city_district, dense blocks, the circuit following the streets.
TERRAIN AND WATER: flat ground, no rivers, a low plateau on one side for a change of height.
VEGETATION: almost none, a few trees on the central avenue.
MOOD: moonlit
PALETTE: #10131F night asphalt, #2A2F45 concrete, #3B3F58 steel, #00E5FF cyan neon, #FF2EA6 magenta neon, accent #FFD400 on the start line.
ATMOSPHERE: rain, dense haze, violet near the streets, deep blue at the horizon.
AVOID: dark corners on the circuit; neon so even that the track stops standing out.`,
  },
];

export interface ReferencePrompt {
  id: string;
  title: string;
  /** What the enhancer may take from it. */
  use: string;
  text: string;
}

/** The reference for stud-style maps built in Blender. `[describe your map here…]` is what a brief fills in. */
export const BLENDER_STUD_MAP_PROMPT = `Connect to the Blender MCP. Analyse every stud-style reference image I gave you in detail: proportions, colors, bevels, how the studs are placed, and how much detail there is. Strictly respect that low-poly stud style for everything you build.


THE MAP: [describe your map here: layout, main areas, buildings, props, size]
Build every part of the map with every detail, while respecting the style:
- Model every structure, prop and decoration in the same low-poly stud style.
- Use beveled edges and trims instead of sharp plain blocks.
- Place decorations naturally (varied size and rotation, not on a grid).
- Use a coherent, limited color palette that matches the references.

RENDERS: make high-quality renders of the map: one wide overview shot and a few close-ups of the main areas. Use nice lighting (sun + soft shadows), a sky background, and good camera angles.

EXPORT FOR ROBLOX:
- Export as GLB with the stud texture AND the colors included (bake the colors into the texture if needed, so they show up in Roblox).
- Split the map into logical chunks and keep each mesh under Roblox's triangle limit per mesh.
- Apply all transforms, set the origin correctly, and use a scale that matches Roblox studs.
- Name every object clearly.

Before rendering, use the look tool to check your work and fix anything that breaks the style. Be very precise and go for quality.`;

export const REFERENCE_PROMPTS: ReferencePrompt[] = [
  {
    id: "blender_stud_map",
    title: "Stud-style map built in Blender",
    use: "It shows the standard expected of a map request: one strict style held everywhere, every area described, natural placement, a limited palette. Take that standard. The agents you write for have no Blender, renders or export step, so leave those parts out.",
    text: BLENDER_STUD_MAP_PROMPT,
  },
];
