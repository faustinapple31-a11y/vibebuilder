import { describe, expect, it } from "vitest";
import { getStylePreset, getWorldTemplate, type PrefabVariant, type WorldBake } from "@worldforge/core";
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
