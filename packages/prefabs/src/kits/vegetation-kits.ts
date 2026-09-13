import { jitterHex, lightenHex, mixHex, type PrefabVariant, type Vec3 } from "@worldforge/core";
import { PartListBuilder, jitter, v3, type PrefabContext } from "../builder";
import { branch, roots, trunkChain } from "../vegetation";

/**
 * Vegetation for the non-temperate kits: jungle, savanna, alien, bamboo, cherry, burnt, candy,
 * coral/kelp, snow pines, cypress. Same construction rules as vegetation.ts (chains of connected segments).
 */

function foliage(ctx: PrefabContext, base?: string): string {
  const { rng, style } = ctx;
  const b = base ?? (rng.chance(0.65) ? style.palette.foliage : style.palette.foliageAlt);
  return jitterHex(b, jitter(rng, style.tree.hueJitterDeg), jitter(rng, 0.06), jitter(rng, 0.05));
}

function lump(b: PartListBuilder, ctx: PrefabContext, p: Vec3, s: number, sy: number, col: string, lod: 0 | 1 | 2): void {
  const { rng, style } = ctx;
  const smooth = style.geometry === "rounded" || style.geometry === "smooth_low_poly";
  if (smooth) b.sphere(p, s, col, { material: style.materials.canopy, collide: false, lod });
  else b.box(p, [s, sy, s], col, { material: style.materials.canopy, rotation: [jitter(rng, 22), rng.float(0, 360), jitter(rng, 22)], collide: false, lod });
}

export function jungleTree(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const height = rng.float(30, 46);
  const trunkH = height * 0.6;
  const trunkD = rng.float(3, 4.5);
  const t = trunkChain(b, ctx, trunkH, trunkD, 3, jitter(rng, 0.08), 0.05);
  roots(b, ctx, t, rng.int(4, 6), trunkD * 1.4, 1); // buttress roots
  const color = foliage(ctx);
  const canopyR = rng.float(9, 13);
  const crown = v3.add(t.top, v3.scale(t.dir, canopyR * 0.4));
  lump(b, ctx, crown, canopyR * 1.4, canopyR * 0.7, color, 2);
  const n = rng.int(5, 7);
  const start = v3.lerp(t.points[t.points.length - 2]!, t.top, 0.6);
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * Math.PI * 2 + jitter(rng, 0.3);
    const tip = branch(b, ctx, start, yaw, rng.float(0.05, 0.4), canopyR * rng.float(0.9, 1.3), trunkD * 0.3, t.color, i < 3 ? 1 : 0, 0.3);
    lump(b, ctx, tip, canopyR * rng.float(0.7, 0.95), canopyR * 0.5, jitterHex(color, jitter(rng, 12), 0, jitter(rng, 0.08)), i < 3 ? 2 : 1);
  }
  // hanging vines from the crown
  for (let i = 0; i < 4; i++) {
    const a = rng.float(0, Math.PI * 2);
    const from: Vec3 = [crown[0] + Math.cos(a) * canopyR * 0.55, crown[1] - canopyR * 0.3, crown[2] + Math.sin(a) * canopyR * 0.55];
    b.segment(from, [from[0] + jitter(rng, 1), from[1] - rng.float(8, 16), from[2] + jitter(rng, 1)], 0.35, mixHex(color, "#000000", 0.2), { material: "Grass", collide: false, lod: 0 });
  }
  return b.build({ id: `jungle_tree/${variant}`, prefab: "jungle_tree", category: "vegetation", sinkDepth: 1.2, footprintRadius: canopyR, tags: ["tree", "jungle"] });
}

