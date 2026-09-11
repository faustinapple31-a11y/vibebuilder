import type { Vec2 } from "@worldforge/core";

/** Binary min-heap keyed on f-score. */
class MinHeap {
  private a: number[] = [];
  private f: Float64Array;
  constructor(size: number) {
    this.f = new Float64Array(size);
  }
  push(i: number, f: number): void {
    this.f[i] = f;
    this.a.push(i);
    this.up(this.a.length - 1);
  }
  pop(): number | undefined {
    const a = this.a;
    if (a.length === 0) return undefined;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      this.down(0);
    }
    return top;
  }
  get size(): number {
    return this.a.length;
  }
  private up(i: number): void {
    const a = this.a;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[a[p]!]! <= this.f[a[i]!]!) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }
  private down(i: number): void {
    const a = this.a;
    const n = a.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.f[a[l]!]! < this.f[a[m]!]!) m = l;
      if (r < n && this.f[a[r]!]! < this.f[a[m]!]!) m = r;
      if (m === i) break;
      [a[m], a[i]] = [a[i]!, a[m]!];
      i = m;
    }
  }
}

export interface AStarOptions {
  width: number;
  depth: number;
  /** Cost to move from cell a to neighbor b (Infinity = blocked). Receives distance factor (1 or 1.414). */
  cost: (ax: number, az: number, bx: number, bz: number, dist: number) => number;
  heuristicWeight?: number;
  maxIterations?: number;
}

/** A* on an 8-connected grid. Returns cell coordinates path or null. */
export function astar(start: Vec2, goal: Vec2, opts: AStarOptions): Vec2[] | null {
  const { width, depth } = opts;
  const n = width * depth;
  const sx = Math.round(start[0]);
  const sz = Math.round(start[1]);
  const gx = Math.round(goal[0]);
  const gz = Math.round(goal[1]);
  const idx = (x: number, z: number) => z * width + x;
  const g = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new MinHeap(n);
  const hw = opts.heuristicWeight ?? 1.0;
  const heur = (x: number, z: number) => Math.hypot(x - gx, z - gz) * hw;
  const si = idx(sx, sz);
  g[si] = 0;
  heap.push(si, heur(sx, sz));
  const dirs = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.41421356],
    [-1, -1, 1.41421356],
    [1, -1, 1.41421356],
    [-1, 1, 1.41421356],
  ] as const;
  const maxIt = opts.maxIterations ?? n * 4;
  let it = 0;
  while (heap.size > 0 && it++ < maxIt) {
    const cur = heap.pop()!;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % width;
    const cz = Math.floor(cur / width);
    if (cx === gx && cz === gz) {
      const path: Vec2[] = [];
      let c = cur;
      while (c !== -1) {
        path.push([c % width, Math.floor(c / width)]);
        c = came[c]!;
      }
      return path.reverse();
    }
    for (const [dx, dz, dist] of dirs) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue;
      const ni = idx(nx, nz);
      if (closed[ni]) continue;
      const c = opts.cost(cx, cz, nx, nz, dist);
      if (!Number.isFinite(c)) continue;
      const ng = g[cur]! + c;
      if (ng < g[ni]!) {
        g[ni] = ng;
        came[ni] = cur;
        heap.push(ni, ng + heur(nx, nz));
      }
    }
  }
  return null;
}
