/**
 * Demo: any prompt → complete Roblox project (world + genre systems), with the local interpreter.
 *
 *   npx tsx scripts/demo-prompt.ts "un obby cartoon avec 20 stages"
 *   npx tsx scripts/demo-prompt.ts "survie zombie, village avec intérieurs, avion crashé" --build
 *   npx tsx scripts/demo-prompt.ts "..." --build --open --size 768 --out demo-output/my_game
 */
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getStylePreset, newId, slugify } from "@worldforge/core";
import { generateWorld } from "@worldforge/world-gen";
import { buildGameFiles, exportWorldFiles, prefabToRbxmx, scaffoldProjectFiles } from "@worldforge/roblox-export";
import { buildConfigTs, interpretPrompt } from "@worldforge/agents";
import { critiqueBake } from "@worldforge/quality";
import { buildTexturesTs, generateTextureSet, materialOverrides } from "@worldforge/textures";

const args = process.argv.slice(2);
const prompt = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1]?.startsWith("--") !== true) ?? "un village mystérieux dans la forêt";
const flag = (f: string) => args.includes(f);
const opt = (name: string, def: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const { spec: spec0, game, detected } = interpretPrompt(prompt);
const size = Number(opt("--size", "0"));
const spec = size > 0 ? { ...spec0, size: { width: size, depth: size } } : spec0;
const style = getStylePreset(spec.stylePreset);
const slug = slugify(spec.name);
const outDir = resolve(opt("--out", join(root, "demo-output", slug)));
console.log(`▶ "${prompt}"`);
console.log(`  detected: ${detected.join(", ")}`);
console.log(`  genre ${game.genre} · style ${spec.stylePreset} · layout ${spec.layout.archetype} · settlements ${spec.settlements.map((s) => `${s.type}(${s.buildings})`).join(",") || "-"} · landmarks ${spec.landmarks.map((l) => l.type).join(",")}`);
console.log(`  systems: ${game.systems.map((s) => s.id).join(", ")}`);

const t0 = Date.now();
const bake = generateWorld(spec, style, { version: "v0.1" });
console.log(`✓ world generated in ${Date.now() - t0} ms — placements ${JSON.stringify(bake.stats.counts)}, parts ≈ ${bake.stats.partsEstimate}, gameplay zones ${bake.zones.filter((z) => z.kind === "gameplay").length}`);
const report = critiqueBake(bake, spec, style);
console.log(`  quality ${report.score}/100 ${report.problems.map((p) => `[${p.severity}] ${p.message}`).join(" | ")}`);

void (async () => {
const textures = flag("--no-textures") ? null : await generateTextureSet(style, bake.meta.seed, { size: 256 });
if (textures) console.log(`✓ ${textures.manifest.entries.length} textures generated (${textures.manifest.size}px; upload them from the app to get MaterialVariants)`);

const projectName = spec.name;
const files = [
  ...scaffoldProjectFiles({ projectName, projectId: newId("prj"), stylePreset: spec.stylePreset }),
  ...exportWorldFiles({ bake, spec, style, projectSlug: slug, materialOverrides: materialOverrides(textures?.manifest ?? null) }),
  ...buildGameFiles(game),
  { path: "src/shared/config.ts", content: buildConfigTs(game) },
  { path: "design/game.spec.json", content: JSON.stringify(game, null, 2) },
  ...(textures ? [{ path: "design/textures.manifest.json", content: JSON.stringify(textures.manifest, null, 2) }, { path: "src/shared/textures.ts", content: buildTexturesTs(textures.manifest) }] : []),
];
for (const f of files) {
  const full = join(outDir, f.path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, f.content, "utf8");
}
for (const f of textures?.files ?? []) {
  const full = join(outDir, f.path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, f.bytes);
}
const modelsDir = join(outDir, "assets", "models");
mkdirSync(modelsDir, { recursive: true });
for (const [prefab, variants] of Object.entries(bake.prefabs)) for (const v of variants) writeFileSync(join(modelsDir, `${prefab}_${v.id.split("/")[1]}.rbxmx`), prefabToRbxmx(v), "utf8");
mkdirSync(join(outDir, "qa"), { recursive: true });
writeFileSync(join(outDir, "qa", "report.json"), JSON.stringify(report, null, 2));
console.log(`✓ project written to ${outDir}`);

if (flag("--build")) {
  const run = (cmd: string, cwd = outDir) => {
    console.log(`\n$ ${cmd}`);
    execSync(cmd, { cwd, stdio: "inherit", shell: process.platform === "win32" ? "cmd.exe" : undefined });
  };
  if (!existsSync(join(outDir, "node_modules"))) run("npm install --no-audit --no-fund");
  // rbxtsc reports type errors but still exits 0 (and leaves stale .luau behind): fail loudly instead
  console.log("\n$ npx rbxtsc");
  const tsc = execSync("npx rbxtsc", { cwd: outDir, encoding: "utf8", shell: process.platform === "win32" ? "cmd.exe" : undefined, stdio: ["ignore", "pipe", "pipe"] });
  if (/error TS\d+/.test(tsc)) {
    console.error(tsc);
    throw new Error("rbxtsc reported errors — the template does not compile");
  }
  mkdirSync(join(outDir, "build"), { recursive: true });
  run(`"${findRojo()}" build -o build/${slug}.rbxl`);
  console.log(`✓ built build/${slug}.rbxl`);
  if (flag("--open")) {
    const studio = findStudio();
    if (studio) spawn(studio, [join(outDir, "build", `${slug}.rbxl`)], { detached: true, stdio: "ignore" }).unref();
  }
}
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

function findRojo(): string {
  const candidates = [join(process.env.LOCALAPPDATA ?? "", "WorldForge", "tools", "rojo", "rojo.exe"), join(process.env.HOME ?? process.env.USERPROFILE ?? "", ".rokit", "bin", "rojo.exe"), join(process.env.HOME ?? process.env.USERPROFILE ?? "", ".aftman", "bin", "rojo.exe")];
  for (const c of candidates) if (existsSync(c)) return c;
  return "rojo";
}
function findStudio(): string | null {
  if (process.platform !== "win32") return null;
  const versions = join(process.env.LOCALAPPDATA ?? "", "Roblox", "Versions");
  if (!existsSync(versions)) return null;
  for (const v of readdirSync(versions)) {
    const exe = join(versions, v, "RobloxStudioBeta.exe");
    if (existsSync(exe)) return exe;
  }
  return null;
}
