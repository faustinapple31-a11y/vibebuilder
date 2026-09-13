import { jitterHex, lightenHex, mixHex, type ArchitectureKit, type PrefabVariant, type RobloxMaterial, type Vec3 } from "@worldforge/core";
import { PartListBuilder, jitter, type PrefabContext } from "../builder";

/**
 * Universal building generator — one parametric house for every architecture kit (medieval cottage,
 * modern house, apartment block, sci-fi module, adobe, pagoda, western façade, bunker, igloo…), with
 * walk-in interiors: a real door opening in the front wall (-Z), floor slabs, furniture, interior
 * light, stairs between floors. Origin = centre of the footprint at ground level; the front faces -Z.
 */

export type RoofType = "gable" | "pyramid" | "flat" | "shed" | "pagoda" | "dome" | "parapet" | "stepped" | "turf";
export type FurnitureSet = "medieval" | "modern" | "scifi" | "shack" | "japanese" | "office" | "temple" | "none";
export type WindowStyle = "square" | "arched" | "wide" | "strip" | "porthole" | "slit" | "none";

export interface BuildingParams {
  kit: ArchitectureKit;
  floors: number;
  width: number;
  depth: number;
  floorHeight: number;
  roof: RoofType;
  roofPitch: number;
  wallMat: RobloxMaterial;
  wallColor: string;
  trimColor: string;
  roofColor: string;
  roofMat: RobloxMaterial;
  windows: WindowStyle;
  windowsPerSide: number;
  furniture: FurnitureSet;
  interiors: boolean;
  chimney: boolean;
  porch: boolean;
  balcony: boolean;
  sign: boolean;
  pillars: boolean;
  stilts: number;
  timber: boolean;
  logs: boolean;
  neon: boolean;
  antenna: boolean;
  damage: number;
  glowColor: string;
  battered: boolean;
  parapet: boolean;
  storefront: boolean;
}

const WALL_T = 0.8;

function paletteColors(ctx: PrefabContext) {
  const { rng, style } = ctx;
  const p = style.palette;
  return {
    wall: jitterHex(p.wall, jitter(rng, 6), jitter(rng, 0.04), jitter(rng, 0.06)),
    roof: jitterHex(p.roof, jitter(rng, 8), jitter(rng, 0.05), jitter(rng, 0.06)),
    stone: jitterHex(p.stone, jitter(rng, 6), 0, jitter(rng, 0.06)),
    wood: jitterHex(p.wood, jitter(rng, 4), 0, -0.1 + jitter(rng, 0.04)),
    accent: p.accent,
    glow: p.glow,
  };
}

