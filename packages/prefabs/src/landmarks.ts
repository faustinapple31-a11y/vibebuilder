import { jitterHex, lightenHex, mixHex, type PrefabVariant, type Vec3 } from "@worldforge/core";
import { PartListBuilder, jitter, v3, type PrefabContext } from "./builder";
import { watchtower } from "./architecture";
import { branch, trunkChain } from "./vegetation";

/**
 * Landmark prefabs — large, readable silhouettes that anchor the composition.
 */

export function giantTree(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const mult = style.scaleRules.landmarkMultiplier;
  const height = rng.float(30, 38) * mult * 0.6;
  const trunkH = height * 0.58;
  const trunkD = rng.float(6, 8) * mult * 0.45;
  const wood = jitterHex(style.palette.wood, jitter(rng, 5), 0, jitter(rng, 0.05));
  // trunk: 4 connected, tapered, slightly twisting segments
  const t = trunkChain(b, ctx, trunkH, trunkD, 4, jitter(rng, 0.05), 0.05, { color: wood });
  // buttress roots: thick beams from inside the trunk down into the ground, with a second knuckle
  const rootCount = rng.int(5, 7);
  for (let i = 0; i < rootCount; i++) {
    const a = (i / rootCount) * Math.PI * 2 + jitter(rng, 0.3);
    const len = rng.float(10, 16) * mult * 0.4;
    const r = trunkD / 2;
    const from: Vec3 = [Math.sin(a) * r * 0.35, r * 1.4, Math.cos(a) * r * 0.35];
    const knee: Vec3 = [Math.sin(a) * (r * 0.75 + len * 0.45), r * 0.45, Math.cos(a) * (r * 0.75 + len * 0.45)];
    const to: Vec3 = [Math.sin(a) * (r * 0.75 + len), -0.6, Math.cos(a) * (r * 0.75 + len)];
    b.beam(from, knee, r * 0.8, r * 0.55, wood, { material: style.materials.trunk, collide: true, lod: i % 2 === 0 ? 2 : 1, overlap: r * 0.2 });
    b.beam(knee, to, r * 0.5, r * 0.45, jitterHex(wood, 0, 0, -0.04), { material: style.materials.trunk, collide: true, lod: i % 2 === 0 ? 2 : 1, overlap: r * 0.15 });
  }
  const color = jitterHex(style.palette.foliage, jitter(rng, 8), 0, jitter(rng, 0.04));
  const crownR = rng.float(18, 24) * mult * 0.45;
  const smooth = style.geometry === "rounded" || style.geometry === "smooth_low_poly";
  const lump = (p: Vec3, s: number, sy: number, col: string, lod: 0 | 1 | 2) => {
    if (smooth) b.sphere(p, s, col, { material: style.materials.canopy, collide: false, lod });
    else b.box(p, [s, sy, s], col, { material: style.materials.canopy, rotation: [jitter(rng, 14), rng.float(0, 360), jitter(rng, 14)], collide: false, lod });
  };
  // big branches from the upper third of the trunk, each ending in a foliage cluster
  const branches = rng.int(5, 7);
  for (let i = 0; i < branches; i++) {
    const yaw = (i / branches) * Math.PI * 2 + jitter(rng, 0.35);
    const tt = 0.62 + (i % 3) * 0.12 + jitter(rng, 0.04);
    const segIdx = Math.min(t.points.length - 2, Math.floor(tt * (t.points.length - 1)));
    const local = tt * (t.points.length - 1) - segIdx;
    const from = v3.lerp(t.points[segIdx]!, t.points[segIdx + 1]!, local);
    const len = crownR * rng.float(0.85, 1.15);
    const tip = branch(b, ctx, from, yaw, rng.float(0.25, 0.5), len, trunkD * 0.26, wood, i < 3 ? 2 : 1, rng.float(0.15, 0.35));
    const s = crownR * rng.float(0.65, 0.85);
    lump([tip[0], tip[1] + s * 0.2, tip[2]], s, s * 0.8, jitterHex(color, jitter(rng, 8), 0, jitter(rng, 0.06)), i < 3 ? 2 : 1);
    // hanging lantern under some branch tips
    if (style.mushroom.glow > 0.2 && rng.chance(0.6)) {
      const hang = rng.float(4, 8);
      b.box([tip[0], tip[1] - hang / 2, tip[2]], [0.25, hang, 0.25], "#3a3229", { material: style.materials.metal, collide: false, castShadow: false, lod: 0 });
      b.sphere([tip[0], tip[1] - hang - 0.9, tip[2]], 2.0, style.palette.glow, { material: "Neon", transparency: 0.15, collide: false, lod: 1, light: { type: "point", color: style.palette.glow, brightness: 1.6, range: 34 } });
    }
  }
  // crown: a core lump on the trunk top plus a ring of lumps and a lighter cap
  const crown = v3.add(t.top, v3.scale(t.dir, crownR * 0.35));
  lump(crown, crownR * 1.2, crownR * 0.9, color, 2);
  const ring = rng.int(4, 6);
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + jitter(rng, 0.4);
    const rr = crownR * rng.float(0.55, 0.8);
    const s = crownR * rng.float(0.6, 0.85);
    lump([crown[0] + Math.sin(a) * rr, crown[1] + jitter(rng, crownR * 0.25), crown[2] + Math.cos(a) * rr], s, s * 0.85, jitterHex(color, jitter(rng, 8), 0, jitter(rng, 0.07)), i < 3 ? 2 : 1);
  }
  lump([crown[0] + jitter(rng, 3), crown[1] + crownR * 0.6, crown[2] + jitter(rng, 3)], crownR * 0.85, crownR * 0.6, lightenHex(color, 0.08), 1);
  // glow spores drifting under the crown + fireflies around the trunk
  if (style.mushroom.glow > 0.2) {
    b.effect([crown[0], crown[1] - crownR * 0.6, crown[2]], [crownR * 2.2, crownR * 0.8, crownR * 2.2], { kind: "spores", color: style.palette.glow, rate: 8 }, { lod: 1 });
    b.effect([0, trunkH * 0.3, 0], [trunkD * 3.5, trunkH * 0.5, trunkD * 3.5], { kind: "fireflies", color: mixHex(style.palette.glow, "#ffe9a0", 0.5), rate: 5 }, { lod: 1 });
  }
  // moss on the trunk base
  if (style.rock.mossChance > 0.3) {
    b.cylinder([0, trunkD * 0.45, 0], trunkD * 1.1, trunkD * 0.6, style.palette.foliageAlt, { material: "Grass", collide: false, castShadow: false, lod: 0 });
  }
  return b.build({ id: `giant_tree/${variant}`, prefab: "giant_tree", category: "landmark", sinkDepth: 2.0, footprintRadius: crownR * 1.3, baseRadius: trunkD * 0.5 + rng.float(10, 16) * mult * 0.4, tags: ["landmark", "tree", "focal"] });
}

