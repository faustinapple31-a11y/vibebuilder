/**
 * Builds a whole world in Blender, region by region, and leaves it ready for Roblox.
 *   npx tsx scripts/blender-world.ts "<prompt>" --out demo-output/bw/village [--size 1024] [--previews] [--only r0_0,r1_0] [--plan-only]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createNodeProcessRunner } from "../packages/agents/src/node-runner";
import { interpretPrompt } from "../packages/agents/src/local/interpreter";
import { planWorld, runBlenderWorld, writePlan, type JobFiles } from "../packages/blender-map/src";
import { STYLE_FAMILY_INDEX, StyleBibleSchema, styleFamilyToBible } from "../packages/core/src";
import { generateWorld } from "../packages/world-gen/src";

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1]! : d);
export const nodeFiles: JobFiles = {
  exists: async (p) => existsSync(p),
  readText: async (p) => readFileSync(p, "utf8"),
  writeText: async (p, t) => writeFileSync(p, t),
  mkdirp: async (p) => void mkdirSync(p, { recursive: true }),
  join: (...p) => join(...p),
};

async function main() {
  const prompt = args[0]!;
  const out = resolve(opt("--out", "demo-output/bw/world"));
  const { spec } = interpretPrompt(prompt);
  const size = Number(opt("--size", "0"));
  if (size) spec.size.width = spec.size.depth = size;
  spec.terrain.groundMode = "voxels";
  const style = StyleBibleSchema.parse(styleFamilyToBible(STYLE_FAMILY_INDEX[spec.stylePreset]!));
  const t0 = Date.now();
  const bake = generateWorld(spec, style);
  const world = planWorld(bake, spec, style, { prompt });
  mkdirSync(out, { recursive: true });
  await writePlan(nodeFiles, out, world);
  console.log(`plan: ${spec.size.width} studs, ${world.plan.regions.length} regions, ${world.plan.kit.length} pieces, ${bake.placements.length} placements, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (args.includes("--plan-only")) return;
  const blender = ["5.3", "5.2", "5.1", "5.0", "4.5"].map((v) => `C:/Program Files/Blender Foundation/Blender ${v}/blender.exe`).find(existsSync);
  if (!blender) throw new Error("Blender not found");
  let last = "";
  const { state, manifest } = await runBlenderWorld(nodeFiles, createNodeProcessRunner(), world.plan, {
    blender,
    python: resolve("packages/blender-map/python"),
    out,
    cache: resolve("demo-output/bw/cache"),
    parallelKit: Number(opt("--kit", "3")),
    parallelRegions: Number(opt("--regions", "2")),
    previews: args.includes("--previews"),
    ...(opt("--only", "") ? { only: opt("--only", "").split(",") } : {}),
    onState: (s) => {
      const line = s.steps.filter((q) => q.status === "done" || q.status === "failed").map((q) => `${q.id}:${q.status}`).join(" ");
      if (line !== last) {
        const fresh = s.steps.filter((q) => (q.status === "done" || q.status === "failed") && !last.includes(`${q.id}:${q.status}`));
        for (const q of fresh) console.log(`  ${q.status === "done" ? "ok" : "FAILED"} ${q.label} ${q.seconds ?? 0}s ${JSON.stringify(q.stats ?? {})} ${q.error ?? ""}`);
        last = line;
      }
    },
  });
  console.log(`${state.status} in ${((Date.now() - t0) / 1000).toFixed(0)} s ${state.blocking.slice(0, 5).join(" | ")}`);
  if (manifest) {
    console.log(JSON.stringify(manifest.totals), manifest.qa.status);
    const n: Record<string, number> = {};
    for (const p of manifest.qa.problems) n[`${p.severity}:${p.id}`] = (n[`${p.severity}:${p.id}`] ?? 0) + 1;
    console.log(n);
    for (const p of manifest.qa.problems.filter((q) => q.severity !== "low").slice(0, 14)) console.log("  ", p.severity, p.id, p.message);
  }
}
if (process.argv[1]?.includes("blender-world")) void main();
