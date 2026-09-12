import { HttpService, Lighting, ReplicatedStorage, Workspace } from "@rbxts/services";
import { base64ToBuffer, hexToColor3, readF32 } from "shared/world/decode";
import { PrefabCache } from "shared/world/prefabFactory";
import type { LightingData, WorldBakeData } from "shared/world/types";
import { buildTerrain } from "./TerrainBuilder";

/**
 * Builds the whole world from ReplicatedStorage.WorldAssets.WorldBake at runtime.
 * Idempotent: an existing Workspace.World is removed first. Can also be run from
 * the command bar / MCP in edit mode to bake the world into the place.
 */
export interface BuildOptions {
	terrain?: boolean;
	placements?: boolean;
	lighting?: boolean;
	spawn?: boolean;
	/** Yield every N placements (keeps the server responsive). */
	yieldEvery?: number;
	onProgress?: (stage: string, done: number, total: number) => void;
}

export interface BuildReport {
	placements: number;
	terrainChunks: number;
	seconds: number;
}

export function loadBake(): WorldBakeData {
	const assets = ReplicatedStorage.WaitForChild("WorldAssets", 10) as Folder | undefined;
	if (!assets) error("WorldForge: ReplicatedStorage.WorldAssets not found (is the project synced with Rojo?)");
	// Live push from WorldForge (MCP): JSON chunks in StringValues take precedence over the Rojo ModuleScript.
	const pushed = assets.FindFirstChild("WorldBakeJson");
	if (pushed) {
		const chunks = pushed.GetChildren().filter((c): c is StringValue => c.IsA("StringValue"));
		chunks.sort((a, b) => a.Name < b.Name);
		const json = chunks.map((c) => c.Value).join("");
		if (json.size() > 0) return HttpService.JSONDecode(json) as WorldBakeData;
	}
	const module = assets.WaitForChild("WorldBake", 10) as ModuleScript | undefined;
	if (!module) error("WorldForge: WorldAssets.WorldBake ModuleScript not found");
	return require(module) as WorldBakeData;
}

export function applyLighting(l: LightingData): void {
	Lighting.ClockTime = l.clockTime;
	Lighting.Brightness = l.brightness;
	Lighting.Ambient = hexToColor3(l.ambient);
	Lighting.OutdoorAmbient = hexToColor3(l.outdoorAmbient);
	Lighting.ColorShift_Top = hexToColor3(l.colorShiftTop);
	Lighting.ColorShift_Bottom = hexToColor3(l.colorShiftBottom);
	Lighting.ExposureCompensation = l.exposureCompensation;
	Lighting.GlobalShadows = l.globalShadows;
	Lighting.ShadowSoftness = l.shadowSoftness;
	Lighting.FogStart = l.fogStart;
	Lighting.FogEnd = l.fogEnd;
	Lighting.FogColor = hexToColor3(l.fogColor);
	Lighting.EnvironmentDiffuseScale = 0.6;
	Lighting.EnvironmentSpecularScale = 0.4;

	const getOrCreate = <T extends Instance>(className: keyof CreatableInstances, name: string): T => {
		const existing = Lighting.FindFirstChild(name);
		if (existing) return existing as T;
		const inst = new Instance(className);
		inst.Name = name;
		inst.Parent = Lighting;
		return inst as unknown as T;
	};
	const atm = getOrCreate<Atmosphere>("Atmosphere", "WorldForgeAtmosphere");
	atm.Density = l.atmosphere.density;
	atm.Offset = l.atmosphere.offset;
	atm.Color = hexToColor3(l.atmosphere.color);
	atm.Decay = hexToColor3(l.atmosphere.decay);
	atm.Glare = l.atmosphere.glare;
	atm.Haze = l.atmosphere.haze;
	const cc = getOrCreate<ColorCorrectionEffect>("ColorCorrectionEffect", "WorldForgeColorCorrection");
	cc.Saturation = l.colorCorrection.saturation;
	cc.Contrast = l.colorCorrection.contrast;
	cc.TintColor = hexToColor3(l.colorCorrection.tintColor);
	cc.Brightness = l.colorCorrection.brightness;
	const bloom = getOrCreate<BloomEffect>("BloomEffect", "WorldForgeBloom");
	bloom.Intensity = l.bloom.intensity;
	bloom.Size = l.bloom.size;
	bloom.Threshold = l.bloom.threshold;
	const rays = getOrCreate<SunRaysEffect>("SunRaysEffect", "WorldForgeSunRays");
	rays.Intensity = l.sunRays.intensity;
	rays.Spread = l.sunRays.spread;
	const sky = getOrCreate<Sky>("Sky", "WorldForgeSky");
	sky.SunAngularSize = l.sky.sunAngularSize;
	sky.MoonAngularSize = l.sky.moonAngularSize;
	sky.StarCount = l.sky.starCount;
}