export function ancientRuins(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const stone = jitterHex(style.palette.stone, jitter(rng, 5), -0.05, jitter(rng, 0.05));
  const r = rng.float(18, 26);
  // platform (two tiers, the lower one sunk into the ground)
  b.cylinder([0, 0.2, 0], r * 2 + 6, 2.8, jitterHex(stone, 0, 0, -0.06), { material: style.materials.stoneWall, collide: true, lod: 2 });
  b.cylinder([0, 2.2, 0], r * 2 - 2, 1.2, stone, { material: style.materials.stoneWall, collide: true, lod: 2 });
  // stairs on the front (-Z): three wedge steps descending outward
  for (let i = 0; i < 3; i++) {
    const z = -(r + 3) - i * 1.8;
    b.box([0, 1.4 - i * 0.55, z], [10, 1.2, 1.9], jitterHex(stone, 0, 0, -0.03 * i), { material: style.materials.stoneWall, collide: true, lod: 1 });
  }
  // columns
  const cols = rng.int(8, 12);
  const brokenFlags = Array.from({ length: cols }, () => rng.chance(0.4));
  for (let i = 0; i < cols; i++) {
    const a = (i / cols) * Math.PI * 2;
    const broken = brokenFlags[i]!;
    const h = broken ? rng.float(4, 10) : rng.float(14, 18);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    b.cylinder([x, 2.8 + h / 2, z], 2.6, h, jitterHex(stone, 0, 0, jitter(rng, 0.04)), { material: style.materials.stoneWall, rotation: [jitter(rng, broken ? 6 : 1), 0, jitter(rng, broken ? 6 : 1)], collide: true, lod: 2 });
    b.box([x, 3.4, z], [3.4, 1.2, 3.4], jitterHex(stone, 0, 0, -0.04), { material: style.materials.stoneWall, collide: false, lod: 1 });
    if (!broken) b.box([x, 2.8 + h + 0.6, z], [3.4, 1.2, 3.4], jitterHex(stone, 0, 0, 0.03), { material: style.materials.stoneWall, collide: false, lod: 1 });
    else if (rng.chance(0.6)) {
      // the fallen drum lies on the platform next to its stump
      // toward the centre (fromAngles yaw: 0 = +Z, π/2 = +X; the column sits at angle `a` in cos/sin form)
      const dir = v3.fromAngles(Math.atan2(-x, -z) + jitter(rng, 0.7), 0);
      const from = v3.add([x, 4.1, z], v3.scale(dir, 2.4));
      const to = v3.add(from, v3.scale(dir, rng.float(6, 9)));
      b.segment(from, to, 2.6, jitterHex(stone, 0, 0, -0.03), { material: style.materials.stoneWall, collide: true, lod: 1, overlap: 0 });
    }
    // lintels between intact neighbors
    if (!broken && !brokenFlags[(i + 1) % cols] && rng.chance(0.7)) {
      const a2 = ((i + 1) / cols) * Math.PI * 2;
      b.beam([x, 2.8 + 17.2, z], [Math.cos(a2) * r, 2.8 + 17.2, Math.sin(a2) * r], 1.8, 2.6, stone, { material: style.materials.stoneWall, collide: false, lod: 1, overlap: 1.2 });
    }
    // moss at the column foot
    if (rng.chance(style.rock.mossChance * 0.6)) {
      b.cylinder([x, 4.1, z], 3.2, 0.5, style.palette.foliageAlt, { material: "Grass", collide: false, castShadow: false, lod: 0 });
    }
  }
  // altar + floating crystal
  b.box([0, 3.6, 0], [7, 2.4, 4], jitterHex(stone, 0, 0, 0.04), { material: style.materials.stoneWall, collide: true, lod: 2 });
  if (style.mushroom.glow > 0) {
    b.box([0, 7.2, 0], [2.2, 2.2, 2.2], style.palette.glow, { material: "Neon", transparency: 0.15, rotation: [45, 45, 0], collide: false, lod: 1, light: { type: "point", color: style.palette.glow, brightness: 3, range: 48 } });
    b.box([0, 7.2, 0], [1.1, 4.2, 1.1], lightenHex(style.palette.glow, 0.25), { material: "Neon", transparency: 0.3, rotation: [0, 45, 0], collide: false, lod: 1 });
    b.effect([0, 7.5, 0], [6, 5, 6], { kind: "sparkle", color: style.palette.glow, rate: 8 }, { lod: 1 });
    b.effect([0, 3.5, 0], [r * 1.6, 3, r * 1.6], { kind: "mist", color: mixHex(style.palette.glow, "#ffffff", 0.6), rate: 1.2 }, { lod: 1 });
  }
  // rubble
  for (let i = 0; i < 8; i++) {
    const a = rng.float(0, Math.PI * 2);
    const rr = rng.float(r * 0.3, r * 1.3);
    b.box([Math.cos(a) * rr, rr < r - 1 ? 3.2 : rr < r + 3 ? 2.0 : 0.5, Math.sin(a) * rr], [rng.float(1.5, 3.5), rng.float(1, 2.2), rng.float(1.5, 3.5)], stone, { material: style.materials.rock, rotation: [jitter(rng, 20), rng.float(0, 360), jitter(rng, 20)], collide: false, lod: 0 });
  }
  // moss
  for (let i = 0; i < 4; i++) {
    const a = rng.float(0, Math.PI * 2);
    b.box([Math.cos(a) * r * 0.6, 2.95, Math.sin(a) * r * 0.6], [rng.float(4, 8), 0.3, rng.float(3, 6)], style.palette.foliageAlt, { material: "Grass", rotation: [0, rng.float(0, 360), 0], collide: false, castShadow: false, lod: 0 });
  }
  return b.build({ id: `ancient_ruins/${variant}`, prefab: "ancient_ruins", category: "landmark", sinkDepth: 1.0, footprintRadius: r + 4, baseRadius: r + 3, tags: ["landmark", "ruins"] });
}

