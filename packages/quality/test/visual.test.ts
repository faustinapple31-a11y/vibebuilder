import { describe, expect, it } from "vitest";
import { VISUAL_WEIGHTS, scoreVisual, type PieceMetrics, type VisualSurvey } from "../src";

const house = (name: string, over: Partial<PieceMetrics> = {}): PieceMetrics => ({ name, kind: "architecture", tris: 18_000, size: [20, 18, 24], outline: 1.3, fill: 0.7, largestPlane: 0.04, secondary: 0.2, tertiary: 0.6, materials: 11, textured: 0.95, hues: 0.14, texel: 90, texelSpread: 3, medium: 0.92, far: 0.86, mediumTris: 7000, farTris: 3000, ...over });
const survey = (pieces: PieceMetrics[], difference: number, floating = 0): VisualSurvey => ({ pieces, variants: { house: { count: pieces.length, difference } }, floating });

describe("visual quality", () => {
  it("weighs its eight criteria to 100", () => expect(Object.values(VISUAL_WEIGHTS).reduce<number>((a, b) => a + b, 0)).toBe(100));

  it("scores a varied, detailed kit high and a box kit low, with a fix for every problem", () => {
    const good = scoreVisual(survey([house("house_0"), house("house_1"), house("house_2")], 0.34));
    const box = { outline: 1, largestPlane: 0.3, secondary: 0.01, tertiary: 0, materials: 1, textured: 0, hues: 0, texel: 12, far: 0.4 };
    const bad = scoreVisual(survey([house("house_0", box), house("house_1", box), house("house_2", box)], 0.02, 14));
    expect(good.score).toBeGreaterThan(90);
    expect(bad.score).toBeLessThan(35);
    expect(bad.problems.length).toBeGreaterThan(8);
    expect(bad.problems.every((p) => p.fix.length > 8)).toBe(true);
    expect(good.distances.far).toBeGreaterThan(bad.distances.far);
  });

  it("notices one template repeated, however detailed", () => {
    const r = scoreVisual(survey([house("house_0"), house("house_1"), house("house_2")], 0.03));
    expect(r.problems.some((p) => p.criterion === "consistency" && p.message.includes("silhouette"))).toBe(true);
  });
});
