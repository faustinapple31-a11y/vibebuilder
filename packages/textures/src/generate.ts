import { hexToRgb, mixHex, type StyleBible, type TerrainMaterial } from "@worldforge/core";
import { TileCells, TileNoise, clamp01 } from "./noise";

/**
 * Procedural, seamless PBR texture sets (color / normal / roughness) driven by the style palette:
 * grass, ground, rock, sand, snow, cobblestone, planks, bricks, metal, ice… Each kind is a small
 * height + color program over tileable noise; the normal map is derived from the height field.
 */
export const TEXTURE_KINDS = ["grass", "leafy_grass", "ground", "mud", "rock", "slate", "sand", "snow", "cobblestone", "wood_planks", "brick", "metal", "ice", "lava"] as const;
export type TextureKind = (typeof TEXTURE_KINDS)[number];

export interface TextureSpec {
  id: string;
  kind: TextureKind;
  /** Roblox base material this texture overrides (terrain and parts). */
  baseMaterial: TerrainMaterial | "WoodPlanks" | "Brick" | "Metal" | "Concrete";
  /** Hex colors the program mixes. */
  colors: { base: string; alt: string; dark: string; accent?: string };
  /** Studs covered by one tile (MaterialVariant.StudsPerTile). */
  studsPerTile: number;
  normalStrength: number;
  roughness: [number, number];
}

export interface TextureMaps {
  id: string;
  size: number;
  /** RGB8 */
  color: Uint8Array;
  /** RGB8 tangent-space normal */
  normal: Uint8Array;
  /** RGB8 grey */
  roughness: Uint8Array;
}

interface Program {
  height: (u: number, v: number) => number;
  /** 0..1 blend between base and alt, plus optional extra darkening 0..1 */
  color: (u: number, v: number, h: number) => [number, number];
}