export function baobab(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const trunkH = rng.float(14, 20);
  const trunkD = rng.float(8, 12);
  b.cylinder([0, trunkH / 2 - 0.6, 0], trunkD, trunkH + 1.2, t0(ctx), { material: style.materials.trunk, collide: true, lod: 2 });
  b.cylinder([0, trunkH - 0.5, 0], trunkD * 0.7, 2, t0(ctx), { material: style.materials.trunk, collide: false, lod: 1 });
  const color = foliage(ctx);
  const n = rng.int(6, 8);
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * Math.PI * 2 + jitter(rng, 0.3);
    const from: Vec3 = [Math.cos(yaw) * trunkD * 0.25, trunkH - 0.5, Math.sin(yaw) * trunkD * 0.25];
    const tip = branch(b, ctx, from, yaw, rng.float(0.5, 1.1), rng.float(6, 10), trunkD * 0.22, t0(ctx), i < 4 ? 1 : 0, 0.4);
    lump(b, ctx, tip, rng.float(4, 6), 2.5, color, i < 4 ? 1 : 0);
  }
  return b.build({ id: `baobab/${variant}`, prefab: "baobab", category: "vegetation", sinkDepth: 1.5, footprintRadius: 10, tags: ["tree", "savanna"] });
}
const t0 = (ctx: PrefabContext) => jitterHex(ctx.style.palette.wood, jitter(ctx.rng, 6), jitter(ctx.rng, 0.05), jitter(ctx.rng, 0.06));

export function acacia(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const trunkH = rng.float(14, 20);
  const t = trunkChain(b, ctx, trunkH, rng.float(2, 3), 2, jitter(rng, 0.2), 0.08);
  const color = foliage(ctx);
  const n = rng.int(3, 4);
  const start = v3.lerp(t.points[t.points.length - 2]!, t.top, 0.7);
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * Math.PI * 2 + jitter(rng, 0.5);
    const tip = branch(b, ctx, start, yaw, rng.float(0.4, 0.7), rng.float(7, 10), 1.2, t.color, 1, 0.5);
    // flat umbrella canopy
    b.box([tip[0], tip[1] + 0.8, tip[2]], [rng.float(9, 13), 1.8, rng.float(9, 13)], jitterHex(color, jitter(rng, 8), 0, 0), { material: ctx.style.materials.canopy, rotation: [0, rng.float(0, 90), 0], collide: false, lod: i === 0 ? 2 : 1 });
  }
  b.box([t.top[0], t.top[1] + 1.2, t.top[2]], [16, 2.4, 16], lightenHex(color, 0.05), { material: ctx.style.materials.canopy, rotation: [0, rng.float(0, 90), 0], collide: false, lod: 2 });
  return b.build({ id: `acacia/${variant}`, prefab: "acacia", category: "vegetation", sinkDepth: 1.0, footprintRadius: 9, tags: ["tree", "savanna"] });
}

export function alienTree(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const trunkH = rng.float(18, 30);
  const t = trunkChain(b, ctx, trunkH, rng.float(2, 3.5), 4, jitter(rng, 0.25), 0.18, { color: mixHex(style.palette.wood, style.palette.accent, 0.35) });
  const glowCol = rng.chance(0.5) ? style.palette.glow : style.palette.mushroomAlt;
  // glowing pods along the trunk and at the branch tips
  for (let i = 1; i < t.points.length; i++) {
    const p = t.points[i]!;
    b.sphere([p[0] + jitter(rng, 1), p[1], p[2] + jitter(rng, 1)], rng.float(1.6, 2.6), glowCol, { material: "Neon", collide: false, lod: 1, light: i === t.points.length - 1 ? { type: "point" as const, color: glowCol, brightness: 1.2, range: 22 } : undefined });
  }
  const n = rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    const from = t.points[rng.int(2, t.points.length - 1)]!;
    const tip = branch(b, ctx, from, rng.float(0, Math.PI * 2), rng.float(0.6, 1.2), rng.float(6, 10), 1.1, t.color, 1, 0.6);
    b.sphere(tip, rng.float(3, 5), foliage(ctx, style.palette.foliage), { material: "Neon", collide: false, lod: 1, transparency: 0.1 });
    b.sphere(tip, rng.float(1.2, 2), glowCol, { material: "Neon", collide: false, lod: 0 });
  }
  b.sphere(t.top, rng.float(5, 8), foliage(ctx, style.palette.foliageAlt), { material: "Neon", collide: false, lod: 2, transparency: 0.1 });
  b.effect([t.top[0], t.top[1] - 4, t.top[2]], [10, 10, 10], { kind: "spores", color: glowCol, rate: 2, size: 0.3 }, { lod: 0 });
  return b.build({ id: `alien_tree/${variant}`, prefab: "alien_tree", category: "vegetation", sinkDepth: 1.0, footprintRadius: 7, tags: ["tree", "alien", "glow"] });
}

