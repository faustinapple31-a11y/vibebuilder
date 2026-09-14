import { jitterHex, mixHex, lightenHex, type PrefabVariant, type RobloxMaterial, type WallKit } from "@worldforge/core";
import { PartListBuilder, jitter, type PrefabContext } from "../builder";

/**
 * Settlement ring walls: one straight segment (`WALL_SEGMENT` studs along X, outside = -Z) and a
 * gate tower per wall kit. The dressing stage places segments on a circle around the main
 * settlement and swaps the segments crossed by a road for a pair of gate towers.
 */
export const WALL_SEGMENT = 14;
const L = WALL_SEGMENT;

function done(b: PartListBuilder, prefab: string, variant: number, tags: string[], sink: number, footprint: number): PrefabVariant {
  return b.build({ id: `${prefab}/${variant}`, prefab, category: "prop", sinkDepth: sink, footprintRadius: footprint, tags });
}

function kitOf(ctx: PrefabContext): WallKit {
  const k = ctx.style.environment.walls;
  return k === "none" ? "stone_crenellated" : k;
}

const stoneColor = (ctx: PrefabContext) => jitterHex(ctx.style.palette.stone, jitter(ctx.rng, 4), 0, jitter(ctx.rng, 0.05));
const woodColor = (ctx: PrefabContext) => jitterHex(ctx.style.palette.wood, jitter(ctx.rng, 5), 0, jitter(ctx.rng, 0.06));

