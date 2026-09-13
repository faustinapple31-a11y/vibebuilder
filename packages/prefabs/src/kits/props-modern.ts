import { jitterHex, mixHex, type PrefabVariant, type RobloxMaterial } from "@worldforge/core";
import { PartListBuilder, jitter, type PrefabContext } from "../builder";

/**
 * Modern-era prop kits: urban, suburban, apocalypse, industrial, military.
 * Origin = footprint centre at ground level; the "front" faces -Z where it matters.
 */

const METAL: RobloxMaterial = "Metal";
const CAR_COLORS = ["#c03030", "#3050a0", "#e8e8e8", "#2a2a2e", "#8a8a90", "#d0a020", "#2a7a4a", "#f0f0e8"];

function done(b: PartListBuilder, prefab: string, variant: number, tags: string[], sink = 0.3): PrefabVariant {
  return b.build({ id: `${prefab}/${variant}`, prefab, category: "prop", sinkDepth: sink, tags });
}

/** Sedan / pickup / van body on four wheels. */
export function car(ctx: PrefabContext, variant: number, opts: { wrecked?: boolean; prefabId?: string } = {}): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const kind = rng.int(0, 2); // 0 sedan, 1 pickup, 2 van
  const wrecked = opts.wrecked ?? false;
  let col = CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)]!;
  if (wrecked) col = mixHex(col, "#5a4a40", 0.6);
  const mat: RobloxMaterial = wrecked ? "CorrodedMetal" : "SmoothPlastic";
  const L = kind === 2 ? 15 : 13;
  const W = 6.2;
  const bodyH = kind === 2 ? 3 : 2.4;
  const y0 = 1.6;
  const tilt: [number, number, number] = wrecked ? [jitter(rng, 6), 0, jitter(rng, 10)] : [0, 0, 0];
  b.box([0, y0 + bodyH / 2, 0], [W, bodyH, L], col, { material: mat, collide: true, lod: 2, rotation: tilt });
  // cabin
  const cabL = kind === 1 ? L * 0.35 : kind === 2 ? L * 0.8 : L * 0.5;
  const cabZ = kind === 1 ? -L * 0.15 : kind === 2 ? L * 0.05 : 0;
  b.box([0, y0 + bodyH + 1.2, cabZ], [W * 0.88, 2.4, cabL], col, { material: mat, collide: true, lod: 2, rotation: tilt });
  const glass = wrecked ? "#6a7070" : "#9ac0d8";
  b.box([0, y0 + bodyH + 1.2, cabZ - cabL / 2 - 0.1], [W * 0.8, 1.9, 0.3], glass, { material: "Glass", collide: false, lod: 1, transparency: wrecked ? 0 : 0.3, rotation: [wrecked ? 0 : -18, 0, 0] });
  b.box([0, y0 + bodyH + 1.2, cabZ + cabL / 2 + 0.1], [W * 0.8, 1.9, 0.3], glass, { material: "Glass", collide: false, lod: 1, transparency: 0.3 });
  for (const sx of [-1, 1]) b.box([sx * (W * 0.44 + 0.05), y0 + bodyH + 1.2, cabZ], [0.2, 1.7, cabL * 0.85], glass, { material: "Glass", collide: false, lod: 0, transparency: 0.3 });
  if (kind === 1) b.box([0, y0 + bodyH + 0.5, L * 0.25], [W * 0.9, 1, L * 0.45], mixHex(col, "#000000", 0.35), { material: mat, collide: false, lod: 1 }); // truck bed
  // wheels
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const flat = wrecked && rng.chance(0.4);
    b.cylinder([sx * (W / 2 - 0.4), flat ? 0.9 : 1.3, sz * L * 0.32], flat ? 2.4 : 2.6, 1.2, "#1a1a1a", { material: "Rubber", collide: true, lod: 1, rotation: [0, 0, 90] });
    b.cylinder([sx * (W / 2 - 0.4), flat ? 0.9 : 1.3, sz * L * 0.32], 1.3, 1.3, "#a0a0a8", { material: METAL, collide: false, lod: 0, rotation: [0, 0, 90] });
  }
  // lights
  for (const sx of [-1, 1]) {
    b.box([sx * (W / 2 - 1), y0 + bodyH * 0.7, -L / 2 - 0.05], [1.2, 0.7, 0.2], wrecked ? "#808070" : "#ffffe0", { material: wrecked ? "SmoothPlastic" : "Neon", collide: false, lod: 0 });
    b.box([sx * (W / 2 - 1), y0 + bodyH * 0.7, L / 2 + 0.05], [1.2, 0.6, 0.2], wrecked ? "#603030" : "#ff3030", { material: wrecked ? "SmoothPlastic" : "Neon", collide: false, lod: 0 });
  }
  if (wrecked) {
    // open hood, rust, smoke
    b.box([0, y0 + bodyH + 1.1, -L * 0.36], [W * 0.8, 0.25, L * 0.3], mixHex(col, "#000000", 0.2), { material: "CorrodedMetal", collide: false, lod: 1, rotation: [-40, 0, 0] });
    b.effect([0, y0 + bodyH + 2, -L * 0.3], [3, 3, 3], { kind: "smoke", color: "#404040", rate: 1.5, size: 1.4 }, { lod: 0 });
    for (let i = 0; i < 3; i++) b.box([jitter(rng, W * 0.6), 0.25, L / 2 + rng.float(0.5, 3)], [rng.float(0.6, 1.4), 0.3, rng.float(0.6, 1.4)], "#3a3a3a", { material: "Rubber", collide: false, lod: 0, rotation: [0, rng.float(0, 90), 0] });
  }
  return done(b, opts.prefabId ?? "car", variant, ["vehicle", wrecked ? "wrecked" : "car"], 0.2);
}
export const wreckedCar = (ctx: PrefabContext, v: number): PrefabVariant => car(ctx, v, { wrecked: true, prefabId: "wrecked_car" });

