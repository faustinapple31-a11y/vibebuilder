import {
  computeBaseRadius,
  computeBounds,
  eulerFromXAxis,
  eulerFromYAxis,
  eulerXYZToMatrix,
  mat3Apply,
  mat3Mul,
  matrixToEulerXYZ,
  rotY,
  type Part,
  type PartEffect,
  type PartLight,
  type PrefabCategory,
  type PrefabVariant,
  type RobloxMaterial,
  type Rng,
  type StyleBible,
  type Vec3,
} from "@worldforge/core";

export interface PrefabContext {
  rng: Rng;
  style: StyleBible;
}

export interface PartOptions {
  material?: RobloxMaterial;
  rotation?: Vec3;
  transparency?: number;
  reflectance?: number;
  castShadow?: boolean;
  collide?: boolean;
  light?: PartLight;
  effect?: PartEffect;
  name?: string;
  lod?: 0 | 1 | 2;
}

export const v3 = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s],
  len: (a: Vec3): number => Math.hypot(a[0], a[1], a[2]),
  norm: (a: Vec3): Vec3 => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  /** Unit vector from a horizontal angle (radians, 0 = +Z, π/2 = +X) and an elevation (radians). */
  fromAngles: (yaw: number, elevation: number): Vec3 => [Math.sin(yaw) * Math.cos(elevation), Math.sin(elevation), Math.cos(yaw) * Math.cos(elevation)],
};

/**
 * Small fluent helper to assemble a PartList. Positions are prefab-local, origin at ground.
 *
 * Every primitive is placed by its center and an Euler XYZ rotation; `segment` and `beam`
 * place a primitive *between two points*, so chained geometry (trunks, branches, roots,
 * rafters, chains) is connected by construction — nothing is left floating.
 */
export class PartListBuilder {
  readonly parts: Part[] = [];

  add(part: Part): this {
    this.parts.push(part);
    return this;
  }

  box(position: Vec3, size: Vec3, color: string, opts: PartOptions = {}): this {
    return this.add({ shape: "box", position, size, color, rotation: opts.rotation ?? [0, 0, 0], material: opts.material ?? "SmoothPlastic", ...strip(opts) });
  }

  sphere(position: Vec3, diameter: number, color: string, opts: PartOptions = {}): this {
    return this.add({ shape: "sphere", position, size: [diameter, diameter, diameter], color, rotation: opts.rotation ?? [0, 0, 0], material: opts.material ?? "SmoothPlastic", ...strip(opts) });
  }

  /** Y-up cylinder: size = [diameter, height, diameter]. */
  cylinder(position: Vec3, diameter: number, height: number, color: string, opts: PartOptions = {}): this {
    return this.add({ shape: "cylinder", position, size: [diameter, height, diameter], color, rotation: opts.rotation ?? [0, 0, 0], material: opts.material ?? "SmoothPlastic", ...strip(opts) });
  }

  /** Wedge: vertical face at +Z, slope descends toward -Z. */
  wedge(position: Vec3, size: Vec3, color: string, opts: PartOptions = {}): this {
    return this.add({ shape: "wedge", position, size, color, rotation: opts.rotation ?? [0, 0, 0], material: opts.material ?? "SmoothPlastic", ...strip(opts) });
  }

  /** Cylinder whose axis runs from `from` to `to` (plus `overlap` studs at both ends so joints never show a gap). */
  segment(from: Vec3, to: Vec3, diameter: number, color: string, opts: PartOptions & { overlap?: number; roll?: number } = {}): this {
    const d = v3.sub(to, from);
    const len = v3.len(d);
    if (len < 1e-4) return this;
    const overlap = opts.overlap ?? Math.min(diameter * 0.35, len * 0.25);
    const { overlap: _o, roll, ...rest } = opts;
    return this.cylinder(v3.lerp(from, to, 0.5), diameter, len + overlap * 2, color, { ...rest, rotation: eulerFromYAxis(d, roll ?? 0) });
  }

