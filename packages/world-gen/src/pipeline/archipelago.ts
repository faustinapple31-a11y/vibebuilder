import { Rng, deriveSeed, lerp, smoothstep, type TerrainFeature, type Vec2 } from "@worldforge/core";
import { Simplex2D } from "../noise";
import { Grid } from "../grid";
import { normToWorld, seaLevelOf, type GenContext } from "../context";

/**
 * Archipelago: stylized mesa islands — perfectly flat grass plateaus stacked in terraces, sheer cliff walls
 * straight into a bright sea, no beaches. The main island sits near the centre; the others are scattered at
 * bridge distance around it. The stage overrides the heightmap (no erosion / detail on the plateaus), sets
 * the ocean masks the other stages read, and records the islands (`ctx.islands`) for the bridges, stairs
 * and site placement.
 */
export type Archipelago = Extract<TerrainFeature, { type: "archipelago" }>;

export interface Terrace {
  center: Vec2;
  radius: number;
  /** plateau surface height (studs) */
  height: number;
  /** 0 = island base */
  level: number;
  /** wobbled rim, world coordinates (filled by applyArchipelago) */
  outline?: Vec2[];
}

export interface Island {
  id: string;
  center: Vec2;
  radius: number;
  /** base plateau height */
  height: number;
  terraces: Terrace[];
  main: boolean;
  outline?: Vec2[];
}

interface Layout {
  islands: Island[];
  step: number;
  sea: number;
}

/** Studs per terrace step for a cliffHeight setting. */
export function terraceStep(f: Archipelago): number {
  return 18 + f.cliffHeight * 22;
}

export function layoutArchipelago(ctx: GenContext, f: Archipelago): Layout {
  const { worldW, worldD } = ctx;
  const size = Math.min(worldW, worldD);
  const rng = new Rng(deriveSeed(ctx.seed, "archipelago"));
  const sea = seaLevelOf(ctx.spec);
  const step = terraceStep(f);
  const islands: Island[] = [];
  const margin = size * 0.06;
  const inside = (c: Vec2, r: number) => c[0] - r > ctx.origin[0] + margin && c[0] + r < ctx.origin[0] + worldW - margin && c[1] - r > ctx.origin[1] + margin && c[1] + r < ctx.origin[1] + worldD - margin;
  // main island near the centre
  const mainR = size * f.mainRadius;
  const mainC = normToWorld(ctx, [0.5 + rng.float(-0.06, 0.06), 0.5 + rng.float(-0.06, 0.06)]);
  islands.push({ id: "island_0", center: mainC, radius: mainR, height: sea + 10 + step * 0.6, terraces: [], main: true });
  // satellites: bridge distance (40–110 studs of water) from an existing island, not overlapping the others
  const gapMin = 40;
  const gapMax = 110;
  for (let n = 1; n < f.islands; n++) {
    let placed = false;
    for (let attempt = 0; attempt < 120 && !placed; attempt++) {
      const from = islands[rng.int(0, islands.length - 1)]!;
      const r = size * rng.float(0.07, 0.14);
      const a = rng.float(0, Math.PI * 2);
      const d = from.radius + r + rng.float(gapMin, gapMax);
      const c: Vec2 = [from.center[0] + Math.cos(a) * d, from.center[1] + Math.sin(a) * d];
      if (!inside(c, r)) continue;
      if (islands.some((o) => Math.hypot(o.center[0] - c[0], o.center[1] - c[1]) < o.radius + r + gapMin * 0.8)) continue;
      const level = rng.chance(0.4) ? 1 : 0;
      islands.push({ id: `island_${n}`, center: c, radius: r, height: sea + 10 + step * 0.6 + level * step, terraces: [], main: false });
      placed = true;
    }
  }
  // terraces: stacked plateaus, each one smaller and shifted, one step higher
  for (const isl of islands) {
    const count = isl.main ? f.terraces : Math.min(2, Math.max(1, Math.round(f.terraces * rng.float(0.2, 0.7))));
    let center = isl.center;
    let radius = isl.radius;
    for (let k = 1; k < count; k++) {
      const a = rng.float(0, Math.PI * 2);
      const shift = radius * rng.float(0.1, 0.22);
      center = [center[0] + Math.cos(a) * shift, center[1] + Math.sin(a) * shift];
      radius = radius * rng.float(0.62, 0.74);
      if (radius < 18) break;
      isl.terraces.push({ center, radius, height: isl.height + step * k, level: k });
    }
  }
  return { islands, step, sea };
}

