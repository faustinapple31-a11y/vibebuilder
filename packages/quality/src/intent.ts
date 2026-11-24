import { sampleHeight, type Expectation, type WorldBake, type WorldSpec } from "@worldforge/core";

/**
 * Did the map keep the promise of the request? Every expectation of the design plan is looked for in what was really
 * built (placements, water, relief, biomes, facilities), not in the spec that asked for it.
 */
export interface IntentReport {
  score: number;
  met: string[];
  missing: { label: string; found: number; wanted: number }[];
}

const BUILDING = /^(house|cottage|shop|apartment|skyscraper|ruin_wall|facility_)/;

export function measureExpectation(e: Expectation, bake: WorldBake, spec: WorldSpec): number {
  const t = bake.terrain;
  const any = new Set(e.any);
  switch (e.kind) {
    case "style":
      return any.has(bake.meta.stylePreset) ? 1 : 0;
    case "genre":
      return any.has(spec.gameplayHints[0] ?? "") ? 1 : 0;
    case "layout":
      return any.has(spec.layout.archetype) ? 1 : 0;
    case "settlement":
      return spec.settlements.filter((s) => any.has(s.type) && bake.zones.some((z) => z.kind === "settlement" && z.id === s.id)).length;
    case "settlements":
      return bake.zones.filter((z) => z.kind === "settlement" && bake.placements.some((p) => p.zone === z.id && p.category === "building" && BUILDING.test(p.prefab))).length;
    case "buildings":
      return bake.placements.filter((p) => p.category === "building" && BUILDING.test(p.prefab) && (any.size === 0 || any.has(p.prefab))).length;
    case "prefab":
      return bake.placements.filter((p) => any.has(p.prefab)).length;
    case "landmark":
      return bake.landmarks.filter((l) => any.has(l.type)).length;
    case "facility":
      return bake.zones.filter((z) => z.meta?.kind === "facility" && any.has(String(z.meta.facility))).length;
    case "feature":
      return spec.terrain.features.filter((f) => any.has(f.type)).length;
    case "biome": {
      const want = t.biomeIds.map((id, i) => (any.has(id) ? i : -1)).filter((i) => i >= 0);
      let n = 0;
      let land = 0;
      for (let i = 0; i < t.biomes.length; i++) {
        if (!Number.isNaN(t.water[i]!)) continue;
        land++;
        if (want.includes(t.biomes[i]!)) n++;
      }
      return land ? n / land : 0;
    }
    case "water": {
      let wet = 0;
      let edge = 0;
      for (let z = 0; z < t.depth; z += 2) for (let x = 0; x < t.width; x += 2) {
        if (Number.isNaN(t.water[z * t.width + x]!)) continue;
        wet++;
        if (x < 4 || z < 4 || x > t.width - 5 || z > t.depth - 5) edge++;
      }
      if (any.has("sea")) return edge > (t.width + t.depth) / 12 ? 1 : 0;
      if (any.has("river")) return bake.paths.some((p) => p.kind === "river" && p.points.length > 20) ? 1 : 0;
      return wet > 30 ? 1 : 0;
    }
    case "relief": {
      let lo = Infinity;
      let hi = -Infinity;
      for (const h of t.heights) (lo = Math.min(lo, h)), (hi = Math.max(hi, h));
      return hi - lo;
    }
    case "flat": {
      let n = 0;
      let flat = 0;
      for (let z = 8; z < t.depth - 8; z += 3) for (let x = 8; x < t.width - 8; x += 3) {
        const wx = t.origin[0] + x * t.cellSize;
        const wz = t.origin[1] + z * t.cellSize;
        n++;
        if (Math.hypot(sampleHeight(t, wx + 8, wz) - sampleHeight(t, wx - 8, wz), sampleHeight(t, wx, wz + 8) - sampleHeight(t, wx, wz - 8)) / 16 < 0.16) flat++;
      }
      return n ? flat / n : 0;
    }
  }
}

export function reviewIntent(bake: WorldBake, spec: WorldSpec): IntentReport {
  const expects = spec.design?.expects ?? [];
  const met: string[] = [];
  const missing: IntentReport["missing"] = [];
  let sum = 0;
  for (const e of expects) {
    const found = measureExpectation(e, bake, spec);
    const ok = Math.min(1, e.min > 0 ? found / e.min : 1);
    sum += ok;
    if (ok >= 0.999) met.push(e.label);
    else missing.push({ label: e.label, found: Math.round(found * 100) / 100, wanted: e.min });
  }
  return { score: expects.length ? Math.round((sum / expects.length) * 1000) / 10 : 100, met, missing };
}