export function townWall(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const kit = kitOf(ctx);
  const tags = ["wall", "settlement_wall"];
  switch (kit) {
    case "stone_crenellated": {
      const c = stoneColor(ctx);
      const mat = style.materials.stoneWall;
      const h = 9;
      b.box([0, h / 2 - 0.6, 0], [L + 0.2, h + 1.2, 2.6], c, { material: mat, collide: true, lod: 2 });
      // walkway ledge (inside) + merlons (outside)
      b.box([0, h + 0.15, 0.9], [L + 0.2, 0.5, 1.4], mixHex(c, "#000000", 0.1), { material: mat, collide: true, lod: 1 });
      b.box([0, h + 0.9, 1.35], [L + 0.2, 1.4, 0.4], mixHex(c, "#000000", 0.15), { material: mat, collide: true, lod: 1 });
      for (let i = 0; i < 4; i++) b.box([-L / 2 + 1.9 + i * 3.4, h + 1.2, -0.9], [1.8, 2.2, 0.9], jitterHex(c, 0, 0, jitter(rng, 0.05)), { material: mat, collide: true, lod: 1 });
      b.box([0, h + 0.4, -0.9], [L + 0.2, 0.7, 0.9], c, { material: mat, collide: true, lod: 1 });
      if (rng.chance(style.rock.mossChance)) b.box([jitter(rng, L * 0.3), 2.2, -1.35], [rng.float(3, 5), 3.4, 0.2], style.palette.foliageAlt, { material: "Grass", collide: false, castShadow: false, lod: 0 });
      return done(b, "town_wall", variant, tags, 1.2, L / 2);
    }
    case "palisade": {
      const c = woodColor(ctx);
      const n = 9;
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + 0.8 + i * (L - 1.6) / (n - 1);
        const h = rng.float(7.2, 8.4);
        b.cylinder([x, h / 2 - 0.6, 0], 1.55, h + 1.2, jitterHex(c, 0, 0, jitter(rng, 0.06)), { material: "Wood", collide: true, lod: i % 2 === 0 ? 2 : 1 });
        b.cylinder([x, h + 0.55, 0], 0.9, 1.1, mixHex(c, "#000000", 0.25), { material: "Wood", collide: false, lod: 0 });
      }
      b.box([0, 5.2, 0.95], [L, 0.7, 0.4], mixHex(c, "#000000", 0.15), { material: "WoodPlanks", collide: false, lod: 1 });
      b.box([0, 2.4, 0.95], [L, 0.7, 0.4], mixHex(c, "#000000", 0.15), { material: "WoodPlanks", collide: false, lod: 1 });
      return done(b, "town_wall", variant, tags, 1.2, L / 2);
    }
    case "sandbags": {
      const c = "#8f8460";
      const rows = 4;
      for (let r = 0; r < rows; r++) {
        const n = 7;
        for (let i = 0; i < n; i++) {
          const x = -L / 2 + 1 + i * 2 + (r % 2) * 1;
          if (x > L / 2 - 0.8) continue;
          b.box([x, 0.5 + r * 0.9, jitter(rng, 0.15)], [2.1, 1.0, 2.2], jitterHex(c, jitter(rng, 3), 0, jitter(rng, 0.06)), { material: "Fabric", collide: true, lod: r === 0 || r === rows - 1 ? 2 : 1, rotation: [0, jitter(rng, 6), 0] });
        }
      }
      // barbed wire on posts
      for (const sx of [-1, 1]) b.cylinder([sx * (L / 2 - 1), 4.6, 0], 0.3, 3.2, "#4a4a4a", { material: "Metal", collide: false, lod: 1 });
      b.cylinder([0, 5.8, 0], 0.18, L - 2, "#5a5a5a", { material: "Metal", collide: false, lod: 1, rotation: [0, 0, 90] });
      b.cylinder([0, 5.2, 0], 0.18, L - 2, "#5a5a5a", { material: "Metal", collide: false, lod: 0, rotation: [0, 0, 90] });
      return done(b, "town_wall", variant, tags, 0.6, L / 2);
    }
    case "scrap": {
      const rust = ["#6a4a3a", "#7a6a5a", "#5a5a60", "#8a5a40"];
      const h = 7;
      b.box([0, h / 2 - 0.5, 0], [L, h + 1, 0.6], rust[variant % rust.length]!, { material: "CorrodedMetal", collide: true, lod: 2 });
      for (let i = 0; i < 4; i++) {
        const x = -L / 2 + 1.8 + i * 3.5;
        b.box([x, rng.float(2.5, 5), -0.55], [rng.float(2, 3.2), rng.float(2, 4), 0.35], rust[(i + variant) % rust.length]!, { material: "DiamondPlate", collide: false, lod: 1, rotation: [0, 0, jitter(rng, 8)] });
      }
      for (const sx of [-1, 1]) b.box([sx * (L / 2 - 0.4), h / 2, 0.5], [0.6, h + 1, 0.6], "#4a4a4a", { material: "Metal", collide: true, lod: 1 });
      b.cylinder([-L / 4, 1.1, -1.4], 2.2, 0.9, "#2a2a2a", { material: "Rubber", collide: true, lod: 0, rotation: [0, 0, 90] });
      b.cylinder([L / 3, h + 0.6, 0], 0.16, L * 0.5, "#5a5a5a", { material: "Metal", collide: false, lod: 0, rotation: [0, 0, 90] });
      return done(b, "town_wall", variant, tags, 1.0, L / 2);
    }
    case "bamboo": {
      const c = jitterHex("#a8b860", jitter(rng, 6), 0, jitter(rng, 0.05));
      const n = 12;
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + 0.6 + (i * (L - 1.2)) / (n - 1);
        const h = rng.float(6.5, 7.5);
        b.cylinder([x, h / 2 - 0.5, 0], 0.9, h + 1, jitterHex(c, 0, 0, jitter(rng, 0.05)), { material: "Wood", collide: true, lod: i % 3 === 0 ? 2 : 1 });
      }
      for (const y of [2, 4.6]) b.box([0, y, 0.6], [L, 0.5, 0.4], mixHex(c, "#000000", 0.35), { material: "Wood", collide: false, lod: 1 });
      return done(b, "town_wall", variant, tags, 1.0, L / 2);
    }
    case "adobe": {
      const c = jitterHex(mixHex(style.palette.wall, "#d8b888", 0.4), jitter(rng, 3), 0, jitter(rng, 0.04));
      const h = 7;
      b.box([0, h / 2 - 0.6, 0], [L + 0.2, h + 1.2, 2.8], c, { material: "Sandstone", collide: true, lod: 2 });
      b.box([0, h + 0.3, 0], [L + 0.2, 0.9, 3.1], mixHex(c, "#000000", 0.08), { material: "Sandstone", collide: true, lod: 1 });
      for (let i = 0; i < 5; i++) b.box([-L / 2 + 1.4 + i * 2.8, h + 1.1, 0], [1.4, 0.9, 3.1], c, { material: "Sandstone", collide: false, lod: 1 });
      for (let i = 0; i < 3; i++) b.cylinder([-L / 2 + 3 + i * 4, 2.2, -1.5], 0.5, 1.2, mixHex(style.palette.wood, "#000000", 0.2), { material: "Wood", collide: false, lod: 0, rotation: [90, 0, 0] });
      return done(b, "town_wall", variant, tags, 1.2, L / 2);
    }
    case "marble": {
      const c = lightenHex(style.palette.stone, 0.3);
      const h = 4.5;
      b.box([0, h / 2 - 0.5, 0], [L + 0.2, h + 1, 1.6], c, { material: "Marble", collide: true, lod: 2 });
      b.box([0, h + 0.25, 0], [L + 0.2, 0.5, 2.0], mixHex(c, "#ffffff", 0.2), { material: "Marble", collide: true, lod: 1 });
      for (const sx of [-1, 1]) {
        b.cylinder([sx * (L / 2 - 1.2), 3.6, 0], 1.6, 8.4, c, { material: "Marble", collide: true, lod: 1 });
        b.box([sx * (L / 2 - 1.2), 7.9, 0], [2.2, 0.6, 2.2], mixHex(c, "#ffffff", 0.15), { material: "Marble", collide: false, lod: 0 });
      }
      return done(b, "town_wall", variant, tags, 1.0, L / 2);
    }
    case "energy_fence": {
      const post = "#5a6070";
      const glow = style.palette.glow;
      for (const sx of [-1, 1]) {
        b.box([sx * (L / 2 - 0.5), 3 - 0.4, 0], [1, 6.8, 1], post, { material: "Metal", collide: true, lod: 2 });
        b.box([sx * (L / 2 - 0.5), 6.4, 0], [1.3, 0.6, 1.3], glow, { material: "Neon", collide: false, lod: 1, light: { type: "point", color: glow, brightness: 0.8, range: 10 } });
      }
      b.box([0, 3.3, 0], [L - 1.2, 5.6, 0.25], glow, { material: "ForceField", collide: true, lod: 2, transparency: 0.35, castShadow: false });
      b.box([0, 0.6, 0], [L, 0.5, 1.2], post, { material: "Metal", collide: true, lod: 1 });
      return done(b, "town_wall", variant, tags, 0.6, L / 2);
    }
    case "picket": {
      const c = "#f4f4f0";
      const n = 10;
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + 0.7 + (i * (L - 1.4)) / (n - 1);
        b.box([x, 1.7, 0], [0.7, 3.4, 0.3], c, { material: "Wood", collide: false, lod: 1 });
        b.wedge([x, 3.65, 0], [0.7, 0.5, 0.3], c, { material: "Wood", collide: false, lod: 0 });
      }
      b.box([0, 1.1, 0], [L, 0.4, 0.3], c, { material: "Wood", collide: true, lod: 2 });
      b.box([0, 2.6, 0], [L, 0.4, 0.3], c, { material: "Wood", collide: true, lod: 2 });
      return done(b, "town_wall", variant, tags, 0.4, L / 2);
    }
    case "ice": {
      const c = mixHex("#bcd8ec", style.palette.water, 0.3);
      const rows = 3;
      for (let r = 0; r < rows; r++) {
        const n = 4;
        for (let i = 0; i < n; i++) {
          const x = -L / 2 + 1.75 + i * 3.5 + (r % 2) * 1.75;
          if (x > L / 2 - 1) continue;
          b.box([x, 1.2 + r * 2.3, 0], [3.4, 2.3, 2.4], jitterHex(c, jitter(rng, 3), 0, jitter(rng, 0.05)), { material: "Ice", collide: true, lod: r === 0 ? 2 : 1, transparency: 0.15, reflectance: 0.15 });
        }
      }
      b.box([0, 3.4, 0], [L, 7, 2.2], c, { material: "Ice", collide: true, lod: 2, transparency: 0.3, reflectance: 0.1 });
      return done(b, "town_wall", variant, tags, 1.0, L / 2);
    }
    default: {
      const c = stoneColor(ctx);
      b.box([0, 4, 0], [L + 0.2, 9, 2.6], c, { material: style.materials.stoneWall, collide: true, lod: 2 });
      return done(b, "town_wall", variant, tags, 1.2, L / 2);
    }
  }
}

