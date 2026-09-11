import { describe, expect, it } from "vitest";
import { getWorldTemplate, getStylePreset, sampleHeight, serializeBake, deserializeBake } from "@worldforge/core";
import { generateWorld, regenerateLayers } from "@worldforge/world-gen";

describe("world generator", () => {
  const spec = getWorldTemplate("moonlit_forest_village");
  const style = getStylePreset(spec.stylePreset);

  it("generates a deterministic bake with all layers", () => {
    const t0 = Date.now();
    const bake = generateWorld(spec, style);
    const ms = Date.now() - t0;
    console.log(`generated in ${ms}ms`, JSON.stringify(bake.stats.counts), "parts", bake.stats.partsEstimate, "layers", JSON.stringify(bake.stats.layerCounts));
    console.log("heightStd", bake.stats.heightStd.toFixed(1), "min/max", bake.stats.heightMin.toFixed(1), bake.stats.heightMax.toFixed(1), "water%", (bake.stats.waterCoverage * 100).toFixed(1));
    console.log("landmarks", bake.landmarks.map((l) => `${l.id}@${l.position.map((v) => v.toFixed(0)).join(",")} vis=${l.viewCorridors.map((c) => (c.visible ? 1 : 0)).join("")}`).join(" | "));
    console.log("paths", bake.paths.map((p) => `${p.id}:${p.points.length}`).join(" "), "spawn", bake.spawn.position.map((v) => v.toFixed(0)).join(","));
    console.log("variantsUsed", JSON.stringify(bake.stats.variantsUsed));
    expect(bake.placements.length).toBeGreaterThan(500);
    expect(bake.stats.counts.building).toBeGreaterThanOrEqual(5);
    expect(bake.stats.counts.landmark).toBeGreaterThanOrEqual(2);
    expect(bake.paths.filter((p) => p.kind === "road").length).toBeGreaterThanOrEqual(1);
    expect(bake.paths.filter((p) => p.kind === "river").length).toBe(1);
    expect(bake.stats.heightStd).toBeGreaterThan(8);
    expect(bake.stats.layerCounts.foreground).toBeGreaterThan(20);
    expect(bake.stats.layerCounts.background).toBeGreaterThan(20);
    expect(bake.stats.partsEstimate).toBeLessThanOrEqual(30000);
    // no floating objects
    let floating = 0;
    for (const p of bake.placements) {
      if (p.prefab === "bridge") continue;
      const h = sampleHeight(bake.terrain, p.position[0], p.position[2]);
      const sink = bake.prefabs[p.prefab]![p.variant]!.sinkDepth * p.scale;
      if (p.position[1] > h + 0.5 || p.position[1] < h - sink - 0.5) floating++;
    }
    expect(floating).toBe(0);
    console.log("trimmed", JSON.stringify(Object.fromEntries(Object.entries(bake.stats.budgets).map(([k, v]) => [k, v.trimmed]))), "village", JSON.stringify(bake.zones.find((z) => z.kind === "settlement")?.center.map((v) => v.toFixed(0))));
    // determinism
    const bake2 = generateWorld(spec, style);
    expect(bake2.placements.length).toBe(bake.placements.length);
    expect(bake2.placements[100]!.position).toEqual(bake.placements[100]!.position);
    // serialization roundtrip
    const json = serializeBake(bake);
    const back = deserializeBake(json);
    expect(back.placements.length).toBe(bake.placements.length);
    expect(back.terrain.heights[1000]).toBeCloseTo(bake.terrain.heights[1000]!, 3);
    const size = JSON.stringify(json).length;
    console.log("bake json size", (size / 1024).toFixed(0), "KB");
  });

  it("regenerates only vegetation and keeps buildings", () => {
    const bake = generateWorld(spec, style);
    const spec2 = { ...spec, locks: { ...spec.locks, buildings: true, landmarks: true, terrain: true } };
    const bake2 = regenerateLayers(spec2, style, bake, ["vegetation"], { seedOverride: spec.seed + 1 });
    const b1 = bake.placements.filter((p) => p.category === "building").map((p) => p.position.join(","));
    const b2 = bake2.placements.filter((p) => p.category === "building").map((p) => p.position.join(","));
    expect(b2.length).toBe(b1.length);
    const v1 = bake.placements.filter((p) => p.category === "vegetation").map((p) => p.id + p.position.join(","));
    const v2 = bake2.placements.filter((p) => p.category === "vegetation").map((p) => p.id + p.position.join(","));
    expect(v1.join("|")).not.toBe(v2.join("|"));
  });
});
