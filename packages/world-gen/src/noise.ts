import { Rng } from "@worldforge/core";

/**
 * Seeded 2D simplex noise + fractal helpers.
 * Output of `noise2` is in [-1, 1].
 */
export class Simplex2D {
  private perm = new Uint8Array(512);
  private permMod12 = new Uint8Array(512);
  private static grad3 = [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
    [1, 0],
    [-1, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [0, 1],
    [0, -1],
  ];
  private static F2 = 0.5 * (Math.sqrt(3) - 1);
  private static G2 = (3 - Math.sqrt(3)) / 6;

  constructor(seed: number) {
    const rng = new Rng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = rng.int(0, i);
      const t = p[i]!;
      p[i] = p[j]!;
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255]!;
      this.permMod12[i] = this.perm[i]! % 12;
    }
  }

  noise2(xin: number, yin: number): number {
    const { F2, G2, grad3 } = Simplex2D;
    const perm = this.perm;
    const permMod12 = this.permMod12;
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    let i1: number;
    let j1: number;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    } else {
      i1 = 0;
      j1 = 1;
    }
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const gi0 = permMod12[ii + perm[jj]!]!;
    const gi1 = permMod12[ii + i1 + perm[jj + j1]!]!;
    const gi2 = permMod12[ii + 1 + perm[jj + 1]!]!;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      t0 *= t0;
      n0 = t0 * t0 * (grad3[gi0]![0]! * x0 + grad3[gi0]![1]! * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      t1 *= t1;
      n1 = t1 * t1 * (grad3[gi1]![0]! * x1 + grad3[gi1]![1]! * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      t2 *= t2;
      n2 = t2 * t2 * (grad3[gi2]![0]! * x2 + grad3[gi2]![1]! * y2);
    }
    return 70 * (n0 + n1 + n2);
  }

  /** Fractal Brownian motion in [-1, 1]. */
  fbm(x: number, y: number, octaves = 5, lacunarity = 2.0, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise2(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Ridged multifractal in [0, 1] — sharp ridges for mountains. */
  ridged(x: number, y: number, octaves = 5, lacunarity = 2.0, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    let weight = 1;
    for (let o = 0; o < octaves; o++) {
      let n = 1 - Math.abs(this.noise2(x * freq, y * freq));
      n *= n;
      n *= weight;
      weight = Math.max(0, Math.min(1, n * 2));
      sum += n * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Billowy noise in [0, 1] — soft rolling hills. */
  billow(x: number, y: number, octaves = 4): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * Math.abs(this.noise2(x * freq, y * freq));
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  /** Domain-warped fbm — organic, non-repetitive large forms. */
  warped(x: number, y: number, warpStrength = 0.6, octaves = 5): number {
    const qx = this.fbm(x + 0.0, y + 0.0, 3);
    const qy = this.fbm(x + 5.2, y + 1.3, 3);
    return this.fbm(x + warpStrength * qx, y + warpStrength * qy, octaves);
  }
}

/** Cellular (Worley) noise F1 in [0, 1] — used for clearing/clump masks. */
export class Worley2D {
  private rng: Rng;
  private cache = new Map<string, [number, number]>();
  constructor(private seed: number) {
    this.rng = new Rng(seed);
  }
  private feature(cx: number, cy: number): [number, number] {
    const key = `${cx},${cy}`;
    let f = this.cache.get(key);
    if (!f) {
      const r = new Rng((this.seed ^ Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) >>> 0);
      f = [cx + r.next(), cy + r.next()];
      this.cache.set(key, f);
    }
    return f;
  }
  f1(x: number, y: number): number {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let min = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const f = this.feature(cx + dx, cy + dy);
        const d = Math.hypot(f[0] - x, f[1] - y);
        if (d < min) min = d;
      }
    }
    return Math.min(1, min);
  }
}
