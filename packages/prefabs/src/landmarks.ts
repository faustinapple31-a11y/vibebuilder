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
  const colH = rng.float(14, 18); // intact columns share a height so the lintels rest on their capitals
  for (let i = 0; i < cols; i++) {
    const a = (i / cols) * Math.PI * 2;
    const broken = brokenFlags[i]!;
    const h = broken ? rng.float(4, 10) : colH;
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
      const ly = 2.8 + colH + 1.2 + 0.9; // on top of the capitals
      b.beam([x, ly, z], [Math.cos(a2) * r, ly, Math.sin(a2) * r], 1.8, 2.6, stone, { material: style.materials.stoneWall, collide: false, lod: 1, overlap: 1.2 });
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
  const v = watchtower({ ...ctx, style: { ...ctx.style, architecture: { ...ctx.style.architecture, weathering: 1 } } }, variant);
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

/** A real stronghold: curtain walls, corner towers, a gatehouse with its portcullis, a keep flying a banner. */
export function castle(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const stone = jitterHex(style.palette.stone, jitter(rng, 4), -0.02, jitter(rng, 0.05));
  const dark = jitterHex(stone, 0, 0, -0.1);
  const pale = jitterHex(stone, 0, 0, 0.06);
  const material = style.materials.stoneWall;
  const solid = { material, collide: true, lod: 2 as const };
  const wear = style.architecture.weathering * 0.3;
  const H = 26; // half side of the curtain wall
  const T = 4; // wall thickness
  const gap = 9; // gate opening
  const wallH = rng.float(15, 18);
  const towerD = 14;
  const towerH = wallH + rng.float(9, 13);
  const pointed = variant % 2 === 0;

  // one merlon every 4 studs along a wall top; some have fallen on a weathered castle
  const crenels = (x0: number, z0: number, x1: number, z1: number, y: number, depth: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const count = Math.floor(len / 4);
    for (let i = 0; i < count; i++) {
      if (rng.chance(wear)) continue;
      const t = (i + 0.5) / count;
      const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      b.box([x0 + (x1 - x0) * t, y + 1, z0 + (z1 - z0) * t], alongX ? [2.2, 2.4, depth] : [depth, 2.4, 2.2], pale, { material, collide: false, lod: 1 });
    }
  };

  // courtyard and curtain walls (the front one leaves the gate open)
  b.box([0, 0.2, 0], [H * 2, 1.2, H * 2], dark, { material: style.materials.path, collide: true, lod: 2 });
  b.box([0, wallH / 2, H], [H * 2, wallH, T], stone, solid);
  for (const sx of [-1, 1]) b.box([sx * H, wallH / 2, 0], [T, wallH, H * 2], stone, solid);
  const side = H - gap / 2;
  for (const sx of [-1, 1]) {
    b.box([sx * (gap / 2 + side / 2), wallH / 2, -H], [side, wallH, T], stone, solid);
    crenels(sx * (gap / 2 + 4), -H, sx * (H - 6), -H, wallH, T);
    crenels(sx * H, -H + 6, sx * H, H - 6, wallH, T);
  }
  crenels(-H + 6, H, H - 6, H, wallH, T);

  // a flat grey wall reads as a placeholder: battered foot, string course, arrow slits, patches of newer stone
  const outer = H + T / 2;
  const trim = { material, collide: false, lod: 1 as const };
  const fine = { material, collide: false, lod: 0 as const };
  const slit = { material: "SmoothPlastic" as const, collide: false, lod: 0 as const };
  const faces: { c: [number, number]; along: "x" | "z"; len: number; out: [number, number] }[] = [
    { c: [0, outer], along: "x", len: H * 2, out: [0, 1] },
    { c: [-outer, 0], along: "z", len: H * 2, out: [-1, 0] },
    { c: [outer, 0], along: "z", len: H * 2, out: [1, 0] },
    { c: [-(gap / 2 + side / 2), -outer], along: "x", len: side, out: [0, -1] },
    { c: [gap / 2 + side / 2, -outer], along: "x", len: side, out: [0, -1] },
  ];
  for (const f of faces) {
    const sized = (l: number, h: number, d: number): Vec3 => (f.along === "x" ? [l, h, d] : [d, h, l]);
    const at = (t: number, y: number, o: number): Vec3 => [f.c[0] + (f.along === "x" ? t : 0) + f.out[0] * o, y, f.c[1] + (f.along === "z" ? t : 0) + f.out[1] * o];
    b.box(at(0, 1.6, 0.5), sized(f.len, 4.2, 1.6), dark, trim);
    b.box(at(0, wallH - 3, 0.1), sized(f.len, 0.9, 0.9), pale, trim);
    const slits = Math.floor(f.len / 11);
    for (let i = 0; i < slits; i++) {
      const t = ((i + 0.5) / slits - 0.5) * f.len * 0.8;
      b.box(at(t, wallH * 0.62, 0), sized(0.8, 3.4, 0.5), "#1c1d22", slit);
      b.box(at(t + jitter(rng, 2.5), rng.float(5, wallH - 6), 0), sized(rng.float(3, 6), rng.float(1.2, 2.2), 0.5), rng.chance(0.5) ? pale : dark, fine);
    }
  }

  // gatehouse: two square towers, a lintel over the gate and a half-raised portcullis
  const gateH = wallH + 5;
  for (const sx of [-1, 1]) {
    const x = sx * (gap / 2 + 3.5);
    b.box([x, gateH / 2, -H - 1], [7, gateH, 8], stone, solid);
    crenels(x - 3, -H - 4.4, x + 3, -H - 4.4, gateH, 1.4);
    b.box([x, wallH - 4, -H - 5.1], [3, 6, 0.4], style.palette.accent, { material: "Fabric", collide: false, lod: 0 });
    const glow = mixHex("#ffb866", style.palette.glow, 0.3);
    b.box([x, 6.5, -H - 5.3], [1, 1.6, 1], glow, { material: "Neon", transparency: 0.2, collide: false, lod: 1, light: { type: "point", color: glow, brightness: 1.6, range: 30 } });
  }
  b.box([0, wallH - 2.5, -H], [gap + 1, 5, T + 1], stone, solid);
  b.box([0, wallH - 6, -H - 1], [gap, 2.4, 0.8], "#2e2e33", { material: style.materials.metal, collide: false, lod: 1 });

  // corner towers
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * H;
      const z = sz * H;
      b.cylinder([x, towerH / 2, z], towerD, towerH, stone, solid);
      b.cylinder([x, towerH - 0.6, z], towerD + 2, 2, pale, { material, collide: false, lod: 1 });
      b.cylinder([x, 1.8, z], towerD + 1.6, 4.6, dark, trim);
      for (const [ox, oz] of [[sx, 0], [0, sz]] as const) {
        const reach = towerD / 2;
        b.box([x + ox * reach, towerH * 0.66, z + oz * reach], ox ? [0.5, 3.4, 0.8] : [0.8, 3.4, 0.5], "#1c1d22", slit);
      }
      if (pointed) b.pyramidRoof([x, towerH + 4.2, z], towerD + 1, towerD + 1, 9, style.palette.roof, { material: style.materials.roof, collide: true, lod: 2 });
      else for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        b.box([x + Math.cos(a) * (towerD / 2), towerH + 1.2, z + Math.sin(a) * (towerD / 2)], [2.6, 2.4, 2.6], pale, { material, collide: false, lod: 1 });
      }
    }
  }

  // the keep, set back from the gate, with a turret and a banner: the silhouette seen from afar
  const keepW = 22;
  const keepH = rng.float(34, 40);
  const kz = H * 0.3;
  const kx = jitter(rng, 3);
  b.box([kx, keepH / 2, kz], [keepW, keepH, keepW], pale, solid);
  const k = keepW / 2 - 1;
  crenels(kx - k, kz - k, kx + k, kz - k, keepH, 2);
  crenels(kx - k, kz + k, kx + k, kz + k, keepH, 2);
  crenels(kx - k, kz - k + 3, kx - k, kz + k - 3, keepH, 2);
  crenels(kx + k, kz - k + 3, kx + k, kz + k - 3, keepH, 2);
  for (const wy of [keepH * 0.45, keepH * 0.72]) {
    for (const wx of [-5, 0, 5]) b.box([kx + wx, wy, kz - keepW / 2 - 0.1], [2, 4, 0.6], "#20222a", { material: "SmoothPlastic", collide: false, lod: 0 });
  }
  const turretH = keepH + 9;
  const tx = kx + keepW / 2 - 2;
  const tz = kz + keepW / 2 - 2;
  b.cylinder([tx, turretH / 2, tz], 8, turretH, stone, solid);
  b.pyramidRoof([tx, turretH + 3.2, tz], 9, 9, 7, style.palette.roof, { material: style.materials.roof, collide: true, lod: 2 });
  const poleTop = keepH + 12;
  b.segment([kx, keepH - 1, kz], [kx, poleTop, kz], 0.6, style.palette.wood, { material: style.materials.trunk, collide: false, lod: 1 });
  b.box([kx + 3.2, poleTop - 2, kz], [6, 3.4, 0.3], style.palette.accent, { material: "Fabric", collide: false, lod: 1 });
  return b.build({ id: `castle/${variant}`, prefab: "castle", category: "landmark", sinkDepth: 1, footprintRadius: H + 8, baseRadius: H + 4, tags: ["landmark", "castle"] });
}

