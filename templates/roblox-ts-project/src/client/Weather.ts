import { Lighting, RunService, Workspace } from "@rbxts/services";

/**
 * Ambient weather layer: a ParticleEmitter in an invisible part that follows the camera, configured
 * from the Lighting attributes the world builder writes (`WeatherKind`, `WeatherIntensity`,
 * `WeatherColor`). Rain, snow, ash, dust, sandstorm, petals, leaves fall from above the camera;
 * spores, fireflies, embers and bubbles drift around it. Only engine textures (rbxasset://) are used.
 * Changing the attributes at runtime (a storm system, a day/night script) re-configures the layer.
 */
interface WeatherPreset {
	/** Emitter volume placed relative to the camera (studs): size and vertical offset. */
	volume: Vector3;
	offsetY: number;
	rate: number;
	lifetime: NumberRange;
	speed: NumberRange;
	acceleration: Vector3;
	size: NumberSequence;
	transparency: NumberSequence;
	lightEmission: number;
	direction: Enum.NormalId;
	orientation: Enum.ParticleOrientation;
	rotSpeed: NumberRange;
	drag: number;
	spread: Vector2;
	texture?: string;
	/** Multiply the preset color by the attribute color (false = keep the preset white). */
	tint: boolean;
}

const SPARKLE = "rbxasset://textures/particles/sparkles_main.dds";
const SMOKE = "rbxasset://textures/particles/smoke_main.dds";

const seq = (a: number, b: number) => new NumberSequence(a, b);
const fade = (peak: number) => new NumberSequence([new NumberSequenceKeypoint(0, 1), new NumberSequenceKeypoint(0.15, peak), new NumberSequenceKeypoint(0.85, peak), new NumberSequenceKeypoint(1, 1)]);
const blink = (peak: number) =>
	new NumberSequence([
		new NumberSequenceKeypoint(0, 1),
		new NumberSequenceKeypoint(0.2, peak),
		new NumberSequenceKeypoint(0.35, 1),
		new NumberSequenceKeypoint(0.55, peak),
		new NumberSequenceKeypoint(0.75, 1),
		new NumberSequenceKeypoint(1, 1),
	]);

const falling = (over: Partial<WeatherPreset>): WeatherPreset => ({
	volume: new Vector3(140, 2, 140),
	offsetY: 42,
	rate: 200,
	lifetime: new NumberRange(4, 6),
	speed: new NumberRange(6, 10),
	acceleration: new Vector3(0, -2, 0),
	size: seq(0.3, 0.3),
	transparency: fade(0.2),
	lightEmission: 0,
	direction: Enum.NormalId.Bottom,
	orientation: Enum.ParticleOrientation.FacingCamera,
	rotSpeed: new NumberRange(0, 0),
	drag: 0,
	spread: new Vector2(10, 10),
	tint: true,
	...over,
});
const drifting = (over: Partial<WeatherPreset>): WeatherPreset => ({
	volume: new Vector3(90, 30, 90),
	offsetY: 4,
	rate: 25,
	lifetime: new NumberRange(6, 9),
	speed: new NumberRange(0.5, 1.5),
	acceleration: new Vector3(0, 0, 0),
	size: seq(0.25, 0.25),
	transparency: fade(0.3),
	lightEmission: 1,
	direction: Enum.NormalId.Top,
	orientation: Enum.ParticleOrientation.FacingCamera,
	rotSpeed: new NumberRange(0, 0),
	drag: 1,
	spread: new Vector2(180, 180),
	texture: SPARKLE,
	tint: true,
	...over,
});

