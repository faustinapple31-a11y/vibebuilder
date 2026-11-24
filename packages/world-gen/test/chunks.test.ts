import { describe, expect, it } from "vitest";
import { STYLE_FAMILY_INDEX, StyleBibleSchema, chunkWorld, deserializeChunks, serializeChunks, styleFamilyToBible, type WorldBake } from "@worldforge/core";
import { interpretPrompt } from "../../agents/src/local/interpreter";
import { generateWorld, regenerateWindow, scatter } from "../src";

const make = (prompt: string, size?: number) => {
  const { spec } = interpretPrompt(prompt);
  spec.terrain.groundMode = "voxels";
  if (size) spec.size.width = spec.size.depth = size;
  const style = StyleBibleSchema.parse(styleFamilyToBible(STYLE_FAMILY_INDEX[spec.stylePreset]!));
  return { spec, style, bake: generateWorld(spec, style) };
};
const where = (b: WorldBake, r: { x0: number; z0: number; x1: number; z1: number }) => b.placements.filter((p) => p.position[0] >= r.x0 && p.position[0] < r.x1 && p.position[2] >= r.z0 && p.position[2] < r.z1);
/** What stands where, seen from above. */
const sign = (b: WorldBake["placements"]) => b.map((p) => `${p.prefab}/${p.variant}@${Math.floor(p.position[0] * 2)},${Math.floor(p.position[2] * 2)}`).sort();

describe("scatter", () => {
  it("gives the same points drawn whole or window by window, and keeps them apart", () => {
    const whole = scatter(7, 9, { x0: -300, z0: -300, x1: 300, z1: 300 });
    const pieces = [];
    for (let x = -300; x < 300; x += 150) for (let z = -300; z < 300; z += 150) pieces.push(...scatter(7, 9, { x0: x, z0: z, x1: x + 150, z1: z + 150 }));
    expect(pieces.map((p) => p.key).sort()).toEqual(whole.map((p) => p.key).sort());
    let closest = Infinity;
    for (let i = 0; i < whole.length; i++) for (let k = i + 1; k < whole.length; k++) closest = Math.min(closest, Math.hypot(whole[i]!.x - whole[k]!.x, whole[i]!.z - whole[k]!.z));
    expect(closest).toBeGreaterThanOrEqual(9 - 1e-3);
    // as full as a dart-throwing scatter
    expect(whole.length).toBeGreaterThan((600 * 600 * 0.53) / 81);
  });
});

describe("chunks", () => {
  const { spec, style, bake } = make("un village médiéval avec une rivière");
  const chunks = chunkWorld(bake);

  it("give every placement to one chunk and say where the ways go on", () => {
    expect(chunks.list.reduce((n, c) => n + c.placements, 0)).toBe(bake.placements.length);
    expect(chunks.list.some((c) => c.seams.some((s) => s.kind === "road"))).toBe(true);
    expect(chunks.list.some((c) => c.seams.some((s) => s.kind === "river"))).toBe(true);
    // a way that leaves a chunk enters the next one at the same point
    for (const c of chunks.list) for (const s of c.seams) {
      const other = chunks.list.find((q) => q.id === s.to)!;
      expect(other.seams.some((q) => q.to === c.id && q.path === s.path && Math.hypot(q.at[0] - s.at[0], q.at[1] - s.at[1]) < 1e-6)).toBe(true);
    }
  });

  it("are written to files and read back", () => {
    const back = deserializeChunks(JSON.parse(JSON.stringify(serializeChunks(bake))));
    expect(back.placements.length).toBe(bake.placements.length);
    let worst = 0;
    for (let i = 0; i < bake.terrain.heights.length; i++) worst = Math.max(worst, Math.abs(back.terrain.heights[i]! - bake.terrain.heights[i]!));
    expect(worst).toBeLessThan(0.02);
    expect(Array.from(back.terrain.materials)).toEqual(Array.from(bake.terrain.materials));
    const byId = new Map(bake.placements.map((p) => [p.id, p]));
    for (const p of back.placements) {
      const q = byId.get(p.id)!;
      expect([p.zone, p.prefab, p.variant, p.category, p.layer, !!p.fixed]).toEqual([q.zone, q.prefab, q.variant, q.category, q.layer, !!q.fixed]);
      expect(Math.hypot(p.position[0] - q.position[0], p.position[1] - q.position[1], p.position[2] - q.position[2])).toBeLessThan(0.01);
    }
  });

  it("share the heights of their common edge", () => {
    const files = serializeChunks(bake).chunks;
    const at = (x0: number, z0: number) => files.find((c) => c.x0 === x0 && c.z0 === z0)!;
    const a = at(0, 0);
    const b = at(64, 0);
    const h = (c: typeof a, x: number, z: number) => {
      const bytes = Buffer.from(c.heightsB64, "base64");
      return bytes.readInt16LE((z * c.w + x) * 2) / 32 + c.base;
    };
    for (let z = 0; z < 64; z++) expect(h(a, 64, z)).toBeCloseTo(h(b, 0, z), 5);
  });

  it("can be drawn again alone: the same without salt, another with, the neighbours untouched", () => {
    // the wildest chunk that is not the spawn's
    const c = [...chunks.list].filter((q) => q.kind !== "urban").sort((p, q) => q.placements - p.placements)[0]!;
    const win = { x0: c.rect[0], z0: c.rect[1], x1: c.rect[2], z1: c.rect[3] };
    const same = regenerateWindow(spec, style, bake, win);
    const other = regenerateWindow(spec, style, bake, win, { salt: 5 });
    const before = sign(where(bake, win));
    const kept = sign(where(same, win)).filter((s) => before.includes(s)).length;
    expect(kept / before.length).toBeGreaterThan(0.75);
    // the trees are decided point by point: they come back where they were
    const trees = (b: WorldBake) => sign(where(b, win).filter((p) => p.id.startsWith("veg_")));
    const was0 = trees(bake);
    expect(trees(same).filter((s) => was0.includes(s)).length / was0.length).toBeGreaterThan(0.97);
    const changed = sign(where(other, win)).filter((s) => !before.includes(s)).length;
    expect(changed / before.length).toBeGreaterThan(0.4);
    const outside = (b: WorldBake) => b.placements.filter((p) => !(p.position[0] >= win.x0 && p.position[0] < win.x1 && p.position[2] >= win.z0 && p.position[2] < win.z1));
    const was = new Set(sign(outside(bake)));
    expect(sign(outside(other)).filter((s) => was.has(s)).length / was.size).toBeGreaterThan(0.97);
    expect(new Set(other.placements.map((p) => p.id)).size).toBe(other.placements.length);
  }, 60_000);

  it("the same seed gives the same chunks", () => {
    const again = chunkWorld(generateWorld(spec, style));
    expect(again.list.map((c) => c.hash)).toEqual(chunks.list.map((c) => c.hash));
  }, 60_000);
});
