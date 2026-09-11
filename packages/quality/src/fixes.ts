import { WorldSpecSchema, type QAFix, type WorldSpec } from "@worldforge/core";
import type { GenLayer } from "@worldforge/world-gen";

/**
 * Apply machine-applicable fixes to a WorldSpec.
 * Returns the patched spec and the set of layers that need regeneration.
 */
export function applyFixes(spec: WorldSpec, fixes: QAFix[]): { spec: WorldSpec; regenerate: GenLayer[]; newSeed: boolean; applied: number; skipped: QAFix[] } {
  const draft: Record<string, unknown> = JSON.parse(JSON.stringify(spec));
  const layers = new Set<GenLayer>();
  let newSeed = false;
  let applied = 0;
  const skipped: QAFix[] = [];
  for (const f of fixes) {
    if (f.type === "spec_patch") {
      if (patch(draft, f.path, f.op, f.value)) {
        applied++;
        for (const l of layersForPath(f.path)) layers.add(l);
      } else skipped.push(f);
    } else if (f.type === "regenerate") {
      for (const l of f.layers) if (isLayer(l)) layers.add(l);
      if (f.newSeed) newSeed = true;
      applied++;
    } else skipped.push(f);
  }
  const parsed = WorldSpecSchema.safeParse(draft);
  return { spec: parsed.success ? parsed.data : spec, regenerate: [...layers], newSeed, applied, skipped };
}

const LAYER_SET: GenLayer[] = ["terrain", "water", "roads", "landmarks", "buildings", "vegetation", "props", "lighting"];
function isLayer(l: string): l is GenLayer {
  return (LAYER_SET as string[]).includes(l);
}

function layersForPath(path: string): GenLayer[] {
  const root = path.split(".")[0] ?? "";
  switch (root) {
    case "terrain":
    case "size":
    case "biomes":
      return ["terrain", "water", "roads", "landmarks", "buildings", "vegetation", "props"];
    case "rivers":
    case "lakes":
      return ["water", "roads", "buildings", "vegetation", "props"];
    case "roads":
      return ["roads", "buildings", "vegetation", "props"];
    case "landmarks":
      return ["landmarks", "roads", "buildings", "vegetation", "props"];
    case "settlements":
      return ["buildings", "vegetation", "props"];
    case "vegetation":
      return ["vegetation"];
    case "props":
      return ["props"];
    case "lighting":
    case "atmosphere":
    case "colorPalette":
      return ["lighting"];
    default:
      return [];
  }
}

function patch(obj: Record<string, unknown>, path: string, op: "set" | "add" | "remove", value: unknown): boolean {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur !== "object" || cur === null) return false;
    cur = (cur as Record<string, unknown>)[parts[i]!];
  }
  if (typeof cur !== "object" || cur === null) return false;
  const key = parts[parts.length - 1]!;
  const target = cur as Record<string, unknown>;
  if (op === "set") {
    target[key] = value;
    return true;
  }
  if (op === "add") {
    const arr = target[key];
    if (!Array.isArray(arr)) {
      target[key] = [value];
      return true;
    }
    if (arr.some((v) => JSON.stringify(v) === JSON.stringify(value))) return true;
    arr.push(value);
    return true;
  }
  if (op === "remove") {
    const arr = target[key];
    if (Array.isArray(arr)) {
      target[key] = arr.filter((v) => JSON.stringify(v) !== JSON.stringify(value) && (typeof v !== "object" || v === null || (v as { id?: unknown }).id !== value));
      return true;
    }
    delete target[key];
    return true;
  }
  return false;
}
