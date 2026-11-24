import { deriveSeed, type StyleBible, type WorldBake, type WorldSpec } from "@worldforge/core";
import { generateWorld, type GenLayer, type GenerateOptions } from "@worldforge/world-gen";
import { reviewLevelDesign, type LevelProblem } from "./level-design";
import { reviewWhole, type CriticReport } from "./world-critic";

/**
 * The correction loop: review, correct locally, review again, keep only what is better. Terrain, water and landmarks that
 * passed are kept; what a local correction cannot repair is drawn again (streets, plots, woods) on the same ground.
 * No model is called, and the same spec always ends on the same map.
 */
export interface ImproveStep {
  action: string;
  score: number;
  kept: boolean;
}

export interface ImproveResult {
  bake: WorldBake;
  before: number;
  after: number;
  steps: ImproveStep[];
}

export interface ImproveOptions {
  /** Stop as soon as the map reaches this score. */
  target?: number;
  /** How many times the human layers may be drawn again. */
  redraws?: number;
  generate?: Omit<GenerateOptions, "previous" | "regenerate" | "seedOverride">;
}

/** Layers a redraw may touch: the ground and what stands on it as a landmark stay. */
const REDRAWN: GenLayer[] = ["roads", "buildings", "vegetation", "props"];

export function mapScore(bake: WorldBake, spec?: WorldSpec): number {
  return reviewWhole(bake, spec).score;
}

/** The layers behind what costs the map most: a wood that reads badly is planted again, the town beside it is not touched. */
export function layersToRedraw(report: CriticReport): GenLayer[][] {
  const cost = new Map<string, { layers: GenLayer[]; n: number }>();
  for (const p of report.problems) {
    const layers = p.layers.filter((l) => REDRAWN.includes(l));
    if (layers.length === 0) continue;
    // what hangs on the streets follows them
    const set = layers.includes("roads") || layers.includes("buildings") ? REDRAWN : layers.includes("vegetation") ? (["vegetation", "props"] as GenLayer[]) : layers;
    const k = set.join();
    const e = cost.get(k) ?? { layers: set, n: 0 };
    e.n += p.severity === "high" ? 4 : p.severity === "medium" ? 2 : 0.5;
    cost.set(k, e);
  }
  return [...cost.values()].sort((a, b) => b.n - a.n).map((e) => e.layers);
}

/** Applies the corrections that only touch placements. Returns how many were applied; locked placements are left alone. */
export function applyLevelFixes(bake: WorldBake, problems: LevelProblem[], demolish = false): number {
  let n = 0;
  const gone = new Set<string>();
  for (const { fix } of problems) {
    if (!fix) continue;
    if (fix.type === "move_building" && demolish) {
      // a home drawn into another one, or onto the road, is worth less than the room it takes
      const p = bake.placements.find((q) => q.id === fix.id);
      if (!p || p.locked || gone.has(p.id) || !/^(house|cottage|shop|apartment)/.test(p.prefab) || fix.reason === "far from the road") continue;
      gone.add(p.id);
      n++;
      continue;
    }
    if (fix.type !== "turn_building" && fix.type !== "remove_placement") continue;
    const p = bake.placements.find((q) => q.id === fix.id);
    if (!p || p.locked || gone.has(p.id)) continue;
    if (fix.type === "turn_building") p.rotationY = fix.rotationY;
    else if (p.category === "prop" || p.category === "vegetation" || p.category === "rock") gone.add(p.id);
    else continue;
    n++;
  }
  if (gone.size > 0) bake.placements = bake.placements.filter((p) => !gone.has(p.id));
  return n;
}

const copy = (bake: WorldBake): WorldBake => ({ ...bake, placements: bake.placements.map((p) => ({ ...p, position: [p.position[0], p.position[1], p.position[2]] })) });

export function improveWorld(spec: WorldSpec, style: StyleBible, first: WorldBake, options: ImproveOptions = {}): ImproveResult {
  const target = options.target ?? 94;
  const steps: ImproveStep[] = [];
  const before = mapScore(first, spec);
  let best = first;
  let score = before;
  const correct = (bake: WorldBake, from: number): { bake: WorldBake; score: number } => {
    let now = { bake, score: from };
    for (const demolish of [false, true]) {
      const trial = copy(now.bake);
      const n = applyLevelFixes(trial, reviewLevelDesign(trial).problems, demolish);
      if (n === 0) continue;
      const s = mapScore(trial, spec);
      steps.push({ action: `${n} local corrections${demolish ? " (overlapping homes removed)" : ""}`, score: s, kept: s > now.score });
      if (s > now.score) now = { bake: trial, score: s };
    }
    return now;
  };
  ({ bake: best, score } = correct(best, score));
  const asked = layersToRedraw(reviewWhole(best, spec));
  // on a large world a redraw is minutes of work: one at most, and only where something is wrong
  const heavy = first.stats.generationMs > 15_000;
  for (let k = 0; k < (heavy ? 0 : (options.redraws ?? 2)) && score < target; k++) {
    const layers = (asked[k % Math.max(1, asked.length)] ?? REDRAWN).filter((l) => !spec.locks[l as keyof WorldSpec["locks"]]);
    if (layers.length === 0) continue;
    // drawn from the first bake every time: redrawing a redraw would pile up its levelled ground
    const trial = generateWorld(spec, style, { ...options.generate, previous: first, regenerate: layers, seedOverride: deriveSeed(spec.seed, `redraw-${k}`) });
    trial.meta = { ...trial.meta, seed: spec.seed };
    const fixed = correct(trial, mapScore(trial, spec));
    steps.push({ action: `redraw ${k + 1} of ${layers.join(", ")}`, score: fixed.score, kept: fixed.score > score });
    if (fixed.score > score) {
      best = fixed.bake;
      score = fixed.score;
    }
  }
  return { bake: best, before, after: score, steps };
}
