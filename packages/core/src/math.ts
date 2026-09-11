export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);
export const clamp01 = (v: number): number => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const inverseLerp = (a: number, b: number, v: number): number => (a === b ? 0 : (v - a) / (b - a));
export const remap = (v: number, inMin: number, inMax: number, outMin: number, outMax: number): number =>
  lerp(outMin, outMax, clamp01(inverseLerp(inMin, inMax, v)));

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export const degToRad = (d: number): number => (d * Math.PI) / 180;
export const radToDeg = (r: number): number => (r * 180) / Math.PI;

export const dist2 = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const dist3 = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function v3add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function v3scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
export function v3len(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
export function v3norm(a: Vec3): Vec3 {
  const l = v3len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** Rotate a point around the Y axis (radians). */
export function rotateY(p: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}

/** Chaikin corner cutting for polyline smoothing. */
export function chaikin(points: Vec2[], iterations = 2): Vec2[] {
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    if (pts.length < 3) return pts;
    const out: Vec2[] = [pts[0]!];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i]!;
      const q = pts[i + 1]!;
      out.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]]);
      out.push([0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
    }
    out.push(pts[pts.length - 1]!);
    pts = out;
  }
  return pts;
}

/** Distance from point to segment. */
export function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const apx = p[0] - a[0];
  const apy = p[1] - a[1];
  const ab2 = abx * abx + aby * aby;
  const t = ab2 === 0 ? 0 : clamp01((apx * abx + apy * aby) / ab2);
  const cx = a[0] + abx * t;
  const cy = a[1] + aby * t;
  return Math.hypot(p[0] - cx, p[1] - cy);
}

export function polylineLength(points: Vec2[]): number {
  let l = 0;
  for (let i = 1; i < points.length; i++) l += dist2(points[i - 1]!, points[i]!);
  return l;
}

/** Resample a polyline at a fixed step distance. */
export function resamplePolyline(points: Vec2[], step: number): Vec2[] {
  if (points.length < 2) return points.slice();
  const out: Vec2[] = [points[0]!];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const segLen = dist2(a, b);
    if (segLen === 0) continue;
    let d = step - carry;
    while (d <= segLen) {
      const t = d / segLen;
      out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]);
      d += step;
    }
    carry = segLen - (d - step);
  }
  const last = points[points.length - 1]!;
  if (dist2(out[out.length - 1]!, last) > step * 0.25) out.push(last);
  return out;
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]![0];
    const yi = poly[i]![1];
    const xj = poly[j]![0];
    const yj = poly[j]![1];
    const intersect = yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export interface AABB2 {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export function aabbOverlap(a: AABB2, b: AABB2, margin = 0): boolean {
  return !(a.maxX + margin < b.minX || b.maxX + margin < a.minX || a.maxZ + margin < b.minZ || b.maxZ + margin < a.minZ);
}

export function aabbContains(a: AABB2, p: Vec2, margin = 0): boolean {
  return p[0] >= a.minX - margin && p[0] <= a.maxX + margin && p[1] >= a.minZ - margin && p[1] <= a.maxZ + margin;
}
