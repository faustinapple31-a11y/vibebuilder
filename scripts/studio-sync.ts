/**
 * Writes a generated game as a Roblox place file, without Rojo: the compiled scripts and the bake in one .rbxlx
 * that Studio opens like any place. The bake goes through WorldBuilder's WorldBakeJson chunks.
 *   npx tsx scripts/studio-sync.ts "<prompt>" --project demo-output/compile-check --out demo-output/test.rbxlx
 * Run `rbxtsc` in the project first.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { interpretPrompt } from "../packages/agents/src/local/interpreter";
import { getStylePreset } from "../packages/core/src";
import { exportWorldFiles } from "../packages/roblox-export/src";
import { generateWorld } from "../packages/world-gen/src";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const prompt = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")) ?? "village médiéval dans une forêt avec un château";
const project = resolve(flag("--project", "demo-output/compile-check"));
const output = resolve(flag("--out", "demo-output/test.rbxlx"));
const CHUNK = 150_000;

interface Item {
  /** Path of the parent, "/"-separated from game. */
  parent: string;
  name: string;
  className: "Folder" | "ModuleScript" | "Script" | "LocalScript";
  source?: string;
}

const isCode = (f: string) => f.endsWith(".luau") || f.endsWith(".lua");
const baseName = (f: string) => f.replace(/\.(server|client)?\.?(luau|lua)$/, "").replace(/\.(luau|lua)$/, "");
const classOf = (f: string): Item["className"] => (/\.server\.lua/.test(f) ? "Script" : /\.client\.lua/.test(f) ? "LocalScript" : "ModuleScript");

function hasCode(dir: string): boolean {
  return readdirSync(dir).some((e) => {
    const p = join(dir, e);
    return statSync(p).isDirectory() ? hasCode(p) : isCode(e);
  });
}

/** Mirrors Rojo: `init.*` makes the folder itself a script, other files become children. */
function walk(dir: string, parent: string, name: string, out: Item[]): void {
  const entries = readdirSync(dir);
  const init = entries.find((e) => /^init(\.server|\.client)?\.(luau|lua)$/.test(e));
  out.push(init ? { parent, name, className: classOf(init), source: readFileSync(join(dir, init), "utf8") } : { parent, name, className: "Folder" });
  const self = `${parent}/${name}`;
  for (const e of entries) {
    const p = join(dir, e);
    if (e === init) continue;
    if (statSync(p).isDirectory()) {
      if (hasCode(p)) walk(p, self, e, out);
    } else if (isCode(e)) {
      out.push({ parent: self, name: baseName(e), className: classOf(e), source: readFileSync(p, "utf8") });
    }
  }
}

const items: Item[] = [];
walk(join(project, "include"), "ReplicatedStorage", "rbxts_include", items);
items.push({ parent: "ReplicatedStorage/rbxts_include", name: "node_modules", className: "Folder" });
walk(join(project, "node_modules/@rbxts"), "ReplicatedStorage/rbxts_include/node_modules", "@rbxts", items);
const roots: [string, string, string][] = [
  ["ReplicatedStorage", "TS", "out/shared"],
  ["ServerScriptService", "TS", "out/server"],
  ["ServerScriptService", "World", "out/world"],
  ["ServerScriptService", "Systems", "out/systems"],
  ["StarterPlayer/StarterPlayerScripts", "TS", "out/client"],
  ["StarterPlayer/StarterPlayerScripts", "UI", "out/ui"],
];
for (const [parent, name, path] of roots) if (existsSync(join(project, path))) walk(join(project, path), parent, name, items);

const { spec } = interpretPrompt(prompt);
const style = getStylePreset(spec.stylePreset);
const bake = generateWorld(spec, style);
const file = exportWorldFiles({ bake, spec, style, projectSlug: "studio-sync" }).find((f) => f.path.endsWith("WorldBake.json"));
if (!file) throw new Error("no WorldBake.json in the export");
const chunks: string[] = [];
for (let i = 0; i < file.content.length; i += CHUNK) chunks.push(file.content.slice(i, i + CHUNK));

interface Node {
  className: string;
  name: string;
  source?: string;
  value?: string;
  children: Map<string, Node>;
}
const node = (className: string, name: string): Node => ({ className, name, children: new Map() });
const root = new Map<string, Node>();
const service = (name: string) => {
  if (!root.has(name)) root.set(name, node(name, name));
  return root.get(name)!;
};
for (const name of ["Workspace", "Lighting", "ReplicatedStorage", "ServerScriptService", "StarterPlayer"]) service(name);
service("StarterPlayer").children.set("StarterPlayerScripts", node("StarterPlayerScripts", "StarterPlayerScripts"));
const at = (path: string): Node => {
  const [first, ...rest] = path.split("/");
  return rest.reduce((n, part) => n.children.get(part)!, service(first!));
};
for (const item of items) at(item.parent).children.set(item.name, { ...node(item.className, item.name), source: item.source });
const assets = node("Folder", "WorldAssets");
service("ReplicatedStorage").children.set("WorldAssets", assets);
const pushed = node("Folder", "WorldBakeJson");
assets.children.set("WorldBakeJson", pushed);
chunks.forEach((value, i) => {
  const name = `chunk_${String(i).padStart(4, "0")}`;
  pushed.children.set(name, { ...node("StringValue", name), value });
});

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
let ref = 0;
const xml = (n: Node): string => {
  const props = [`<string name="Name">${esc(n.name)}</string>`];
  if (n.source !== undefined) props.push(`<ProtectedString name="Source">${esc(n.source)}</ProtectedString>`);
  if (n.value !== undefined) props.push(`<string name="Value">${esc(n.value)}</string>`);
  return `<Item class="${n.className}" referent="RBX${ref++}"><Properties>${props.join("")}</Properties>${[...n.children.values()].map(xml).join("")}</Item>`;
};
writeFileSync(output, `<roblox version="4">${[...root.values()].map(xml).join("")}</roblox>`, "utf8");
console.log(`${output}: ${items.length} items, ${chunks.length} bake chunks, "${prompt}", spawn ${bake.spawn.position.map(Math.round).join(",")}`);
