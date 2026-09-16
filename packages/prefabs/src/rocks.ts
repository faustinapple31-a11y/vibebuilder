import { eulerFromYAxis, jitterHex, lightenHex, mixHex, type PrefabVariant, type Vec3 } from "@worldforge/core";
import { PartListBuilder, jitter, v3, type PrefabContext } from "./builder";
import type { MeshLibraryId } from "./meshes/library";

/** The voxel style keeps the boxy rock masses; every other style gets displaced-icosphere meshes. */
const meshRocks = (ctx: PrefabContext) => ctx.style.id !== "voxel";

/**
 * One mesh rock from the shared library (a client can only hold a few EditableMeshes, so every rock is one
 * of six meshes with its own non-uniform scale, rotation and colour), resting at `center`, with moss dressing.
 * Returns the placed height.
 */
function meshRock(b: PartListBuilder, ctx: PrefabContext, _key: string, center: Vec3, size: number, kind: "boulder" | "cliff" | "pebble" | "slab", lod: 0 | 1 | 2 = 2, collide = true): number {
  const { rng, style } = ctx;
  const id: MeshLibraryId = kind === "boulder" ? "rock_a" : kind === "pebble" ? "pebble_a" : kind === "slab" ? "cliff_b" : rng.chance(0.5) ? "cliff_a" : "cliff_b";
  const data = ctx.meshes[id];
  if (!data) return 0;
  const bw = data.bounds.max[0] - data.bounds.min[0];
  const bh = data.bounds.max[1] - data.bounds.min[1];
  const bd = data.bounds.max[2] - data.bounds.min[2];
  // fit the library mesh to `size` studs across, with independent jitter per axis for variety
  const sx = (size / bw) * rng.float(0.8, 1.25);
  const sy = (size * (kind === "pebble" ? 0.45 : kind === "slab" ? 0.35 : 0.85)) / bh * rng.float(0.8, 1.2);
  const sz = (size / bd) * rng.float(0.8, 1.25);
  const h = bh * sy;
  const color = stoneColor(ctx);
  // the mesh is centred on its bounds: lift it so its flat base sits at center.y (a little below for the sink)
  b.mesh(id, data, [center[0], center[1] + h / 2 - size * 0.06, center[2]], color, { material: style.materials.rock, rotation: [0, rng.float(0, 360), 0], collide, lod, fallback: kind === "cliff" || kind === "slab" ? "box" : "sphere", scale: [sx, sy, sz] });
  if (rng.chance(style.rock.mossChance * 0.6) && kind !== "pebble") {
    // a thin moss patch on the crown (a mesh rock's silhouette should stay the rock, not the moss)
    b.box([center[0] + jitter(rng, size * 0.12), center[1] + h * 0.9, center[2] + jitter(rng, size * 0.12)], [size * 0.32, size * 0.05, size * 0.26], style.palette.foliageAlt, {
      material: "Grass",
      rotation: [jitter(rng, 8), rng.float(0, 360), jitter(rng, 8)],
      collide: false,
      castShadow: false,
      lod: 0,
    });
  }
  return h;
}

function stoneColor(ctx: PrefabContext): string {
  const { rng, style } = ctx;
  const v = style.rock.variation === "high" ? 0.09 : style.rock.variation === "medium" ? 0.05 : 0.02;
  return jitterHex(style.palette.stone, jitter(rng, 8), jitter(rng, 0.05), jitter(rng, v));
}

