import { jitterHex, mixHex, type PrefabVariant, type RobloxMaterial, type Vec3 } from "@worldforge/core";
import { PartListBuilder, jitter, type PrefabContext } from "../builder";
import { house } from "./buildings";

/**
 * Landmarks for every style family: crashed airliner, radio tower, skyscraper (and its ruin), water
 * tower, pyramid, colosseum, torii gate, lighthouse, pirate ship, rocket, UFO, dome base, crystal
 * spire, ferris wheel, stadium, fountain, obelisk, waterfall cliff, gas station, church, barn.
 * Origin = footprint centre at ground level; scale follows style.scaleRules.landmarkMultiplier.
 */

const METAL: RobloxMaterial = "Metal";

function done(b: PartListBuilder, prefab: string, variant: number, tags: string[], sink = 1.0, footprint?: number): PrefabVariant {
  return b.build({ id: `${prefab}/${variant}`, prefab, category: "landmark", sinkDepth: sink, footprintRadius: footprint, tags: ["landmark", ...tags] });
}

/** Crashed airliner: fuselage broken in two, one wing torn off, tail section apart, scorched ground, smoke. */
export function crashedPlane(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const white = jitterHex("#e8e8e4", 0, 0, jitter(rng, 0.04));
  const dark = "#3a3a40";
  const accent = ctx.style.palette.accent;
  const D = 13; // fuselage diameter
  const frontL = 46;
  const tailL = 26;
  const yaw = jitter(rng, 8);
  // front section: nose + cabin, tilted nose-down, slightly buried
  const front = new PartListBuilder();
  front.cylinder([0, D / 2 - 2, 0], D, frontL, white, { material: METAL, collide: true, lod: 2, rotation: [90, 0, 0] });
  front.sphere([0, D / 2 - 2, -frontL / 2], D, white, { material: METAL, collide: true, lod: 2 });
  front.box([0, D / 2 + 1.5, -frontL / 2 - 1], [D * 0.55, 2.6, 4], dark, { material: "Glass", collide: false, lod: 1, transparency: 0.2 }); // cockpit windows
  front.box([0, D - 2.4, 0], [D + 0.4, 0.9, frontL], accent, { material: "SmoothPlastic", collide: false, lod: 1 }); // livery stripe
  for (let i = 0; i < 11; i++) for (const sx of [-1, 1]) front.box([sx * (D / 2 + 0.05), D / 2 + 0.6, -frontL / 2 + 5 + i * 3.6], [0.2, 1.4, 1.6], "#1a2030", { material: "Glass", collide: false, lod: 0 }); // windows
  // intact wing (left) with engine
  front.box([-D * 1.7, D / 2 - 3, 4], [D * 2.6, 1.2, 12], white, { material: METAL, collide: true, lod: 2, rotation: [0, 0, 4] });
  front.cylinder([-D * 1.3, D / 2 - 5.5, 1], 6.5, 9, mixHex(white, "#8a8a90", 0.4), { material: METAL, collide: true, lod: 1, rotation: [90, 0, 0] });
  front.cylinder([-D * 1.3, D / 2 - 5.5, -3.6], 6.7, 0.8, dark, { material: METAL, collide: false, lod: 0, rotation: [90, 0, 0] });
  // torn rear edge of the front section: jagged plates
  for (let i = 0; i < 6; i++) front.box([Math.cos(i) * D * 0.45, D / 2 - 2 + Math.sin(i) * D * 0.45, frontL / 2 + 1], [3, 3, rng.float(1, 3)], mixHex(white, dark, 0.5), { material: "CorrodedMetal", collide: false, lod: 0, rotation: [jitter(rng, 30), jitter(rng, 30), jitter(rng, 30)] });
  front.transform([-6, yaw, 3], [0, 0, -8]);
  b.merge(front);
  // tail section, further back, rolled to the side
  const tail = new PartListBuilder();
  tail.cylinder([0, D / 2 - 1, 0], D * 0.9, tailL, white, { material: METAL, collide: true, lod: 2, rotation: [90, 0, 0] });
  tail.wedge([0, D / 2 - 1, tailL / 2 + 6], [D * 0.9, D * 0.9, 12], white, { material: METAL, collide: true, lod: 1, rotation: [0, 0, 0] }); // taper
  tail.box([0, D + 6, tailL / 2 - 2], [1.4, 16, 12], accent, { material: METAL, collide: true, lod: 2, rotation: [-28, 0, 0] }); // vertical stabiliser
  tail.box([0, D - 1, tailL / 2 - 1], [D * 2.2, 1, 7], white, { material: METAL, collide: true, lod: 1 }); // horizontal stabilisers
  tail.box([0, D / 2 + 1, tailL / 2 - 4], [D * 0.9 + 0.4, 0.9, tailL * 0.6], accent, { material: "SmoothPlastic", collide: false, lod: 1 });
  for (let i = 0; i < 5; i++) tail.box([Math.cos(i * 1.2) * D * 0.4, D / 2 - 1 + Math.sin(i * 1.2) * D * 0.4, -tailL / 2 - 1], [3, 3, rng.float(1, 3)], mixHex(white, dark, 0.5), { material: "CorrodedMetal", collide: false, lod: 0, rotation: [jitter(rng, 30), jitter(rng, 30), jitter(rng, 30)] });
  tail.transform([4, yaw + 18, 26], [10, 0, 48]);
  b.merge(tail);
  // torn-off right wing lying flat further away, second engine on its own
  b.box([26, 1, 20], [D * 2.4, 1.2, 11], white, { material: METAL, collide: true, lod: 2, rotation: [6, -30, 12] });
  b.cylinder([34, 3, 34], 6.5, 9, mixHex(white, "#8a8a90", 0.4), { material: "CorrodedMetal", collide: true, lod: 1, rotation: [80, 40, 0] });
  // debris field, scorched ground, luggage
  b.cylinder([4, 0.15, 18], 70, 0.3, "#2a2622", { material: "Ground", collide: false, lod: 2 });
  for (let i = 0; i < 14; i++) {
    const a = rng.float(0, Math.PI * 2);
    const r = rng.float(8, 34);
    b.box([4 + Math.cos(a) * r, 0.6, 18 + Math.sin(a) * r], [rng.float(1, 4), rng.float(0.4, 1.5), rng.float(1, 3)], i % 3 === 0 ? accent : i % 3 === 1 ? white : "#5a4a3a", { material: i % 3 === 2 ? "Fabric" : "CorrodedMetal", collide: false, lod: 0, rotation: [jitter(rng, 20), rng.float(0, 180), jitter(rng, 20)] });
  }
  // seats + fire + smoke
  for (let i = 0; i < 4; i++) b.box([jitter(rng, 12) + 8, 1.2, 12 + jitter(rng, 10)], [2, 2.4, 2], "#3a4a6a", { material: "Fabric", collide: false, lod: 0, rotation: [jitter(rng, 40), rng.float(0, 180), jitter(rng, 40)] });
  b.sphere([-8, 1.5, 28], 3.5, "#ff7a30", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ff8a40", brightness: 2.5, range: 50 }, effect: { kind: "embers", color: "#ff9040", rate: 4, size: 0.35 } });
  b.effect([-8, 8, 28], [6, 8, 6], { kind: "smoke", color: "#2a2a2a", rate: 4, size: 2.4 }, { lod: 1 });
  b.effect([-D * 1.3, D / 2, -3], [4, 5, 4], { kind: "smoke", color: "#505050", rate: 2, size: 1.6 }, { lod: 0 });
  b.sphere([-3, D / 2 - 1, -4], 2.2, "#ff4040", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ff4040", brightness: 1, range: 20 } }); // emergency beacon
  return done(b, "crashed_plane", variant, ["apocalypse", "vehicle", "ruins"], 2.5, 64);
}

export function radioTower(ctx: PrefabContext, variant: number): PrefabVariant {
  const { style } = ctx;
  const b = new PartListBuilder();
  const H = 60 * Math.max(1, style.scaleRules.landmarkMultiplier * 0.35);
  const col = "#c04040";
  const white = "#e8e8e8";
  const half = 7;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.beam([sx * half, -0.5, sz * half], [sx * 1.2, H, sz * 1.2], 0.7, 0.7, col, { material: METAL, collide: true, lod: 2 });
  const levels = 7;
  for (let i = 0; i <= levels; i++) {
    const f = i / levels;
    const w = half * 2 * (1 - f * 0.83);
    const y = f * H;
    const c = i % 2 ? white : col;
    b.box([0, y, -w / 2], [w, 0.5, 0.5], c, { material: METAL, collide: false, lod: 1 });
    b.box([0, y, w / 2], [w, 0.5, 0.5], c, { material: METAL, collide: false, lod: 1 });
    b.box([-w / 2, y, 0], [0.5, 0.5, w], c, { material: METAL, collide: false, lod: 1 });
    b.box([w / 2, y, 0], [0.5, 0.5, w], c, { material: METAL, collide: false, lod: 1 });
    if (i < levels) b.box([0, y + H / levels / 2, -w / 2], [w * 0.9, 0.4, 0.4], mixHex(c, "#000000", 0.2), { material: METAL, collide: false, lod: 0, rotation: [0, 0, 35] });
  }
  b.cylinder([0, H + 5, 0], 0.5, 10, white, { material: METAL, collide: false, lod: 1 });
  b.sphere([0, H + 10.5, 0], 1.8, "#ff3030", { material: "Neon", collide: false, lod: 1, light: { type: "point", color: "#ff3030", brightness: 2, range: 60 } });
  b.cylinder([3.5, H * 0.75, 0], 5, 0.8, "#d8d8d0", { material: METAL, collide: false, lod: 1, rotation: [0, 0, 60] });
  b.box([0, 3, 0], [12, 6, 12], "#8a8a88", { material: "Concrete", collide: true, lod: 2 });
  b.box([0, 6.6, 0], [13, 1.2, 13], "#6a6a68", { material: "Concrete", collide: true, lod: 1 });
  return done(b, "radio_tower", variant, ["tower", "industrial", "apocalypse"], 1.0, 9);
}

export function skyscraperLandmark(ctx: PrefabContext, variant: number): PrefabVariant {
  const v = house(ctx, variant, { kit: "skyscraper", floors: ctx.rng.int(18, 28), prefabId: "skyscraper_landmark" });
  return { ...v, category: "landmark", tags: ["landmark", ...v.tags] };
}

export function skyscraperRuin(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const W = 30;
  const D = 26;
  const floors = rng.int(8, 14);
  const H = 7.5;
  const col = "#8a8a88";
  // concrete frame: slabs + columns, glass mostly gone
  for (let f = 0; f <= floors; f++) {
    const broken = f > floors * 0.6;
    const w = broken ? W * (1 - (f - floors * 0.6) / (floors * 0.5)) : W;
    b.box([-(W - w) / 2, f * H + 1, 0], [w, 0.8, D], col, { material: "Concrete", collide: true, lod: 2 });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const h = sx > 0 ? floors * H * 0.6 : floors * H;
    b.box([sx * (W / 2 - 1), h / 2 + 1, sz * (D / 2 - 1)], [1.6, h, 1.6], col, { material: "Concrete", collide: true, lod: 2 });
  }
  b.box([0, (floors * H) / 2 + 1, D / 2 - 0.5], [W * 0.7, floors * H * 0.7, 0.6], "#7a8a98", { material: "Glass", collide: true, lod: 1, transparency: 0.4 });
  for (let f = 0; f < floors; f++) if (rng.chance(0.5)) b.box([-W / 2 + 0.6, f * H + H / 2 + 1, 0], [0.4, H - 1, D * rng.float(0.3, 0.9)], "#5a6a78", { material: "Glass", collide: false, lod: 0, transparency: 0.3 });
  // rebar, rubble, vegetation
  for (let i = 0; i < 6; i++) b.cylinder([W / 2 - 4 + jitter(rng, 4), Math.floor(floors * 0.6) * H + 1.5, jitter(rng, 8)], 0.3, rng.float(4, 9), "#6a5a48", { material: "CorrodedMetal", collide: false, lod: 0, rotation: [jitter(rng, 40), 0, jitter(rng, 40)] });
  for (let i = 0; i < 8; i++) b.box([W / 2 + rng.float(2, 12), 1.2, jitter(rng, 14)], [rng.float(2, 5), rng.float(1, 3), rng.float(2, 5)], col, { material: "Concrete", collide: true, lod: 1, rotation: [jitter(rng, 25), rng.float(0, 90), jitter(rng, 25)] });
  b.box([-W / 2 - 0.4, floors * H * 0.4, 0], [0.6, floors * H * 0.5, D * 0.6], ctx.style.palette.foliageAlt, { material: "LeafyGrass", collide: false, lod: 1, transparency: 0.2 });
  return done(b, "skyscraper_ruin", variant, ["ruins", "apocalypse", "urban"], 1.5, 24);
}

export function waterTower(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const H = 26;
  const col = rng.chance(0.5) ? "#c8c8c0" : mixHex(style.palette.wood, "#6a5a48", 0.5);
  const wooden = col !== "#c8c8c0";
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    b.beam([Math.cos(a) * 8, -0.5, Math.sin(a) * 8], [Math.cos(a) * 4.5, H, Math.sin(a) * 4.5], 0.9, 0.9, wooden ? col : "#6a6a70", { material: wooden ? "Wood" : METAL, collide: true, lod: 2 });
  }
  for (let l = 1; l < 4; l++) {
    const y = (H * l) / 4;
    const r = 8 - (3.5 * l) / 4;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      const a2 = a + Math.PI / 2;
      b.beam([Math.cos(a) * r, y, Math.sin(a) * r], [Math.cos(a2) * r, y, Math.sin(a2) * r], 0.5, 0.5, wooden ? col : "#6a6a70", { material: wooden ? "Wood" : METAL, collide: false, lod: 1 });
    }
  }
  b.cylinder([0, H + 5, 0], 16, 10, col, { material: wooden ? "WoodPlanks" : METAL, collide: true, lod: 2 });
  b.cylinder([0, H + 0.4, 0], 17, 0.8, mixHex(col, "#000000", 0.2), { material: wooden ? "Wood" : METAL, collide: true, lod: 1 });
  b.cylinder([0, H + 11.5, 0], 17, 3, mixHex(col, "#000000", 0.15), { material: wooden ? "Wood" : METAL, collide: true, lod: 2 });
  b.cylinder([0, H + 14, 0], 12, 2, mixHex(col, "#000000", 0.15), { material: wooden ? "Wood" : METAL, collide: false, lod: 1 });
  b.box([0, H + 5.5, -8.1], [8, 2.6, 0.2], style.palette.accent, { material: "SmoothPlastic", collide: false, lod: 0 });
  b.cylinder([0, H / 2, 2], 0.6, H, "#6a6a70", { material: METAL, collide: false, lod: 1 });
  return done(b, "water_tower", variant, ["tower", "western", "industrial"], 1.0, 10);
}

