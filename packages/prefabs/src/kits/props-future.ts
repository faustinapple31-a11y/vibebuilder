import { jitterHex, mixHex, type PrefabVariant, type RobloxMaterial } from "@worldforge/core";
import { PartListBuilder, jitter, type PrefabContext } from "../builder";

/** Sci-fi, cyberpunk and space prop kits. */

const METAL: RobloxMaterial = "Metal";

function done(b: PartListBuilder, prefab: string, variant: number, tags: string[], sink = 0.3): PrefabVariant {
  return b.build({ id: `${prefab}/${variant}`, prefab, category: "prop", sinkDepth: sink, tags });
}

function glow(ctx: PrefabContext): string {
  return ctx.rng.chance(0.6) ? ctx.style.palette.glow : ctx.style.palette.accent;
}

export function sciCrate(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const g = glow(ctx);
  const s = rng.float(3, 4.5);
  b.box([0, s / 2, 0], [s, s, s], "#c8ccd4", { material: METAL, collide: true, lod: 1 });
  for (const sx of [-1, 1]) b.box([sx * (s / 2 + 0.05), s / 2, 0], [0.1, s * 0.15, s * 0.8], g, { material: "Neon", collide: false, lod: 0 });
  b.box([0, s / 2, -(s / 2 + 0.05)], [s * 0.8, s * 0.15, 0.1], g, { material: "Neon", collide: false, lod: 0 });
  b.box([0, s + 0.1, 0], [s * 0.7, 0.2, s * 0.7], "#8a9098", { material: METAL, collide: false, lod: 0 });
  return done(b, "sci_crate", variant, ["scifi", "space"], 0.1);
}

export function hologram(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const g = glow(ctx);
  b.cylinder([0, 0.5, 0], 4, 1, "#8a9098", { material: METAL, collide: true, lod: 1 });
  b.cylinder([0, 1.1, 0], 3.2, 0.2, g, { material: "Neon", collide: false, lod: 0, light: { type: "point", color: g, brightness: 1.5, range: 18 } });
  const kind = rng.int(0, 2);
  b.cylinder([0, 2.4, 0], 1.6, 3, g, { material: "ForceField", collide: false, lod: 1, transparency: 0.6 });
  if (kind === 0) b.sphere([0, 4.5, 0], 4, g, { material: "ForceField", collide: false, lod: 1, transparency: 0.5 });
  else if (kind === 1) b.box([0, 4.5, 0], [5, 3.2, 0.2], g, { material: "ForceField", collide: false, lod: 1, transparency: 0.4, rotation: [0, rng.float(0, 90), 0] });
  else b.cylinder([0, 4.2, 0], 1.6, 6, g, { material: "ForceField", collide: false, lod: 1, transparency: 0.4 });
  b.effect([0, 3, 0], [3, 5, 3], { kind: "sparkle", color: g, rate: 2, size: 0.25 }, { lod: 0 });
  return done(b, "hologram", variant, ["scifi", "cyber", "glow"], 0.1);
}

export function energyPylon(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const g = glow(ctx);
  b.box([0, 1, 0], [5, 2, 5], "#6a7078", { material: METAL, collide: true, lod: 1 });
  b.cylinder([0, 8, 0], 1.6, 12, "#a0a8b0", { material: METAL, collide: true, lod: 2 });
  for (let i = 0; i < 3; i++) b.cylinder([0, 4 + i * 4, 0], 2.6, 0.5, g, { material: "Neon", collide: false, lod: 0 });
  b.sphere([0, 15.5, 0], 3, g, { material: "Neon", collide: false, lod: 1, light: { type: "point", color: g, brightness: 2, range: 40 }, effect: { kind: "sparkle", color: g, rate: 3, size: 0.3 } });
  for (const sx of [-1, 1]) b.box([sx * 2.6, 14, 0], [0.4, 5, 0.4], "#8a9098", { material: METAL, collide: false, lod: 0, rotation: [0, 0, sx * 20] });
  return done(b, "energy_pylon", variant, ["scifi", "space", "glow"], 0.3);
}