export function streetlight(ctx: PrefabContext, variant: number): PrefabVariant {
  const { style } = ctx;
  const b = new PartListBuilder();
  const col = "#4a4a50";
  b.cylinder([0, 0.4, 0], 1.6, 1.2, col, { material: METAL, collide: true, lod: 1 });
  b.cylinder([0, 8, 0], 0.7, 16, col, { material: METAL, collide: true, lod: 2 });
  b.beam([0, 15.6, 0], [0, 16.4, -5.5], 0.6, 0.6, col, { material: METAL, collide: false, lod: 1 });
  b.box([0, 16.2, -5.6], [1.6, 0.7, 3.2], col, { material: METAL, collide: false, lod: 1 });
  b.box([0, 15.75, -5.6], [1.2, 0.25, 2.6], "#fff4d0", { material: "Neon", collide: false, lod: 1, light: { type: "point", color: "#ffe8b0", brightness: 1.4, range: 34 } });
  void style;
  return done(b, "streetlight", variant, ["urban", "light"]);
}

export function trafficLight(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const col = "#3a3a40";
  b.cylinder([0, 7, 0], 0.7, 14, col, { material: METAL, collide: true, lod: 2 });
  b.beam([0, 13.6, 0], [0, 13.6, -7], 0.6, 0.6, col, { material: METAL, collide: false, lod: 1 });
  b.box([0, 12.2, -6.2], [1.6, 4.4, 1.6], "#2a2a2e", { material: METAL, collide: false, lod: 1 });
  const on = ctx.rng.int(0, 2);
  const cols = ["#ff3030", "#ffc020", "#30d060"];
  for (let i = 0; i < 3; i++) b.cylinder([0, 13.6 - i * 1.4, -7.05], 0.9, 0.3, on === i ? cols[i]! : mixHex(cols[i]!, "#000000", 0.6), { material: on === i ? "Neon" : "SmoothPlastic", collide: false, lod: 0, rotation: [90, 0, 0] });
  return done(b, "traffic_light", variant, ["urban"]);
}

export function trashCan(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const col = ctx.rng.chance(0.5) ? "#2a5a2a" : "#4a4a50";
  b.cylinder([0, 1.8, 0], 2.4, 3.6, col, { material: METAL, collide: true, lod: 1 });
  b.cylinder([0, 3.75, 0], 2.7, 0.4, mixHex(col, "#000000", 0.3), { material: METAL, collide: false, lod: 0 });
  b.box([0, 4.1, 0], [1.2, 0.5, 1.2], "#e8e8e0", { material: "SmoothPlastic", collide: false, lod: 0 });
  return done(b, "trash_can", variant, ["urban"]);
}

export function busStop(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const frame = "#3a3a40";
  b.box([0, 0.2, 0], [12, 0.4, 5], "#8a8a88", { material: "Concrete", collide: true, lod: 1 });
  for (const sx of [-1, 1]) b.box([sx * 5.6, 4.2, 2], [0.5, 8, 0.5], frame, { material: METAL, collide: true, lod: 1 });
  b.box([0, 8.3, 0.5], [12.4, 0.5, 5.5], frame, { material: METAL, collide: true, lod: 1 });
  b.box([0, 4.2, 2.3], [11.2, 7.6, 0.25], "#a0c8e0", { material: "Glass", collide: true, lod: 1, transparency: 0.4 });
  b.box([0, 2.0, 1.4], [9, 0.4, 1.6], "#5a4a3a", { material: "Wood", collide: true, lod: 0 });
  for (const sx of [-1, 1]) b.box([sx * 4, 1, 1.4], [0.4, 2, 1.4], frame, { material: METAL, collide: false, lod: 0 });
  b.box([-4.5, 5.6, 2.1], [2.4, 3, 0.15], ctx.style.palette.accent, { material: "SmoothPlastic", collide: false, lod: 0 });
  return done(b, "bus_stop", variant, ["urban"]);
}