export function pyramid(ctx: PrefabContext, variant: number): PrefabVariant {
  const { style } = ctx;
  const b = new PartListBuilder();
  const S = 90 * Math.max(0.8, style.scaleRules.landmarkMultiplier * 0.3);
  const H = S * 0.62;
  const col = jitterHex(mixHex(style.palette.stone, "#d8c090", 0.6), 0, 0, jitter(ctx.rng, 0.04));
  const steps = 9;
  for (let i = 0; i < steps; i++) {
    const f = 1 - i / steps;
    b.box([0, (i + 0.5) * (H / steps) - 1, 0], [S * f, H / steps + 0.2, S * f], i % 2 ? col : mixHex(col, "#000000", 0.06), { material: "Sandstone", collide: true, lod: 2 });
  }
  // capstone + entrance + stairs on the front face
  b.pyramidRoof([0, H - 1 + (H / steps) * 0.7, 0], S / steps, S / steps, (H / steps) * 1.4, "#e8d8a0", { material: "Sandstone", collide: true, lod: 1 });
  b.box([0, 4, -S / 2 + 2], [8, 8, 6], mixHex(col, "#000000", 0.3), { material: "Sandstone", collide: true, lod: 1 });
  b.box([0, 4, -S / 2 - 0.2], [4.5, 7, 1], "#141008", { material: "Slate", collide: false, lod: 1 });
  b.wedge([0, H * 0.45, -S / 4 - 2], [10, H * 0.9, S / 2 + 4], mixHex(col, "#ffffff", 0.05), { material: "Sandstone", collide: true, lod: 2, rotation: [0, 0, 0] });
  for (const sx of [-1, 1]) b.cylinder([sx * 12, 8, -S / 2 - 6], 2.4, 16, mixHex(col, "#000000", 0.1), { material: "Sandstone", collide: true, lod: 1 });
  b.sphere([0, 5.5, -S / 2 - 1], 2, "#ff9040", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ff9040", brightness: 1.5, range: 28 } });
  return done(b, "pyramid", variant, ["egypt", "jungle", "temple"], 2.0, S * 0.55);
}

export function colosseum(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const R = 36;
  const col = "#ece8dc";
  const levels = 3;
  const n = 24;
  for (let l = 0; l < levels; l++) {
    const y = l * 11;
    const r = R - l * 1.5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const gap = l === 0 && i === 0;
      if (!gap) b.box([Math.cos(a) * r, y + 5.5, Math.sin(a) * r], [3, 11, 3], jitterHex(col, 0, 0, jitter(ctx.rng, 0.03)), { material: "Marble", collide: true, lod: 2, rotation: [0, (-a * 180) / Math.PI, 0] });
      // arches: lintel between pillars
      const a2 = ((i + 0.5) / n) * Math.PI * 2;
      b.box([Math.cos(a2) * r, y + 10, Math.sin(a2) * r], [(2 * Math.PI * r) / n, 2.4, 3], col, { material: "Marble", collide: true, lod: 1, rotation: [0, (-a2 * 180) / Math.PI, 0] });
    }
    b.cylinder([0, y + 11, 0], r * 2 + 3, 1, mixHex(col, "#000000", 0.05), { material: "Marble", collide: true, lod: 2 });
  }
  // arena floor, inner wall, sand
  b.cylinder([0, 0.2, 0], (R - 6) * 2, 0.6, "#d8c090", { material: "Sand", collide: true, lod: 2 });
  b.cylinder([0, 3, 0], (R - 6) * 2, 5.5, col, { material: "Marble", collide: true, lod: 2 });
  b.cylinder([0, 3, 0], (R - 7.5) * 2, 5.6, "#d8c090", { material: "Sand", collide: false, lod: 1 });
  for (let i = 1; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.box([Math.cos(a) * (R - 4.5), 4, Math.sin(a) * (R - 4.5)], [4, 1, 6], mixHex(col, "#000000", 0.1), { material: "Marble", collide: true, lod: 1, rotation: [0, (-a * 180) / Math.PI, 0] });
  }
  b.box([-R, 5, 0], [6, 10, 8], col, { material: "Marble", collide: true, lod: 1 });
  return done(b, "colosseum", variant, ["greek", "arena"], 1.5, R + 4);
}

