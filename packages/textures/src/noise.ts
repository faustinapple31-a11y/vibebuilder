import { Rng } from "@worldforge/core";

/**
 * Tileable 2D noise on a periodic lattice: sampling with a period equal to the texture's cell count
 * makes every map seamless, which is what terrain / part materials need.
 */
export class TileNoise {
  private table: Float32Array;
  constructor(seed: number, readonly size = 256) {
    const rng = new Rng(seed);
    this.table = new Float32Array(size * size);
    for (let i = 0; i < this.table.length; i++) this.table[i] = rng.next();
  }
  private at(x: number, y: number, px: number, py: number): number {
    const s = this.size;
    return this.table[((((y % py) + py) % py) % s) * s + ((((x % px) + px) % px) % s)]!;
  }
  /**
   * Value noise in [0, 1]. `x`, `y` in lattice units; the lattice wraps every `px` / `py` cells, so a
   * texture sampled over [0, px) × [0, py) is seamless.
   */
  value(x: number, y: number, px = this.size, py = px): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const a = this.at(x0, y0, px, py);
    const b = this.at(x0 + 1, y0, px, py);
    const c = this.at(x0, y0 + 1, px, py);
    const d = this.at(x0 + 1, y0 + 1, px, py);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }
  /** Fractal sum over texture space `u`, `v` ∈ [0, 1); `freq` = lattice cells across the tile (integer → seamless). */
  fbm(u: number, v: number, freq: number, octaves = 4, gain = 0.5): number {
    let amp = 1;
    let sum = 0;
    let norm = 0;
    let f = Math.max(1, Math.round(freq));
    for (let o = 0; o < octaves; o++) {
      sum += this.value(u * f, v * f, f, f) * amp;
      norm += amp;
      amp *= gain;
      f *= 2;
    }
    return sum / norm;
  }
  /** Ridged fbm (1 - |2n - 1|) for cracks and veins. */
  ridged(u: number, v: number, freq: number, octaves = 3): number {
    let amp = 1;
    let sum = 0;
    let norm = 0;
    let f = Math.max(1, Math.round(freq));
    for (let o = 0; o < octaves; o++) {
      sum += (1 - Math.abs(2 * this.value(u * f, v * f, f, f) - 1)) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }
  /** Anisotropic tileable value noise over texture space (streaks): `fx` cells across, `fy` cells down. */
  streak(u: number, v: number, fx: number, fy: number): number {
    return this.value(u * fx, v * fy, Math.max(1, Math.round(fx)), Math.max(1, Math.round(fy)));
  }
}

/** Tileable Worley (cell) noise: returns [distance to nearest feature (0..~1), cell id (0..1), distance to second nearest]. */
export class TileCells {
  private points: { x: number; y: number; id: number }[][] = [];
  constructor(seed: number, readonly cells: number) {
    const rng = new Rng(seed);
    for (let cy = 0; cy < cells; cy++) {
      const row: { x: number; y: number; id: number }[] = [];
      for (let cx = 0; cx < cells; cx++) row.push({ x: cx + rng.next(), y: cy + rng.next(), id: rng.next() });
      this.points.push(row);
    }
  }
  sample(u: number, v: number): [number, number, number] {
    const n = this.cells;
    const x = u * n;
    const y = v * n;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let d1 = Infinity;
    let d2 = Infinity;
    let id = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const gx = cx + ox;
        const gy = cy + oy;
        const p = this.points[((gy % n) + n) % n]![((gx % n) + n) % n]!;
        // wrap the feature point next to the sample
        const px = p.x + (gx - (((gx % n) + n) % n));
        const py = p.y + (gy - (((gy % n) + n) % n));
        const d = Math.hypot(px - x, py - y);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = p.id;
        } else if (d < d2) d2 = d;
      }
    }
    return [d1, id, d2];
  }
}

export const smooth = (t: number) => t * t * (3 - 2 * t);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
