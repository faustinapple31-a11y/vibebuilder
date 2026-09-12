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

/** Reeds / cattails on river banks and lake shores. */
export function reeds(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const stalks = rng.int(5, 9);
  const green = jitterHex(mixHex(style.palette.foliageAlt, "#8fb04a", 0.4), jitter(rng, 8), 0, jitter(rng, 0.06));
  for (let i = 0; i < stalks; i++) {
    const h = rng.float(3.5, 6.5);
    const x = jitter(rng, 1.8);
    const z = jitter(rng, 1.8);
    const lean = jitter(rng, 0.12);
    const tip: Vec3 = [x + lean * h, h, z + jitter(rng, 0.1) * h];
    b.segment([x, -0.3, z], tip, 0.22, green, { material: style.materials.canopy, collide: false, castShadow: false, lod: i < 4 ? 1 : 0, overlap: 0 });
    if (rng.chance(0.5)) b.cylinder([tip[0], tip[1] - 0.8, tip[2]], 0.45, 1.6, "#5a3a22", { material: "Fabric", rotation: [0, 0, -lean * 60], collide: false, castShadow: false, lod: 0 });
  }
  return b.build({ id: `reeds/${variant}`, prefab: "reeds", category: "vegetation", sinkDepth: 0.3, footprintRadius: 2, tags: ["undergrowth", "water", "bank"] });
}

/** Lily pads floating on still water (placed at the water level, never tilted or snapped to the bed). */
export function lilyPad(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const pads = rng.int(2, 4);
  for (let i = 0; i < pads; i++) {
    const d = rng.float(2, 3.6);
    const x = i === 0 ? 0 : jitter(rng, 3);
    const z = i === 0 ? 0 : jitter(rng, 3);
    b.cylinder([x, 0.12, z], d, 0.2, jitterHex("#3f7a3a", jitter(rng, 8), 0, jitter(rng, 0.08)), { material: "SmoothPlastic", collide: false, castShadow: false, lod: i === 0 ? 2 : 1 });
    if (rng.chance(0.35)) {
      const col = rng.pick(["#f2d9e6", "#ffd9a8", style.palette.glow]);
      b.box([x + d * 0.2, 0.55, z], [0.9, 0.7, 0.9], col, { material: col === style.palette.glow ? "Neon" : "SmoothPlastic", rotation: [0, 45, 0], collide: false, castShadow: false, lod: 0 });
    }
  }
  return b.build({ id: `lily_pad/${variant}`, prefab: "lily_pad", category: "vegetation", sinkDepth: 0, footprintRadius: 3, baseRadius: 0.5, tags: ["water", "floating"] });
}

/** Low dry-stone wall segment (village boundaries, field edges). */
export function stoneWall(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const len = rng.float(9, 13);
  const stone = jitterHex(style.palette.stone, jitter(rng, 5), 0, jitter(rng, 0.05));
  const h = rng.float(2.2, 3);
  b.box([0, h / 2 - 0.4, 0], [len, h + 0.8, 1.4], stone, { material: style.materials.stoneWall, rotation: [jitter(rng, 1.5), 0, jitter(rng, 1.5)], collide: true, lod: 2 });
  // capstones
  const caps = Math.floor(len / 2.2);
  for (let i = 0; i < caps; i++) {
    const x = -len / 2 + 1.1 + i * 2.2;
    b.box([x, h + 0.2, jitter(rng, 0.15)], [1.9, 0.6, 1.6], jitterHex(stone, 0, 0, jitter(rng, 0.06)), { material: style.materials.stoneWall, rotation: [jitter(rng, 4), jitter(rng, 6), jitter(rng, 4)], collide: false, lod: i % 2 === 0 ? 1 : 0 });
  }
  if (rng.chance(style.rock.mossChance)) b.box([jitter(rng, len * 0.3), h * 0.5, 0.75], [rng.float(2, 4), h * 0.6, 0.25], style.palette.foliageAlt, { material: "Grass", collide: false, castShadow: false, lod: 0 });
  return b.build({ id: `stone_wall/${variant}`, prefab: "stone_wall", category: "prop", sinkDepth: 0.5, footprintRadius: len / 2, tags: ["village", "wall"] });
}