function programFor(kind: TextureKind, seed: number): Program {
  const n = new TileNoise(seed);
  const n2 = new TileNoise(seed + 101);
  const knots = new TileCells(seed + 9, 6);
  switch (kind) {
    case "grass":
    case "leafy_grass": {
      const cells = new TileCells(seed + 7, 24);
      return {
        height: (u, v) => {
          const blades = n.streak(u, v, 96, 12) * 0.35 + n2.streak(u, v, 12, 96) * 0.25; // crossed blade streaks
          const clumps = n.fbm(u, v, 6, 4) * 0.6;
          const leaves = kind === "leafy_grass" ? clamp01(1 - cells.sample(u, v)[0] * 3) * 0.35 : 0;
          return clamp01(clumps * 0.6 + blades * 0.5 + leaves);
        },
        color: (u, v) => [n2.fbm(u, v, 4, 3), n.fbm((u + 0.3) % 1, (v + 0.7) % 1, 10, 3) * 0.25],
      };
    }
    case "ground":
    case "mud": {
      const pebbles = new TileCells(seed + 3, 40);
      return {
        height: (u, v) => {
          const soil = n.fbm(u, v, 8, 5);
          const [d] = pebbles.sample(u, v);
          const pebble = clamp01(1 - d * 4) * (kind === "ground" ? 0.5 : 0.2);
          const cracks = kind === "ground" ? (1 - n2.ridged(u, v, 6, 3)) * 0.2 : 0;
          return clamp01(soil * 0.6 + pebble - cracks + 0.1);
        },
        color: (u, v, h) => [n2.fbm(u, v, 5, 3), (1 - h) * 0.35],
      };
    }
    case "rock":
    case "slate": {
      const cells = new TileCells(seed + 11, kind === "slate" ? 6 : 10);
      return {
        height: (u, v) => {
          const [d1, id, d2] = cells.sample(u, v);
          const face = clamp01((d2 - d1) * 2.2); // stone bulge, cracks between cells
          const grain = n.fbm(u, v, 12, 4) * 0.35;
          const strata = kind === "slate" ? Math.abs(((v * 9 + n2.fbm(u, v, 3, 2) * 0.6) % 1) - 0.5) * 0.4 : 0;
          return clamp01(face * 0.55 + grain + id * 0.1 - strata);
        },
        color: (u, v, h) => [cells.sample(u, v)[1], (1 - h) * 0.45 + n2.fbm(u, v, 20, 2) * 0.15],
      };
    }
    case "sand":
      return {
        height: (u, v) => {
          const warp = n2.fbm(u, v, 3, 2) * 0.35;
          const ripples = (Math.sin((v + warp) * Math.PI * 2 * 14) + 1) / 2;
          return clamp01(ripples * 0.35 + n.fbm(u, v, 24, 3) * 0.45 + 0.1);
        },
        color: (u, v, h) => [n.fbm(u, v, 5, 3), (1 - h) * 0.12],
      };
    case "snow":
      return {
        height: (u, v) => clamp01(n.fbm(u, v, 5, 4) * 0.7 + n2.streak(u, v, 64, 64) * 0.08 + 0.15),
        color: (u, v) => [n2.fbm(u, v, 4, 2), n.streak(u, v, 96, 96) > 0.92 ? -0.25 : 0],
      };
    case "cobblestone": {
      const cells = new TileCells(seed + 5, 7);
      return {
        height: (u, v) => {
          const [d1, , d2] = cells.sample(u, v);
          const grout = clamp01((d2 - d1) * 4);
          return clamp01(grout * 0.75 + n.fbm(u, v, 20, 3) * 0.25);
        },
        color: (u, v, h) => [cells.sample(u, v)[1], (1 - h) * 0.5],
      };
    }
    case "wood_planks":
      return {
        height: (u, v) => {
          const rows = 4;
          const row = Math.floor(v * rows);
          const gap = (v * rows) % 1;
          const seam = gap < 0.04 || gap > 0.96 ? 0 : 1;
          const grain = n.streak((u + row * 0.17) % 1, v, 48, 4) * 0.5 + n2.fbm((u + row * 0.31) % 1, v, 8, 2) * 0.5;
          const knot = clamp01(1 - knots.sample(u, v)[0] * 6) * 0.2;
          return clamp01(seam * (0.65 + grain * 0.35 - knot));
        },
        color: (u, v, h) => [n2.streak((u + Math.floor(v * 4) * 0.23) % 1, 0.5, 2, 1), (1 - h) * 0.6],
      };
    case "brick":
      return {
        height: (u, v) => {
          const rows = 8;
          const row = Math.floor(v * rows);
          const shift = row % 2 === 0 ? 0 : 0.5;
          const bu = (u * 4 + shift + 0.25) % 1;
          const bv = (v * rows) % 1;
          const grout = bu < 0.06 || bv < 0.12 ? 0 : 1;
          return clamp01(grout * (0.75 + n.fbm(u, v, 30, 2) * 0.25));
        },
        color: (u, v, h) => [n2.streak((Math.floor(u * 4 + (Math.floor(v * 8) % 2 ? 0.5 : 0) + 0.25) / 4) % 1, (Math.floor(v * 8) + 0.5) / 8, 4, 8), (1 - h) * 0.55],
      };
    case "metal":
      return {
        height: (u, v) => {
          const panel = ((u * 2 + 0.25) % 1 < 0.02 || (v * 2 + 0.25) % 1 < 0.02 ? 0 : 1) * 0.9;
          return clamp01(panel * (0.85 + n.streak(u, v, 200, 6) * 0.15));
        },
        color: (u, v, h) => [n.streak(u, v, 120, 5) * 0.4, (1 - h) * 0.5 + n2.fbm(u, v, 4, 2) * 0.1],
      };
    case "ice":
      return {
        height: (u, v) => clamp01(0.7 + n.fbm(u, v, 3, 3) * 0.2 - (1 - n2.ridged(u, v, 5, 3)) * 0.35),
        color: (u, v, h) => [n2.fbm(u, v, 3, 2), (1 - h) * 0.3],
      };
    case "lava":
      return {
        height: (u, v) => clamp01(n.fbm(u, v, 4, 4) * 0.6 + 0.2),
        color: (u, v) => [clamp01(n2.ridged(u, v, 4, 3) * 1.4 - 0.3), 0],
      };
  }
}

