import type { Vec2, WorldBake, WorldSpec } from "@worldforge/core";
import type { GenLayer } from "@worldforge/world-gen";
import { reviewIntent } from "./intent";
import { reviewLevelDesign } from "./level-design";
import { reviewTraversal } from "./traversal";
import { reviewWorld } from "./world-review";

/**
 * The critic of a finished world: five dimensions, each measured on the map, plus the promise of the request. Every
 * problem says where it is and which layer of the generator can repair it, so a correction never redraws what was good.
 */
export const WORLD_DIMENSIONS = ["geographic", "architectural", "level_design", "visual", "technical"] as const;
export type WorldDimension = (typeof WORLD_DIMENSIONS)[number];
export const DIMENSION_WEIGHTS: Record<WorldDimension, number> = { geographic: 0.2, architectural: 0.22, level_design: 0.28, visual: 0.18, technical: 0.12 };
/** How much the promise of the request weighs against how well the map is made. */
export const INTENT_WEIGHT = 0.25;

export interface CriticProblem {
  dimension: WorldDimension | "intent";
  id: string;
  severity: "low" | "medium" | "high";
  message: string;
  position?: Vec2;
  placement?: string;
  /** The layers that can repair it. */
  layers: GenLayer[];
}

export interface CriticReport {
  score: number;
  dimensions: Record<WorldDimension, number>;
  intent: number;
  problems: CriticProblem[];
  metrics: Record<string, number>;
}

const STREETS: GenLayer[] = ["roads", "buildings"];
const GREEN: GenLayer[] = ["vegetation", "props"];
const GROUND: GenLayer[] = ["terrain", "water"];
const LAYERS: Record<string, GenLayer[]> = {
  landmark_in_hollow: ["landmarks"], lighthouse_inland: ["landmarks"], settlement_on_steep_ground: STREETS, building_in_water: STREETS,
  steep_roads: ["roads"], dead_end: ["roads"], no_roads: ["roads"], poi_unreached: ["roads"], unconnected_place: ["roads"], no_alternative_route: ["roads"],
  view_blocked: GREEN, target_hidden: GREEN, even_forest: GREEN, uniform_forest: GREEN, scattered_trees: GREEN, no_negative_space: GREEN, no_rhythm: GREEN, isolated_rocks: ["props"], open_border: GREEN,
  swim_only: ["roads"], unreachable: ["roads", "landmarks"], spawn_trapped: GROUND,
};

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const round = (v: number) => Math.round(v * 10) / 10;

/** The budget of a Roblox place on a phone: parts, meshes alive at once, what was cut to fit. */
function technical(bake: WorldBake, add: (p: CriticProblem) => void): number {
  const s = bake.stats;
  let score = 100;
  const note = (id: string, cost: number, message: string, layers: GenLayer[]) => {
    score -= cost;
    add({ dimension: "technical", id, severity: cost > 20 ? "high" : cost > 8 ? "medium" : "low", message, layers });
  };
  const t = bake.terrain;
  // what is streamed at once depends on the density, what is held in memory on the total
  const limit = Math.round(48_000 * Math.max(0.4, Math.min(1.6, (t.width * t.depth * t.cellSize * t.cellSize) / 1024 / 1024)));
  if (s.partsEstimate > limit) note("too_many_parts", Math.min(60, 10 + (s.partsEstimate - limit) / 400), `about ${s.partsEstimate} parts, ${limit} at most`, GREEN);
  for (const [k, b] of Object.entries(s.budgets)) if (b.max > 0 && b.trimmed > b.max * 0.35) note("budget_cut", Math.min(14, (b.trimmed / b.max) * 10), `${b.trimmed} ${k} had to be dropped to fit the budget`, GREEN);
  const kinds = new Set(bake.placements.map((p) => `${p.prefab}/${p.variant}`)).size;
  if (kinds > 420) note("many_models", Math.min(20, (kinds - 420) / 12), `${kinds} different models: few instances are shared`, ["buildings"]);
  // crowding: the streaming radius of a phone holds so much
  const cell = 128;
  const w = Math.ceil((t.width * t.cellSize) / cell);
  const heap = new Map<number, number>();
  for (const p of bake.placements) {
    const n = bake.prefabs[p.prefab]?.[p.variant]?.parts.length ?? 1;
    const k = Math.floor((p.position[2] - t.origin[1]) / cell) * w + Math.floor((p.position[0] - t.origin[0]) / cell);
    heap.set(k, (heap.get(k) ?? 0) + n);
  }
  const worst = Math.max(0, ...heap.values());
  if (worst > 6500) note("crowded_cell", Math.min(25, (worst - 6500) / 250), `${worst} parts within 128 studs`, ["buildings"]);
  const ids = new Set<string>();
  let twins = 0;
  for (const p of bake.placements) {
    if (ids.has(p.id)) twins++;
    ids.add(p.id);
  }
  if (twins > 0) note("duplicate_ids", Math.min(20, twins), `${twins} placements share an id`, ["buildings"]);
  return clamp(score);
}

export function reviewWhole(bake: WorldBake, spec?: WorldSpec): CriticReport {
  const level = reviewLevelDesign(bake);
  const world = reviewWorld(bake);
  const walk = reviewTraversal(bake);
  const intent = spec ? reviewIntent(bake, spec) : { score: 100, met: [], missing: [] };
  const problems: CriticProblem[] = [];
  const DIM: Record<string, WorldDimension> = { geography: "geographic", relief: "geographic", urban: "architectural", architecture: "architectural", roads: "level_design", player: "level_design", composition: "visual", environment: "visual" };
  for (const p of level.problems) problems.push({ dimension: DIM[p.criterion]!, id: p.id, severity: p.severity, message: p.message, ...(p.position ? { position: p.position } : {}), ...(p.placement ? { placement: p.placement } : {}), layers: LAYERS[p.id] ?? STREETS });
  for (const p of world.problems) problems.push({ dimension: p.scale === "aerial" ? "visual" : p.scale === "mid" ? "geographic" : "level_design", id: p.id, severity: p.severity, message: p.message, ...(p.position ? { position: p.position } : {}), layers: LAYERS[p.id] ?? STREETS });
  for (const p of walk.problems) problems.push({ dimension: "level_design", id: p.id, severity: p.severity, message: p.message, ...(p.position ? { position: p.position } : {}), layers: LAYERS[p.id] ?? STREETS });
  for (const m of intent.missing) problems.push({ dimension: "intent", id: "missing", severity: "high", message: `${m.label}: ${m.found} of ${m.wanted}`, layers: STREETS });
  const c = level.criteria;
  const dimensions: Record<WorldDimension, number> = {
    geographic: round(c.geography * 0.4 + c.relief * 0.35 + world.scales.mid * 0.25),
    architectural: round(c.urban * 0.45 + c.architecture * 0.55),
    level_design: round(c.player * 0.22 + c.roads * 0.18 + world.scales.ground * 0.2 + walk.score * 0.4),
    visual: round(c.composition * 0.3 + c.environment * 0.15 + world.scales.aerial * 0.55),
    technical: round(technical(bake, (p) => problems.push(p))),
  };
  const made = WORLD_DIMENSIONS.reduce((s, k) => s + dimensions[k] * DIMENSION_WEIGHTS[k], 0);
  const order = { high: 0, medium: 1, low: 2 };
  problems.sort((a, b) => order[a.severity] - order[b.severity]);
  return { score: round(made * (1 - INTENT_WEIGHT) + intent.score * INTENT_WEIGHT), dimensions, intent: intent.score, problems, metrics: { ...level.metrics, ...world.metrics, ...walk.metrics } };
}
