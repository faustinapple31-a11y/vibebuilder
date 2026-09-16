import { TERRAIN_MATERIAL_INDEX, deriveSeed, lerp, smootherstep, type Vec2 } from "@worldforge/core";
import { Rng } from "@worldforge/core";
import { normToWorld, progress, seaLevelOf, type GenContext, type SettlementSite } from "../context";

/**
 * Stage 8: settlement site selection + flattening.
 * A village needs a relatively flat area, not under water, not on the map border,
 * ideally near the feature named in `near` (a river/lake/landmark id).
 */
export function selectSettlementSites(ctx: GenContext): void {
  const { spec } = ctx;
  const rng = new Rng(deriveSeed(ctx.seed, "sites"));
  const slope = ctx.heights.slopeGrid();
  ctx.sites = [];
  let idx = 0;
  for (const s of spec.settlements) {
    progress(ctx, `sites:${s.id}`, idx++ / Math.max(1, spec.settlements.length));
    const radius = 34 + s.buildings * 7.5;
    let center: Vec2;
    if (s.position) {
      center = normToWorld(ctx, s.position);
    } else {
      center = findFlatSite(ctx, slope, radius, s.near, rng, s.type === "harbor");
    }
    const baseHeight = flattenArea(ctx, center, radius, 0.55);
    const site: SettlementSite = { id: s.id, center, radius, baseHeight, spec: s };
    ctx.sites.push(site);
    ctx.zones.push({ id: s.id, kind: "settlement", polygon: circlePoly(center, radius, 16), center, radius });
    ctx.occupants.push({ position: [center[0], baseHeight, center[1]], radius: radius * 0.25, kind: "keep" }); // plaza kept clear
  }
  progress(ctx, "sites:done", 1);
}

export function circlePoly(c: Vec2, r: number, n: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
  }
  return out;
}

function findFlatSite(ctx: GenContext, slope: ReturnType<GenContext["heights"]["slopeGrid"]>, radius: number, near: string | undefined, rng: Rng, shore = false): Vec2 {
  const h = ctx.heights;
  const step = 3; // cells
  const rc = Math.ceil(radius / ctx.cellSize);
  const margin = Math.ceil((Math.min(ctx.worldW, ctx.worldD) * 0.14) / ctx.cellSize) + rc;
  let best: Vec2 = [ctx.origin[0] + ctx.worldW / 2, ctx.origin[1] + ctx.worldD / 2];
  let bestScore = Infinity;
  const nearRiver = near ? ctx.paths.find((p) => p.id === near && p.kind === "river") : undefined;
  const nearLandmark = near ? ctx.landmarks.find((l) => l.id === near) : undefined;
  const nearSite = near ? ctx.sites.find((s) => s.id === near) : undefined;
  for (let z = margin; z < ctx.depth - margin; z += step) {
    for (let x = margin; x < ctx.width - margin; x += step) {
      // window stats
      let sSum = 0;
      let count = 0;
      let water = 0;
      let hMin = Infinity;
      let hMax = -Infinity;
      for (let dz = -rc; dz <= rc; dz += 2) {
        for (let dx = -rc; dx <= rc; dx += 2) {
          if (dx * dx + dz * dz > rc * rc) continue;
          const i = (z + dz) * ctx.width + (x + dx);
          sSum += slope.data[i]!;
          if (!Number.isNaN(ctx.water.data[i]!)) water++;
          const hv = h.data[i]!;
          if (hv < hMin) hMin = hv;
          if (hv > hMax) hMax = hv;
          count++;
        }
      }
      if (count === 0) continue;
      const [wx, wz] = h.toWorld(x, z);
      let score = (sSum / count) * 3 + (hMax - hMin) / 40 + (water / count) * 12;
      if (shore) {
        // harbor: the edge of the settlement touches the water (river, lake or sea), on low ground
        const d = ctx.waterDistance.get(x, z);
        score += Math.abs(d - radius * 0.95) / 25;
        const sea = seaLevelOf(ctx.spec);
        if (Number.isFinite(sea)) score += Math.max(0, (hMin + hMax) / 2 - sea - 8) / 12;
      }
      if (nearRiver) {
        const d = ctx.waterDistance.get(x, z);
        // want to be close to the river but not in it
        score += d < radius * 0.6 ? 6 : Math.abs(d - radius * 1.1) / 60;
      } else if (nearLandmark) {
        score += Math.abs(Math.hypot(wx - nearLandmark.position[0], wz - nearLandmark.position[2]) - radius * 1.6) / 60;
      } else if (nearSite) {
        score += Math.abs(Math.hypot(wx - nearSite.center[0], wz - nearSite.center[1]) - radius * 2.5) / 60;
      } else {
        // prefer central-ish
        const cx = ctx.origin[0] + ctx.worldW / 2;
        const cz = ctx.origin[1] + ctx.worldD / 2;
        score += Math.hypot(wx - cx, wz - cz) / (ctx.worldW * 0.8);
      }
      // avoid other sites / landmarks
      for (const s of ctx.sites) if (Math.hypot(wx - s.center[0], wz - s.center[1]) < s.radius + radius + 40) score += 20;
      for (const l of ctx.landmarks) if (Math.hypot(wx - l.position[0], wz - l.position[2]) < radius + 30) score += 20;
      score += rng.next() * 0.15;
      if (score < bestScore) {
        bestScore = score;
        best = [wx, wz];
      }
    }
  }
  return best;
}

