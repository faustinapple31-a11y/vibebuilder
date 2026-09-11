/**
 * Demo: "Moonlit Forest Village".
 *
 *   npx tsx scripts/demo-moonlit.ts                 # generate world + project files
 *   npx tsx scripts/demo-moonlit.ts --build         # + npm install, rbxtsc, rojo build → .rbxl
 *   npx tsx scripts/demo-moonlit.ts --build --open  # + open the .rbxl in Roblox Studio
 *   npx tsx scripts/demo-moonlit.ts --template sunny_meadow_hamlet
 */
import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getStylePreset, getWorldTemplate, newId, slugify } from "@worldforge/core";
import { generateWorld } from "@worldforge/world-gen";
import { exportWorldFiles, prefabToRbxmx, scaffoldProjectFiles } from "@worldforge/roblox-export";
import { critiqueBake } from "@worldforge/quality";

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const opt = (name: string, def: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : def;
};

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const templateId = opt("--template", "moonlit_forest_village");
const outDir = resolve(opt("--out", join(root, "demo-output", templateId)));

const spec = getWorldTemplate(templateId);
const style = getStylePreset(spec.stylePreset);
console.log(`▶ ${spec.name} — seed ${spec.seed}, ${spec.size.width}×${spec.size.depth} studs, style ${style.name}`);

const t0 = Date.now();
const bake = generateWorld(spec, style, {
  version: "v0.1",
  onProgress: (stage, p) => {
    if (p === 1 || p === 0) process.stdout.write(`\r  ${stage.padEnd(28)} ${(p * 100).toFixed(0)}%   `);
  },
});
console.log(`\n✓ world generated in ${Date.now() - t0} ms`);
console.log(`  placements: ${JSON.stringify(bake.stats.counts)}`);
console.log(`  parts ≈ ${bake.stats.partsEstimate}, layers ${JSON.stringify(bake.stats.layerCounts)}`);
console.log(`  terrain std ${bake.stats.heightStd.toFixed(1)} studs, water ${(bake.stats.waterCoverage * 100).toFixed(1)}%`);
console.log(`  landmarks: ${bake.landmarks.map((l) => `${l.id} (${l.role}, visible from ${l.viewCorridors.filter((c) => c.visible).length}/${l.viewCorridors.length})`).join(", ")}`);

const report = critiqueBake(bake, spec, style);
console.log(`  quality score: ${report.score}/100 ${JSON.stringify(report.scores)}`);
for (const p of report.problems) console.log(`   - [${p.severity}] ${p.message}`);

// ---- write project
const projectName = spec.name;
const slug = slugify(projectName);
const files = [...scaffoldProjectFiles({ projectName, projectId: newId("prj"), stylePreset: spec.stylePreset }), ...exportWorldFiles({ bake, spec, style, projectSlug: slug })];
for (const f of files) {
  const full = join(outDir, f.path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, f.content, "utf8");
}
// prefab library as .rbxmx for the asset browser
const modelsDir = join(outDir, "assets", "models");
mkdirSync(modelsDir, { recursive: true });
let modelCount = 0;
for (const [prefab, variants] of Object.entries(bake.prefabs)) {
  for (const v of variants) {
    writeFileSync(join(modelsDir, `${prefab}_${v.id.split("/")[1]}.rbxmx`), prefabToRbxmx(v), "utf8");
    modelCount++;
  }
}
writeFileSync(join(outDir, "qa", "report.json").replace(/qa[\\/]/, (m) => (mkdirSync(join(outDir, "qa"), { recursive: true }), m)), JSON.stringify(report, null, 2));
console.log(`✓ project written to ${outDir} (${files.length} files, ${modelCount} prefab models)`);

if (flag("--build")) {
  const run = (cmd: string, cwd = outDir) => {
    console.log(`\n$ ${cmd}`);
    execSync(cmd, { cwd, stdio: "inherit", shell: process.platform === "win32" ? "cmd.exe" : undefined });
  };
  if (!existsSync(join(outDir, "node_modules"))) run("npm install --no-audit --no-fund");
  run("npx rbxtsc");
  const rojo = findRojo();
  mkdirSync(join(outDir, "build"), { recursive: true });
  run(`"${rojo}" build -o build/${slug}.rbxl`);
  console.log(`✓ built build/${slug}.rbxl`);
  if (flag("--open")) {
    const rbxl = join(outDir, "build", `${slug}.rbxl`);
    const studio = findStudio();
    if (studio) {
      console.log(`▶ opening in Roblox Studio: ${studio}`);
      spawn(studio, [rbxl], { detached: true, stdio: "ignore" }).unref();
    } else console.log("Roblox Studio not found; open the .rbxl manually.");
  }
}

function findRojo(): string {
  const candidates = [
    join(process.env.LOCALAPPDATA ?? "", "WorldForge", "tools", "rojo", "rojo.exe"),
    join(process.env.HOME ?? process.env.USERPROFILE ?? "", ".rokit", "bin", "rojo.exe"),
    join(process.env.HOME ?? process.env.USERPROFILE ?? "", ".aftman", "bin", "rojo.exe"),
    join(process.env.HOME ?? process.env.USERPROFILE ?? "", ".cargo", "bin", "rojo.exe"),
  ];
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
