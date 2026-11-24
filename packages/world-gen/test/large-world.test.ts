import { describe, expect, it } from "vitest";
import { DETAIL_PROFILES, STYLE_FAMILY_INDEX, StyleBibleSchema, measureCapacity, styleFamilyToBible } from "@worldforge/core";
import { exportWorldFiles } from "@worldforge/roblox-export";
import { interpretPrompt } from "../../agents/src/local/interpreter";
import { generateWorld } from "../src";

const make = (prompt: string, size?: number) => {
  const { spec } = interpretPrompt(prompt);
  spec.terrain.groundMode = "voxels";
  if (size) spec.size.width = spec.size.depth = size;
  const style = StyleBibleSchema.parse(styleFamilyToBible(STYLE_FAMILY_INDEX[spec.stylePreset]!));
  return { spec, style, bake: generateWorld(spec, style) };
};

describe("the size of a world", () => {
  it("comes from the request", () => {
    const w = (p: string) => interpretPrompt(p).spec.size.width;
    expect(w("un petit village médiéval")).toBeLessThan(1024);
    expect(w("une grande ville moderne")).toBeGreaterThanOrEqual(2048);
    expect(w("une carte militaire milsim de plusieurs kilomètres")).toBeGreaterThanOrEqual(7000);
    expect(w("une map open world avec plusieurs biomes")).toBeGreaterThanOrEqual(4096);
    expect(w("un désert de 3 km")).toBeCloseTo(3 * 3571, -2);
    expect(w("une île de 2400 studs")).toBe(2432);
  });
});

describe("a large world", () => {
  const { spec, style, bake } = make("une grande région de RPG", 2304);

  it("is peopled beyond the places the request names, every one on the road network", () => {
    const places = bake.zones.filter((z) => z.kind === "settlement");
    expect(places.length).toBeGreaterThan(spec.settlements.length);
    const roads = bake.paths.filter((p) => p.kind === "road");
    for (const z of places) expect(roads.some((r) => r.points.some((q) => Math.hypot(q[0] - z.center[0], q[1] - z.center[1]) < z.radius + 40)), z.id).toBe(true);
  });

  it("has no large empty country", () => {
    const of = [...bake.zones.filter((z) => z.kind !== "spawn").map((z) => ({ x: z.center[0], z: z.center[1], r: z.radius })), ...bake.landmarks.map((l) => ({ x: l.position[0], z: l.position[2], r: 30 }))];
    const t = bake.terrain;
    let land = 0;
    let far = 0;
    const margin = 150;
    for (let z = margin; z < t.depth * t.cellSize - margin; z += 40) for (let x = margin; x < t.width * t.cellSize - margin; x += 40) {
      const i = Math.floor(z / t.cellSize) * t.width + Math.floor(x / t.cellSize);
      if (!Number.isNaN(t.water[i]!)) continue;
      land++;
      const wx = t.origin[0] + x;
      const wz = t.origin[1] + z;
      if (Math.min(...of.map((q) => Math.hypot(q.x - wx, q.z - wz) - q.r)) > 380) far++;
    }
    expect(far / land).toBeLessThan(0.06);
  });

  it("drops nothing, and says what it costs for each profile", () => {
    const c = measureCapacity(bake);
    expect(c.models).toBe(bake.placements.length);
    expect(c.partsTotal).toBe(bake.stats.partsEstimate);
    expect(c.partsServer).toBeLessThan(c.partsTotal * 0.4);
    for (let i = 1; i < DETAIL_PROFILES.length; i++) expect(c.partsAround[DETAIL_PROFILES[i]!]).toBeGreaterThanOrEqual(c.partsAround[DETAIL_PROFILES[i - 1]!]);
    expect(c.chunks.count).toBe(81);
  });

  it("is exported whole, whatever the profile", () => {
    const count = (detail: (typeof DETAIL_PROFILES)[number]) => {
      const files = exportWorldFiles({ bake, spec: { ...spec, detail }, style, projectSlug: "t" });
      const chunks = files.filter((f) => f.path.startsWith("assets/world-chunks/"));
      const rojo = JSON.parse(files.find((f) => f.path === "default.project.json")!.content) as { tree: { Workspace: { $properties: Record<string, number> } } };
      return { n: chunks.reduce((s, f) => s + (JSON.parse(f.content) as { ids: string[] }).ids.length, 0), chunks: chunks.length, radius: rojo.tree.Workspace.$properties.StreamingTargetRadius!, files };
    };
    const low = count("performance");
    const high = count("maximum");
    expect(low.n).toBe(bake.placements.length);
    expect(high.n).toBe(bake.placements.length);
    expect(low.chunks).toBe(81);
    expect(low.radius).toBeLessThan(high.radius);
    // every model a chunk places is in the files
    const prefabs = new Set(low.files.filter((f) => f.path.startsWith("assets/world/prefabs/")).map((f) => f.path.split("/").pop()!.replace(".json", "")));
    for (const p of bake.placements) expect(prefabs.has(p.prefab)).toBe(true);
    // no id twice: nothing is built twice
    expect(new Set(bake.placements.map((p) => p.id)).size).toBe(bake.placements.length);
  });
});