/** Signed distance (studs, negative inside) to a wobbled disc. */
function discDistance(wx: number, wz: number, center: Vec2, radius: number, wobble: number, noise: Simplex2D): number {
  const w = noise.fbm(wx / (radius * 0.9) + 3.7, wz / (radius * 0.9) - 1.3, 3) * radius * 0.32 * wobble + noise.noise2(wx / 40 + 9, wz / 40 + 2) * radius * 0.05 * wobble;
  return Math.hypot(wx - center[0], wz - center[1]) + w - radius;
}

/**
 * Override the heightmap with the mesas and the sea floor; fills `ctx.ocean`, `ctx.shore`, `ctx.islands`,
 * `ctx.plateau` (level index per cell, -1 in the sea) and the cliff material hint.
 */
export function applyArchipelago(ctx: GenContext, f: Archipelago, ridge: Simplex2D): void {
  const { origin, cellSize, width, depth } = ctx;
  const layout = layoutArchipelago(ctx, f);
  const { islands, sea } = layout;
  const size = Math.min(ctx.worldW, ctx.worldD);
  const h = ctx.heights;
  const ocean = new Grid(width, depth, cellSize, origin);
  const shore = new Grid(width, depth, cellSize, origin);
  const plateau = new Grid(width, depth, cellSize, origin);
  // one cell of transition: the voxel writer averages 2×2 cells, anything wider reads as a slope
  const edgeIn = cellSize * 0.55;
  const edgeOut = cellSize * 0.2;
  h.map((x, z, _v, i) => {
    const wx = origin[0] + x * cellSize;
    const wz = origin[1] + z * cellSize;
    // nearest island (signed distance) and its surface height at this cell (terraces stack inside)
    let best = Infinity;
    let top = sea;
    let level = -1;
    for (const isl of islands) {
      const d = discDistance(wx, wz, isl.center, isl.radius, f.ruggedness, ridge);
      if (d < best) {
        best = d;
        top = isl.height;
        level = 0;
        for (const t of isl.terraces) {
          const dt = discDistance(wx, wz, t.center, t.radius, f.ruggedness * 0.8, ridge);
          if (dt < 0) {
            // sheer step between terraces as well (one cell)
            const k = 1 - smoothstep(-edgeIn, edgeOut, dt);
            top = lerp(top, t.height, k);
            if (dt < -edgeIn) level = t.level;
          }
        }
      }
    }
    const floorN = ridge.fbm(wx / 120, wz / 120, 3);
    const floor = sea - 7 - smoothstep(0, 90, best) * 22 + floorN * 3;
    const edge = smoothstep(-edgeIn, edgeOut, best);
    ocean.data[i] = smoothstep(-2, 8, best);
    shore.data[i] = best / size;
    plateau.data[i] = best < -edgeIn ? level : -1;
    return lerp(top, floor, edge);
  });
  ctx.ocean = ocean;
  ctx.shore = shore;
  ctx.plateau = plateau;
  ctx.islands = islands;
  ctx.cliffMaterial = "Ground";
  // rims for the part-built blocks (the ground of these worlds is parts, not voxels)
  for (const isl of islands) {
    isl.outline = outline(isl.center, isl.radius, f.ruggedness, ridge);
    for (const t of isl.terraces) t.outline = outline(t.center, t.radius, f.ruggedness * 0.8, ridge);
  }
}

/** The wobbled rim as a counter-clockwise polygon (N points, root of the signed distance along each ray). */
function outline(center: Vec2, radius: number, wobble: number, noise: Simplex2D, n = 32): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    let lo = radius * 0.3;
    let hi = radius * 1.9;
    // first outside sample, then bisection
    let r = lo;
    while (r < hi && discDistance(center[0] + dx * r, center[1] + dz * r, center, radius, wobble, noise) < 0) r += 2;
    hi = Math.min(hi, r);
    lo = Math.max(lo, r - 2);
    for (let k = 0; k < 8; k++) {
      const m = (lo + hi) / 2;
      if (discDistance(center[0] + dx * m, center[1] + dz * m, center, radius, wobble, noise) < 0) lo = m;
      else hi = m;
    }
    pts.push([center[0] + dx * lo, center[1] + dz * lo]);
  }
  return pts;
}
