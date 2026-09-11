import { jitterHex, lightenHex, mixHex, type PrefabVariant } from "@worldforge/core";
import { PartListBuilder, jitter, type PrefabContext } from "./builder";

/**
 * Vegetation prefabs — chunky low-poly trees, giant mushrooms, undergrowth.
 * Every builder takes the variant index so the same seed reproduces the same set.
 */

function foliageColor(ctx: PrefabContext, base?: string): string {
  const { rng, style } = ctx;
  const b = base ?? (rng.chance(0.65) ? style.palette.foliage : style.palette.foliageAlt);
  return jitterHex(b, jitter(rng, style.tree.hueJitterDeg), jitter(rng, 0.06), jitter(rng, 0.05));
}

function trunkColor(ctx: PrefabContext): string {
  return jitterHex(ctx.style.palette.wood, jitter(ctx.rng, 6), jitter(ctx.rng, 0.05), jitter(ctx.rng, 0.06));
}

/** Tapered trunk from stacked cylinders. Returns top Y. */
function trunk(b: PartListBuilder, ctx: PrefabContext, height: number, baseDiameter: number, segments = 2, lean = 0): number {
  const { style } = ctx;
  const color = trunkColor(ctx);
  const taper = style.tree.trunkTaper;
  let y = 0;
  let x = 0;
  const segH = height / segments;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const d0 = baseDiameter * (1 - (1 - taper) * t0);
    const d1 = baseDiameter * (1 - (1 - taper) * t1);
    const d = (d0 + d1) / 2;
    x += lean * segH * 0.15;
    b.cylinder([x, y + segH / 2, 0], d, segH + 0.2, color, { material: style.materials.trunk, rotation: [0, 0, lean * 8], collide: true, lod: 2 });
    y += segH;
  }
  return y;
}

export function pineTree(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const height = rng.float(22, 34);
  const trunkH = height * rng.float(0.22, 0.32);
  const trunkD = rng.float(2.2, 3.4);
  const topY = trunk(b, ctx, trunkH, trunkD, 2);
  const layers = rng.int(Math.max(3, style.tree.canopyLayers[0] + 1), style.tree.canopyLayers[1] + 2);
  const canopyH = height - trunkH;
  const layerH = canopyH / layers;
  const baseW = rng.float(11, 16);
  const color = foliageColor(ctx);
  const tipColor = lightenHex(color, 0.08);
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1 || 1);
    const w = baseW * (1 - t * 0.78) * rng.float(0.92, 1.08);
    const y = topY - layerH * 0.35 + i * layerH * 0.95 + layerH / 2;
    const rot = i % 2 === 0 ? 0 : 45;
    const col = mixHex(color, tipColor, t);
    b.box([jitter(rng, 0.6), y, jitter(rng, 0.6)], [w, layerH * 1.3, w], col, {
      material: style.materials.canopy,
      rotation: [jitter(rng, 4), rot + jitter(rng, 10), jitter(rng, 4)],
      collide: false,
      castShadow: true,
      lod: i === 0 || i === layers - 1 ? 2 : i % 2 === 0 ? 1 : 0,
    });
  }
  // top spike
  b.box([0, topY + canopyH * 0.98, 0], [2.2, layerH * 1.2, 2.2], tipColor, { material: style.materials.canopy, rotation: [0, 45, 0], collide: false, lod: 1 });
  return b.build({ id: `pine_tree/${variant}`, prefab: "pine_tree", category: "vegetation", sinkDepth: 1.2, footprintRadius: baseW / 2, tags: ["tree", "conifer"] });
}