/** A single chunky rock from 2-5 overlapping rotated boxes and a wedge. The base always dips below y=0. */
function rockMass(b: PartListBuilder, ctx: PrefabContext, center: Vec3, size: number, lodBase: 0 | 1 | 2 = 2): void {
  const { rng, style } = ctx;
  const color = stoneColor(ctx);
  const pieces = style.rock.variation === "low" ? 2 : rng.int(2, 4);
  const h = size * rng.float(0.55, 0.85);
  b.box([center[0], center[1] + h * 0.5 - size * 0.16, center[2]], [size, h, size * rng.float(0.7, 1.1)], color, {
    material: style.materials.rock,
    rotation: [jitter(rng, 10), rng.float(0, 360), jitter(rng, 10)],
    collide: true,
    lod: lodBase,
  });
  for (let i = 1; i < pieces; i++) {
    const s = size * rng.float(0.45, 0.8);
    b.box([center[0] + jitter(rng, size * 0.35), center[1] + s * rng.float(0.15, 0.4), center[2] + jitter(rng, size * 0.35)], [s, s * rng.float(0.6, 1.0), s * rng.float(0.7, 1.2)], jitterHex(color, 0, 0, jitter(rng, 0.05)), {
      material: style.materials.rock,
      rotation: [jitter(rng, 25), rng.float(0, 360), jitter(rng, 25)],
      collide: i === 1,
      lod: i === 1 ? 1 : 0,
    });
  }
  if (rng.chance(0.5)) {
    const s = size * rng.float(0.5, 0.9);
    b.wedge([center[0] + jitter(rng, size * 0.3), center[1] + s * 0.35, center[2] + jitter(rng, size * 0.3)], [s, s * 0.8, s], jitterHex(color, 0, 0, 0.04), {
      material: style.materials.rock,
      rotation: [0, rng.float(0, 360), 0],
      collide: false,
      lod: 0,
    });
  }
  // dark crack line + lighter top facet for readability
  if (style.rock.variation !== "low" && rng.chance(0.5)) {
    b.box([center[0] + jitter(rng, size * 0.2), center[1] + h * 0.45, center[2] + jitter(rng, size * 0.2)], [size * 0.9, 0.18, 0.5], jitterHex(color, 0, 0, -0.25), { material: style.materials.rock, rotation: [jitter(rng, 30), rng.float(0, 360), jitter(rng, 30)], collide: false, castShadow: false, lod: 0 });
  }
  if (rng.chance(style.rock.mossChance)) {
    b.box([center[0] + jitter(rng, size * 0.2), center[1] + h * 0.72, center[2] + jitter(rng, size * 0.2)], [size * 0.7, size * 0.14, size * 0.6], style.palette.foliageAlt, {
      material: "Grass",
      rotation: [jitter(rng, 8), rng.float(0, 360), jitter(rng, 8)],
      collide: false,
      castShadow: false,
      lod: 0,
    });
  }
}

export function boulder(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const size = ctx.rng.float(5, 11);
  if (meshRocks(ctx)) meshRock(b, ctx, "rock", [0, 0, 0], size, "boulder");
  else rockMass(b, ctx, [0, 0, 0], size);
  return b.build({ id: `boulder/${variant}`, prefab: "boulder", category: "rock", sinkDepth: size * 0.12, footprintRadius: size * 0.6, tags: ["rock"] });
}

export function rockCluster(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const count = rng.int(3, 5);
  let maxR = 0;
  for (let i = 0; i < count; i++) {
    const size = i === 0 ? rng.float(5, 8) : rng.float(2, 4.5);
    const a = rng.float(0, Math.PI * 2);
    const r = i === 0 ? 0 : rng.float(3, 6);
    if (meshRocks(ctx)) meshRock(b, ctx, `rock${i}`, [Math.cos(a) * r, 0, Math.sin(a) * r], size, i === 0 ? "boulder" : "pebble", i === 0 ? 2 : 1, i === 0);
    else rockMass(b, ctx, [Math.cos(a) * r, 0, Math.sin(a) * r], size, i === 0 ? 2 : 1);
    maxR = Math.max(maxR, r + size * 0.5);
  }
  return b.build({ id: `rock_cluster/${variant}`, prefab: "rock_cluster", category: "rock", sinkDepth: 0.7, footprintRadius: maxR, tags: ["rock", "cluster"] });
}

export function stone(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const s = rng.float(1.0, 2.4);
  b.box([0, s * 0.22, 0], [s, s * 0.6, s * rng.float(0.7, 1.2)], stoneColor(ctx), { material: style.materials.rock, rotation: [jitter(rng, 10), rng.float(0, 360), jitter(rng, 10)], collide: false, lod: 1 });
  if (rng.chance(0.5)) {
    b.box([jitter(rng, 1.2), s * 0.15, jitter(rng, 1.2)], [s * 0.6, s * 0.4, s * 0.6], stoneColor(ctx), { material: style.materials.rock, rotation: [0, rng.float(0, 360), 0], collide: false, lod: 0 });
  }
  return b.build({ id: `stone/${variant}`, prefab: "stone", category: "rock", sinkDepth: 0.25, footprintRadius: s, tags: ["rock", "small"] });
}

