import { jitterHex, lightenHex, mixHex, type PrefabVariant, type Vec3 } from "@worldforge/core";
import { PartListBuilder, jitter, v3, type PrefabContext } from "./builder";

/**
 * Vegetation prefabs — chunky low-poly trees, giant mushrooms, undergrowth.
 *
 * Trunks and branches are built as *chains of segments between points* (see builder.segment),
 * canopy clusters sit on branch tips, roots run from inside the trunk down into the ground:
 * every piece is connected by construction, whatever the lean or the wobble.
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

export interface Trunk {
  /** Joints from the ground (index 0 = origin) to the top. */
  points: Vec3[];
  top: Vec3;
  /** Unit direction of the last segment. */
  dir: Vec3;
  color: string;
  baseDiameter: number;
}

/**
 * Tapered trunk: `segments` connected cylinders following a leaning, wobbling path.
 * `lean` = horizontal drift per stud of height (0.15 ≈ 8°), `wobble` = random bend per segment.
 */
export function trunkChain(b: PartListBuilder, ctx: PrefabContext, height: number, baseDiameter: number, segments = 2, lean = 0, wobble = 0.05, opts: { color?: string; lod?: 0 | 1 | 2 } = {}): Trunk {
  const { rng, style } = ctx;
  const color = opts.color ?? trunkColor(ctx);
  const leanYaw = rng.float(0, Math.PI * 2);
  let dir = v3.norm([Math.sin(leanYaw) * lean, 1, Math.cos(leanYaw) * lean]);
  const points: Vec3[] = [[0, 0, 0]];
  const segH = height / segments;
  for (let i = 0; i < segments; i++) {
    if (i > 0) dir = v3.norm(v3.add(dir, [jitter(rng, wobble), 0, jitter(rng, wobble)]));
    points.push(v3.add(points[i]!, v3.scale(dir, segH)));
  }
  // the first segment starts a little below ground so the base never shows a gap on slopes
  const pts = [...points];
  pts[0] = [0, -0.6, 0];
  b.chain(pts, baseDiameter, baseDiameter * style.tree.trunkTaper, color, { material: style.materials.trunk, collide: true, lod: opts.lod ?? 2 });
  return { points, top: points[points.length - 1]!, dir, color, baseDiameter };
}

/** Root flares around the base: beams from inside the trunk down into the ground. */
export function roots(b: PartListBuilder, ctx: PrefabContext, t: Trunk, count: number, length: number, lod: 0 | 1 | 2 = 0): void {
  const { rng, style } = ctx;
  const r = t.baseDiameter / 2;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + jitter(rng, 0.5);
    const len = length * rng.float(0.7, 1.3);
    const from: Vec3 = [Math.sin(a) * r * 0.3, r * 0.9, Math.cos(a) * r * 0.3];
    const to: Vec3 = [Math.sin(a) * (r * 0.6 + len), -0.35, Math.cos(a) * (r * 0.6 + len)];
    b.beam(from, to, r * 0.85, r * 0.7, jitterHex(t.color, 0, 0, -0.04), { material: style.materials.trunk, collide: false, lod, roll: 0 });
  }
}

/** Branch: one or two connected segments from a joint, returns the tip. */
export function branch(b: PartListBuilder, ctx: PrefabContext, from: Vec3, yaw: number, elevation: number, length: number, diameter: number, color: string, lod: 0 | 1 | 2, elbow = 0): Vec3 {
  const { style } = ctx;
  if (elbow > 0) {
    const mid = v3.add(from, v3.scale(v3.fromAngles(yaw, elevation), length * 0.55));
    const tip = v3.add(mid, v3.scale(v3.fromAngles(yaw + jitter(ctx.rng, 0.5), elevation + elbow), length * 0.45));
    b.segment(from, mid, diameter, color, { material: style.materials.trunk, collide: false, lod });
    b.segment(mid, tip, diameter * 0.7, color, { material: style.materials.trunk, collide: false, lod });
    return tip;
  }
  const tip = v3.add(from, v3.scale(v3.fromAngles(yaw, elevation), length));
  b.segment(from, tip, diameter, color, { material: style.materials.trunk, collide: false, lod });
  return tip;
}

