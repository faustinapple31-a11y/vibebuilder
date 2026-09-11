import { clamp, type Vec2 } from "@worldforge/core";

/** Float grid with world-space sampling helpers. Row-major: index = z * width + x. */
export class Grid {
  readonly data: Float32Array;
  constructor(
    readonly width: number,
    readonly depth: number,
    readonly cellSize: number,
    readonly origin: Vec2,
    data?: Float32Array,
  ) {
    this.data = data ?? new Float32Array(width * depth);
  }

  clone(): Grid {
    return new Grid(this.width, this.depth, this.cellSize, this.origin, new Float32Array(this.data));
  }

  get(x: number, z: number): number {
    const cx = x < 0 ? 0 : x >= this.width ? this.width - 1 : x;
    const cz = z < 0 ? 0 : z >= this.depth ? this.depth - 1 : z;
    return this.data[cz * this.width + cx]!;
  }

  set(x: number, z: number, v: number): void {
    if (x < 0 || z < 0 || x >= this.width || z >= this.depth) return;
    this.data[z * this.width + x] = v;
  }

  /** World → cell coordinates (fractional). */
  toCell(wx: number, wz: number): Vec2 {
    return [(wx - this.origin[0]) / this.cellSize, (wz - this.origin[1]) / this.cellSize];
  }

  toWorld(cx: number, cz: number): Vec2 {
    return [this.origin[0] + cx * this.cellSize, this.origin[1] + cz * this.cellSize];
  }

  /** Bilinear sample at world coordinates. */
  sample(wx: number, wz: number): number {
    const [fx, fz] = this.toCell(wx, wz);
    const x0 = clamp(Math.floor(fx), 0, this.width - 1);
    const z0 = clamp(Math.floor(fz), 0, this.depth - 1);
    const x1 = Math.min(this.width - 1, x0 + 1);
    const z1 = Math.min(this.depth - 1, z0 + 1);
    const tx = clamp(fx - x0, 0, 1);
    const tz = clamp(fz - z0, 0, 1);
    const w = this.width;
    const d = this.data;
    const h00 = d[z0 * w + x0]!;
    const h10 = d[z0 * w + x1]!;
    const h01 = d[z1 * w + x0]!;
    const h11 = d[z1 * w + x1]!;
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }

  /** Slope (radians) at cell coordinates via central differences. */
  slopeAt(x: number, z: number): number {
    const gx = (this.get(x + 1, z) - this.get(x - 1, z)) / (2 * this.cellSize);
    const gz = (this.get(x, z + 1) - this.get(x, z - 1)) / (2 * this.cellSize);
    return Math.atan(Math.hypot(gx, gz));
  }

  slopeGrid(): Grid {
    const out = new Grid(this.width, this.depth, this.cellSize, this.origin);
    for (let z = 0; z < this.depth; z++) for (let x = 0; x < this.width; x++) out.data[z * this.width + x] = this.slopeAt(x, z);
    return out;
  }

  minMax(): [number, number] {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < this.data.length; i++) {
      const v = this.data[i]!;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return [min, max];
  }

  mean(): number {
    let s = 0;
    for (let i = 0; i < this.data.length; i++) s += this.data[i]!;
    return s / this.data.length;
  }

  std(): number {
    const m = this.mean();
    let s = 0;
    for (let i = 0; i < this.data.length; i++) {
      const dlt = this.data[i]! - m;
      s += dlt * dlt;
    }
    return Math.sqrt(s / this.data.length);
  }

  forEach(fn: (x: number, z: number, v: number, i: number) => void): void {
    for (let z = 0; z < this.depth; z++) {
      for (let x = 0; x < this.width; x++) {
        const i = z * this.width + x;
        fn(x, z, this.data[i]!, i);
      }
    }
  }

  map(fn: (x: number, z: number, v: number, i: number) => number): this {
    for (let z = 0; z < this.depth; z++) {
      for (let x = 0; x < this.width; x++) {
        const i = z * this.width + x;
        this.data[i] = fn(x, z, this.data[i]!, i);
      }
    }
    return this;
  }

  /** Separable box blur (radius in cells). Returns a new grid. */
  blur(radius: number, iterations = 1): Grid {
    let src = this.clone();
    if (radius <= 0) return src;
    for (let it = 0; it < iterations; it++) {
      const tmp = new Grid(this.width, this.depth, this.cellSize, this.origin);
      const w = this.width;
      const d = this.depth;
      // horizontal
      for (let z = 0; z < d; z++) {
        let sum = 0;
        let count = 0;
        for (let x = -radius; x <= radius; x++) {
          sum += src.get(x, z);
          count++;
        }
        for (let x = 0; x < w; x++) {
          tmp.data[z * w + x] = sum / count;
          sum += src.get(x + radius + 1, z) - src.get(x - radius, z);
        }
      }
      const out = new Grid(this.width, this.depth, this.cellSize, this.origin);
      for (let x = 0; x < w; x++) {
        let sum = 0;
        let count = 0;
        for (let z = -radius; z <= radius; z++) {
          sum += tmp.get(x, z);
          count++;
        }
        for (let z = 0; z < d; z++) {
          out.data[z * w + x] = sum / count;
          sum += tmp.get(x, z + radius + 1) - tmp.get(x, z - radius);
        }
      }
      src = out;
    }
    return src;
  }
}

