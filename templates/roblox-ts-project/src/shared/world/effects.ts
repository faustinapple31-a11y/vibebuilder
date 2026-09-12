import { hexToColor3 } from "./decode";
import type { PartEffect, PartEffectKind } from "./types";

/**
 * Ambient particle presets — mirrors packages/core/src/effects.ts (keep in sync).
 * Textures are Roblox built-ins, so nothing has to be uploaded.
 */
interface EffectPreset {
	texture: string;
	color: string;
	size: [number, number, number];
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

const PRESETS: { [K in PartEffectKind]: EffectPreset } = {
	fireflies: { texture: SPARKLES, color: "#d9ffb0", size: [0, 0.55, 0], transparency: [1, 0.05, 1], lifetime: [3, 6], speed: [0.4, 1.2], spread: 180, acceleration: [0, 0, 0], drag: 0.6, lightEmission: 1, rate: 4, rotSpeed: [0, 0] },
	spores: { texture: SPARKLES, color: "#b48cff", size: [0, 0.45, 0], transparency: [1, 0.1, 1], lifetime: [5, 9], speed: [0.2, 0.6], spread: 180, acceleration: [0, -0.25, 0], drag: 0.3, lightEmission: 1, rate: 4, rotSpeed: [0, 0] },
	embers: { texture: SPARKLES, color: "#ffa03c", size: [0.45, 0.25, 0], transparency: [0, 0.2, 1], lifetime: [0.8, 1.8], speed: [3, 6], spread: 25, acceleration: [0, 4, 0], drag: 1, lightEmission: 1, rate: 8, rotSpeed: [0, 0] },
	smoke: { texture: SMOKE, color: "#9a9a9a", size: [1.5, 3.5, 6], transparency: [0.55, 0.75, 1], lifetime: [3, 6], speed: [1.5, 3], spread: 15, acceleration: [0.6, 0.8, 0], drag: 0.2, lightEmission: 0, rate: 3, rotSpeed: [-20, 20] },
	sparkle: { texture: SPARKLES, color: "#ffffff", size: [0.15, 0.55, 0], transparency: [1, 0, 1], lifetime: [0.8, 1.8], speed: [1, 2.5], spread: 180, acceleration: [0, 0.5, 0], drag: 1.5, lightEmission: 1, rate: 8, rotSpeed: [-90, 90] },
	mist: { texture: SMOKE, color: "#c9d2e0", size: [6, 9, 12], transparency: [1, 0.93, 1], lifetime: [6, 10], speed: [0.3, 0.8], spread: 180, acceleration: [0, 0, 0], drag: 0, lightEmission: 0, rate: 0.8, rotSpeed: [-8, 8] },
};

/** Roblox Neon renders at full intensity: scale the hue down so it does not bloom to white (mirrors core NEON_COLOR_SCALE). */
export const NEON_COLOR_SCALE = 0.62;

function seq3(a: number, b: number, c: number): NumberSequence {
	return new NumberSequence([new NumberSequenceKeypoint(0, a), new NumberSequenceKeypoint(0.5, b), new NumberSequenceKeypoint(1, c)]);
}

/** Creates the ParticleEmitter for an effect part; the part volume is the emission region. */
export function makeEffect(fx: PartEffect): ParticleEmitter {
	const p = PRESETS[fx.kind] ?? PRESETS.fireflies;
	const e = new Instance("ParticleEmitter");
	e.Name = `fx_${fx.kind}`;
	e.Texture = p.texture;
	e.Color = new ColorSequence(hexToColor3(fx.color ?? p.color));
	e.Size = seq3(p.size[0], p.size[1], p.size[2]);
	e.Transparency = seq3(p.transparency[0], p.transparency[1], p.transparency[2]);
	e.Lifetime = new NumberRange(p.lifetime[0], p.lifetime[1]);
	e.Speed = new NumberRange(p.speed[0], p.speed[1]);
	e.RotSpeed = new NumberRange(p.rotSpeed[0], p.rotSpeed[1]);
	e.Rotation = new NumberRange(0, 360);
	e.Rate = fx.rate ?? p.rate;
	e.SpreadAngle = new Vector2(p.spread, p.spread);
	e.Acceleration = new Vector3(p.acceleration[0], p.acceleration[1], p.acceleration[2]);
	e.Drag = p.drag;
	e.LightEmission = p.lightEmission;
	e.LightInfluence = 0;
	e.EmissionDirection = Enum.NormalId.Top;
	e.Enabled = true;
	return e;
}
