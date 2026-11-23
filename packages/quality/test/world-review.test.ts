import { describe, expect, it } from "vitest";
import { STYLE_FAMILY_INDEX, StyleBibleSchema, styleFamilyToBible } from "@worldforge/core";
import { generateWorld } from "@worldforge/world-gen";
import { interpretPrompt } from "../../agents/src/local/interpreter";
import { aerialPixels, reviewWorld } from "../src";

const make = (prompt: string, shift = 0) => {
  const { spec } = interpretPrompt(prompt);
  spec.seed = (spec.seed + shift) % 4294967295;
  spec.terrain.groundMode = "voxels";
  return generateWorld(spec, StyleBibleSchema.parse(styleFamilyToBible(STYLE_FAMILY_INDEX[spec.stylePreset] ?? STYLE_FAMILY_INDEX.stylized_mystical!)));
};

describe("world composition", () => {
  // floors a few points under what the generator reaches today: a change that loses them is a regression
  for (const [prompt, floor] of [["un petit village médiéval", 88], ["un grand bourg médiéval avec un château", 88], ["un monde fantasy montagneux avec un village", 88], ["une ville moderne dense", 88], ["une grande carte de survie en forêt", 84], ["une base militaire", 82]] as const) {
    it(`keeps "${prompt}" above ${floor}`, () => expect(reviewWorld(make(prompt)).score).toBeGreaterThanOrEqual(floor), 60_000);
  }

  it("draws forests as masses, leaves open country and calm ground", () => {
    const b = make("un grand bourg médiéval avec un château");
    const { metrics } = reviewWorld(b);
    expect(metrics.forestMass!).toBeGreaterThan(0.55);
    expect(metrics.forestVariation!).toBeGreaterThan(0.8);
    expect(metrics.openShare!).toBeGreaterThan(0.25);
    expect(metrics.bumpiness!).toBeLessThan(0.7);
    expect(metrics.entrances!).toBeGreaterThanOrEqual(3);
    expect(b.plan!.regions!.dense! + b.plan!.regions!.woods!).toBeGreaterThan(0.08);
  }, 60_000);

  it("does not compose a city like a village", () => {
    const city = make("une ville moderne dense");
    const village = make("un petit village médiéval");
    expect(reviewWorld(city).metrics.buildings!).toBeGreaterThan(40);
    expect(city.plan!.settlements[0]!.districts.some((d) => d.function === "farm")).toBe(false);
    expect(village.plan!.settlements[0]!.districts.some((d) => d.function === "farm")).toBe(true);
  }, 60_000);

  it("scores a scatter of trees as a scatter", () => {
    const b = make("un grand bourg médiéval avec un château");
    const good = reviewWorld(b).scales.aerial;
    let k = 0;
    for (const p of b.placements) if (p.category === "vegetation") {
      const i = k++;
      p.position[0] = b.terrain.origin[0] + ((i * 0.618034) % 1) * b.terrain.width * b.terrain.cellSize;
      p.position[2] = b.terrain.origin[1] + ((i * 0.754877) % 1) * b.terrain.depth * b.terrain.cellSize;
    }
    expect(reviewWorld(b).scales.aerial).toBeLessThan(good - 10);
  }, 60_000);

  it("captures the map from above", () => {
    const img = aerialPixels(make("un petit village médiéval"), 256);
    expect(img.data.length).toBe(256 * 256 * 3);
    expect(new Set(img.data).size).toBeGreaterThan(60);
  }, 60_000);
});