export function gateTower(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const kit = kitOf(ctx);
  const tags = ["wall", "gate", "tower"];
  switch (kit) {
    case "stone_crenellated":
    case "adobe":
    case "ice": {
      const c = kit === "stone_crenellated" ? stoneColor(ctx) : kit === "adobe" ? jitterHex(mixHex(style.palette.wall, "#d8b888", 0.4), 0, 0, jitter(rng, 0.04)) : mixHex("#bcd8ec", style.palette.water, 0.3);
      const mat: RobloxMaterial = kit === "stone_crenellated" ? style.materials.stoneWall : kit === "adobe" ? "Sandstone" : "Ice";
      const h = kit === "adobe" ? 11 : 14;
      const w = 6;
      const tr = kit === "ice" ? 0.2 : undefined;
      b.box([0, h / 2 - 0.6, 0], [w, h + 1.2, w], c, { material: mat, collide: true, lod: 2, transparency: tr });
      b.box([0, h + 0.3, 0], [w + 1, 0.8, w + 1], mixHex(c, "#000000", 0.1), { material: mat, collide: true, lod: 1, transparency: tr });
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
        b.box([sx * (w / 2 + 0.1), h + 1.4, sz * (w / 2 + 0.1)], [1.5, 1.6, 1.5], c, { material: mat, collide: true, lod: 1, transparency: tr });
      }
      // arrow slit + torch
      b.box([0, h * 0.6, -w / 2 - 0.05], [0.5, 2.2, 0.3], "#1a1a1a", { material: "SmoothPlastic", collide: false, lod: 0 });
      b.cylinder([0, h * 0.4, -w / 2 - 0.5], 0.4, 2.4, mixHex(style.palette.wood, "#000000", 0.2), { material: "Wood", collide: false, lod: 1, rotation: [20, 0, 0] });
      b.sphere([0, h * 0.4 + 1.3, -w / 2 - 0.9], 0.9, "#ffb050", { material: "Neon", collide: false, lod: 1, light: { type: "point", color: "#ffb050", brightness: 1.2, range: 16 }, effect: { kind: "embers", rate: 4, size: 0.7 } });
      return done(b, "gate_tower", variant, tags, 1.2, w / 2 + 0.6);
    }
    case "palisade":
    case "bamboo": {
      const c = kit === "bamboo" ? "#a8b860" : woodColor(ctx);
      const h = 11;
      const w = 5;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) b.cylinder([sx * (w / 2), h / 2 - 0.6, sz * (w / 2)], 1.4, h + 1.2, c, { material: "Wood", collide: true, lod: 2 });
      b.box([0, h - 0.3, 0], [w + 2, 0.6, w + 2], mixHex(c, "#000000", 0.2), { material: "WoodPlanks", collide: true, lod: 2 });
      b.box([0, h + 1.2, -(w + 2) / 2], [w + 2, 2.4, 0.4], c, { material: "WoodPlanks", collide: true, lod: 1 });
      b.box([0, h + 1.2, (w + 2) / 2], [w + 2, 2.4, 0.4], c, { material: "WoodPlanks", collide: true, lod: 1 });
      for (const sx of [-1, 1]) b.box([sx * (w + 2) / 2, h + 1.2, 0], [0.4, 2.4, w + 2], c, { material: "WoodPlanks", collide: true, lod: 1 });
      b.pyramidRoof([0, h + 2.4 + 1.6, 0], w + 3, w + 3, 3.2, mixHex(style.palette.roof, "#000000", 0.1), { material: style.materials.roof, collide: false, lod: 1 });
      b.box([0, h * 0.5, 0], [w - 0.5, h - 1, w - 0.5], mixHex(c, "#000000", 0.25), { material: "WoodPlanks", collide: true, lod: 2 });
      b.cylinder([0, h * 0.45, -w / 2 - 0.5], 0.4, 2.4, mixHex(style.palette.wood, "#000000", 0.2), { material: "Wood", collide: false, lod: 1, rotation: [20, 0, 0] });
      b.sphere([0, h * 0.45 + 1.3, -w / 2 - 0.9], 0.9, "#ffb050", { material: "Neon", collide: false, lod: 1, light: { type: "point", color: "#ffb050", brightness: 1.2, range: 16 } });
      return done(b, "gate_tower", variant, tags, 1.2, w / 2 + 1.5);
    }
    case "sandbags":
    case "scrap": {
      const metal = kit === "scrap" ? "#6a5a50" : "#5a5f58";
      const h = 10;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) b.box([sx * 2.2, h / 2 - 0.6, sz * 2.2], [0.6, h + 1.2, 0.6], metal, { material: kit === "scrap" ? "CorrodedMetal" : "Metal", collide: true, lod: 2 });
      for (const y of [3.5, 7]) for (const sx of [-1, 1]) b.box([sx * 2.2, y, 0], [0.4, 0.4, 4.4], metal, { material: "Metal", collide: false, lod: 1, rotation: [45, 0, 0] });
      b.box([0, h - 0.2, 0], [5.6, 0.5, 5.6], metal, { material: kit === "scrap" ? "DiamondPlate" : "Metal", collide: true, lod: 2 });
      for (const sz of [-1, 1]) b.box([0, h + 1.2, sz * 2.7], [5.6, 2.4, 0.3], "#7a7a6a", { material: kit === "scrap" ? "CorrodedMetal" : "Metal", collide: true, lod: 1 });
      for (const sx of [-1, 1]) b.box([sx * 2.7, h + 1.2, 0], [0.3, 2.4, 5.6], "#7a7a6a", { material: kit === "scrap" ? "CorrodedMetal" : "Metal", collide: true, lod: 1 });
      b.box([0, h + 3.1, 0], [6.4, 0.3, 6.4], "#4a4a4a", { material: "Metal", collide: false, lod: 1 });
      for (const sx of [-1, 1]) b.box([sx * 3.2, h + 2.5, 0], [0.3, 0.9, 6.4], "#4a4a4a", { material: "Metal", collide: false, lod: 0 });
      b.box([0, h + 3.5, -2.8], [1.6, 0.6, 1.2], "#2a2a2a", { material: "Metal", collide: false, lod: 1, rotation: [-30, 0, 0], light: { type: "point", color: "#fff2d0", brightness: 1.4, range: 22 } });
      b.box([0, h + 3.8, -2.8], [1.4, 0.2, 0.8], "#fff2d0", { material: "Neon", collide: false, lod: 1, rotation: [-30, 0, 0] });
      return done(b, "gate_tower", variant, tags, 0.8, 3.4);
    }
    case "marble": {
      const c = lightenHex(style.palette.stone, 0.3);
      for (const sx of [-1, 1]) {
        b.cylinder([sx * 2.5, 5, 0], 1.8, 10.8, c, { material: "Marble", collide: true, lod: 2 });
        b.box([sx * 2.5, 10.7, 0], [2.6, 0.7, 2.6], mixHex(c, "#ffffff", 0.15), { material: "Marble", collide: false, lod: 1 });
        b.box([sx * 2.5, 0.2, 0], [2.6, 0.8, 2.6], mixHex(c, "#ffffff", 0.15), { material: "Marble", collide: true, lod: 1 });
      }
      b.box([0, 11.5, 0], [8, 1.2, 2.8], c, { material: "Marble", collide: true, lod: 2 });
      b.wedge([0, 12.9, 0], [8, 1.6, 2.8], mixHex(c, "#ffffff", 0.1), { material: "Marble", collide: false, lod: 1, rotation: [0, 90, 0] });
      b.sphere([0, 13.9, 0], 1.1, style.palette.accent, { material: "Neon", collide: false, lod: 1, light: { type: "point", color: style.palette.accent, brightness: 0.8, range: 14 } });
      return done(b, "gate_tower", variant, tags, 0.8, 4.2);
    }
    case "energy_fence": {
      const post = "#5a6070";
      const glow = style.palette.glow;
      b.box([0, 4.4, 0], [2.4, 10, 2.4], post, { material: "Metal", collide: true, lod: 2 });
      b.box([0, 9.6, 0], [3.2, 0.6, 3.2], "#3a3f4a", { material: "Metal", collide: true, lod: 1 });
      b.cylinder([0, 11.2, 0], 0.4, 3, "#8a8f9a", { material: "Metal", collide: false, lod: 1 });
      b.sphere([0, 12.9, 0], 1.4, glow, { material: "Neon", collide: false, lod: 1, light: { type: "point", color: glow, brightness: 1.5, range: 24 } });
      for (const y of [2, 5, 8]) b.box([0, y, -1.25], [1.6, 0.3, 0.15], glow, { material: "Neon", collide: false, lod: 0 });
      return done(b, "gate_tower", variant, tags, 0.6, 1.8);
    }
    case "picket": {
      const c = "#f4f4f0";
      for (const sx of [-1, 1]) b.box([sx * 3, 2.6, 0], [0.9, 6, 0.9], c, { material: "Wood", collide: true, lod: 2 });
      b.box([0, 5.8, 0], [7.4, 0.6, 1.0], c, { material: "Wood", collide: true, lod: 2 });
      b.wedge([0, 6.5, 0], [7.4, 0.9, 1.0], c, { material: "Wood", collide: false, lod: 1, rotation: [0, 90, 0] });
      for (const sx of [-1, 1]) b.sphere([sx * 3, 5.9, 0], 1.3, jitterHex(style.palette.accent, jitter(rng, 10), 0, 0), { material: "SmoothPlastic", collide: false, lod: 1 });
      b.box([0, 4.9, -0.6], [3.6, 1.2, 0.2], style.palette.accent, { material: "SmoothPlastic", collide: false, lod: 0 });
      return done(b, "gate_tower", variant, tags, 0.5, 3.8);
    }
    default: {
      const c = stoneColor(ctx);
      b.box([0, 6.4, 0], [6, 14, 6], c, { material: style.materials.stoneWall, collide: true, lod: 2 });
      return done(b, "gate_tower", variant, tags, 1.2, 3.6);
    }
  }
}