export function toriiGate(ctx: PrefabContext, variant: number): PrefabVariant {
  const { style } = ctx;
  const b = new PartListBuilder();
  const red = mixHex(style.palette.accent, "#c03030", 0.6);
  const S = Math.max(1, style.scaleRules.landmarkMultiplier * 0.4);
  const W = 22 * S;
  const H = 26 * S;
  for (const sx of [-1, 1]) {
    b.cylinder([sx * W * 0.4, H / 2, 0], 2.4 * S, H, red, { material: "SmoothPlastic", collide: true, lod: 2, rotation: [0, 0, sx * 2] });
    b.cylinder([sx * W * 0.4, 1.2, 0], 3.2 * S, 2.4, "#2a2a30", { material: "Slate", collide: true, lod: 1 });
  }
  b.box([0, H - 1.2, 0], [W * 1.15, 2.4 * S, 2.4 * S], "#2a2a30", { material: "SmoothPlastic", collide: true, lod: 2, rotation: [0, 0, 0] });
  for (const sx of [-1, 1]) b.wedge([sx * (W * 0.57 - 1), H - 0.4, 0], [3.2, 1.8 * S, 2.4 * S], "#2a2a30", { material: "SmoothPlastic", collide: false, lod: 0, rotation: [0, sx > 0 ? -90 : 90, 0] });
  b.box([0, H - 5.5 * S, 0], [W * 0.95, 1.6 * S, 1.6 * S], red, { material: "SmoothPlastic", collide: true, lod: 1 });
  b.box([0, H - 3.4 * S, 0], [3.2 * S, 2.4 * S, 1.4 * S], "#2a2a30", { material: "SmoothPlastic", collide: false, lod: 0 });
  b.box([0, H - 3.4 * S, -0.8 * S], [2.2 * S, 1.6 * S, 0.1], "#e8d8a0", { material: "SmoothPlastic", collide: false, lod: 0 });
  b.box([0, 0.3, 0], [W * 1.3, 0.6, 10], "#8a8a88", { material: "Cobblestone", collide: true, lod: 2 });
  return done(b, "torii_gate", variant, ["japanese", "gate"], 1.0, W * 0.6);
}

export function lighthouse(ctx: PrefabContext, variant: number): PrefabVariant {
  const { style } = ctx;
  const b = new PartListBuilder();
  const H = 44;
  const white = "#f0f0ec";
  const red = mixHex(style.palette.accent, "#c03030", 0.5);
  b.cylinder([0, 1, 0], 20, 2, "#8a8a88", { material: "Cobblestone", collide: true, lod: 2 });
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const f = i / bands;
    b.cylinder([0, 2 + (H / bands) * (i + 0.5), 0], 13 - f * 5, H / bands + 0.2, i % 2 ? red : white, { material: "SmoothPlastic", collide: true, lod: 2 });
  }
  b.cylinder([0, H + 2.5, 0], 11, 1, "#3a3a40", { material: METAL, collide: true, lod: 1 });
  b.cylinder([0, H + 6, 0], 7.5, 7, "#c0e0f0", { material: "Glass", collide: true, lod: 1, transparency: 0.4 });
  b.sphere([0, H + 6, 0], 3.5, "#fff8d0", { material: "Neon", collide: false, lod: 1, light: { type: "point", color: "#fff0c0", brightness: 3, range: 120 } });
  b.cylinder([0, H + 10, 0], 9, 1, "#3a3a40", { material: METAL, collide: true, lod: 1 });
  b.pyramidRoof([0, H + 12.5, 0], 8, 8, 4, red, { material: METAL, collide: false, lod: 1 });
  b.box([0, 5, -6.5], [4, 7, 0.6], "#5a4030", { material: "Wood", collide: false, lod: 1 });
  for (let i = 1; i < 5; i++) b.box([0, 2 + i * 8, -(6.5 - i * 0.8)], [1.6, 2.2, 0.3], "#2a3040", { material: "Glass", collide: false, lod: 0 });
  b.box([0, 2.6, -8], [5, 0.5, 5], "#8a8a88", { material: "Cobblestone", collide: true, lod: 1 });
  return done(b, "lighthouse", variant, ["tropical", "pirate", "docks", "tower"], 1.0, 11);
}