/** Kit-specific defaults, randomised per variant. */
export function buildingParams(ctx: PrefabContext, kit: ArchitectureKit, opts: { large?: boolean; floors?: number } = {}): BuildingParams {
  const { rng, style } = ctx;
  const arch = style.architecture;
  const c = paletteColors(ctx);
  const sv = arch.scaleVariance;
  const s = style.scaleRules.buildingScale * rng.float(1 - sv, 1 + sv) * (opts.large ? 1.35 : 1);
  const [fMin, fMax] = arch.floors;
  const floors = opts.floors ?? rng.int(fMin, fMax);
  const base: BuildingParams = {
    kit,
    floors: Math.max(1, floors),
    width: rng.float(14, 20) * s,
    depth: rng.float(11, 16) * s,
    floorHeight: 8.5,
    roof: "gable",
    roofPitch: arch.roofPitch,
    wallMat: style.materials.wall,
    wallColor: c.wall,
    trimColor: c.wood,
    roofColor: c.roof,
    roofMat: style.materials.roof,
    windows: "square",
    windowsPerSide: 2,
    furniture: "medieval",
    interiors: arch.interiors,
    chimney: rng.chance(arch.chimneyChance),
    porch: false,
    balcony: false,
    sign: false,
    pillars: false,
    stilts: 0,
    timber: false,
    logs: false,
    neon: false,
    antenna: false,
    damage: arch.weathering > 0.85 ? (arch.weathering - 0.6) * 2 : 0,
    glowColor: c.glow,
    battered: false,
    parapet: false,
    storefront: false,
  };
  switch (kit) {
    case "medieval_cottage":
      return { ...base, timber: true, chimney: rng.chance(0.7), windows: "square" };
    case "timber_frame":
      return { ...base, timber: true, floors: Math.max(base.floors, rng.chance(0.5) ? 2 : 1), chimney: rng.chance(0.8), windows: "square", wallColor: lightenHex(c.wall, 0.08) };
    case "stone_hut":
      return { ...base, wallMat: style.materials.stoneWall, wallColor: mixHex(c.wall, c.stone, 0.6), roof: rng.chance(0.5) ? "pyramid" : "gable", roofPitch: Math.min(0.8, arch.roofPitch), windows: "square", windowsPerSide: 1, width: base.width * 0.85, depth: base.depth * 0.85 };
    case "elven":
      return { ...base, roof: "dome", wallColor: lightenHex(c.wall, 0.1), windows: "arched", windowsPerSide: 3, trimColor: lightenHex(c.wood, 0.15), floorHeight: 9.5, chimney: false, furniture: "medieval" };
    case "ruined":
      return { ...base, damage: 0.85, wallMat: style.materials.stoneWall, wallColor: mixHex(c.wall, c.stone, 0.5), timber: true, chimney: false, interiors: true };
    case "desert_adobe":
      return { ...base, roof: "parapet", parapet: true, wallMat: "Sandstone", windows: "square", windowsPerSide: 2, trimColor: c.wood, chimney: false, floorHeight: 8, battered: rng.chance(0.4) };
    case "nordic":
      return { ...base, logs: true, roof: "turf", roofPitch: Math.max(1.0, arch.roofPitch), roofMat: "Grass", roofColor: jitterHex(style.palette.foliage, 0, -0.1, -0.1), wallColor: mixHex(c.wood, c.wall, 0.3), windows: "square", windowsPerSide: 2, chimney: rng.chance(0.8), width: base.width * 1.15, depth: base.depth * 0.9 };
    case "cyber_block":
      return { ...base, roof: "flat", wallMat: "Metal", wallColor: mixHex(c.wall, "#2a2a3a", 0.5), windows: "strip", windowsPerSide: 3, neon: true, antenna: rng.chance(0.7), sign: rng.chance(0.6), floors: Math.max(3, base.floors), furniture: "scifi", chimney: false, floorHeight: 8 };
    case "modern_house":
      return { ...base, roof: rng.chance(0.55) ? "gable" : "flat", roofPitch: Math.min(0.6, arch.roofPitch), wallMat: rng.chance(0.5) ? "Concrete" : "Brick", windows: "wide", windowsPerSide: 2, porch: rng.chance(0.7), furniture: "modern", chimney: rng.chance(0.35), width: base.width * 1.15, depth: base.depth * 1.05, trimColor: "#f4f4f0" };
    case "apartment_block":
      return { ...base, roof: "flat", parapet: true, wallMat: "Concrete", windows: "wide", windowsPerSide: 3, balcony: true, floors: Math.max(3, base.floors), furniture: "modern", chimney: false, storefront: rng.chance(0.6), width: base.width * 1.4, depth: base.depth * 1.2, floorHeight: 8 };
    case "skyscraper":
      return { ...base, roof: "flat", parapet: true, wallMat: "Glass", wallColor: mixHex(c.wall, style.palette.sky, 0.5), windows: "strip", windowsPerSide: 4, floors: Math.max(10, base.floors * 4), antenna: true, furniture: "office", chimney: false, width: base.width * 1.6, depth: base.depth * 1.6, floorHeight: 7.5 };
    case "scifi_module":
      return { ...base, roof: "dome", wallMat: "SmoothPlastic", wallColor: lightenHex(c.wall, 0.1), windows: "porthole", windowsPerSide: 2, neon: true, antenna: rng.chance(0.5), furniture: "scifi", chimney: false, trimColor: mixHex(c.wall, "#404050", 0.6), floorHeight: 8 };
    case "shack":
      return { ...base, roof: "shed", roofMat: "CorrodedMetal", roofColor: mixHex(c.roof, "#6a5a48", 0.5), wallMat: "WoodPlanks", windows: "square", windowsPerSide: 1, furniture: "shack", chimney: rng.chance(0.4), damage: Math.max(base.damage, 0.3), width: base.width * 0.8, depth: base.depth * 0.8, floors: 1, floorHeight: 7.5 };
    case "japanese":
      return { ...base, roof: "pagoda", roofColor: mixHex(c.roof, "#3a3a48", 0.5), wallMat: "SmoothPlastic", wallColor: "#f0e8d8", trimColor: mixHex(c.wood, "#3a2a22", 0.5), windows: "wide", windowsPerSide: 3, porch: true, furniture: "japanese", chimney: false, floorHeight: 8 };
    case "western_facade":
      return { ...base, roof: "shed", wallMat: "WoodPlanks", windows: "square", windowsPerSide: 2, porch: true, sign: true, furniture: "shack", chimney: rng.chance(0.3), floors: rng.chance(0.5) ? 2 : 1, width: base.width * 1.1 };
    case "industrial_shed":
      return { ...base, roof: "gable", roofPitch: 0.3, roofMat: "CorrodedMetal", wallMat: "Metal", wallColor: mixHex(c.wall, "#8a8a88", 0.5), windows: "strip", windowsPerSide: 3, furniture: "none", chimney: rng.chance(0.7), width: base.width * 1.6, depth: base.depth * 1.5, floorHeight: 12, floors: 1 };
    case "igloo":
      return { ...base, roof: "dome", wallMat: "Snow", wallColor: "#f0f4f8", windows: "none", furniture: "shack", chimney: false, floors: 1, width: base.width * 0.7, depth: base.width * 0.7, floorHeight: 6 };
    case "tropical_hut":
      return { ...base, roof: "pyramid", roofMat: "Grass", roofColor: jitterHex("#b09050", 0, 0, jitter(rng, 0.08)), wallMat: "WoodPlanks", windows: "wide", windowsPerSide: 2, stilts: 3, porch: true, furniture: "shack", chimney: false, floors: 1 };
    case "gothic":
      return { ...base, roof: "gable", roofPitch: Math.max(1.2, arch.roofPitch), wallMat: "Brick", wallColor: mixHex(c.wall, c.stone, 0.5), windows: "arched", windowsPerSide: 3, floors: Math.max(2, base.floors), chimney: true, furniture: "medieval", trimColor: mixHex(c.stone, "#2a2a30", 0.5) };
    case "greek_temple":
      return { ...base, roof: "gable", roofPitch: 0.45, wallMat: "Marble", wallColor: "#f0ece0", pillars: true, windows: "none", furniture: "temple", chimney: false, width: base.width * 1.4, depth: base.depth * 1.5, floorHeight: 11, floors: 1, trimColor: c.accent, roofColor: mixHex(c.roof, "#c06040", 0.5) };
    case "egyptian":
      return { ...base, roof: "flat", battered: true, wallMat: "Sandstone", wallColor: "#d8c090", windows: "slit", windowsPerSide: 2, furniture: "temple", chimney: false, trimColor: c.accent, width: base.width * 1.3, depth: base.depth * 1.3, floorHeight: 10 };
    case "victorian":
      return { ...base, roof: "gable", roofPitch: Math.max(1.1, arch.roofPitch), wallMat: "Brick", wallColor: mixHex(c.wall, "#8a5a48", 0.5), windows: "arched", windowsPerSide: 3, floors: Math.max(2, base.floors), chimney: true, balcony: rng.chance(0.5), furniture: "medieval", trimColor: "#e8e0d0" };
    case "bunker":
      return { ...base, roof: "flat", wallMat: "Concrete", wallColor: mixHex(c.wall, "#7a7a70", 0.6), windows: "slit", windowsPerSide: 2, furniture: "office", chimney: false, floors: 1, floorHeight: 7, width: base.width * 1.2, trimColor: "#5a5a50" };
    case "candy":
      return { ...base, roof: "gable", roofMat: "SmoothPlastic", roofColor: mixHex(c.roof, "#ff6a9a", 0.5), wallMat: "SmoothPlastic", wallColor: mixHex(c.wall, "#c07a4a", 0.5), windows: "arched", windowsPerSide: 2, chimney: true, furniture: "modern", trimColor: "#ffffff" };
    case "voxel":
      return { ...base, roof: "stepped", wallMat: "WoodPlanks", windows: "square", windowsPerSide: 2, timber: false, furniture: "medieval", chimney: rng.chance(0.5) };
    case "brick_rowhouse":
      return { ...base, roof: "flat", parapet: true, wallMat: "Brick", windows: "square", windowsPerSide: 3, floors: Math.max(2, base.floors), furniture: "modern", chimney: true, storefront: rng.chance(0.4), width: base.width * 0.9, depth: base.depth * 1.2 };
  }
}

function windowColor(p: BuildingParams): string {
  return p.neon ? p.glowColor : p.kit === "skyscraper" ? "#8ab0d0" : "#2a3040";
}