/** Wooden pier: planks on posts running along +Z (the dressing stage points it from the shore into the water). */
export function pier(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const c = woodColor(ctx);
  const len = 34;
  const w = 7;
  const deck = 1.2;
  const modern = style.kits.road === "asphalt_road" || style.kits.road === "concrete_road" || style.kits.road === "metal_walkway";
  const mat: RobloxMaterial = modern ? "Concrete" : "WoodPlanks";
  const col = modern ? "#a8a8a0" : c;
  const plankN = Math.floor(len / 1.6);
  for (let i = 0; i < plankN; i++) b.box([0, deck, i * 1.6 + 0.8], [w, 0.35, 1.5], jitterHex(col, 0, 0, jitter(rng, 0.05)), { material: mat, collide: true, lod: i % 3 === 0 ? 2 : 1 });
  b.box([0, deck - 0.4, len / 2], [w + 0.2, 0.5, len], mixHex(col, "#000000", 0.2), { material: mat, collide: true, lod: 2 });
  // posts down into the water: long enough for the shelf depth
  for (let z = 2; z < len; z += 6) {
    for (const sx of [-1, 1]) {
      b.cylinder([sx * (w / 2 - 0.4), deck - 6, z], 1.1, 13, mixHex(c, "#000000", 0.25), { material: "Wood", collide: true, lod: 2 });
      if (z > 8) b.cylinder([sx * (w / 2 - 0.4), deck + 1.6, z], 1.1, 2.6, mixHex(c, "#000000", 0.2), { material: "Wood", collide: true, lod: 1 });
    }
  }
  // railing on one side, lantern at the end, mooring rope
  for (let z = 4; z < len - 2; z += 6) b.box([-(w / 2 - 0.4), deck + 2.7, z], [0.3, 0.3, 6.2], mixHex(c, "#000000", 0.15), { material: "Wood", collide: false, lod: 1 });
  b.cylinder([w / 2 - 0.6, deck + 3.4, len - 1.5], 0.4, 4.6, mixHex(c, "#000000", 0.25), { material: "Wood", collide: false, lod: 1 });
  b.box([w / 2 - 0.6, deck + 6, len - 1.5], [1, 1.2, 1], "#ffd9a0", { material: "Neon", collide: false, lod: 1, light: { type: "point", color: "#ffd9a0", brightness: 1.2, range: 18 } });
  b.box([w / 2 - 0.6, deck + 6.8, len - 1.5], [1.3, 0.3, 1.3], mixHex(c, "#000000", 0.3), { material: "Wood", collide: false, lod: 0 });
  b.box([0, deck + 0.4, len - 0.6], [w, 0.8, 0.5], mixHex(c, "#000000", 0.3), { material: "Wood", collide: true, lod: 1 });
  return b.build({ id: `pier/${variant}`, prefab: "pier", category: "prop", sinkDepth: 0, footprintRadius: len / 2, tags: ["docks", "water", "floating"] });
}