export function fireHydrant(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const col = ctx.rng.chance(0.7) ? "#d02020" : "#e0c020";
  b.cylinder([0, 1.4, 0], 1.3, 2.8, col, { material: METAL, collide: true, lod: 1 });
  b.sphere([0, 2.9, 0], 1.4, col, { material: METAL, collide: false, lod: 0 });
  for (const sx of [-1, 1]) b.cylinder([sx * 0.9, 1.6, 0], 0.7, 0.8, col, { material: METAL, collide: false, lod: 0, rotation: [0, 0, 90] });
  return done(b, "fire_hydrant", variant, ["urban"]);
}

export function dumpster(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const col = ctx.rng.chance(0.5) ? "#2a5a3a" : "#3a4a6a";
  b.box([0, 2.6, 0], [8, 4.6, 4.4], col, { material: "CorrodedMetal", collide: true, lod: 2 });
  b.box([0, 5.1, -0.4], [8.2, 0.5, 3.8], mixHex(col, "#000000", 0.25), { material: METAL, collide: false, lod: 1, rotation: [ctx.rng.chance(0.5) ? -25 : 0, 0, 0] });
  for (const sx of [-1, 1]) b.cylinder([sx * 3.4, 0.5, 0], 1, 0.6, "#1a1a1a", { material: "Rubber", collide: false, lod: 0 });
  b.box([2, 5.6, 0.6], [1.8, 1.2, 1.2], "#1a1a1a", { material: "Plastic", collide: false, lod: 0 });
  return done(b, "dumpster", variant, ["urban", "industrial"]);
}

export function roadBarrier(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const jersey = ctx.rng.chance(0.5);
  if (jersey) {
    b.box([0, 1.4, 0], [8, 2.8, 1.6], "#c8c8c0", { material: "Concrete", collide: true, lod: 2 });
    b.wedge([0, 0.6, -1.1], [8, 1.2, 0.6], "#c8c8c0", { material: "Concrete", collide: false, lod: 1 });
    b.wedge([0, 0.6, 1.1], [8, 1.2, 0.6], "#c8c8c0", { material: "Concrete", collide: false, lod: 1, rotation: [0, 180, 0] });
  } else {
    for (const sx of [-1, 1]) b.box([sx * 3.4, 1.6, 0], [0.5, 3.2, 1.6], "#3a3a40", { material: METAL, collide: true, lod: 1 });
    b.box([0, 2.6, 0], [8, 0.9, 0.3], "#ffffff", { material: "SmoothPlastic", collide: true, lod: 1 });
    for (let i = 0; i < 4; i++) b.box([-3 + i * 2, 2.6, 0.02], [0.9, 0.9, 0.3], "#ff7a20", { material: "Neon", collide: false, lod: 0 });
    b.box([0, 1.4, 0], [8, 0.6, 0.3], "#ffffff", { material: "SmoothPlastic", collide: false, lod: 0 });
  }
  return done(b, "road_barrier", variant, ["urban", "military"]);
}

export function trafficCone(_ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  b.box([0, 0.15, 0], [1.6, 0.3, 1.6], "#2a2a2a", { material: "Rubber", collide: true, lod: 1 });
  b.cylinder([0, 1.2, 0], 1.0, 2.2, "#ff7020", { material: "SmoothPlastic", collide: true, lod: 1 });
  b.cylinder([0, 1.5, 0], 0.85, 0.3, "#ffffff", { material: "SmoothPlastic", collide: false, lod: 0 });
  return done(b, "traffic_cone", variant, ["urban"], 0.1);
}

export function billboard(ctx: PrefabContext, variant: number): PrefabVariant {
  const { style, rng } = ctx;
  const b = new PartListBuilder();
  for (const sx of [-1, 1]) b.cylinder([sx * 4, 6, 0], 0.8, 12, "#4a4a50", { material: METAL, collide: true, lod: 2 });
  b.box([0, 15, 0], [18, 8, 0.8], "#e8e8e0", { material: "SmoothPlastic", collide: true, lod: 2 });
  const tint = rng.chance(0.5) ? style.palette.accent : style.palette.glow;
  b.box([0, 15, -0.5], [16.5, 6.5, 0.2], mixHex(tint, "#ffffff", 0.3), { material: "SmoothPlastic", collide: false, lod: 1 });
  b.box([-3, 15.5, -0.65], [7, 2, 0.1], "#ffffff", { material: "SmoothPlastic", collide: false, lod: 0 });
  b.box([0, 19.3, -0.6], [18, 0.5, 1.4], "#4a4a50", { material: METAL, collide: false, lod: 0 });
  for (let i = -1; i <= 1; i++) b.box([i * 6, 19.2, -1.1], [1, 0.5, 0.5], "#fff4d0", { material: "Neon", collide: false, lod: 0, light: i === 0 ? { type: "point" as const, color: "#fff0c0", brightness: 1, range: 20 } : undefined });
  return done(b, "billboard", variant, ["urban"]);
}