export function bamboo(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const n = rng.int(5, 9);
  const col = jitterHex("#8ab850", jitter(rng, 10), 0, jitter(rng, 0.08));
  for (let i = 0; i < n; i++) {
    const x = jitter(rng, 2.5);
    const z = jitter(rng, 2.5);
    const h = rng.float(14, 24);
    const lean = jitter(rng, 0.06);
    const pts: Vec3[] = [[x, -0.5, z]];
    for (let s = 1; s <= 3; s++) pts.push([x + lean * h * (s / 3) * 3, (h * s) / 3, z + jitter(rng, 0.5)]);
    b.chain(pts, 0.9, 0.55, col, { material: "SmoothPlastic", collide: i < 3, lod: i < 3 ? 2 : 1 });
    for (let s = 1; s <= 3; s++) b.cylinder(pts[s]!, 1.1, 0.35, mixHex(col, "#000000", 0.25), { material: "SmoothPlastic", collide: false, lod: 0 });
    const top = pts[3]!;
    for (let l = 0; l < 3; l++) {
      const from: Vec3 = [pts[3 - Math.min(l, 1)]![0], top[1] - l * 2.2, pts[3 - Math.min(l, 1)]![2]];
      const yaw = rng.float(0, Math.PI * 2);
      const len = rng.float(2.5, 4);
      b.beam(from, [from[0] + Math.cos(yaw) * len, from[1] + rng.float(-0.6, 0.8), from[2] + Math.sin(yaw) * len], 0.2, 0.5, foliage(ctx, style.palette.foliage), { material: "Grass", collide: false, lod: 0 });
    }
  }
  return b.build({ id: `bamboo/${variant}`, prefab: "bamboo", category: "vegetation", sinkDepth: 0.8, footprintRadius: 3.5, tags: ["tree", "bamboo"] });
}

export function cherryTree(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const trunkH = rng.float(10, 15);
  const t = trunkChain(b, ctx, trunkH, rng.float(2.4, 3.4), 2, jitter(rng, 0.15), 0.1, { color: mixHex(style.palette.wood, "#3a2a24", 0.4) });
  roots(b, ctx, t, 3, 2.4, 0);
  const pink = jitterHex("#f2a6c4", jitter(rng, 8), jitter(rng, 0.08), jitter(rng, 0.05));
  const n = rng.int(5, 7);
  const start = v3.lerp(t.points[t.points.length - 2]!, t.top, 0.5);
  for (let i = 0; i < n; i++) {
    const yaw = (i / n) * Math.PI * 2 + jitter(rng, 0.4);
    const tip = branch(b, ctx, start, yaw, rng.float(0.3, 0.9), rng.float(6, 9), 1.0, t.color, i < 3 ? 1 : 0, 0.4);
    lump(b, ctx, tip, rng.float(5, 7), 4, jitterHex(pink, jitter(rng, 6), 0, jitter(rng, 0.06)), i < 3 ? 2 : 1);
  }
  lump(b, ctx, [t.top[0], t.top[1] + 3, t.top[2]], 8, 6, lightenHex(pink, 0.06), 2);
  b.effect([t.top[0], t.top[1] - 2, t.top[2]], [14, 10, 14], { kind: "sparkle", color: "#ffd0e0", rate: 1.5, size: 0.25 }, { lod: 0, name: "petals" });
  return b.build({ id: `cherry_tree/${variant}`, prefab: "cherry_tree", category: "vegetation", sinkDepth: 1.0, footprintRadius: 8, tags: ["tree", "cherry"] });
}