/** Crop field: tilled rows with plants inside a low fence; 22×16 studs, a scarecrow in the middle of some variants. */
export function farmField(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const W = 22;
  const D = 16;
  const soil = mixHex(style.palette.ground, "#3a2a1a", 0.4);
  b.box([0, 0.15, 0], [W, 0.5, D], soil, { material: "Ground", collide: true, lod: 2 });
  const rows = 6;
  const crop = rng.chance(0.5) ? style.palette.foliageAlt : mixHex(style.palette.foliage, "#d8c040", 0.35);
  for (let r = 0; r < rows; r++) {
    const z = -D / 2 + 1.6 + (r * (D - 3.2)) / (rows - 1);
    b.box([0, 0.55, z], [W - 2, 0.5, 1.0], mixHex(soil, "#000000", 0.2), { material: "Ground", collide: false, lod: 1 });
    const n = 9;
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 2 + (i * (W - 4)) / (n - 1);
      const h = rng.float(1.2, 2.4);
      b.box([x + jitter(rng, 0.3), 0.6 + h / 2, z], [1.1, h, 1.1], jitterHex(crop, jitter(rng, 6), 0, jitter(rng, 0.08)), { material: "Grass", collide: false, castShadow: false, lod: (i + r) % 3 === 0 ? 1 : 0 });
    }
  }
  // low fence
  const fc = woodColor(ctx);
  const postH = 2.2;
  for (const sz of [-1, 1]) {
    b.box([0, 1.5, sz * (D / 2 + 0.4)], [W + 0.8, 0.3, 0.3], fc, { material: "Wood", collide: false, lod: 1 });
    for (let i = 0; i <= 4; i++) b.box([-W / 2 + (i * W) / 4, postH / 2, sz * (D / 2 + 0.4)], [0.5, postH, 0.5], fc, { material: "Wood", collide: false, lod: 1 });
  }
  for (const sx of [-1, 1]) {
    b.box([sx * (W / 2 + 0.4), 1.5, 0], [0.3, 0.3, D + 0.8], fc, { material: "Wood", collide: false, lod: 1 });
    for (let i = 1; i < 3; i++) b.box([sx * (W / 2 + 0.4), postH / 2, -D / 2 + (i * D) / 3], [0.5, postH, 0.5], fc, { material: "Wood", collide: false, lod: 1 });
  }
  if (variant % 2 === 0) {
    // scarecrow
    b.cylinder([0, 2.6, 0], 0.4, 5.2, fc, { material: "Wood", collide: false, lod: 1 });
    b.cylinder([0, 4.2, 0], 0.35, 4.4, fc, { material: "Wood", collide: false, lod: 1, rotation: [0, 0, 90] });
    b.box([0, 3.8, 0], [1.6, 2.2, 0.8], "#8a6a4a", { material: "Fabric", collide: false, lod: 1 });
    b.sphere([0, 5.4, 0], 1.1, "#d8b060", { material: "Fabric", collide: false, lod: 1 });
    b.cylinder([0, 6.1, 0], 1.9, 0.3, "#9a7a40", { material: "Fabric", collide: false, lod: 0 });
  }
  return b.build({ id: `farm_field/${variant}`, prefab: "farm_field", category: "prop", sinkDepth: 0.3, footprintRadius: W / 2, tags: ["farm", "field"] });
}

