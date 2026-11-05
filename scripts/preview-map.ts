/**
 * Map preview — renders a generated world to PNGs so a change to the generator can be *looked* at,
 * not only scored. Same role for maps as `preview-ui-kits.ts` has for the UI libraries.
 *
 *   npx tsx scripts/preview-map.ts "village médiéval dans une forêt"      # 1 world, 4 views + plan
 *   npx tsx scripts/preview-map.ts --panel                                # the audit panel, 1 view each
 *   npx tsx scripts/preview-map.ts "<prompt>" --width 1600 --out demo-output/look
 *   (each world with a focal also gets <slug>-thumbnail.png, a 1920×1080 store image)
 *   npx tsx scripts/preview-map.ts --spec a/worlds/main/world.spec.json --spec b/worlds/main/world.spec.json
 *
 * No Roblox, no browser: the software rasterizer of `packages/quality/src/bake-render.ts`.
 * It renders what the bake says, so a floating rock or a bare verge shows up exactly as Studio would
 * show it. Writes `index.html` next to the images as a contact sheet.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { interpretPrompt } from "../packages/agents/src/local/interpreter";
import { STYLE_FAMILY_INDEX, StyleBibleSchema, WorldSpecSchema, styleFamilyToBible } from "../packages/core/src";
import { generateWorld } from "../packages/world-gen/src";
import { cameras, critiqueBake, renderView } from "../packages/quality/src";
import { encodePng } from "../packages/textures/src";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string, fallback: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
  };
  const panel = args.includes("--panel");
  const width = Number.parseInt(flag("width", panel ? "960" : "1280"), 10);
  const height = Math.round(width * 0.5625);
  const outDir = flag("out", "demo-output/map-preview");
  // --spec <world.spec.json> (repeatable): render worlds an agent wrote instead of interpreting a prompt
  const specFiles = args.flatMap((a, i) => (a === "--spec" && args[i + 1] ? [args[i + 1]!] : []));
  const prompts = specFiles.length
    ? specFiles
    : panel
    ? ["village médiéval dans une forêt avec un château", "île tropicale de survie avec un village de pêcheurs", "ville cyberpunk néon la nuit", "désert avec une pyramide et une oasis", "montagne enneigée avec un chalet", "ferme cozy au bord d'un lac"]
    : [args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1]?.startsWith("--") !== true) ?? "village médiéval dans une forêt avec un château"];
  mkdirSync(outDir, { recursive: true });
  const cards: string[] = [];
  for (const prompt of prompts) {
    const spec = specFiles.length ? WorldSpecSchema.parse(JSON.parse(readFileSync(prompt, "utf8"))) : interpretPrompt(prompt).spec;
    const fam = STYLE_FAMILY_INDEX[spec.stylePreset] ?? STYLE_FAMILY_INDEX.stylized_mystical!;
    const style = StyleBibleSchema.parse(styleFamilyToBible(fam));
    const bake = generateWorld(spec, style);
    const report = critiqueBake(bake, spec, style);
    // a spec is named after its project folder (…/<project>/worlds/main/world.spec.json)
    const label = specFiles.length ? basename(resolve(dirname(prompt), "..", "..")) : prompt;
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    const views = panel ? cameras(bake).slice(0, 1) : cameras(bake);
    const imgs: string[] = [];
    for (const { name, cam, far } of views) {
      // Roblox asks for 1920×1080 experience thumbnails
      if (name === "thumbnail") {
        const frame = renderView(bake, cam, 1920, 1080, far);
        const file = `${slug}-thumbnail.png`;
        writeFileSync(join(outDir, file), await encodePng(1920, 1080, frame.px, 3));
        imgs.push(file);
        console.log(`  ${file}`);
        continue;
      }
      const frame = renderView(bake, cam, width, height, far);
      const file = `${slug}-${name}.png`;
      writeFileSync(join(outDir, file), await encodePng(width, height, frame.px, 3));
      imgs.push(file);
      console.log(`  ${file}`);
    }
    cards.push(
      `<section><h2>${label}</h2><p>${spec.stylePreset} · score ${report.score}/100 · ${bake.placements.length} placements · σ ${bake.stats.heightStd.toFixed(0)} · ${report.problems.map((p) => p.id).join(", ") || "no complaints"}</p>` +
        imgs.map((f) => `<figure><img src="${f}" alt="${f}"><figcaption>${f.replace(`${slug}-`, "").replace(".png", "")}</figcaption></figure>`).join("") +
        `</section>`,
    );
    console.log(`${report.score}/100  ${label}`);
  }
  writeFileSync(
    join(outDir, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>WorldForge map preview</title>` +
      `<style>body{margin:0;padding:24px;background:#12141a;color:#e8e6e1;font:14px/1.5 system-ui,sans-serif}h1{font-size:20px}h2{font-size:16px;margin:28px 0 4px}p{color:#9a9a9a;margin:0 0 10px}figure{margin:0 0 14px}img{width:100%;max-width:1280px;display:block;border-radius:8px}figcaption{color:#7a7a7a;font-size:12px;padding-top:4px}</style>` +
      `<h1>Map preview</h1>${cards.join("")}`,
  );
  console.log(`→ ${join(outDir, "index.html")}`);
}

void main();