/** Walls of one floor with a door opening in the front (-Z) on the ground floor; windows as inset panes. */
function floorWalls(b: PartListBuilder, p: BuildingParams, y0: number, h: number, floor: number, W: number, D: number, damageSkip: Set<string>): void {
  const t = WALL_T;
  const wallOpts = { material: p.wallMat, collide: true, lod: 2 as const };
  const doorW = 5;
  const doorH = Math.min(h - 1, 7.5);
  // front wall (-Z): split around the door on the ground floor
  if (floor === 0) {
    const sideW = (W - doorW) / 2;
    b.box([-(doorW / 2 + sideW / 2), y0 + h / 2, -D / 2], [sideW, h, t], p.wallColor, wallOpts);
    b.box([doorW / 2 + sideW / 2, y0 + h / 2, -D / 2], [sideW, h, t], p.wallColor, wallOpts);
    b.box([0, y0 + doorH + (h - doorH) / 2, -D / 2], [doorW + 0.4, h - doorH, t], p.wallColor, wallOpts);
    // door frame + open door leaf against the wall
    b.box([-doorW / 2 - 0.35, y0 + doorH / 2, -D / 2], [0.7, doorH, t + 0.3], p.trimColor, { material: "Wood", collide: true, lod: 1 });
    b.box([doorW / 2 + 0.35, y0 + doorH / 2, -D / 2], [0.7, doorH, t + 0.3], p.trimColor, { material: "Wood", collide: true, lod: 1 });
    b.box([0, y0 + doorH + 0.3, -D / 2], [doorW + 1.4, 0.6, t + 0.3], p.trimColor, { material: "Wood", collide: false, lod: 1 });
    if (p.kit !== "scifi_module" && p.kit !== "igloo") b.box([-doorW / 2 + 0.3, y0 + doorH / 2 - 0.2, -D / 2 + t / 2 + 0.3], [0.4, doorH - 0.4, doorW - 0.6], mixHex(p.trimColor, "#000000", 0.25), { material: "Wood", collide: false, lod: 0, rotation: [0, 12, 0] });
  } else if (!damageSkip.has(`f${floor}`)) {
    b.box([0, y0 + h / 2, -D / 2], [W, h, t], p.wallColor, wallOpts);
  }
  if (!damageSkip.has(`b${floor}`)) b.box([0, y0 + h / 2, D / 2], [W, h, t], p.wallColor, wallOpts);
  if (!damageSkip.has(`l${floor}`)) b.box([-W / 2, y0 + h / 2, 0], [t, h, D - t], p.wallColor, wallOpts);
  if (!damageSkip.has(`r${floor}`)) b.box([W / 2, y0 + h / 2, 0], [t, h, D - t], p.wallColor, wallOpts);

  // windows: panes slightly proud of the wall on every side
  if (p.windows !== "none") {
    const wc = windowColor(p);
    const glass = { material: (p.neon ? "Neon" : "Glass") as RobloxMaterial, collide: false, lod: 1 as const, transparency: p.neon ? 0 : 0.25 };
    const frame = { material: "Wood" as RobloxMaterial, collide: false, lod: 0 as const };
    const wy = y0 + h * 0.55;
    const [ww, wh] = p.windows === "wide" ? [4.2, 3.2] : p.windows === "strip" ? [W * 0.8, 2.2] : p.windows === "arched" ? [2.2, 3.6] : p.windows === "porthole" ? [2.4, 2.4] : p.windows === "slit" ? [0.9, 2.4] : [2.4, 2.6];
    const sides: { axis: "x" | "z"; sign: number; len: number }[] = [
      { axis: "z", sign: -1, len: W },
      { axis: "z", sign: 1, len: W },
      { axis: "x", sign: -1, len: D },
      { axis: "x", sign: 1, len: D },
    ];
    for (const side of sides) {
      const n = p.windows === "strip" ? 1 : Math.max(1, Math.round((p.windowsPerSide * side.len) / (side.axis === "z" ? W : D)));
      for (let i = 0; i < n; i++) {
        const along = n === 1 ? 0 : (i / (n - 1) - 0.5) * (side.len - ww - 3);
        // skip the door area on the front ground floor
        if (floor === 0 && side.axis === "z" && side.sign < 0 && Math.abs(along) < doorW / 2 + ww / 2 + 0.3) continue;
        const pos: Vec3 = side.axis === "z" ? [along, wy, side.sign * (D / 2 + t / 2 + 0.05)] : [side.sign * (W / 2 + t / 2 + 0.05), wy, along];
        const size: Vec3 = side.axis === "z" ? [ww, wh, 0.25] : [0.25, wh, ww];
        b.box(pos, size, wc, glass);
        if (p.windows === "porthole") {
          b.cylinder(pos, ww + 0.8, 0.35, p.trimColor, { ...frame, rotation: side.axis === "z" ? [90, 0, 0] : [0, 0, 90] });
        } else if (p.windows !== "strip") {
          const fsize: Vec3 = side.axis === "z" ? [ww + 0.6, 0.35, 0.4] : [0.4, 0.35, ww + 0.6];
          b.box([pos[0], wy + wh / 2 + 0.15, pos[2]], fsize, p.trimColor, frame);
          b.box([pos[0], wy - wh / 2 - 0.15, pos[2]], fsize, p.trimColor, frame);
          if (p.windows === "arched") b.cylinder([pos[0], wy + wh / 2, pos[2]], ww, 0.35, wc, { ...glass, rotation: side.axis === "z" ? [90, 0, 0] : [0, 0, 90] });
        }
      }
    }
  }
}