export function pineTree(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const height = rng.float(24, 38);
  const trunkH = height * rng.float(0.2, 0.3);
  const trunkD = rng.float(2.2, 3.4);
  const t = trunkChain(b, ctx, trunkH, trunkD, 2, jitter(rng, 0.06), 0.03);
  roots(b, ctx, t, rng.int(2, 3), trunkD * 0.9, 0);
  // stacked cones (true pyramids from 4 corner wedges each): the classic low-poly conifer
  const layers = rng.chance(0.4) ? 4 : 3;
  const canopyH = height - trunkH;
  const baseW = rng.float(12, 17);
  const color = foliageColor(ctx);
  const tipColor = lightenHex(color, 0.12);
  // canopy axis continues the trunk direction slightly (leaning pines)
  const axis = v3.norm(v3.add(t.dir, [0, 2.5, 0]));
  const step = layers === 3 ? 0.28 : 0.22;
  const yawBase = rng.float(0, 90);
  for (let i = 0; i < layers; i++) {
    const tt = i / (layers - 1);
    const w = baseW * (1 - tt * 0.6) * rng.float(0.95, 1.05);
    const h = canopyH * (layers === 3 ? 0.5 : 0.42) * (1 - tt * 0.15);
    const baseY = canopyH * step * i - canopyH * 0.06;
    const c = v3.add(t.top, v3.scale(axis, baseY + h / 2));
    const col = mixHex(color, tipColor, tt);
    b.pyramidRoof([c[0], c[1], c[2]], w, w, h, col, {
      material: style.materials.canopy,
      rotation: [0, yawBase + i * 30 + jitter(rng, 10), 0],
      collide: false,
      castShadow: true,
      lod: i === 0 ? 2 : i === layers - 1 ? 2 : i === 1 ? 1 : 0,
    });
  }
  if (style.rock.mossChance > 0.6 && rng.chance(0.3)) {
    // moss/lichen patch on the trunk
    b.box([t.points[0]![0], trunkH * 0.35, t.points[0]![2]], [trunkD * 0.75, trunkH * 0.35, trunkD * 0.75], style.palette.foliageAlt, { material: "Grass", rotation: [0, rng.float(0, 360), 0], collide: false, castShadow: false, lod: 0 });
  }
  return b.build({ id: `pine_tree/${variant}`, prefab: "pine_tree", category: "vegetation", sinkDepth: 1.0, footprintRadius: baseW / 2, tags: ["tree", "conifer"] });
}

export function roundTree(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const height = rng.float(20, 32);
  const trunkH = height * rng.float(0.42, 0.52);
  const trunkD = rng.float(2.8, 4.2);
  const t = trunkChain(b, ctx, trunkH, trunkD, 2, jitter(rng, 0.12), 0.06);
  roots(b, ctx, t, rng.int(2, 4), trunkD * 0.8, 0);
  const color = foliageColor(ctx);
  const canopyR = rng.float(7, 11);
  // core mass on the trunk top (rotated 45° so its corners fill the gaps between the clusters)
  const crown = v3.add(t.top, v3.scale(t.dir, canopyR * 0.5));
  const smooth = style.geometry === "rounded" || style.geometry === "smooth_low_poly";
  const lump = (p: Vec3, s: number, sy: number, col: string, lod: 0 | 1 | 2) => {
    if (smooth) b.sphere(p, s, col, { material: style.materials.canopy, collide: false, lod });
    else b.box(p, [s, sy, s], col, { material: style.materials.canopy, rotation: [jitter(rng, 22), rng.float(0, 360), jitter(rng, 22)], collide: false, lod });
  };
  lump(crown, canopyR * 1.3, canopyR * 1.1, color, 2);
  // branches from the upper trunk, each carrying a canopy cluster at its tip → a rounded, lumpy crown
  const branches = rng.int(4, 5);
  const joint = t.points[t.points.length - 2]!;
  const start = v3.lerp(joint, t.top, 0.55);
  for (let i = 0; i < branches; i++) {
    const yaw = (i / branches) * Math.PI * 2 + jitter(rng, 0.4);
    const len = canopyR * rng.float(0.7, 1.0);
    const tip = branch(b, ctx, start, yaw, rng.float(0.2, 0.75), len, trunkD * 0.32, t.color, i < 2 ? 1 : 0);
    const s = canopyR * rng.float(0.8, 1.0);
    const col = jitterHex(color, jitter(rng, 10), jitter(rng, 0.05), jitter(rng, 0.08));
    lump([tip[0], tip[1] + s * 0.1, tip[2]], s, s * rng.float(0.75, 0.95), col, i < 2 ? 2 : i < 4 ? 1 : 0);
  }
  // a lighter cap on top gives the crown a lit side
  lump([crown[0] + jitter(rng, 2), crown[1] + canopyR * 0.65, crown[2] + jitter(rng, 2)], canopyR * 0.9, canopyR * 0.6, lightenHex(color, 0.08), 1);
  return b.build({ id: `round_tree/${variant}`, prefab: "round_tree", category: "vegetation", sinkDepth: 1.0, footprintRadius: canopyR, tags: ["tree", "deciduous"] });
}