export function roundTree(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const height = rng.float(18, 30);
  const trunkH = height * rng.float(0.35, 0.5);
  const trunkD = rng.float(2.4, 3.8);
  const lean = jitter(rng, 0.5);
  const topY = trunk(b, ctx, trunkH, trunkD, 2, lean);
  const chunks = rng.int(3, 5);
  const color = foliageColor(ctx);
  const canopyR = rng.float(7, 11);
  // main mass
  b.box([lean * trunkH * 0.15, topY + canopyR * 0.55, 0], [canopyR * 2, canopyR * 1.5, canopyR * 2], color, {
    material: style.materials.canopy,
    rotation: [jitter(rng, 8), rng.float(0, 360), jitter(rng, 8)],
    collide: false,
    lod: 2,
  });
  for (let i = 0; i < chunks; i++) {
    const a = rng.float(0, Math.PI * 2);
    const r = canopyR * rng.float(0.45, 0.85);
    const s = canopyR * rng.float(0.9, 1.4);
    const col = jitterHex(color, jitter(rng, 8), 0, jitter(rng, 0.07));
    b.box([Math.cos(a) * r + lean * trunkH * 0.15, topY + canopyR * rng.float(0.35, 1.0), Math.sin(a) * r], [s, s * rng.float(0.7, 1.0), s], col, {
      material: style.materials.canopy,
      rotation: [jitter(rng, 20), rng.float(0, 360), jitter(rng, 20)],
      collide: false,
      lod: i < 2 ? 1 : 0,
    });
  }
  // branches
  const branches = rng.int(1, 3);
  for (let i = 0; i < branches; i++) {
    const a = rng.float(0, Math.PI * 2);
    const len = rng.float(4, 7);
    b.box([Math.cos(a) * len * 0.4, topY - rng.float(1, 4), Math.sin(a) * len * 0.4], [len, 1.1, 1.1], trunkColor(ctx), {
      material: style.materials.trunk,
      rotation: [0, (-a * 180) / Math.PI, rng.float(20, 40)],
      collide: false,
      lod: 0,
    });
  }
  return b.build({ id: `round_tree/${variant}`, prefab: "round_tree", category: "vegetation", sinkDepth: 1.2, footprintRadius: canopyR, tags: ["tree", "deciduous"] });
}

export function deadTree(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const height = rng.float(16, 28);
  const trunkD = rng.float(2.0, 3.2);
  const lean = jitter(rng, 0.9);
  const color = jitterHex(style.palette.wood, jitter(rng, 5), -0.15, -0.12);
  const topY = trunk(b, ctx, height, trunkD, 3, lean);
  const branches = rng.int(3, 6);
  for (let i = 0; i < branches; i++) {
    const y = height * rng.float(0.45, 0.95);
    const a = rng.float(0, Math.PI * 2);
    const len = rng.float(4, 9) * (1 - y / height + 0.5);
    const tilt = rng.float(25, 60);
    b.box([Math.cos(a) * len * 0.42 + lean * y * 0.15, y, Math.sin(a) * len * 0.42], [len, 0.9, 0.9], color, {
      material: style.materials.trunk,
      rotation: [0, (-a * 180) / Math.PI, tilt],
      collide: false,
      lod: i < 2 ? 2 : 0,
    });
  }
  b.box([lean * topY * 0.15, topY + 1, 0], [1.6, 2.5, 1.6], color, { material: style.materials.trunk, rotation: [jitter(rng, 20), 0, jitter(rng, 20)], collide: false, lod: 1 });
  return b.build({ id: `dead_tree/${variant}`, prefab: "dead_tree", category: "vegetation", sinkDepth: 1.0, footprintRadius: 4, tags: ["tree", "dead"] });
}

export function willowTree(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const height = rng.float(20, 30);
  const trunkH = height * 0.45;
  const topY = trunk(b, ctx, trunkH, rng.float(2.8, 4), 2, jitter(rng, 0.4));
  const color = foliageColor(ctx);
  const r = rng.float(8, 12);
  b.box([0, topY + r * 0.4, 0], [r * 2, r * 1.1, r * 2], color, { material: style.materials.canopy, rotation: [0, rng.float(0, 360), 0], collide: false, lod: 2 });
  const strands = rng.int(6, 10);
  for (let i = 0; i < strands; i++) {
    const a = (i / strands) * Math.PI * 2 + jitter(rng, 0.3);
    const len = rng.float(6, 11);
    b.box([Math.cos(a) * r * 0.95, topY + r * 0.4 - len / 2 + 1, Math.sin(a) * r * 0.95], [2.2, len, 2.2], jitterHex(color, 0, 0, -0.05), {
      material: style.materials.canopy,
      rotation: [jitter(rng, 6), 0, jitter(rng, 6)],
      collide: false,
      lod: i % 2 === 0 ? 1 : 0,
    });
  }
  return b.build({ id: `willow/${variant}`, prefab: "willow", category: "vegetation", sinkDepth: 1.2, footprintRadius: r, tags: ["tree"] });
}