export function pirateShip(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const wood = jitterHex(style.palette.wood, jitter(rng, 5), 0, jitter(rng, 0.05));
  const L = 56;
  const W = 16;
  const wrecked = rng.chance(0.4);
  const roll: [number, number, number] = wrecked ? [4, 0, 18] : [0, 0, 0];
  const hull = new PartListBuilder();
  hull.box([0, 6, 0], [W, 9, L * 0.7], wood, { material: "WoodPlanks", collide: true, lod: 2 });
  hull.wedge([0, 6, -L * 0.35 - 5], [W, 9, 10], wood, { material: "WoodPlanks", collide: true, lod: 2, rotation: [0, 90, 0] });
  hull.box([0, 7, L * 0.35 + 3], [W * 0.95, 11, 8], wood, { material: "WoodPlanks", collide: true, lod: 2 }); // stern castle
  hull.box([0, 10.8, 0], [W + 0.6, 0.8, L * 0.7], mixHex(wood, "#000000", 0.15), { material: "WoodPlanks", collide: true, lod: 2 }); // deck
  hull.box([0, 13, L * 0.35 + 3], [W, 0.8, 8], mixHex(wood, "#000000", 0.15), { material: "WoodPlanks", collide: true, lod: 1 });
  for (const sx of [-1, 1]) hull.box([sx * (W / 2 + 0.2), 12.2, 0], [0.5, 2.4, L * 0.7], wood, { material: "Wood", collide: true, lod: 1 }); // railings
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) hull.cylinder([sx * (W / 2 + 0.6), 6.5, -L * 0.28 + i * 9], 1.6, 1.4, "#1a1a1a", { material: METAL, collide: false, lod: 0, rotation: [0, 0, 90] }); // gun ports
  hull.box([0, 8, 0], [W + 0.4, 1, L * 0.7], mixHex(style.palette.accent, wood, 0.5), { material: "Wood", collide: false, lod: 1 }); // stripe
  // masts + sails
  const masts = [-L * 0.18, L * 0.12];
  masts.forEach((z, i) => {
    const mh = i === 1 ? 46 : 38;
    hull.cylinder([0, 11 + mh / 2, z], 1.6, mh, wood, { material: "Wood", collide: true, lod: 2 });
    for (let s = 0; s < 2; s++) {
      const y = 11 + mh * (0.45 + s * 0.3);
      const sw = (i === 1 ? 26 : 22) - s * 6;
      hull.cylinder([0, y + 7, z], 0.8, sw, wood, { material: "Wood", collide: false, lod: 1, rotation: [0, 0, 90] });
      hull.box([0, y + 1, z - 1], [sw * 0.95, 12, 0.4], wrecked ? "#8a8078" : "#f0ece0", { material: "Fabric", collide: false, lod: 1, rotation: [-6, 0, 0], transparency: wrecked ? 0.3 : 0 });
    }
    if (i === 1) hull.box([0, 11 + mh + 1.5, z], [4, 2.6, 0.2], "#1a1a1a", { material: "Fabric", collide: false, lod: 0 }); // flag
  });
  hull.beam([0, 10, -L * 0.35 - 4], [0, 15, -L * 0.35 - 20], 1.2, 1.2, wood, { material: "Wood", collide: false, lod: 1 }); // bowsprit
  hull.cylinder([0, 12.5, L * 0.35 + 2], 4, 0.6, wood, { material: "Wood", collide: false, lod: 0, rotation: [90, 0, 0] }); // wheel
  hull.transform(roll, [0, wrecked ? -3 : 0, 0]);
  b.merge(hull);
  if (wrecked) {
    for (let i = 0; i < 8; i++) b.box([jitter(rng, 20), 0.6, jitter(rng, 30)], [rng.float(2, 5), 0.5, rng.float(1, 2)], wood, { material: "WoodPlanks", collide: false, lod: 0, rotation: [jitter(rng, 20), rng.float(0, 180), jitter(rng, 20)] });
  }
  return done(b, "pirate_ship", variant, ["pirate", "vehicle", wrecked ? "wrecked" : "ship", "water", "floating"], wrecked ? 4 : 5, 30);
}