function roof(b: PartListBuilder, p: BuildingParams, yTop: number, W: number, D: number, rng: PrefabContext["rng"]): number {
  const ro = { material: p.roofMat, collide: true, lod: 2 as const };
  const over = 1.4;
  const rw = W + over * 2;
  const rd = D + over * 2;
  switch (p.roof) {
    case "gable": {
      const rh = Math.max(2.5, D * 0.5 * p.roofPitch);
      if (p.damage > 0.6) {
        // collapsed half: only one slope remains, plus a fallen slab
        b.wedge([0, yTop + rh / 2, -rd / 4], [rw, rh, rd / 2], p.roofColor, { ...ro, rotation: [0, 0, 0] });
        b.box([W * 0.2, yTop - 3, D * 0.3], [rw * 0.4, 0.6, rd * 0.35], p.roofColor, { material: p.roofMat, collide: true, lod: 1, rotation: [22, 15, 8] });
      } else {
        b.gableRoof([0, yTop + rh / 2, 0], rw, rd, rh, p.roofColor, ro);
        b.box([0, yTop + rh + 0.1, 0], [rw + 0.2, 0.6, 0.9], mixHex(p.roofColor, "#000000", 0.2), { material: p.roofMat, collide: false, lod: 1 });
      }
      // gable end walls (triangles approximated by a wedge pair)
      for (const sx of [-1, 1]) {
        b.wedge([sx * (W / 2 - 0.2), yTop + rh / 2, -D / 4], [0.6, rh, D / 2], p.wallColor, { material: p.wallMat, collide: true, lod: 1, rotation: [0, 0, 0] });
        b.wedge([sx * (W / 2 - 0.2), yTop + rh / 2, D / 4], [0.6, rh, D / 2], p.wallColor, { material: p.wallMat, collide: true, lod: 1, rotation: [0, 180, 0] });
      }
      return rh;
    }
    case "turf": {
      const rh = Math.max(3, D * 0.5 * p.roofPitch);
      b.gableRoof([0, yTop + rh / 2, 0], rw, rd, rh, p.roofColor, { ...ro, material: "Grass" });
      b.box([0, yTop + rh + 0.1, 0], [rw + 0.4, 0.8, 1.2], p.trimColor, { material: "Wood", collide: false, lod: 1 });
      for (const sx of [-1, 1]) {
        b.wedge([sx * (W / 2 - 0.2), yTop + rh / 2, -D / 4], [0.6, rh, D / 2], p.wallColor, { material: p.wallMat, collide: true, lod: 1 });
        b.wedge([sx * (W / 2 - 0.2), yTop + rh / 2, D / 4], [0.6, rh, D / 2], p.wallColor, { material: p.wallMat, collide: true, lod: 1, rotation: [0, 180, 0] });
        // dragon-head beams at the gable
        b.box([sx * (W / 2 + 1.2), yTop + rh + 1.2, 0], [1.2, 2.4, 0.9], p.trimColor, { material: "Wood", collide: false, lod: 0, rotation: [0, 0, sx * 25] });
      }
      return rh;
    }
    case "pyramid": {
      const rh = Math.max(3, Math.min(W, D) * 0.45 * p.roofPitch);
      b.pyramidRoof([0, yTop, 0], rw, rd, rh, p.roofColor, ro);
      return rh;
    }
    case "shed": {
      const rh = Math.max(1.8, D * 0.22);
      b.wedge([0, yTop + rh / 2, 0], [rw, rh, rd], p.roofColor, { ...ro, rotation: [0, 180, 0] });
      b.box([0, yTop + rh / 2, D / 2 - 0.3], [W, rh, 0.6], p.wallColor, { material: p.wallMat, collide: true, lod: 1 });
      return rh;
    }
    case "flat":
    case "parapet": {
      b.box([0, yTop + 0.4, 0], [W + 0.6, 0.8, D + 0.6], mixHex(p.roofColor, p.wallColor, 0.3), ro);
      if (p.parapet || p.roof === "parapet") {
        const ph = 1.6;
        b.box([0, yTop + 0.8 + ph / 2, -D / 2], [W + 0.6, ph, 0.7], p.wallColor, { material: p.wallMat, collide: true, lod: 1 });
        b.box([0, yTop + 0.8 + ph / 2, D / 2], [W + 0.6, ph, 0.7], p.wallColor, { material: p.wallMat, collide: true, lod: 1 });
        b.box([-W / 2, yTop + 0.8 + ph / 2, 0], [0.7, ph, D], p.wallColor, { material: p.wallMat, collide: true, lod: 1 });
        b.box([W / 2, yTop + 0.8 + ph / 2, 0], [0.7, ph, D], p.wallColor, { material: p.wallMat, collide: true, lod: 1 });
        if (p.kit === "desert_adobe") for (let i = 0; i < 4; i++) b.cylinder([-W / 2 + 2 + (i * (W - 4)) / 3, yTop + 0.2, -D / 2 - 0.6], 0.7, 1.4, p.trimColor, { material: "Wood", rotation: [90, 0, 0], collide: false, lod: 0 });
      }
      if (p.kit === "modern_house" || p.kit === "apartment_block") b.box([W * 0.25, yTop + 1.6, D * 0.2], [3, 1.6, 2.4], "#a0a0a8", { material: "Metal", collide: false, lod: 0 }); // AC unit
      return 0.8;
    }
    case "stepped": {
      const steps = 4;
      let y = yTop;
      for (let i = 0; i < steps; i++) {
        const f = 1 - (i + 1) / (steps + 0.5);
        b.box([0, y + 1, 0], [rw * f + 1, 2, rd * f + 1], i % 2 ? p.roofColor : mixHex(p.roofColor, "#000000", 0.12), ro);
        y += 2;
      }
      return steps * 2;
    }
    case "pagoda": {
      const rh = Math.max(2.6, D * 0.32);
      b.pyramidRoof([0, yTop, 0], rw + 2.5, rd + 2.5, rh, p.roofColor, ro);
      // upturned eave beams at the corners
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([sx * (rw / 2 + 1.2), yTop + 0.6, sz * (rd / 2 + 1.2)], [3, 0.5, 0.5], p.trimColor, { material: "Wood", collide: false, lod: 0, rotation: [0, sx * sz * -45, sx * 20] });
      // second tier
      b.box([0, yTop + rh + 1.2, 0], [W * 0.55, 2.4, D * 0.55], p.wallColor, { material: p.wallMat, collide: false, lod: 1 });
      b.pyramidRoof([0, yTop + rh + 2.4, 0], W * 0.75, D * 0.75, rh * 0.7, p.roofColor, ro);
      b.box([0, yTop + rh * 1.7 + 3.2, 0], [0.5, 2, 0.5], p.trimColor, { material: "Metal", collide: false, lod: 0 });
      return rh * 1.7 + 3;
    }
    case "dome": {
      const dia = Math.min(W, D) * 1.05;
      const rh = dia / 2;
      if (p.kit === "igloo") {
        b.sphere([0, yTop - dia * 0.35, 0], dia, p.wallColor, { material: p.wallMat, collide: true, lod: 2 });
        return rh * 0.6;
      }
      b.sphere([0, yTop, 0], dia, p.kit === "scifi_module" ? mixHex(p.wallColor, p.glowColor, 0.15) : p.roofColor, { material: p.kit === "scifi_module" ? "Glass" : p.roofMat, collide: true, lod: 2, transparency: p.kit === "scifi_module" ? 0.35 : 0 });
      b.box([0, yTop + 0.3, 0], [W + 1, 0.6, D + 1], p.roofColor, ro); // eave ring hides the sphere/wall junction
      if (p.kit === "elven") for (let i = 0; i < 3; i++) b.cylinder([0, yTop + rh * (0.75 + i * 0.12), 0], dia * (0.6 - i * 0.18), 0.6, p.trimColor, { material: "Wood", collide: false, lod: 0 });
      return rh;
    }
  }
}

