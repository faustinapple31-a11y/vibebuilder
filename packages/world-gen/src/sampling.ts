/**
 * Scatter that does not know about borders. Every point of the plane has its place decided by a hash of its cell, so the
 * same points come out whether the world is drawn whole, chunk by chunk, or one chunk again: nothing to stitch.
 */
export interface ScatterPoint {
  x: number;
  z: number;
  /** Seed of everything decided at this point. */
  seed: number;
  /** Name that stays the same from one generation to the next. */
  key: string;
}

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** 32-bit hash of a cell. */
export function cellHash(seed: number, x: number, z: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(x | 0, 0x27d4eb2f) ^ Math.imul(z | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

/** How far a decision can depend on what is around it. */
const PASSES = 5;

/**
 * Points at least `r` apart, as many as fit: one candidate per cell, and at each pass the candidates that beat all their
 * remaining neighbours stay. Depends only on the seed, so any window gives the points of the whole.
 */
export function scatter(seed: number, r: number, rect: Rect): ScatterPoint[] {
  const c = r * 0.5;
  const margin = Math.ceil((PASSES * 2 * r) / c) + 2;
  const gx0 = Math.floor(rect.x0 / c) - margin;
  const gz0 = Math.floor(rect.z0 / c) - margin;
  const w = Math.ceil(rect.x1 / c) + margin - gx0 + 1;
  const d = Math.ceil(rect.z1 / c) + margin - gz0 + 1;
  const n = w * d;
  const px = new Float32Array(n);
  const pz = new Float32Array(n);
  const pr = new Uint32Array(n);
  /** 0 waiting, 1 kept, 2 refused. */
  const state = new Uint8Array(n);
  for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i;
    const h = cellHash(seed, gx0 + i, gz0 + j);
    pr[k] = h;
    px[k] = (gx0 + i + (h & 0xffff) / 65536) * c;
    pz[k] = (gz0 + j + (h >>> 16) / 65536) * c;
    pr[k] = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
  }
  const r2 = r * r;
  for (let pass = 0; pass < PASSES; pass++) {
    const kept: number[] = [];
    for (let j = 2; j < d - 2; j++) for (let i = 2; i < w - 2; i++) {
      const k = j * w + i;
      if (state[k] !== 0) continue;
      let best = true;
      for (let dj = -2; dj <= 2 && best; dj++) for (let di = -2; di <= 2; di++) {
        if (!di && !dj) continue;
        const q = k + dj * w + di;
        if (state[q] !== 0) continue;
        const dx = px[q]! - px[k]!;
        const dz = pz[q]! - pz[k]!;
        if (dx * dx + dz * dz < r2 && (pr[q]! > pr[k]! || (pr[q] === pr[k] && q > k))) {
          best = false;
          break;
        }
      }
      if (best) kept.push(k);
    }
    for (const k of kept) state[k] = 1;
    for (const k of kept) for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const q = k + dj * w + di;
      if (state[q] !== 0) continue;
      const dx = px[q]! - px[k]!;
      const dz = pz[q]! - pz[k]!;
      if (dx * dx + dz * dz < r2) state[q] = 2;
    }
  }
  const out: ScatterPoint[] = [];
  for (let k = 0; k < n; k++) {
    if (state[k] !== 1) continue;
    const x = px[k]!;
    const z = pz[k]!;
    if (x < rect.x0 || z < rect.z0 || x >= rect.x1 || z >= rect.z1) continue;
    const i = gx0 + (k % w);
    const j = gz0 + Math.floor(k / w);
    out.push({ x, z, seed: cellHash(seed ^ 0x51ed270b, i, j), key: `${i}_${j}` });
  }
  return out;
}
