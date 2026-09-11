import { jitterHex, lightenHex, mixHex, type PrefabVariant } from "@worldforge/core";
import { PartListBuilder, jitter, type PrefabContext } from "./builder";
import { watchtower } from "./architecture";

/**
 * Landmark prefabs — large, readable silhouettes that anchor the composition.
 */

export function giantTree(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const mult = style.scaleRules.landmarkMultiplier;
  const height = rng.float(28, 36) * mult * 0.6;
  const trunkH = height * 0.5;
  const trunkD = rng.float(6, 8) * mult * 0.45;
  const wood = jitterHex(style.palette.wood, jitter(rng, 5), 0, jitter(rng, 0.05));
  // trunk in 4 tapered segments
  const segs = 4;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const d = trunkD * (1 - 0.45 * (t0 + t1) * 0.5);
    b.cylinder([jitter(rng, 0.8), (t0 + 0.5 / segs) * trunkH, jitter(rng, 0.8)], d, trunkH / segs + 0.4, jitterHex(wood, 0, 0, jitter(rng, 0.03)), { material: style.materials.trunk, rotation: [jitter(rng, 2), 0, jitter(rng, 2)], collide: true, lod: 2 });
  }
  // roots
  const roots = rng.int(5, 8);
  for (let i = 0; i < roots; i++) {
    const a = (i / roots) * Math.PI * 2 + jitter(rng, 0.3);
    const len = rng.float(10, 16) * mult * 0.4;
    b.box([Math.cos(a) * (trunkD * 0.35 + len * 0.35), len * 0.12, Math.sin(a) * (trunkD * 0.35 + len * 0.35)], [len, len * 0.28, trunkD * 0.35], wood, {
      material: style.materials.trunk,
      rotation: [0, (-a * 180) / Math.PI, rng.float(10, 22)],
      collide: true,
      lod: i % 2 === 0 ? 2 : 1,
    });
  }
  // big branches
  const branches = rng.int(4, 6);
  const canopyBase = trunkH * 0.85;
  const color = jitterHex(style.palette.foliage, jitter(rng, 8), 0, jitter(rng, 0.04));
  for (let i = 0; i < branches; i++) {
    const a = (i / branches) * Math.PI * 2 + jitter(rng, 0.4);
    const len = rng.float(16, 26) * mult * 0.45;
    const y = canopyBase + rng.float(-4, 10);
    const bx = Math.cos(a) * len * 0.45;
    const bz = Math.sin(a) * len * 0.45;
    b.box([bx, y + len * 0.15, bz], [len, trunkD * 0.22, trunkD * 0.22], wood, { material: style.materials.trunk, rotation: [0, (-a * 180) / Math.PI, rng.float(18, 32)], collide: false, lod: 1 });
    const s = rng.float(14, 22) * mult * 0.45;
    b.box([bx * 1.6, y + len * 0.35 + s * 0.2, bz * 1.6], [s, s * 0.75, s], jitterHex(color, jitter(rng, 8), 0, jitter(rng, 0.06)), {
      material: style.materials.canopy,
      rotation: [jitter(rng, 15), rng.float(0, 360), jitter(rng, 15)],
      collide: false,
      lod: 2,
    });
  }
  // crown
  const crownR = rng.float(20, 26) * mult * 0.45;
  b.box([0, canopyBase + crownR * 0.6, 0], [crownR * 2, crownR * 1.3, crownR * 2], color, { material: style.materials.canopy, rotation: [jitter(rng, 6), rng.float(0, 360), jitter(rng, 6)], collide: false, lod: 2 });
  b.box([jitter(rng, 4), canopyBase + crownR * 1.15, jitter(rng, 4)], [crownR * 1.3, crownR * 0.9, crownR * 1.3], lightenHex(color, 0.05), { material: style.materials.canopy, rotation: [jitter(rng, 10), rng.float(0, 360), jitter(rng, 10)], collide: false, lod: 1 });
  // hanging glow lanterns / spores
  if (style.mushroom.glow > 0.2) {
    const lights = rng.int(4, 7);
    for (let i = 0; i < lights; i++) {
      const a = rng.float(0, Math.PI * 2);
      const r = crownR * rng.float(0.5, 1.1);
      b.sphere([Math.cos(a) * r, canopyBase + rng.float(-2, crownR * 0.5), Math.sin(a) * r], 1.4, style.palette.glow, {
        material: "Neon",
        transparency: 0.2,
        collide: false,
        lod: 1,
        light: { type: "point", color: style.palette.glow, brightness: 1.4, range: 28 },
      });
    }
  }
  return b.build({ id: `giant_tree/${variant}`, prefab: "giant_tree", category: "landmark", sinkDepth: 2.5, footprintRadius: crownR, tags: ["landmark", "tree", "focal"] });
}