export function birchTree(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const height = rng.float(18, 26);
  const trunkH = height * 0.6;
  const d = rng.float(1.6, 2.4);
  const bark = "#dfe3e6";
  b.cylinder([0, trunkH / 2, 0], d, trunkH, bark, { material: "SmoothPlastic", collide: true, lod: 2 });
  const bands = rng.int(3, 6);
  for (let i = 0; i < bands; i++) {
    b.box([0, rng.float(2, trunkH - 2), 0], [d + 0.1, rng.float(0.4, 0.9), d + 0.1], "#2b2b2b", { rotation: [0, rng.float(0, 90), 0], collide: false, lod: 0 });
  }
  const color = foliageColor(ctx, style.palette.foliageAlt);
  const chunks = rng.int(2, 4);
  for (let i = 0; i < chunks; i++) {
    const s = rng.float(6, 9);
    b.box([jitter(rng, 2.5), trunkH + rng.float(1, 6), jitter(rng, 2.5)], [s, s * 0.9, s], jitterHex(color, jitter(rng, 8), 0, jitter(rng, 0.06)), {
      material: style.materials.canopy,
      rotation: [jitter(rng, 15), rng.float(0, 360), jitter(rng, 15)],
      collide: false,
      lod: i === 0 ? 2 : 1,
    });
  }
  return b.build({ id: `birch/${variant}`, prefab: "birch", category: "vegetation", sinkDepth: 1.0, footprintRadius: 4.5, tags: ["tree"] });
}

export function giantMushroom(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const mult = rng.range(style.mushroom.scaleMultiplier);
  const stemH = rng.float(6, 9) * mult * 0.6;
  const stemD = rng.float(1.6, 2.4) * mult * 0.5;
  const capD = stemD * rng.float(3.2, 4.4);
  const capH = capD * rng.float(0.28, 0.4);
  const capColor = jitterHex(rng.pick(style.mushroom.capColors), jitter(rng, 8), jitter(rng, 0.05), jitter(rng, 0.05));
  const stemColor = mixHex("#e8e0d2", capColor, 0.18);
  const lean = jitter(rng, 0.5);
  // stem (2 segments, slight taper & lean)
  b.cylinder([0, stemH * 0.25, 0], stemD * 1.1, stemH * 0.5 + 0.2, stemColor, { material: style.materials.mushroom, rotation: [0, 0, lean * 5], collide: true, lod: 2 });
  b.cylinder([lean * stemH * 0.08, stemH * 0.75, 0], stemD * 0.95, stemH * 0.5 + 0.2, stemColor, { material: style.materials.mushroom, rotation: [0, 0, lean * 8], collide: true, lod: 2 });
  const cx = lean * stemH * 0.12;
  // gills
  b.cylinder([cx, stemH + capH * 0.08, 0], capD * 0.92, capH * 0.16, jitterHex(capColor, 0, -0.2, -0.22), { material: style.materials.mushroom, collide: false, lod: 1 });
  // stepped dome cap (3 cylinders)
  b.cylinder([cx, stemH + capH * 0.3, 0], capD, capH * 0.35, capColor, { material: style.materials.mushroom, collide: true, lod: 2 });
  b.cylinder([cx, stemH + capH * 0.6, 0], capD * 0.78, capH * 0.3, lightenHex(capColor, 0.04), { material: style.materials.mushroom, collide: false, lod: 1 });
  b.cylinder([cx, stemH + capH * 0.85, 0], capD * 0.48, capH * 0.28, lightenHex(capColor, 0.08), { material: style.materials.mushroom, collide: false, lod: 2 });
  if (style.mushroom.spots) {
    const spots = rng.int(3, 7);
    const spotColor = mixHex("#f2ead8", capColor, 0.15);
    for (let i = 0; i < spots; i++) {
      const a = rng.float(0, Math.PI * 2);
      const r = capD * rng.float(0.15, 0.42);
      const ring = r < capD * 0.3 ? 0.85 : 0.5;
      b.cylinder([cx + Math.cos(a) * r, stemH + capH * ring + capH * 0.05, Math.sin(a) * r], rng.float(0.8, 1.6) * mult * 0.45, capH * 0.08, spotColor, { material: style.materials.mushroom, collide: false, lod: 0 });
    }
  }
  if (style.mushroom.glow > 0) {
    b.box([cx, stemH - 0.2, 0], [0.6, 0.6, 0.6], style.palette.glow, {
      material: "Neon",
      transparency: 0.4,
      collide: false,
      lod: 1,
      light: { type: "point", color: style.palette.glow, brightness: style.mushroom.glow * 2.2, range: capD * 1.6 },
    });
  }
  return b.build({ id: `giant_mushroom/${variant}`, prefab: "giant_mushroom", category: "vegetation", sinkDepth: 0.8, footprintRadius: capD / 2, tags: ["mushroom", "giant", "glow"] });
}