export function deadTree(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const height = rng.float(16, 26);
  const trunkD = rng.float(2.8, 4.2);
  const color = jitterHex(style.palette.wood, jitter(rng, 5), -0.15, -0.12);
  const t = trunkChain(b, ctx, height, trunkD, 4, jitter(rng, 0.25), 0.16, { color });
  roots(b, ctx, t, rng.int(3, 4), trunkD * 1.3, 1);
  const branches = rng.int(4, 5);
  for (let i = 0; i < branches; i++) {
    // start on the trunk path, spread from a third of the height to the top
    const tt = 0.35 + (i / branches) * 0.6 + jitter(rng, 0.06);
    const segIdx = Math.min(t.points.length - 2, Math.floor(tt * (t.points.length - 1)));
    const local = tt * (t.points.length - 1) - segIdx;
    const from = v3.lerp(t.points[segIdx]!, t.points[segIdx + 1]!, local);
    const yaw = (i / branches) * Math.PI * 2 + jitter(rng, 0.7);
    const len = rng.float(6, 11) * (1.3 - tt * 0.5);
    const tip = branch(b, ctx, from, yaw, rng.float(0.15, 0.7), len, trunkD * 0.38 * (1 - tt * 0.4), color, i < 2 ? 2 : 1, rng.float(0.3, 0.9));
    if (rng.chance(0.6)) branch(b, ctx, tip, yaw + jitter(rng, 1.2), rng.float(0.5, 1.2), len * 0.45, trunkD * 0.16, color, 0);
  }
  // a hollow / crack on the trunk
  const crackAt = v3.lerp(t.points[1]!, t.points[2]!, 0.4);
  b.box([crackAt[0], crackAt[1], crackAt[2]], [trunkD * 0.55, trunkD * 1.6, trunkD * 1.02], "#120d0a", { rotation: [0, rng.float(0, 360), 0], collide: false, castShadow: false, lod: 0 });
  // split top
  const topDir = v3.norm(v3.add(t.dir, [jitter(rng, 0.4), 0.3, jitter(rng, 0.4)]));
  b.segment(t.top, v3.add(t.top, v3.scale(topDir, 3)), trunkD * 0.45, color, { material: style.materials.trunk, collide: false, lod: 1 });
  return b.build({ id: `dead_tree/${variant}`, prefab: "dead_tree", category: "vegetation", sinkDepth: 0.8, footprintRadius: 4, tags: ["tree", "dead"] });
}

export function willowTree(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const height = rng.float(20, 30);
  const trunkH = height * 0.45;
  const t = trunkChain(b, ctx, trunkH, rng.float(2.8, 4), 2, jitter(rng, 0.1), 0.05);
  roots(b, ctx, t, 3, 3, 0);
  const color = foliageColor(ctx);
  const r = rng.float(8, 12);
  const crown = v3.add(t.top, [0, r * 0.35, 0]);
  b.box([crown[0], crown[1], crown[2]], [r * 2, r * 1.1, r * 2], color, { material: style.materials.canopy, rotation: [0, rng.float(0, 360), 0], collide: false, lod: 2 });
  const strands = rng.int(6, 9);
  for (let i = 0; i < strands; i++) {
    const a = (i / strands) * Math.PI * 2 + jitter(rng, 0.3);
    const len = rng.float(6, 11);
    // strand starts inside the crown rim and hangs down, slightly outward
    const from: Vec3 = [crown[0] + Math.sin(a) * r * 0.8, crown[1] + r * 0.1, crown[2] + Math.cos(a) * r * 0.8];
    const to: Vec3 = [from[0] + Math.sin(a) * len * 0.25, from[1] - len, from[2] + Math.cos(a) * len * 0.25];
    b.segment(from, to, 2.2, jitterHex(color, 0, 0, -0.05), { material: style.materials.canopy, collide: false, lod: i % 2 === 0 ? 1 : 0, overlap: 0 });
  }
  return b.build({ id: `willow/${variant}`, prefab: "willow", category: "vegetation", sinkDepth: 1.0, footprintRadius: r, tags: ["tree"] });
}