export function ancientRuins(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const stone = jitterHex(style.palette.stone, jitter(rng, 5), -0.05, jitter(rng, 0.05));
  const r = rng.float(18, 26);
  // platform
  b.cylinder([0, 0.8, 0], r * 2 + 6, 1.6, jitterHex(stone, 0, 0, -0.06), { material: style.materials.stoneWall, collide: true, lod: 2 });
  b.cylinder([0, 2.2, 0], r * 2 - 2, 1.2, stone, { material: style.materials.stoneWall, collide: true, lod: 2 });
  // columns
  const cols = rng.int(8, 12);
  for (let i = 0; i < cols; i++) {
    const a = (i / cols) * Math.PI * 2;
    const broken = rng.chance(0.4);
    const h = broken ? rng.float(4, 10) : rng.float(14, 18);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    b.cylinder([x, 2.8 + h / 2, z], 2.6, h, jitterHex(stone, 0, 0, jitter(rng, 0.04)), { material: style.materials.stoneWall, rotation: [jitter(rng, broken ? 6 : 1), 0, jitter(rng, broken ? 6 : 1)], collide: true, lod: 2 });
    b.box([x, 3.4, z], [3.4, 1.2, 3.4], jitterHex(stone, 0, 0, -0.04), { material: style.materials.stoneWall, collide: false, lod: 1 });
    if (!broken) b.box([x, 2.8 + h + 0.6, z], [3.4, 1.2, 3.4], jitterHex(stone, 0, 0, 0.03), { material: style.materials.stoneWall, collide: false, lod: 1 });
    // lintels between intact neighbors
    if (!broken && rng.chance(0.55)) {
      const a2 = ((i + 1) / cols) * Math.PI * 2;
      const mx = (x + Math.cos(a2) * r) / 2;
      const mz = (z + Math.sin(a2) * r) / 2;
      const len = Math.hypot(Math.cos(a2) * r - x, Math.sin(a2) * r - z);
      const ang = Math.atan2(-(Math.sin(a2) * r - z), Math.cos(a2) * r - x);
      b.box([mx, 2.8 + 17.2, mz], [len, 1.8, 2.6], stone, { material: style.materials.stoneWall, rotation: [0, (ang * 180) / Math.PI, 0], collide: false, lod: 1 });
    }
  }
  // altar
  b.box([0, 3.6, 0], [7, 2.4, 4], jitterHex(stone, 0, 0, 0.04), { material: style.materials.stoneWall, collide: true, lod: 2 });
  if (style.mushroom.glow > 0) {
    b.box([0, 5.4, 0], [2, 2, 2], style.palette.glow, { material: "Neon", transparency: 0.15, rotation: [45, 45, 0], collide: false, lod: 1, light: { type: "point", color: style.palette.glow, brightness: 2.5, range: 40 } });
  }
  // rubble
  for (let i = 0; i < 10; i++) {
    const a = rng.float(0, Math.PI * 2);
    const rr = rng.float(r * 0.3, r * 1.3);
    b.box([Math.cos(a) * rr, 3.2, Math.sin(a) * rr], [rng.float(1.5, 3.5), rng.float(1, 2.2), rng.float(1.5, 3.5)], stone, { material: style.materials.rock, rotation: [jitter(rng, 20), rng.float(0, 360), jitter(rng, 20)], collide: false, lod: 0 });
  }
  // moss
  for (let i = 0; i < 4; i++) {
    const a = rng.float(0, Math.PI * 2);
    b.box([Math.cos(a) * r * 0.6, 2.95, Math.sin(a) * r * 0.6], [rng.float(4, 8), 0.3, rng.float(3, 6)], style.palette.foliageAlt, { material: "Grass", rotation: [0, rng.float(0, 360), 0], collide: false, castShadow: false, lod: 0 });
  }
  return b.build({ id: `ancient_ruins/${variant}`, prefab: "ancient_ruins", category: "landmark", sinkDepth: 1.0, footprintRadius: r + 4, tags: ["landmark", "ruins"] });
}

