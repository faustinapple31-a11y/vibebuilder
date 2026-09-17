import { jitterHex, mixHex, type PrefabVariant, type Vec3 } from "@worldforge/core";
import { PartListBuilder, jitter, type PrefabContext } from "../builder";

/**
 * Island-hopping kit: long plank bridges between mesa islands and staircases up the terraces. Both are
 * placed by the generator with an exact length / rise, so the variants are a ladder of sizes the world
 * stage picks from (then scales by a few percent) — never random.
 */
export const PLANK_BRIDGE_LENGTHS = [24, 36, 48, 64, 80, 100, 124] as const;
export const STAIRS_RISES = [8, 16, 24, 32, 40, 48, 56] as const;

function woodColor(ctx: PrefabContext, dark = 0): string {
  return jitterHex(ctx.style.palette.wood, jitter(ctx.rng, 4), jitter(ctx.rng, 0.04), -dark + jitter(ctx.rng, 0.04));
}

/** Flat plank bridge along local X (pivot = deck underside at the centre), posts and rope rails, slight sag. */
export function plankBridge(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const len = PLANK_BRIDGE_LENGTHS[variant % PLANK_BRIDGE_LENGTHS.length]!;
  const w = 8;
  const plankLen = 2.4;
  const planks = Math.round(len / plankLen);
  const sag = Math.min(2.2, len * 0.025);
  const yAt = (t: number) => 0.4 - (1 - (t * 2) * (t * 2)) * sag; // t in [-0.5, 0.5]
  const base = woodColor(ctx);
  for (let i = 0; i < planks; i++) {
    const t = (i + 0.5) / planks - 0.5;
    const t1 = (i + 1.5) / planks - 0.5;
    const x = t * len;
    const dy = yAt(t1) - yAt(t);
    b.beam([x - plankLen / 2, yAt(t) - dy / 2, 0], [x + plankLen / 2, yAt(t) + dy / 2, 0], 0.5, w, jitterHex(base, 0, 0, jitter(rng, 0.06)), { material: style.materials.trunk, collide: true, lod: i % 2 === 0 ? 2 : 1, overlap: 0.06 });
  }
  // stringers under the deck
  for (const sz of [-1, 1]) {
    const segs = Math.max(2, Math.round(len / 12));
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs - 0.5;
      const t1 = (i + 1) / segs - 0.5;
      b.beam([t0 * len, yAt(t0) - 0.55, (sz * (w - 1)) / 2], [t1 * len, yAt(t1) - 0.55, (sz * (w - 1)) / 2], 0.7, 0.7, woodColor(ctx, 0.12), { material: style.materials.trunk, collide: false, lod: 1, overlap: 0.2 });
    }
    // posts every ~8 studs, rope rail between their tops
    const posts = Math.max(2, Math.round(len / 8) + 1);
    const tops: Vec3[] = [];
    for (let i = 0; i < posts; i++) {
      const t = i / (posts - 1) - 0.5;
      const x = t * len;
      const y = yAt(t);
      b.box([x, y + 1.9, (sz * w) / 2], [0.7, 3.8, 0.7], woodColor(ctx, 0.05), { material: style.materials.trunk, collide: false, lod: i === 0 || i === posts - 1 ? 2 : 1 });
      tops.push([x, y + 3.5, (sz * w) / 2]);
    }
    for (let i = 0; i + 1 < tops.length; i++) b.beam(tops[i]!, tops[i + 1]!, 0.35, 0.35, "#b8a27a", { material: "Fabric", collide: false, lod: 1, overlap: 0.3 });
  }
  // landing blocks at both ends (bite into the plateau edge)
  for (const sx of [-1, 1]) b.box([(sx * len) / 2, -0.2, 0], [3, 1.2, w + 0.6], woodColor(ctx, 0.15), { material: style.materials.trunk, collide: true, lod: 2 });
  return b.build({ id: `plank_bridge/${variant}`, prefab: "plank_bridge", category: "building", sinkDepth: 0, footprintRadius: len / 2, tags: ["bridge", "floating"] });
}

/**
 * Straight staircase climbing toward +X: pivot at the foot (ground level, centre of the first step), the
 * top step lands `rise` studs higher. 2-stud risers, 2.5-stud treads, 8 studs wide, stone stringers.
 */