/** Market stall: table, canvas awning on posts, goods. Opening faces -Z. */
export function marketStall(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const wood = woodColor(ctx);
  const w = rng.float(8, 10);
  const d = 5;
  const canvas = jitterHex(rng.pick([style.palette.accent, "#c9563a", "#3a6fb0", "#c9a45a"]), jitter(rng, 6), 0, jitter(rng, 0.06));
  // table
  b.box([0, 2.8, 0], [w, 0.5, d], wood, { material: style.materials.wall, collide: true, lod: 2 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([sx * (w / 2 - 0.5), 1.3, sz * (d / 2 - 0.5)], [0.5, 2.6, 0.5], jitterHex(wood, 0, 0, -0.1), { material: style.materials.trunk, collide: false, lod: 1 });
  b.box([0, 1.2, 0.3], [w - 1.5, 2.2, d - 1.8], jitterHex(wood, 0, 0, -0.05), { material: style.materials.wall, collide: false, lod: 1 });
  // posts + awning (sloped canvas)
  for (const sx of [-1, 1]) {
    b.box([sx * (w / 2 - 0.2), 4.6, d / 2 - 0.2], [0.45, 9.2, 0.45], wood, { material: style.materials.trunk, collide: false, lod: 1 });
    b.box([sx * (w / 2 - 0.2), 4.0, -d / 2 - 1.2], [0.45, 8, 0.45], wood, { material: style.materials.trunk, collide: false, lod: 1 });
  }
  b.beam([0, 9.2, d / 2 - 0.2], [0, 8.0, -d / 2 - 1.2], 0.25, w + 0.6, canvas, { material: "Fabric", collide: false, castShadow: true, lod: 2, overlap: 0.3 });
  // striped valance
  for (let i = 0; i < 4; i++) b.box([-w / 2 + 0.75 + i * (w / 4) + w / 8 - 0.4, 7.4, -d / 2 - 1.2], [w / 4 - 0.4, 1.0, 0.15], i % 2 === 0 ? canvas : "#efe6d2", { material: "Fabric", collide: false, castShadow: false, lod: 0 });
  // goods: crates, a sack, produce
  b.box([-w * 0.3, 3.55, -0.5], [1.6, 1.0, 1.6], jitterHex(wood, 0, 0, 0.05), { material: style.materials.wall, rotation: [0, 15, 0], collide: false, lod: 0 });
  b.sphere([w * 0.25, 3.6, 0.2], 1.3, "#b89a6a", { material: "Fabric", collide: false, lod: 0 });
  for (let i = 0; i < 5; i++) b.sphere([w * 0.02 + jitter(rng, 1.2), 3.35, jitter(rng, 1.0)], 0.6, rng.pick(["#d9743a", "#c9a24a", "#8fb04a", style.palette.mushroom]), { material: "SmoothPlastic", collide: false, castShadow: false, lod: 0 });
  // lantern under the awning
  const glow = mixHex("#ffb866", style.palette.glow, 0.3);
  b.box([w * 0.35, 6.4, -d / 2 - 0.6], [0.7, 0.9, 0.7], glow, { material: "Neon", transparency: 0.2, collide: false, lod: 1, light: { type: "point", color: glow, brightness: 1.0, range: 16 } });
  return b.build({ id: `market_stall/${variant}`, prefab: "market_stall", category: "prop", sinkDepth: 0.3, footprintRadius: w / 2 + 1.5, baseRadius: w / 2, tags: ["village", "market"] });
}

/** String of hanging lanterns between two posts (spans a village street along local X). */
export function lanternString(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const wood = woodColor(ctx);
  const len = 14;
  const h = rng.float(10, 12);
  for (const sx of [-1, 1]) b.box([sx * len / 2, h / 2 - 0.3, 0], [0.8, h + 0.6, 0.8], wood, { material: style.materials.trunk, rotation: [0, 0, jitter(rng, 1.5)], collide: true, lod: 2 });
  // rope as a shallow catenary of 6 segments
  const pts: Vec3[] = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n - 0.5;
    pts.push([t * len, h - 0.4 - (0.25 - t * t) * 6, 0]);
  }
  b.chain(pts, 0.18, 0.18, "#4a3a2a", { material: "Fabric", collide: false, castShadow: false, lod: 1 });
  const glow = mixHex("#ffb866", style.palette.glow, 0.35);
  for (let i = 1; i < n; i++) {
    const p = pts[i]!;
    const lit = rng.chance(0.85);
    b.box([p[0], p[1] - 0.35, 0], [0.12, 0.6, 0.12], "#2b2622", { material: style.materials.metal, collide: false, castShadow: false, lod: 0 });
    b.box([p[0], p[1] - 1.2, 0], [0.9, 1.2, 0.9], lit ? glow : "#3a332c", { material: lit ? "Neon" : "Glass", transparency: lit ? 0.15 : 0.4, collide: false, lod: 1, light: lit ? { type: "point", color: glow, brightness: 0.9, range: 14 } : undefined });
  }
  return b.build({ id: `lantern_string/${variant}`, prefab: "lantern_string", category: "prop", sinkDepth: 0.4, footprintRadius: len / 2, tags: ["village", "light"] });
}


/**
 * Waterfall dressing for a steep river drop: translucent water sheet, foam at the foot, spray + mist.
 * Local +Z is downstream (the sheet hangs from y=height at z≈0 down to the pool at y=0).
 */
export function waterfall(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const height = rng.float(8, 16);
  const width = rng.float(8, 14);
  const water = mixHex(style.palette.water, "#dff4ff", 0.55);
  // sheet: slightly tilted forward so it reads as falling water
  b.box([0, height / 2, 0], [width, height, 0.8], water, { material: "Glass", transparency: 0.35, rotation: [-6, 0, 0], collide: false, castShadow: false, lod: 2, reflectance: 0.2 });
  b.box([0, height / 2, -0.5], [width * 0.6, height, 0.5], "#f3fbff", { material: "Neon", transparency: 0.7, rotation: [-6, 0, 0], collide: false, castShadow: false, lod: 1 });
  // foam ring at the foot
  b.cylinder([0, 0.3, 2.5], width * 1.1, 0.6, "#eef7ff", { material: "SmoothPlastic", transparency: 0.25, collide: false, castShadow: false, lod: 1 });
  b.effect([0, 1.5, 2.5], [width * 1.2, 2, 6], { kind: "mist", color: "#e8f4ff", rate: 3 }, { lod: 1 });
  b.effect([0, 2.5, 2], [width, 3, 3], { kind: "sparkle", color: "#ffffff", rate: 10 }, { lod: 1 });
  // wet rocks at the sides
  for (const sx of [-1, 1]) {
    b.box([sx * (width / 2 + 1.2), 1.4, 0.5], [3, 3.2, 3], jitterHex(style.palette.stone, 0, -0.1, -0.15), { material: style.materials.rock, rotation: [jitter(rng, 10), rng.float(0, 360), jitter(rng, 10)], collide: true, lod: 1 });
  }
  return b.build({ id: `waterfall/${variant}`, prefab: "waterfall", category: "prop", sinkDepth: 0, footprintRadius: width / 2 + 2, baseRadius: 1, tags: ["water", "floating", "ambience"] });
}

/** Vegetable plot beside a cottage: tilled rows with leafy plants and a stick fence corner. */
export function cropPlot(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const w = rng.float(9, 13);
  const d = rng.float(7, 10);
  const rows = rng.int(3, 4);
  const soil = jitterHex("#5a4030", jitter(rng, 5), 0, jitter(rng, 0.05));
  b.box([0, 0.1, 0], [w, 0.7, d], soil, { material: "Mud", collide: false, castShadow: false, lod: 2 });
  const leaf = jitterHex(mixHex(style.palette.foliageAlt, "#7fb04a", 0.4), jitter(rng, 8), 0, jitter(rng, 0.06));
  for (let r = 0; r < rows; r++) {
    const z = -d / 2 + (r + 0.5) * (d / rows);
    b.box([0, 0.45, z], [w - 1, 0.5, 1.2], jitterHex(soil, 0, 0, 0.08), { material: "Ground", collide: false, castShadow: false, lod: 1 });
    const plants = Math.floor((w - 2) / 1.6);
    for (let i = 0; i < plants; i++) {
      const x = -w / 2 + 1.5 + i * 1.6;
      const s = rng.float(0.7, 1.2);
      b.box([x, 0.9 + s * 0.3, z], [s, s * 0.7, s], jitterHex(leaf, jitter(rng, 6), 0, jitter(rng, 0.06)), { material: style.materials.canopy, rotation: [0, rng.float(0, 90), 0], collide: false, castShadow: false, lod: i % 2 === 0 ? 1 : 0 });
      if (rng.chance(0.25)) b.sphere([x, 1.0 + s * 0.6, z], 0.45, rng.pick(["#d9743a", "#c9a24a", "#b03a3a"]), { collide: false, castShadow: false, lod: 0 });
    }
  }
  // stick fence along two sides
  const wood = jitterHex(style.palette.wood, 0, 0, -0.05);
  for (let i = 0; i <= 3; i++) b.box([-w / 2 + (i * w) / 3, 1.0, -d / 2 - 0.3], [0.35, 2.2, 0.35], wood, { material: style.materials.trunk, collide: false, lod: 0 });
  b.box([0, 1.6, -d / 2 - 0.3], [w, 0.25, 0.25], wood, { material: style.materials.trunk, collide: false, lod: 0 });
  for (let i = 0; i <= 2; i++) b.box([-w / 2 - 0.3, 1.0, -d / 2 + (i * d) / 2], [0.35, 2.2, 0.35], wood, { material: style.materials.trunk, collide: false, lod: 0 });
  b.box([-w / 2 - 0.3, 1.6, 0], [0.25, 0.25, d], wood, { material: style.materials.trunk, collide: false, lod: 0 });
  return b.build({ id: `crop_plot/${variant}`, prefab: "crop_plot", category: "prop", sinkDepth: 0.35, footprintRadius: Math.max(w, d) / 2 + 0.5, tags: ["village", "farm"] });
}

/** Dense flower patch for meadows and clearings (one placement = a whole bed). */
export function flowerPatch(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const r = rng.float(3, 5);
  const palette = [style.palette.accent, style.palette.glow, "#e8c46a", "#d96c8a", "#8fd0e8", "#f2f0e6"];
  const main = rng.pick(palette);
  const second = rng.pick(palette);
  const n = rng.int(7, 11);
  for (let i = 0; i < n; i++) {
    const a = rng.float(0, Math.PI * 2);
    const rr = Math.sqrt(rng.next()) * r;
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    const h = rng.float(0.9, 1.8);
    b.box([x, h / 2 - 0.15, z], [0.18, h + 0.3, 0.18], style.palette.foliageAlt, { material: style.materials.canopy, collide: false, castShadow: false, lod: i < 4 ? 1 : 0 });
    b.box([x, h + 0.15, z], [0.8, 0.35, 0.8], jitterHex(rng.chance(0.7) ? main : second, jitter(rng, 8), 0, jitter(rng, 0.08)), { rotation: [0, rng.float(0, 90), 0], collide: false, castShadow: false, lod: i < 4 ? 1 : 0 });
  }
  b.box([0, 0.25, 0], [r * 1.6, 0.5, r * 1.6], jitterHex(style.palette.foliageAlt, 0, 0.05, 0.08), { material: "Grass", rotation: [0, rng.float(0, 360), 0], collide: false, castShadow: false, lod: 2 });
  return b.build({ id: `flower_patch/${variant}`, prefab: "flower_patch", category: "vegetation", sinkDepth: 0.3, footprintRadius: r, tags: ["undergrowth", "flower"] });
}
