/**
 * Generates a world and writes it as a Roblox place, the way the app exports it (Rojo, chunks and all).
 *   npx tsx scripts/export-place.ts "<prompt>" [--size 4096] [--project demo-output/compile-check] [--out demo-output/place.rbxl] [--detail balanced]
 * Run `rbxtsc` in the project first.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { interpretPrompt } from "../packages/agents/src/local/interpreter";
import { STYLE_FAMILY_INDEX, StyleBibleSchema, measureCapacity, styleFamilyToBible, type DetailProfile } from "../packages/core/src";
import { exportWorldFiles } from "../packages/roblox-export/src";
import { generateWorld } from "../packages/world-gen/src";

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1]! : d);
const prompt = args[0]!;
const project = resolve(opt("--project", "demo-output/compile-check"));
const out = resolve(opt("--out", "demo-output/place.rbxl"));
const rojo = process.env.ROJO ?? [join(process.env.LOCALAPPDATA ?? "", "rojo", "rojo.exe"), join(process.env.LOCALAPPDATA ?? "", "WorldForge", "tools", "rojo", "rojo.exe")].find((p) => existsSync(p)) ?? "rojo";

const { spec } = interpretPrompt(prompt);
const size = Number(opt("--size", "0"));
if (size) spec.size.width = spec.size.depth = size;
spec.detail = opt("--detail", "balanced") as DetailProfile;
spec.terrain.groundMode = opt("--ground", "voxels") as "voxels" | "parts";
const style = StyleBibleSchema.parse(styleFamilyToBible(STYLE_FAMILY_INDEX[spec.stylePreset]!));
const t0 = Date.now();
const bake = generateWorld(spec, style);
console.log(`generated ${spec.size.width} studs in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const c = measureCapacity(bake);
console.log(JSON.stringify({ models: c.models, partsTotal: c.partsTotal, partsServer: c.partsServer, partsAround: c.partsAround, memoryMb: c.memoryMb, exportMb: c.exportMb, chunks: c.chunks, advice: c.advice.map((a) => a.message) }, null, 1));
rmSync(join(project, "assets", "world-chunks"), { recursive: true, force: true });
rmSync(join(project, "assets", "world"), { recursive: true, force: true });
mkdirSync(join(project, "assets", "materials"), { recursive: true });
const files = [...exportWorldFiles({ bake, spec, style, projectSlug: "place" })];
for (const f of files) {
  if (f.path.startsWith("assets/meshes")) continue;
  const p = join(project, f.path);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, f.content);
}
console.log(`${files.length} files, ${(files.reduce((n, f) => n + f.content.length, 0) / 1e6).toFixed(1)} MB`);
execFileSync(rojo, ["build", "-o", out], { cwd: project, stdio: "inherit" });