export function planter(ctx: PrefabContext, variant: number): PrefabVariant {
  const { style, rng } = ctx;
  const b = new PartListBuilder();
  b.box([0, 1, 0], [5, 2, 2.4], "#8a8a88", { material: "Concrete", collide: true, lod: 1 });
  b.box([0, 2.1, 0], [4.6, 0.3, 2], "#4a3a2a", { material: "Ground", collide: false, lod: 0 });
  for (let i = 0; i < 4; i++) b.sphere([-1.6 + i * 1.05, 2.9, jitter(rng, 0.4)], rng.float(1.2, 1.8), jitterHex(style.palette.foliageAlt, jitter(rng, 10), 0, 0), { material: "Grass", collide: false, lod: 0 });
  return done(b, "planter", variant, ["urban"]);
}

export function mailbox(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  b.box([0, 2, 0], [0.5, 4, 0.5], "#5a4030", { material: "Wood", collide: true, lod: 1 });
  b.box([0, 4.5, 0], [1.4, 1.2, 2.4], ctx.rng.chance(0.5) ? "#2a2a2e" : "#d0d0d8", { material: METAL, collide: true, lod: 1 });
  b.cylinder([0, 5.1, 0], 1.4, 2.4, ctx.rng.chance(0.5) ? "#2a2a2e" : "#d0d0d8", { material: METAL, collide: false, lod: 0, rotation: [90, 0, 0] });
  b.box([0.8, 4.9, -0.6], [0.15, 1, 0.3], "#d02020", { material: "SmoothPlastic", collide: false, lod: 0 });
  return done(b, "mailbox", variant, ["suburban"], 0.2);
}

export function picketFence(_ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const n = 8;
  for (let i = 0; i < n; i++) {
    const x = -7 + i * 2;
    b.box([x, 1.6, 0], [0.7, 3.2, 0.3], "#f4f4f0", { material: "Wood", collide: false, lod: 1 });
    b.wedge([x, 3.45, 0], [0.7, 0.5, 0.3], "#f4f4f0", { material: "Wood", collide: false, lod: 0 });
  }
  b.box([0, 1, 0], [16, 0.4, 0.3], "#f4f4f0", { material: "Wood", collide: true, lod: 2 });
  b.box([0, 2.4, 0], [16, 0.4, 0.3], "#f4f4f0", { material: "Wood", collide: true, lod: 2 });
  return done(b, "picket_fence", variant, ["suburban", "wall"], 0.4);
}

export function picnicTable(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const col = jitterHex("#9a7a50", 0, 0, jitter(ctx.rng, 0.08));
  b.box([0, 2.6, 0], [6, 0.35, 2.8], col, { material: "WoodPlanks", collide: true, lod: 1 });
  for (const sz of [-1, 1]) b.box([0, 1.5, sz * 2.4], [6, 0.3, 1.2], col, { material: "WoodPlanks", collide: true, lod: 1 });
  for (const sx of [-1, 1]) {
    b.box([sx * 2, 1.3, -1.2], [0.4, 2.6, 0.4], col, { material: "Wood", collide: false, lod: 0, rotation: [25, 0, 0] });
    b.box([sx * 2, 1.3, 1.2], [0.4, 2.6, 0.4], col, { material: "Wood", collide: false, lod: 0, rotation: [-25, 0, 0] });
  }
  return done(b, "picnic_table", variant, ["suburban", "camp"], 0.2);
}

export function bbqGrill(_ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  b.cylinder([0, 2.2, 0], 3, 1.6, "#2a2a2e", { material: METAL, collide: true, lod: 1 });
  b.sphere([0, 1.9, 0], 3, "#2a2a2e", { material: METAL, collide: false, lod: 1 });
  b.cylinder([0, 3.05, 0], 2.8, 0.15, "#8a8a90", { material: "DiamondPlate", collide: false, lod: 0 });
  for (const sx of [-1, 1]) b.cylinder([sx * 0.9, 0.9, 0], 0.25, 1.8, "#8a8a90", { material: METAL, collide: false, lod: 0 });
  b.cylinder([1.8, 2.2, 0], 0.3, 1.6, "#5a4030", { material: "Wood", collide: false, lod: 0, rotation: [0, 0, 90] });
  b.effect([0, 3.6, 0], [1.5, 1.5, 1.5], { kind: "smoke", color: "#b0b0b0", rate: 1, size: 0.8 }, { lod: 0 });
  return done(b, "bbq_grill", variant, ["suburban"], 0.1);
}

