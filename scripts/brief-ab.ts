/**
 * Does the hidden brief make better maps? Runs the World agent (Claude Code, your account) twice on a fresh
 * project for the same request, without then with the brief, and scores both worlds with the critic.
 *
 *   npx tsx scripts/brief-ab.ts "fait moi un village" [--model sonnet] [--runs 3] [--out demo-output/brief-ab]
 *
 * Then look at them: npx tsx scripts/preview-map.ts --spec <out>/<arm>/worlds/main/world.spec.json
 * One run per arm is an anecdote, not a measure: use --runs 3 or more (each run draws a new brief).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { WorldSpecSchema, getStylePreset, newId, slugify, type WorldSpec } from "@worldforge/core";
import { generateWorld } from "@worldforge/world-gen";
import { critiqueBake, measureFirstView } from "@worldforge/quality";
import { scaffoldProjectFiles } from "@worldforge/roblox-export";
import { Orchestrator, ROLES, createProviders, enhancePrompt, planWorldOnly, type FileIO } from "@worldforge/agents";
import { createNodeProcessRunner } from "@worldforge/agents/node";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const request = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!request) {
  console.error('usage: npx tsx scripts/brief-ab.ts "<request>" [--model sonnet] [--out dir]');
  process.exit(1);
}
const model = flag("--model") ?? "sonnet";
const runs = Math.max(1, Number(flag("--runs") ?? 1));
const outDir = resolve(flag("--out") ?? join("demo-output", "brief-ab", slugify(request)));

// npm's claude.cmd shim goes through cmd.exe, which mangles multi-line arguments: run the real exe
const claudeBin = join(process.env.APPDATA ?? "", "npm", "node_modules", "@anthropic-ai", "claude-code", "bin");
if (process.platform === "win32" && existsSync(join(claudeBin, "claude.exe"))) process.env.PATH = `${claudeBin};${process.env.PATH ?? ""}`;

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
const claude = createProviders({ runner: createNodeProcessRunner(), files, homeDir: homedir() }).get("claude-code")!;

function summarize(spec: WorldSpec) {
  const style = getStylePreset(spec.stylePreset);
  const bake = generateWorld(spec, style);
  const report = critiqueBake(bake, spec, style);
  const view = measureFirstView(bake);
  return {
    score: report.score,
    openness: view.openness,
    targetVisible: view.targetVisible,
    dressing: view.dressing,
    scores: report.scores,
    problems: report.problems.map((p) => p.message),
    style: spec.stylePreset,
    layout: spec.layout.archetype,
    mood: spec.lighting.mood,
    landmarks: spec.landmarks.map((l) => `${l.type}${l.role === "focal" ? " (focal)" : ""}`),
    settlements: spec.settlements.map((s) => `${s.type} ×${s.buildings}`),
    terrain: spec.terrain.features.map((f) => f.type),
    water: { rivers: spec.rivers.length, lakes: spec.lakes.length },
    placements: bake.placements.length,
  };
}

async function runArm(name: string, brief: string | undefined, run: number) {
  const dir = join(outDir, `run-${run}`, name);
  rmSync(dir, { recursive: true, force: true });
  for (const f of scaffoldProjectFiles({ projectName: "Brief AB", projectId: newId("prj"), stylePreset: "stylized_mystical" })) await files.writeText(join(dir, f.path), f.content);
  const plan = planWorldOnly(request!);
  plan.brief = brief;
  const tools: string[] = [];
  const started = Date.now();
  const orchestrator = new Orchestrator({
    files,
    projectDir: dir,
    projectName: "Brief AB",
    acquireSession: async (task) => ({ provider: claude, session: await claude.startSession({ cwd: dir, model, permissionMode: "acceptEdits", role: task.role, systemPrompt: ROLES[task.role].systemPrompt, allowedTools: ROLES[task.role].allowedTools }) }),
    onEvent: (e) => {
      if (e.type === "agent" && e.event.type === "tool_use") tools.push(e.event.name);
      if (e.type === "agent" && e.event.type === "error") console.log(`  [${name}] error: ${e.event.message.slice(0, 200)}`);
      if (e.type === "task") console.log(`  [${name}] ${e.task.role}: ${e.task.status}${e.task.error ? ` — ${e.task.error.slice(0, 160)}` : ""}`);
      if (e.type === "log") console.log(`  [${name}] ${e.message.slice(0, 200)}`);
    },
    bakeCheck: async (spec) => void generateWorld({ ...spec, size: { width: 512, depth: 512 } }, getStylePreset(spec.stylePreset)),
  });
  const done = await orchestrator.run(plan);
  const specPath = join(dir, "worlds", "main", "world.spec.json");
  const parsed = existsSync(specPath) ? WorldSpecSchema.safeParse(JSON.parse(readFileSync(specPath, "utf8"))) : null;
  return {
    arm: name,
    status: done.tasks[0]!.status,
    minutes: +((Date.now() - started) / 60000).toFixed(1),
    tools: tools.length,
    specPath,
    world: parsed?.success ? summarize(parsed.data) : null,
  };
}

void (async () => {
  mkdirSync(outDir, { recursive: true });
  console.log(`▶ "${request}" — World agent: claude ${model}, ${runs} run(s) per arm`);
  const results = [];
  for (let run = 1; run <= runs; run++) {
    const enhanced = await enhancePrompt(request, { provider: claude, cwd: tmpdir() });
    console.log(`  run ${run}, brief: ${enhanced.source}${enhanced.reason ? ` (${enhanced.reason})` : ""}`);
    mkdirSync(join(outDir, `run-${run}`), { recursive: true });
    writeFileSync(join(outDir, `run-${run}`, "brief.txt"), enhanced.brief ?? "(none)");
    results.push({ run, briefSource: enhanced.source, arm: await runArm("sans-brief", undefined, run) }, { run, briefSource: enhanced.source, arm: await runArm("avec-brief", enhanced.brief, run) });
  }
  writeFileSync(join(outDir, "results.json"), JSON.stringify({ request, model, runs, results }, null, 2));
  for (const name of ["sans-brief", "avec-brief"]) {
    const arms = results.map((r) => r.arm).filter((a) => a.arm === name);
    const worlds = arms.flatMap((a) => (a.world ? [a.world] : []));
    const mean = (f: (w: (typeof worlds)[number]) => number) => (worlds.length ? worlds.reduce((s, w) => s + f(w), 0) / worlds.length : 0);
    console.log(`
${name}: ${worlds.length}/${arms.length} worlds, score ${mean((w) => w.score).toFixed(1)} (${worlds.map((w) => w.score).join(", ")}), view ${(mean((w) => w.openness) * 100).toFixed(0)}% open, target seen ${worlds.filter((w) => w.targetVisible).length}/${worlds.length}, dressing ${mean((w) => w.dressing).toFixed(0)}, problems ${worlds.reduce((s, w) => s + w.problems.length, 0)}`);
    console.log(`  styles ${worlds.map((w) => w.style).join(", ")} | focal ${worlds.map((w) => w.landmarks.find((l) => l.includes("focal"))?.split(" ")[0] ?? "-").join(", ")} | mood ${worlds.map((w) => w.mood).join(", ")}`);
  }
  console.log(`
→ ${join(outDir, "results.json")}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