export function buildWorld(bake: WorldBakeData, options: BuildOptions = {}): BuildReport {
	const t0 = os.clock();
	const report: BuildReport = { placements: 0, terrainChunks: 0, seconds: 0 };
	const progress = options.onProgress ?? (() => {});
	Workspace.SetAttribute("WorldReady", false);
	Workspace.SetAttribute("WorldName", bake.meta.specName);
	Workspace.SetAttribute("WorldVersion", bake.meta.version);

	// containers
	const old = Workspace.FindFirstChild("World");
	if (old) old.Destroy();
	const worldFolder = new Instance("Folder");
	worldFolder.Name = "World";
	worldFolder.Parent = Workspace;
	const folders = new Map<string, Folder>();
	const folderFor = (category: string): Folder => {
		let f = folders.get(category);
		if (!f) {
			f = new Instance("Folder");
			f.Name = category.sub(1, 1).upper() + category.sub(2);
			f.Parent = worldFolder;
			folders.set(category, f);
		}
		return f;
	};

	if (options.lighting !== false) applyLighting(bake.lighting);

	if (options.terrain !== false) {
		Workspace.Terrain.Clear();
		const res = buildTerrain(bake.terrain, (d, t) => progress("terrain", d, t));
		report.terrainChunks = res.chunks;
	}

	if (options.placements !== false) {
		const assets = ReplicatedStorage.FindFirstChild("WorldAssets") ?? ReplicatedStorage;
		let cacheFolder = assets.FindFirstChild("Prefabs") as Folder | undefined;
		if (cacheFolder) cacheFolder.Destroy();
		cacheFolder = new Instance("Folder");
		cacheFolder.Name = "Prefabs";
		cacheFolder.Parent = assets;
		const cache = new PrefabCache(cacheFolder);
		const buf = base64ToBuffer(bake.placementsB64);
		const total = bake.placementCount;
		const yieldEvery = options.yieldEvery ?? 150;
		for (let i = 0; i < total; i++) {
			const o = i * 7;
			const prefabName = bake.prefabIndex[readF32(buf, o)];
			const variantIndex = readF32(buf, o + 1);
			const variants = bake.prefabs[prefabName];
			const variant = variants?.[variantIndex];
			if (!variant) continue;
			const meta = bake.placementMeta[i];
			const x = readF32(buf, o + 2);
			const y = readF32(buf, o + 3);
			const z = readF32(buf, o + 4);
			const rotY = readF32(buf, o + 5);
			const scale = readF32(buf, o + 6);
			const cf = new CFrame(x, y, z).mul(CFrame.Angles(0, rotY, 0));
			const simple = meta?.layer === "background";
			const model = cache.spawn(variant, cf, scale, simple, folderFor(meta?.category ?? variant.category));
			model.Name = meta?.id ?? variant.id;
			if (meta?.zone !== undefined) model.SetAttribute("Zone", meta.zone);
			if (meta?.biome !== undefined) model.SetAttribute("Biome", meta.biome);
			model.SetAttribute("Layer", meta?.layer ?? "midground");
			report.placements++;
			if (i % yieldEvery === 0) {
				progress("placements", i, total);
				task.wait();
			}
		}
	}

	if (options.spawn !== false) {
		const [sx, sy, sz] = bake.spawn.position;
		const [lx, , lz] = bake.spawn.lookAt;
		let spawn = worldFolder.FindFirstChildOfClass("SpawnLocation");
		if (!spawn) {
			spawn = new Instance("SpawnLocation");
			spawn.Name = "WorldSpawn";
			spawn.Size = new Vector3(12, 1, 12);
			spawn.Anchored = true;
			spawn.CanCollide = true;
			spawn.Transparency = 1;
			spawn.Duration = 0;
			spawn.Parent = worldFolder;
		}
		spawn.CFrame = CFrame.lookAt(new Vector3(sx, sy + 0.5, sz), new Vector3(lx, sy + 0.5, lz));
	}

	report.seconds = os.clock() - t0;
	Workspace.SetAttribute("WorldReady", true);
	return report;
}