/** Dashed centre-line stripe for asphalt / concrete streets (3.2 studs along X). Neon roads glow. */
export function roadStripe(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const neon = ctx.style.kits.road === "neon_road";
  const color = neon ? ctx.style.palette.glow : variant % 2 === 0 ? "#f0f0e8" : "#e8d860";
  b.box([0, 0.06, 0], [3.2, 0.12, 0.5], color, { material: neon ? "Neon" : "SmoothPlastic", collide: false, castShadow: false, lod: 2, light: neon ? { type: "point", color, brightness: 0.4, range: 6 } : undefined });
  return b.build({ id: `road_stripe/${variant}`, prefab: "road_stripe", category: "path", sinkDepth: 0, footprintRadius: 1.6, tags: ["road", "marking"] });
}

/** Zebra crossing: bars along X spanning a 10-stud street (scaled by the street width at placement). */
export function crosswalk(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const neon = ctx.style.kits.road === "neon_road";
  const color = neon ? ctx.style.palette.glow : "#f0f0e8";
  for (let i = 0; i < 6; i++) b.box([-4.5 + i * 1.8, 0.06, 0], [0.9, 0.12, 8.6], color, { material: neon ? "Neon" : "SmoothPlastic", collide: false, castShadow: false, lod: 2 });
  return b.build({ id: `crosswalk/${variant}`, prefab: "crosswalk", category: "path", sinkDepth: 0, footprintRadius: 5, tags: ["road", "marking"] });
}

/** Kerb / sidewalk edge stone segment (8 studs along X) laid along asphalt streets. */
export function kerb(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = jitterHex(lightenHex(ctx.style.palette.stone, 0.2), 0, 0, jitter(ctx.rng, 0.04));
  b.box([0, 0.25, 0], [8, 0.6, 0.9], c, { material: "Concrete", collide: false, castShadow: false, lod: 2 });
  return b.build({ id: `kerb/${variant}`, prefab: "kerb", category: "path", sinkDepth: 0.15, footprintRadius: 4, tags: ["road", "kerb"] });
}
