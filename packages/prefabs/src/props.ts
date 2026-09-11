import { jitterHex, mixHex, type PrefabVariant } from "@worldforge/core";
import { PartListBuilder, jitter, type PrefabContext } from "./builder";

function woodColor(ctx: PrefabContext): string {
  return jitterHex(ctx.style.palette.wood, jitter(ctx.rng, 5), 0, jitter(ctx.rng, 0.06));
}

export function lanternPost(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const h = rng.float(8, 11);
  const wood = woodColor(ctx);
  const lit = rng.chance(0.85);
  const glow = mixHex("#ffb866", style.palette.glow, 0.35);
  b.box([0, h / 2, 0], [0.9, h, 0.9], wood, { material: style.materials.trunk, rotation: [jitter(rng, 2), 0, jitter(rng, 2)], collide: true, lod: 2 });
  b.box([1.4, h - 0.4, 0], [3.2, 0.6, 0.6], wood, { material: style.materials.trunk, collide: false, lod: 1 });
  b.box([2.6, h - 2.4, 0], [1.6, 2.4, 1.6], "#2b2622", { material: style.materials.metal, collide: false, lod: 1 });
  b.box([2.6, h - 2.4, 0], [1.1, 1.6, 1.1], lit ? glow : "#3a332c", {
    material: lit ? "Neon" : "Glass",
    transparency: lit ? 0.1 : 0.4,
    collide: false,
    lod: 1,
    light: lit ? { type: "point", color: glow, brightness: 1.6, range: 26 } : undefined,
  });
  b.box([2.6, h - 1.1, 0], [2, 0.4, 2], "#2b2622", { material: style.materials.metal, rotation: [0, 45, 0], collide: false, lod: 0 });
  return b.build({ id: `lantern_post/${variant}`, prefab: "lantern_post", category: "prop", sinkDepth: 0.4, footprintRadius: 1.8, tags: ["village", "light"] });
}

export function crate(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const s = rng.float(3, 4.4);
  const wood = woodColor(ctx);
  const dark = jitterHex(wood, 0, 0, -0.12);
  const ry = rng.float(0, 360);
  b.box([0, s / 2, 0], [s, s, s], wood, { material: style.materials.wall, rotation: [0, ry, 0], collide: true, lod: 2 });
  for (const y of [0.15, 0.85]) {
    b.box([0, s * y, 0], [s + 0.2, 0.5, s + 0.2], dark, { material: style.materials.trunk, rotation: [0, ry, 0], collide: false, lod: 0 });
  }
  if (rng.chance(0.4)) {
    const s2 = s * 0.75;
    b.box([jitter(rng, 1), s + s2 / 2, jitter(rng, 1)], [s2, s2, s2], jitterHex(wood, 0, 0, 0.04), { material: style.materials.wall, rotation: [0, ry + rng.float(10, 40), 0], collide: true, lod: 1 });
  }
  return b.build({ id: `crate/${variant}`, prefab: "crate", category: "prop", sinkDepth: 0.2, footprintRadius: s * 0.8, tags: ["village", "camp"] });
}

export function barrel(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const h = rng.float(3.6, 4.6);
  const d = h * 0.7;
  const wood = woodColor(ctx);
  const tipped = rng.chance(0.25);
  const rot: [number, number, number] = tipped ? [0, rng.float(0, 360), 90] : [0, 0, 0];
  const y = tipped ? d / 2 : h / 2;
  b.cylinder([0, y, 0], d, h, wood, { material: style.materials.wall, rotation: rot, collide: true, lod: 2 });
  for (const f of [0.25, 0.75]) {
    const off = (f - 0.5) * h;
    const pos: [number, number, number] = tipped ? [Math.cos((rot[1] * Math.PI) / 180) * off, y, -Math.sin((rot[1] * Math.PI) / 180) * off] : [0, y + off, 0];
    b.cylinder(pos, d + 0.2, 0.4, "#3b3a3a", { material: style.materials.metal, rotation: rot, collide: false, lod: 0 });
  }
  return b.build({ id: `barrel/${variant}`, prefab: "barrel", category: "prop", sinkDepth: 0.2, footprintRadius: d * 0.7, tags: ["village", "camp"] });
}

export function bench(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const wood = woodColor(ctx);
  const len = rng.float(5.5, 7);
  b.box([0, 2.1, 0], [len, 0.5, 2.2], wood, { material: style.materials.wall, collide: true, lod: 2 });
  for (const sx of [-1, 1]) {
    b.box([sx * (len / 2 - 0.8), 1, 0], [0.7, 2, 1.8], jitterHex(wood, 0, 0, -0.08), { material: style.materials.trunk, collide: false, lod: 1 });
  }
  if (rng.chance(0.6)) {
    b.box([0, 3.6, 0.95], [len, 2.2, 0.4], wood, { material: style.materials.wall, rotation: [-8, 0, 0], collide: false, lod: 1 });
  }
  return b.build({ id: `bench/${variant}`, prefab: "bench", category: "prop", sinkDepth: 0.2, footprintRadius: len / 2, tags: ["village"] });
}

