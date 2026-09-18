/**
 * Map quality audit — generates a panel of worlds from prompts and measures them, so a change to the
 * generator can be judged on numbers instead of impressions.
 *
 *   npx tsx scripts/audit-maps.ts                  # the default 12-prompt panel
 *   npx tsx scripts/audit-maps.ts "un prompt"      # a single world, verbose
 *
 * It prints, per world: the critic score, the composition layer split, the parts estimate — and then,
 * across the panel: every complaint grouped by frequency and the geometry defects the critic cannot
 * see (an object whose footprint hangs in the air or is swallowed by the ground).
 */
import { interpretPrompt } from "../packages/agents/src/local/interpreter";
import { STYLE_FAMILY_INDEX, StyleBibleSchema, sampleHeight, styleFamilyToBible, type PrefabVariant, type WorldBake } from "../packages/core/src";
import { generateWorld } from "../packages/world-gen/src";
import { critiqueBake } from "../packages/quality/src";

const PANEL = [
  "village médiéval dans une forêt avec un château",
  "île tropicale de survie avec un village de pêcheurs",
  "ville cyberpunk néon la nuit",
  "obby de plateformes dans les nuages",
  "tycoon de restaurant en ville moderne",
  "désert avec une pyramide et une oasis",
  "montagne enneigée avec un chalet",
  "manoir hanté dans un marais",
  "ferme cozy au bord d'un lac",
  "arène de combat dans un volcan",
  "station spatiale sur une lune",
  "archipel de pirates avec des ponts",
];

/** Placements whose base plane should sit on the heightmap (everything else is designed off it). */
function grounded(bake: WorldBake): { id: string; prefab: string; air: number; buried: number }[] {
  const out: { id: string; prefab: string; air: number; buried: number }[] = [];
  for (const p of bake.placements) {
    if (p.fixed || p.locked || p.id.startsWith("layout_")) continue;
    const v: PrefabVariant | undefined = bake.prefabs[p.prefab]?.[p.variant];
    if (!v || v.tags.includes("floating") || v.tags.includes("layout") || v.tags.includes("water")) continue;
    if (p.up) continue; // tilted onto the slope: its base is flush by construction
    // the base flare, not the canopy: a tree trunk is what has to meet the ground
    const r = Math.min((v.baseRadius ?? 0) * p.scale, 24);
    if (r < 1.5) continue;
    const plane = p.position[1] + v.sinkDepth * p.scale;
    // every heightmap cell the footprint disc touches (a ring of samples aliases past the low one)
    const t = bake.terrain;
    const gx = Math.round((p.position[0] - t.origin[0]) / t.cellSize);
    const gz = Math.round((p.position[2] - t.origin[1]) / t.cellSize);
    const rc = Math.ceil(r / t.cellSize) + 1;
    let lo = Infinity;
    for (let dz = -rc; dz <= rc; dz++) {
      for (let dx = -rc; dx <= rc; dx++) {
        const ix = Math.max(0, Math.min(t.width - 1, gx + dx));
        const iz = Math.max(0, Math.min(t.depth - 1, gz + dz));
        const wx = t.origin[0] + ix * t.cellSize;
        const wz = t.origin[1] + iz * t.cellSize;
        if (Math.hypot(wx - p.position[0], wz - p.position[2]) > r + t.cellSize * 0.5) continue;
        lo = Math.min(lo, t.heights[iz * t.width + ix]!);
      }
    }
    if (lo === Infinity) continue;
    // sunk = the ground at the object's own spot is above its base plane (it disappears into the hill)
    out.push({ id: p.id, prefab: p.prefab, air: plane - lo, buried: sampleHeight(bake.terrain, p.position[0], p.position[2]) - plane });
  }
  return out;
}

async function main(): Promise<void> {
  const single = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const prompts = single.length > 0 ? single : PANEL;
  const issues = new Map<string, { count: number; severities: string[]; worst: string }>();
  const scores: number[] = [];
  const airOffenders = new Map<string, { count: number; worst: number }>();
  const buriedOffenders = new Map<string, { count: number; worst: number }>();
  let placements = 0;

  for (const prompt of prompts) {
    const { spec } = interpretPrompt(prompt);
    const fam = STYLE_FAMILY_INDEX[spec.stylePreset] ?? STYLE_FAMILY_INDEX.stylized_mystical!;
    const style = StyleBibleSchema.parse(styleFamilyToBible(fam));
    const bake = generateWorld(spec, style);
    const report = critiqueBake(bake, spec, style);
    scores.push(report.score);
    const s = bake.stats;
    const t = Math.max(1, bake.placements.length);
    placements += bake.placements.length;
    const pct = (n: number) => `${((n / t) * 100).toFixed(0)}%`;
    console.log(
      `${report.score.toString().padStart(3)}  ${spec.stylePreset.padEnd(22)} ` +
        `fg ${pct(s.layerCounts.foreground).padStart(4)} mid ${pct(s.layerCounts.midground).padStart(4)} bg ${pct(s.layerCounts.background).padStart(4)} ` +
        `σ ${s.heightStd.toFixed(0).padStart(3)} veg ${s.vegetationCoverage.toFixed(1).padStart(5)} parts ${(s.partsEstimate / 1000).toFixed(0).padStart(3)}k  ${prompt}`,
    );
    for (const issue of report.problems) {
      const key = issue.message.replace(/[0-9]+(\.[0-9]+)?/g, "N").replace(/\s+/g, " ").trim();
      const entry = issues.get(key) ?? { count: 0, severities: [], worst: issue.message };
      entry.count += 1;
      if (!entry.severities.includes(issue.severity)) entry.severities.push(issue.severity);
      issues.set(key, entry);
    }
    for (const g of grounded(bake)) {
      if (g.air > 2.5) {
        const e = airOffenders.get(g.prefab) ?? { count: 0, worst: 0 };
        airOffenders.set(g.prefab, { count: e.count + 1, worst: Math.max(e.worst, g.air) });
      }
      if (g.buried > 1.5) {
        const e = buriedOffenders.get(g.prefab) ?? { count: 0, worst: 0 };
        buriedOffenders.set(g.prefab, { count: e.count + 1, worst: Math.max(e.worst, g.buried) });
      }
    }
  }

  console.log(`\naverage score ${(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)} / 100  (min ${Math.min(...scores)}, max ${Math.max(...scores)})  ${placements} placements\n`);
  console.log("issues by frequency:");
  for (const [key, entry] of [...issues.entries()].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${String(entry.count).padStart(2)}× [${entry.severities.join("/")}] ${key}`);
  }
  const table = (title: string, m: Map<string, { count: number; worst: number }>) => {
    const rows = [...m.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 12);
    console.log(`\n${title}: ${rows.length === 0 ? "none" : ""}`);
    for (const [prefab, e] of rows) console.log(`  ${String(e.count).padStart(4)}× ${prefab.padEnd(22)} worst ${e.worst.toFixed(1)} studs`);
  };
  table("footprints hanging in the air (> 2.5 studs under an edge)", airOffenders);
  table("bases under the ground at their own spot (> 1.5 studs)", buriedOffenders);
}

void main();
