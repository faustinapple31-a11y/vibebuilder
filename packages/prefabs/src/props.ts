import { eulerXYZToMatrix, jitterHex, mat3Apply, mat3Mul, matrixToEulerXYZ, mixHex, type PrefabVariant, type Vec3 } from "@worldforge/core";
import { PartListBuilder, jitter, v3, type PrefabContext } from "./builder";

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
  const tilt = jitter(rng, 2);
  b.box([0, h / 2 - 0.3, 0], [0.9, h + 0.6, 0.9], wood, { material: style.materials.trunk, rotation: [jitter(rng, 2), 0, tilt], collide: true, lod: 2 });
  // the arm starts inside the post top (accounts for the tilt) and reaches out
  const top: Vec3 = [-Math.sin((tilt * Math.PI) / 180) * (h / 2), h - 0.4, 0];
  const armEnd: Vec3 = [top[0] + 3.0, h - 0.4, 0];
  b.beam(top, armEnd, 0.6, 0.6, wood, { material: style.materials.trunk, collide: false, lod: 1, overlap: 0.3 });
  b.beam(v3.add(top, [0.2, -1.6, 0]), v3.add(armEnd, [-0.4, -0.2, 0]), 0.4, 0.4, wood, { material: style.materials.trunk, collide: false, lod: 0 });
  const lx = armEnd[0] - 0.4;
  b.box([lx, h - 1.1, 0], [0.15, 0.9, 0.15], "#2b2622", { material: style.materials.metal, collide: false, castShadow: false, lod: 0 });
  b.box([lx, h - 2.6, 0], [1.6, 2.4, 1.6], "#2b2622", { material: style.materials.metal, collide: false, lod: 1 });
  b.box([lx, h - 2.6, 0], [1.1, 1.6, 1.1], lit ? glow : "#3a332c", {
    material: lit ? "Neon" : "Glass",
    transparency: lit ? 0.1 : 0.4,
    collide: false,
    lod: 1,
    light: lit ? { type: "point", color: glow, brightness: 1.6, range: 26 } : undefined,
  });
  b.box([lx, h - 1.3, 0], [2, 0.4, 2], "#2b2622", { material: style.materials.metal, rotation: [0, 45, 0], collide: false, lod: 0 });
  if (lit && style.mushroom.glow > 0.2) b.effect([lx, h - 2.6, 0], [4, 4, 4], { kind: "fireflies", color: glow, rate: 1.2 }, { lod: 0 });
  return b.build({ id: `lantern_post/${variant}`, prefab: "lantern_post", category: "prop", sinkDepth: 0.4, footprintRadius: 1.8, tags: ["village", "light"] });
}