export function signpost(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const wood = woodColor(ctx);
  const h = rng.float(6.5, 8.5);
  b.box([0, h / 2, 0], [0.8, h, 0.8], wood, { material: style.materials.trunk, rotation: [jitter(rng, 3), 0, jitter(rng, 3)], collide: true, lod: 2 });
  const arrows = rng.int(1, 3);
  for (let i = 0; i < arrows; i++) {
    const ry = rng.float(0, 360);
    const y = h - 1 - i * 1.6;
    const len = rng.float(3.2, 4.4);
    const col = jitterHex(wood, 0, 0, 0.06);
    b.box([len * 0.45, y, 0], [len, 1.1, 0.5], col, { material: style.materials.wall, rotation: [0, ry, 0], collide: false, lod: 1 });
    b.wedge([0, 0, 0], [1.1, 0.5, 1.2], col, { material: style.materials.wall, rotation: [0, ry + 90, 90], collide: false, lod: 0 });
    // move the arrow tip to the end of the plank
    const last = b.parts[b.parts.length - 1]!;
    const rad = (ry * Math.PI) / 180;
    last.position = [Math.cos(rad) * (len * 0.95), y, -Math.sin(rad) * (len * 0.95)];
  }
  return b.build({ id: `signpost/${variant}`, prefab: "signpost", category: "prop", sinkDepth: 0.3, footprintRadius: 2, tags: ["village", "path"] });
}

export function campfire(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const stones = rng.int(6, 9);
  for (let i = 0; i < stones; i++) {
    const a = (i / stones) * Math.PI * 2 + jitter(rng, 0.2);
    const r = 2.6;
    b.box([Math.cos(a) * r, 0.5, Math.sin(a) * r], [1.4, 1, 1.2], jitterHex(style.palette.stone, 0, 0, jitter(rng, 0.06)), { material: style.materials.rock, rotation: [jitter(rng, 15), (-a * 180) / Math.PI, jitter(rng, 15)], collide: false, lod: 1 });
  }
  const wood = jitterHex(style.palette.wood, 0, 0, -0.15);
  for (let i = 0; i < 3; i++) {
    b.cylinder([0, 0.7, 0], 0.7, 4, wood, { material: style.materials.trunk, rotation: [0, i * 60, 90], collide: false, lod: 1 });
  }
  const lit = rng.chance(0.7);
  if (lit) {
    b.box([0, 1.6, 0], [1.6, 2.2, 1.6], "#ff9a3c", { material: "Neon", rotation: [0, 45, 0], collide: false, lod: 2, light: { type: "point", color: "#ff9a3c", brightness: 2.5, range: 30 } });
    b.box([0, 2.8, 0], [0.8, 1.4, 0.8], "#ffd27a", { material: "Neon", rotation: [0, 20, 0], collide: false, lod: 1 });
  }
  return b.build({ id: `campfire/${variant}`, prefab: "campfire", category: "prop", sinkDepth: 0.3, footprintRadius: 3.5, tags: ["camp", "light"] });
}

export function cartWheel(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const wood = woodColor(ctx);
  const d = rng.float(3.5, 4.5);
  b.cylinder([0, d / 2, 0], d, 0.5, wood, { material: style.materials.wall, rotation: [90, rng.float(0, 360), rng.float(-10, 10)], collide: false, lod: 2 });
  b.cylinder([0, d / 2, 0], d * 0.35, 0.7, jitterHex(wood, 0, 0, -0.1), { material: style.materials.trunk, rotation: [90, 0, 0], collide: false, lod: 0 });
  return b.build({ id: `cart_wheel/${variant}`, prefab: "cart_wheel", category: "prop", sinkDepth: 0.2, footprintRadius: d / 2, tags: ["village", "farm"] });
}

export function gravestone(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const h = rng.float(3, 4.5);
  const col = jitterHex(style.palette.stone, 0, -0.05, jitter(rng, 0.06));
  b.box([0, h / 2, 0], [2.4, h, 0.7], col, { material: style.materials.stoneWall, rotation: [jitter(rng, 6), rng.float(0, 360), jitter(rng, 8)], collide: true, lod: 2 });
  b.cylinder([0, h, 0], 2.4, 0.7, col, { material: style.materials.stoneWall, rotation: [90, 0, 0], collide: false, lod: 1 });
  return b.build({ id: `gravestone/${variant}`, prefab: "gravestone", category: "prop", sinkDepth: 0.4, footprintRadius: 1.4, tags: ["graveyard"] });
}