export function rocket(ctx: PrefabContext, variant: number): PrefabVariant {
  const { style } = ctx;
  const b = new PartListBuilder();
  const H = 60;
  const white = "#f0f0f4";
  const accent = style.palette.accent;
  // launch pad + gantry
  b.box([0, 1.5, 0], [34, 3, 34], "#8a8a88", { material: "Concrete", collide: true, lod: 2 });
  b.cylinder([0, 4, 0], 16, 2, "#5a5a60", { material: METAL, collide: true, lod: 1 });
  for (const sx of [-1, 1]) b.box([sx * 3, H / 2 + 5, 0], [3.2, H, 3.2], white, { material: METAL, collide: true, lod: 2 }); // boosters
  b.cylinder([0, H / 2 + 5, 0], 9, H, white, { material: METAL, collide: true, lod: 2 });
  b.sphere([0, H + 5, 0], 9, white, { material: METAL, collide: true, lod: 2 });
  b.cylinder([0, H + 12, 0], 3, 8, accent, { material: METAL, collide: false, lod: 1 });
  b.box([0, H * 0.6, 0], [9.6, 4, 9.6], accent, { material: "SmoothPlastic", collide: false, lod: 1 });
  for (let i = 0; i < 4; i++) b.wedge([Math.cos((i * Math.PI) / 2) * 6, 10, Math.sin((i * Math.PI) / 2) * 6], [1.2, 10, 7], accent, { material: METAL, collide: true, lod: 1, rotation: [0, -i * 90 + 90, 0] });
  for (let i = 0; i < 3; i++) b.box([0, 8 + i * 2.5, -4.6 - i * 0.2], [2.4, 2, 1], "#1a2030", { material: "Glass", collide: false, lod: 0 });
  // gantry tower
  b.box([-14, H / 2 + 2, 0], [4, H, 4], "#c04040", { material: METAL, collide: true, lod: 2 });
  for (let i = 1; i < 6; i++) b.box([-9, 4 + i * (H / 6), 0], [10, 0.8, 3], "#c04040", { material: METAL, collide: true, lod: 1 });
  b.effect([0, 3, 0], [12, 4, 12], { kind: "mist", color: "#e8f0ff", rate: 2, size: 1.6 }, { lod: 0 });
  b.sphere([0, H + 17, 0], 1.6, "#ff3030", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ff3030", brightness: 2, range: 40 } });
  return done(b, "rocket", variant, ["space", "scifi", "vehicle"], 1.0, 20);
}

export function ufo(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const g = style.palette.glow;
  const crashed = rng.chance(0.5);
  const y = crashed ? 4 : 30;
  const tilt: Vec3 = crashed ? [12, rng.float(0, 90), -18] : [0, 0, 0];
  const s = new PartListBuilder();
  s.cylinder([0, 0, 0], 40, 4, "#b8bcc8", { material: METAL, collide: true, lod: 2 });
  s.cylinder([0, 2.4, 0], 30, 1.5, "#d8dce4", { material: METAL, collide: true, lod: 2 });
  s.sphere([0, 3.5, 0], 16, mixHex(g, "#a0e0ff", 0.4), { material: "Glass", collide: true, lod: 2, transparency: 0.35 });
  for (let i = 0; i < 12; i++) s.sphere([Math.cos((i * Math.PI) / 6) * 17, -1.2, Math.sin((i * Math.PI) / 6) * 17], 2, g, { material: "Neon", collide: false, lod: 1, light: i % 3 === 0 ? { type: "point" as const, color: g, brightness: 1.2, range: 30 } : undefined });
  s.cylinder([0, -3, 0], 10, 2.5, "#8a8e98", { material: METAL, collide: false, lod: 1 });
  s.transform(tilt, [0, y, 0]);
  b.merge(s);
  if (crashed) {
    b.cylinder([6, 0.15, 6], 60, 0.3, "#2a2622", { material: "Ground", collide: false, lod: 2 });
    for (let i = 0; i < 8; i++) b.box([jitter(rng, 25), 0.8, jitter(rng, 25)], [rng.float(1, 4), rng.float(0.5, 1.5), rng.float(1, 3)], "#b8bcc8", { material: "CorrodedMetal", collide: false, lod: 0, rotation: [jitter(rng, 30), rng.float(0, 180), jitter(rng, 30)] });
    b.effect([0, 8, 0], [10, 8, 10], { kind: "smoke", color: "#404040", rate: 3, size: 2 }, { lod: 1 });
    b.effect([0, 4, 0], [30, 6, 30], { kind: "sparkle", color: g, rate: 3, size: 0.4 }, { lod: 0 });
  } else {
    b.cylinder([0, y / 2 - 3, 0], 14, y - 6, g, { material: "ForceField", collide: false, lod: 2, transparency: 0.55 }); // tractor beam
    b.cylinder([0, 0.2, 0], 16, 0.4, g, { material: "Neon", collide: false, lod: 1, light: { type: "point", color: g, brightness: 1.5, range: 40 } });
    b.effect([0, y / 2, 0], [12, y - 6, 12], { kind: "sparkle", color: g, rate: 4, size: 0.4 }, { lod: 1 });
  }
  return done(b, "ufo", variant, ["space", "alien", "scifi", crashed ? "wrecked" : "floating"], crashed ? 1.5 : 0.5, 22);
}

export function domeBase(ctx: PrefabContext, variant: number): PrefabVariant {
  const { style } = ctx;
  const b = new PartListBuilder();
  const g = style.palette.glow;
  b.cylinder([0, 1, 0], 44, 2, "#8a8e98", { material: METAL, collide: true, lod: 2 });
  b.sphere([0, 2, 0], 36, mixHex("#d8e4f0", g, 0.15), { material: "Glass", collide: true, lod: 2, transparency: 0.4 });
  for (let i = 0; i < 6; i++) b.box([0, 2, 0], [0.8, 36, 36.6], "#c0c4cc", { material: METAL, collide: false, lod: 1, rotation: [0, i * 30, 0] });
  // interior: floor, habitat pods, plants
  b.cylinder([0, 2.4, 0], 34, 0.6, "#a8b0b8", { material: METAL, collide: true, lod: 2 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.box([Math.cos(a) * 9, 5.5, Math.sin(a) * 9], [8, 6, 8], "#e8ecf0", { material: "SmoothPlastic", collide: true, lod: 1 });
    b.box([Math.cos(a) * 9, 5.5, Math.sin(a) * 9], [8.2, 0.4, 8.2], g, { material: "Neon", collide: false, lod: 0 });
    b.sphere([Math.cos(a + 1) * 12, 4.5, Math.sin(a + 1) * 12], 3.5, style.palette.foliageAlt, { material: "Grass", collide: false, lod: 0 });
  }
  b.sphere([0, 10, 0], 2.4, g, { material: "Neon", collide: false, lod: 1, light: { type: "point", color: g, brightness: 2, range: 60 } });
  // airlock tunnel to the front
  b.cylinder([0, 5, -22], 8, 10, "#c0c4cc", { material: METAL, collide: true, lod: 2, rotation: [90, 0, 0] });
  b.box([0, 4, -27.2], [4.5, 7, 0.6], "#3a3a44", { material: METAL, collide: false, lod: 1 });
  b.box([0, 4, -27.5], [3.6, 6, 0.2], g, { material: "Neon", collide: false, lod: 0, transparency: 0.4 });
  b.box([0, 9.2, -22], [3, 0.4, 10], g, { material: "Neon", collide: false, lod: 0 });
  b.cylinder([16, 20, 10], 0.6, 20, "#c0c4cc", { material: METAL, collide: false, lod: 1 });
  b.cylinder([16, 28, 8], 7, 0.8, "#e8ecf0", { material: METAL, collide: false, lod: 1, rotation: [-45, 0, 0] });
  return done(b, "dome_base", variant, ["space", "scifi", "base"], 1.5, 24);
}

export function crystalSpire(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const g = rng.chance(0.5) ? style.palette.glow : style.palette.mushroomAlt;
  const H = 46;
  const shards = 7;
  for (let i = 0; i < shards; i++) {
    const a = (i / shards) * Math.PI * 2 + jitter(rng, 0.3);
    const r = i === 0 ? 0 : rng.float(4, 10);
    const h = i === 0 ? H : rng.float(H * 0.3, H * 0.7);
    const w = i === 0 ? 10 : rng.float(3, 6);
    b.wedge([Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r], [w, h, w], mixHex(g, "#ffffff", 0.3), { material: "Glass", collide: true, lod: i < 3 ? 2 : 1, transparency: 0.25, reflectance: 0.3, rotation: [jitter(rng, 10) + (i === 0 ? 0 : 8), rng.float(0, 360), jitter(rng, 10)] });
    b.box([Math.cos(a) * r, h * 0.45, Math.sin(a) * r], [w * 0.5, h * 0.8, w * 0.5], g, { material: "Neon", collide: false, lod: i < 3 ? 1 : 0, rotation: [0, rng.float(0, 90), 0], light: i === 0 ? { type: "point" as const, color: g, brightness: 2.5, range: 80 } : undefined });
  }
  b.cylinder([0, 0.6, 0], 30, 1.2, mixHex(style.palette.stone, g, 0.3), { material: "Slate", collide: true, lod: 2 });
  b.effect([0, H * 0.5, 0], [16, H, 16], { kind: "sparkle", color: g, rate: 4, size: 0.4 }, { lod: 1 });
  return done(b, "crystal_spire", variant, ["alien", "crystal", "glow"], 1.5, 14);
}

export function ferrisWheel(ctx: PrefabContext, variant: number): PrefabVariant {
  const { style } = ctx;
  const b = new PartListBuilder();
  const R = 26;
  const cy = R + 6;
  const frame = "#c8c8d0";
  const accent = style.palette.accent;
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) b.beam([sx * 14, -0.5, sz * 4], [0, cy, sz * 4], 1.6, 1.6, frame, { material: METAL, collide: true, lod: 2 });
    b.cylinder([0, cy, sz * 4], R * 2, 1.2, frame, { material: METAL, collide: false, lod: 2, rotation: [90, 0, 0], transparency: 0.5 });
    for (let i = 0; i < 12; i++) b.box([0, cy, sz * 4], [1, R * 2, 0.6], frame, { material: METAL, collide: false, lod: 1, rotation: [0, 0, i * 30] });
  }
  b.cylinder([0, cy, 0], 6, 10, accent, { material: METAL, collide: false, lod: 1, rotation: [90, 0, 0] });
  const cols = ["#ff5050", "#ffd040", "#40b0ff", "#8ae060", "#ff70c0", "#ff8a30"];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = Math.cos(a) * R;
    const y = cy + Math.sin(a) * R;
    b.box([x, y - 2.5, 0], [5, 4.5, 5], cols[i % 6]!, { material: "SmoothPlastic", collide: true, lod: 1 });
    b.box([x, y - 0.4, 0], [5.4, 0.4, 5.4], frame, { material: METAL, collide: false, lod: 0 });
    b.sphere([x, y, 0], 1, "#fff0a0", { material: "Neon", collide: false, lod: 0, light: i % 4 === 0 ? { type: "point" as const, color: cols[i % 6]!, brightness: 1, range: 20 } : undefined });
  }
  b.box([0, 1, 0], [40, 2, 16], "#8a8a88", { material: "Concrete", collide: true, lod: 2 });
  b.box([0, 4, -9], [10, 5, 4], accent, { material: "SmoothPlastic", collide: true, lod: 1 });
  return done(b, "ferris_wheel", variant, ["carnival", "candy", "playground"], 1.0, R + 3);
}