export function basketballHoop(_ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  b.cylinder([0, 6, 1.5], 0.6, 12, "#4a4a50", { material: METAL, collide: true, lod: 1 });
  b.box([0, 11.5, 0], [7, 5, 0.3], "#f4f4f0", { material: "SmoothPlastic", collide: true, lod: 1 });
  b.box([0, 10.6, -0.2], [2.6, 2, 0.1], "#d03030", { material: "SmoothPlastic", collide: false, lod: 0 });
  b.cylinder([0, 9.6, -1.5], 2.6, 0.2, "#ff6a20", { material: METAL, collide: false, lod: 0 });
  b.cylinder([0, 8.8, -1.5], 2.2, 1.6, "#ffffff", { material: "Fabric", collide: false, lod: 0, transparency: 0.4 });
  return done(b, "basketball_hoop", variant, ["suburban", "sports", "playground"]);
}

export function gardenShed(ctx: PrefabContext, variant: number): PrefabVariant {
  const { style } = ctx;
  const b = new PartListBuilder();
  b.box([0, 3.5, 0], [8, 7, 6], mixHex(style.palette.wall, "#6a8a5a", 0.4), { material: "WoodPlanks", collide: true, lod: 2 });
  b.gableRoof([0, 8.2, 0], 9, 7, 2.4, mixHex(style.palette.roof, "#4a4a4a", 0.3), { material: "Slate", collide: true, lod: 2 });
  b.box([0, 2.8, -3.05], [2.6, 5.4, 0.2], "#5a4030", { material: "Wood", collide: false, lod: 1 });
  b.box([2.5, 4.5, -3.05], [1.6, 1.4, 0.2], "#9ac0d8", { material: "Glass", collide: false, lod: 0 });
  return done(b, "garden_shed", variant, ["suburban", "farm"], 0.6);
}

// ------------------------------------------------------------------ apocalypse
export function barricade(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const sandbags = rng.chance(0.5);
  if (sandbags) {
    for (let row = 0; row < 3; row++) for (let i = 0; i < 6 - row; i++) {
      b.cylinder([-5 + row * 1 + i * 2, 0.7 + row * 1.2, jitter(rng, 0.3)], 1.3, 2.2, jitterHex("#8a7a5a", 0, 0, jitter(rng, 0.08)), { material: "Fabric", collide: true, lod: 1, rotation: [0, 0, 90] });
    }
  } else {
    for (let i = 0; i < 5; i++) b.box([-4 + i * 2, 2, jitter(rng, 0.4)], [1.6, rng.float(3, 4.5), 0.35], jitterHex("#7a6a50", 0, 0, jitter(rng, 0.1)), { material: "WoodPlanks", collide: true, lod: 1, rotation: [0, jitter(rng, 6), jitter(rng, 8)] });
    b.box([0, 3.2, -0.3], [11, 0.5, 0.3], "#5a4a3a", { material: "Wood", collide: false, lod: 0, rotation: [0, 0, 4] });
    b.box([0, 1.4, 0.3], [11, 0.5, 0.3], "#5a4a3a", { material: "Wood", collide: false, lod: 0, rotation: [0, 0, -3] });
  }
  // barbed wire coil on top
  b.cylinder([0, sandbags ? 4.4 : 4.8, 0], 1.4, 10, "#6a6a70", { material: "CorrodedMetal", collide: false, lod: 0, transparency: 0.5, rotation: [0, 0, 90] });
  return done(b, "barricade", variant, ["apocalypse", "military", "wall"], 0.4);
}

export function tirePile(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const n = rng.int(4, 7);
  for (let i = 0; i < n; i++) {
    const stacked = i < 3;
    b.cylinder(stacked ? [0, 0.5 + i * 0.9, 0] : [jitter(rng, 2.5), 0.5, jitter(rng, 2.5)], 2.6, 0.9, "#1e1e1e", { material: "Rubber", collide: true, lod: 1, rotation: stacked ? [0, 0, 0] : [rng.float(0, 90), rng.float(0, 180), 0] });
  }
  return done(b, "tire_pile", variant, ["apocalypse", "industrial"], 0.2);
}