/** Generate the three maps of a texture spec at `size`² pixels (seamless). */
export function generateTexture(spec: TextureSpec, seed: number, size = 512): TextureMaps {
  const prog = programFor(spec.kind, seed);
  const h = new Float32Array(size * size);
  const color = new Uint8Array(size * size * 3);
  const normal = new Uint8Array(size * size * 3);
  const rough = new Uint8Array(size * size * 3);
  const base = hexToRgb(spec.colors.base);
  const alt = hexToRgb(spec.colors.alt);
  const dark = hexToRgb(spec.colors.dark);
  const accent = spec.colors.accent ? hexToRgb(spec.colors.accent) : undefined;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = y * size + x;
      const hv = prog.height(u, v);
      h[i] = hv;
      const [mix, darken] = prog.color(u, v, hv);
      const m = clamp01(mix);
      const dk = clamp01(darken);
      let r = base[0] + (alt[0] - base[0]) * m;
      let g = base[1] + (alt[1] - base[1]) * m;
      let b = base[2] + (alt[2] - base[2]) * m;
      if (spec.kind === "lava" && accent) {
        // glowing veins on dark crust
        r = dark[0] + (accent[0] - dark[0]) * m;
        g = dark[1] + (accent[1] - dark[1]) * m;
        b = dark[2] + (accent[2] - dark[2]) * m;
      } else {
        r += (dark[0] - r) * dk;
        g += (dark[1] - g) * dk;
        b += (dark[2] - b) * dk;
      }
      // subtle height shading keeps the low-poly readability
      const shade = 0.88 + hv * 0.16;
      color[i * 3] = Math.round(clamp01(r * shade) * 255);
      color[i * 3 + 1] = Math.round(clamp01(g * shade) * 255);
      color[i * 3 + 2] = Math.round(clamp01(b * shade) * 255);
      const rg = spec.roughness[0] + (spec.roughness[1] - spec.roughness[0]) * (1 - hv);
      const rv = Math.round(clamp01(rg) * 255);
      rough[i * 3] = rv;
      rough[i * 3 + 1] = rv;
      rough[i * 3 + 2] = rv;
    }
  }
  // normal map from the (tileable) height field — sobel, tangent space, +Y up
  const k = spec.normalStrength * size * 0.02;
  for (let y = 0; y < size; y++) {
    const y0 = (y - 1 + size) % size;
    const y1 = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const x0 = (x - 1 + size) % size;
      const x1 = (x + 1) % size;
      const dx = (h[y0 * size + x1]! + 2 * h[y * size + x1]! + h[y1 * size + x1]! - h[y0 * size + x0]! - 2 * h[y * size + x0]! - h[y1 * size + x0]!) * k;
      const dy = (h[y1 * size + x0]! + 2 * h[y1 * size + x]! + h[y1 * size + x1]! - h[y0 * size + x0]! - 2 * h[y0 * size + x]! - h[y0 * size + x1]!) * k;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 3;
      normal[i] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      normal[i + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      normal[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
    }
  }
  return { id: spec.id, size, color, normal, roughness: rough };
}