export function stadium(ctx: PrefabContext, variant: number): PrefabVariant {
  const { style } = ctx;
  const b = new PartListBuilder();
  const L = 90;
  const W = 60;
  const green = mixHex(style.palette.foliage, "#3a9a3a", 0.6);
  b.box([0, 0.3, 0], [L, 0.6, W], green, { material: "Grass", collide: true, lod: 2 });
  for (let i = 0; i < 5; i++) b.box([-L / 2 + 5 + (i * (L - 10)) / 4, 0.65, 0], [0.6, 0.1, W - 4], "#ffffff", { material: "SmoothPlastic", collide: false, lod: 1 });
  b.box([0, 0.65, W / 2 - 2], [L - 4, 0.1, 0.6], "#ffffff", { material: "SmoothPlastic", collide: false, lod: 1 });
  b.box([0, 0.65, -W / 2 + 2], [L - 4, 0.1, 0.6], "#ffffff", { material: "SmoothPlastic", collide: false, lod: 1 });
  b.cylinder([0, 0.7, 0], 18, 0.1, "#ffffff", { material: "SmoothPlastic", collide: false, lod: 1 });
  for (const sx of [-1, 1]) {
    // goals
    b.box([sx * (L / 2 - 2), 4, 0], [0.5, 8, 16], "#ffffff", { material: "Fabric", collide: false, lod: 1, transparency: 0.55 });
    b.box([sx * (L / 2 - 2), 8, 0], [0.6, 0.6, 16], "#ffffff", { material: "SmoothPlastic", collide: true, lod: 1 });
    for (const sz of [-1, 1]) b.box([sx * (L / 2 - 2), 4, sz * 8], [0.6, 8, 0.6], "#ffffff", { material: "SmoothPlastic", collide: true, lod: 1 });
    // stands (long sides)
    for (let r = 0; r < 6; r++) {
      b.box([0, 1 + r * 2.4, sx * (W / 2 + 4 + r * 3)], [L + 10, 2.4, 3], r % 2 ? "#8a8a90" : mixHex(style.palette.accent, "#8a8a90", 0.6), { material: "Concrete", collide: true, lod: 2 });
    }
    b.box([0, 16, sx * (W / 2 + 12)], [L + 14, 1, 24], "#5a5a60", { material: METAL, collide: true, lod: 2 }); // roof
    for (let i = 0; i < 5; i++) b.box([-L / 2 + (i * L) / 4, 8, sx * (W / 2 + 23)], [1.4, 16, 1.4], "#5a5a60", { material: METAL, collide: true, lod: 1 });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.cylinder([sx * (L / 2 + 6), 16, sz * (W / 2 + 6)], 1.2, 32, "#8a8a90", { material: METAL, collide: true, lod: 2 });
    b.box([sx * (L / 2 + 6), 32, sz * (W / 2 + 6)], [6, 3, 1], "#fff8e0", { material: "Neon", collide: false, lod: 1, rotation: [sz * 30, sx * sz * 45, 0], light: { type: "point", color: "#fff4d0", brightness: 3, range: 100 } });
  }
  b.box([0, 8, W / 2 + 22], [16, 8, 1], "#1a1a20", { material: "SmoothPlastic", collide: false, lod: 1 });
  b.box([0, 8, W / 2 + 21.4], [14, 6, 0.1], style.palette.glow, { material: "Neon", collide: false, lod: 0 }); // scoreboard
  return done(b, "stadium", variant, ["sports", "urban"], 1.0, 70);
}

export function fountain(ctx: PrefabContext, variant: number): PrefabVariant {
  const { style } = ctx;
  const b = new PartListBuilder();
  const stone = jitterHex(style.palette.stone, 0, 0, jitter(ctx.rng, 0.05));
  const water = style.palette.water;
  b.cylinder([0, 1, 0], 22, 2, stone, { material: style.materials.stoneWall, collide: true, lod: 2 });
  b.cylinder([0, 2.2, 0], 20, 0.4, water, { material: "Glass", collide: false, lod: 2, transparency: 0.35, reflectance: 0.3 });
  b.cylinder([0, 2.4, 0], 23, 1.2, mixHex(stone, "#000000", 0.1), { material: style.materials.stoneWall, collide: true, lod: 1 });
  b.cylinder([0, 5, 0], 3, 6, stone, { material: style.materials.stoneWall, collide: true, lod: 1 });
  b.cylinder([0, 8.4, 0], 11, 1, stone, { material: style.materials.stoneWall, collide: true, lod: 1 });
  b.cylinder([0, 9.1, 0], 10, 0.3, water, { material: "Glass", collide: false, lod: 1, transparency: 0.35 });
  b.cylinder([0, 11, 0], 2, 4, stone, { material: style.materials.stoneWall, collide: false, lod: 1 });
  b.sphere([0, 13.5, 0], 3, stone, { material: style.materials.stoneWall, collide: false, lod: 1 });
  b.effect([0, 14, 0], [4, 8, 4], { kind: "mist", color: "#e8f4ff", rate: 4, size: 0.9 }, { lod: 1 });
  b.effect([0, 6, 0], [16, 6, 16], { kind: "sparkle", color: "#d0f0ff", rate: 2, size: 0.25 }, { lod: 0 });
  for (let i = 0; i < 4; i++) b.cylinder([Math.cos((i * Math.PI) / 2) * 4, 9.6, Math.sin((i * Math.PI) / 2) * 4], 0.5, 2, water, { material: "Glass", collide: false, lod: 0, transparency: 0.3 });
  return done(b, "fountain", variant, ["urban", "greek", "village", "water"], 1.0, 12);
}

export function obelisk(ctx: PrefabContext, variant: number): PrefabVariant {
  const { style } = ctx;
  const b = new PartListBuilder();
  const col = jitterHex(mixHex(style.palette.stone, "#d8c090", 0.5), 0, 0, jitter(ctx.rng, 0.04));
  const H = 50;
  b.box([0, 2, 0], [16, 4, 16], col, { material: "Sandstone", collide: true, lod: 2 });
  b.box([0, 5.5, 0], [11, 3, 11], mixHex(col, "#000000", 0.05), { material: "Sandstone", collide: true, lod: 1 });
  for (let i = 0; i < 4; i++) {
    const f = 1 - i / 4;
    b.box([0, 7 + (i + 0.5) * (H / 4), 0], [7 * (0.6 + f * 0.4), H / 4 + 0.2, 7 * (0.6 + f * 0.4)], col, { material: "Sandstone", collide: true, lod: 2 });
  }
  b.pyramidRoof([0, 7 + H + 2, 0], 4.6, 4.6, 4, "#e8c060", { material: METAL, collide: false, lod: 1 });
  for (let i = 0; i < 6; i++) b.box([0, 12 + i * 6, -3.6 + i * 0.28], [2, 3, 0.15], i % 2 ? style.palette.accent : "#8a6a30", { material: "SmoothPlastic", collide: false, lod: 0 });
  return done(b, "obelisk", variant, ["egypt", "statue"], 1.0, 9);
}

export function waterfallCliff(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const stone = jitterHex(style.palette.stone, jitter(rng, 6), 0, jitter(rng, 0.05));
  const H = 34;
  const W = 40;
  // stepped cliff
  for (let i = 0; i < 4; i++) b.box([0, (i + 0.5) * (H / 4) - 1, i * 2.5], [W - i * 4, H / 4 + 0.4, 20 - i * 3], jitterHex(stone, 0, 0, jitter(rng, 0.05)), { material: style.materials.rock, collide: true, lod: 2, rotation: [0, jitter(rng, 3), 0] });
  for (let i = 0; i < 6; i++) {
    const step = rng.int(0, 3);
    const stepTop = (step + 1) * (H / 4) - 1 + 0.2;
    b.box([jitter(rng, (W - step * 4) * 0.45), stepTop + 1.2, step * 2.5 - (20 - step * 3) / 2 + rng.float(1, 4)], [rng.float(3, 7), rng.float(3, 5), rng.float(3, 6)], stone, { material: style.materials.rock, collide: true, lod: 1, rotation: [jitter(rng, 20), rng.float(0, 90), jitter(rng, 20)] });
  }
  // water sheet + pool + mist
  b.box([0, H / 2 + 1, -9.5], [10, H, 1.2], style.palette.water, { material: "Glass", collide: false, lod: 2, transparency: 0.3, reflectance: 0.2 });
  b.box([0, H / 2 + 1, -9.9], [6, H, 0.5], "#e8f4ff", { material: "SmoothPlastic", collide: false, lod: 1, transparency: 0.4 });
  b.cylinder([0, 0.3, -16], 22, 0.6, style.palette.water, { material: "Glass", collide: false, lod: 2, transparency: 0.35 });
  b.effect([0, 3, -14], [14, 6, 10], { kind: "mist", color: "#e8f4ff", rate: 6, size: 1.6 }, { lod: 1 });
  b.effect([0, H + 2, -8], [8, 3, 4], { kind: "mist", color: "#ffffff", rate: 2, size: 1 }, { lod: 0 });
  const topFace = H - 1 + 0.2;
  for (let i = 0; i < 5; i++) {
    const d = rng.float(4, 7);
    b.sphere([jitter(rng, (W - 12) * 0.45), topFace + d * 0.3, 7.5 + rng.float(-4, 4)], d, style.palette.foliageAlt, { material: style.materials.canopy, collide: false, lod: 1 });
  }
  return done(b, "waterfall_cliff", variant, ["water", "cliff", "jungle", "tropical"], 2.0, 22);
}