export function birchTree(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const height = rng.float(18, 26);
  const trunkH = height * 0.6;
  const d = rng.float(1.6, 2.4);
  const bark = "#dfe3e6";
  const t = trunkChain(b, ctx, trunkH, d, 2, jitter(rng, 0.08), 0.05, { color: bark });
  const bands = rng.int(3, 5);
  for (let i = 0; i < bands; i++) {
    const tt = rng.float(0.1, 0.9);
    const segIdx = Math.min(t.points.length - 2, Math.floor(tt * (t.points.length - 1)));
    const local = tt * (t.points.length - 1) - segIdx;
    const p = v3.lerp(t.points[segIdx]!, t.points[segIdx + 1]!, local);
    const dir = v3.sub(t.points[segIdx + 1]!, t.points[segIdx]!);
    b.segment(v3.sub(p, v3.scale(v3.norm(dir), 0.3)), v3.add(p, v3.scale(v3.norm(dir), 0.3)), d * 1.04, "#2b2b2b", { collide: false, lod: 0, overlap: 0 });
  }
  const color = foliageColor(ctx, style.palette.foliageAlt);
  const chunks = rng.int(2, 3);
  for (let i = 0; i < chunks; i++) {
    const yaw = rng.float(0, Math.PI * 2);
    const tip = i === 0 ? t.top : branch(b, ctx, v3.lerp(t.points[1]!, t.top, 0.7), yaw, rng.float(0.5, 0.9), rng.float(3, 5), d * 0.45, bark, 1);
    const s = rng.float(6, 9);
    b.box([tip[0], tip[1] + s * 0.35, tip[2]], [s, s * 0.9, s], jitterHex(color, jitter(rng, 8), 0, jitter(rng, 0.06)), {
      material: style.materials.canopy,
      rotation: [jitter(rng, 15), rng.float(0, 360), jitter(rng, 15)],
      collide: false,
      lod: i === 0 ? 2 : 1,
    });
  }
  return b.build({ id: `birch/${variant}`, prefab: "birch", category: "vegetation", sinkDepth: 0.8, footprintRadius: 4.5, tags: ["tree"] });
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
  // stem: 2 connected segments with a lean
  const t = trunkChain(b, ctx, stemH, stemD, 2, jitter(rng, 0.16), 0.06, { color: stemColor });
  const c = t.top;
  // stem ring (skirt)
  b.cylinder([c[0] * 0.5, stemH * 0.52, c[2] * 0.5], stemD * 1.35, capH * 0.18, lightenHex(stemColor, 0.05), { material: style.materials.mushroom, rotation: [jitter(rng, 4), 0, jitter(rng, 4)], collide: false, lod: 0 });
  // gills + glowing underside ring
  b.cylinder([c[0], c[1] + capH * 0.08, c[2]], capD * 0.92, capH * 0.16, jitterHex(capColor, 0, -0.2, -0.22), { material: style.materials.mushroom, collide: false, lod: 1 });
  if (style.mushroom.glow > 0) {
    b.cylinder([c[0], c[1] + capH * 0.02, c[2]], capD * 0.7, capH * 0.06, style.palette.glow, {
      material: "Neon",
      transparency: 0.35,
      collide: false,
      castShadow: false,
      lod: 1,
      light: { type: "point", color: style.palette.glow, brightness: style.mushroom.glow * 2.4, range: capD * 1.8 },
    });
    b.effect([c[0], c[1] - capH * 0.3, c[2]], [capD * 1.2, capH * 1.2, capD * 1.2], { kind: "spores", color: style.palette.glow, rate: 2 + mult * 0.6 }, { lod: 0 });
  }
  // stepped dome cap (3 cylinders)
  b.cylinder([c[0], c[1] + capH * 0.3, c[2]], capD, capH * 0.35, capColor, { material: style.materials.mushroom, collide: true, lod: 2 });
  b.cylinder([c[0], c[1] + capH * 0.6, c[2]], capD * 0.78, capH * 0.3, lightenHex(capColor, 0.04), { material: style.materials.mushroom, collide: false, lod: 1 });
  b.cylinder([c[0], c[1] + capH * 0.85, c[2]], capD * 0.48, capH * 0.28, lightenHex(capColor, 0.08), { material: style.materials.mushroom, collide: false, lod: 2 });
  if (style.mushroom.spots) {
    const spots = rng.int(3, 6);
    const spotColor = mixHex("#f2ead8", capColor, 0.15);
    // top surface of the stepped cap at a given radius (tiers: r<0.24 → 0.99, r<0.39 → 0.75, else 0.475 × capH)
    const capTopAt = (r: number) => capH * (r < capD * 0.22 ? 0.99 : r < capD * 0.37 ? 0.75 : 0.475);
    for (let i = 0; i < spots; i++) {
      const a = rng.float(0, Math.PI * 2);
      const r = capD * rng.float(0.1, 0.44);
      const d = rng.float(0.8, 1.6) * mult * 0.45;
      const sh = capH * 0.08;
      b.cylinder([c[0] + Math.cos(a) * r, c[1] + capTopAt(r) + sh * 0.35, c[2] + Math.sin(a) * r], d, sh, spotColor, { material: style.materials.mushroom, collide: false, lod: 0 });
    }
  }
  // baby mushrooms at the foot
  if (rng.chance(0.6)) {
    const a = rng.float(0, Math.PI * 2);
    const r = stemD * 0.9;
    const h = stemH * 0.18;
    b.cylinder([Math.sin(a) * r, h / 2, Math.cos(a) * r], stemD * 0.35, h, stemColor, { material: style.materials.mushroom, collide: false, lod: 0 });
    b.cylinder([Math.sin(a) * r, h + h * 0.2, Math.cos(a) * r], stemD * 0.9, h * 0.4, capColor, { material: style.materials.mushroom, collide: false, lod: 0 });
  }
  return b.build({ id: `giant_mushroom/${variant}`, prefab: "giant_mushroom", category: "vegetation", sinkDepth: 0.7, footprintRadius: capD / 2, tags: ["mushroom", "giant", "glow"] });
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
    b.cylinder([x, h / 2 - 0.2, z], d, h + 0.4, "#e6ddcc", { material: style.materials.mushroom, collide: false, lod: i === 0 ? 2 : 0 });
    b.cylinder([x, h + h * 0.18, z], d * 2.6, h * 0.36, capColor, { material: style.materials.mushroom, collide: false, lod: i === 0 ? 2 : 0 });
    b.cylinder([x, h + h * 0.42, z], d * 1.6, h * 0.22, lightenHex(capColor, 0.06), { material: style.materials.mushroom, collide: false, lod: 0 });
  }
  if (style.mushroom.glow > 0.3 && rng.chance(0.4)) {
    b.add({ shape: "box", position: [0, 1, 0], size: [0.3, 0.3, 0.3], rotation: [0, 0, 0], color: style.palette.glow, material: "Neon", transparency: 0.5, collide: false, lod: 0 });
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
    b.box([i === 0 ? 0 : jitter(rng, r * 0.6), s * 0.4, i === 0 ? 0 : jitter(rng, r * 0.6)], [s, s * 0.85, s], jitterHex(color, jitter(rng, 6), 0, jitter(rng, 0.06)), {
      material: style.materials.canopy,
      rotation: [jitter(rng, 15), rng.float(0, 360), jitter(rng, 15)],
      collide: false,
      castShadow: i === 0,
      lod: i === 0 ? 2 : 0,
    });
  }
  if (rng.chance(0.35)) {
    // berries / blossoms
    const col = rng.pick([style.palette.accent, style.palette.glow, "#e8c46a", "#d96c8a"]);
    for (let i = 0; i < 3; i++) b.sphere([jitter(rng, r * 0.7), r * rng.float(0.5, 0.9), jitter(rng, r * 0.7)], 0.5, col, { collide: false, castShadow: false, lod: 0 });
  }
  return b.build({ id: `bush/${variant}`, prefab: "bush", category: "vegetation", sinkDepth: 0.6, footprintRadius: r * 0.8, tags: ["bush"] });
}

