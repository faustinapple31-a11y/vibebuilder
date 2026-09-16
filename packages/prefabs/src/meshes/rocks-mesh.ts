import { jitterHex, type MeshData, type Rng, type StyleBible, type Vec3 } from "@worldforge/core";
import { MeshBuilder, ValueNoise3D, normalize } from "./mesh-builder";

/**
 * Procedural rock meshes: displaced icospheres (low-poly, flat-shaded) shaped by the style —
 * `rock.variation` (low = smooth pebbles, high = craggy), `geometry` (angular = faceted, rounded =
 * soft). Every mesh is centred on its bounds so the part position is the rock centre.
 */
export interface RockShape {
  /** Radii (studs) along x / y / z before displacement. */
  radius: Vec3;
  /** Displacement amplitude as a fraction of the radius (0.05 pebble … 0.35 crag). */
  rough: number;
  /** Noise frequency (1 = one bump per rock, 3 = fine). */
  frequency: number;
  /** Flatten the bottom at this fraction of the y radius below centre (0.6 = a resting rock). */
  flatten: number;
  /** Quantize the displacement into facets (angular styles). */
  facets?: number;
  subdivisions?: number;
}

export function rockMesh(rng: Rng, shape: RockShape): MeshData {
  const noise = new ValueNoise3D(rng, 16);
  const off: Vec3 = [rng.float(0, 8), rng.float(0, 8), rng.float(0, 8)];
  const sub = shape.subdivisions ?? 2;
  const m = MeshBuilder.icosphere(sub);
  const f = shape.frequency;
  m.displace((d) => {
    let n = noise.fbm(d[0] * f + off[0], d[1] * f + off[1], d[2] * f + off[2], 3, 0.55);
    if (shape.facets) n = Math.round(n * shape.facets) / shape.facets;
    return n * shape.rough;
  });
  m.scale(shape.radius[0], shape.radius[1], shape.radius[2]);
  // rest on a flat base
  m.flattenBelow(-shape.radius[1] * shape.flatten);
  return centred(m);
}

/** Centre the mesh on its bounds centre and build. */
export function centred(m: MeshBuilder): MeshData {
  const b = m.bounds();
  m.translate(-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -(b.min[2] + b.max[2]) / 2);
  return m.build();
}

/** Style → rock shape parameters for a rock of `size` studs. */
export function rockShapeFor(style: StyleBible, rng: Rng, size: number, kind: "boulder" | "cliff" | "pebble"): RockShape {
  const angular = style.geometry === "angular" || style.geometry === "blocky";
  const rounded = style.geometry === "rounded" || style.geometry === "smooth_low_poly";
  const variation = style.rock.variation === "high" ? 1 : style.rock.variation === "medium" ? 0.6 : 0.3;
  if (kind === "cliff") {
    return {
      radius: [size * rng.float(0.5, 0.7), size * rng.float(0.45, 0.8), size * rng.float(0.4, 0.6)],
      rough: 0.18 + variation * 0.18,
      frequency: rng.float(1.4, 2.2),
      flatten: 0.55,
      facets: angular ? 3 : rounded ? undefined : 5,
      subdivisions: 2,
    };
  }
  if (kind === "pebble") {
    return { radius: [size * 0.5, size * rng.float(0.3, 0.42), size * rng.float(0.4, 0.55)], rough: 0.06 + variation * 0.08, frequency: 2, flatten: 0.5, subdivisions: 1 };
  }
  return {
    radius: [size * rng.float(0.45, 0.6), size * rng.float(0.35, 0.55), size * rng.float(0.4, 0.6)],
    rough: 0.1 + variation * 0.2,
    frequency: rng.float(1.2, 2.2),
    flatten: 0.6,
    facets: angular ? 4 : undefined,
    subdivisions: size > 9 ? 2 : 1,
  };
}

export function rockColor(style: StyleBible, rng: Rng): string {
  const v = style.rock.variation === "high" ? 0.09 : style.rock.variation === "medium" ? 0.05 : 0.02;
  return jitterHex(style.palette.stone, (rng.next() * 2 - 1) * 8, (rng.next() * 2 - 1) * 0.05, (rng.next() * 2 - 1) * v);
}

/** Low-poly canopy blob: a squashed, lightly displaced icosphere (deciduous crowns, bushes). */
export function canopyMesh(rng: Rng, radius: number, squash = 0.8, rough = 0.12): MeshData {
  const noise = new ValueNoise3D(rng, 16);
  const off: Vec3 = [rng.float(0, 8), rng.float(0, 8), rng.float(0, 8)];
  const m = MeshBuilder.icosphere(1);
  m.displace((d) => noise.fbm(d[0] * 2 + off[0], d[1] * 2 + off[1], d[2] * 2 + off[2], 2) * rough);
  m.scale(radius, radius * squash, radius);
  return centred(m);
}

export { normalize };
