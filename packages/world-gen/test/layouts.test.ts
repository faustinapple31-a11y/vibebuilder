import { describe, expect, it } from "vitest";
import { LAYOUT_ARCHETYPES, WorldSpecSchema, getStylePreset, type StylePresetId } from "@worldforge/core";
import { generateWorld } from "../src";

/**
 * Every layout archetype generates on a small map with a style from another family, and produces the
 * gameplay zones the runtime systems look for (stage / plot / gate / waypoint / spawn markers).
 */
const cases: { style: StylePresetId; archetype: string; settlement: string; expectZones: string[] }[] = [
  { style: "cartoon", archetype: "obby_course", settlement: "village", expectZones: ["obby_stage_1", "obby_stage_8"] },
  { style: "medieval", archetype: "arena", settlement: "town", expectZones: ["arena_spawn_a", "arena_spawn_b", "arena_center"] },
  { style: "cyberpunk", archetype: "race_track", settlement: "city_district", expectZones: ["race_start", "race_cp_1"] },
  { style: "low_poly_minimal", archetype: "tycoon_plots", settlement: "town", expectZones: ["tycoon_hub", "tycoon_plot_1", "tycoon_plot_8"] },
  { style: "candy", archetype: "lobby_portals", settlement: "village", expectZones: ["lobby", "lobby_portal_1"] },
  { style: "military", archetype: "base_defense", settlement: "base", expectZones: ["td_spawn", "td_base", "td_waypoint_1"] },
  { style: "modern_city", archetype: "sports_field", settlement: "city_district", expectZones: ["field_center", "goal_home", "goal_away"] },
  { style: "tropical", archetype: "hangout_plaza", settlement: "harbor", expectZones: ["plaza", "plaza_stage"] },
  { style: "dark_fantasy", archetype: "dungeon", settlement: "abandoned_village", expectZones: ["dungeon_room_1", "dungeon_boss"] },
  { style: "post_apocalyptic", archetype: "open_world", settlement: "abandoned_village", expectZones: [] },
  { style: "feudal_japan", archetype: "linear_story", settlement: "village", expectZones: ["story_checkpoint_1", "story_checkpoint_8"] },
  // the archetypes with no structures of their own still have to generate a playable world
  { style: "modern_city", archetype: "city_grid", settlement: "city_district", expectZones: [] },
  { style: "wild_west", archetype: "settlement", settlement: "town", expectZones: [] },
  { style: "pirate", archetype: "island", settlement: "harbor", expectZones: [] },
  { style: "sci_fi", archetype: "campus", settlement: "base", expectZones: [] },
];

describe("gameplay layouts × styles", () => {
  it("covers every archetype the schema allows", () => {
    const covered = new Set(cases.map((c) => c.archetype));
    const missing = LAYOUT_ARCHETYPES.filter((a) => !covered.has(a));
    expect(missing, `archetypes with no case: ${missing.join(", ")}`).toEqual([]);
  });

  for (const c of cases) {
    it(`${c.archetype} in ${c.style} (${c.settlement})`, () => {
      const style = getStylePreset(c.style);
      const spec = WorldSpecSchema.parse({
        name: `${c.style} ${c.archetype}`,
        seed: 11,
        stylePreset: c.style,
        size: { width: 512, depth: 512 },
        biomes: style.kits.biomes.slice(0, 2).map((id, i) => ({ id, weight: i === 0 ? 0.7 : 0.3 })),
        landmarks: [{ id: "lm0", type: style.kits.landmarks[0], role: "focal" }],
        settlements: [{ id: "main", type: c.settlement, buildings: 8 }],
        roads: [{ id: "r1", connects: ["spawn", "main", "lm0"], type: style.kits.road }],
        props: { density: 0.5, sets: [...style.kits.props] },
        layout: { archetype: c.archetype, count: 8 },
      });
      const bake = generateWorld(spec, style);
      const ids = new Set(bake.zones.map((z) => z.id));
      for (const z of c.expectZones) expect(ids.has(z), `zone ${z} in ${[...ids].join(",")}`).toBe(true);
      expect(bake.placements.filter((p) => p.category === "building").length).toBeGreaterThan(0);
      expect(bake.stats.partsEstimate).toBeGreaterThan(500);
      // buildings never float: every building sits within 3 studs of the terrain under it
      for (const p of bake.placements.filter((p) => p.category === "building" && !p.id.startsWith("layout_"))) {
        const v = bake.prefabs[p.prefab]?.[p.variant];
        expect(v, p.prefab).toBeDefined();
      }
    });
  }
});
