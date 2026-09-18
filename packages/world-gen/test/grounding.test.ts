import { describe, expect, it } from "vitest";
import { TERRAIN_MATERIALS, getStylePreset, getWorldTemplate, type PrefabVariant, type WorldBake } from "@worldforge/core";
import { generateWorld } from "@worldforge/world-gen";

/**
 * Guards the defect the eye notices first in a generated map: an object standing at the lip of a cliff
 * or a terrace with part of its base hanging in the air. The generator settles every scattered placement
 * onto ground that is flat enough for its base (`settleOnGround`), levels the pads of the rigid
 * structures onto a terrace level, and in parts mode re-rounds the heightmap onto the levels the ground
 * slabs are actually built from, so the two cannot drift apart.
 *
 * Measured over every heightmap cell the footprint disc touches — a ring of samples walks straight past
 * the one cell that is a whole terrace lower, which is exactly the case that shows.
 */
function hangingFootprints(bake: WorldBake): { id: string; prefab: string; air: number }[] {
  const t = bake.terrain;
  const out: { id: string; prefab: string; air: number }[] = [];
  for (const p of bake.placements) {
    if (p.fixed || p.locked || p.id.startsWith("layout_")) continue;
    const v: PrefabVariant | undefined = bake.prefabs[p.prefab]?.[p.variant];
    if (!v || v.tags.includes("floating") || v.tags.includes("layout") || v.tags.includes("water")) continue;
    if (p.up) continue; // tilted onto the slope: flush by construction
    const r = Math.min((v.baseRadius ?? 0) * p.scale, 24);
    if (r < 1.5) continue;
    const gx = Math.round((p.position[0] - t.origin[0]) / t.cellSize);
    const gz = Math.round((p.position[2] - t.origin[1]) / t.cellSize);
    const rc = Math.ceil(r / t.cellSize) + 1;
    const reach = r + t.cellSize * 0.5;
    let lo = Infinity;
    for (let dz = -rc; dz <= rc; dz++) {
      for (let dx = -rc; dx <= rc; dx++) {
        const ix = Math.max(0, Math.min(t.width - 1, gx + dx));
        const iz = Math.max(0, Math.min(t.depth - 1, gz + dz));
        const wx = t.origin[0] + ix * t.cellSize;
        const wz = t.origin[1] + iz * t.cellSize;
        if (Math.hypot(wx - p.position[0], wz - p.position[2]) > reach) continue;
        lo = Math.min(lo, t.heights[iz * t.width + ix]!);
      }
    }
    if (lo === Infinity) continue;
    const air = p.position[1] + v.sinkDepth * p.scale - lo;
    if (air > 2.5) out.push({ id: p.id, prefab: p.prefab, air });
  }
  return out;
}

describe("placements meet the ground", () => {
  const spec = getWorldTemplate("moonlit_forest_village");
  const style = getStylePreset(spec.stylePreset);

  it("leaves almost no footprint hanging over an edge", () => {
    const bake = generateWorld(spec, style);
    const hanging = hangingFootprints(bake);
    const worst = hanging.sort((a, b) => b.air - a.air).slice(0, 5);
    console.log(`hanging ${hanging.length} / ${bake.placements.length}`, worst.map((h) => `${h.prefab} ${h.air.toFixed(1)}`).join(" | "));
    // a handful of rigid structures on hard terrain is tolerable; a scatter of floating trees is not
    expect(hanging.length).toBeLessThanOrEqual(Math.ceil(bake.placements.length * 0.004));
    // and nothing may hang by more than one terrace step, whatever it is
    for (const h of hanging) expect(h.air, `${h.prefab} (${h.id}) hangs ${h.air.toFixed(1)} studs`).toBeLessThanOrEqual(8.5);
  });

  it("puts the heightmap on the terrace levels the ground slabs are built from", () => {
    const bake = generateWorld(spec, style);
    if (bake.terrain.mode !== "parts") return;
    // every column is a multiple of the ground step: objects placed on it sit exactly on a slab top
    let off = 0;
    for (const h of bake.terrain.heights) if (Math.abs(h / 8 - Math.round(h / 8)) > 1e-6) off++;
    expect(off).toBe(0);
  });
});