export function smallMushroom(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const count = rng.int(1, 3);
  const capColor = jitterHex(rng.pick(style.mushroom.capColors), jitter(rng, 10), 0, jitter(rng, 0.08));
  for (let i = 0; i < count; i++) {
    const h = rng.float(1.2, 2.6);
    const d = h * rng.float(0.3, 0.45);
    const x = i === 0 ? 0 : jitter(rng, 1.4);
    const z = i === 0 ? 0 : jitter(rng, 1.4);
    b.cylinder([x, h / 2, z], d, h, "#e6ddcc", { material: style.materials.mushroom, collide: false, lod: i === 0 ? 2 : 0 });
    b.cylinder([x, h + h * 0.18, z], d * 2.6, h * 0.36, capColor, { material: style.materials.mushroom, collide: false, lod: i === 0 ? 2 : 0 });
    b.cylinder([x, h + h * 0.42, z], d * 1.6, h * 0.22, lightenHex(capColor, 0.06), { material: style.materials.mushroom, collide: false, lod: 0 });
  }
  if (style.mushroom.glow > 0.3 && rng.chance(0.4)) {
    b.add({ shape: "box", position: [0, 1, 0], size: [0.3, 0.3, 0.3], rotation: [0, 0, 0], color: style.palette.glow, material: "Neon", transparency: 0.5, collide: false, lod: 0, light: { type: "point", color: style.palette.glow, brightness: 0.6, range: 8 } });
  }
  return b.build({ id: `small_mushroom/${variant}`, prefab: "small_mushroom", category: "vegetation", sinkDepth: 0.2, footprintRadius: 1.2, tags: ["mushroom", "small"] });
}

export function bush(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const color = foliageColor(ctx);
  const chunks = rng.int(2, 4);
  const r = rng.float(2.2, 4.2);
  for (let i = 0; i < chunks; i++) {
    const s = r * rng.float(0.8, 1.3);
    b.box([i === 0 ? 0 : jitter(rng, r * 0.6), s * 0.45, i === 0 ? 0 : jitter(rng, r * 0.6)], [s, s * 0.85, s], jitterHex(color, jitter(rng, 6), 0, jitter(rng, 0.06)), {
      material: style.materials.canopy,
      rotation: [jitter(rng, 15), rng.float(0, 360), jitter(rng, 15)],
      collide: false,
      castShadow: i === 0,
      lod: i === 0 ? 2 : 0,
    });
  }
  return b.build({ id: `bush/${variant}`, prefab: "bush", category: "vegetation", sinkDepth: 0.6, footprintRadius: r * 0.8, tags: ["bush"] });
}

export function fern(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const color = jitterHex(style.palette.foliageAlt, jitter(rng, 10), 0.05, jitter(rng, 0.05));
  const leaves = rng.int(4, 7);
  const len = rng.float(3, 5);
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * 360 + jitter(rng, 20);
    const rad = (a * Math.PI) / 180;
    b.wedge([Math.sin(rad) * len * 0.5, len * 0.28, Math.cos(rad) * len * 0.5], [1.2, len * 0.6, len], color, { material: style.materials.canopy, rotation: [rng.float(-8, 8), a, 0], collide: false, castShadow: false, lod: i < 3 ? 1 : 0 });
  }
  return b.build({ id: `fern/${variant}`, prefab: "fern", category: "vegetation", sinkDepth: 0.4, footprintRadius: 1.5, tags: ["undergrowth"] });
}

export function grassTuft(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const color = jitterHex(style.palette.foliageAlt, jitter(rng, 12), 0.08, rng.float(0.02, 0.12));
  const blades = rng.int(3, 5);
  for (let i = 0; i < blades; i++) {
    const h = rng.float(1.6, 3.2);
    b.box([jitter(rng, 0.9), h / 2, jitter(rng, 0.9)], [0.35, h, 0.9], color, {
      material: style.materials.canopy,
      rotation: [jitter(rng, 14), rng.float(0, 180), jitter(rng, 14)],
      collide: false,
      castShadow: false,
      lod: i === 0 ? 1 : 0,
    });
  }
  return b.build({ id: `grass/${variant}`, prefab: "grass", category: "vegetation", sinkDepth: 0.5, footprintRadius: 1, tags: ["undergrowth", "grass"] });
}