/** Cliff-face block used on steep slopes for silhouette. */
export function cliffBlock(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const w = rng.float(14, 26);
  const h = rng.float(10, 22);
  if (meshRocks(ctx)) {
    // a big craggy block plus a smaller slab leaning on it
    const mh = meshRock(b, ctx, "cliff", [0, -h * 0.25, 0], w, "cliff", 2);
    meshRock(b, ctx, "slab", [jitter(rng, w * 0.25), -h * 0.2, jitter(rng, w * 0.25)], w * rng.float(0.5, 0.7), "slab", 1, false);
    // moss on the crown: the mesh spans [-h*0.25 - w*0.06, -h*0.25 - w*0.06 + mh]
    if (rng.chance(style.rock.mossChance)) b.box([0, -h * 0.25 - w * 0.06 + mh - 0.35, 0], [w * 0.5, 0.5, w * 0.35], style.palette.foliageAlt, { material: "Grass", rotation: [0, rng.float(0, 360), 0], collide: false, castShadow: false, lod: 0 });
    return b.build({ id: `cliff_block/${variant}`, prefab: "cliff_block", category: "rock", sinkDepth: h * 0.12, footprintRadius: w * 0.55, tags: ["rock", "cliff"] });
  }
  const color = stoneColor(ctx);
  b.box([0, h * 0.35, 0], [w, h, w * rng.float(0.5, 0.8)], color, { material: style.materials.rock, rotation: [jitter(rng, 6), rng.float(0, 360), jitter(rng, 6)], collide: true, lod: 2 });
  b.wedge([jitter(rng, w * 0.2), h * 0.8, jitter(rng, w * 0.2)], [w * 0.7, h * 0.5, w * 0.6], jitterHex(color, 0, 0, 0.05), { material: style.materials.rock, rotation: [0, rng.float(0, 360), 0], collide: true, lod: 1 });
  // strata lines
  for (let i = 0; i < 2; i++) {
    b.box([jitter(rng, w * 0.1), h * (0.25 + i * 0.25), jitter(rng, w * 0.1)], [w * 1.02, 0.4, w * 0.7], jitterHex(color, 0, 0, -0.12), { material: style.materials.rock, rotation: [jitter(rng, 4), rng.float(0, 360), jitter(rng, 4)], collide: false, castShadow: false, lod: 0 });
  }
  if (rng.chance(style.rock.mossChance)) {
    b.box([0, h * 0.85, 0], [w * 0.6, 0.5, w * 0.4], style.palette.foliageAlt, { material: "Grass", rotation: [0, rng.float(0, 360), 0], collide: false, castShadow: false, lod: 0 });
  }
  return b.build({ id: `cliff_block/${variant}`, prefab: "cliff_block", category: "rock", sinkDepth: h * 0.3, footprintRadius: w * 0.55, tags: ["rock", "cliff"] });
}

/** Glowing crystal cluster: shards growing out of a rock base, with light + sparkle. */
export function crystalCluster(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const base = rng.float(3, 5.5);
  rockMass(b, ctx, [0, 0, 0], base, 2);
  const glow = rng.chance(0.7) ? style.palette.glow : rng.pick([style.palette.accent, "#7fd8ff", "#ff8fd0", "#9dffb0"]);
  const shards = rng.int(3, 5);
  for (let i = 0; i < shards; i++) {
    const a = rng.float(0, Math.PI * 2);
    const r = base * rng.float(0.05, 0.35);
    const len = base * rng.float(0.7, 1.5) * (i === 0 ? 1.25 : 1);
    const from: Vec3 = [Math.sin(a) * r, base * 0.15, Math.cos(a) * r];
    const dir = v3.norm([Math.sin(a) * rng.float(0.1, 0.6), 1, Math.cos(a) * rng.float(0.1, 0.6)]);
    const w = len * rng.float(0.16, 0.24);
    // shard built upright (prism + chisel tip), then oriented along `dir` and moved to its root
    const shard = new PartListBuilder();
    const bodyH = len * 0.72;
    const col = glow;
    shard.box([0, bodyH / 2, 0], [w, bodyH, w], col, { material: "Neon", transparency: 0.2, collide: i === 0, lod: i < 2 ? 2 : 1 });
    shard.gableRoof([0, bodyH + (len * 0.28) / 2, 0], w, w, len * 0.28, lightenHex(col, 0.1), { material: "Neon", transparency: 0.2, collide: false, lod: i < 2 ? 2 : 1 });
    shard.transform(eulerFromYAxis(dir, rng.float(0, 90)), from);
    b.merge(shard);
  }
  b.effect([0, base * 0.9, 0], [base * 2.2, base * 1.6, base * 2.2], { kind: "sparkle", color: glow, rate: 3 }, { lod: 1 });
  b.add({ shape: "sphere", position: [0, base * 0.8, 0], size: [0.6, 0.6, 0.6], rotation: [0, 0, 0], color: glow, material: "Neon", transparency: 1, collide: false, castShadow: false, lod: 2, light: { type: "point", color: glow, brightness: 1.8, range: base * 6 } });
  return b.build({ id: `crystal_cluster/${variant}`, prefab: "crystal_cluster", category: "rock", sinkDepth: base * 0.12, footprintRadius: base * 0.8, tags: ["rock", "crystal", "glow"] });
}