describe("near-field and horizon detail", () => {
  const spec = getWorldTemplate("moonlit_forest_village");
  const style = getStylePreset(spec.stylePreset);

  it("dresses the road verges, the spawn apron and the border band", () => {
    const bake = generateWorld(spec, style);
    const detail = bake.placements.filter((p) => p.id.startsWith("detail_"));
    console.log("detail", detail.length, "layers", JSON.stringify(bake.stats.layerCounts));
    expect(detail.length).toBeGreaterThan(60);
    // verges: detail within a few studs of a road shoulder, on both sides of it
    const road = bake.paths.find((p) => p.kind === "road")!;
    const nearRoad = detail.filter((p) => {
      let best = Infinity;
      for (const [x, z] of road.points) best = Math.min(best, Math.hypot(p.position[0] - x, p.position[2] - z));
      return best < road.width / 2 + 6;
    });
    expect(nearRoad.length).toBeGreaterThan(20);
    // apron: something dressed within 34 studs of the spawn, and nothing inside the walkable circle
    const [sx, , sz] = bake.spawn.position;
    const apron = detail.filter((p) => Math.hypot(p.position[0] - sx, p.position[2] - sz) < 44);
    expect(apron.length).toBeGreaterThan(4);
    for (const p of apron) expect(Math.hypot(p.position[0] - sx, p.position[2] - sz)).toBeGreaterThan(8);
    // horizon: silhouettes in the border band, and they are the oversized ones
    const band = Math.min(bake.terrain.width * bake.terrain.cellSize, bake.terrain.depth * bake.terrain.cellSize) * 0.13;
    const edge = (x: number, z: number) =>
      Math.min(x - bake.terrain.origin[0], bake.terrain.origin[0] + bake.terrain.width * bake.terrain.cellSize - x, z - bake.terrain.origin[1], bake.terrain.origin[1] + bake.terrain.depth * bake.terrain.cellSize - z);
    const horizon = detail.filter((p) => edge(p.position[0], p.position[2]) < band * 1.05);
    // a world whose edge is already dense forest needs few: the pass fills the band, it does not flood it
    expect(horizon.length).toBeGreaterThan(2);
    expect(Math.max(...horizon.map((p) => p.scale))).toBeGreaterThan(1.2);
    // the composition reads in the stats: both ends of the depth range are populated
    expect(bake.stats.layerCounts.foreground / bake.placements.length).toBeGreaterThan(0.08);
    expect(bake.stats.layerCounts.background / bake.placements.length).toBeGreaterThan(0.08);
  });
});

describe("nothing stands in the road", () => {
  const spec = getWorldTemplate("moonlit_forest_village");
  const style = getStylePreset(spec.stylePreset);

  /** Distance from a point to a polyline's centreline. */
  function toPolyline(x: number, z: number, pts: [number, number][]): number {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const abx = b[0] - a[0];
      const abz = b[1] - a[1];
      const ab2 = abx * abx + abz * abz || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[1]) * abz) / ab2));
      best = Math.min(best, Math.hypot(x - (a[0] + abx * t), z - (a[1] + abz * t)));
    }
    return best;
  }

  it("keeps scattered props, vegetation and buildings out of the carriageway", () => {
    const bake = generateWorld(spec, style);
    const roads = bake.paths.filter((p) => p.kind === "road");
    expect(roads.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const p of bake.placements) {
      const v = bake.prefabs[p.prefab]?.[p.variant];
      if (!v) continue;
      // a road is routed *to* a landmark, a village centre and the spawn plaza: they are its destination
      if (p.category === "landmark" || p.id === "spawn_plaza" || p.id.startsWith("layout_")) continue;
      // what belongs on the road surface, and what spans it
      if (v.category === "path" || v.tags.some((t) => t === "marking" || t === "kerb" || t === "road" || t === "bridge" || t === "stairs" || t === "floating" || t === "ground")) continue;
      if ((v.baseRadius ?? 0) < 0.8) continue;
      for (const road of roads) {
        if (toPolyline(p.position[0], p.position[2], road.points) < road.width / 2 - 0.5) {
          offenders.push(`${p.prefab} (${p.id}) in ${road.id}`);
          break;
        }
      }
    }
    expect(offenders, `${offenders.length} placements in a carriageway: ${offenders.slice(0, 8).join(", ")}`).toEqual([]);
  });
});

describe("terrain colours", () => {
  it("gives every material a colour, so no slab falls back to green", () => {
    for (const id of ["moonlit_forest_village"] as const) {
      const spec = getWorldTemplate(id);
      const style = getStylePreset(spec.stylePreset);
      const bake = generateWorld(spec, style);
      const colors = bake.lighting.terrainColors ?? {};
      // `pipeline/ground.ts` paints a slab `colors[material] ?? "#6a7f3f"`: a material missing here comes
      // out as grass, whatever it is. Water is poured, not slabbed, and Air is the absence of terrain.
      const missing = TERRAIN_MATERIALS.filter((m) => m !== "Air" && m !== "Water" && !(m in colors));
      expect(missing, `materials with no colour: ${missing.join(", ")}`).toEqual([]);
    }
  });
});