export function stairs(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const rise = STAIRS_RISES[variant % STAIRS_RISES.length]!;
  const riser = 2;
  const tread = 2.5;
  const w = 8;
  const steps = Math.round(rise / riser);
  const stone = jitterHex(style.palette.stone, jitter(rng, 4), jitter(rng, 0.04), jitter(rng, 0.04));
  for (let i = 0; i < steps; i++) {
    // each step is a block from the ground up to its tread (solid stair, no gaps underneath)
    const top = (i + 1) * riser;
    b.box([i * tread + tread / 2, top / 2, 0], [tread + 0.05, top, w], jitterHex(stone, 0, 0, jitter(rng, 0.04)), { material: style.materials.stoneWall, collide: true, lod: i % 3 === 0 ? 2 : 1 });
  }
  // low side walls
  for (const sz of [-1, 1]) {
    for (let i = 0; i < steps; i += 2) {
      const top = (i + 2) * riser;
      b.box([i * tread + tread, top / 2 + 0.6, (sz * (w + 0.8)) / 2], [tread * 2 + 0.1, top + 1.2, 0.8], jitterHex(stone, 0, 0, -0.08), { material: style.materials.stoneWall, collide: true, lod: 1 });
    }
  }
  return b.build({ id: `stairs/${variant}`, prefab: "stairs", category: "path", sinkDepth: 0.4, footprintRadius: (steps * tread) / 2, tags: ["floating", "stairs"] });
}

/**
 * Spawn plaza: an octagonal stone platform with a compass-rose inlay (8 alternating wedges around a hub),
 * a low kerb, and the welcome sign floating above it. Sits flush on the flattened spawn area.
 */
export function spawnPlaza(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const r = 15;
  const stone = jitterHex(style.palette.stone, jitter(rng, 4), 0, 0.02);
  const accent = mixHex(style.palette.accent, "#2fb8c6", 0.45);
  const light = mixHex(stone, "#ffffff", 0.35);
  // platform: 8 wedge-shaped slabs make the octagon (boxes rotated around the hub)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 360;
    b.box([0, 0.5, 0], [r * 0.83, 1, r * 2], i % 2 === 0 ? stone : jitterHex(stone, 0, 0, -0.04), { material: style.materials.stoneWall, rotation: [0, a, 0], collide: true, lod: 2 });
  }
  // compass rose: 8 spokes (long N/E/S/W, short diagonals) alternating colours on top of the slab
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 360;
    const long = i % 2 === 0;
    const len = long ? r * 0.82 : r * 0.55;
    b.box([0, 1.06, 0], [long ? 2.2 : 1.6, 0.14, len], long ? accent : light, { material: "SmoothPlastic", rotation: [0, a, 0], collide: false, castShadow: false, lod: 1 });
  }
  b.cylinder([0, 1.1, 0], 4.5, 0.2, accent, { material: "SmoothPlastic", collide: false, castShadow: false, lod: 1 });
  b.cylinder([0, 1.16, 0], 2, 0.2, light, { material: "SmoothPlastic", collide: false, castShadow: false, lod: 1 });
  // kerb ring
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    const seg = r * 2 * Math.tan(Math.PI / 8);
    b.box([Math.cos(a) * (r - 0.6), 0.7, Math.sin(a) * (r - 0.6)], [1.2, 1.4, seg], jitterHex(stone, 0, 0, -0.1), { material: style.materials.stoneWall, rotation: [0, -((a * 180) / Math.PI), 0], collide: true, lod: 1 });
  }
  // welcome sign: floating title over the hub (billboard), anchored on a tiny invisible part
  b.box([0, 9, 0], [1, 1, 1], "#ffffff", { transparency: 1, collide: false, castShadow: false, lod: 2, billboard: { text: style.ui.welcomeText ?? "BIENVENUE !", subtitle: style.ui.welcomeSubtitle, color: "#ffd23f", width: 34, height: 9, offsetY: 0 } });
  return b.build({ id: `spawn_plaza/${variant}`, prefab: "spawn_plaza", category: "prop", sinkDepth: 0.6, footprintRadius: r, tags: ["layout", "spawn"] });
}
