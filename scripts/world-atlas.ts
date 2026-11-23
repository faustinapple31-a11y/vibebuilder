/**
 * World composition benchmark: eight worlds, several seeds, an aerial capture of each and the multi-scale review.
 *   npx tsx scripts/world-atlas.ts --out demo-output/atlas [--seeds 2] [--mode voxels|parts] [--only 0,3] [--compare demo-output/atlas0/atlas.json]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { interpretPrompt } from "../packages/agents/src/local/interpreter";
import { STYLE_FAMILY_INDEX, StyleBibleSchema, styleFamilyToBible } from "../packages/core/src";
import { aerialPixels, reviewWorld } from "../packages/quality/src";
import { encodePng } from "../packages/textures/src";
import { generateWorld } from "../packages/world-gen/src";

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1]! : d);
export const WORLDS = [
  ["village", "un petit village médiéval"],
  ["bourg", "un grand bourg médiéval avec un château"],
  ["montagne", "un monde fantasy montagneux avec un village"],
  ["ville", "une ville moderne dense"],
  ["cote", "une ville côtière avec un port de pêche"],
  ["foret", "une grande carte de survie en forêt"],
  ["base", "une base militaire"],
  ["desert", "un village dans le désert avec une oasis"],
] as const;
const out = opt("--out", "demo-output/atlas");
mkdirSync(out, { recursive: true });
const seeds = Number(opt("--seeds", "2"));
const only = opt("--only", "").split(",").filter(Boolean).map(Number);
const before = existsSync(opt("--compare", "")) ? (JSON.parse(readFileSync(opt("--compare", ""), "utf8")) as Row[]) : [];
interface Row {
  id: string;
  score: number;
  aerial: number;
  mid: number;
  ground: number;
  metrics: Record<string, number>;
  problems: string[];
}
const rows: Row[] = [];
async function main() {
for (const [i, [name, prompt]] of WORLDS.entries()) {
  if (only.length && !only.includes(i)) continue;
  for (let s = 0; s < seeds; s++) {
    const { spec } = interpretPrompt(prompt);
    spec.seed = (spec.seed + s * 7919) % 4294967295;
    spec.terrain.groundMode = opt("--mode", "voxels") as "voxels" | "parts";
    const style = StyleBibleSchema.parse(styleFamilyToBible(STYLE_FAMILY_INDEX[spec.stylePreset] ?? STYLE_FAMILY_INDEX.stylized_mystical!));
    const t0 = Date.now();
    const bake = generateWorld(spec, style);
    const ms = Date.now() - t0;
    const r = reviewWorld(bake);
    const id = `${name}_${s}`;
    const img = aerialPixels(bake, 900);
    writeFileSync(join(out, `${id}.png`), await encodePng(img.width, img.height, img.data, 3, (d) => new Uint8Array(deflateSync(d))));
    rows.push({ id, score: r.score, ...r.scales, metrics: r.metrics, problems: r.problems.map((p) => p.id) });
    const old = before.find((b) => b.id === id);
    console.log(`${id.padEnd(12)} ${r.score.toFixed(1)}${old ? ` (${(r.score - old.score >= 0 ? "+" : "") + (r.score - old.score).toFixed(1)})` : ""}  air ${r.scales.aerial} mid ${r.scales.mid} ground ${r.scales.ground}  ${bake.placements.length} pl ${ms} ms ${spec.size.width} | ${r.problems.map((p) => p.id).join(" ")}`);
  }
}
const avg = (f: (r: Row) => number) => (rows.reduce((s, r) => s + f(r), 0) / rows.length).toFixed(1);
console.log(`mean ${avg((r) => r.score)}  air ${avg((r) => r.aerial)} mid ${avg((r) => r.mid)} ground ${avg((r) => r.ground)}  forest ${avg((r) => r.metrics.forestVariation ?? 1)} mass ${avg((r) => r.metrics.forestMass ?? 1)} open ${avg((r) => r.metrics.openShare ?? 0)} share ${avg((r) => (r.metrics.settlementShare ?? 0) * 100)}% bump ${avg((r) => r.metrics.bumpiness ?? 0)} border ${avg((r) => r.metrics.closedBorder ?? 0)}`);
writeFileSync(join(out, "atlas.json"), JSON.stringify(rows, null, 1));
}
void main();
