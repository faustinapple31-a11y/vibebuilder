import { describe, expect, it } from "vitest";
import { getStylePreset, getWorldTemplate } from "@worldforge/core";
import { generateWorld } from "@worldforge/world-gen";
import { critiqueBake } from "@worldforge/quality";

/**
 * The critic drives the auto-fixer, so a false complaint is worse than a missing one: it patches the
 * spec away from what the client asked for. These cases pin the two directions.
 */
describe("visual quality critic", () => {
  const spec = getWorldTemplate("moonlit_forest_village");
  const style = getStylePreset(spec.stylePreset);

  it("scores a full forest world without complaining about its vegetation or composition", () => {
    const bake = generateWorld(spec, style);
    const report = critiqueBake(bake, spec, style);
    const ids = report.problems.map((p) => p.id);
    console.log(report.score, ids.join(" "));
    expect(ids).not.toContain("vegetation_sparse");
    expect(ids).not.toContain("foreground_empty");
    expect(ids).not.toContain("background_empty");
    expect(ids).not.toContain("vegetation_in_buildings");
    expect(report.score).toBeGreaterThanOrEqual(90);
  });

  it("still catches a forest world that was asked for trees and got none", () => {
    const bare = { ...spec, vegetation: { ...spec.vegetation, density: 0.05 } };
    const bake = generateWorld(bare, style);
    // the expectation comes from the spec the client wrote, so it is compared against the density asked
    const report = critiqueBake(bake, spec, style);
    expect(report.problems.map((p) => p.id)).toContain("vegetation_sparse");
  });

  it("does not expect a forest where nothing grows (no vegetation kit, mostly water, barren biomes)", () => {
    const barrenStyle = { ...style, kits: { ...style.kits, vegetation: "none" as const } };
    const bake = generateWorld(spec, barrenStyle);
    const report = critiqueBake(bake, spec, barrenStyle);
    expect(report.problems.map((p) => p.id)).not.toContain("vegetation_sparse");
  });
});