export function ruinedTower(ctx: PrefabContext, variant: number): PrefabVariant {
  const v = watchtower({ rng: ctx.rng, style: { ...ctx.style, architecture: { ...ctx.style.architecture, weathering: 1 } } }, variant);
  const b = new PartListBuilder();
  b.parts.push(...v.parts);
  b.scale(ctx.style.scaleRules.landmarkMultiplier * 0.45);
  return b.build({ id: `tower/${variant}`, prefab: "tower", category: "landmark", sinkDepth: 1.5, footprintRadius: v.footprintRadius * ctx.style.scaleRules.landmarkMultiplier * 0.45, tags: ["landmark", "tower"] });
}

export function portal(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const stone = jitterHex(style.palette.stone, jitter(rng, 5), -0.05, 0);
  const r = rng.float(9, 12);
  const segs = 12;
  for (let i = 0; i < segs; i++) {
    if (i === 9) continue; // gap at the bottom-left for a broken look
    const a = (i / segs) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const y = r + 2 + Math.sin(a) * r;
    b.box([x, y, 0], [(Math.PI * 2 * r) / segs + 0.6, 2.8, 2.6], jitterHex(stone, 0, 0, jitter(rng, 0.04)), { material: style.materials.stoneWall, rotation: [0, 0, (a * 180) / Math.PI + 90], collide: true, lod: 2 });
  }
  b.box([-r * 0.9, 1.2, 0], [4, 2.4, 4], stone, { material: style.materials.stoneWall, collide: true, lod: 1 });
  b.box([r * 0.9, 1.2, 0], [4, 2.4, 4], stone, { material: style.materials.stoneWall, collide: true, lod: 1 });
  b.cylinder([0, r + 2, 0], r * 1.7, 0.6, style.palette.glow, { material: "Neon", transparency: 0.35, rotation: [90, 0, 0], collide: false, lod: 2, light: { type: "point", color: style.palette.glow, brightness: 3, range: 50 } });
  b.box([0, 0.6, 0], [r * 2.4, 1.2, 8], jitterHex(stone, 0, 0, -0.06), { material: style.materials.stoneWall, collide: true, lod: 2 });
  return b.build({ id: `portal/${variant}`, prefab: "portal", category: "landmark", sinkDepth: 0.8, footprintRadius: r * 1.2, tags: ["landmark", "portal", "glow"] });
}

export function statue(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const stone = jitterHex(style.palette.stone, jitter(rng, 5), -0.08, jitter(rng, 0.05));
  const s = style.scaleRules.landmarkMultiplier * 0.5;
  b.box([0, 1.5 * s, 0], [10 * s, 3 * s, 10 * s], jitterHex(stone, 0, 0, -0.05), { material: style.materials.stoneWall, collide: true, lod: 2 });
  b.box([0, 4 * s, 0], [6 * s, 2 * s, 6 * s], stone, { material: style.materials.stoneWall, collide: true, lod: 2 });
  // abstract robed figure
  b.box([0, 9 * s, 0], [4.5 * s, 8 * s, 3.5 * s], stone, { material: style.materials.stoneWall, collide: true, lod: 2 });
  b.box([0, 15 * s, 0], [3.5 * s, 4 * s, 3 * s], stone, { material: style.materials.stoneWall, collide: false, lod: 2 });
  b.sphere([0, 18.5 * s, 0], 2.6 * s, stone, { material: style.materials.stoneWall, collide: false, lod: 1 });
  b.box([2.6 * s, 14 * s, 0], [1.4 * s, 7 * s, 1.4 * s], stone, { material: style.materials.stoneWall, rotation: [0, 0, -25], collide: false, lod: 1 });
  b.box([-2.4 * s, 13 * s, 0], [1.4 * s, 6 * s, 1.4 * s], stone, { material: style.materials.stoneWall, rotation: [0, 0, 15], collide: false, lod: 1 });
  if (rng.chance(style.rock.mossChance)) {
    b.box([1 * s, 6 * s, 1.5 * s], [3 * s, 3 * s, 0.4], style.palette.foliageAlt, { material: "Grass", collide: false, castShadow: false, lod: 0 });
  }
  return b.build({ id: `statue/${variant}`, prefab: "statue", category: "landmark", sinkDepth: 0.8, footprintRadius: 6 * s, tags: ["landmark", "statue"] });
}