/** The texture set a style asks for (terrain materials + the building materials the kits use). */
export function textureSetForStyle(style: StyleBible): TextureSpec[] {
  const p = style.palette;
  const tint = style.environment.terrainTint;
  const mixT = (roblox: string, palette: string) => mixHex(roblox, palette, 0.35 + tint * 0.5);
  const grass = mixT("#5f8a3a", p.foliageAlt);
  const leafy = mixT("#4e7a36", p.foliage);
  const ground = mixT("#6e5a46", p.ground);
  const stone = mixT("#77797c", p.stone);
  const sand = mixT("#d8c898", mixHex(p.ground, "#f0e2b0", 0.6));
  const wood = mixHex("#9a7248", p.wood, 0.6);
  const wall = mixHex("#a58a6a", p.wall, 0.6);
  const specs: TextureSpec[] = [
    { id: "grass", kind: "grass", baseMaterial: "Grass", colors: { base: grass, alt: mixHex(grass, p.foliage, 0.5), dark: mixHex(grass, "#1e2a14", 0.5) }, studsPerTile: 8, normalStrength: 0.7, roughness: [0.9, 0.95] },
    { id: "leafy_grass", kind: "leafy_grass", baseMaterial: "LeafyGrass", colors: { base: leafy, alt: mixHex(leafy, p.ground, 0.35), dark: mixHex(leafy, "#1a2210", 0.5) }, studsPerTile: 8, normalStrength: 0.8, roughness: [0.9, 0.95] },
    { id: "ground", kind: "ground", baseMaterial: "Ground", colors: { base: ground, alt: mixHex(ground, "#a08a6a", 0.4), dark: mixHex(ground, "#241a10", 0.55) }, studsPerTile: 8, normalStrength: 0.9, roughness: [0.85, 0.95] },
    { id: "mud", kind: "mud", baseMaterial: "Mud", colors: { base: mixHex(ground, "#3a2a1c", 0.5), alt: mixHex(ground, "#5a4a3a", 0.3), dark: "#1e1610" }, studsPerTile: 8, normalStrength: 0.6, roughness: [0.55, 0.8] },
    { id: "rock", kind: "rock", baseMaterial: "Rock", colors: { base: stone, alt: mixHex(stone, "#ffffff", 0.18), dark: mixHex(stone, "#101014", 0.6) }, studsPerTile: 10, normalStrength: 1.2, roughness: [0.7, 0.9] },
    { id: "slate", kind: "slate", baseMaterial: "Slate", colors: { base: mixHex(stone, "#3e4a55", 0.45), alt: mixHex(stone, "#8a9098", 0.3), dark: "#15181c" }, studsPerTile: 10, normalStrength: 1.1, roughness: [0.65, 0.85] },
    { id: "sand", kind: "sand", baseMaterial: "Sand", colors: { base: sand, alt: mixHex(sand, "#ffffff", 0.2), dark: mixHex(sand, "#6a5a3a", 0.4) }, studsPerTile: 8, normalStrength: 0.5, roughness: [0.85, 0.95] },
    { id: "snow", kind: "snow", baseMaterial: "Snow", colors: { base: mixHex("#f4f7fb", p.sky, 0.08), alt: mixHex("#dfe8f2", p.sky, 0.15), dark: "#b8c6d6" }, studsPerTile: 8, normalStrength: 0.5, roughness: [0.4, 0.7] },
    { id: "cobblestone", kind: "cobblestone", baseMaterial: "Cobblestone", colors: { base: stone, alt: mixHex(stone, p.ground, 0.35), dark: mixHex(stone, "#101010", 0.7) }, studsPerTile: 6, normalStrength: 1.3, roughness: [0.75, 0.9] },
    { id: "wood_planks", kind: "wood_planks", baseMaterial: "WoodPlanks", colors: { base: wood, alt: mixHex(wood, "#5a3a20", 0.4), dark: mixHex(wood, "#1c1208", 0.7) }, studsPerTile: 6, normalStrength: 0.8, roughness: [0.6, 0.85] },
    { id: "brick", kind: "brick", baseMaterial: "Brick", colors: { base: wall, alt: mixHex(wall, "#6a4a3a", 0.4), dark: mixHex(wall, "#2a2420", 0.7) }, studsPerTile: 6, normalStrength: 1.0, roughness: [0.8, 0.9] },
    { id: "metal", kind: "metal", baseMaterial: "Metal", colors: { base: mixHex("#8a8f96", p.secondary, 0.2), alt: mixHex("#a6abb2", p.secondary, 0.2), dark: "#2c3036" }, studsPerTile: 6, normalStrength: 0.5, roughness: [0.3, 0.55] },
    { id: "ice", kind: "ice", baseMaterial: "Ice", colors: { base: mixHex("#bcdcf0", p.water, 0.3), alt: "#e8f4ff", dark: mixHex("#5a90b8", p.water, 0.5) }, studsPerTile: 8, normalStrength: 0.7, roughness: [0.15, 0.4] },
  ];
  if (style.kits.biomes.includes("volcanic") || style.id === "wasteland") specs.push({ id: "lava", kind: "lava", baseMaterial: "CrackedLava", colors: { base: "#3a1a10", alt: "#ff8a30", dark: "#1a0c08", accent: "#ffb040" }, studsPerTile: 8, normalStrength: 0.9, roughness: [0.6, 0.9] });
  return specs;
}
