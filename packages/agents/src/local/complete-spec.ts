import { WorldSpecSchema, type Expectation, type WorldSpec } from "@worldforge/core";
import { interpretPrompt } from "./interpreter";

/**
 * A world written by a model says what it looks like, rarely how it is planned. Without its design plan the generator
 * builds no quarter, no hospital, no country round the town: the plan is read from the request, checked against what the
 * model really wrote, and the size the request asks for is given back when the model fell back on a small default.
 */
export function completeSpec(spec: WorldSpec, request: string, previous?: WorldSpec | null): WorldSpec {
  if (spec.design) return spec;
  // a plan lost on the way is put back
  if (previous?.design) return WorldSpecSchema.parse({ ...spec, design: previous.design, detail: previous.detail });
  // an older world that never had a plan keeps being built the way it was
  if (previous) return spec;
  const wanted = interpretPrompt(request).spec;
  const plan = wanted.design;
  if (!plan) return spec;
  const placed = spec.settlements.some((s) => s.position) || spec.terrain.features.some((f) => f.type === "archipelago");
  const grown = !placed && spec.size.width <= 2048 && wanted.size.width > spec.size.width;
  const size = grown ? { ...spec.size, width: wanted.size.width, depth: wanted.size.depth } : spec.size;
  const first = wanted.settlements[0];
  const settlements = spec.settlements.map((s, i) => (grown && i === 0 && first && first.type === s.type && first.buildings > s.buildings ? { ...s, buildings: first.buildings } : s));
  const expects: Expectation[] = [{ kind: "style", any: [spec.stylePreset], min: 1, label: `the ${spec.stylePreset} style` }];
  const n = settlements[0]?.buildings ?? 0;
  if (n > 0) expects.push({ kind: "buildings", any: [], min: Math.max(1, Math.round(n * 0.7)), label: `about ${n} buildings` });
  if (settlements.length > 1) expects.push({ kind: "settlements", any: [], min: settlements.length, label: `${settlements.length} places to live` });
  for (const l of spec.landmarks.filter((q) => q.role !== "hidden").slice(0, 4)) expects.push({ kind: "landmark", any: [l.type], min: 1, label: `the ${l.type}` });
  if (spec.rivers.length) expects.push({ kind: "water", any: ["river"], min: 1, label: "a river" });
  if (spec.lakes.length) expects.push({ kind: "water", any: ["lake"], min: 1, label: "a lake" });
  if (spec.terrain.features.some((f) => ["coast", "island", "archipelago"].includes(f.type))) expects.push({ kind: "water", any: ["sea"], min: 1, label: "the sea" });
  const facilities = settlements.length > 0 ? plan.facilities : [];
  if (facilities.length > 0) for (const e of plan.expects) if (e.kind === "facility") expects.push(e);
  return WorldSpecSchema.parse({ ...spec, size, settlements, design: { ...plan, facilities, expects } });
}