export function crate(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const s = rng.float(3, 4.4);
  const wood = woodColor(ctx);
  const dark = jitterHex(wood, 0, 0, -0.12);
  const ry = rng.float(0, 360);
  b.box([0, s / 2 - 0.15, 0], [s, s, s], wood, { material: style.materials.wall, rotation: [0, ry, 0], collide: true, lod: 2 });
  for (const y of [0.15, 0.85]) {
    b.box([0, s * y - 0.15, 0], [s + 0.2, 0.5, s + 0.2], dark, { material: style.materials.trunk, rotation: [0, ry, 0], collide: false, lod: 0 });
  }
  if (rng.chance(0.4)) {
    const s2 = s * 0.75;
    b.box([jitter(rng, 0.6), s - 0.15 + s2 / 2, jitter(rng, 0.6)], [s2, s2, s2], jitterHex(wood, 0, 0, 0.04), { material: style.materials.wall, rotation: [0, ry + rng.float(10, 40), 0], collide: true, lod: 1 });
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
  if (tipped) {
    const yaw = rng.float(0, Math.PI * 2);
    const axis = v3.fromAngles(yaw, 0);
    const c: Vec3 = [0, d / 2 - 0.15, 0];
    const from = v3.sub(c, v3.scale(axis, h / 2));
    const to = v3.add(c, v3.scale(axis, h / 2));
    b.segment(from, to, d, wood, { material: style.materials.wall, collide: true, lod: 2, overlap: 0 });
    for (const f of [0.25, 0.75]) {
      const p = v3.lerp(from, to, f);
      b.segment(v3.sub(p, v3.scale(axis, 0.2)), v3.add(p, v3.scale(axis, 0.2)), d + 0.2, "#3b3a3a", { material: style.materials.metal, collide: false, lod: 0, overlap: 0 });
    }
  } else {
    b.cylinder([0, h / 2 - 0.15, 0], d, h, wood, { material: style.materials.wall, collide: true, lod: 2 });
    for (const f of [0.25, 0.75]) b.cylinder([0, h * f - 0.15, 0], d + 0.2, 0.4, "#3b3a3a", { material: style.materials.metal, collide: false, lod: 0 });
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
    b.box([sx * (len / 2 - 0.8), 0.9, 0], [0.7, 2.4, 1.8], jitterHex(wood, 0, 0, -0.08), { material: style.materials.trunk, collide: false, lod: 1 });
  }
  if (rng.chance(0.6)) {
    // backrest leans back from the rear edge of the seat
    b.beam([0, 2.3, 1.0], [0, 4.5, 1.35], 0.4, len, wood, { material: style.materials.wall, collide: false, lod: 1, overlap: 0.1 });
  }
  return b.build({ id: `bench/${variant}`, prefab: "bench", category: "prop", sinkDepth: 0.2, footprintRadius: len / 2, tags: ["village"] });
}

export function signpost(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const wood = woodColor(ctx);
  const h = rng.float(6.5, 8.5);
  b.box([0, h / 2 - 0.3, 0], [0.8, h + 0.6, 0.8], wood, { material: style.materials.trunk, rotation: [jitter(rng, 3), 0, jitter(rng, 3)], collide: true, lod: 2 });
  const arrows = rng.int(1, 3);
  for (let i = 0; i < arrows; i++) {
    const yaw = rng.float(0, Math.PI * 2);
    const y = h - 1 - i * 1.6;
    const len = rng.float(3.2, 4.4);
    const col = jitterHex(wood, 0, 0, 0.06);
    const dir = v3.fromAngles(yaw, 0);
    const from: Vec3 = [0, y, 0];
    const tip = v3.add(from, v3.scale(dir, len));
    b.beam(from, tip, 1.1, 0.5, col, { material: style.materials.wall, collide: false, lod: 1, overlap: 0.3 });
    // arrow head: a wedge at the tip, pointing along the plank
    const head = v3.add(tip, v3.scale(dir, 0.5));
    b.beam(tip, v3.add(head, v3.scale(dir, 0.6)), 1.6, 0.5, col, { material: style.materials.wall, collide: false, lod: 0, roll: 45 });
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
    b.box([Math.cos(a) * r, 0.35, Math.sin(a) * r], [1.4, 1.1, 1.2], jitterHex(style.palette.stone, 0, 0, jitter(rng, 0.06)), { material: style.materials.rock, rotation: [jitter(rng, 15), (-a * 180) / Math.PI, jitter(rng, 15)], collide: false, lod: 1 });
  }
  const wood = jitterHex(style.palette.wood, 0, 0, -0.15);
  for (let i = 0; i < 3; i++) {
    // logs lean against each other (tepee): from the ring inward and up
    const a = (i / 3) * Math.PI * 2 + jitter(rng, 0.2);
    b.segment([Math.cos(a) * 1.9, 0.35, Math.sin(a) * 1.9], [Math.cos(a) * -0.2, 2.2, Math.sin(a) * -0.2], 0.7, wood, { material: style.materials.trunk, collide: false, lod: 1, overlap: 0.1 });
  }
  const lit = rng.chance(0.7);
  if (lit) {
    b.box([0, 1.5, 0], [1.6, 2.4, 1.6], "#ff9a3c", { material: "Neon", rotation: [0, 45, 0], collide: false, lod: 2, light: { type: "point", color: "#ff9a3c", brightness: 2.5, range: 30 } });
    b.box([0, 2.6, 0], [0.8, 1.6, 0.8], "#ffd27a", { material: "Neon", rotation: [0, 20, 0], collide: false, lod: 1 });
    b.effect([0, 2.4, 0], [1.6, 1.4, 1.6], { kind: "embers", rate: 8 }, { lod: 1 });
    b.effect([0, 4.5, 0], [1.4, 1, 1.4], { kind: "smoke", rate: 2 }, { lod: 0 });
  }
  return b.build({ id: `campfire/${variant}`, prefab: "campfire", category: "prop", sinkDepth: 0.3, footprintRadius: 3.5, tags: ["camp", "light"] });
}

export function cartWheel(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const wood = woodColor(ctx);
  const d = rng.float(3.5, 4.5);
  const ry = rng.float(0, 360);
  const lean = rng.float(-12, 12);
  b.cylinder([0, d / 2 - 0.2, 0], d, 0.5, wood, { material: style.materials.wall, rotation: [90, ry, lean], collide: false, lod: 2 });
  b.cylinder([0, d / 2 - 0.2, 0], d * 0.35, 0.7, jitterHex(wood, 0, 0, -0.1), { material: style.materials.trunk, rotation: [90, ry, lean], collide: false, lod: 0 });
  return b.build({ id: `cart_wheel/${variant}`, prefab: "cart_wheel", category: "prop", sinkDepth: 0.2, footprintRadius: d / 2, tags: ["village", "farm"] });
}

export function gravestone(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const h = rng.float(3, 4.5);
  const col = jitterHex(style.palette.stone, 0, -0.05, jitter(rng, 0.06));
  const slabRot: Vec3 = [jitter(rng, 6), rng.float(0, 360), jitter(rng, 8)];
  const R = eulerXYZToMatrix(slabRot);
  const slabC: Vec3 = [0, h / 2 - 0.4, 0];
  b.box(slabC, [2.4, h + 0.8, 0.7], col, { material: style.materials.stoneWall, rotation: slabRot, collide: true, lod: 2 });
  // rounded top: a disc whose axis is the slab's thickness axis, centred on the slab's top edge
  const topC = v3.add(slabC, mat3Apply(R, [0, h / 2 + 0.4, 0]));
  b.cylinder(topC, 2.4, 0.7, col, { material: style.materials.stoneWall, rotation: matrixToEulerXYZ(mat3Mul(R, eulerXYZToMatrix([90, 0, 0]))), collide: false, lod: 1 });
  const ry = slabRot[1];
  if (rng.chance(style.rock.mossChance * 0.6)) b.box([0, 0.9, 0], [2.6, 1.2, 0.4], style.palette.foliageAlt, { material: "Grass", rotation: [0, ry, 0], collide: false, castShadow: false, lod: 0 });
  return b.build({ id: `gravestone/${variant}`, prefab: "gravestone", category: "prop", sinkDepth: 0.4, footprintRadius: 1.4, tags: ["graveyard"] });
}

/** Floating will-o'-the-wisp: a hovering glow with a firefly trail (graveyards, ruins, marshes). */
export function wisp(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const h = rng.float(3, 6);
  const glow = rng.chance(0.6) ? style.palette.glow : mixHex(style.palette.glow, "#9fe0ff", 0.6);
  b.sphere([0, h, 0], 1.1, glow, { material: "Neon", transparency: 0.15, collide: false, castShadow: false, lod: 2, light: { type: "point", color: glow, brightness: 1.6, range: 22 } });
  b.sphere([0, h, 0], 1.9, glow, { material: "Neon", transparency: 0.7, collide: false, castShadow: false, lod: 1 });
  b.effect([0, h - 0.5, 0], [4, 3, 4], { kind: "fireflies", color: glow, rate: 4 }, { lod: 1 });
  b.effect([0, 0.8, 0], [7, 1.2, 7], { kind: "mist", color: mixHex(glow, "#ffffff", 0.6), rate: 0.6 }, { lod: 0 });
  return b.build({ id: `wisp/${variant}`, prefab: "wisp", category: "prop", sinkDepth: 0, footprintRadius: 1.5, baseRadius: 0.5, tags: ["glow", "graveyard", "ruins"] });
}

/** Canvas tent for camps: two poles, a ridge and two sloped canvas sheets, pegged ropes. */
export function tent(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const len = rng.float(8, 11);
  const w = rng.float(7, 9);
  const h = w * 0.55;
  const wood = woodColor(ctx);
  const canvas = jitterHex(rng.pick(["#c9b58d", "#b8a27a", mixHex(style.palette.wall, "#d9c9a8", 0.5)]), jitter(rng, 6), 0, jitter(rng, 0.05));
  for (const sx of [-1, 1]) b.box([sx * (len / 2 - 0.4), h / 2 - 0.3, 0], [0.5, h + 0.6, 0.5], wood, { material: style.materials.trunk, collide: false, lod: 1 });
  b.box([0, h + 0.1, 0], [len, 0.4, 0.4], wood, { material: style.materials.trunk, collide: false, lod: 1 });
  // canvas: two sloped sheets from the ridge to the ground
  const half = w / 2;
  for (const sz of [-1, 1]) {
    const from: Vec3 = [0, h + 0.15, 0];
    const to: Vec3 = [0, -0.2, sz * half];
    const slope = Math.hypot(h + 0.35, half);
    // sheet's local Y runs ridge → ground: Rx(θ)·(0,1,0) = (0, cos θ, sin θ) ∝ -(to - from)
    b.box(v3.lerp(from, to, 0.5), [len, slope, 0.3], canvas, { material: "Fabric", rotation: [-sz * Math.atan2(half, h + 0.35) * (180 / Math.PI), 0, 0], collide: true, lod: 2 });
  }
  // back wall
  b.wedge([-len / 2 + 0.2, h / 2 - 0.1, 0], [w, h + 0.2, 0.3], jitterHex(canvas, 0, 0, -0.06), { material: "Fabric", rotation: [0, 90, 0], collide: false, lod: 1 });
  // pegs + rope
  for (const sx of [-1, 1]) {
    const peg: Vec3 = [sx * (len / 2 + 2.2), 0.2, 0];
    b.box(peg, [0.4, 1.2, 0.4], wood, { material: style.materials.trunk, rotation: [0, 0, sx * 20], collide: false, lod: 0 });
    b.beam([sx * (len / 2 - 0.4), h + 0.1, 0], [peg[0], 0.6, 0], 0.12, 0.12, "#b8a27a", { material: "Fabric", collide: false, castShadow: false, lod: 0 });
  }
  // bedroll inside + lantern at the entrance
  b.box([0, 0.45, 0], [len * 0.55, 0.7, 2.4], jitterHex(style.palette.accent, 0, -0.2, -0.1), { material: "Fabric", collide: false, lod: 0 });
  const glow = mixHex("#ffb866", style.palette.glow, 0.3);
  b.box([len / 2 + 0.6, 0.9, w * 0.35], [0.8, 1.1, 0.8], glow, { material: "Neon", transparency: 0.2, collide: false, lod: 1, light: { type: "point", color: glow, brightness: 1.1, range: 16 } });
  return b.build({ id: `tent/${variant}`, prefab: "tent", category: "prop", sinkDepth: 0.3, footprintRadius: Math.max(len, w) / 2 + 1, tags: ["camp"] });
}

export function hayBale(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const col = jitterHex("#c9a45a", jitter(rng, 8), jitter(rng, 0.05), jitter(rng, 0.06));
  const round = rng.chance(0.5);
  if (round) {
    const d = rng.float(3.5, 4.5);
    const yaw = rng.float(0, Math.PI * 2);
    const axis = v3.fromAngles(yaw, 0);
    const c: Vec3 = [0, d / 2 - 0.15, 0];
    b.segment(v3.sub(c, v3.scale(axis, d * 0.45)), v3.add(c, v3.scale(axis, d * 0.45)), d, col, { material: "Grass", collide: true, lod: 2, overlap: 0 });
    b.segment(v3.sub(c, v3.scale(axis, d * 0.1)), v3.add(c, v3.scale(axis, d * 0.1)), d + 0.15, jitterHex(col, 0, 0, -0.15), { material: "Fabric", collide: false, lod: 0, overlap: 0 });
  } else {
    const ry = rng.float(0, 360);
    b.box([0, 1.1, 0], [4.2, 2.4, 2.6], col, { material: "Grass", rotation: [0, ry, 0], collide: true, lod: 2 });
    if (rng.chance(0.5)) b.box([jitter(rng, 0.5), 3.4, jitter(rng, 0.5)], [4.2, 2.4, 2.6], jitterHex(col, 0, 0, 0.05), { material: "Grass", rotation: [0, ry + jitter(rng, 20), 0], collide: true, lod: 1 });
  }
  return b.build({ id: `hay_bale/${variant}`, prefab: "hay_bale", category: "prop", sinkDepth: 0.2, footprintRadius: 2.4, tags: ["village", "farm"] });
}

/** Wooden hand cart with two wheels and a load. */
export function cart(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const wood = woodColor(ctx);
  const dark = jitterHex(wood, 0, 0, -0.12);
  const len = rng.float(7, 9);
  const w = rng.float(4, 5);
  const wheelD = 3.6;
  const bedY = wheelD * 0.55;
  b.box([0, bedY, 0], [len, 0.5, w], wood, { material: style.materials.wall, collide: true, lod: 2 });
  for (const sz of [-1, 1]) b.box([0, bedY + 0.9, sz * (w / 2 - 0.2)], [len, 1.6, 0.35], dark, { material: style.materials.wall, collide: false, lod: 1 });
  b.box([-len / 2 + 0.2, bedY + 0.9, 0], [0.35, 1.6, w], dark, { material: style.materials.wall, collide: false, lod: 1 });
  // axle + wheels
  b.segment([0, wheelD / 2, -w / 2 - 0.6], [0, wheelD / 2, w / 2 + 0.6], 0.4, dark, { material: style.materials.trunk, collide: false, lod: 1, overlap: 0 });
  for (const sz of [-1, 1]) {
    b.cylinder([0, wheelD / 2, sz * (w / 2 + 0.5)], wheelD, 0.5, wood, { material: style.materials.wall, rotation: [90, 0, 0], collide: false, lod: 2 });
    b.cylinder([0, wheelD / 2, sz * (w / 2 + 0.5)], wheelD * 0.35, 0.7, dark, { material: style.materials.trunk, rotation: [90, 0, 0], collide: false, lod: 0 });
  }
  // handles resting on the ground at the front
  for (const sz of [-1, 1]) b.beam([len / 2 - 0.5, bedY, sz * (w / 2 - 0.4)], [len / 2 + 3.5, 0.3, sz * (w / 2 - 0.2)], 0.4, 0.4, wood, { material: style.materials.trunk, collide: false, lod: 1, overlap: 0.2 });
  // load: hay or crates or mushrooms
  const load = rng.pick(["hay", "crates", "mushrooms"]);
  if (load === "hay") b.box([-0.5, bedY + 1.4, 0], [len * 0.7, 1.8, w * 0.8], "#c9a45a", { material: "Grass", rotation: [0, 0, 0], collide: false, lod: 1 });
  else if (load === "crates") {
    b.box([-1, bedY + 1.2, -0.6], [2.2, 2.2, 2.2], jitterHex(wood, 0, 0, 0.05), { material: style.materials.wall, rotation: [0, 15, 0], collide: false, lod: 1 });
    b.box([1.2, bedY + 1.0, 0.8], [1.8, 1.8, 1.8], jitterHex(wood, 0, 0, -0.03), { material: style.materials.wall, rotation: [0, -20, 0], collide: false, lod: 0 });
  } else {
    for (let i = 0; i < 4; i++) {
      const x = -len * 0.3 + i * len * 0.2;
      const cap = rng.pick(style.mushroom.capColors);
      b.cylinder([x, bedY + 0.7, jitter(rng, 0.8)], 0.6, 1.0, "#e6ddcc", { material: style.materials.mushroom, collide: false, lod: 0 });
      b.cylinder([x, bedY + 1.3, jitter(rng, 0.8)], 1.6, 0.5, cap, { material: style.materials.mushroom, collide: false, lod: 0 });
    }
  }
  return b.build({ id: `cart/${variant}`, prefab: "cart", category: "prop", sinkDepth: 0.15, footprintRadius: len / 2 + 2, baseRadius: w / 2 + 0.6, tags: ["village", "farm"] });
}


/** Invisible ambience volume: a swarm of fireflies drifting in a clearing or along a river bank. */
export function fireflySwarm(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const r = rng.float(8, 16);
  const h = rng.float(3, 6);
  const color = rng.chance(0.5) ? mixHex(style.palette.glow, "#e8ffb0", 0.6) : mixHex(style.palette.glow, "#ffe9a0", 0.4);
  b.effect([0, h * 0.6 + 1, 0], [r * 2, h, r * 2], { kind: "fireflies", color, rate: 2 + r * 0.25 }, { lod: 1 });
  b.add({ shape: "sphere", position: [0, h * 0.6 + 1, 0], size: [0.4, 0.4, 0.4], rotation: [0, 0, 0], color, material: "Neon", transparency: 1, collide: false, castShadow: false, lod: 1, light: { type: "point", color, brightness: 0.35, range: r * 1.6 } });
  return b.build({ id: `firefly_swarm/${variant}`, prefab: "firefly_swarm", category: "prop", sinkDepth: 0, footprintRadius: 1, baseRadius: 0.5, tags: ["ambience", "glow"] });
}

/** Invisible ambience volume: low ground mist (hollows, river banks, swamps). */
export function mistPatch(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const r = rng.float(12, 24);
  b.effect([0, 1.2, 0], [r * 2, 1.5, r * 2], { kind: "mist", color: mixHex(style.fog.color, "#ffffff", 0.45), rate: 0.8 + r * 0.05 }, { lod: 1 });
  return b.build({ id: `mist_patch/${variant}`, prefab: "mist_patch", category: "prop", sinkDepth: 0, footprintRadius: 1, baseRadius: 0.5, tags: ["ambience"] });
}
