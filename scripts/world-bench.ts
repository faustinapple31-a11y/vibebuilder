/**
 * The universal benchmark: forty worlds, several seeds, judged and captured from above.
 *   npx tsx scripts/world-bench.ts [--seeds 1] [--out demo-output/bench40] [--compare old.json] [--only 3,12]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { interpretPrompt } from "../packages/agents/src/local/interpreter";
import { STYLE_FAMILY_INDEX, StyleBibleSchema, styleFamilyToBible } from "../packages/core/src";
import { aerialPixels, reviewLevelDesign, reviewWorld } from "../packages/quality/src";
import { encodePng } from "../packages/textures/src";
import { generateWorld } from "../packages/world-gen/src";

export const BENCH: [string, string][] = [
  ["eu_city", "une ville européenne moderne réaliste"], ["us_suburb", "un quartier résidentiel de banlieue américaine"], ["industry", "un grand complexe industriel"], ["coast_city", "une ville touristique côtière"], ["farmland", "une région agricole rurale"], ["ski", "une station de montagne enneigée"], ["airport", "un grand aéroport"], ["mil_base", "une base militaire moderne"],
  ["rome", "une cité de la Rome antique"], ["egypt", "un village de l'Égypte antique"], ["med_village", "un village médiéval"], ["med_capital", "une capitale médiévale fortifiée"], ["renaissance", "une ville de la Renaissance"], ["steam_town", "une ville de la révolution industrielle"], ["ww2", "une ville détruite de la seconde guerre mondiale"],
  ["high_fantasy", "un royaume de high fantasy"], ["dark_fantasy", "une région de dark fantasy"], ["magic_forest", "une forêt magique"], ["mountain_castle", "un château dans la montagne"], ["floating", "des îles flottantes"], ["underground", "une cité souterraine fantastique"],
  ["cyberpunk", "une métropole cyberpunk"], ["research", "un centre de recherche futuriste"], ["colony", "une colonie spatiale"], ["alien", "une colonie sur une planète alien"], ["dystopia", "une ville industrielle dystopique"],
  ["trop_island", "une île tropicale"], ["jungle", "une jungle dense"], ["desert", "une région désertique"], ["arctic", "un paysage arctique"], ["range", "une grande chaîne de montagnes"], ["archipelago", "un archipel tropical"],
  ["fps", "une arène FPS compétitive"], ["milsim", "une carte tactique militaire milsim"], ["battle_royale", "une île de battle royale"], ["survival", "une carte de survie et d'exploration"], ["racing", "un circuit de course automobile"], ["obby", "un obby"], ["tower_defense", "une carte de tower defense"], ["rpg", "une grande région de RPG"],
];
export interface BenchRow { id: string; prompt: string; style: string; genre: string; layout: string; settlement: string; width: number; level: number; world: number; score: number; ms: number; placements: number; parts: number; problems: string[]; [k: string]: unknown }

export function makeWorld(prompt: string, shift = 0) {
  const { spec, game } = interpretPrompt(prompt);
  spec.seed = (spec.seed + shift * 7919) % 4294967295;
  spec.terrain.groundMode = "voxels";
  const style = StyleBibleSchema.parse(styleFamilyToBible(STYLE_FAMILY_INDEX[spec.stylePreset] ?? STYLE_FAMILY_INDEX.stylized_mystical!));
  const t = Date.now();
  const bake = generateWorld(spec, style);
  return { spec, game, style, bake, ms: Date.now() - t };
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1]! : d);
  const out = opt("--out", "demo-output/bench40");
  mkdirSync(out, { recursive: true });
  const seeds = Number(opt("--seeds", "1"));
  const only = opt("--only", "").split(",").filter(Boolean).map(Number);
  const old = existsSync(opt("--compare", "")) ? (JSON.parse(readFileSync(opt("--compare", ""), "utf8")) as BenchRow[]) : [];
  const rows: BenchRow[] = [];
  for (const [i, [id, prompt]] of BENCH.entries()) {
    if (only.length && !only.includes(i)) continue;
    for (let s = 0; s < seeds; s++) {
      const { spec, game, bake, ms } = makeWorld(prompt, s);
      const level = reviewLevelDesign(bake);
      const world = reviewWorld(bake);
      const row: BenchRow = { id: `${id}_${s}`, prompt, style: spec.stylePreset, genre: game.genre, layout: spec.layout.archetype, settlement: spec.settlements.map((q) => `${q.type}:${q.buildings}`).join("+") || "-", width: spec.size.width, level: level.score, world: world.score, score: Math.round((level.score + world.score) * 5) / 10, ms, placements: bake.placements.length, parts: bake.stats.partsEstimate, problems: [...new Set([...level.problems.filter((p) => p.severity !== "low").map((p) => p.id), ...world.problems.map((p) => p.id)])] };
      rows.push(row);
      const img = aerialPixels(bake, 480);
      writeFileSync(join(out, `${row.id}.png`), await encodePng(img.width, img.height, img.data, 3, (d) => new Uint8Array(deflateSync(d))));
      const o = old.find((q) => q.id === row.id);
      console.log(`${row.id.padEnd(17)} ${row.score}${o ? ` (${(row.score - o.score).toFixed(1)})` : ""} L${row.level} W${row.world} ${row.style}/${row.genre}/${row.layout}/${row.settlement}/${row.width} ${ms}ms ${row.problems.slice(0, 7).join(" ")}`);
    }
  }
  console.log(`mean ${(rows.reduce((a, r) => a + r.score, 0) / rows.length).toFixed(1)} min ${Math.min(...rows.map((r) => r.score))}`);
  writeFileSync(join(out, "bench.json"), JSON.stringify(rows, null, 1));
}
if (process.argv[1]?.includes("world-bench")) void main();