export function rubblePile(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  b.box([0, 0.8, 0], [7, 1.6, 6], mixHex(style.palette.stone, "#8a8a80", 0.5), { material: "Concrete", collide: true, lod: 2, rotation: [jitter(rng, 5), rng.float(0, 90), jitter(rng, 5)] });
  for (let i = 0; i < 7; i++) b.box([jitter(rng, 3), 1.6 + rng.float(0, 1.2), jitter(rng, 2.5)], [rng.float(1, 2.6), rng.float(0.5, 1.4), rng.float(1, 2.4)], jitterHex(i % 2 ? "#8a8a80" : "#a06a58", 0, 0, jitter(rng, 0.08)), { material: i % 2 ? "Concrete" : "Brick", collide: true, lod: 1, rotation: [jitter(rng, 25), rng.float(0, 90), jitter(rng, 25)] });
  b.cylinder([jitter(rng, 2), 2.4, jitter(rng, 2)], 0.3, 4, "#5a4a40", { material: "CorrodedMetal", collide: false, lod: 0, rotation: [jitter(rng, 40), 0, 60] });
  return done(b, "rubble_pile", variant, ["apocalypse", "ruins"], 0.6);
}

export function burningBarrel(_ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  b.cylinder([0, 1.7, 0], 2.4, 3.4, "#4a3a30", { material: "CorrodedMetal", collide: true, lod: 1 });
  b.cylinder([0, 3.3, 0], 2.2, 0.3, "#1a1410", { material: "Slate", collide: false, lod: 0 });
  b.sphere([0, 3.9, 0], 1.6, "#ff8a30", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ff9040", brightness: 2, range: 26 }, effect: { kind: "embers", color: "#ff9040", rate: 3, size: 0.3 } });
  b.effect([0, 5, 0], [2, 3, 2], { kind: "smoke", color: "#303030", rate: 1.5, size: 1.2 }, { lod: 0 });
  return done(b, "burning_barrel", variant, ["apocalypse", "camp", "light"], 0.2);
}

export function warningSign(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  b.cylinder([0, 3.5, 0], 0.35, 7, "#6a6a70", { material: "CorrodedMetal", collide: true, lod: 1 });
  const kinds = ["#e8c020", "#d03030", "#e8e8e0"];
  const col = kinds[ctx.rng.int(0, 2)]!;
  b.box([0, 7.4, 0], [3.4, 3.4, 0.2], col, { material: "SmoothPlastic", collide: false, lod: 1, rotation: [0, 0, col === "#e8c020" ? 45 : 0] });
  b.box([0, 7.4, -0.12], [1.8, 1.8, 0.05], "#1a1a1a", { material: "SmoothPlastic", collide: false, lod: 0 });
  return done(b, "warning_sign", variant, ["apocalypse", "military", "industrial"], 0.2);
}

export function supplyCrate(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const col = ctx.rng.chance(0.5) ? "#5a6a4a" : "#8a7a50";
  b.box([0, 1.6, 0], [4, 3.2, 3], col, { material: "Wood", collide: true, lod: 1 });
  b.box([0, 1.6, 0], [4.2, 0.5, 3.2], mixHex(col, "#000000", 0.35), { material: METAL, collide: false, lod: 0 });
  b.box([0, 1.6, 0], [0.5, 3.4, 3.2], mixHex(col, "#000000", 0.35), { material: METAL, collide: false, lod: 0 });
  b.box([0, 2.2, -1.55], [1.6, 1, 0.1], "#e0e0d8", { material: "SmoothPlastic", collide: false, lod: 0 });
  return done(b, "supply_crate", variant, ["apocalypse", "military", "camp"], 0.2);
}

// ------------------------------------------------------------------ industrial
export function shippingContainer(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const cols = ["#c04030", "#2a5a8a", "#3a7a4a", "#d0a020", "#6a6a70", "#c8c8c0"];
  const col = cols[rng.int(0, cols.length - 1)]!;
  const L = 24;
  b.box([0, 4.8, 0], [9, 9.6, L], col, { material: "CorrodedMetal", collide: true, lod: 2 });
  for (let i = 0; i < 6; i++) b.box([0, 4.8, -L / 2 + 2 + i * 4], [9.3, 9, 0.6], mixHex(col, "#000000", 0.15), { material: METAL, collide: false, lod: 0 });
  for (const sx of [-1, 1]) b.box([sx * 4.55, 4.8, -L / 2 - 0.1], [0.4, 9, 0.4], mixHex(col, "#000000", 0.3), { material: METAL, collide: false, lod: 0 });
  b.box([0, 7.5, -L / 2 - 0.2], [4, 1.2, 0.1], "#f0f0e8", { material: "SmoothPlastic", collide: false, lod: 0 });
  return done(b, "shipping_container", variant, ["industrial", "docks", "military"], 0.3);
}

export function storageTank(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const col = ctx.rng.chance(0.5) ? "#c8c8c0" : "#8a8a88";
  b.cylinder([0, 8, 0], 14, 16, col, { material: METAL, collide: true, lod: 2 });
  b.cylinder([0, 16.3, 0], 14.4, 0.6, mixHex(col, "#000000", 0.2), { material: METAL, collide: true, lod: 1 });
  b.cylinder([0, 0.3, 0], 15, 0.6, "#5a5a58", { material: "Concrete", collide: true, lod: 1 });
  // ladder + pipe
  b.box([7.2, 8, 0], [0.4, 16, 1.4], "#4a4a50", { material: METAL, collide: false, lod: 1 });
  b.cylinder([-7.6, 3, 0], 1, 6, "#6a6a70", { material: METAL, collide: false, lod: 1 });
  b.cylinder([-9, 1, 0], 1, 4, "#6a6a70", { material: METAL, collide: false, lod: 1, rotation: [0, 0, 90] });
  b.box([0, 9, -7.05], [5, 2, 0.2], "#d03030", { material: "SmoothPlastic", collide: false, lod: 0 });
  return done(b, "storage_tank", variant, ["industrial"], 0.4);
}

export function pipeRun(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const col = rng.chance(0.5) ? "#7a7a80" : "#a06a40";
  const L = 20;
  b.cylinder([0, 5, 0], 1.8, L, col, { material: METAL, collide: true, lod: 2, rotation: [90, 0, 0] });
  b.cylinder([2.4, 4.4, 0], 1.2, L, mixHex(col, "#ffffff", 0.2), { material: METAL, collide: true, lod: 2, rotation: [90, 0, 0] });
  for (let i = 0; i < 3; i++) {
    const z = -L / 2 + 3 + i * 7;
    b.box([1.2, 2.2, z], [4.4, 4.4, 0.6], "#4a4a50", { material: METAL, collide: true, lod: 1 });
    b.cylinder([0, 5, z], 2.3, 0.8, mixHex(col, "#000000", 0.2), { material: METAL, collide: false, lod: 0, rotation: [90, 0, 0] });
  }
  b.cylinder([0, 5, L / 2], 1.8, 1, col, { material: METAL, collide: false, lod: 0, rotation: [90, 0, 0] });
  if (rng.chance(0.5)) b.effect([2.4, 5.5, -L / 4], [1, 1.5, 1], { kind: "mist", color: "#e0e0e0", rate: 2, size: 0.6 }, { lod: 0 });
  return done(b, "pipe_run", variant, ["industrial", "scifi"], 0.3);
}

export function palletStack(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const n = rng.int(2, 5);
  for (let i = 0; i < n; i++) {
    const col = jitterHex("#b09060", 0, 0, jitter(rng, 0.08));
    b.box([jitter(rng, 0.3), 0.3 + i * 0.7, jitter(rng, 0.3)], [4.4, 0.35, 4.4], col, { material: "WoodPlanks", collide: true, lod: 1, rotation: [0, jitter(rng, 8), 0] });
    for (const sx of [-1, 0, 1]) b.box([sx * 1.9, 0.6 + i * 0.7, 0], [0.5, 0.35, 4.4], mixHex(col, "#000000", 0.2), { material: "Wood", collide: false, lod: 0 });
  }
  return done(b, "pallet_stack", variant, ["industrial", "docks"], 0.1);
}

export function forklift(_ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  b.box([0, 2.2, 0.5], [4.6, 2.4, 6], "#e8b020", { material: "SmoothPlastic", collide: true, lod: 2 });
  b.box([0, 4.6, 1.5], [4.2, 2.4, 3.2], "#2a2a2e", { material: METAL, collide: true, lod: 1, transparency: 0.2 });
  for (const sx of [-1, 1]) b.box([sx * 2.1, 5.8, 0], [0.4, 6, 0.4], "#2a2a2e", { material: METAL, collide: false, lod: 1 });
  for (const sx of [-1, 1]) b.box([sx * 1.5, 5.5, -2.9], [0.4, 8, 0.6], "#4a4a50", { material: METAL, collide: true, lod: 1 });
  for (const sx of [-1, 1]) b.box([sx * 1.1, 0.5, -5], [0.6, 0.3, 5], "#4a4a50", { material: METAL, collide: true, lod: 1 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cylinder([sx * 2.2, 1, sz * 2], 2, 1, "#1a1a1a", { material: "Rubber", collide: true, lod: 1, rotation: [0, 0, 90] });
  return done(b, "forklift", variant, ["industrial", "vehicle"], 0.2);
}

// ------------------------------------------------------------------ military
export function sandbagWall(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) b.cylinder([-5 + i * 2 + (row % 2) * 1, 0.6 + row * 1.1, jitter(rng, 0.2)], 1.3, 2.2, jitterHex("#7a7a5a", 0, 0, jitter(rng, 0.08)), { material: "Fabric", collide: true, lod: 1, rotation: [0, 0, 90] });
  return done(b, "sandbag_wall", variant, ["military", "wall"], 0.3);
}

export function tankTrap(_ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const col = "#5a5a58";
  b.box([0, 2, 0], [0.7, 5.6, 0.7], col, { material: "CorrodedMetal", collide: true, lod: 1, rotation: [0, 0, 35] });
  b.box([0, 2, 0], [0.7, 5.6, 0.7], col, { material: "CorrodedMetal", collide: true, lod: 1, rotation: [35, 0, -35] });
  b.box([0, 2, 0], [0.7, 5.6, 0.7], col, { material: "CorrodedMetal", collide: true, lod: 1, rotation: [-35, 90, 35] });
  return done(b, "tank_trap", variant, ["military", "apocalypse"], 0.3);
}

export function jeep(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const col = ctx.rng.chance(0.6) ? "#4a5a3a" : "#8a7a50";
  b.box([0, 2.4, 0], [6.4, 2.6, 12], col, { material: METAL, collide: true, lod: 2 });
  b.box([0, 4.6, 1.5], [6, 2, 6], col, { material: "Fabric", collide: true, lod: 1 });
  b.box([0, 4.4, -1.8], [5.6, 1.6, 0.3], "#9ac0d8", { material: "Glass", collide: false, lod: 1, transparency: 0.3, rotation: [-15, 0, 0] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cylinder([sx * 2.9, 1.4, sz * 3.8], 2.8, 1.4, "#1a1a1a", { material: "Rubber", collide: true, lod: 1, rotation: [0, 0, 90] });
  b.cylinder([-3.4, 3.2, 5.2], 2.4, 0.9, "#1a1a1a", { material: "Rubber", collide: false, lod: 0, rotation: [90, 0, 0] });
  b.box([0, 3.6, -5.9], [5.8, 0.5, 0.3], "#3a3a3a", { material: METAL, collide: false, lod: 0 });
  b.box([0, 4, 0], [0.4, 0.4, 1.4], "#2a2a2e", { material: METAL, collide: false, lod: 0 }); // mounted gun mount
  return done(b, "jeep", variant, ["military", "vehicle"], 0.2);
}

export function radarDish(_ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  b.box([0, 1, 0], [6, 2, 6], "#6a6a68", { material: "Concrete", collide: true, lod: 1 });
  b.cylinder([0, 5, 0], 1.4, 6, "#8a8a90", { material: METAL, collide: true, lod: 1 });
  b.cylinder([0, 9.5, -1.5], 9, 1.2, "#d8d8d0", { material: METAL, collide: true, lod: 2, rotation: [-40, 0, 0] });
  b.cylinder([0, 10.5, -3.6], 0.4, 5, "#4a4a50", { material: METAL, collide: false, lod: 0, rotation: [50, 0, 0] });
  b.sphere([0, 12.2, -5.5], 0.9, "#ff4040", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ff4040", brightness: 0.8, range: 10 } });
  return done(b, "radar_dish", variant, ["military", "space", "scifi"], 0.3);
}

export function militaryTent(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const col = ctx.rng.chance(0.6) ? "#4a5a3a" : "#8a7a50";
  b.box([0, 3, 0], [12, 6, 16], col, { material: "Fabric", collide: true, lod: 2 });
  b.gableRoof([0, 7.2, 0], 13.5, 17, 2.4, mixHex(col, "#000000", 0.1), { material: "Fabric", collide: true, lod: 2 });
  b.box([0, 2.8, -8.05], [3.6, 5.6, 0.2], mixHex(col, "#000000", 0.4), { material: "Fabric", collide: false, lod: 1 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.beam([sx * 6.5, 6, sz * 8.5], [sx * 9, 0, sz * 11], 0.2, 0.2, "#5a5a50", { material: METAL, collide: false, lod: 0 });
  return done(b, "military_tent", variant, ["military", "camp"], 0.4);
}

export function ammoCrate(_ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  b.box([0, 0.9, 0], [3.6, 1.8, 2], "#4a5a3a", { material: METAL, collide: true, lod: 1 });
  b.box([0, 1.85, 0], [3.7, 0.2, 2.1], "#3a4a2a", { material: METAL, collide: false, lod: 0 });
  b.box([0, 1.1, -1.05], [1.6, 0.6, 0.05], "#e8c020", { material: "SmoothPlastic", collide: false, lod: 0 });
  b.box([0, 2.4, 0.4], [3.6, 1.6, 1.4], "#4a5a3a", { material: METAL, collide: true, lod: 0 });
  return done(b, "ammo_crate", variant, ["military", "camp"], 0.1);
}