export function windmill(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const stone = jitterHex(style.palette.stone, 0, 0, jitter(rng, 0.05));
  const wood = jitterHex(style.palette.wood, 0, 0, jitter(rng, 0.05));
  const h = rng.float(26, 32);
  const d = 12;
  b.cylinder([0, h * 0.5, 0], d, h, stone, { material: style.materials.stoneWall, collide: true, lod: 2 });
  b.cylinder([0, h * 0.5, 0], d + 1, 1, jitterHex(stone, 0, 0, -0.05), { material: style.materials.stoneWall, collide: false, lod: 0 });
  b.pyramidRoof([0, h + 3, 0], d + 3, d + 3, 6, jitterHex(style.palette.roof, 0, 0, 0), { material: style.materials.roof, collide: true, lod: 2 });
  // hub + blades on the front (-Z)
  const hubY = h * 0.78;
  b.cylinder([0, hubY, -d / 2 - 1], 2.2, 3, wood, { material: style.materials.trunk, rotation: [90, 0, 0], collide: false, lod: 1 });
  const tilt = rng.float(0, 90);
  for (let i = 0; i < 4; i++) {
    const ang = tilt + i * 90;
    const rad = (ang * Math.PI) / 180;
    const len = 16;
    b.box([Math.cos(rad) * len * 0.5, hubY + Math.sin(rad) * len * 0.5, -d / 2 - 2.2], [len, 1, 0.6], wood, { material: style.materials.trunk, rotation: [0, 0, ang], collide: false, lod: 2 });
    b.box([Math.cos(rad) * len * 0.62, hubY + Math.sin(rad) * len * 0.62, -d / 2 - 2.6], [len * 0.6, 4.5, 0.3], mixHex("#e6dccb", style.palette.wall, 0.3), { material: "Fabric", rotation: [0, 0, ang], collide: false, lod: 1 });
  }
  b.box([0, 3.5, -d / 2 - 0.2], [3.6, 6.5, 0.6], "#1a1612", { collide: false, lod: 1 });
  return b.build({ id: `windmill/${variant}`, prefab: "windmill", category: "landmark", sinkDepth: 1, footprintRadius: 10, tags: ["landmark", "windmill", "farm"] });
}

export function temple(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const stone = jitterHex(style.palette.stone, jitter(rng, 4), -0.04, jitter(rng, 0.05));
  const W = 34;
  const D = 24;
  for (let i = 0; i < 3; i++) {
    b.box([0, 1 + i * 2, 0], [W + 8 - i * 3, 2, D + 8 - i * 3], jitterHex(stone, 0, 0, -0.02 * i), { material: style.materials.stoneWall, collide: true, lod: 2 });
  }
  const colsX = 6;
  const colsZ = 4;
  for (let i = 0; i < colsX; i++) {
    for (let j = 0; j < colsZ; j++) {
      if (i > 0 && i < colsX - 1 && j > 0 && j < colsZ - 1) continue;
      const x = -W / 2 + (i / (colsX - 1)) * W;
      const z = -D / 2 + (j / (colsZ - 1)) * D;
      const broken = rng.chance(style.architecture.weathering * 0.35);
      const h = broken ? rng.float(5, 9) : 14;
      b.cylinder([x, 6 + h / 2, z], 2.4, h, stone, { material: style.materials.stoneWall, collide: true, lod: 2 });
    }
  }
  if (style.architecture.weathering < 0.75) {
    b.box([0, 21, 0], [W + 4, 2, D + 4], stone, { material: style.materials.stoneWall, collide: true, lod: 2 });
    b.gableRoof([0, 22 + 3, 0], W + 6, D + 6, 6, jitterHex(stone, 0, 0, 0.04), { material: style.materials.stoneWall, collide: true, lod: 2 });
  }
  b.box([0, 7.5, 0], [8, 3, 5], jitterHex(stone, 0, 0, 0.05), { material: style.materials.stoneWall, collide: true, lod: 1 });
  return b.build({ id: `temple/${variant}`, prefab: "temple", category: "landmark", sinkDepth: 1, footprintRadius: W / 2 + 5, tags: ["landmark", "temple"] });
}