/**
 * Blend heights toward the local mean within radius. Fully flat inside `plateau × radius`, blending out to
 * `radius` (building footprints need the whole slab flat: with a 0.55 plateau their corners sat on the
 * blend and the voxel surface rose into the interiors). Returns the base height. Also marks ground material.
 */
export function flattenArea(ctx: GenContext, center: Vec2, radius: number, strength = 0.8, targetHeight?: number, plateau = 0.55): number {
  const h = ctx.heights;
  const [ccx, ccz] = h.toCell(center[0], center[1]);
  const rc = Math.ceil(radius / ctx.cellSize) + 1;
  let sum = 0;
  let count = 0;
  for (let dz = -rc; dz <= rc; dz++) {
    for (let dx = -rc; dx <= rc; dx++) {
      const x = Math.round(ccx) + dx;
      const z = Math.round(ccz) + dz;
      if (x < 0 || z < 0 || x >= ctx.width || z >= ctx.depth) continue;
      const [wx, wz] = h.toWorld(x, z);
      const d = Math.hypot(wx - center[0], wz - center[1]);
      if (d > radius * 0.7) continue;
      const i = z * ctx.width + x;
      if (!Number.isNaN(ctx.water.data[i]!)) continue;
      sum += h.data[i]!;
      count++;
    }
  }
  const base = targetHeight ?? (count ? sum / count : h.sample(center[0], center[1]));
  for (let dz = -rc; dz <= rc; dz++) {
    for (let dx = -rc; dx <= rc; dx++) {
      const x = Math.round(ccx) + dx;
      const z = Math.round(ccz) + dz;
      if (x < 0 || z < 0 || x >= ctx.width || z >= ctx.depth) continue;
      const [wx, wz] = h.toWorld(x, z);
      const d = Math.hypot(wx - center[0], wz - center[1]);
      if (d > radius) continue;
      const i = z * ctx.width + x;
      if (!Number.isNaN(ctx.water.data[i]!)) continue;
      const w = (1 - smootherstep(radius * plateau, radius, d)) * strength;
      h.data[i] = lerp(h.data[i]!, base, w);
      if (w > 0.5 && ctx.materials[i] !== TERRAIN_MATERIAL_INDEX.Water) {
        // village ground: mostly grass with worn ground near the center
        if (d < radius * 0.3) ctx.materials[i] = TERRAIN_MATERIAL_INDEX.Ground;
      }
    }
  }
  return base;
}