export function ruinedTower(ctx: PrefabContext, variant: number): PrefabVariant {
  const v = watchtower({ rng: ctx.rng, style: { ...ctx.style, architecture: { ...ctx.style.architecture, weathering: 1 } } }, variant);
  const b = new PartListBuilder();
  b.parts.push(...v.parts);
  const k = ctx.style.scaleRules.landmarkMultiplier * 0.45;
  b.scale(k);
  return b.build({ id: `tower/${variant}`, prefab: "tower", category: "landmark", sinkDepth: 1.5, footprintRadius: v.footprintRadius * k, baseRadius: (v.baseRadius ?? v.footprintRadius) * k, tags: ["landmark", "tower"] });
}

export function portal(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const stone = jitterHex(style.palette.stone, jitter(rng, 5), -0.05, 0);
  const r = rng.float(9, 12);
  const segs = 12;
  const gap = rng.int(8, 10);
  for (let i = 0; i < segs; i++) {
    if (i === gap) continue; // gap for a broken look
    const a = (i / segs) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const y = r + 2 + Math.sin(a) * r;
    b.box([x, y, 0], [(Math.PI * 2 * r) / segs + 0.6, 2.8, 2.6], jitterHex(stone, 0, 0, jitter(rng, 0.04)), { material: style.materials.stoneWall, rotation: [0, 0, (a * 180) / Math.PI + 90], collide: true, lod: 2 });
    // rune on every other block
    if (i % 2 === 0) {
      b.box([x * 1.0, y, -1.4], [1.0, 1.0, 0.2], style.palette.glow, { material: "Neon", transparency: 0.1, rotation: [0, 0, (a * 180) / Math.PI + 45], collide: false, castShadow: false, lod: 0 });
    }
  }
  b.box([-r * 0.9, 1.0, 0], [4, 2.8, 4], stone, { material: style.materials.stoneWall, collide: true, lod: 1 });
  b.box([r * 0.9, 1.0, 0], [4, 2.8, 4], stone, { material: style.materials.stoneWall, collide: true, lod: 1 });
  // the portal disc + swirling sparkle + mist at the foot
  b.cylinder([0, r + 2, 0], r * 1.7, 0.6, style.palette.glow, { material: "Neon", transparency: 0.35, rotation: [90, 0, 0], collide: false, lod: 2, light: { type: "point", color: style.palette.glow, brightness: 3, range: 50 } });
  b.cylinder([0, r + 2, 0], r * 1.1, 0.8, lightenHex(style.palette.glow, 0.3), { material: "Neon", transparency: 0.55, rotation: [90, 0, 0], collide: false, lod: 1 });
  b.effect([0, r + 2, 0], [r * 1.8, r * 1.8, 2], { kind: "sparkle", color: style.palette.glow, rate: 14 }, { lod: 1 });
  b.effect([0, 1.5, 0], [r * 2.6, 2, 10], { kind: "mist", color: mixHex(style.palette.glow, "#ffffff", 0.5), rate: 1.5 }, { lod: 1 });
  b.box([0, 0.2, 0], [r * 2.4, 2.4, 8], jitterHex(stone, 0, 0, -0.06), { material: style.materials.stoneWall, collide: true, lod: 2 });
  // small standing stones flanking the approach
  for (const sx of [-1, 1]) {
    b.box([sx * r * 1.4, 1.6, -6], [1.6, 4.4, 1.2], stone, { material: style.materials.stoneWall, rotation: [jitter(rng, 5), rng.float(0, 30), jitter(rng, 6)], collide: true, lod: 1 });
  }
  return b.build({ id: `portal/${variant}`, prefab: "portal", category: "landmark", sinkDepth: 0.8, footprintRadius: r * 1.2, baseRadius: r * 1.2, tags: ["landmark", "portal", "glow"] });
}