/** Signed distance (approx) to a set of polylines, rasterized on a grid (world units). */
export function distanceToPolylinesGrid(grid: Grid, polylines: { points: Vec2[]; width: number }[], maxDist: number): Grid {
  const out = new Grid(grid.width, grid.depth, grid.cellSize, grid.origin);
  out.data.fill(maxDist);
  const cs = grid.cellSize;
  for (const pl of polylines) {
    const pts = pl.points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const minX = Math.min(a[0], b[0]) - maxDist;
      const maxX = Math.max(a[0], b[0]) + maxDist;
      const minZ = Math.min(a[1], b[1]) - maxDist;
      const maxZ = Math.max(a[1], b[1]) + maxDist;
      const [cx0, cz0] = grid.toCell(minX, minZ);
      const [cx1, cz1] = grid.toCell(maxX, maxZ);
      const abx = b[0] - a[0];
      const abz = b[1] - a[1];
      const ab2 = abx * abx + abz * abz || 1e-9;
      for (let z = Math.max(0, Math.floor(cz0)); z <= Math.min(grid.depth - 1, Math.ceil(cz1)); z++) {
        for (let x = Math.max(0, Math.floor(cx0)); x <= Math.min(grid.width - 1, Math.ceil(cx1)); x++) {
          const wx = grid.origin[0] + x * cs;
          const wz = grid.origin[1] + z * cs;
          const t = clamp(((wx - a[0]) * abx + (wz - a[1]) * abz) / ab2, 0, 1);
          const dx = wx - (a[0] + abx * t);
          const dz = wz - (a[1] + abz * t);
          const dist = Math.hypot(dx, dz) - pl.width / 2;
          const i = z * grid.width + x;
          if (dist < out.data[i]!) out.data[i] = dist;
        }
      }
    }
  }
  return out;
}

/** Simple spatial hash for placement collision queries. */
export class SpatialHash<T extends { position: [number, number, number]; radius: number }> {
  private cells = new Map<string, T[]>();
  constructor(private cellSize = 32) {}
  private key(x: number, z: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`;
  }
  insert(item: T): void {
    const r = item.radius;
    const x0 = Math.floor((item.position[0] - r) / this.cellSize);
    const x1 = Math.floor((item.position[0] + r) / this.cellSize);
    const z0 = Math.floor((item.position[2] - r) / this.cellSize);
    const z1 = Math.floor((item.position[2] + r) / this.cellSize);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const k = `${x},${z}`;
        let arr = this.cells.get(k);
        if (!arr) {
          arr = [];
          this.cells.set(k, arr);
        }
        arr.push(item);
      }
    }
  }
  /** Returns true if any item's circle (radius + margin) contains the point. */
  overlaps(x: number, z: number, radius: number, margin = 0): boolean {
    const x0 = Math.floor((x - radius - margin) / this.cellSize);
    const x1 = Math.floor((x + radius + margin) / this.cellSize);
    const z0 = Math.floor((z - radius - margin) / this.cellSize);
    const z1 = Math.floor((z + radius + margin) / this.cellSize);
    const seen = new Set<T>();
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this.cells.get(`${cx},${cz}`);
        if (!arr) continue;
        for (const it of arr) {
          if (seen.has(it)) continue;
          seen.add(it);
          const d = Math.hypot(it.position[0] - x, it.position[2] - z);
          if (d < it.radius + radius + margin) return true;
        }
      }
    }
    return false;
  }
  nearest(x: number, z: number, maxDist: number): T | null {
    const cellsR = Math.ceil(maxDist / this.cellSize);
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    let best: T | null = null;
    let bestD = maxDist;
    for (let dz = -cellsR; dz <= cellsR; dz++) {
      for (let dx = -cellsR; dx <= cellsR; dx++) {
        const arr = this.cells.get(`${cx + dx},${cz + dz}`);
        if (!arr) continue;
        for (const it of arr) {
          const d = Math.hypot(it.position[0] - x, it.position[2] - z);
          if (d < bestD) {
            bestD = d;
            best = it;
          }
        }
      }
    }
    return best;
  }
}