export function fern(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const color = jitterHex(style.palette.foliageAlt, jitter(rng, 10), 0.05, jitter(rng, 0.05));
  const leaves = rng.int(4, 6);
  const len = rng.float(3, 5);
  for (let i = 0; i < leaves; i++) {
    const yaw = (i / leaves) * Math.PI * 2 + jitter(rng, 0.35);
    // leaf rises from the crown then arches down at the tip
    const from: Vec3 = [0, 0.3, 0];
    const mid = v3.add(from, v3.scale(v3.fromAngles(yaw, rng.float(0.5, 0.8)), len * 0.5));
    const tip = v3.add(mid, v3.scale(v3.fromAngles(yaw, rng.float(-0.1, 0.25)), len * 0.5));
    b.beam(from, mid, 0.25, 1.1, color, { material: style.materials.canopy, collide: false, castShadow: false, lod: i < 3 ? 1 : 0, overlap: 0.15 });
    b.beam(mid, tip, 0.2, 1.4, lightenHex(color, 0.06), { material: style.materials.canopy, collide: false, castShadow: false, lod: i < 3 ? 1 : 0, overlap: 0.15 });
  }
  return b.build({ id: `fern/${variant}`, prefab: "fern", category: "vegetation", sinkDepth: 0.3, footprintRadius: 1.5, tags: ["undergrowth"] });
}

