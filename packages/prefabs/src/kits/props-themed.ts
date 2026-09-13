import { jitterHex, mixHex, type PrefabVariant, type RobloxMaterial } from "@worldforge/core";
import { PartListBuilder, jitter, type PrefabContext } from "../builder";

/** Themed prop kits: western, pirate, japanese, egypt, greek, tropical, arctic, candy, underwater, jungle, horror, sports, carnival, playground. */

const METAL: RobloxMaterial = "Metal";
const WOOD: RobloxMaterial = "Wood";

function done(b: PartListBuilder, prefab: string, variant: number, tags: string[], sink = 0.3): PrefabVariant {
  return b.build({ id: `${prefab}/${variant}`, prefab, category: "prop", sinkDepth: sink, tags });
}
const wood = (ctx: PrefabContext) => jitterHex(ctx.style.palette.wood, jitter(ctx.rng, 5), 0, jitter(ctx.rng, 0.06));

// ------------------------------------------------------------------ western
export function hitchingPost(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = wood(ctx);
  for (const sx of [-1, 1]) b.cylinder([sx * 3, 1.8, 0], 0.8, 3.6, c, { material: WOOD, collide: true, lod: 1 });
  b.cylinder([0, 3.4, 0], 0.7, 7, c, { material: WOOD, collide: true, lod: 1, rotation: [0, 0, 90] });
  b.cylinder([1.5, 2.3, 0.4], 0.9, 1.6, "#7a6a50", { material: WOOD, collide: false, lod: 0 });
  return done(b, "hitching_post", variant, ["western"], 0.3);
}

export function wagon(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = wood(ctx);
  b.box([0, 3, 0], [6, 2.4, 11], c, { material: "WoodPlanks", collide: true, lod: 2 });
  b.box([0, 4.3, 0], [6.4, 0.3, 11.4], mixHex(c, "#000000", 0.2), { material: WOOD, collide: false, lod: 1 });
  for (let i = 0; i < 4; i++) b.cylinder([0, 6.5, -4.5 + i * 3], 6.6, 0.5, "#e8e0d0", { material: "Fabric", collide: false, lod: 1, rotation: [90, 0, 0] });
  b.box([0, 7, 0], [6.4, 3.6, 11], "#e8e0d0", { material: "Fabric", collide: false, lod: 1, transparency: 0.05 });
  for (const sx of [-1, 1]) {
    b.cylinder([sx * 3.3, 1.6, -3.5], 3.2, 0.5, c, { material: WOOD, collide: true, lod: 1, rotation: [0, 0, 90] });
    b.cylinder([sx * 3.3, 2, 3.5], 4, 0.5, c, { material: WOOD, collide: true, lod: 1, rotation: [0, 0, 90] });
  }
  b.beam([0, 2.5, -5.5], [0, 2.2, -12], 0.5, 0.5, c, { material: WOOD, collide: false, lod: 0 });
  return done(b, "wagon", variant, ["western", "farm"], 0.2);
}

export function wantedBoard(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = wood(ctx);
  for (const sx of [-1, 1]) b.box([sx * 2.6, 3.5, 0], [0.6, 7, 0.6], c, { material: WOOD, collide: true, lod: 1 });
  b.box([0, 5.2, 0], [6, 4, 0.4], mixHex(c, "#000000", 0.1), { material: "WoodPlanks", collide: true, lod: 1 });
  b.box([-1.3, 5.4, -0.25], [2, 2.6, 0.05], "#e8dcc0", { material: "SmoothPlastic", collide: false, lod: 0, rotation: [0, 0, 4] });
  b.box([1.4, 5.1, -0.25], [2, 2.6, 0.05], "#d8c8a8", { material: "SmoothPlastic", collide: false, lod: 0, rotation: [0, 0, -3] });
  b.wedge([0, 7.6, 0], [6.8, 1, 0.8], c, { material: WOOD, collide: false, lod: 0 });
  return done(b, "wanted_board", variant, ["western", "village"], 0.3);
}

export function windPump(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = "#6a6a70";
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.beam([sx * 3, 0, sz * 3], [sx * 0.8, 18, sz * 0.8], 0.4, 0.4, c, { material: METAL, collide: true, lod: 1 });
  for (let i = 1; i < 4; i++) { const f = 1 - i * 0.22; b.box([0, i * 4.5, 0], [6 * f, 0.3, 6 * f], c, { material: METAL, collide: false, lod: 0 }); }
  b.cylinder([0, 18.5, -0.5], 0.6, 2, c, { material: METAL, collide: false, lod: 0, rotation: [90, 0, 0] });
  for (let i = 0; i < 8; i++) b.box([0, 18.5, -1.6], [0.9, 4.4, 0.15], "#c8c8c0", { material: METAL, collide: false, lod: 0, rotation: [0, 0, i * 45] });
  b.box([0, 18.5, 2], [0.2, 2, 4], "#c8c8c0", { material: METAL, collide: false, lod: 0 });
  void ctx;
  return done(b, "wind_pump", variant, ["western", "farm"], 0.3);
}