const PRESETS: { [kind: string]: WeatherPreset } = {
	rain: falling({
		rate: 700,
		lifetime: new NumberRange(1.0, 1.4),
		speed: new NumberRange(90, 110),
		acceleration: new Vector3(0, -50, 0),
		size: seq(0.14, 0.18),
		transparency: fade(0.3),
		orientation: Enum.ParticleOrientation.VelocityParallel,
		spread: new Vector2(3, 3),
		lightEmission: 0.35,
	}),
	snow: falling({ rate: 260, lifetime: new NumberRange(7, 10), speed: new NumberRange(3, 6), acceleration: new Vector3(0.6, -0.6, 0), size: seq(0.22, 0.42), drag: 0.6, spread: new Vector2(25, 25), texture: SPARKLE, lightEmission: 0.2 }),
	ash: falling({ rate: 90, lifetime: new NumberRange(8, 11), speed: new NumberRange(1.5, 3), acceleration: new Vector3(0.8, -0.5, 0), size: seq(0.18, 0.35), transparency: fade(0.35), drag: 0.5, rotSpeed: new NumberRange(-60, 60), spread: new Vector2(30, 30), texture: SMOKE }),
	dust: falling({ volume: new Vector3(120, 40, 120), offsetY: 12, rate: 40, lifetime: new NumberRange(5, 8), speed: new NumberRange(8, 14), acceleration: new Vector3(14, -0.3, 2), size: seq(1.5, 3), transparency: fade(0.82), direction: Enum.NormalId.Right, spread: new Vector2(15, 15), texture: SMOKE }),
	sandstorm: falling({ volume: new Vector3(140, 50, 140), offsetY: 16, rate: 120, lifetime: new NumberRange(3, 5), speed: new NumberRange(24, 34), acceleration: new Vector3(20, -1, 4), size: seq(2.5, 5), transparency: fade(0.6), direction: Enum.NormalId.Right, spread: new Vector2(12, 12), texture: SMOKE }),
	petals: falling({ rate: 45, lifetime: new NumberRange(7, 10), speed: new NumberRange(2, 4), acceleration: new Vector3(1.6, -1.8, 0.6), size: seq(0.3, 0.4), transparency: fade(0.1), rotSpeed: new NumberRange(90, 220), drag: 0.8, spread: new Vector2(30, 30) }),
	leaves: falling({ rate: 35, lifetime: new NumberRange(5, 8), speed: new NumberRange(3, 6), acceleration: new Vector3(2.5, -3, 1), size: seq(0.45, 0.6), transparency: fade(0.1), rotSpeed: new NumberRange(120, 300), drag: 0.6, spread: new Vector2(35, 35) }),
	spores: drifting({ rate: 30, size: seq(0.18, 0.32), transparency: fade(0.25) }),
	fireflies: drifting({ rate: 14, size: seq(0.14, 0.24), transparency: blink(0.05), lifetime: new NumberRange(5, 8), speed: new NumberRange(0.8, 2.2) }),
	embers: drifting({ volume: new Vector3(80, 10, 80), offsetY: -2, rate: 22, lifetime: new NumberRange(3, 5), speed: new NumberRange(4, 8), acceleration: new Vector3(1, 2.5, 0), size: seq(0.16, 0.06), transparency: fade(0.15), spread: new Vector2(25, 25), drag: 0.5 }),
	bubbles: drifting({ volume: new Vector3(80, 20, 80), offsetY: 0, rate: 40, lifetime: new NumberRange(4, 7), speed: new NumberRange(1.5, 3), acceleration: new Vector3(0, 2.5, 0), size: seq(0.18, 0.5), transparency: fade(0.55), lightEmission: 0.35, spread: new Vector2(12, 12) }),
};

let holder: Part | undefined;
let emitter: ParticleEmitter | undefined;
let offsetY = 0;

function configure(): void {
	const kind = (Lighting.GetAttribute("WeatherKind") as string | undefined) ?? "none";
	const intensity = (Lighting.GetAttribute("WeatherIntensity") as number | undefined) ?? 0;
	const colorAttr = Lighting.GetAttribute("WeatherColor");
	const color = typeIs(colorAttr, "Color3") ? colorAttr : new Color3(1, 1, 1);
	const preset = PRESETS[kind];
	if (!preset || intensity <= 0) {
		if (emitter) emitter.Enabled = false;
		return;
	}
	if (!holder) {
		holder = new Instance("Part");
		holder.Name = "WorldForgeWeather";
		holder.Anchored = true;
		holder.CanCollide = false;
		holder.CanQuery = false;
		holder.CanTouch = false;
		holder.Transparency = 1;
		holder.CastShadow = false;
		holder.Parent = Workspace.CurrentCamera ?? Workspace;
	}
	if (!emitter) {
		emitter = new Instance("ParticleEmitter");
		emitter.Parent = holder;
	}
	holder.Size = preset.volume;
	offsetY = preset.offsetY;
	emitter.Enabled = true;
	emitter.Rate = preset.rate * (0.35 + intensity * 0.9);
	emitter.Lifetime = preset.lifetime;
	emitter.Speed = preset.speed;
	emitter.Acceleration = preset.acceleration;
	emitter.Size = preset.size;
	emitter.Transparency = preset.transparency;
	emitter.LightEmission = preset.lightEmission;
	emitter.LightInfluence = preset.lightEmission > 0.5 ? 0 : 0.8;
	emitter.EmissionDirection = preset.direction;
	emitter.Orientation = preset.orientation;
	emitter.RotSpeed = preset.rotSpeed;
	emitter.Rotation = new NumberRange(0, 360);
	emitter.Drag = preset.drag;
	emitter.SpreadAngle = preset.spread;
	emitter.Texture = preset.texture ?? "";
	emitter.Color = new ColorSequence(preset.tint ? color : new Color3(1, 1, 1));
	emitter.ZOffset = 0;
	emitter.Brightness = 1 + preset.lightEmission;
}

/** Start the weather layer (idempotent; reacts to later attribute changes). */
export function startWeather(): void {
	configure();
	Lighting.GetAttributeChangedSignal("WeatherKind").Connect(configure);
	Lighting.GetAttributeChangedSignal("WeatherIntensity").Connect(configure);
	RunService.RenderStepped.Connect(() => {
		const cam = Workspace.CurrentCamera;
		if (!holder || !cam) return;
		const p = cam.CFrame.Position;
		holder.CFrame = new CFrame(p.X, p.Y + offsetY, p.Z);
	});
}
