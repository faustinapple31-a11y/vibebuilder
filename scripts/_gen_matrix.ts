import { WorldSpecSchema, getStylePreset, type StylePresetId } from "@worldforge/core";
import { generateWorld } from "@worldforge/world-gen";
const cases: [StylePresetId, string, string, string[]][] = [
  ["post_apocalyptic", "open_world", "abandoned_village", ["crashed_plane", "radio_tower", "gas_station"]],
  ["modern_city", "city_grid", "city_district", ["skyscraper", "fountain"]],
  ["modern_suburban", "settlement", "town", ["church"]],
  ["sci_fi", "tycoon_plots", "base", ["rocket", "dome_base"]],
  ["cartoon", "obby_course", "village", ["windmill"]],
  ["medieval", "arena", "town", ["castle"]],
  ["cyberpunk", "race_track", "city_district", ["skyscraper"]],
  ["candy", "lobby_portals", "village", ["ferris_wheel"]],
  ["military", "base_defense", "base", ["radio_tower"]],
  ["ancient_greece", "sports_field", "town", ["colosseum", "temple"]],
  ["tropical", "hangout_plaza", "harbor", ["lighthouse", "pirate_ship"]],
  ["dark_fantasy", "dungeon", "abandoned_village", ["ruins", "tower"]],
  ["feudal_japan", "linear_story", "village", ["torii_gate", "temple"]],
  ["space_station", "settlement", "base", ["ufo", "rocket"]],
  ["underwater", "settlement", "outpost", ["pirate_ship"]],
  ["wild_west", "settlement", "town", ["water_tower"]],
];
for (const [styleId, archetype, settlement, lms] of cases) {
  const style = getStylePreset(styleId);
  const t0 = Date.now();
  try {
    const spec = WorldSpecSchema.parse({
      name: `${styleId} ${archetype}`, seed: 7, stylePreset: styleId, size: { width: 512, depth: 512 },
      biomes: style.kits.biomes.slice(0, 3).map((id, i) => ({ id, weight: i === 0 ? 0.6 : 0.2 })),
      landmarks: lms.map((type, i) => ({ id: `lm${i}`, type, role: i === 0 ? "focal" : "secondary" })),
      settlements: [{ id: "main", type: settlement, buildings: 10 }],
      roads: [{ id: "r1", connects: ["spawn", "main", "lm0"], type: style.kits.road }],
      vegetation: { species: ["round_tree", "pine", "bush", "grass"], density: 0.5 },
      props: { density: 0.6, sets: [...style.kits.props] },
      layout: { archetype, count: 8 },
    });
    const bake = generateWorld(spec, style);
    const kinds = new Map<string, number>();
    for (const p of bake.placements) kinds.set(p.prefab, (kinds.get(p.prefab) ?? 0) + 1);
    const top = [...kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${v}`).join(" ");
    console.log(`OK ${styleId.padEnd(18)} ${archetype.padEnd(14)} ${Date.now() - t0}ms placements=${bake.placements.length} parts≈${bake.stats.partsEstimate} zones=${bake.zones.filter((z) => z.kind === "gameplay").length} | ${top}`);
  } catch (e) {
    console.log(`FAIL ${styleId} ${archetype}: ${(e as Error).stack?.split("\n").slice(0, 3).join(" | ")}`);
  }
}