export function gasStation(ctx: PrefabContext, variant: number): PrefabVariant {
  const { style, rng } = ctx;
  const b = new PartListBuilder();
  const ruined = style.architecture.weathering > 0.8;
  const accent = style.palette.accent;
  const white = ruined ? "#a8a8a0" : "#f0f0ec";
  // shop
  b.box([-14, 4.5, 6], [22, 9, 16], white, { material: "Concrete", collide: true, lod: 2 });
  b.box([-14, 4.5, -2.2], [16, 6, 0.4], "#7a9ab0", { material: "Glass", collide: true, lod: 1, transparency: ruined ? 0 : 0.3 });
  b.box([-14, 9.5, 6], [23, 1, 17], mixHex(accent, "#404040", 0.3), { material: METAL, collide: true, lod: 1 });
  b.box([-14, 11.2, -2], [14, 2.4, 0.4], accent, { material: ruined ? "SmoothPlastic" : "Neon", collide: false, lod: 1, light: ruined ? undefined : { type: "point" as const, color: accent, brightness: 1, range: 20 } });
  // canopy over the pumps
  for (const sx of [-1, 1]) b.box([sx * 8 + 6, 6, -12], [1.6, 12, 1.6], "#8a8a90", { material: METAL, collide: true, lod: 1 });
  b.box([6, 12.5, -12], [30, 1.6, 18], white, { material: METAL, collide: true, lod: 2 });
  b.box([6, 12.5, -21.2], [30, 1.6, 0.4], accent, { material: "SmoothPlastic", collide: false, lod: 1 });
  for (let i = 0; i < 2; i++) b.box([6, 11.6, -8 - i * 8], [3, 0.3, 2], "#fff4d0", { material: ruined ? "SmoothPlastic" : "Neon", collide: false, lod: 0, light: ruined ? undefined : { type: "point" as const, color: "#fff0c0", brightness: 1.2, range: 24 } });
  // pumps
  for (const sx of [-1, 1]) {
    b.box([6 + sx * 6, 0.4, -12], [4, 0.8, 8], "#8a8a88", { material: "Concrete", collide: true, lod: 1 });
    b.box([6 + sx * 6, 3.6, -12], [2.2, 6, 2.6], ruined ? "#8a8078" : "#e8e8e0", { material: METAL, collide: true, lod: 1 });
    b.box([6 + sx * 6, 5.4, -13.4], [1.6, 1.2, 0.1], "#1a2030", { material: "SmoothPlastic", collide: false, lod: 0 });
    b.box([6 + sx * 6, 2.4, -12], [2.3, 1, 2.7], accent, { material: "SmoothPlastic", collide: false, lod: 0 });
  }
  // price sign
  b.box([26, 8, -6], [1, 16, 1], "#8a8a90", { material: METAL, collide: true, lod: 1 });
  b.box([26, 15, -6], [6, 5, 0.6], white, { material: "SmoothPlastic", collide: false, lod: 1 });
  b.box([26, 15, -6.35], [5, 4, 0.1], accent, { material: "SmoothPlastic", collide: false, lod: 0 });
  if (ruined) for (let i = 0; i < 4; i++) b.box([jitter(rng, 14), 0.7, -12 + jitter(rng, 8)], [rng.float(1, 3), rng.float(0.5, 1.2), rng.float(1, 3)], "#8a8a80", { material: "Concrete", collide: false, lod: 0, rotation: [0, rng.float(0, 90), 0] });
  return done(b, "gas_station", variant, ["urban", "apocalypse", "suburban"], 1.0, 24);
}

export function church(ctx: PrefabContext, variant: number): PrefabVariant {
  const { style } = ctx;
  const b = new PartListBuilder();
  const wall = jitterHex(style.palette.wall, 0, 0, jitter(ctx.rng, 0.04));
  const roof = style.palette.roof;
  const W = 22;
  const L = 44;
  const H = 16;
  b.box([0, 1, 0], [W + 2, 2, L + 2], style.palette.stone, { material: style.materials.stoneWall, collide: true, lod: 2 });
  b.box([0, 1.75, 0], [W - 1, 0.5, L - 1], mixHex(style.palette.stone, "#ffffff", 0.2), { material: "Marble", collide: true, lod: 2 }); // floor
  for (const sx of [-1, 1]) b.box([sx * (W / 2 - 0.4), H / 2 + 1.5, 0], [0.8, H, L], wall, { material: style.materials.wall, collide: true, lod: 2 });
  b.box([0, H / 2 + 1.5, L / 2 - 0.4], [W, H, 0.8], wall, { material: style.materials.wall, collide: true, lod: 2 });
  b.box([0, H + 1.25, 0], [W - 1, 0.5, L - 1], mixHex(style.palette.wood, "#000000", 0.1), { material: "WoodPlanks", collide: true, lod: 2 }); // ceiling
  b.gableRoof([0, H + 1.5 + 5, 0], W + 2, L + 2, 10, roof, { material: style.materials.roof, collide: true, lod: 2 });
  for (const sx of [-1, 1]) b.wedge([sx * (W / 2 - 0.3), H + 6.5, -L / 4], [0.6, 10, L / 2], wall, { material: style.materials.wall, collide: true, lod: 1 });
  for (const sx of [-1, 1]) b.wedge([sx * (W / 2 - 0.3), H + 6.5, L / 4], [0.6, 10, L / 2], wall, { material: style.materials.wall, collide: true, lod: 1, rotation: [0, 180, 0] });
  // interior: door opening, floor, pews, altar
  // the main box above is the nave shell; carve the entrance: re-draw the front wall in three pieces
  b.box([0, H / 2 + 1.5, -L / 2 - 0.5], [W + 0.2, H + 0.2, 0.2], wall, { material: style.materials.wall, collide: false, lod: 0, transparency: 1 });
  for (const sx of [-1, 1]) b.box([sx * (W / 4 + 1.5), H / 2 + 1.5, -L / 2 - 0.6], [W / 2 - 3, H, 0.4], wall, { material: style.materials.wall, collide: true, lod: 2 });
  b.box([0, H - 1.5, -L / 2 - 0.6], [6.4, 3, 0.4], wall, { material: style.materials.wall, collide: true, lod: 2 });
  b.box([0, 4.5, -L / 2 - 0.9], [6, 9, 0.3], mixHex(style.palette.wood, "#000000", 0.2), { material: "Wood", collide: false, lod: 1, rotation: [0, 70, 0] });
  for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) b.box([sx * 5, 2.8, -L / 2 + 8 + i * 5], [7, 1.6, 1.6], style.palette.wood, { material: "Wood", collide: true, lod: 0 });
  b.box([0, 3.2, L / 2 - 5], [8, 3.2, 3], mixHex(style.palette.stone, "#ffffff", 0.3), { material: "Marble", collide: true, lod: 1 });
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) b.box([sx * (W / 2 + 0.05), H * 0.6, -L / 2 + 8 + i * 7], [0.3, 7, 2.6], "#5a4a8a", { material: "Glass", collide: false, lod: 1, transparency: 0.2 });
  b.sphere([0, H + 0.4, L / 2 - 6], 1.6, "#ffd080", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ffd080", brightness: 1.5, range: 40 } });
  // bell tower with spire
  b.box([0, H + 12, -L / 2 + 6], [10, H * 2 + 8, 10], wall, { material: style.materials.wall, collide: true, lod: 2 });
  for (const sx of [-1, 1]) b.box([sx * 5.05, H * 2 + 2, -L / 2 + 6], [0.3, 6, 4], "#1a1a20", { material: "SmoothPlastic", collide: false, lod: 1 });
  b.box([0, H * 2 + 2, -L / 2 + 0.95], [4, 6, 0.3], "#1a1a20", { material: "SmoothPlastic", collide: false, lod: 1 });
  b.pyramidRoof([0, H * 2 + 24, -L / 2 + 6], 12, 12, 16, roof, { material: style.materials.roof, collide: true, lod: 2 });
  b.box([0, H * 2 + 35, -L / 2 + 6], [0.6, 4, 0.6], "#d8c060", { material: METAL, collide: false, lod: 0 });
  b.box([0, H * 2 + 35.8, -L / 2 + 6], [2.4, 0.6, 0.6], "#d8c060", { material: METAL, collide: false, lod: 0 });
  b.cylinder([0, H * 2 + 2, -L / 2 + 6], 2.4, 2.6, "#b08a30", { material: METAL, collide: false, lod: 0 });
  return done(b, "church", variant, ["village", "building", "temple", "interior"], 1.2, 26);
}

