/**
 * Level design audit: the eight scenarios of the spec, several seeds each, judged by `reviewLevelDesign`.
 *   npx tsx scripts/level-design.ts [--seeds 3] [--mode parts|voxels] [--json demo-output/level.json] ["one prompt"]
 */
import { writeFileSync } from "node:fs";
import { interpretPrompt } from "../packages/agents/src/local/interpreter";
import { STYLE_FAMILY_INDEX, StyleBibleSchema, styleFamilyToBible } from "../packages/core/src";
import { LEVEL_CRITERIA, reviewLevelDesign } from "../packages/quality/src";
import { generateWorld } from "../packages/world-gen/src";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
export const SCENARIOS = [
  "un petit village médiéval",
  "une grande ville moderne",
  "une forêt avec beaucoup de relief et un village",
  "une carte de montagne avec un chalet",
  "une carte côtière avec un port de pêche",
  "une carte désertique avec une oasis et un village",
  "une base militaire",
  "un village médiéval très dense avec un château",
];
const one = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const seeds = Number.parseInt(flag("--seeds", "3"), 10);
const mode = flag("--mode", "voxels") as "parts" | "voxels";
const rows: { prompt: string; seed: number; score: number; criteria: Record<string, number>; ms: number; placements: number }[] = [];
const freq = new Map<string, number>();
for (const prompt of one ? [one] : SCENARIOS) {
  const acc: number[] = [];
  const crit: Record<string, number[]> = {};
  for (let s = 0; s < seeds; s++) {
    const { spec } = interpretPrompt(prompt);
    spec.seed = (spec.seed + s * 7919) % 4294967295;
    spec.terrain.groundMode = mode;
    const style = StyleBibleSchema.parse(styleFamilyToBible(STYLE_FAMILY_INDEX[spec.stylePreset] ?? STYLE_FAMILY_INDEX.stylized_mystical!));
    const started = Date.now();
    const bake = generateWorld(spec, style);
    const ms = Date.now() - started;
    const r = reviewLevelDesign(bake);
    acc.push(r.score);
    for (const c of LEVEL_CRITERIA) (crit[c] ??= []).push(r.criteria[c]);
    for (const id of new Set(r.problems.map((p) => `${p.criterion}/${p.id}`))) freq.set(id, (freq.get(id) ?? 0) + 1);
    rows.push({ prompt, seed: spec.seed, score: r.score, criteria: r.criteria, ms, placements: bake.placements.length });
    if (one) for (const p of r.problems) console.log(`  [${p.severity}] ${p.criterion}/${p.id}: ${p.message}`);
  }
  const m = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(0);
  console.log(`${m(acc).padStart(3)} (${Math.min(...acc)}-${Math.max(...acc)})  ${LEVEL_CRITERIA.map((c) => `${c.slice(0, 5)} ${m(crit[c]!).padStart(3)}`).join("  ")}  ${prompt}`);
}
const avg = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
console.log(`\nmean ${avg((r) => r.score).toFixed(1)}  min ${Math.min(...rows.map((r) => r.score))}  | ${LEVEL_CRITERIA.map((c) => `${c} ${avg((r) => r.criteria[c]!).toFixed(0)}`).join("  ")} | ${avg((r) => r.ms).toFixed(0)} ms, ${avg((r) => r.placements).toFixed(0)} placements`);
console.log([...freq].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join("  "));
const json = flag("--json", "");
if (json) writeFileSync(json, JSON.stringify(rows, null, 1));