export function flower(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const petal = rng.pick([style.palette.accent, style.palette.glow, "#e8c46a", "#d96c8a", "#8fd0e8"]);
  const count = rng.int(1, 3);
  for (let i = 0; i < count; i++) {
    const h = rng.float(1.2, 2.2);
    const x = i === 0 ? 0 : jitter(rng, 1.2);
    const z = i === 0 ? 0 : jitter(rng, 1.2);
    b.box([x, h / 2, z], [0.2, h, 0.2], style.palette.foliageAlt, { material: style.materials.canopy, collide: false, castShadow: false, lod: 0 });
    b.box([x, h + 0.2, z], [0.9, 0.4, 0.9], jitterHex(petal, jitter(rng, 10), 0, jitter(rng, 0.08)), { rotation: [0, 45, 0], collide: false, castShadow: false, lod: i === 0 ? 1 : 0 });
  }
  return b.build({ id: `flower/${variant}`, prefab: "flower", category: "vegetation", sinkDepth: 0.3, footprintRadius: 0.8, tags: ["undergrowth", "flower"] });
}

export function fallenLog(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const len = rng.float(7, 13);
  const d = rng.float(1.8, 2.8);
  const color = jitterHex(style.palette.wood, jitter(rng, 5), -0.08, -0.08);
  b.cylinder([0, d / 2 - 0.3, 0], d, len, color, { material: style.materials.trunk, rotation: [0, 0, 90], collide: true, lod: 2 });
  if (rng.chance(0.6)) {
    b.box([len * rng.float(-0.3, 0.3), d * 0.7, 0], [1, 2.4, 1], color, { material: style.materials.trunk, rotation: [rng.float(20, 50), 0, jitter(rng, 20)], collide: false, lod: 0 });
  }
  if (style.rock.mossChance > 0 && rng.chance(style.rock.mossChance)) {
    b.box([jitter(rng, len * 0.25), d * 0.85, 0], [len * 0.35, 0.5, d * 0.9], style.palette.foliageAlt, { material: "Grass", collide: false, lod: 0 });
  }
  return b.build({ id: `log/${variant}`, prefab: "log", category: "vegetation", sinkDepth: 0.5, footprintRadius: len / 2, tags: ["log", "forest"] });
}

export function cactus(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const h = rng.float(5, 9);
  const color = jitterHex(style.palette.foliage, jitter(rng, 8), 0, jitter(rng, 0.05));
  b.cylinder([0, h / 2, 0], 1.8, h, color, { material: "SmoothPlastic", collide: true, lod: 2 });
  const arms = rng.int(1, 2);
  for (let i = 0; i < arms; i++) {
    const side = i === 0 ? 1 : -1;
    const y = h * rng.float(0.4, 0.7);
    b.cylinder([side * 1.6, y, 0], 1.2, 2.2, color, { rotation: [0, 0, 90], collide: false, lod: 1 });
    b.cylinder([side * 2.4, y + 1.6, 0], 1.2, 3.2, color, { collide: false, lod: 1 });
  }
  return b.build({ id: `cactus/${variant}`, prefab: "cactus", category: "vegetation", sinkDepth: 0.5, footprintRadius: 2, tags: ["desert"] });
}

export function palmTree(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const h = rng.float(16, 26);
  const lean = jitter(rng, 0.8);
  trunk(b, ctx, h, 2.2, 3, lean);
  const color = foliageColor(ctx);
  const fronds = rng.int(5, 8);
  const top: [number, number, number] = [lean * h * 0.15, h, 0];
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * 360 + jitter(rng, 15);
    const rad = (a * Math.PI) / 180;
    const len = rng.float(7, 10);
    b.wedge([top[0] + Math.sin(rad) * len * 0.45, top[1] + 0.5, top[2] + Math.cos(rad) * len * 0.45], [2.2, 1.2, len], color, { material: style.materials.canopy, rotation: [rng.float(10, 30), a, 0], collide: false, lod: i % 2 === 0 ? 2 : 0 });
  }
  return b.build({ id: `palm/${variant}`, prefab: "palm", category: "vegetation", sinkDepth: 1, footprintRadius: 5, tags: ["tropical"] });
}
