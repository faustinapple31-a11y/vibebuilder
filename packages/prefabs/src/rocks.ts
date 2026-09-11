import { jitterHex, type PrefabVariant, type Vec3 } from "@worldforge/core";
import { PartListBuilder, jitter, type PrefabContext } from "./builder";

function stoneColor(ctx: PrefabContext): string {
  const { rng, style } = ctx;
  const v = style.rock.variation === "high" ? 0.09 : style.rock.variation === "medium" ? 0.05 : 0.02;
  return jitterHex(style.palette.stone, jitter(rng, 8), jitter(rng, 0.05), jitter(rng, v));
}

/** A single chunky rock from 2-5 overlapping rotated boxes and a wedge. */
function rockMass(b: PartListBuilder, ctx: PrefabContext, center: Vec3, size: number, lodBase: 0 | 1 | 2 = 2): void {
  const { rng, style } = ctx;
  const color = stoneColor(ctx);
  const pieces = style.rock.variation === "low" ? 2 : rng.int(2, 4);
  b.box([center[0], center[1] + size * 0.32, center[2]], [size, size * rng.float(0.55, 0.85), size * rng.float(0.7, 1.1)], color, {
    material: style.materials.rock,
    rotation: [jitter(rng, 12), rng.float(0, 360), jitter(rng, 12)],
    collide: true,
    lod: lodBase,
  });
  for (let i = 1; i < pieces; i++) {
    const s = size * rng.float(0.45, 0.8);
    b.box([center[0] + jitter(rng, size * 0.35), center[1] + s * rng.float(0.2, 0.5), center[2] + jitter(rng, size * 0.35)], [s, s * rng.float(0.6, 1.0), s * rng.float(0.7, 1.2)], jitterHex(color, 0, 0, jitter(rng, 0.05)), {
      material: style.materials.rock,
      rotation: [jitter(rng, 25), rng.float(0, 360), jitter(rng, 25)],
      collide: i === 1,
      lod: i === 1 ? 1 : 0,
    });
  }
  if (rng.chance(0.5)) {
    const s = size * rng.float(0.5, 0.9);
    b.wedge([center[0] + jitter(rng, size * 0.3), center[1] + s * 0.4, center[2] + jitter(rng, size * 0.3)], [s, s * 0.8, s], jitterHex(color, 0, 0, 0.04), {
      material: style.materials.rock,
      rotation: [0, rng.float(0, 360), 0],
      collide: false,
      lod: 0,
    });
  }
  if (rng.chance(style.rock.mossChance)) {
    b.box([center[0] + jitter(rng, size * 0.2), center[1] + size * 0.62, center[2] + jitter(rng, size * 0.2)], [size * 0.7, size * 0.14, size * 0.6], style.palette.foliageAlt, {
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
  rockMass(b, ctx, [0, 0, 0], size);
  return b.build({ id: `boulder/${variant}`, prefab: "boulder", category: "rock", sinkDepth: size * 0.18, footprintRadius: size * 0.6, tags: ["rock"] });
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
    rockMass(b, ctx, [Math.cos(a) * r, 0, Math.sin(a) * r], size, i === 0 ? 2 : 1);
    maxR = Math.max(maxR, r + size * 0.5);
  }
  return b.build({ id: `rock_cluster/${variant}`, prefab: "rock_cluster", category: "rock", sinkDepth: 0.8, footprintRadius: maxR, tags: ["rock", "cluster"] });
}

export function stone(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const s = rng.float(1.0, 2.4);
  b.box([0, s * 0.3, 0], [s, s * 0.6, s * rng.float(0.7, 1.2)], stoneColor(ctx), { material: style.materials.rock, rotation: [jitter(rng, 10), rng.float(0, 360), jitter(rng, 10)], collide: false, lod: 1 });
  if (rng.chance(0.5)) {
    b.box([jitter(rng, 1.2), s * 0.2, jitter(rng, 1.2)], [s * 0.6, s * 0.4, s * 0.6], stoneColor(ctx), { material: style.materials.rock, rotation: [0, rng.float(0, 360), 0], collide: false, lod: 0 });
  }
  return b.build({ id: `stone/${variant}`, prefab: "stone", category: "rock", sinkDepth: 0.3, footprintRadius: s, tags: ["rock", "small"] });
}

/** Cliff-face block used on steep slopes for silhouette. */
export function cliffBlock(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const w = rng.float(14, 26);
  const h = rng.float(10, 22);
  const color = stoneColor(ctx);
  b.box([0, h * 0.4, 0], [w, h, w * rng.float(0.5, 0.8)], color, { material: style.materials.rock, rotation: [jitter(rng, 6), rng.float(0, 360), jitter(rng, 6)], collide: true, lod: 2 });
  b.wedge([jitter(rng, w * 0.2), h * 0.85, jitter(rng, w * 0.2)], [w * 0.7, h * 0.5, w * 0.6], jitterHex(color, 0, 0, 0.05), { material: style.materials.rock, rotation: [0, rng.float(0, 360), 0], collide: true, lod: 1 });
  return b.build({ id: `cliff_block/${variant}`, prefab: "cliff_block", category: "rock", sinkDepth: h * 0.3, footprintRadius: w * 0.55, tags: ["rock", "cliff"] });
}