function furniture(b: PartListBuilder, p: BuildingParams, y: number, W: number, D: number, rng: PrefabContext["rng"], floor: number): void {
  if (p.furniture === "none" || !p.interiors) return;
  const iw = W - WALL_T * 2 - 1;
  const id = D - WALL_T * 2 - 1;
  const wood = { material: "Wood" as RobloxMaterial, collide: true, lod: 0 as const };
  const fabric = { material: "Fabric" as RobloxMaterial, collide: true, lod: 0 as const };
  const metal = { material: "Metal" as RobloxMaterial, collide: true, lod: 0 as const };
  const dark = mixHex(p.trimColor, "#000000", 0.2);
  const accent = p.glowColor;
  const cx = -iw / 2 + 3.2;
  const cz = id / 2 - 2.6;
  // rug
  b.box([0, y + 0.06, 0], [iw * 0.45, 0.1, id * 0.4], mixHex(accent, p.wallColor, 0.5), { material: "Fabric", collide: false, lod: 0 });
  // interior light
  b.sphere([0, y + p.floorHeight - 1.6, 0], 0.9, accent, { material: "Neon", collide: false, lod: 0, light: { type: "point", color: accent, brightness: 1.2, range: Math.max(W, D) * 1.1 } });
  b.box([0, y + p.floorHeight - 0.5, 0], [0.25, 1.4, 0.25], dark, { material: "Metal", collide: false, lod: 0 });
  switch (p.furniture) {
    case "medieval":
    case "japanese": {
      // bed
      b.box([cx, y + 0.9, cz], [5.2, 1.2, 3.4], p.trimColor, wood);
      b.box([cx, y + 1.7, cz], [5, 0.5, 3.2], p.furniture === "japanese" ? "#e8e0d0" : "#8a4a4a", fabric);
      b.box([cx - 1.8, y + 2.1, cz], [1.2, 0.4, 2.6], "#f0ece0", fabric);
      // table + stools
      b.box([iw * 0.25, y + 2.3, 0], [4.6, 0.4, 3], p.trimColor, wood);
      b.box([iw * 0.25, y + 1.1, 0], [0.7, 2.2, 0.7], dark, wood);
      for (const sz of [-1, 1]) b.cylinder([iw * 0.25, y + 0.8, sz * 2.3], 1.4, 1.6, dark, wood);
      // shelf + chest
      b.box([-iw / 2 - 0.5, y + 4.5, -id / 2 + 2], [1, 3, 3.5], p.trimColor, { ...wood, collide: false });
      b.box([iw / 2 - 1.8, y + 0.9, id / 2 - 1.6], [3, 1.8, 2], dark, wood);
      // fireplace on the back wall
      if (p.chimney && floor === 0) {
        b.box([0, y + 2.2, id / 2 + 0.2], [5, 4.4, 1.6], mixHex(p.wallColor, "#606060", 0.5), { material: "Cobblestone", collide: true, lod: 1 });
        b.box([0, y + 1.1, id / 2 - 0.5], [3, 2, 0.6], "#1a1410", { material: "Slate", collide: false, lod: 0 });
        b.sphere([0, y + 1.2, id / 2 - 0.4], 1.2, "#ff8a30", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ff9040", brightness: 1.5, range: 18 }, effect: { kind: "embers", color: "#ff9040", rate: 2, size: 0.25 } });
      }
      break;
    }
    case "modern":
    case "office": {
      // sofa
      b.box([cx + 1, y + 1, cz - 1], [6, 1.4, 2.6], p.furniture === "office" ? "#5a6a7a" : "#5a7a9a", fabric);
      b.box([cx + 1, y + 2.1, cz + 0.2], [6, 1.8, 0.9], p.furniture === "office" ? "#4a5a6a" : "#4a6a8a", fabric);
      // low table / desk
      b.box([iw * 0.2, y + 1.6, -1], [4.4, 0.3, 2.2], "#f4f4f0", { material: "SmoothPlastic", collide: true, lod: 0 });
      b.box([iw * 0.2, y + 0.8, -1], [0.4, 1.6, 0.4], "#a0a0a8", metal);
      // tv / monitor on the front-facing wall
      b.box([iw * 0.2, y + 4.2, -id / 2 + 0.4], [5, 2.8, 0.3], "#101418", { material: "SmoothPlastic", collide: false, lod: 0 });
      b.box([iw * 0.2, y + 4.2, -id / 2 + 0.28], [4.6, 2.4, 0.1], accent, { material: "Neon", collide: false, lod: 0, transparency: 0.4 });
      // kitchen counter / filing cabinets
      b.box([iw / 2 - 1.5, y + 1.6, id * 0.1], [2.6, 3.2, 6], p.furniture === "office" ? "#8a8a90" : "#e8e4dc", { material: "SmoothPlastic", collide: true, lod: 0 });
      b.box([iw / 2 - 1.5, y + 3.25, id * 0.1], [2.8, 0.3, 6.2], "#3a3a40", { material: "Granite", collide: false, lod: 0 });
      // bed upstairs / desk chairs
      if (floor > 0) {
        b.box([-iw * 0.25, y + 0.9, id * 0.2], [5.2, 1.2, 3.6], "#f4f4f0", { material: "SmoothPlastic", collide: true, lod: 0 });
        b.box([-iw * 0.25, y + 1.7, id * 0.2], [5, 0.5, 3.4], "#6a8ab0", fabric);
      }
      break;
    }
    case "scifi": {
      // console desk with holo screen
      b.box([0, y + 1.5, -id / 2 + 2], [7, 0.4, 2.4], "#c8ccd4", metal);
      b.box([0, y + 0.75, -id / 2 + 2], [6, 1.5, 1.8], "#8a9098", metal);
      b.box([0, y + 3.0, -id / 2 + 1.2], [5.5, 2.6, 0.2], accent, { material: "Neon", collide: false, lod: 0, transparency: 0.35 });
      // pod bed
      b.box([cx + 0.5, y + 1, cz], [5.4, 1.4, 3], "#d8dce4", { material: "SmoothPlastic", collide: true, lod: 0 });
      b.box([cx + 0.5, y + 1.9, cz], [5, 0.5, 2.6], mixHex(accent, "#ffffff", 0.5), { material: "SmoothPlastic", collide: true, lod: 0 });
      // storage crates
      for (let i = 0; i < 3; i++) b.box([iw / 2 - 1.4, y + 1 + (i % 2) * 2, id / 2 - 2 - (i > 1 ? 2.5 : 0)], [2, 2, 2], i % 2 ? "#6a7a8a" : "#a0a8b0", metal);
      // floor light strips
      b.box([0, y + 0.08, -id / 2 + 0.8], [iw - 2, 0.1, 0.3], accent, { material: "Neon", collide: false, lod: 0 });
      b.box([0, y + 0.08, id / 2 - 0.8], [iw - 2, 0.1, 0.3], accent, { material: "Neon", collide: false, lod: 0 });
      break;
    }
    case "shack": {
      b.box([cx, y + 0.8, cz], [5, 1, 3.2], dark, wood);
      b.box([cx, y + 1.5, cz], [4.8, 0.4, 3], "#7a6a58", fabric);
      b.box([iw * 0.3, y + 2.0, 0], [3.8, 0.35, 2.4], p.trimColor, wood);
      b.box([iw * 0.3, y + 1.0, 0], [0.6, 2, 0.6], dark, wood);
      for (let i = 0; i < 3; i++) b.box([iw / 2 - 1.5 - i * 0.3, y + 1 + i * 0.1, id / 2 - 1.6 - i * 2.2], [2, 2, 2], jitterHex("#8a6a48", 0, 0, jitter(rng, 0.1)), wood);
      b.cylinder([-iw / 2 + 1.5, y + 1.3, -id / 2 + 2], 2, 2.6, "#5a5048", { material: "CorrodedMetal", collide: true, lod: 0 });
      break;
    }
    case "temple": {
      b.box([0, y + 1.5, id * 0.3], [6, 3, 3], "#e8e4dc", { material: "Marble", collide: true, lod: 1 });
      b.box([0, y + 4.5, id * 0.3], [3, 3, 2], p.trimColor, { material: "Marble", collide: true, lod: 1 });
      for (const sx of [-1, 1]) {
        b.cylinder([sx * 2.6, y + 1.2, -id * 0.2], 1, 2.4, "#6a5a48", { material: "Metal", collide: true, lod: 0 });
        b.sphere([sx * 2.6, y + 2.8, -id * 0.2], 1, "#ff9040", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ff9040", brightness: 1.2, range: 16 } });
      }
      break;
    }
  }
}

function stairs(b: PartListBuilder, p: BuildingParams, y: number, W: number, D: number): void {
  // wedge ramp along the right wall from this floor to the next, with a landing cut in the upper slab
  const len = Math.min(D - WALL_T * 2 - 2, p.floorHeight * 1.3);
  const x = W / 2 - WALL_T - 1.8;
  b.wedge([x, y + p.floorHeight / 2, D / 2 - WALL_T - 1 - len / 2], [3, p.floorHeight, len], p.trimColor, { material: "Wood", collide: true, lod: 1, rotation: [0, 0, 0] });
  b.box([x - 1.7, y + p.floorHeight / 2, D / 2 - WALL_T - 1 - len / 2], [0.3, p.floorHeight, len], mixHex(p.trimColor, "#000000", 0.2), { material: "Wood", collide: true, lod: 0 }); // railing
}

/** The universal house. `kit` defaults to the style's architecture kit. */
export function house(ctx: PrefabContext, variant: number, opts: { kit?: ArchitectureKit; large?: boolean; floors?: number; prefabId?: string } = {}): PrefabVariant {
  const { rng, style } = ctx;
  const kit = opts.kit ?? style.architecture.style;
  const p = buildingParams(ctx, kit, { large: opts.large, floors: opts.floors });
  const b = new PartListBuilder();
  const W = p.width;
  const D = p.depth;
  const H = p.floorHeight;
  const stiltH = p.stilts > 0 ? 4 : 0;
  const base = 1.5 + stiltH;

  // foundation / stilts
  if (p.stilts > 0) {
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) b.cylinder([sx * (W / 2 - 1.5), stiltH / 2 - 0.6, sz * (D / 2 - 1.5)], 1.2, stiltH + 1.4, p.trimColor, { material: "Wood", collide: true, lod: 1 });
    b.box([0, base - 0.4, 0], [W + 1.2, 0.8, D + 1.2], p.trimColor, { material: "WoodPlanks", collide: true, lod: 2 });
  } else {
    b.box([0, 0.2, 0], [W + 1.6, 2.6, D + 1.6], mixHex(p.wallColor, style.palette.stone, p.kit === "skyscraper" || p.kit === "apartment_block" ? 0.2 : 0.6), { material: p.kit === "modern_house" || p.kit === "apartment_block" || p.kit === "skyscraper" || p.kit === "bunker" ? "Concrete" : style.materials.stoneWall, collide: true, lod: 2 });
  }
  // interior floor slab + ceiling per floor
  const damageSkip = new Set<string>();
  if (p.damage > 0.5) {
    const sides = ["l", "r", "b"];
    damageSkip.add(`${sides[rng.int(0, 2)]}${p.floors - 1}`);
    if (p.damage > 0.8 && p.floors > 1) damageSkip.add(`f${p.floors - 1}`);
  }
  const floorMat: RobloxMaterial = p.furniture === "modern" || p.furniture === "office" ? "SmoothPlastic" : p.furniture === "scifi" ? "Metal" : p.furniture === "temple" ? "Marble" : "WoodPlanks";
  const floorColor = p.furniture === "scifi" ? "#a8b0b8" : p.furniture === "modern" ? "#d8d0c0" : p.furniture === "temple" ? "#e8e4dc" : mixHex(p.trimColor, "#000000", 0.1);
  const walkable = p.interiors && p.furniture !== "none";
  const interiorFloors = p.kit === "skyscraper" ? 1 : p.floors;
  for (let f = 0; f < p.floors; f++) {
    const y0 = base + f * H;
    if (f === 0) b.box([0, y0 - 0.25, 0], [W - WALL_T, 0.5, D - WALL_T], floorColor, { material: floorMat, collide: true, lod: 2 });
    floorWalls(b, p, y0, H, f, W, D, damageSkip);
    if (walkable && f < interiorFloors) furniture(b, p, y0, W, D, rng, f);
    if (f < p.floors - 1) {
      // upper slab with a stair opening along the right wall
      const openW = 3.6;
      if (walkable && f < interiorFloors) {
        b.box([-openW / 2, y0 + H - 0.25, 0], [W - WALL_T - openW, 0.5, D - WALL_T], floorColor, { material: floorMat, collide: true, lod: 2 });
        b.box([W / 2 - WALL_T / 2 - openW / 2, y0 + H - 0.25, -D * 0.25], [openW, 0.5, D * 0.5 - WALL_T], floorColor, { material: floorMat, collide: true, lod: 2 });
        stairs(b, p, y0, W, D);
      } else {
        b.box([0, y0 + H - 0.25, 0], [W - WALL_T, 0.5, D - WALL_T], floorColor, { material: floorMat, collide: true, lod: 2 });
      }
      // floor band outside
      if (p.kit !== "skyscraper") b.box([0, y0 + H, 0], [W + 0.6, 0.5, D + 0.6], p.trimColor, { material: p.timber || p.logs ? "Wood" : p.wallMat, collide: false, lod: 1 });
      if (p.balcony && f > 0) {
        b.box([0, y0 + 0.3, -D / 2 - 1.6], [W * 0.5, 0.5, 3], mixHex(p.wallColor, "#000000", 0.1), { material: "Concrete", collide: true, lod: 1 });
        b.box([0, y0 + 1.5, -D / 2 - 3], [W * 0.5, 2, 0.25], "#3a3a40", { material: "Metal", collide: true, lod: 0, transparency: 0.3 });
      }
    }
  }
  const yTop = base + p.floors * H;
  // ceiling of the top floor (so the interior has a lid under the roof)
  b.box([0, yTop - 0.25, 0], [W - WALL_T, 0.5, D - WALL_T], p.roof === "flat" || p.roof === "parapet" ? mixHex(p.roofColor, p.wallColor, 0.3) : floorColor, { material: floorMat, collide: true, lod: 2 });
  const rh = roof(b, p, yTop, W, D, rng);

  // timber frame beams
  if (p.timber) {
    const bw = 0.7;
    const beam = { material: "Wood" as RobloxMaterial, collide: false, lod: 1 as const };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([(sx * W) / 2, base + (p.floors * H) / 2, (sz * D) / 2], [bw, p.floors * H + 0.2, bw], p.trimColor, beam);
    for (let f = 0; f <= p.floors; f++) {
      for (const sz of [-1, 1]) b.box([0, base + f * H - (f === p.floors ? bw / 2 : 0), sz * (D / 2 + 0.05)], [W + bw, bw, bw * 0.8], p.trimColor, beam);
      for (const sx of [-1, 1]) b.box([sx * (W / 2 + 0.05), base + f * H - (f === p.floors ? bw / 2 : 0), 0], [bw * 0.8, bw, D + bw], p.trimColor, beam);
    }
    for (const sx of [-1, 1]) b.box([sx * W * 0.28, base + H * 0.5, -D / 2 - 0.05], [bw * 0.7, H * 0.9, bw * 0.5], p.trimColor, { ...beam, lod: 0, rotation: [0, 0, sx * 32] });
  }
  // log walls (nordic): horizontal logs proud of the wall
  if (p.logs) {
    const n = Math.floor((p.floors * H) / 1.6);
    for (let i = 0; i < n; i++) {
      const y = base + 0.8 + i * 1.6;
      const col = jitterHex(p.wallColor, 0, 0, jitter(rng, 0.06));
      b.cylinder([0, y, -D / 2 - 0.2], 1.3, W + 1.6, col, { material: "Wood", collide: false, lod: i % 2 ? 0 : 1, rotation: [0, 0, 90] });
      b.cylinder([0, y, D / 2 + 0.2], 1.3, W + 1.6, col, { material: "Wood", collide: false, lod: i % 2 ? 0 : 1, rotation: [0, 0, 90] });
      b.cylinder([-W / 2 - 0.2, y, 0], 1.3, D + 1.6, col, { material: "Wood", collide: false, lod: i % 2 ? 0 : 1, rotation: [90, 0, 0] });
      b.cylinder([W / 2 + 0.2, y, 0], 1.3, D + 1.6, col, { material: "Wood", collide: false, lod: i % 2 ? 0 : 1, rotation: [90, 0, 0] });
    }
  }
  // porch / awning
  if (p.porch) {
    const pd = 4.5;
    b.box([0, base - 0.3, -D / 2 - pd / 2], [W * 0.9, 0.6, pd], p.trimColor, { material: "WoodPlanks", collide: true, lod: 1 });
    if (p.kit !== "japanese") {
      for (const sx of [-1, 1]) b.box([sx * W * 0.4, base + 3.6, -D / 2 - pd + 0.5], [0.6, 7.2, 0.6], p.trimColor, { material: "Wood", collide: true, lod: 1 });
      b.wedge([0, base + 7.7, -D / 2 - pd / 2], [W * 0.95, 1.4, pd + 0.6], p.roofColor, { material: p.roofMat, collide: true, lod: 1, rotation: [0, 180, 0] });
    } else {
      for (const sx of [-1, 1]) b.box([sx * W * 0.42, base + 3.4, -D / 2 - pd + 0.5], [0.5, 6.8, 0.5], p.trimColor, { material: "Wood", collide: true, lod: 1 });
      b.box([0, base + 7.2, -D / 2 - pd / 2], [W * 0.95, 0.5, pd + 0.6], p.roofColor, { material: p.roofMat, collide: true, lod: 1 });
    }
    if (p.kit === "modern_house") {
      // driveway + garage door
      b.box([W * 0.32, 0.9, -D / 2 - 6], [7, 0.4, 10], "#8a8a88", { material: "Concrete", collide: true, lod: 1 });
    }
  }
  // western false front + sign
  if (p.sign) {
    const fh = p.kit === "western_facade" ? 4 : 2.4;
    if (p.kit === "western_facade") b.box([0, yTop + fh / 2 - 0.2, -D / 2 - 0.1], [W + 1.2, fh + 0.4, 0.8], p.wallColor, { material: p.wallMat, collide: true, lod: 1 });
    b.box([0, yTop + (p.kit === "western_facade" ? fh * 0.55 : H * 0.85 - yTop + base + H * 0.85), -D / 2 - 0.6], [W * 0.6, 2, 0.3], p.kit === "cyber_block" ? p.glowColor : p.trimColor, { material: p.kit === "cyber_block" ? "Neon" : "Wood", collide: false, lod: 1, light: p.kit === "cyber_block" ? { type: "point" as const, color: p.glowColor, brightness: 1.5, range: 20 } : undefined });
  }
  // neon strips (cyber) — one per floor along the front and sides
  if (p.neon) {
    const col = p.kit === "scifi_module" ? p.glowColor : rng.chance(0.5) ? p.glowColor : style.palette.accent;
    for (let f = 0; f < p.floors; f++) {
      const y = base + f * H + H * 0.92;
      b.box([0, y, -D / 2 - 0.5], [W + 0.6, 0.35, 0.3], col, { material: "Neon", collide: false, lod: 1, light: f === 0 ? { type: "point" as const, color: col, brightness: 1.2, range: 22 } : undefined });
      if (f % 2 === 0) b.box([W / 2 + 0.5, y, 0], [0.3, 0.35, D + 0.6], col, { material: "Neon", collide: false, lod: 0 });
    }
  }
  // chimney
  if (p.chimney && p.roof !== "dome" && p.roof !== "pagoda") {
    const cx = W * 0.28;
    const ch = rh + 3;
    b.box([cx, yTop + ch / 2 - 0.5, D * 0.2], [2.2, ch, 2.2], mixHex(p.wallColor, style.palette.stone, 0.7), { material: p.kit === "industrial_shed" ? "Metal" : style.materials.stoneWall, collide: true, lod: 1 });
    b.box([cx, yTop + ch - 0.2, D * 0.2], [2.8, 0.6, 2.8], mixHex(style.palette.stone, "#000000", 0.2), { material: style.materials.stoneWall, collide: false, lod: 0 });
    if (p.damage < 0.5 && p.kit !== "industrial_shed") b.effect([cx, yTop + ch + 1.5, D * 0.2], [2, 3, 2], { kind: "smoke", color: "#c8c8c8", rate: 1.5, size: 1.2 }, { lod: 0 });
  }
  // antenna / rooftop tech
  if (p.antenna) {
    b.cylinder([W * 0.3, yTop + rh + 4, D * 0.25], 0.4, 8, "#c0c4c8", { material: "Metal", collide: false, lod: 1 });
    b.sphere([W * 0.3, yTop + rh + 8.2, D * 0.25], 0.8, "#ff4040", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ff4040", brightness: 1, range: 12 } });
    b.box([-W * 0.25, yTop + rh + 1.2, -D * 0.2], [4, 2.4, 3], "#9aa0a8", { material: "Metal", collide: false, lod: 0 });
  }
  // pillars (temple)
  if (p.pillars) {
    const col = { material: "Marble" as RobloxMaterial, collide: true, lod: 1 as const };
    const nx = Math.max(3, Math.round(W / 5));
    const nz = Math.max(3, Math.round(D / 5));
    const y = base + (p.floors * H) / 2;
    for (let i = 0; i < nx; i++) for (const sz of [-1, 1]) b.cylinder([-W / 2 - 2 + ((W + 4) * i) / (nx - 1), y, sz * (D / 2 + 2)], 1.6, p.floors * H, "#f0ece0", col);
    for (let i = 1; i < nz - 1; i++) for (const sx of [-1, 1]) b.cylinder([sx * (W / 2 + 2), y, -D / 2 - 2 + ((D + 4) * i) / (nz - 1)], 1.6, p.floors * H, "#f0ece0", col);
    b.box([0, yTop + 0.5, 0], [W + 6, 1.4, D + 6], "#f0ece0", { material: "Marble", collide: true, lod: 2 }); // entablature
    b.box([0, 1.1, 0], [W + 7, 1.2, D + 7], "#e8e4dc", { material: "Marble", collide: true, lod: 2 }); // stylobate
    b.box([0, 2.2, 0], [W + 5, 1.2, D + 5], "#ece8dc", { material: "Marble", collide: true, lod: 2 });
    b.box([0, base + 1.4, -D / 2 - 3.6], [6, 0.4, 0.4], p.trimColor, { material: "Marble", collide: false, lod: 0 });
  }
  // battered (sloped) outer skin for egyptian pylons
  if (p.battered) {
    for (const sx of [-1, 1]) b.wedge([sx * (W / 2 + 1.2), base + (p.floors * H) / 2, 0], [D + 2, p.floors * H, 2.4], p.wallColor, { material: p.wallMat, collide: true, lod: 1, rotation: [0, sx * 90, 0] });
    b.box([0, yTop + 0.2, -D / 2 - 0.4], [W + 3, 1.4, 1.4], p.trimColor, { material: "Sandstone", collide: false, lod: 0 });
    b.box([0, base + 3, -D / 2 - 0.6], [W * 0.7, 0.4, 0.3], p.trimColor, { material: "SmoothPlastic", collide: false, lod: 0 });
  }
  // storefront (ground floor shop window + awning)
  if (p.storefront) {
    b.box([W * 0.3, base + H * 0.45, -D / 2 - 0.6], [W * 0.35, H * 0.6, 0.3], "#8ab0d0", { material: "Glass", collide: false, lod: 1, transparency: 0.3 });
    b.wedge([W * 0.3, base + H * 0.82, -D / 2 - 1.4], [W * 0.38, 1.2, 2.4], style.palette.accent, { material: "Fabric", collide: false, lod: 1, rotation: [0, 180, 0] });
  }
  // damage dressing: rubble, boarded windows, vines
  if (p.damage > 0.3) {
    for (let i = 0; i < 4; i++) {
      const a = rng.float(0, Math.PI * 2);
      const r = Math.max(W, D) * 0.5 + rng.float(0.5, 3);
      b.box([Math.cos(a) * r, 0.6, Math.sin(a) * r], [rng.float(1.5, 3), rng.float(0.8, 1.6), rng.float(1.5, 3)], mixHex(p.wallColor, style.palette.stone, 0.5), { material: style.materials.stoneWall, collide: true, lod: 0, rotation: [0, rng.float(0, 90), rng.float(-15, 15)] });
    }
    for (let i = 0; i < 2; i++) b.box([(i - 0.5) * W * 0.5, base + H * 0.55, -D / 2 - 0.5], [3.2, 0.5, 0.3], mixHex(p.trimColor, "#000000", 0.25), { material: "Wood", collide: false, lod: 0, rotation: [0, 0, i ? 18 : -14] });
    b.box([W / 2 + 0.6, base + H * 0.5, D * 0.1], [0.4, H * 0.9, D * 0.5], style.palette.foliageAlt, { material: "LeafyGrass", collide: false, lod: 0, transparency: 0.15 });
  }
  const tags = ["building", kit, p.interiors ? "interior" : "shell", `floors:${p.floors}`];
  return b.build({ id: `${opts.prefabId ?? "house"}/${variant}`, prefab: opts.prefabId ?? "house", category: "building", sinkDepth: p.stilts > 0 ? 1.2 : 1.0, tags });
}

export const houseLarge = (ctx: PrefabContext, variant: number): PrefabVariant => house(ctx, variant, { large: true, prefabId: "house_large" });
export const houseTower = (ctx: PrefabContext, variant: number): PrefabVariant => house(ctx, variant, { kit: "skyscraper", prefabId: "skyscraper" });
export const houseApartment = (ctx: PrefabContext, variant: number): PrefabVariant => house(ctx, variant, { kit: "apartment_block", prefabId: "apartment_block" });
export const houseShop = (ctx: PrefabContext, variant: number): PrefabVariant => house(ctx, variant, { kit: ctx.style.architecture.style === "apartment_block" || ctx.style.architecture.style === "skyscraper" ? "brick_rowhouse" : ctx.style.architecture.style, floors: 1, prefabId: "shop_building" });