export function terminal(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const g = glow(ctx);
  b.box([0, 2.4, 0], [3.2, 4.8, 1.6], "#7a8088", { material: METAL, collide: true, lod: 1 });
  b.box([0, 5, -0.6], [3, 2.2, 0.6], "#3a3a44", { material: METAL, collide: false, lod: 1, rotation: [-25, 0, 0] });
  b.box([0, 5.05, -0.85], [2.6, 1.8, 0.1], g, { material: "Neon", collide: false, lod: 0, rotation: [-25, 0, 0], light: { type: "point", color: g, brightness: 0.8, range: 10 } });
  for (let i = 0; i < 3; i++) b.box([-0.9 + i * 0.9, 1.8, -0.85], [0.4, 0.2, 0.1], i === 1 ? "#ff4040" : g, { material: "Neon", collide: false, lod: 0 });
  return done(b, "terminal", variant, ["scifi", "space", "cyber"], 0.1);
}

export function drone(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const g = glow(ctx);
  const y = rng.float(7, 12);
  b.box([0, y, 0], [2.4, 0.8, 2.4], "#8a9098", { material: METAL, collide: false, lod: 1 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.beam([sx * 1, y, sz * 1], [sx * 2.4, y + 0.2, sz * 2.4], 0.25, 0.25, "#5a6068", { material: METAL, collide: false, lod: 0 });
    b.cylinder([sx * 2.4, y + 0.4, sz * 2.4], 1.8, 0.15, "#c8ccd4", { material: METAL, collide: false, lod: 0, transparency: 0.4 });
  }
  b.sphere([0, y - 0.5, -0.9], 0.6, "#ff4040", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ff4040", brightness: 1, range: 10 } });
  b.cylinder([0, y - 1.2, 0], 0.3, 1.2, g, { material: "Neon", collide: false, lod: 0, transparency: 0.5 });
  return done(b, "drone", variant, ["scifi", "cyber", "floating"], 0);
}

export function hoverPad(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const g = glow(ctx);
  b.cylinder([0, 0.4, 0], 12, 0.8, "#8a9098", { material: METAL, collide: true, lod: 2 });
  b.cylinder([0, 0.85, 0], 11, 0.1, g, { material: "Neon", collide: false, lod: 1, transparency: 0.3 });
  b.cylinder([0, 0.95, 0], 6, 0.1, "#c8ccd4", { material: METAL, collide: false, lod: 0 });
  for (let i = 0; i < 4; i++) b.box([Math.cos((i * Math.PI) / 2) * 6.5, 1.4, Math.sin((i * Math.PI) / 2) * 6.5], [0.8, 1.2, 0.8], g, { material: "Neon", collide: false, lod: 0, light: i === 0 ? { type: "point" as const, color: g, brightness: 1.2, range: 20 } : undefined });
  return done(b, "hover_pad", variant, ["scifi", "space"], 0.6);
}

export function pod(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const g = glow(ctx);
  b.cylinder([0, 3.5, 0], 3.2, 7, "#d8dce4", { material: "SmoothPlastic", collide: true, lod: 2 });
  b.sphere([0, 7, 0], 3.2, "#d8dce4", { material: "SmoothPlastic", collide: false, lod: 1 });
  b.box([0, 4, -1.5], [1.8, 4, 0.3], g, { material: "Glass", collide: false, lod: 1, transparency: 0.4 });
  b.cylinder([0, 0.3, 0], 3.8, 0.6, "#6a7078", { material: METAL, collide: true, lod: 1 });
  b.effect([0, 1, 0], [2, 1, 2], { kind: "mist", color: "#e0f0ff", rate: 1, size: 0.6 }, { lod: 0 });
  return done(b, "sci_pod", variant, ["scifi", "space"], 0.1);
}

// ------------------------------------------------------------------ cyber
export function neonSign(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const cols = [style.palette.glow, style.palette.accent, "#ff3fa0", "#3fd0ff", "#ffe040"];
  const g = cols[rng.int(0, cols.length - 1)]!;
  b.cylinder([0, 5, 0], 0.5, 10, "#3a3a44", { material: METAL, collide: true, lod: 1 });
  const kind = rng.int(0, 2);
  if (kind === 0) {
    b.box([0, 9, -0.6], [6, 2.4, 0.3], "#1a1a22", { material: METAL, collide: false, lod: 1 });
    b.box([0, 9, -0.85], [5.4, 0.35, 0.1], g, { material: "Neon", collide: false, lod: 0, light: { type: "point", color: g, brightness: 2, range: 26 } });
    b.box([0, 9.7, -0.85], [3, 0.3, 0.1], g, { material: "Neon", collide: false, lod: 0 });
    b.box([-1.5, 8.4, -0.85], [2, 0.3, 0.1], g, { material: "Neon", collide: false, lod: 0 });
  } else if (kind === 1) {
    b.cylinder([0, 9.5, -0.6], 4, 0.3, "#1a1a22", { material: METAL, collide: false, lod: 1, rotation: [90, 0, 0] });
    b.cylinder([0, 9.5, -0.85], 3.4, 0.1, g, { material: "Neon", collide: false, lod: 0, rotation: [90, 0, 0], light: { type: "point", color: g, brightness: 2, range: 26 } });
    b.cylinder([0, 9.5, -0.9], 2.4, 0.1, "#1a1a22", { material: METAL, collide: false, lod: 0, rotation: [90, 0, 0] });
  } else {
    for (let i = 0; i < 4; i++) b.box([0, 6 + i * 1.6, -0.6], [1.6, 1.3, 0.2], i % 2 ? g : mixHex(g, "#ffffff", 0.4), { material: "Neon", collide: false, lod: 0, light: i === 1 ? { type: "point" as const, color: g, brightness: 2, range: 24 } : undefined });
  }
  return done(b, "neon_sign", variant, ["cyber", "urban", "light"], 0.2);
}

export function vendingMachine(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const g = glow(ctx);
  b.box([0, 3.5, 0], [3.6, 7, 3], "#2a2a34", { material: METAL, collide: true, lod: 1 });
  b.box([0, 4.2, -1.55], [2.6, 4, 0.15], mixHex(g, "#000000", 0.4), { material: "Glass", collide: false, lod: 1, transparency: 0.2 });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) b.box([-0.8 + c * 0.8, 5.5 - r * 1.2, -1.5], [0.5, 0.8, 0.05], jitterHex(g, r * 40 + c * 20, 0, 0), { material: "Neon", collide: false, lod: 0 });
  b.box([0, 1.3, -1.55], [2.2, 0.8, 0.1], "#1a1a1a", { material: "SmoothPlastic", collide: false, lod: 0 });
  b.box([0, 6.8, -1.55], [3.2, 0.5, 0.1], g, { material: "Neon", collide: false, lod: 0, light: { type: "point", color: g, brightness: 1, range: 12 } });
  return done(b, "vending_machine", variant, ["cyber", "urban"], 0.1);
}

export function holoBillboard(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const g = rng.chance(0.5) ? style.palette.glow : "#ff3fa0";
  for (const sx of [-1, 1]) b.cylinder([sx * 5, 8, 0], 0.8, 16, "#3a3a44", { material: METAL, collide: true, lod: 2 });
  b.box([0, 16.5, 0], [12, 1, 1], "#3a3a44", { material: METAL, collide: true, lod: 1 });
  b.box([0, 21, 0], [14, 8, 0.2], g, { material: "ForceField", collide: false, lod: 2, transparency: 0.35, light: { type: "point", color: g, brightness: 2, range: 40 } });
  b.box([0, 21, -0.2], [12, 6, 0.05], mixHex(g, "#ffffff", 0.5), { material: "Neon", collide: false, lod: 1, transparency: 0.5 });
  b.box([-3, 22, -0.3], [5, 1.4, 0.05], "#ffffff", { material: "Neon", collide: false, lod: 0 });
  b.effect([0, 21, 0], [12, 6, 2], { kind: "sparkle", color: g, rate: 2, size: 0.3 }, { lod: 0 });
  return done(b, "holo_billboard", variant, ["cyber", "urban", "light"], 0.3);
}

export function cablePole(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  b.cylinder([0, 9, 0], 0.9, 18, "#4a4a50", { material: "Concrete", collide: true, lod: 2 });
  b.box([0, 16.5, 0], [6, 0.5, 0.5], "#3a3a40", { material: METAL, collide: false, lod: 1 });
  b.box([0, 14.5, 0], [5, 0.5, 0.5], "#3a3a40", { material: METAL, collide: false, lod: 1 });
  for (let i = 0; i < 3; i++) b.box([-2 + i * 2, 17.1, 0], [0.5, 0.8, 0.5], "#a0a0a8", { material: "Glass", collide: false, lod: 0 });
  b.box([1.5, 12, 0], [2.4, 3, 1.6], "#5a5a60", { material: METAL, collide: false, lod: 1 });
  if (rng.chance(0.6)) b.sphere([1.5, 10.2, 0], 0.5, "#ffe040", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ffe040", brightness: 0.8, range: 12 } });
  // sagging cables (beams) to the side
  for (let i = 0; i < 3; i++) b.beam([-2 + i * 2, 17.3, 0], [-2 + i * 2 + 6, 15.8, 14], 0.15, 0.15, "#1a1a1a", { material: "Plastic", collide: false, lod: 0 });
  return done(b, "cable_pole", variant, ["cyber", "urban", "apocalypse"], 0.4);
}

export function noodleStand(ctx: PrefabContext, variant: number): PrefabVariant {
  const { style } = ctx;
  const b = new PartListBuilder();
  const g = glow(ctx);
  b.box([0, 2.6, 0], [10, 5.2, 4], "#3a3a44", { material: METAL, collide: true, lod: 2 });
  b.box([0, 5.4, -0.5], [10.4, 0.5, 5.4], "#5a4a3a", { material: "Wood", collide: true, lod: 1 });
  b.box([0, 8.8, 0], [11, 0.4, 6], mixHex(style.palette.accent, "#a02020", 0.5), { material: "Fabric", collide: true, lod: 1 });
  for (const sx of [-1, 1]) b.box([sx * 5, 7, 2.5], [0.4, 3.6, 0.4], "#5a4a3a", { material: "Wood", collide: false, lod: 0 });
  for (let i = 0; i < 3; i++) b.sphere([-3 + i * 3, 7.6, -2.8], 1.4, i === 1 ? g : "#ff8a30", { material: "Neon", collide: false, lod: 0, light: i === 1 ? { type: "point" as const, color: g, brightness: 1.2, range: 16 } : undefined });
  b.box([0, 7, -2.3], [6, 1.6, 0.2], g, { material: "Neon", collide: false, lod: 0 });
  b.cylinder([-2, 6, 0.5], 1.6, 1.2, "#8a8a90", { material: METAL, collide: false, lod: 0 });
  b.effect([-2, 7, 0.5], [1, 1.5, 1], { kind: "mist", color: "#f0f0f0", rate: 2, size: 0.6 }, { lod: 0 });
  for (const sx of [-1, 1]) b.cylinder([sx * 2.5, 1.4, -3.5], 1.4, 2.8, "#8a8a90", { material: METAL, collide: true, lod: 0 });
  return done(b, "noodle_stand", variant, ["cyber", "urban", "market"], 0.3);
}

// ------------------------------------------------------------------ space
export function rover(_ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  b.box([0, 2.6, 0], [5.6, 1.6, 8], "#d8dce4", { material: METAL, collide: true, lod: 2 });
  b.box([0, 3.9, 0], [4, 1.2, 5], "#c0c4cc", { material: METAL, collide: false, lod: 1 });
  b.box([0, 4.8, 0], [5, 0.2, 6.5], "#2a3a6a", { material: "Glass", collide: false, lod: 0 }); // solar panel
  b.cylinder([1.5, 6.2, -2], 0.3, 2.6, "#8a9098", { material: METAL, collide: false, lod: 0 });
  b.box([1.5, 7.6, -2], [1.4, 1, 1.4], "#8a9098", { material: METAL, collide: false, lod: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) b.cylinder([sx * 3.1, 1.5, sz * 3], 3, 1.2, "#3a3a40", { material: METAL, collide: true, lod: 1, rotation: [0, 0, 90] });
  return done(b, "rover", variant, ["space", "vehicle"], 0.2);
}

export function antennaDish(_ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  b.box([0, 0.6, 0], [4, 1.2, 4], "#8a9098", { material: METAL, collide: true, lod: 1 });
  b.cylinder([0, 4, 0], 0.8, 6, "#c0c4cc", { material: METAL, collide: true, lod: 1 });
  b.cylinder([0, 8, -1], 7, 0.8, "#e8ecf0", { material: METAL, collide: true, lod: 2, rotation: [-55, 0, 0] });
  b.cylinder([0, 9, -3], 0.3, 4, "#8a9098", { material: METAL, collide: false, lod: 0, rotation: [35, 0, 0] });
  return done(b, "antenna_dish", variant, ["space", "scifi", "military"], 0.2);
}

export function solarPanel(_ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  for (const sx of [-1, 1]) b.box([sx * 3, 1.2, 0], [0.5, 2.4, 0.5], "#8a9098", { material: METAL, collide: true, lod: 1 });
  b.box([0, 3.6, 0], [10, 0.3, 6], "#1a2a5a", { material: "Glass", collide: true, lod: 2, rotation: [-30, 0, 0] });
  for (let i = 0; i < 4; i++) b.box([-3.75 + i * 2.5, 3.65, 0], [0.12, 0.34, 6], "#c0c4cc", { material: METAL, collide: false, lod: 0, rotation: [-30, 0, 0] });
  return done(b, "solar_panel", variant, ["space", "scifi", "industrial"], 0.2);
}

export function oxygenTank(_ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  for (const sx of [-1, 1]) {
    b.cylinder([sx * 1.4, 2.6, 0], 2.2, 5, "#e8ecf0", { material: METAL, collide: true, lod: 1 });
    b.sphere([sx * 1.4, 5.1, 0], 2.2, "#e8ecf0", { material: METAL, collide: false, lod: 0 });
    b.cylinder([sx * 1.4, 6.5, 0], 0.5, 0.8, "#8a9098", { material: METAL, collide: false, lod: 0 });
    b.box([sx * 1.4, 3, -1.15], [1.2, 1.6, 0.1], "#30a0ff", { material: "SmoothPlastic", collide: false, lod: 0 });
  }
  b.box([0, 0.3, 0], [5, 0.6, 3], "#8a9098", { material: METAL, collide: true, lod: 1 });
  return done(b, "oxygen_tank", variant, ["space", "scifi"], 0.1);
}

export function meteorite(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const s = rng.float(3, 6);
  b.sphere([0, s * 0.35, 0], s, "#3a3a3e", { material: "Basalt", collide: true, lod: 2 });
  b.sphere([s * 0.3, s * 0.4, s * 0.2], s * 0.7, "#48484c", { material: "Basalt", collide: false, lod: 1 });
  b.cylinder([0, 0.1, 0], s * 2.4, 0.2, "#5a5a60", { material: "Slate", collide: false, lod: 1 });
  b.sphere([-s * 0.2, s * 0.5, -s * 0.3], s * 0.35, "#ff6a20", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ff6a20", brightness: 1, range: 14 }, effect: { kind: "embers", color: "#ff8040", rate: 1.5, size: 0.25 } });
  return done(b, "meteorite", variant, ["space", "rock"], 0.5);
}

export function flagPole(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  b.cylinder([0, 7, 0], 0.4, 14, "#c0c4cc", { material: METAL, collide: true, lod: 1 });
  b.box([2.2, 12.5, 0], [4.4, 3, 0.15], ctx.style.palette.accent, { material: "Fabric", collide: false, lod: 1 });
  b.box([2.2, 14, 0], [4.4, 0.2, 0.3], "#c0c4cc", { material: METAL, collide: false, lod: 0 });
  b.sphere([0, 14.3, 0], 0.8, "#ffd040", { material: METAL, collide: false, lod: 0 });
  return done(b, "flag_pole", variant, ["space", "military", "sports", "village"], 0.4);
}