export function statue(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const stone = jitterHex(style.palette.stone, jitter(rng, 5), -0.08, jitter(rng, 0.05));
  const s = style.scaleRules.landmarkMultiplier * 0.5;
  b.box([0, 1.2 * s, 0], [10 * s, 3.6 * s, 10 * s], jitterHex(stone, 0, 0, -0.05), { material: style.materials.stoneWall, collide: true, lod: 2 });
  b.box([0, 4 * s, 0], [6 * s, 2 * s, 6 * s], stone, { material: style.materials.stoneWall, collide: true, lod: 2 });
  // abstract robed figure
  b.box([0, 9 * s, 0], [4.5 * s, 8 * s, 3.5 * s], stone, { material: style.materials.stoneWall, collide: true, lod: 2 });
  b.box([0, 15 * s, 0], [3.5 * s, 4 * s, 3 * s], stone, { material: style.materials.stoneWall, collide: false, lod: 2 });
  b.sphere([0, 18.5 * s, 0], 2.6 * s, stone, { material: style.materials.stoneWall, collide: false, lod: 1 });
  // arms: beams from the shoulders (connected)
  b.beam([1.6 * s, 16.5 * s, 0], [3.4 * s, 10.5 * s, 0.6 * s], 1.4 * s, 1.4 * s, stone, { material: style.materials.stoneWall, collide: false, lod: 1, overlap: 0.4 * s });
  b.beam([-1.6 * s, 16.5 * s, 0], [-2.8 * s, 11 * s, -0.6 * s], 1.4 * s, 1.4 * s, stone, { material: style.materials.stoneWall, collide: false, lod: 1, overlap: 0.4 * s });
  // an offering lantern in the raised hand
  if (style.mushroom.glow > 0.2) {
    b.sphere([3.6 * s, 10 * s, 0.7 * s], 1.4 * s, style.palette.glow, { material: "Neon", transparency: 0.2, collide: false, lod: 1, light: { type: "point", color: style.palette.glow, brightness: 1.8, range: 30 } });
    b.effect([0, 6 * s, 0], [12 * s, 4 * s, 12 * s], { kind: "fireflies", color: style.palette.glow, rate: 3 }, { lod: 1 });
  }
  if (rng.chance(style.rock.mossChance)) {
    b.box([1 * s, 6 * s, 1.5 * s], [3 * s, 3 * s, 0.4], style.palette.foliageAlt, { material: "Grass", collide: false, castShadow: false, lod: 0 });
    b.box([-2 * s, 2.5 * s, 4.9 * s], [4 * s, 2 * s, 0.4], style.palette.foliageAlt, { material: "Grass", collide: false, castShadow: false, lod: 0 });
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
  b.cylinder([0, h * 0.5 - 0.5, 0], d, h + 1, stone, { material: style.materials.stoneWall, collide: true, lod: 2 });
  b.cylinder([0, h * 0.5, 0], d + 1, 1, jitterHex(stone, 0, 0, -0.05), { material: style.materials.stoneWall, collide: false, lod: 0 });
  b.pyramidRoof([0, h + 3, 0], d + 3, d + 3, 6, jitterHex(style.palette.roof, 0, 0, 0), { material: style.materials.roof, collide: true, lod: 2 });
  // hub + blades on the front (-Z)
  const hubY = h * 0.78;
  const hub: Vec3 = [0, hubY, -d / 2 - 1];
  b.cylinder(hub, 2.2, 3, wood, { material: style.materials.trunk, rotation: [90, 0, 0], collide: false, lod: 1 });
  const tilt = rng.float(0, 90);
  for (let i = 0; i < 4; i++) {
    const ang = tilt + i * 90;
    const rad = (ang * Math.PI) / 180;
    const len = 16;
    const tip: Vec3 = [Math.cos(rad) * len, hubY + Math.sin(rad) * len, -d / 2 - 2.2];
    b.beam([hub[0], hub[1], -d / 2 - 2.2], tip, 1, 0.6, wood, { material: style.materials.trunk, collide: false, lod: 2, overlap: 0.3 });
    // sail lattice: 3 cross slats + fabric
    const sail = mixHex("#e6dccb", style.palette.wall, 0.3);
    b.box([Math.cos(rad) * len * 0.62, hubY + Math.sin(rad) * len * 0.62, -d / 2 - 2.6], [len * 0.6, 4.5, 0.3], sail, { material: "Fabric", rotation: [0, 0, ang], collide: false, lod: 1 });
    for (let k = 0; k < 3; k++) {
      const f = 0.38 + k * 0.24;
      const c: Vec3 = [Math.cos(rad) * len * f, hubY + Math.sin(rad) * len * f, -d / 2 - 2.5];
      b.box(c, [0.4, 5, 0.5], wood, { material: style.materials.trunk, rotation: [0, 0, ang], collide: false, lod: 0 });
    }
  }
  b.box([0, 3.5, -d / 2 - 0.2], [3.6, 6.5, 0.6], "#1a1612", { collide: false, lod: 1 });
  // window with warm light
  b.box([0, h * 0.5, -d / 2 - 0.15], [2.4, 2.4, 0.4], mixHex(style.palette.glow, "#ffe2a8", 0.7), { material: "Neon", collide: false, lod: 1, light: { type: "point", color: "#ffd9a0", brightness: 0.9, range: 18 } });
  return b.build({ id: `windmill/${variant}`, prefab: "windmill", category: "landmark", sinkDepth: 1, footprintRadius: 10, baseRadius: d / 2 + 0.5, tags: ["landmark", "windmill", "farm"] });
}

export function temple(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const stone = jitterHex(style.palette.stone, jitter(rng, 4), -0.04, jitter(rng, 0.05));
  const W = 34;
  const D = 24;
  for (let i = 0; i < 3; i++) {
    b.box([0, 1 + i * 2 - (i === 0 ? 0.8 : 0), 0], [W + 8 - i * 3, i === 0 ? 3.6 : 2, D + 8 - i * 3], jitterHex(stone, 0, 0, -0.02 * i), { material: style.materials.stoneWall, collide: true, lod: 2 });
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
      b.box([x, 6.5, z], [3.2, 1, 3.2], jitterHex(stone, 0, 0, -0.04), { material: style.materials.stoneWall, collide: false, lod: 0 });
    }
  }
  if (style.architecture.weathering < 0.75) {
    b.box([0, 21, 0], [W + 4, 2, D + 4], stone, { material: style.materials.stoneWall, collide: true, lod: 2 });
    b.gableRoof([0, 22 + 3, 0], W + 6, D + 6, 6, jitterHex(stone, 0, 0, 0.04), { material: style.materials.stoneWall, collide: true, lod: 2 });
  }
  b.box([0, 7.5, 0], [8, 3, 5], jitterHex(stone, 0, 0, 0.05), { material: style.materials.stoneWall, collide: true, lod: 1 });
  // braziers at the entrance
  for (const sx of [-1, 1]) {
    const glow = mixHex("#ffb866", style.palette.glow, 0.3);
    // standing on the middle tier (top at y = 4)
    const bz = -(D / 2 + 2.2);
    b.cylinder([sx * 6, 6, bz], 2.2, 4, jitterHex(stone, 0, 0, -0.06), { material: style.materials.stoneWall, collide: true, lod: 1 });
    b.box([sx * 6, 8.6, bz], [1.6, 1.6, 1.6], glow, { material: "Neon", transparency: 0.2, rotation: [0, 45, 0], collide: false, lod: 1, light: { type: "point", color: glow, brightness: 2, range: 36 } });
    b.effect([sx * 6, 9.5, bz], [1.2, 1, 1.2], { kind: "embers", rate: 5 }, { lod: 1 });
  }
  return b.build({ id: `temple/${variant}`, prefab: "temple", category: "landmark", sinkDepth: 1, footprintRadius: W / 2 + 5, baseRadius: W / 2 + 4, tags: ["landmark", "temple"] });
}