// ------------------------------------------------------------------ pirate
export function cannon(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = wood(ctx);
  b.box([0, 1.4, 0], [3.2, 1.6, 5], c, { material: WOOD, collide: true, lod: 1 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cylinder([sx * 1.7, 1.2, sz * 1.6], 2.2, 0.5, mixHex(c, "#000000", 0.2), { material: WOOD, collide: false, lod: 0, rotation: [0, 0, 90] });
  b.cylinder([0, 2.8, -0.5], 1.6, 7, "#2a2a2e", { material: METAL, collide: true, lod: 1, rotation: [80, 0, 0] });
  b.cylinder([0, 3.5, -3.8], 1.9, 0.6, "#2a2a2e", { material: METAL, collide: false, lod: 0, rotation: [80, 0, 0] });
  for (let i = 0; i < 3; i++) b.sphere([2.6, 0.8, 1 - i * 1.2], 1.1, "#1a1a1a", { material: METAL, collide: false, lod: 0 });
  return done(b, "cannon", variant, ["pirate", "docks"], 0.2);
}

export function treasureChest(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const c = wood(ctx);
  const open = rng.chance(0.5);
  b.box([0, 1.2, 0], [4, 2.4, 2.6], c, { material: WOOD, collide: true, lod: 1 });
  b.box([0, 1.2, 0], [4.2, 0.4, 2.7], "#d0a020", { material: METAL, collide: false, lod: 0 });
  for (const sx of [-1, 1]) b.box([sx * 1.4, 1.2, 0], [0.4, 2.5, 2.7], "#d0a020", { material: METAL, collide: false, lod: 0 });
  if (open) {
    b.cylinder([0, 3.6, 1.2], 2.6, 4, c, { material: WOOD, collide: false, lod: 1, rotation: [0, 0, 90] });
    b.box([0, 2.6, 0], [3.6, 0.6, 2.2], "#ffd040", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ffd040", brightness: 1.2, range: 14 } });
    b.effect([0, 3.2, 0], [3, 2, 2], { kind: "sparkle", color: "#ffe080", rate: 3, size: 0.25 }, { lod: 0 });
  } else {
    b.cylinder([0, 2.4, 0], 2.6, 4, c, { material: WOOD, collide: true, lod: 1, rotation: [0, 0, 90] });
    b.box([0, 1.6, -1.35], [0.8, 0.9, 0.2], "#d0a020", { material: METAL, collide: false, lod: 0 });
  }
  return done(b, "treasure_chest", variant, ["pirate", "underwater", "collectible"], 0.1);
}

export function dockPost(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = wood(ctx);
  b.cylinder([0, 2.6, 0], 1.4, 6, c, { material: WOOD, collide: true, lod: 1, rotation: [jitter(ctx.rng, 4), 0, jitter(ctx.rng, 4)] });
  b.cylinder([0, 4.4, 0], 1.7, 0.6, "#8a7a5a", { material: "Fabric", collide: false, lod: 0 });
  b.cylinder([0, 3.6, 0], 1.7, 0.6, "#8a7a5a", { material: "Fabric", collide: false, lod: 0 });
  b.sphere([0, 5.7, 0], 1.3, mixHex(c, "#000000", 0.2), { material: WOOD, collide: false, lod: 0 });
  return done(b, "dock_post", variant, ["pirate", "docks", "water"], 1.0);
}

export function rowboat(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = wood(ctx);
  b.box([0, 1, 0], [4.4, 1.8, 10], c, { material: "WoodPlanks", collide: true, lod: 2 });
  b.wedge([0, 1, -6], [4.4, 1.8, 2.4], c, { material: "WoodPlanks", collide: true, lod: 1, rotation: [0, 90, 0] });
  b.box([0, 1.2, 0], [3.6, 1.2, 9], "#5a4a3a", { material: WOOD, collide: false, lod: 1 });
  for (const z of [-2.5, 0.5, 3.5]) b.box([0, 1.9, z], [4, 0.3, 1], mixHex(c, "#ffffff", 0.15), { material: WOOD, collide: true, lod: 0 });
  b.beam([-2.6, 2, -1], [-4.5, 0.4, 2], 0.25, 0.25, mixHex(c, "#ffffff", 0.1), { material: WOOD, collide: false, lod: 0 });
  return done(b, "rowboat", variant, ["pirate", "docks", "water", "floating"], 0.9);
}

export function anchor(_ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = "#3a3a40";
  b.cylinder([0, 4, 0], 0.8, 8, c, { material: "CorrodedMetal", collide: true, lod: 1, rotation: [0, 0, 12] });
  b.cylinder([0, 1, 0], 0.8, 8, c, { material: "CorrodedMetal", collide: true, lod: 1, rotation: [0, 0, 100] });
  for (const sx of [-1, 1]) b.wedge([sx * 3.6, 1.6, 0], [1.4, 2, 1], c, { material: "CorrodedMetal", collide: false, lod: 0, rotation: [0, 0, sx * -30] });
  b.cylinder([0.8, 7.5, 0], 1.8, 0.5, c, { material: "CorrodedMetal", collide: false, lod: 0, rotation: [90, 0, 0] });
  b.cylinder([0.5, 6.4, 0], 0.7, 5, c, { material: "CorrodedMetal", collide: false, lod: 0, rotation: [90, 0, 0] });
  return done(b, "anchor", variant, ["pirate", "docks", "underwater"], 0.5);
}

export function torchPost(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  b.cylinder([0, 3, 0], 0.6, 6, wood(ctx), { material: WOOD, collide: true, lod: 1 });
  b.cylinder([0, 6.3, 0], 1.1, 1, "#6a5a48", { material: "Fabric", collide: false, lod: 0 });
  b.sphere([0, 7.3, 0], 1.6, "#ff8a30", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ff9040", brightness: 1.8, range: 26 }, effect: { kind: "embers", color: "#ff9040", rate: 2, size: 0.25 } });
  return done(b, "torch_post", variant, ["pirate", "tropical", "jungle", "camp", "light"], 0.5);
}

// ------------------------------------------------------------------ japanese
export function stoneLantern(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = jitterHex(ctx.style.palette.stone, 0, 0, jitter(ctx.rng, 0.06));
  b.box([0, 0.4, 0], [3, 0.8, 3], c, { material: "Slate", collide: true, lod: 1 });
  b.cylinder([0, 2.4, 0], 1.2, 3.4, c, { material: "Slate", collide: true, lod: 1 });
  b.box([0, 4.4, 0], [2.6, 0.6, 2.6], c, { material: "Slate", collide: false, lod: 1 });
  b.box([0, 5.6, 0], [2, 1.8, 2], mixHex(c, "#000000", 0.1), { material: "Slate", collide: false, lod: 1 });
  b.box([0, 5.6, 0], [1.4, 1.2, 2.1], "#ffd890", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ffd890", brightness: 1.2, range: 16 } });
  b.pyramidRoof([0, 7.3, 0], 3.6, 3.6, 1.6, c, { material: "Slate", collide: false, lod: 1 });
  b.sphere([0, 8.2, 0], 0.7, c, { material: "Slate", collide: false, lod: 0 });
  return done(b, "stone_lantern", variant, ["japanese", "light"], 0.2);
}

export function smallShrine(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const red = mixHex(ctx.style.palette.accent, "#c03030", 0.5);
  b.box([0, 0.5, 0], [6, 1, 5], "#8a8a88", { material: "Slate", collide: true, lod: 1 });
  b.box([0, 3, 0.5], [4, 4, 3], "#e8dcc0", { material: WOOD, collide: true, lod: 1 });
  for (const sx of [-1, 1]) b.box([sx * 2.2, 3, -1.2], [0.5, 4, 0.5], red, { material: WOOD, collide: false, lod: 0 });
  b.gableRoof([0, 5.7, 0.3], 6, 5.5, 2, "#3a3a48", { material: "Slate", collide: true, lod: 1 });
  b.box([0, 2.6, -1.05], [1.6, 2.4, 0.1], "#1a1410", { material: WOOD, collide: false, lod: 0 });
  b.cylinder([0, 1.6, -2], 0.9, 1.2, "#6a6a70", { material: METAL, collide: false, lod: 0 });
  return done(b, "small_shrine", variant, ["japanese", "village"], 0.2);
}

export function bambooFence(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = "#c8b060";
  for (let i = 0; i < 10; i++) b.cylinder([-6.75 + i * 1.5, 2, 0], 0.7, 4, jitterHex(c, 0, 0, jitter(ctx.rng, 0.08)), { material: WOOD, collide: i % 3 === 0, lod: 1 });
  for (const y of [1.2, 3.2]) b.cylinder([0, y, 0.45], 0.5, 15, mixHex(c, "#000000", 0.2), { material: WOOD, collide: true, lod: 1, rotation: [0, 0, 90] });
  return done(b, "bamboo_fence", variant, ["japanese", "wall"], 0.4);
}

export function paperLanternString(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = wood(ctx);
  for (const sx of [-1, 1]) b.cylinder([sx * 8, 4, 0], 0.5, 8, c, { material: WOOD, collide: true, lod: 1 });
  b.beam([-8, 8, 0], [8, 8, 0], 0.15, 0.15, "#3a2a22", { material: "Plastic", collide: false, lod: 1 });
  const cols = ["#ff5050", "#ffd040", "#ffffff", "#ff8a30"];
  for (let i = 0; i < 6; i++) {
    const col = cols[i % cols.length]!;
    b.cylinder([-6.5 + i * 2.6, 6.9, 0], 1.4, 1.8, col, { material: "Neon", collide: false, lod: 0, light: i % 2 ? { type: "point" as const, color: col, brightness: 0.8, range: 12 } : undefined });
    b.cylinder([-6.5 + i * 2.6, 7.9, 0], 0.6, 0.3, "#3a2a22", { material: WOOD, collide: false, lod: 0 });
  }
  return done(b, "paper_lantern_string", variant, ["japanese", "light", "village"], 0.4);
}

// ------------------------------------------------------------------ egypt
export function sphinxStatue(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = jitterHex("#d8c090", 0, 0, jitter(ctx.rng, 0.06));
  b.box([0, 1, 0], [8, 2, 16], c, { material: "Sandstone", collide: true, lod: 2 });
  b.box([0, 4, 1], [5.5, 4, 11], c, { material: "Sandstone", collide: true, lod: 2 });
  for (const sx of [-1, 1]) b.box([sx * 2.2, 3, -5], [1.6, 2, 6], c, { material: "Sandstone", collide: true, lod: 1 });
  b.box([0, 8, -4], [3.6, 4.4, 3], c, { material: "Sandstone", collide: true, lod: 1 });
  b.box([0, 8.5, -4], [5.4, 4, 2.6], mixHex(c, ctx.style.palette.accent, 0.5), { material: "Sandstone", collide: false, lod: 1 });
  b.wedge([0, 8, -2.4], [5.4, 4, 1.6], mixHex(c, ctx.style.palette.accent, 0.5), { material: "Sandstone", collide: false, lod: 0 });
  b.box([0, 7.4, -5.6], [1.6, 0.6, 0.4], "#2a2a30", { material: "Slate", collide: false, lod: 0 });
  return done(b, "sphinx_statue", variant, ["egypt", "statue"], 0.4);
}

export function sarcophagus(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const gold = "#d8b040";
  b.box([0, 1.4, 0], [4, 2.8, 9], gold, { material: METAL, collide: true, lod: 1 });
  b.box([0, 3, 0], [3.6, 0.6, 8.6], mixHex(gold, ctx.style.palette.accent, 0.5), { material: METAL, collide: false, lod: 1 });
  b.sphere([0, 3.3, -2.8], 2.4, gold, { material: METAL, collide: false, lod: 1 });
  b.box([0, 3.3, 0.5], [2.4, 0.6, 4], mixHex(gold, "#000000", 0.2), { material: METAL, collide: false, lod: 0 });
  for (let i = 0; i < 3; i++) b.box([0, 3.4, -1 + i * 1.5], [3, 0.2, 0.4], ctx.style.palette.accent, { material: "SmoothPlastic", collide: false, lod: 0 });
  return done(b, "sarcophagus", variant, ["egypt", "ruins"], 0.2);
}

export function brazier(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  b.cylinder([0, 0.3, 0], 2.4, 0.6, "#6a5a40", { material: METAL, collide: true, lod: 1 });
  b.cylinder([0, 2.2, 0], 0.8, 3.4, "#6a5a40", { material: METAL, collide: true, lod: 1 });
  b.cylinder([0, 4.2, 0], 3, 1, "#6a5a40", { material: METAL, collide: true, lod: 1 });
  b.sphere([0, 5.2, 0], 2, "#ff8a30", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ff9040", brightness: 2, range: 28 }, effect: { kind: "embers", color: "#ff9040", rate: 3, size: 0.3 } });
  void ctx;
  return done(b, "brazier", variant, ["egypt", "greek", "ruins", "light"], 0.2);
}

export function hieroglyphPillar(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = jitterHex("#d8c090", 0, 0, jitter(ctx.rng, 0.06));
  b.box([0, 0.4, 0], [4, 0.8, 4], c, { material: "Sandstone", collide: true, lod: 1 });
  b.cylinder([0, 7, 0], 3, 13, c, { material: "Sandstone", collide: true, lod: 2 });
  b.cylinder([0, 13.8, 0], 3.8, 1.2, mixHex(c, "#000000", 0.05), { material: "Sandstone", collide: true, lod: 1 });
  for (let i = 0; i < 4; i++) b.box([0, 3 + i * 2.6, -1.55], [1.6, 1.6, 0.15], i % 2 ? ctx.style.palette.accent : "#8a6a30", { material: "SmoothPlastic", collide: false, lod: 0 });
  return done(b, "hieroglyph_pillar", variant, ["egypt", "ruins"], 0.3);
}

// ------------------------------------------------------------------ greek
export function column(ctx: PrefabContext, variant: number, opts: { broken?: boolean; prefabId?: string } = {}): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const c = jitterHex("#ece8dc", 0, 0, jitter(rng, 0.05));
  const h = opts.broken ? rng.float(4, 8) : 14;
  b.box([0, 0.5, 0], [4, 1, 4], c, { material: "Marble", collide: true, lod: 1 });
  b.cylinder([0, 1 + h / 2, 0], 2.6, h, c, { material: "Marble", collide: true, lod: 2 });
  for (let i = 0; i < 6; i++) b.box([Math.cos((i * Math.PI) / 3) * 1.3, 1 + h / 2, Math.sin((i * Math.PI) / 3) * 1.3], [0.5, h, 0.5], mixHex(c, "#000000", 0.06), { material: "Marble", collide: false, lod: 0, rotation: [0, -i * 60, 0] });
  if (opts.broken) {
    b.cylinder([2.5, 0.9, 3], 2.6, 3, c, { material: "Marble", collide: true, lod: 1, rotation: [0, 30, 90] });
  } else {
    b.box([0, 1 + h + 0.4, 0], [3.8, 0.8, 3.8], c, { material: "Marble", collide: true, lod: 1 });
  }
  return done(b, opts.prefabId ?? "column", variant, ["greek", "ruins"], 0.3);
}
export const brokenColumn = (ctx: PrefabContext, v: number): PrefabVariant => column(ctx, v, { broken: true, prefabId: "broken_column" });

export function amphora(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = jitterHex("#b06a40", jitter(ctx.rng, 8), 0, jitter(ctx.rng, 0.08));
  b.cylinder([0, 0.6, 0], 1.2, 1.2, c, { material: "SmoothPlastic", collide: true, lod: 1 });
  b.sphere([0, 2, 0], 2.8, c, { material: "SmoothPlastic", collide: true, lod: 1 });
  b.cylinder([0, 3.7, 0], 1.3, 1.4, c, { material: "SmoothPlastic", collide: false, lod: 0 });
  b.cylinder([0, 4.4, 0], 1.7, 0.3, mixHex(c, "#000000", 0.2), { material: "SmoothPlastic", collide: false, lod: 0 });
  b.cylinder([0, 2.2, 0], 2.85, 0.5, "#2a2a2e", { material: "SmoothPlastic", collide: false, lod: 0 });
  return done(b, "amphora", variant, ["greek", "village"], 0.1);
}

export function marbleStatue(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = "#ece8dc";
  b.box([0, 1, 0], [4, 2, 4], c, { material: "Marble", collide: true, lod: 1 });
  b.box([0, 3.6, 0], [2.4, 3.2, 1.6], c, { material: "Marble", collide: true, lod: 1 });
  b.box([0, 6.2, 0], [2.8, 2.6, 1.6], c, { material: "Marble", collide: true, lod: 1 });
  b.sphere([0, 8.3, 0], 1.6, c, { material: "Marble", collide: false, lod: 1 });
  b.box([-1.9, 6.4, -0.4], [1, 2.6, 1], c, { material: "Marble", collide: false, lod: 0, rotation: [0, 0, 25] });
  b.box([1.9, 5.8, 0.2], [1, 2.6, 1], c, { material: "Marble", collide: false, lod: 0, rotation: [-30, 0, -15] });
  void ctx;
  return done(b, "marble_statue", variant, ["greek", "statue"], 0.2);
}

// ------------------------------------------------------------------ tropical
export function beachUmbrella(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const cols = ["#ff5050", "#ffd040", "#40b0ff", "#ffffff"];
  const col = cols[ctx.rng.int(0, 3)]!;
  b.cylinder([0, 4, 0], 0.3, 8, "#e8e0d0", { material: WOOD, collide: true, lod: 1, rotation: [0, 0, 8] });
  b.sphere([0.6, 8, 0], 9, col, { material: "Fabric", collide: false, lod: 2 });
  b.cylinder([0.6, 5.6, 0], 9.3, 0.4, mixHex(col, "#ffffff", 0.5), { material: "Fabric", collide: false, lod: 1 });
  b.box([2.8, 0.6, 0], [5, 0.6, 2.4], "#e0c880", { material: "Fabric", collide: true, lod: 1 });
  b.box([2.8, 1.6, -0.8], [5, 1.6, 0.4], "#e0c880", { material: "Fabric", collide: false, lod: 0, rotation: [-25, 0, 0] });
  return done(b, "beach_umbrella", variant, ["tropical"], 0.2);
}

export function surfboard(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const cols = ["#ff7a20", "#40b0ff", "#ffd040", "#ff50a0"];
  const col = cols[ctx.rng.int(0, 3)]!;
  b.box([0, 4, 0], [2.2, 8, 0.4], col, { material: "SmoothPlastic", collide: true, lod: 1, rotation: [0, 0, jitter(ctx.rng, 10)] });
  b.box([0, 4, 0.05], [0.4, 7, 0.4], "#ffffff", { material: "SmoothPlastic", collide: false, lod: 0 });
  b.wedge([0, 8.4, 0], [2.2, 1, 0.4], col, { material: "SmoothPlastic", collide: false, lod: 0 });
  return done(b, "surfboard", variant, ["tropical"], 0.5);
}

export function tikiTorch(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  b.cylinder([0, 3.5, 0], 0.5, 7, "#c8b060", { material: WOOD, collide: true, lod: 1 });
  b.cylinder([0, 7.4, 0], 1.6, 1.8, "#8a6a40", { material: "Fabric", collide: false, lod: 0 });
  b.sphere([0, 8.8, 0], 1.6, "#ff8a30", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ff9040", brightness: 1.6, range: 22 }, effect: { kind: "embers", color: "#ff9040", rate: 2, size: 0.25 } });
  void ctx;
  return done(b, "tiki_torch", variant, ["tropical", "light"], 0.5);
}

export function hammock(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = wood(ctx);
  for (const sx of [-1, 1]) b.cylinder([sx * 6, 3, 0], 1, 6, c, { material: WOOD, collide: true, lod: 1, rotation: [0, 0, sx * -8] });
  b.box([0, 3.2, 0], [9, 0.3, 3.4], "#e8d8a0", { material: "Fabric", collide: true, lod: 1, rotation: [0, 0, 0] });
  b.beam([-4.5, 3.2, 0], [-6, 5.4, 0], 0.15, 0.15, "#c8b080", { material: "Fabric", collide: false, lod: 0 });
  b.beam([4.5, 3.2, 0], [6, 5.4, 0], 0.15, 0.15, "#c8b080", { material: "Fabric", collide: false, lod: 0 });
  return done(b, "hammock", variant, ["tropical", "camp"], 0.4);
}

export function tikiStatue(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = wood(ctx);
  b.cylinder([0, 3, 0], 3, 6, c, { material: WOOD, collide: true, lod: 1 });
  b.box([0, 4.4, -1.4], [2.2, 1, 0.6], "#e8e0d0", { material: WOOD, collide: false, lod: 0 });
  b.box([0, 2.6, -1.4], [2.4, 0.6, 0.6], "#e8e0d0", { material: WOOD, collide: false, lod: 0 });
  b.box([0, 1.8, -1.4], [1.8, 0.4, 0.5], "#1a1410", { material: WOOD, collide: false, lod: 0 });
  b.box([0, 6.4, 0], [3.4, 0.8, 3.4], mixHex(c, "#000000", 0.2), { material: WOOD, collide: false, lod: 0 });
  b.sphere([0, 7.2, 0], 1.4, "#ff8a30", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ff9040", brightness: 1, range: 14 } });
  return done(b, "tiki_statue", variant, ["tropical", "jungle", "statue"], 0.3);
}

// ------------------------------------------------------------------ arctic
export function snowman(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  b.sphere([0, 1.8, 0], 4, "#f4f8ff", { material: "Snow", collide: true, lod: 1 });
  b.sphere([0, 4.6, 0], 3, "#f4f8ff", { material: "Snow", collide: true, lod: 1 });
  b.sphere([0, 6.8, 0], 2.2, "#f4f8ff", { material: "Snow", collide: false, lod: 1 });
  b.cylinder([0, 7.0, -1.2], 0.35, 1.2, "#ff7a20", { material: "SmoothPlastic", collide: false, lod: 0, rotation: [90, 0, 0] });
  for (const sx of [-1, 1]) b.sphere([sx * 0.45, 7.3, -0.95], 0.35, "#1a1a1a", { material: "SmoothPlastic", collide: false, lod: 0 });
  for (const sx of [-1, 1]) b.beam([sx * 1.4, 4.8, 0], [sx * 3.6, 6.2, 0], 0.25, 0.25, "#5a4030", { material: WOOD, collide: false, lod: 0 });
  b.cylinder([0, 8.2, 0], 2.2, 0.3, "#1a1a1a", { material: "SmoothPlastic", collide: false, lod: 0 });
  b.cylinder([0, 8.9, 0], 1.5, 1.4, "#1a1a1a", { material: "SmoothPlastic", collide: false, lod: 0 });
  b.box([0, 4.4, -1.4], [2.6, 0.5, 0.3], ctx.style.palette.accent, { material: "Fabric", collide: false, lod: 0 });
  return done(b, "snowman", variant, ["arctic"], 0.3);
}

export function sled(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = wood(ctx);
  for (const sx of [-1, 1]) b.box([sx * 1.4, 0.4, 0], [0.3, 0.6, 7], "#8a8a90", { material: METAL, collide: true, lod: 1 });
  for (const z of [-2, 0, 2]) b.box([0, 1.4, z], [3.4, 0.3, 1], c, { material: WOOD, collide: true, lod: 1 });
  for (const sx of [-1, 1]) for (const z of [-2.5, 0, 2.5]) b.box([sx * 1.4, 0.9, z], [0.3, 0.8, 0.3], c, { material: WOOD, collide: false, lod: 0 });
  b.box([0, 2.4, -3.3], [3.4, 1.8, 0.3], c, { material: WOOD, collide: false, lod: 0, rotation: [-20, 0, 0] });
  return done(b, "sled", variant, ["arctic"], 0.1);
}

export function iceSpike(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const n = rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    const h = rng.float(4, 10);
    const x = jitter(rng, 2);
    const z = jitter(rng, 2);
    b.wedge([x, h / 2, z], [rng.float(1.4, 2.6), h, rng.float(1.4, 2.6)], "#c8e8ff", { material: "Ice", collide: true, lod: 1, rotation: [jitter(rng, 12), rng.float(0, 360), jitter(rng, 12)], transparency: 0.2 });
  }
  b.sphere([0, 1.5, 0], 3, "#e0f0ff", { material: "Ice", collide: false, lod: 0, light: { type: "point", color: "#a0d0ff", brightness: 0.6, range: 14 } });
  return done(b, "ice_spike", variant, ["arctic", "rock", "glow"], 0.6);
}

// ------------------------------------------------------------------ candy
export function lollipop(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const cols = ["#ff4a8a", "#40c0ff", "#ffd040", "#8ae060", "#ff8a30"];
  const col = cols[rng.int(0, 4)]!;
  const h = rng.float(6, 12);
  b.cylinder([0, h / 2, 0], 0.6, h, "#ffffff", { material: "SmoothPlastic", collide: true, lod: 1 });
  b.cylinder([0, h + 2.2, 0], 5, 1, col, { material: "SmoothPlastic", collide: true, lod: 2, rotation: [90, 0, 0] });
  b.cylinder([0, h + 2.2, -0.55], 3.2, 0.2, "#ffffff", { material: "SmoothPlastic", collide: false, lod: 0, rotation: [90, 0, 0] });
  b.cylinder([0, h + 2.2, -0.65], 1.6, 0.2, col, { material: "SmoothPlastic", collide: false, lod: 0, rotation: [90, 0, 0] });
  return done(b, "lollipop", variant, ["candy"], 0.3);
}

export function candyCane(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const h = ctx.rng.float(6, 10);
  b.cylinder([0, h / 2, 0], 1.2, h, "#ffffff", { material: "SmoothPlastic", collide: true, lod: 1 });
  for (let i = 0; i < Math.floor(h / 1.5); i++) b.cylinder([0, 0.75 + i * 1.5, 0], 1.25, 0.6, "#ff3030", { material: "SmoothPlastic", collide: false, lod: 0, rotation: [15, 0, 0] });
  b.cylinder([1.2, h + 0.4, 0], 1.2, 3, "#ffffff", { material: "SmoothPlastic", collide: false, lod: 1, rotation: [0, 0, 90] });
  b.cylinder([2.4, h - 0.6, 0], 1.2, 2.4, "#ff3030", { material: "SmoothPlastic", collide: false, lod: 1 });
  return done(b, "candy_cane", variant, ["candy"], 0.3);
}

export function gumdrop(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const cols = ["#ff4a8a", "#40c0ff", "#ffd040", "#8ae060", "#c080ff"];
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const s = rng.float(2, 4);
    b.sphere([jitter(rng, 2.5), s * 0.4, jitter(rng, 2.5)], s, cols[rng.int(0, 4)]!, { material: "SmoothPlastic", collide: true, lod: 1, transparency: 0.1 });
  }
  return done(b, "gumdrop", variant, ["candy", "rock"], 0.4);
}

export function cupcake(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const cols = ["#ff8ab0", "#ffd0a0", "#c0e0ff"];
  b.cylinder([0, 1.6, 0], 4.2, 3.2, cols[ctx.rng.int(0, 2)]!, { material: "SmoothPlastic", collide: true, lod: 1 });
  b.cylinder([0, 3.6, 0], 4.6, 1, "#e0a060", { material: "SmoothPlastic", collide: true, lod: 1 });
  b.sphere([0, 5.2, 0], 4, "#ffffff", { material: "SmoothPlastic", collide: true, lod: 1 });
  b.sphere([0, 6.8, 0], 2.4, "#fff0f8", { material: "SmoothPlastic", collide: false, lod: 0 });
  b.sphere([0, 8.2, 0], 1.2, "#ff3050", { material: "SmoothPlastic", collide: false, lod: 0 });
  return done(b, "cupcake", variant, ["candy"], 0.2);
}

export function gingerbreadMan(_ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = "#b07040";
  b.box([0, 3.2, 0], [2.4, 3.2, 0.8], c, { material: "SmoothPlastic", collide: true, lod: 1 });
  b.sphere([0, 5.8, 0], 2.2, c, { material: "SmoothPlastic", collide: false, lod: 1 });
  for (const sx of [-1, 1]) b.box([sx * 1.8, 3.8, 0], [1.6, 0.8, 0.8], c, { material: "SmoothPlastic", collide: false, lod: 0, rotation: [0, 0, sx * 30] });
  for (const sx of [-1, 1]) b.box([sx * 0.7, 0.9, 0], [0.9, 1.8, 0.8], c, { material: "SmoothPlastic", collide: false, lod: 0, rotation: [0, 0, sx * 15] });
  for (let i = 0; i < 3; i++) b.sphere([0, 2.4 + i * 0.8, -0.4], 0.4, "#ffffff", { material: "SmoothPlastic", collide: false, lod: 0 });
  for (const sx of [-1, 1]) b.sphere([sx * 0.5, 6.1, -1], 0.3, "#1a1a1a", { material: "SmoothPlastic", collide: false, lod: 0 });
  return done(b, "gingerbread_man", variant, ["candy", "statue"], 0.1);
}

// ------------------------------------------------------------------ underwater
export function clam(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const open = ctx.rng.chance(0.6);
  b.sphere([0, 0.9, 0], 4, "#e8d8c0", { material: "SmoothPlastic", collide: true, lod: 1 });
  b.box([0, 0.5, 0], [4.2, 0.4, 4.2], "#d0c0a8", { material: "SmoothPlastic", collide: false, lod: 0 });
  if (open) {
    b.sphere([0, 3, 1.4], 4, "#e8d8c0", { material: "SmoothPlastic", collide: false, lod: 1, rotation: [-50, 0, 0] });
    b.sphere([0, 1.9, 0], 1.2, "#f8f0ff", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#e0f0ff", brightness: 1, range: 14 } });
  } else {
    b.sphere([0, 1.6, 0], 4, "#e8d8c0", { material: "SmoothPlastic", collide: false, lod: 1 });
  }
  return done(b, "clam", variant, ["underwater"], 0.6);
}

export function shipwreckPiece(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const c = mixHex(wood(ctx), "#3a4a48", 0.4);
  b.box([0, 3, 0], [8, 6, 2], c, { material: "WoodPlanks", collide: true, lod: 2, rotation: [jitter(rng, 10), rng.float(0, 90), rng.float(20, 45)] });
  for (let i = 0; i < 4; i++) b.box([-3 + i * 2, 2, 0], [0.6, 8, 0.4], mixHex(c, "#000000", 0.2), { material: WOOD, collide: false, lod: 1, rotation: [jitter(rng, 10), 0, rng.float(20, 45)] });
  b.cylinder([2, 5, 2], 0.8, 12, mixHex(c, "#000000", 0.1), { material: WOOD, collide: true, lod: 1, rotation: [jitter(rng, 10), 0, 50] });
  b.box([-2, 1, 3], [3, 0.6, 2], "#6a7a70", { material: "Grass", collide: false, lod: 0 });
  return done(b, "shipwreck_piece", variant, ["underwater", "pirate", "ruins"], 0.8);
}

export function bubbleVent(_ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  b.cylinder([0, 0.4, 0], 3, 0.8, "#4a5a58", { material: "Slate", collide: true, lod: 1 });
  b.effect([0, 3, 0], [2, 5, 2], { kind: "sparkle", color: "#c0f0ff", rate: 4, size: 0.4 }, { lod: 1 });
  return done(b, "bubble_vent", variant, ["underwater", "ambience"], 0.5);
}

// ------------------------------------------------------------------ jungle
export function totem(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = wood(ctx);
  const cols = [ctx.style.palette.accent, "#c03030", "#e0b020", "#2a8ab0"];
  for (let i = 0; i < 4; i++) {
    b.box([0, 1.6 + i * 3.2, 0], [3.4, 3.2, 3.4], i % 2 ? c : mixHex(c, cols[i]!, 0.4), { material: WOOD, collide: true, lod: 1 });
    b.box([0, 2.2 + i * 3.2, -1.8], [2.2, 0.5, 0.4], cols[i]!, { material: "SmoothPlastic", collide: false, lod: 0 });
    b.box([0, 1.2 + i * 3.2, -1.8], [1.4, 0.4, 0.4], "#1a1410", { material: WOOD, collide: false, lod: 0 });
  }
  for (const sx of [-1, 1]) b.box([sx * 2.6, 12.4, 0], [2.4, 0.6, 1.2], cols[2]!, { material: WOOD, collide: false, lod: 0, rotation: [0, 0, sx * 20] });
  return done(b, "totem", variant, ["jungle", "tropical", "statue"], 0.4);
}

export function vineCurtain(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const h = rng.float(10, 16);
  b.cylinder([0, h, 0], 1.2, 9, wood(ctx), { material: WOOD, collide: false, lod: 1, rotation: [0, 0, 90] });
  for (let i = 0; i < 7; i++) {
    const x = -4 + i * 1.3 + jitter(rng, 0.3);
    const len = rng.float(h * 0.5, h * 0.95);
    b.cylinder([x, h - len / 2, jitter(rng, 0.4)], 0.3, len, jitterHex(style.palette.foliage, jitter(rng, 10), 0, jitter(rng, 0.06)), { material: "Grass", collide: false, lod: 1 });
    b.sphere([x, h - len, 0], 0.9, style.palette.foliageAlt, { material: "Grass", collide: false, lod: 0 });
  }
  return done(b, "vine_curtain", variant, ["jungle", "forest", "floating"], 0);
}

export function giantLeaf(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng, style } = ctx;
  const b = new PartListBuilder();
  const n = rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 360 + jitter(rng, 20);
    const len = rng.float(5, 8);
    const col = jitterHex(style.palette.foliage, jitter(rng, 12), 0, jitter(rng, 0.06));
    b.box([Math.sin((a * Math.PI) / 180) * len * 0.4, len * 0.35, Math.cos((a * Math.PI) / 180) * len * 0.4], [len * 0.45, 0.2, len], col, { material: "Grass", collide: false, lod: 1, rotation: [-35, a, 0] });
  }
  b.cylinder([0, 1, 0], 1.2, 2, mixHex(style.palette.foliage, "#000000", 0.2), { material: "Grass", collide: false, lod: 0 });
  return done(b, "giant_leaf", variant, ["jungle", "undergrowth"], 0.4);
}

export function junglerum(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = wood(ctx);
  b.cylinder([0, 2, 0], 3.2, 4, c, { material: WOOD, collide: true, lod: 1 });
  b.cylinder([0, 4.1, 0], 3.3, 0.3, "#e0c8a0", { material: "Fabric", collide: false, lod: 0 });
  for (let i = 0; i < 6; i++) b.box([Math.cos(i) * 1.6, 2, Math.sin(i) * 1.6], [0.3, 4.2, 0.3], "#c8a060", { material: "Fabric", collide: false, lod: 0, rotation: [0, -i * 57, 0] });
  return done(b, "jungle_drum", variant, ["jungle", "tropical", "camp"], 0.1);
}

// ------------------------------------------------------------------ horror
export function coffin(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const c = mixHex(wood(ctx), "#000000", 0.3);
  const open = rng.chance(0.4);
  b.box([0, 1.2, 0], [3.4, 2.4, 8], c, { material: WOOD, collide: true, lod: 1, rotation: [0, 0, jitter(rng, 4)] });
  b.wedge([0, 1.2, -4.8], [3.4, 2.4, 1.6], c, { material: WOOD, collide: false, lod: 0, rotation: [0, 90, 0] });
  if (open) b.box([1.4, 3.2, 0], [3.4, 0.4, 8], c, { material: WOOD, collide: false, lod: 1, rotation: [0, 0, 70] });
  else b.box([0, 2.55, 0], [3.5, 0.4, 8.2], mixHex(c, "#000000", 0.2), { material: WOOD, collide: false, lod: 1 });
  b.box([0, 2.7, -1], [0.4, 0.15, 3], "#c0c0c8", { material: METAL, collide: false, lod: 0 });
  b.box([0, 2.7, -1.5], [2, 0.15, 0.4], "#c0c0c8", { material: METAL, collide: false, lod: 0 });
  return done(b, "coffin", variant, ["horror", "graveyard"], 0.2);
}

export function scarecrow(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = wood(ctx);
  b.cylinder([0, 4, 0], 0.5, 8, c, { material: WOOD, collide: true, lod: 1 });
  b.cylinder([0, 6.2, 0], 0.4, 7, c, { material: WOOD, collide: false, lod: 1, rotation: [0, 0, 90] });
  b.box([0, 5.4, 0], [2.4, 3.2, 1.2], "#6a4a34", { material: "Fabric", collide: false, lod: 1 });
  for (const sx of [-1, 1]) b.box([sx * 2.2, 6.2, 0], [2.4, 0.9, 0.9], "#6a4a34", { material: "Fabric", collide: false, lod: 0 });
  b.sphere([0, 7.9, 0], 1.8, "#d8b060", { material: "Fabric", collide: false, lod: 1 });
  for (const sx of [-1, 1]) b.sphere([sx * 0.5, 8.1, -0.8], 0.4, "#1a1410", { material: "SmoothPlastic", collide: false, lod: 0 });
  b.cylinder([0, 9.1, 0], 2.6, 0.3, "#3a2a22", { material: "Fabric", collide: false, lod: 0 });
  b.cylinder([0, 9.8, 0], 1.6, 1.4, "#3a2a22", { material: "Fabric", collide: false, lod: 0 });
  return done(b, "scarecrow", variant, ["horror", "farm"], 0.5);
}

export function jackOLantern(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const s = ctx.rng.float(2.4, 3.6);
  b.sphere([0, s * 0.45, 0], s, "#ff8a20", { material: "SmoothPlastic", collide: true, lod: 1 });
  b.cylinder([0, s * 0.95, 0], 0.5, 1, "#4a6a2a", { material: WOOD, collide: false, lod: 0 });
  for (const sx of [-1, 1]) b.wedge([sx * s * 0.2, s * 0.55, -s * 0.48], [s * 0.2, s * 0.2, 0.2], "#ffe060", { material: "Neon", collide: false, lod: 0 });
  b.box([0, s * 0.3, -s * 0.48], [s * 0.5, s * 0.12, 0.2], "#ffe060", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ff9a30", brightness: 1.2, range: 14 } });
  return done(b, "jack_o_lantern", variant, ["horror", "farm", "light"], 0.2);
}

export function hangingCage(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = "#3a3a40";
  b.cylinder([0, 5, 0], 0.7, 10, wood(ctx), { material: WOOD, collide: true, lod: 1 });
  b.beam([0, 9.8, 0], [0, 9.8, -4], 0.6, 0.6, wood(ctx), { material: WOOD, collide: false, lod: 1 });
  b.beam([0, 9.7, -4], [0, 8, -4], 0.15, 0.15, c, { material: METAL, collide: false, lod: 0 });
  for (let i = 0; i < 6; i++) b.box([Math.cos(i) * 1.3, 5.5, -4 + Math.sin(i) * 1.3], [0.15, 5, 0.15], c, { material: METAL, collide: false, lod: 0 });
  for (const y of [3.2, 5.5, 7.8]) b.cylinder([0, y, -4], 2.8, 0.2, c, { material: METAL, collide: false, lod: 0 });
  return done(b, "hanging_cage", variant, ["horror", "graveyard"], 0.4);
}

export function cobwebCluster(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  b.cylinder([0, 3.5, 0], 0.6, 7, "#3a2a24", { material: WOOD, collide: true, lod: 1, rotation: [jitter(rng, 5), 0, jitter(rng, 5)] });
  b.cylinder([0, 6.4, 0], 0.4, 5, "#3a2a24", { material: WOOD, collide: false, lod: 0, rotation: [0, 0, 90] });
  for (let i = 0; i < 3; i++) b.box([(i - 1) * 1.6, 4.6 - i * 0.4, 0], [rng.float(2.4, 3.2), rng.float(2.8, 3.6), 0.1], "#e8e8f0", { material: "Fabric", collide: false, lod: 0, transparency: 0.5, rotation: [0, i * 35 - 35, jitter(rng, 10)] });
  return done(b, "cobweb_cluster", variant, ["horror", "ruins"], 0.4);
}

// ------------------------------------------------------------------ sports
export function goal(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = "#f4f4f0";
  for (const sx of [-1, 1]) b.cylinder([sx * 7, 4, 0], 0.6, 8, c, { material: "SmoothPlastic", collide: true, lod: 1 });
  b.cylinder([0, 8, 0], 0.6, 14.6, c, { material: "SmoothPlastic", collide: true, lod: 1, rotation: [0, 0, 90] });
  b.box([0, 4, 2.2], [14, 8, 0.15], "#ffffff", { material: "Fabric", collide: false, lod: 1, transparency: 0.55 });
  for (const sx of [-1, 1]) b.wedge([sx * 7, 4, 2.2], [0.3, 8, 4.4], "#ffffff", { material: "Fabric", collide: false, lod: 0, transparency: 0.55, rotation: [0, 180, 0] });
  void ctx;
  return done(b, "goal", variant, ["sports"], 0.3);
}

export function bleachers(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = mixHex(ctx.style.palette.accent, "#8a8a90", 0.5);
  for (let i = 0; i < 4; i++) {
    b.box([0, 0.7 + i * 1.6, i * 2.4], [16, 0.5, 2.4], "#8a8a90", { material: METAL, collide: true, lod: 1 });
    b.box([0, 1.3 + i * 1.6, i * 2.4 + 0.8], [16, 0.6, 0.8], c, { material: "SmoothPlastic", collide: true, lod: 1 });
    b.box([0, (0.7 + i * 1.6) / 2, i * 2.4], [15.6, 0.7 + i * 1.6, 0.4], "#5a5a60", { material: METAL, collide: true, lod: 0 });
  }
  return done(b, "bleachers", variant, ["sports", "carnival"], 0.3);
}

export function floodlight(_ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  b.cylinder([0, 12, 0], 1, 24, "#8a8a90", { material: METAL, collide: true, lod: 2 });
  b.box([0, 24.5, -0.6], [6, 3, 1], "#3a3a40", { material: METAL, collide: false, lod: 1, rotation: [-30, 0, 0] });
  for (let i = 0; i < 3; i++) b.box([-2 + i * 2, 24.5, -1.2], [1.6, 2.2, 0.2], "#fff8e0", { material: "Neon", collide: false, lod: 0, rotation: [-30, 0, 0], light: i === 1 ? { type: "point" as const, color: "#fff4d0", brightness: 3, range: 80 } : undefined });
  return done(b, "floodlight", variant, ["sports", "industrial", "light"], 0.4);
}

// ------------------------------------------------------------------ carnival / playground
export function ticketBooth(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const red = mixHex(ctx.style.palette.accent, "#d03030", 0.5);
  b.box([0, 3.5, 0], [6, 7, 5], "#f4f0e8", { material: "SmoothPlastic", collide: true, lod: 2 });
  for (let i = 0; i < 3; i++) b.box([-2 + i * 2, 3.5, -2.55], [1, 7, 0.1], i % 2 ? "#f4f0e8" : red, { material: "SmoothPlastic", collide: false, lod: 0 });
  b.box([0, 4.6, -2.6], [3.4, 2.4, 0.2], "#a0c8e0", { material: "Glass", collide: false, lod: 0, transparency: 0.3 });
  b.box([0, 3.2, -2.8], [3.8, 0.4, 0.8], "#5a4030", { material: WOOD, collide: false, lod: 0 });
  b.pyramidRoof([0, 8.2, 0], 7.5, 6.5, 2.4, red, { material: "Fabric", collide: true, lod: 1 });
  b.box([0, 7.8, -3.4], [5, 1.2, 0.2], "#ffd040", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ffe080", brightness: 1, range: 14 } });
  return done(b, "ticket_booth", variant, ["carnival"], 0.3);
}

export function balloonCluster(ctx: PrefabContext, variant: number): PrefabVariant {
  const { rng } = ctx;
  const b = new PartListBuilder();
  const cols = ["#ff4a4a", "#40b0ff", "#ffd040", "#8ae060", "#ff70c0", "#ffffff"];
  b.box([0, 0.3, 0], [1.4, 0.6, 1.4], "#5a5a60", { material: METAL, collide: true, lod: 1 });
  for (let i = 0; i < 6; i++) {
    const x = jitter(rng, 1.6);
    const y = 6 + rng.float(0, 3);
    const z = jitter(rng, 1.6);
    b.sphere([x, y, z], rng.float(1.6, 2.4), cols[i % 6]!, { material: "SmoothPlastic", collide: false, lod: 0, reflectance: 0.2 });
    b.beam([0, 0.6, 0], [x, y - 1, z], 0.08, 0.08, "#e8e8e8", { material: "Plastic", collide: false, lod: 0 });
  }
  return done(b, "balloon_cluster", variant, ["carnival", "playground", "candy"], 0.1);
}

export function popcornCart(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const red = mixHex(ctx.style.palette.accent, "#d03030", 0.5);
  b.box([0, 2.6, 0], [5, 2.2, 3.4], red, { material: "SmoothPlastic", collide: true, lod: 1 });
  b.box([0, 5, 0], [4.6, 2.6, 3], "#c0e0f0", { material: "Glass", collide: true, lod: 1, transparency: 0.3 });
  b.box([0, 6.6, 0], [5.2, 0.5, 3.6], red, { material: "SmoothPlastic", collide: false, lod: 0 });
  b.box([0, 4.2, 0], [3.6, 1, 2], "#ffe8a0", { material: "SmoothPlastic", collide: false, lod: 0 });
  for (const sx of [-1, 1]) b.cylinder([sx * 2.6, 1.2, 0], 2.4, 0.5, "#3a3a40", { material: METAL, collide: true, lod: 0, rotation: [0, 0, 90] });
  b.cylinder([0, 3.5, 1.9], 0.3, 4, "#5a4030", { material: WOOD, collide: false, lod: 0, rotation: [0, 0, 90] });
  b.sphere([0, 7.4, 0], 1.6, "#ffe8a0", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ffe8a0", brightness: 0.8, range: 12 } });
  return done(b, "popcorn_cart", variant, ["carnival", "market"], 0.1);
}

export function swingSet(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = mixHex(ctx.style.palette.accent, "#c0c0c8", 0.4);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.beam([sx * 6, 0, sz * 2.4], [sx * 6, 9, 0], 0.5, 0.5, c, { material: METAL, collide: true, lod: 1 });
  b.cylinder([0, 9, 0], 0.5, 12.6, c, { material: METAL, collide: true, lod: 1, rotation: [0, 0, 90] });
  for (const x of [-2.5, 2.5]) {
    for (const dx of [-0.9, 0.9]) b.beam([x + dx, 8.8, 0], [x + dx, 3.2, 0], 0.12, 0.12, "#5a5a60", { material: METAL, collide: false, lod: 0 });
    b.box([x, 3, 0], [2.4, 0.3, 0.9], "#3a3a40", { material: "Rubber", collide: true, lod: 0 });
  }
  return done(b, "swing_set", variant, ["playground", "suburban"], 0.3);
}

export function slide(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = mixHex(ctx.style.palette.accent, "#ffd040", 0.5);
  b.box([0, 6, 3], [4, 0.4, 4], "#8a8a90", { material: METAL, collide: true, lod: 1 });
  for (const sx of [-1, 1]) for (const sz of [1, 5]) b.box([sx * 1.8, 3, sz], [0.4, 6, 0.4], "#8a8a90", { material: METAL, collide: true, lod: 1 });
  b.wedge([0, 3.2, -3.5], [3, 6, 9], c, { material: "SmoothPlastic", collide: true, lod: 1, rotation: [0, 0, 0] });
  for (const sx of [-1, 1]) b.box([sx * 1.55, 4.3, -3.5], [0.2, 0.8, 9], c, { material: "SmoothPlastic", collide: false, lod: 0, rotation: [-33, 0, 0] });
  b.box([0, 4, 6], [4, 0.3, 2.2], "#8a8a90", { material: METAL, collide: true, lod: 0, rotation: [50, 0, 0] });
  return done(b, "slide", variant, ["playground", "suburban"], 0.2);
}

export function seesaw(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = mixHex(ctx.style.palette.accent, "#40b0ff", 0.5);
  b.wedge([0, 1, 0], [2, 2, 3], "#8a8a90", { material: METAL, collide: true, lod: 1 });
  b.box([0, 2.2, 0], [10, 0.4, 1.2], c, { material: "SmoothPlastic", collide: true, lod: 1, rotation: [0, 0, 12] });
  for (const sx of [-1, 1]) b.box([sx * 4.4, 2.3 + sx * 0.9, 0], [1.6, 0.3, 1.6], mixHex(c, "#000000", 0.2), { material: "SmoothPlastic", collide: false, lod: 0, rotation: [0, 0, 12] });
  return done(b, "seesaw", variant, ["playground"], 0.2);
}

export function sandbox(ctx: PrefabContext, variant: number): PrefabVariant {
  const b = new PartListBuilder();
  const c = wood(ctx);
  b.box([0, 0.4, 0], [8, 0.8, 8], "#e8d8a0", { material: "Sand", collide: true, lod: 1 });
  for (const sx of [-1, 1]) {
    b.box([sx * 4, 0.6, 0], [0.6, 1.2, 8.6], c, { material: WOOD, collide: true, lod: 1 });
    b.box([0, 0.6, sx * 4], [8.6, 1.2, 0.6], c, { material: WOOD, collide: true, lod: 1 });
  }
  b.cylinder([1.5, 1.2, -1], 1.4, 0.8, "#ff5050", { material: "SmoothPlastic", collide: false, lod: 0 });
  b.box([-1.5, 1.1, 1.5], [1.2, 0.5, 1.6], "#40b0ff", { material: "SmoothPlastic", collide: false, lod: 0 });
  return done(b, "sandbox", variant, ["playground"], 0.3);
}
