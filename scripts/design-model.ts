/**
 * Makes one 3D model the way the app does: hidden brief, hidden references, Blender, GLB and FBX.
 *   npx tsx scripts/design-model.ts "une épée" [--height 8] [--out demo-output/models]
 * Calls Claude Code about four times with your account (Haiku once, Sonnet for the rest).
 * The references stay SVG here: the app rasterizes them to PNG with its webview.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createModel, createProviders, findBlender, type FileIO } from "@worldforge/agents";
import { createNodeProcessRunner } from "@worldforge/agents/node";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const request = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!request) {
  console.error('usage: npx tsx scripts/design-model.ts "<request>" [--height 8] [--out dir]');
  process.exit(1);
}
const files: FileIO = {
  readText: async (p) => readFileSync(p, "utf8"),
  writeText: async (p, c) => {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, c, "utf8");
  },
  exists: async (p) => existsSync(p),
  mkdirp: async (p) => void mkdirSync(p, { recursive: true }),
  join: (...parts) => join(...parts),
};

async function main(): Promise<void> {
  const runner = createNodeProcessRunner();
  const provider = createProviders({ runner, files, homeDir: homedir() }).get("claude-code");
  const blender = await findBlender(runner, files);
  if (!blender) throw new Error("Blender not found");
  const heightStuds = Number.parseFloat(flag("--height", "8"));
  const out = resolve(flag("--out", "demo-output/models")).replace(/\\/g, "/");
  mkdirSync(out, { recursive: true });
  const slug = request!.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "model";
  const job = { glb: `${out}/${slug}.glb`, fbx: `${out}/${slug}.fbx`, preview: `${out}/${slug}.png`, report: `${out}/${slug}.report.json`, palette: `${out}/${slug}_palette.png`, heightStuds, maxTriangles: 20000 };
  const started = Date.now();
  const model = await createModel(request!, { heightStuds }, { provider, cwd: out, runner, files, blender, job, workDir: out, onStep: (s, d) => console.log(`[${Math.round((Date.now() - started) / 1000)}s] ${s}${d ? `: ${d.slice(-200)}` : ""}`) });
  console.log(`\nbrief:\n${model.brief}\n`);
  for (const r of model.references) writeFileSync(`${out}/${slug}_${r.view}.svg`, r.svg);
  writeFileSync(`${out}/${slug}.py`, model.script);
  console.log(`${model.references.length} references, ${model.report.triangles} triangles, size ${model.report.size?.map((n) => n.toFixed(1)).join(" × ")} → ${job.glb}`);
}

void main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
