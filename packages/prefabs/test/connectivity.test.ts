import { describe, expect, it } from "vitest";
import { STYLE_PRESET_IDS, getStylePreset, partBounds, type Part, type Vec3 } from "@worldforge/core";
import { PREFAB_DEFINITIONS, buildPrefabVariants } from "../src";

/**
 * Every visible part of every prefab must touch the ground or another part of the same prefab:
 * this is the automated guard against "parts décalées / dans le vide".
 */
const TOLERANCE = 0.35;
const FLOATING_BY_DESIGN = new Set(["wisp"]);

function overlaps(a: { min: Vec3; max: Vec3 }, b: { min: Vec3; max: Vec3 }): boolean {
  for (let i = 0; i < 3; i++) if (a.min[i]! > b.max[i]! + TOLERANCE || b.min[i]! > a.max[i]! + TOLERANCE) return false;
  return true;
}

function looseParts(parts: Part[]): number[] {
  const visible = parts.map((p, i) => ({ p, i, b: partBounds(p) })).filter(({ p }) => (p.transparency ?? 0) < 1);
  const loose: number[] = [];
  for (const a of visible) {
    if (a.b.min[1] <= 0.6) continue; // rests on the ground
    const connected = visible.some((o) => o.i !== a.i && overlaps(a.b, o.b));
    if (!connected) loose.push(a.i);
  }
  return loose;
}

describe("prefab connectivity", () => {
  for (const styleId of STYLE_PRESET_IDS) {
    const style = getStylePreset(styleId);
    it(`no floating parts in any prefab (${styleId})`, () => {
      const failures: string[] = [];
      for (const def of PREFAB_DEFINITIONS) {
        if (FLOATING_BY_DESIGN.has(def.id)) continue;
        const variants = buildPrefabVariants(def.id, style, 4242);
        for (const v of variants) {
          const loose = looseParts(v.parts);
          if (loose.length > 0) failures.push(`${v.id}: parts ${loose.map((i) => `${i}(${v.parts[i]!.shape}@${v.parts[i]!.position.map((c) => c.toFixed(1)).join(",")})`).join(" ")}`);
        }
      }
      expect(failures, failures.join("\n")).toEqual([]);
    });
  }
});
