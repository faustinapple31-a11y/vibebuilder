import type { BakeStats, PrefabCategory } from "@worldforge/core";
import { progress, type GenContext } from "../context";

/**
 * Stage 14: measure. Nothing is dropped to fit a number: what a world costs is reported (`measureCapacity`), and how it is
 * represented on a device is the business of the export profile.
 */
export function measureStats(ctx: GenContext): BakeStats {
  progress(ctx, "measure", 0);
  const parts = ctx.placements.reduce((n, p) => n + (ctx.prefabs[p.prefab]?.[p.variant]?.parts.length ?? 0), 0);
  // stats
  const counts = emptyCat();
  const layerCounts = { foreground: 0, midground: 0, background: 0 };
  const variantsUsed: Record<string, number> = {};
  const usedSets = new Map<string, Set<number>>();
  for (const p of ctx.placements) {
    counts[p.category]++;
    layerCounts[p.layer]++;
    let set = usedSets.get(p.prefab);
    if (!set) usedSets.set(p.prefab, (set = new Set()));
    set.add(p.variant);
  }
  for (const [k, v] of usedSets) variantsUsed[k] = v.size;
  const variantsAvailable: Record<string, number> = {};
  for (const [k, v] of Object.entries(ctx.prefabs)) variantsAvailable[k] = v.length;
  const [minH, maxH] = ctx.heights.minMax();
  const slope = ctx.heights.slopeGrid();
  // mean slope over the playable interior (outer 15% band is background mountains)
  let slopeSum = 0;
  let slopeN = 0;
  const bx = Math.floor(ctx.width * 0.15);
  const bz = Math.floor(ctx.depth * 0.15);
  for (let z = bz; z < ctx.depth - bz; z++) for (let x = bx; x < ctx.width - bx; x++) {
    slopeSum += slope.data[z * ctx.width + x]!;
    slopeN++;
  }
  let water = 0;
  for (let i = 0; i < ctx.water.data.length; i++) if (!Number.isNaN(ctx.water.data[i]!)) water++;
  const stats: BakeStats = {
    counts,
    partsEstimate: parts,
    variantsUsed,
    variantsAvailable,
    layerCounts,
    heightStd: ctx.heights.std(),
    heightMin: minH,
    heightMax: maxH,
    slopeMean: slopeN ? slopeSum / slopeN : slope.mean(),
    waterCoverage: water / ctx.water.data.length,
    vegetationCoverage: counts.vegetation / ((ctx.worldW * ctx.worldD) / 10000),
    buildingCount: counts.building,
    generationMs: 0,
  };
  progress(ctx, "measure", 1);
  return stats;
}

function emptyCat(): Record<PrefabCategory, number> {
  return { vegetation: 0, rock: 0, building: 0, prop: 0, landmark: 0, path: 0, water: 0, npc: 0 };
}