export function grassTuft(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const color = jitterHex(style.palette.foliageAlt, jitter(rng, 12), 0.08, rng.float(0.02, 0.12));
  const blades = rng.int(3, 5);
  for (let i = 0; i < blades; i++) {
    const h = rng.float(1.6, 3.2);
    b.box([jitter(rng, 0.9), h / 2 - 0.2, jitter(rng, 0.9)], [0.35, h + 0.4, 0.9], color, {
      material: style.materials.canopy,
      rotation: [jitter(rng, 14), rng.float(0, 180), jitter(rng, 14)],
      collide: false,
      castShadow: false,
      lod: i === 0 ? 1 : 0,
    });
  }
  return b.build({ id: `grass/${variant}`, prefab: "grass", category: "vegetation", sinkDepth: 0.4, footprintRadius: 1, tags: ["undergrowth", "grass"] });
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
    b.box([x, h / 2 - 0.15, z], [0.2, h + 0.3, 0.2], style.palette.foliageAlt, { material: style.materials.canopy, collide: false, castShadow: false, lod: 0 });
    b.box([x, h + 0.2, z], [0.9, 0.4, 0.9], jitterHex(petal, jitter(rng, 10), 0, jitter(rng, 0.08)), { rotation: [0, 45, 0], collide: false, castShadow: false, lod: i === 0 ? 1 : 0 });
  }
  if (style.mushroom.glow > 0.3 && rng.chance(0.3)) {
    b.add({ shape: "sphere", position: [0, rng.float(1.4, 2.4), 0], size: [0.35, 0.35, 0.35], rotation: [0, 0, 0], color: style.palette.glow, material: "Neon", collide: false, castShadow: false, lod: 0 });
  }
  return b.build({ id: `flower/${variant}`, prefab: "flower", category: "vegetation", sinkDepth: 0.3, footprintRadius: 0.8, tags: ["undergrowth", "flower"] });
}

