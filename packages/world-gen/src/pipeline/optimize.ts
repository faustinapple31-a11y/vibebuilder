import type { BakeStats, Placement, PrefabCategory } from "@worldforge/core";
import { progress, type GenContext } from "../context";

export interface PerformanceBudget {
  maxInstances: Record<PrefabCategory, number>;
  maxParts: number;
}

/** Default budget for a 1024×1024 world; scaled by area. */
export function defaultBudget(worldW: number, worldD: number): PerformanceBudget {
  const areaK = (worldW * worldD) / (1024 * 1024);
  const s = (n: number) => Math.round(n * Math.max(0.35, Math.min(2.5, areaK)));
  return {
    maxInstances: {
      vegetation: s(3200),
      rock: s(450),
      building: s(40),
      prop: s(500),
      landmark: 8,
      path: s(220),
      water: 0,
      npc: s(30),
    },
    maxParts: s(48000),
  };
}

/**
 * Stage 14: enforce budgets (drop the least important placements per category first),
 * then compute statistics for the critic and the UI.
 */
export function optimizeAndStats(ctx: GenContext, budget: PerformanceBudget): BakeStats {
  progress(ctx, "optimize", 0);
  const byCat = new Map<PrefabCategory, Placement[]>();
  // gameplay layout structures (obby stages, plots, gates…) and settlement dressing (walls, piers, fields) are never trimmed
  const essential = (p: Placement) => p.id.startsWith("layout_") || p.id.startsWith("dress_");
  for (const p of ctx.placements) {
    if (essential(p)) continue;
    let arr = byCat.get(p.category);
    if (!arr) byCat.set(p.category, (arr = []));
    arr.push(p);
  }
  const partsOf = (p: Placement) => ctx.prefabs[p.prefab]?.[p.variant]?.parts.length ?? 0;
  const trimmed: Record<string, number> = {};
  const kept: Placement[] = ctx.placements.filter(essential);
  for (const [cat, arr] of byCat) {
    const max = budget.maxInstances[cat] ?? Infinity;
    if (arr.length <= max) {
      kept.push(...arr);
      trimmed[cat] = 0;
      continue;
    }
    arr.sort((a, b) => (b.locked ? 1 : 0) - (a.locked ? 1 : 0) || b.importance - a.importance);
    kept.push(...arr.slice(0, max));
    trimmed[cat] = arr.length - max;
  }
  // parts cap
  let parts = kept.reduce((s, p) => s + partsOf(p), 0);
  if (parts > budget.maxParts) {
    kept.sort((a, b) => (b.locked || essential(b) ? 1 : 0) - (a.locked || essential(a) ? 1 : 0) || b.importance - a.importance);
    while (parts > budget.maxParts && kept.length > 0 && !essential(kept[kept.length - 1]!)) {
      const p = kept.pop()!;
      parts -= partsOf(p);
      trimmed[p.category] = (trimmed[p.category] ?? 0) + 1;
    }
  }
  ctx.placements = kept;
  ctx.trimmed = trimmed;

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
  const budgets = {} as BakeStats["budgets"];
  for (const cat of Object.keys(budget.maxInstances) as PrefabCategory[]) {
    budgets[cat] = { max: budget.maxInstances[cat], used: counts[cat], trimmed: trimmed[cat] ?? 0 };
  }
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
    budgets,
    generationMs: 0,
  };
  progress(ctx, "optimize", 1);
  return stats;
}

function emptyCat(): Record<PrefabCategory, number> {
  return { vegetation: 0, rock: 0, building: 0, prop: 0, landmark: 0, path: 0, water: 0, npc: 0 };
}