/** A two-storey house of the rich and the dead: wings, a central tower, tall chimneys, lit windows at the front. */
export function manor(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const wall = jitterHex(style.palette.wall, jitter(rng, 4), -0.05, jitter(rng, 0.05));
  const stone = jitterHex(style.palette.stone, jitter(rng, 4), -0.04, -0.04);
  const roof = style.palette.roof;
  const material = style.materials.stoneWall;
  const solid = { material, collide: true, lod: 2 as const };
  const roofOpts = { material: style.materials.roof, collide: true, lod: 2 as const };
  const glow = mixHex("#ffc070", style.palette.glow, 0.25);
  const dark = "#1c1d22";
  const W = 34; // main block width (X)
  const D = 18; // main block depth (Z)
  const H = rng.float(19, 23);
  const wingW = 13;
  const wingD = 26;
  const wingH = H - rng.float(3, 5);
  const front = -D / 2;

  // stone plinth, main block, roof
  b.box([0, 1.2, 0], [W + 2, 3.4, D + 2], stone, solid);
  b.box([0, H / 2, 0], [W, H, D], wall, solid);
  b.gableRoof([0, H + 4.5, 0], W + 1.6, D + 2.4, 9, roof, roofOpts);
  b.box([0, H * 0.5, front - 0.1], [W + 0.6, 0.8, 0.6], stone, { material, collide: false, lod: 1 });

  // two wings coming forward: the front of the house wraps around the entrance court
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + wingW / 2 - 1);
    const z = -3;
    b.box([x, 1.2, z], [wingW + 2, 3.4, wingD + 2], stone, solid);
    b.box([x, wingH / 2, z], [wingW, wingH, wingD], wall, solid);
    // ridge along Z, gable toward the player
    const r = new PartListBuilder();
    r.gableRoof([0, 0, 0], wingD + 1.6, wingW + 2.2, 8, roof, roofOpts);
    r.rotateY(90).translate([x, wingH + 4, z]);
    b.merge(r);
    const face = z - wingD / 2 - 0.1;
    for (const wy of [wingH * 0.32, wingH * 0.72]) {
      for (const wx of [-3, 3]) {
        const lit = rng.chance(0.4);
        b.box([x + wx, wy, face], [2.4, 4.6, 0.6], lit ? glow : dark, lit ? { material: "Neon", transparency: 0.15, collide: false, lod: 1 } : { material: "SmoothPlastic", collide: false, lod: 0 });
        b.box([x + wx, wy + 2.7, face], [3.2, 0.6, 0.9], stone, { material, collide: false, lod: 0 });
      }
    }
    // a chimney on each wing
    b.box([x + sx * 3, wingH + 8, z + 7], [3, 11, 3], stone, { material, collide: true, lod: 1 });
    b.box([x + sx * 3, wingH + 13.8, z + 7], [3.8, 0.8, 3.8], dark, { material, collide: false, lod: 0 });
  }

  // central tower over the door, the silhouette seen through the fog
  const towerW = 9;
  const towerH = H + rng.float(9, 13);
  const tz = front - 2;
  b.box([0, towerH / 2, tz], [towerW, towerH, towerW], wall, solid);
  b.box([0, towerH - 0.5, tz], [towerW + 1.2, 1.2, towerW + 1.2], stone, { material, collide: false, lod: 1 });
  b.pyramidRoof([0, towerH + 5.5, tz], towerW + 1.4, towerW + 1.4, 11, roof, roofOpts);
  const towerFace = tz - towerW / 2 - 0.1;
  b.box([0, towerH - 6, towerFace], [2.6, 5, 0.6], glow, { material: "Neon", transparency: 0.15, collide: false, lod: 1, light: { type: "point", color: glow, brightness: 1.4, range: 34 } });
  b.box([0, H * 0.62, towerFace], [2.4, 4.6, 0.6], dark, { material: "SmoothPlastic", collide: false, lod: 0 });

  // door, steps and porch
  b.box([0, 4.2, towerFace], [4.4, 7.6, 0.7], style.palette.wood, { material: style.materials.trunk, collide: false, lod: 1 });
  for (let i = 0; i < 3; i++) b.box([0, 0.5 + i * 0.8, towerFace - 3.4 + i * 1.1], [8 - i, 1, 1.4], stone, { material, collide: true, lod: 1 });
  for (const sx of [-1, 1]) {
    b.cylinder([sx * 3.6, 4.6, towerFace - 1.6], 1.1, 9.2, stone, { material, collide: true, lod: 1 });
    // windows of the main block either side of the tower
    for (const wy of [H * 0.3, H * 0.72]) {
      for (const wx of [8, 13]) {
        const lit = rng.chance(0.35);
        b.box([sx * wx, wy, front - 0.1], [2.4, 4.6, 0.6], lit ? glow : dark, lit ? { material: "Neon", transparency: 0.15, collide: false, lod: 1 } : { material: "SmoothPlastic", collide: false, lod: 0 });
      }
    }
  }
  b.box([0, 9.6, towerFace - 1.2], [9, 1, 3.4], stone, { material, collide: false, lod: 1 });
  return b.build({ id: `manor/${variant}`, prefab: "manor", category: "landmark", sinkDepth: 1, footprintRadius: 28, baseRadius: 24, tags: ["landmark", "manor"] });
}