export function burntTree(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const trunkH = rng.float(12, 22);
  const t = trunkChain(b, ctx, trunkH, rng.float(2, 3.2), 3, jitter(rng, 0.15), 0.15, { color: jitterHex("#2a2420", 0, 0, jitter(rng, 0.05)) });
  const n = rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    const from = t.points[rng.int(1, t.points.length - 1)]!;
    branch(b, ctx, from, rng.float(0, Math.PI * 2), rng.float(0.3, 1.1), rng.float(4, 8), 0.8, t.color, i < 2 ? 1 : 0, 0.6);
  }
  if (rng.chance(0.4)) {
    b.sphere([t.points[1]![0], t.points[1]![1], t.points[1]![2]], 1.2, "#ff6a20", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ff7a30", brightness: 0.8, range: 12 }, effect: { kind: "embers", color: "#ff8040", rate: 1, size: 0.2 } });
  }
  b.effect([t.top[0], t.top[1], t.top[2]], [4, 6, 4], { kind: "smoke", color: "#404040", rate: 0.6, size: 1 }, { lod: 0 });
  return b.build({ id: `burnt_tree/${variant}`, prefab: "burnt_tree", category: "vegetation", sinkDepth: 1.0, footprintRadius: 3, tags: ["tree", "dead", "burnt"] });
}

