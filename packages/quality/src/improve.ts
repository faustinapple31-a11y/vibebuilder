import { deriveSeed, type StyleBible, type WorldBake, type WorldSpec } from "@worldforge/core";
import { generateWorld, type GenLayer, type GenerateOptions } from "@worldforge/world-gen";
import { reviewLevelDesign, type LevelProblem } from "./level-design";
import { reviewWorld } from "./world-review";

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

export function mapScore(bake: WorldBake): number {
  return Math.round((reviewLevelDesign(bake).score * 0.5 + reviewWorld(bake).score * 0.5) * 10) / 10;
}

/** Applies the corrections that only touch placements. Returns how many were applied; locked placements are left alone. */
export function applyLevelFixes(bake: WorldBake, problems: LevelProblem[]): number {
  let n = 0;
  const gone = new Set<string>();
  for (const { fix } of problems) {
    if (!fix) continue;
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
  const before = mapScore(first);
  let best = first;
  let score = before;
  const correct = (bake: WorldBake, from: number): { bake: WorldBake; score: number } => {
    const trial = copy(bake);
    const n = applyLevelFixes(trial, reviewLevelDesign(trial).problems);
    if (n === 0) return { bake, score: from };
    const s = mapScore(trial);
    steps.push({ action: `${n} local corrections`, score: s, kept: s > from });
    return s > from ? { bake: trial, score: s } : { bake, score: from };
  };
  ({ bake: best, score } = correct(best, score));
  for (let k = 0; k < (options.redraws ?? 2) && score < target; k++) {
    const layers = REDRAWN.filter((l) => !spec.locks[l as keyof WorldSpec["locks"]]);
    if (!layers.includes("buildings") && !layers.includes("vegetation")) break;
    // drawn from the first bake every time: redrawing a redraw would pile up its levelled ground
    const trial = generateWorld(spec, style, { ...options.generate, previous: first, regenerate: layers, seedOverride: deriveSeed(spec.seed, `redraw-${k}`) });
    trial.meta = { ...trial.meta, seed: spec.seed };
    const fixed = correct(trial, mapScore(trial));
    steps.push({ action: `redraw ${k + 1} of ${layers.join(", ")}`, score: fixed.score, kept: fixed.score > score });
    if (fixed.score > score) {
      best = fixed.bake;
      score = fixed.score;
    }
  }
  return { bake: best, before, after: score, steps };
}