/** A log chalet: broad eaves, a stone chimney, a balcony facing the view. Warm windows against the cold. */
export function chalet(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const log = jitterHex(style.palette.wood, jitter(rng, 5), -0.03, jitter(rng, 0.05));
  const dark = jitterHex(log, 0, 0, -0.1);
  const stone = jitterHex(style.palette.stone, jitter(rng, 4), -0.03, 0);
  const material = style.materials.trunk;
  const W = 22;
  const D = 16;
  const H = 12;
  const glow = mixHex("#ffc070", style.palette.glow, 0.2);
  const lit = { material: "Neon" as const, transparency: 0.1, collide: false, lod: 1 as const };

  b.box([0, 1, 0], [W + 1.6, 3, D + 1.6], stone, { material: style.materials.stoneWall, collide: true, lod: 2 });
  b.box([0, H / 2 + 1, 0], [W, H, D], log, { material, collide: true, lod: 2 });
  // visible log courses on the front and the sides
  for (let y = 3.5; y < H; y += 2.2) {
    b.box([0, y, -D / 2 - 0.1], [W + 1, 0.7, 0.6], dark, { material, collide: false, lod: 0 });
    for (const sx of [-1, 1]) b.box([sx * (W / 2 + 0.1), y, 0], [0.6, 0.7, D + 1], dark, { material, collide: false, lod: 0 });
  }
  // roof: ridge along Z so the gable and its deep eaves face the player
  const r = new PartListBuilder();
  r.gableRoof([0, 0, 0], D + 7, W + 6, 10, style.palette.roof, { material: style.materials.roof, collide: true, lod: 2 });
  r.rotateY(90).translate([0, H + 6, 0]);
  b.merge(r);
  // gable infill, with a window under the ridge
  b.box([0, H + 3.6, -D / 2 + 0.4], [W * 0.5, 4.6, 0.8], log, { material, collide: false, lod: 1 });
  b.box([0, H + 3.6, -D / 2 - 0.1], [3, 3, 0.6], glow, lit);
  // door and two front windows
  b.box([0, 5, -D / 2 - 0.1], [4, 7.4, 0.7], dark, { material, collide: false, lod: 1 });
  for (const sx of [-1, 1]) b.box([sx * 6.6, 7, -D / 2 - 0.1], [3.6, 3.6, 0.6], glow, { ...lit, light: sx === 1 ? { type: "point", color: glow, brightness: 1.3, range: 26 } : undefined });
  // balcony over the door
  const by = H + 0.2;
  b.box([0, by, -D / 2 - 2.2], [W - 2, 0.7, 4.6], log, { material, collide: true, lod: 1 });
  b.box([0, by + 2, -D / 2 - 4.2], [W - 2, 0.5, 0.5], dark, { material, collide: false, lod: 1 });
  for (let x = -W / 2 + 2; x <= W / 2 - 2; x += 3) b.box([x, by + 1, -D / 2 - 4.2], [0.4, 2, 0.4], dark, { material, collide: false, lod: 0 });
  for (const sx of [-1, 1]) b.box([sx * (W / 2 - 2), by / 2 + 0.4, -D / 2 - 4.2], [0.9, by, 0.9], log, { material, collide: true, lod: 1 });
  // stone chimney with its firewood
  const cx = variant % 2 === 0 ? W / 2 - 3 : -W / 2 + 3;
  b.box([cx, (H + 14) / 2, D / 2 - 3], [3.6, H + 14, 3.6], stone, { material: style.materials.stoneWall, collide: true, lod: 1 });
  for (let i = 0; i < 4; i++) b.cylinder([-W / 2 - 1.2, 1.2 + (i % 2) * 1.1, -3 + i * 1.3], 1.2, 0.9, dark, { material, collide: false, lod: 0, rotation: [90, 0, 0] });
  return b.build({ id: `chalet/${variant}`, prefab: "chalet", category: "landmark", sinkDepth: 1, footprintRadius: 18, baseRadius: 15, tags: ["landmark", "chalet"] });
}