export function barn(ctx: PrefabContext, variant: number): PrefabVariant {
  const { style, rng } = ctx;
  const b = new PartListBuilder();
  const red = mixHex(style.palette.accent, "#a03030", 0.6);
  const white = "#f0ece0";
  const W = 26;
  const L = 34;
  const H = 12;
  b.box([0, 1, 0], [W + 2, 2, L + 2], style.palette.stone, { material: style.materials.stoneWall, collide: true, lod: 2 });
  b.box([0, H / 2 + 1.5, 0], [W, H, L], red, { material: "WoodPlanks", collide: true, lod: 2 });
  // gambrel roof: two wedge pairs
  b.gableRoof([0, H + 1.5 + 3, 0], W + 2, L + 2, 6, mixHex(style.palette.roof, "#4a4a4a", 0.3), { material: style.materials.roof, collide: true, lod: 2 });
  b.gableRoof([0, H + 1.5 + 6 + 2, 0], W * 0.6, L + 2.4, 4, mixHex(style.palette.roof, "#4a4a4a", 0.3), { material: style.materials.roof, collide: true, lod: 2 });
  // big door with X trim, hayloft door
  b.box([0, 5.5, -L / 2 - 0.1], [9, 9, 0.4], mixHex(red, "#000000", 0.25), { material: "WoodPlanks", collide: false, lod: 1 });
  b.box([0, 5.5, -L / 2 - 0.4], [9.4, 0.7, 0.3], white, { material: "Wood", collide: false, lod: 0 });
  b.box([0, 5.5, -L / 2 - 0.4], [0.7, 9, 0.3], white, { material: "Wood", collide: false, lod: 0 });
  for (const s of [-1, 1]) b.box([0, 5.5, -L / 2 - 0.45], [0.6, 12, 0.2], white, { material: "Wood", collide: false, lod: 0, rotation: [0, 0, s * 45] });
  b.box([0, H + 4, -L / 2 - 0.2], [5, 5, 0.4], mixHex(red, "#000000", 0.35), { material: "WoodPlanks", collide: false, lod: 1 });
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) b.box([sx * (W / 2 + 0.05), 7, -L / 3 + (i * L) / 3], [0.3, 3, 3], "#2a3040", { material: "Glass", collide: false, lod: 0 });
  // silo
  b.cylinder([W / 2 + 8, 14, L / 4], 12, 28, "#d8d8d0", { material: METAL, collide: true, lod: 2 });
  b.sphere([W / 2 + 8, 28, L / 4], 12, "#c0c0c8", { material: METAL, collide: true, lod: 1 });
  // hay bales + interior stalls
  for (let i = 0; i < 4; i++) b.cylinder([jitter(rng, 6) - 4, 1.8, jitter(rng, 8)], 3.6, 3, "#d8b860", { material: "Grass", collide: true, lod: 0, rotation: [0, 0, 90] });
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) b.box([sx * 8, 3, -6 + i * 8], [0.5, 4, 6], style.palette.wood, { material: "Wood", collide: true, lod: 0 });
  b.sphere([0, H - 1, 0], 1.4, "#ffd080", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ffd080", brightness: 1.2, range: 32 } });
  return done(b, "barn", variant, ["farm", "building", "interior"], 1.2, 22);
}

/**
 * Cave entrance: a rocky mouth (two boulder piles, a lintel slab, a dark opening facing -Z) with torches
 * and a signpost. The generator carves the tunnel + chamber behind it with terrain ops (`relief.ts`);
 * the opening is 10 studs wide × 9 high so the carved tunnel (radius 6) lines up with it.
 */
export function caveEntrance(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const rock = jitterHex(style.palette.stone, jitter(rng, 4), 0, jitter(rng, 0.05));
  const mat: RobloxMaterial = style.materials.rock;
  const W = 10;
  // boulder piles on both sides of the opening
  for (const sx of [-1, 1]) {
    b.sphere([sx * (W / 2 + 3.2), 3.2, 1], 7.4, rock, { material: mat, collide: true, lod: 2, rotation: [jitter(rng, 20), jitter(rng, 30), jitter(rng, 20)] });
    b.sphere([sx * (W / 2 + 5.5), 6.6, 3.5], 5.6, jitterHex(rock, 0, 0, jitter(rng, 0.05)), { material: mat, collide: true, lod: 1, rotation: [jitter(rng, 20), jitter(rng, 30), jitter(rng, 20)] });
    b.sphere([sx * (W / 2 + 1.5), 8.6, 2.5], 4.4, jitterHex(rock, 0, 0, jitter(rng, 0.05)), { material: mat, collide: true, lod: 1 });
  }
  // lintel slab + capping boulders
  b.box([0, 10.4, 2], [W + 8, 3.2, 7], mixHex(rock, "#000000", 0.08), { material: mat, collide: true, lod: 2, rotation: [jitter(rng, 4), 0, jitter(rng, 3)] });
  b.sphere([-3, 13, 3], 5, rock, { material: mat, collide: true, lod: 1, rotation: [0, jitter(rng, 40), 0] });
  b.sphere([4, 12.6, 2], 4.2, jitterHex(rock, 0, 0, jitter(rng, 0.05)), { material: mat, collide: true, lod: 1 });
  // dark throat: a matte black box set back into the hill (the carved tunnel continues behind it)
  b.box([0, 4.5, 6], [W - 0.5, 9, 8], "#0a0a0c", { material: "SmoothPlastic", collide: false, castShadow: false, lod: 2 });
  // mine-style timber frame on wooden / western / industrial kits
  const timbered = ["medieval_cottage", "timber_frame", "western_facade", "industrial_shed", "shack", "nordic"].includes(style.architecture.style);
  if (timbered) {
    const wood = mixHex(style.palette.wood, "#000000", 0.15);
    for (const sx of [-1, 1]) b.box([sx * (W / 2 - 0.4), 4.4, -1], [1.1, 8.8, 1.1], wood, { material: "Wood", collide: true, lod: 1 });
    b.box([0, 9.1, -1], [W + 0.6, 1.1, 1.1], wood, { material: "Wood", collide: true, lod: 1 });
  }
  // torches
  for (const sx of [-1, 1]) {
    b.cylinder([sx * (W / 2 + 1.2), 5.5, -2.4], 0.45, 3.2, mixHex(style.palette.wood, "#000000", 0.25), { material: "Wood", collide: false, lod: 1, rotation: [-15, 0, 0] });
    b.sphere([sx * (W / 2 + 1.2), 7.4, -2.9], 1.1, "#ffb050", { material: "Neon", collide: false, lod: 1, light: { type: "point", color: "#ffb050", brightness: 1.4, range: 18 }, effect: { kind: "embers", rate: 5, size: 0.7 } });
  }
  // a few loose stones on the apron
  for (let i = 0; i < 4; i++) b.sphere([jitter(rng, W), 0.5, -4 - rng.float(0, 4)], rng.float(1.2, 2.2), rock, { material: mat, collide: true, lod: 0 });
  return done(b, "cave_entrance", variant, ["cave", "rock", "interior"], 1.2, 14);
}
