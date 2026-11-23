import { describe, expect, it } from "vitest";
import { STYLE_FAMILY_INDEX, StyleBibleSchema, styleFamilyToBible } from "@worldforge/core";
import { generateWorld } from "@worldforge/world-gen";
import { interpretPrompt } from "../../agents/src/local/interpreter";
import { improveWorld, mapScore } from "../src";

const start = (prompt: string) => {
  const { spec } = interpretPrompt(prompt);
  spec.terrain.groundMode = "voxels";
  const style = StyleBibleSchema.parse(styleFamilyToBible(STYLE_FAMILY_INDEX[spec.stylePreset] ?? STYLE_FAMILY_INDEX.stylized_mystical!));
  return { spec, style, bake: generateWorld(spec, style) };
};

describe("correction loop", () => {
  it("never returns a worse map, keeps the ground and the landmarks, and is deterministic", () => {
    const { spec, style, bake } = start("un village dans le désert avec une oasis");
    const a = improveWorld(spec, style, bake, { target: 99 });
    const b = improveWorld(spec, style, bake, { target: 99 });
    expect(a.after).toBeGreaterThanOrEqual(a.before);
    expect(a.after).toBe(mapScore(a.bake));
    expect(a.steps.length).toBeGreaterThan(0);
    expect(JSON.stringify(b.steps)).toBe(JSON.stringify(a.steps));
    expect(a.bake.landmarks.map((l) => l.position)).toEqual(bake.landmarks.map((l) => l.position));
  }, 90_000);

  it("turns a house somebody set with its back to the street", () => {
    const { spec, style, bake } = start("un petit village médiéval");
    const plots = new Set(bake.plan!.settlements.flatMap((s) => s.parcels.map((p) => p.building)));
    for (const p of bake.placements) if (plots.has(p.id)) p.rotationY += Math.PI;
    const r = improveWorld(spec, style, bake, { redraws: 0 });
    expect(r.steps[0]!.kept).toBe(true);
    expect(r.after).toBeGreaterThan(r.before);
  }, 60_000);

  it("leaves locked placements alone", () => {
    const { spec, style, bake } = start("un petit village médiéval");
    const plots = new Set(bake.plan!.settlements.flatMap((s) => s.parcels.map((p) => p.building)));
    for (const p of bake.placements) if (plots.has(p.id)) (p.rotationY += Math.PI), (p.locked = true);
    const turned = bake.placements.filter((p) => p.locked).map((p) => p.rotationY);
    const r = improveWorld(spec, style, bake, { redraws: 0 });
    expect(r.bake.placements.filter((p) => p.locked).map((p) => p.rotationY)).toEqual(turned);
  }, 60_000);
});