export function fallenLog(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const len = rng.float(7, 13);
  const d = rng.float(1.8, 2.8);
  const color = jitterHex(style.palette.wood, jitter(rng, 5), -0.08, -0.08);
  const from: Vec3 = [-len / 2, d / 2 - 0.35, 0];
  const to: Vec3 = [len / 2, d / 2 - 0.35 + jitter(rng, 0.3), 0];
  b.segment(from, to, d, color, { material: style.materials.trunk, collide: true, lod: 2, overlap: 0 });
  // a couple of broken branch stubs growing out of the log surface
  const stubs = rng.int(1, 2);
  for (let i = 0; i < stubs; i++) {
    const at = v3.lerp(from, to, rng.float(0.2, 0.8));
    const yaw = rng.float(0, Math.PI * 2);
    const tip = v3.add(at, v3.scale(v3.fromAngles(yaw, rng.float(0.5, 1.2)), rng.float(1.8, 3.2)));
    b.segment(at, tip, d * 0.35, color, { material: style.materials.trunk, collide: false, lod: 0 });
  }
  if (style.rock.mossChance > 0 && rng.chance(style.rock.mossChance)) {
    b.box([jitter(rng, len * 0.25), d * 0.82, 0], [len * 0.35, 0.5, d * 0.9], style.palette.foliageAlt, { material: "Grass", collide: false, lod: 0 });
  }
  if (style.mushroom.glow > 0.2 && rng.chance(0.35)) {
    const x = jitter(rng, len * 0.3);
    b.cylinder([x, d + 0.1, d * 0.2], 0.5, 0.6, "#e6ddcc", { material: style.materials.mushroom, collide: false, lod: 0 });
    b.cylinder([x, d + 0.45, d * 0.2], 1.2, 0.3, rng.pick(style.mushroom.capColors), { material: style.materials.mushroom, collide: false, lod: 0 });
  }
  return b.build({ id: `log/${variant}`, prefab: "log", category: "vegetation", sinkDepth: 0.45, footprintRadius: len / 2, tags: ["log", "forest"] });
}

export function cactus(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const h = rng.float(5, 9);
  const color = jitterHex(style.palette.foliage, jitter(rng, 8), 0, jitter(rng, 0.05));
  b.cylinder([0, h / 2 - 0.2, 0], 1.8, h + 0.4, color, { material: "SmoothPlastic", collide: true, lod: 2 });
  const arms = rng.int(1, 2);
  for (let i = 0; i < arms; i++) {
    const yaw = rng.float(0, Math.PI * 2);
    const y = h * rng.float(0.4, 0.7);
    const elbow = v3.add([0, y, 0], v3.scale(v3.fromAngles(yaw, 0), 2.4));
    b.segment([0, y, 0], elbow, 1.2, color, { collide: false, lod: 1 });
    b.segment(elbow, v3.add(elbow, [0, rng.float(2.5, 3.5), 0]), 1.2, color, { collide: false, lod: 1 });
  }
  return b.build({ id: `cactus/${variant}`, prefab: "cactus", category: "vegetation", sinkDepth: 0.5, footprintRadius: 2, tags: ["desert"] });
}

export function palmTree(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const h = rng.float(16, 26);
  const t = trunkChain(b, ctx, h, 2.2, 3, jitter(rng, 0.3), 0.08);
  const color = foliageColor(ctx);
  const fronds = rng.int(5, 7);
  for (let i = 0; i < fronds; i++) {
    const yaw = (i / fronds) * Math.PI * 2 + jitter(rng, 0.25);
    const len = rng.float(7, 10);
    // frond rises then droops: two beams from the crown
    const mid = v3.add(t.top, v3.scale(v3.fromAngles(yaw, rng.float(0.35, 0.6)), len * 0.45));
    const tip = v3.add(mid, v3.scale(v3.fromAngles(yaw, rng.float(-0.55, -0.25)), len * 0.55));
    b.beam(t.top, mid, 0.5, 2.2, color, { material: style.materials.canopy, collide: false, lod: i % 2 === 0 ? 2 : 0, overlap: 0.3 });
    b.beam(mid, tip, 0.4, 2.6, lightenHex(color, 0.05), { material: style.materials.canopy, collide: false, lod: i % 2 === 0 ? 2 : 0, overlap: 0.3 });
  }
  // coconuts
  for (let i = 0; i < 3; i++) b.sphere(v3.add(t.top, [jitter(rng, 0.8), -0.6, jitter(rng, 0.8)]), 0.9, "#6b4a2a", { collide: false, lod: 0 });
  return b.build({ id: `palm/${variant}`, prefab: "palm", category: "vegetation", sinkDepth: 0.8, footprintRadius: 5, tags: ["tropical"] });
}
