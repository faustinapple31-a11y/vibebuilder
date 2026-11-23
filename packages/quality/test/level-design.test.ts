import { describe, expect, it } from "vitest";
import { STYLE_FAMILY_INDEX, StyleBibleSchema, deserializeBake, serializeBake, styleFamilyToBible } from "@worldforge/core";
import { generateWorld } from "@worldforge/world-gen";
import { interpretPrompt } from "../../agents/src/local/interpreter";
import { LEVEL_WEIGHTS, reviewLevelDesign } from "../src";

const bake = (prompt: string, seedShift = 0) => {
  const { spec } = interpretPrompt(prompt);
  spec.seed = (spec.seed + seedShift) % 4294967295;
  spec.terrain.groundMode = "voxels";
  return generateWorld(spec, StyleBibleSchema.parse(styleFamilyToBible(STYLE_FAMILY_INDEX[spec.stylePreset] ?? STYLE_FAMILY_INDEX.stylized_mystical!)));
};

describe("level design", () => {
  it("weighs the eight criteria to 100", () => {
    expect(Object.values(LEVEL_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("gives a village districts, plots on streets and several widths of road, the same on every run", () => {
    const a = bake("un village médiéval très dense avec un château");
    const b = bake("un village médiéval très dense avec un château");
    expect(JSON.stringify(a.plan)).toBe(JSON.stringify(b.plan));
    const plan = a.plan!.settlements[0]!;
    expect(new Set(plan.districts.map((d) => d.function)).size).toBeGreaterThanOrEqual(4);
    expect(plan.parcels.length).toBeGreaterThanOrEqual(6);
    for (const p of plan.parcels) {
      expect(a.paths.some((q) => q.id === p.street)).toBe(true);
      expect(a.placements.some((q) => q.id === p.building)).toBe(true);
    }
    const roads = a.paths.filter((p) => p.kind === "road");
    expect(new Set(roads.map((r) => r.width)).size).toBeGreaterThanOrEqual(2);
    expect(reviewLevelDesign(a).metrics.overlaps).toBe(0);
    expect(deserializeBake(serializeBake(a)).plan).toEqual(a.plan);
  }, 60_000);

  for (const [prompt, floor] of [["un petit village médiéval", 86], ["une carte côtière avec un port de pêche", 88], ["une grande ville moderne", 84], ["une base militaire", 86]] as const) {
    it(`keeps "${prompt}" above ${floor}`, () => {
      for (const shift of [0, 7919]) expect(reviewLevelDesign(bake(prompt, shift)).score).toBeGreaterThanOrEqual(floor);
    }, 60_000);
  }

  it("says precisely what is wrong with a map somebody broke", () => {
    const b = bake("un petit village médiéval");
    const before = reviewLevelDesign(b);
    const houses = b.placements.filter((p) => p.category === "building" && /house/.test(p.prefab));
    houses[1]!.position = [houses[0]!.position[0] + 3, houses[0]!.position[1], houses[0]!.position[2]];
    const after = reviewLevelDesign(b);
    expect(after.metrics.overlaps!).toBeGreaterThan(before.metrics.overlaps!);
    expect(after.criteria.architecture).toBeLessThan(before.criteria.architecture);
    expect(after.problems.some((p) => p.id === "buildings_overlap" && p.fix)).toBe(true);
  }, 60_000);

  it("leaves something to find off the roads", () => {
    const b = bake("une forêt avec beaucoup de relief et un village");
    expect(b.zones.some((z) => z.meta?.kind === "viewpoint")).toBe(true);
    expect(b.zones.some((z) => z.meta?.kind === "secret")).toBe(true);
  }, 60_000);
});
