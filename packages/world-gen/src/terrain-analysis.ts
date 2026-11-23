import type { GenContext } from "./context";

/**
 * What the ground is, read before anything is built: every later stage that chooses a place (settlements, plots,
 * viewpoints) asks here instead of looking at one slope value.
 */
export const TERRAIN_CLASSES = ["water", "shore", "wet", "flat", "gentle", "slope", "steep", "cliff", "summit", "plateau", "valley", "depression"] as const;
export type TerrainClass = (typeof TERRAIN_CLASSES)[number];

export interface TerrainSample {
  cls: TerrainClass;
  /** Rise over run of the smoothed ground (a terrace edge does not count as a cliff). */
  slope: number;
  /** Height over the mean of the 48 studs around: positive on a hill, negative in a hollow. */
  tpi: number;
  /** 0 = lowest ground of the map, 1 = highest. */
  altitude: number;
  /** 0 = never build here, 1 = ideal. */
  buildable: number;
}

export interface TerrainAnalysis {
  at(x: number, z: number): TerrainSample;
  /** Share of the map per class. */
  shares: Record<string, number>;
}

/** Mean over a square window, in constant time per cell. */
function blur(src: Float32Array, w: number, d: number, r: number): Float32Array {
  const sum = new Float64Array((w + 1) * (d + 1));
  for (let z = 0; z < d; z++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += src[z * w + x]!;
      sum[(z + 1) * (w + 1) + x + 1] = sum[z * (w + 1) + x + 1]! + row;
    }
  }
  const out = new Float32Array(w * d);
  for (let z = 0; z < d; z++) {
    const z0 = Math.max(0, z - r);
    const z1 = Math.min(d, z + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      out[z * w + x] = (sum[z1 * (w + 1) + x1]! - sum[z0 * (w + 1) + x1]! - sum[z1 * (w + 1) + x0]! + sum[z0 * (w + 1) + x0]!) / ((z1 - z0) * (x1 - x0));
    }
  }
  return out;
}

export function analyzeTerrain(ctx: GenContext): TerrainAnalysis {
  const { width: w, depth: d, cellSize: cs } = ctx;
  const smooth = blur(ctx.heights.data, w, d, ctx.terrainMode === "parts" ? 3 : 1);
  const around = blur(ctx.heights.data, w, d, Math.max(2, Math.round(48 / cs)));
  const water = new Float32Array(ctx.water.data);
  const waterDistance = new Float32Array(ctx.waterDistance.data);
  const moisture = new Float32Array(ctx.moisture.data);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < smooth.length; i++) {
    if (smooth[i]! < lo) lo = smooth[i]!;
    if (smooth[i]! > hi) hi = smooth[i]!;
  }
  const range = Math.max(1, hi - lo);
  const bump = Math.max(5, range * 0.09);
  const sample = (ix: number, iz: number): TerrainSample => {
    const x = Math.max(0, Math.min(w - 1, ix));
    const z = Math.max(0, Math.min(d - 1, iz));
    const i = z * w + x;
    const x0 = Math.max(0, x - 1);
    const x1 = Math.min(w - 1, x + 1);
    const z0 = Math.max(0, z - 1);
    const z1 = Math.min(d - 1, z + 1);
    const slope = Math.hypot((smooth[z * w + x1]! - smooth[z * w + x0]!) / ((x1 - x0) * cs), (smooth[z1 * w + x]! - smooth[z0 * w + x]!) / ((z1 - z0) * cs));
    const tpi = smooth[i]! - around[i]!;
    const altitude = (smooth[i]! - lo) / range;
    const wet = !Number.isNaN(water[i]!);
    const wd = waterDistance[i]!;
    let cls: TerrainClass;
    if (wet) cls = "water";
    else if (slope > 0.95) cls = "cliff";
    else if (slope > 0.5) cls = "steep";
    else if (tpi > bump) cls = "summit";
    else if (wd < 14 && slope < 0.35) cls = "shore";
    else if (tpi < -bump && slope < 0.16) cls = "depression";
    else if (tpi < -bump * 0.6) cls = "valley";
    else if (wd < 46 && slope < 0.12 && moisture[i]! > 0.68) cls = "wet";
    else if (altitude > 0.62 && slope < 0.12) cls = "plateau";
    else if (slope < 0.1) cls = "flat";
    else if (slope < 0.26) cls = "gentle";
    else cls = "slope";
    let buildable = wet || slope > 0.6 ? 0 : 1 - slope / 0.6;
    if (cls === "shore") buildable *= 0.55;
    else if (cls === "wet") buildable *= 0.7;
    else if (cls === "depression") buildable *= 0.75;
    else if (cls === "summit") buildable *= 0.85;
    return { cls, slope, tpi, altitude, buildable };
  };
  const counts: Record<string, number> = {};
  let n = 0;
  for (let z = 0; z < d; z += 2) {
    for (let x = 0; x < w; x += 2) {
      const c = sample(x, z).cls;
      counts[c] = (counts[c] ?? 0) + 1;
      n++;
    }
  }
  const shares: Record<string, number> = {};
  for (const c of TERRAIN_CLASSES) if (counts[c]) shares[c] = Math.round((counts[c]! / n) * 1000) / 1000;
  return {
    at: (x, z) => {
      const [cx, cz] = ctx.heights.toCell(x, z);
      return sample(Math.round(cx), Math.round(cz));
    },
    shares,
  };
}