  /** Box whose local X axis runs from `from` to `to`; `height` is the local Y thickness, `width` the local Z thickness. */
  beam(from: Vec3, to: Vec3, height: number, width: number, color: string, opts: PartOptions & { overlap?: number; roll?: number } = {}): this {
    const d = v3.sub(to, from);
    const len = v3.len(d);
    if (len < 1e-4) return this;
    const { overlap = 0, roll, ...rest } = opts;
    return this.box(v3.lerp(from, to, 0.5), [len + overlap * 2, height, width], color, { ...rest, rotation: eulerFromXAxis(d, roll ?? 0) });
  }

  /** Chain of tapered cylinder segments through `points` (diameter interpolates from d0 to d1). */
  chain(points: Vec3[], d0: number, d1: number, color: string, opts: PartOptions = {}): this {
    for (let i = 0; i + 1 < points.length; i++) {
      const t = (i + 0.5) / (points.length - 1);
      this.segment(points[i]!, points[i + 1]!, d0 + (d1 - d0) * t, color, opts);
    }
    return this;
  }

  /** Invisible emitter volume for an ambient particle effect. */
  effect(position: Vec3, size: Vec3, effect: PartEffect, opts: Pick<PartOptions, "lod" | "name"> = {}): this {
    return this.add({ shape: "box", position, size, color: effect.color ?? "#ffffff", rotation: [0, 0, 0], material: "SmoothPlastic", transparency: 1, collide: false, castShadow: false, effect, lod: opts.lod ?? 0, name: opts.name ?? `fx_${effect.kind}` });
  }

  /** Gable roof made of two wedges. Ridge along X. */
  gableRoof(center: Vec3, width: number, depth: number, height: number, color: string, opts: PartOptions = {}): this {
    const half = depth / 2;
    this.wedge([center[0], center[1], center[2] - half / 2], [width, height, half], color, { ...opts, rotation: [0, 0, 0] });
    this.wedge([center[0], center[1], center[2] + half / 2], [width, height, half], color, { ...opts, rotation: [0, 180, 0] });
    return this;
  }

  /** CornerWedge (Roblox CornerWedgePart): apex above the local (+X, -Z) corner, sloped faces toward -X and +Z. */
  cornerWedge(position: Vec3, size: Vec3, color: string, opts: PartOptions = {}): this {
    return this.add({ shape: "cornerWedge", position, size, color, rotation: opts.rotation ?? [0, 0, 0], material: opts.material ?? "SmoothPlastic", ...strip(opts) });
  }

  /**
   * True four-sided pyramid (hip roof, conifer layer) from 4 CornerWedgeParts whose apexes meet at the
   * centre. `center` is the centre of the base rectangle at mid-height (same convention as gableRoof).
   */
  pyramidRoof(center: Vec3, width: number, depth: number, height: number, color: string, opts: PartOptions = {}): this {
    const qx = width / 4;
    const qz = depth / 4;
    const size: Vec3 = [width / 2, height, depth / 2];
    const yaw = opts.rotation?.[1] ?? 0;
    const place = (ox: number, oz: number, ry: number) => {
      const r = (yaw * Math.PI) / 180;
      const x = ox * Math.cos(r) + oz * Math.sin(r);
      const z = -ox * Math.sin(r) + oz * Math.cos(r);
      // pieces rotated ±90° swap their footprint extents
      const sz: Vec3 = ry % 180 === 0 ? size : [depth / 2, height, width / 2];
      this.cornerWedge([center[0] + x, center[1], center[2] + z], sz, color, { ...opts, rotation: [0, ry + yaw, 0] });
    };
    place(-qx, qz, 0);
    place(qx, qz, 90);
    place(qx, -qz, 180);
    place(-qx, -qz, 270);
    return this;
  }

  /**
   * Overlapping shingle strips laid on both slopes of a gable roof (ridge along X).
   * Each strip is a thin beam rotated to lie flat on the slope.
   */
  roofShingles(center: Vec3, width: number, depth: number, height: number, rows: number, color: string, opts: PartOptions = {}): this {
    const half = depth / 2;
    const slopeLen = Math.hypot(half, height);
    const rowLen = slopeLen / rows;
    for (const side of [-1, 1]) {
      for (let i = 0; i < rows; i++) {
        const t0 = i / rows;
        const t1 = (i + 1) / rows;
        // point on the slope: eave (t=0) → ridge (t=1)
        const p0: Vec3 = [center[0], center[1] - height / 2 + t0 * height, center[2] + side * (half - t0 * half)];
        const p1: Vec3 = [center[0], center[1] - height / 2 + t1 * height, center[2] + side * (half - t1 * half)];
        const mid = v3.lerp(p0, p1, 0.5);
        const dir = v3.sub(p1, p0);
        // strip lies along the slope: local Z follows the slope direction, X follows the ridge
        const up = v3.norm([0, half, side * height]);
        const off = v3.scale(up, 0.18 + (i % 2) * 0.05);
        this.box(v3.add(mid, off), [width - i * 0.02, 0.28, rowLen * 1.12], i % 2 === 0 ? color : shade(color, -0.04), { ...opts, rotation: eulerFromZAxis(dir), lod: opts.lod ?? 0 });
      }
    }
    return this;
  }

