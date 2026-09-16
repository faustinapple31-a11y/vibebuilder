import { f32ToBase64, type MeshData, type Rng, type Vec3 } from "@worldforge/core";

/**
 * Small procedural triangle-mesh toolkit for hero rocks, cliffs and canopies. Meshes are flat-shaded
 * triangle soups (three vertices per triangle, no index buffer): the low-poly look the styles ask for,
 * and the simplest thing both Roblox's EditableMesh and the three.js viewer can consume.
 */
export class MeshBuilder {
  /** Triangles as flat xyz triplets (9 floats per triangle). */
  tris: number[] = [];

  /** Unit icosphere (radius 1) with `subdivisions` (0 = 20 faces, 1 = 80, 2 = 320, 3 = 1280). */
  static icosphere(subdivisions: number): MeshBuilder {
    const t = (1 + Math.sqrt(5)) / 2;
    const verts: Vec3[] = [
      [-1, t, 0],
      [1, t, 0],
      [-1, -t, 0],
      [1, -t, 0],
      [0, -1, t],
      [0, 1, t],
      [0, -1, -t],
      [0, 1, -t],
      [t, 0, -1],
      [t, 0, 1],
      [-t, 0, -1],
      [-t, 0, 1],
    ].map((v) => normalize(v as Vec3));
    let faces: [Vec3, Vec3, Vec3][] = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ].map(([a, b, c]) => [verts[a]!, verts[b]!, verts[c]!]);
    for (let s = 0; s < subdivisions; s++) {
      const next: [Vec3, Vec3, Vec3][] = [];
      for (const [a, b, c] of faces) {
        const ab = normalize(mid(a, b));
        const bc = normalize(mid(b, c));
        const ca = normalize(mid(c, a));
        next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      }
      faces = next;
    }
    const m = new MeshBuilder();
    for (const [a, b, c] of faces) m.tris.push(...a, ...b, ...c);
    return m;
  }

  /** Apply `fn` to every vertex (shared vertices move together because the same coordinates map to the same output). */
  map(fn: (v: Vec3) => Vec3): this {
    const t = this.tris;
    for (let i = 0; i < t.length; i += 3) {
      const [x, y, z] = fn([t[i]!, t[i + 1]!, t[i + 2]!]);
      t[i] = x;
      t[i + 1] = y;
      t[i + 2] = z;
    }
    return this;
  }

  scale(sx: number, sy = sx, sz = sx): this {
    return this.map(([x, y, z]) => [x * sx, y * sy, z * sz]);
  }

  translate(dx: number, dy: number, dz: number): this {
    return this.map(([x, y, z]) => [x + dx, y + dy, z + dz]);
  }

  /** Rotate around Y (radians). */
  rotateY(a: number): this {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return this.map(([x, y, z]) => [x * c + z * s, y, -x * s + z * c]);
  }

  /** Radial displacement: each vertex moves along its direction from the origin by `fn(dir) * amount`. */
  displace(fn: (dir: Vec3, v: Vec3) => number): this {
    return this.map((v) => {
      const d = normalize(v);
      const k = fn(d, v);
      return [v[0] + d[0] * k, v[1] + d[1] * k, v[2] + d[2] * k];
    });
  }

  /** Clamp every vertex below `y` to `y` (a rock resting on the ground). */
  flattenBelow(y: number): this {
    return this.map((v) => [v[0], Math.max(v[1], y), v[2]]);
  }

  /** Append another builder's triangles. */
  merge(other: MeshBuilder): this {
    this.tris.push(...other.tris);
    return this;
  }

  bounds(): { min: Vec3; max: Vec3 } {
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    const t = this.tris;
    for (let i = 0; i < t.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = t[i + k]!;
        if (v < min[k]!) min[k] = v;
        if (v > max[k]!) max[k] = v;
      }
    }
    return { min, max };
  }

  /** Serialize (positions only; consumers rebuild flat normals). Drops degenerate triangles. */
  build(): MeshData {
    const t = this.tris;
    const out: number[] = [];
    for (let i = 0; i < t.length; i += 9) {
      const a: Vec3 = [t[i]!, t[i + 1]!, t[i + 2]!];
      const b: Vec3 = [t[i + 3]!, t[i + 4]!, t[i + 5]!];
      const c: Vec3 = [t[i + 6]!, t[i + 7]!, t[i + 8]!];
      const n = cross(sub(b, a), sub(c, a));
      if (Math.hypot(n[0], n[1], n[2]) < 1e-6) continue;
      out.push(...a, ...b, ...c);
    }
    const arr = new Float32Array(out);
    const bounds = this.bounds();
    return { trianglesB64: f32ToBase64(arr), triangleCount: out.length / 9, bounds };
  }
}

/** Cheap seeded 3D value noise (trilinear, smoothstep) in [-1, 1] — enough for rock displacement. */
export class ValueNoise3D {
  private table: Float32Array;
  constructor(rng: Rng, size = 64) {
    this.table = new Float32Array(size * size * size);
    for (let i = 0; i < this.table.length; i++) this.table[i] = rng.next() * 2 - 1;
    this.size = size;
  }
  private size: number;
  private at(x: number, y: number, z: number): number {
    const s = this.size;
    const ix = ((x % s) + s) % s;
    const iy = ((y % s) + s) % s;
    const iz = ((z % s) + s) % s;
    return this.table[(iz * s + iy) * s + ix]!;
  }
  noise(x: number, y: number, z: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const fz = smooth(z - z0);
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const c00 = lerp(this.at(x0, y0, z0), this.at(x0 + 1, y0, z0), fx);
    const c10 = lerp(this.at(x0, y0 + 1, z0), this.at(x0 + 1, y0 + 1, z0), fx);
    const c01 = lerp(this.at(x0, y0, z0 + 1), this.at(x0 + 1, y0, z0 + 1), fx);
    const c11 = lerp(this.at(x0, y0 + 1, z0 + 1), this.at(x0 + 1, y0 + 1, z0 + 1), fx);
    return lerp(lerp(c00, c10, fy), lerp(c01, c11, fy), fz);
  }
  fbm(x: number, y: number, z: number, octaves = 3, gain = 0.5, lacunarity = 2): number {
    let a = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += this.noise(x, y, z) * a;
      norm += a;
      a *= gain;
      x *= lacunarity;
      y *= lacunarity;
      z *= lacunarity;
    }
    return sum / norm;
  }
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
