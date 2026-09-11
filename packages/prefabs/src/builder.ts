import {
  computeBounds,
  type Part,
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
  name?: string;
  lod?: 0 | 1 | 2;
}

/**
 * Small fluent helper to assemble a PartList. Positions are prefab-local, origin at ground.
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

  /** Gable roof made of two wedges. Ridge along X. */
  gableRoof(center: Vec3, width: number, depth: number, height: number, color: string, opts: PartOptions = {}): this {
    const half = depth / 2;
    this.wedge([center[0], center[1], center[2] - half / 2], [width, height, half], color, { ...opts, rotation: [0, 0, 0] });
    this.wedge([center[0], center[1], center[2] + half / 2], [width, height, half], color, { ...opts, rotation: [0, 180, 0] });
    return this;
  }

  /** Four-sided pyramid roof from 4 wedges (approximate hip roof). */
  pyramidRoof(center: Vec3, width: number, depth: number, height: number, color: string, opts: PartOptions = {}): this {
    // Two crossing gables produce a chunky pyramid silhouette.
    this.gableRoof(center, width, depth, height, color, opts);
    this.wedge([center[0] - width / 4, center[1], center[2]], [depth, height, width / 2], color, { ...opts, rotation: [0, 90, 0] });
    this.wedge([center[0] + width / 4, center[1], center[2]], [depth, height, width / 2], color, { ...opts, rotation: [0, -90, 0] });
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

  /** Rotate all parts around the Y axis (degrees) about the origin. */
  rotateY(deg: number): this {
    const rad = (deg * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    for (const p of this.parts) {
      const [x, y, z] = p.position;
      p.position = [x * c + z * s, y, -x * s + z * c];
      p.rotation = [p.rotation[0], p.rotation[1] + deg, p.rotation[2]];
    }
    return this;
  }

  merge(other: PartListBuilder): this {
    this.parts.push(...other.parts);
    return this;
  }

  build(input: {
    id: string;
    prefab: string;
    category: PrefabCategory;
    sinkDepth?: number;
    footprintRadius?: number;
    tags?: string[];
  }): PrefabVariant {
    const bounds = computeBounds(this.parts);
    const footprint = input.footprintRadius ?? Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0]), Math.abs(bounds.min[2]), Math.abs(bounds.max[2]));
    return {
      id: input.id,
      prefab: input.prefab,
      category: input.category,
      parts: this.parts,
      bounds,
      sinkDepth: input.sinkDepth ?? 0.5,
      footprintRadius: footprint,
      tags: input.tags ?? [],
    };
  }
}

function strip(opts: PartOptions): Omit<PartOptions, "material" | "rotation"> {
  const { material: _m, rotation: _r, ...rest } = opts;
  return rest;
}

export const jitter = (rng: Rng, amount: number): number => (rng.next() * 2 - 1) * amount;
export const jitterDeg = (rng: Rng, amount: number): Vec3 => [jitter(rng, amount), rng.float(0, 360), jitter(rng, amount)];