  translate(offset: Vec3): this {
    for (const p of this.parts) {
      p.position = [p.position[0] + offset[0], p.position[1] + offset[1], p.position[2] + offset[2]];
    }
    return this;
  }

  scale(factor: number): this {
    for (const p of this.parts) {
      p.position = [p.position[0] * factor, p.position[1] * factor, p.position[2] * factor];
      p.size = [p.size[0] * factor, p.size[1] * factor, p.size[2] * factor];
      if (p.light) p.light = { ...p.light, range: p.light.range * factor };
    }
    return this;
  }

  /** Rotate all parts around the Y axis (degrees) about the origin — composes properly with tilted parts. */
  rotateY(deg: number): this {
    const rad = (deg * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const R = rotY(deg);
    for (const p of this.parts) {
      const [x, y, z] = p.position;
      p.position = [x * c + z * s, y, -x * s + z * c];
      p.rotation = matrixToEulerXYZ(mat3Mul(R, eulerXYZToMatrix(p.rotation)));
    }
    return this;
  }

  merge(other: PartListBuilder): this {
    this.parts.push(...other.parts);
    return this;
  }

  /** Rotate every part about the origin by `rotation` (Euler XYZ degrees), then translate by `offset`. */
  transform(rotation: Vec3, offset: Vec3 = [0, 0, 0]): this {
    const R = eulerXYZToMatrix(rotation);
    for (const p of this.parts) {
      const v = mat3Apply(R, p.position);
      p.position = [v[0] + offset[0], v[1] + offset[1], v[2] + offset[2]];
      p.rotation = matrixToEulerXYZ(mat3Mul(R, eulerXYZToMatrix(p.rotation)));
    }
    return this;
  }

  build(input: {
    id: string;
    prefab: string;
    category: PrefabCategory;
    sinkDepth?: number;
    footprintRadius?: number;
    baseRadius?: number;
    tags?: string[];
  }): PrefabVariant {
    const bounds = computeBounds(this.parts);
    const footprint = input.footprintRadius ?? Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0]), Math.abs(bounds.min[2]), Math.abs(bounds.max[2]));
    const sink = input.sinkDepth ?? 0.5;
    const baseRadius = input.baseRadius ?? Math.max(0.5, computeBaseRadius(this.parts, sink + 0.6));
    return {
      id: input.id,
      prefab: input.prefab,
      category: input.category,
      parts: this.parts,
      bounds,
      sinkDepth: sink,
      footprintRadius: footprint,
      baseRadius: Math.min(baseRadius, footprint * 1.05),
      tags: input.tags ?? [],
    };
  }
}

/** Euler XYZ whose rotation maps local +Z onto `dir` (used for strips lying along a slope). */
export function eulerFromZAxis(dir: Vec3): Vec3 {
  // Rx(-90) maps local +Z onto +Y, so R = R_yAxis(dir) · Rx(-90) maps +Z onto dir.
  const e = eulerFromYAxis(dir);
  return matrixToEulerXYZ(mat3Mul(eulerXYZToMatrix(e), eulerXYZToMatrix([-90, 0, 0])));
}

function strip(opts: PartOptions): Omit<PartOptions, "material" | "rotation"> {
  const { material: _m, rotation: _r, ...rest } = opts;
  return rest;
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + amount))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export const jitter = (rng: Rng, amount: number): number => (rng.next() * 2 - 1) * amount;
export const jitterDeg = (rng: Rng, amount: number): Vec3 => [jitter(rng, amount), rng.float(0, 360), jitter(rng, amount)];