export function candyTree(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const trunkH = rng.float(8, 14);
  const trunkD = rng.float(1.6, 2.6);
  b.cylinder([0, trunkH / 2 - 0.5, 0], trunkD, trunkH + 1, "#ffffff", { material: "SmoothPlastic", collide: true, lod: 2 });
  for (let i = 0; i < Math.floor(trunkH / 1.6); i++) b.cylinder([0, 0.8 + i * 1.6, 0], trunkD + 0.1, 0.7, "#ff3050", { material: "SmoothPlastic", collide: false, lod: 0, rotation: [18, 0, 0] });
  const cols = ["#ff8ab0", "#8ae0ff", "#ffe060", "#a0f080", "#d0a0ff"];
  const R = rng.float(5, 8);
  b.sphere([0, trunkH + R * 0.5, 0], R * 1.8, cols[rng.int(0, 4)]!, { material: "SmoothPlastic", collide: false, lod: 2 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.sphere([Math.cos(a) * R * 0.8, trunkH + R * 0.5 + jitter(rng, R * 0.4), Math.sin(a) * R * 0.8], R * rng.float(0.8, 1.1), cols[rng.int(0, 4)]!, { material: "SmoothPlastic", collide: false, lod: 1 });
  }
  return b.build({ id: `candy_tree/${variant}`, prefab: "candy_tree", category: "vegetation", sinkDepth: 0.8, footprintRadius: R, tags: ["tree", "candy"] });
}

export function coral(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const cols = ["#ff7a50", "#ff50a0", "#ffc050", "#c060ff", "#40e0c0"];
  const col = cols[rng.int(0, 4)]!;
  const kind = rng.int(0, 2);
  if (kind === 0) {
    // branching
    const base: Vec3 = [0, -0.4, 0];
    for (let i = 0; i < rng.int(5, 8); i++) {
      const yaw = rng.float(0, Math.PI * 2);
      const tip = branch(b, ctx, base, yaw, rng.float(0.6, 1.3), rng.float(3, 6), 0.7, col, 1, 0.5);
      branch(b, ctx, tip, yaw + jitter(rng, 1), rng.float(0.5, 1.3), rng.float(1.5, 3), 0.45, col, 0);
    }
  } else if (kind === 1) {
    // brain / boulder coral
    b.sphere([0, 1.2, 0], rng.float(3, 5), col, { material: "Sand", collide: true, lod: 1 });
    b.sphere([1.5, 1.8, 1], rng.float(2, 3), mixHex(col, "#ffffff", 0.2), { material: "Sand", collide: false, lod: 0 });
  } else {
    // tube / fan coral
    for (let i = 0; i < rng.int(4, 7); i++) b.cylinder([jitter(rng, 1.5), rng.float(1.5, 3), jitter(rng, 1.5)], rng.float(0.6, 1.2), rng.float(3, 6), jitterHex(col, jitter(rng, 10), 0, 0), { material: "SmoothPlastic", collide: false, lod: 0, rotation: [jitter(rng, 20), 0, jitter(rng, 20)] });
  }
  b.effect([0, 3, 0], [3, 4, 3], { kind: "sparkle", color: "#c0f0ff", rate: 1, size: 0.25 }, { lod: 0 });
  return b.build({ id: `coral/${variant}`, prefab: "coral", category: "vegetation", sinkDepth: 0.6, footprintRadius: 3, tags: ["coral", "underwater"] });
}

export function seaweed(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const col = jitterHex("#3aa080", jitter(rng, 12), 0, jitter(rng, 0.08));
  for (let i = 0; i < rng.int(4, 7); i++) {
    const x = jitter(rng, 2);
    const z = jitter(rng, 2);
    const h = rng.float(6, 14);
    const pts: Vec3[] = [[x, -0.4, z]];
    for (let s = 1; s <= 3; s++) pts.push([x + jitter(rng, 1.2), (h * s) / 3, z + jitter(rng, 1.2)]);
    b.chain(pts, 0.6, 0.3, col, { material: "Grass", collide: false, lod: i < 2 ? 1 : 0 });
    b.box([pts[3]![0], pts[3]![1], pts[3]![2]], [1.6, 0.2, 0.6], col, { material: "Grass", collide: false, lod: 0, rotation: [0, rng.float(0, 180), 30] });
  }
  return b.build({ id: `seaweed/${variant}`, prefab: "seaweed", category: "vegetation", sinkDepth: 0.5, footprintRadius: 2.5, tags: ["underwater", "undergrowth"] });
}

export function snowPine(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const height = rng.float(24, 40);
  const trunkD = rng.float(2.2, 3.4);
  const t = trunkChain(b, ctx, height * 0.55, trunkD, 2, jitter(rng, 0.05), 0.03);
  roots(b, ctx, t, 3, trunkD * 0.7, 0);
  const green = foliage(ctx, style.palette.foliage);
  const layers = rng.int(4, 6);
  for (let i = 0; i < layers; i++) {
    const f = i / layers;
    const y = height * 0.35 + f * height * 0.6;
    const w = (1 - f * 0.8) * height * 0.32;
    const p = v3.add(t.points[0]!, [t.dir[0] * y, y, t.dir[2] * y]);
    b.wedge([p[0], p[1], p[2] - w / 4], [w, w * 0.7, w / 2], green, { material: style.materials.canopy, collide: false, lod: i < 2 ? 2 : 1 });
    b.wedge([p[0], p[1], p[2] + w / 4], [w, w * 0.7, w / 2], green, { material: style.materials.canopy, collide: false, lod: i < 2 ? 2 : 1, rotation: [0, 180, 0] });
    // snow cap on each layer
    b.box([p[0], p[1] + w * 0.36, p[2]], [w * 0.75, 0.6, w * 0.75], "#f4f8ff", { material: "Snow", collide: false, lod: i < 2 ? 1 : 0, rotation: [0, 45, 0] });
  }
  const topY = height * 0.35 + ((layers - 1) / layers) * height * 0.6;
  b.box([t.top[0], topY + height * 0.32 * 0.7 * (0.2) + 1.2, t.top[2]], [1.2, 3, 1.2], "#f4f8ff", { material: "Snow", collide: false, lod: 0 });
  return b.build({ id: `snow_pine/${variant}`, prefab: "snow_pine", category: "vegetation", sinkDepth: 1.0, footprintRadius: height * 0.16, tags: ["tree", "conifer", "arctic"] });
}

export function cypress(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const height = rng.float(20, 32);
  const t = trunkChain(b, ctx, height * 0.3, rng.float(1.6, 2.4), 1, 0.02, 0.02);
  const col = foliage(ctx, mixHex(style.palette.foliage, "#1f3a2a", 0.4));
  const n = 5;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const y = height * 0.25 + f * height * 0.7;
    const d = (1 - Math.abs(f - 0.35) * 1.4) * height * 0.14 + 1.5;
    b.cylinder([t.top[0], y, t.top[2]], d * 2, height * 0.2, jitterHex(col, 0, 0, jitter(rng, 0.05)), { material: style.materials.canopy, collide: false, lod: i < 3 ? 2 : 1 });
  }
  b.sphere([t.top[0], height * 0.97, t.top[2]], 2, col, { material: style.materials.canopy, collide: false, lod: 0 });
  return b.build({ id: `cypress/${variant}`, prefab: "cypress", category: "vegetation", sinkDepth: 1.0, footprintRadius: 3.5, tags: ["tree", "savanna"] });
}
