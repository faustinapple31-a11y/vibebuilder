import { describe, expect, it } from "vitest";
import { WorldSpecSchema } from "@worldforge/core";
import { completeSpec } from "../src/local/complete-spec";
import { interpretPrompt } from "../src/local/interpreter";

/** What a model typically writes: the look of a world, a default size, no plan. */
const fromModel = (over: Record<string, unknown> = {}) =>
  WorldSpecSchema.parse({ id: "main", name: "City", stylePreset: "modern_city", settlements: [{ id: "town", type: "city_district", buildings: 30, layout: "grid" }], biomes: [{ id: "meadow", weight: 1 }], ...over });

describe("a world written by a model", () => {
  it("gets the plan and the size of the request", () => {
    const s = completeSpec(fromModel(), "une grande ville moderne");
    expect(s.design?.facilities).toContain("hospital");
    expect(s.design?.morphology).toBe("grid");
    expect(s.size.width).toBeGreaterThanOrEqual(2048);
    expect(s.settlements[0]!.buildings).toBeGreaterThan(100);
    // what is checked is what the model wrote
    expect(s.design?.expects.some((e) => e.kind === "water")).toBe(false);
  });

  it("keeps what the model decided", () => {
    const big = completeSpec(fromModel({ size: { width: 3072, depth: 3072 } }), "une grande ville moderne");
    expect(big.size.width).toBe(3072);
    const placed = completeSpec(fromModel({ settlements: [{ id: "town", type: "city_district", buildings: 30, position: [0.5, 0.5] }] }), "une grande ville moderne");
    expect(placed.size.width).toBe(1024);
    const planned = interpretPrompt("un aéroport").spec;
    expect(completeSpec(planned, "une jungle")).toBe(planned);
  });

  it("puts back a plan lost in an edit, and leaves an old world without one alone", () => {
    const before = interpretPrompt("une base militaire").spec;
    const { design: _lost, ...rest } = before;
    void _lost;
    expect(completeSpec(WorldSpecSchema.parse(rest), "plus de brouillard", before).design).toEqual(before.design);
    const old = fromModel();
    expect(completeSpec(fromModel({ name: "x" }), "plus de brouillard", old).design).toBeUndefined();
  });
});
