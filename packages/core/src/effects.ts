import type { PartEffectKind } from "./partlist";

/**
 * Particle presets shared by the Roblox runtime (prefabFactory.ts mirrors this table), the .rbxmx
 * writer and the viewer. Textures are Roblox built-ins (`rbxasset://`), so no asset upload is needed.
 */
export interface EffectPreset {
  texture: string;
  color: string;
  /** [start, end] particle size (studs). */
  size: [number, number, number];
  /** Transparency keypoints [t0, mid, t1]. */
  transparency: [number, number, number];
  lifetime: [number, number];
  speed: [number, number];
  spread: number;
  acceleration: [number, number, number];
  drag: number;
  lightEmission: number;
  rate: number;
  rotSpeed: [number, number];
}

const SPARKLES = "rbxasset://textures/particles/sparkles_main.dds";
const SMOKE = "rbxasset://textures/particles/smoke_main.dds";

export const EFFECT_PRESETS: Record<PartEffectKind, EffectPreset> = {
  fireflies: { texture: SPARKLES, color: "#d9ffb0", size: [0, 0.55, 0], transparency: [1, 0.05, 1], lifetime: [3, 6], speed: [0.4, 1.2], spread: 180, acceleration: [0, 0, 0], drag: 0.6, lightEmission: 1, rate: 4, rotSpeed: [0, 0] },
  spores: { texture: SPARKLES, color: "#b48cff", size: [0, 0.45, 0], transparency: [1, 0.1, 1], lifetime: [5, 9], speed: [0.2, 0.6], spread: 180, acceleration: [0, -0.25, 0], drag: 0.3, lightEmission: 1, rate: 4, rotSpeed: [0, 0] },
  embers: { texture: SPARKLES, color: "#ffa03c", size: [0.45, 0.25, 0], transparency: [0, 0.2, 1], lifetime: [0.8, 1.8], speed: [3, 6], spread: 25, acceleration: [0, 4, 0], drag: 1, lightEmission: 1, rate: 8, rotSpeed: [0, 0] },
  smoke: { texture: SMOKE, color: "#9a9a9a", size: [1.5, 3.5, 6], transparency: [0.55, 0.75, 1], lifetime: [3, 6], speed: [1.5, 3], spread: 15, acceleration: [0.6, 0.8, 0], drag: 0.2, lightEmission: 0, rate: 3, rotSpeed: [-20, 20] },
  sparkle: { texture: SPARKLES, color: "#ffffff", size: [0.15, 0.55, 0], transparency: [1, 0, 1], lifetime: [0.8, 1.8], speed: [1, 2.5], spread: 180, acceleration: [0, 0.5, 0], drag: 1.5, lightEmission: 1, rate: 8, rotSpeed: [-90, 90] },
  mist: { texture: SMOKE, color: "#c9d2e0", size: [6, 9, 12], transparency: [1, 0.93, 1], lifetime: [6, 10], speed: [0.3, 0.8], spread: 180, acceleration: [0, 0, 0], drag: 0, lightEmission: 0, rate: 0.8, rotSpeed: [-8, 8] },
};

/**
 * Roblox Neon renders at full emissive intensity: a bright hex reads as white under bloom at night.
 * Runtime + exporter scale Neon part colors by this factor so the hue survives (lights keep the full color).
 */
export const NEON_COLOR_SCALE = 0.62;

/** Kinds that read as glowing motes (the viewer draws a few static emissive points for them). */
export const GLOWING_EFFECTS: PartEffectKind[] = ["fireflies", "spores", "embers", "sparkle"];
