import { HttpService, Lighting, ReplicatedStorage, Workspace } from "@rbxts/services";
import { base64ToBuffer, hexToColor3, readF32 } from "shared/world/decode";
import { PrefabCache } from "shared/world/prefabFactory";
import type { LightingData, WorldBakeData } from "shared/world/types";
import { buildTerrain, makeHeightSampler } from "./TerrainBuilder";

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
	// Lighting technology (NotScriptable outside edit mode → pcall). ShadowMap by default: Future with hundreds of
	// point lights has hung the GPU driver (DXGI_ERROR_DEVICE_HUNG) on a big bake.
	pcall(() => {
		(Lighting as unknown as { Technology: Enum.Technology }).Technology = l.technology === "Future" ? Enum.Technology.Future : Enum.Technology.ShadowMap;
	});
	const t = l.terrain;
	if (t) {
		const terrain = Workspace.Terrain;
		terrain.WaterColor = hexToColor3(t.waterColor);
		terrain.WaterTransparency = t.waterTransparency;
		terrain.WaterReflectance = t.waterReflectance;
		terrain.WaterWaveSize = t.waterWaveSize;
		terrain.WaterWaveSpeed = t.waterWaveSpeed;
	}
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

	const heightAt = makeHeightSampler(bake.terrain);
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
		// Terrain snap: the bake places objects on the heightmap; the voxel surface can still differ by a stud or
		// two on slopes/ridges. Measure the difference at each pivot with a terrain-only raycast and apply it, so
		// every model keeps the generator's intent (sink, tilt, base contact) relative to the *rendered* ground.
		const snapParams = new RaycastParams();
		snapParams.FilterType = Enum.RaycastFilterType.Include;
		snapParams.FilterDescendantsInstances = [Workspace.Terrain];
		snapParams.IgnoreWater = true;
		const buf = base64ToBuffer(bake.placementsB64);
		const total = bake.placementCount;
		const yieldEvery = options.yieldEvery ?? 150;
		const stride = math.floor(buffer.len(buf) / 4 / math.max(1, total)) >= 9 ? 9 : 7;
		for (let i = 0; i < total; i++) {
			const o = i * stride;
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
			let yy = y;
			const floating = variant.tags !== undefined && (variant.tags.includes("floating") || variant.tags.includes("layout"));
			if (prefabName !== "bridge" && !floating) {
				const hit = Workspace.Raycast(new Vector3(x, y + 150, z), new Vector3(0, -400, 0), snapParams);
				if (hit) {
					const delta = hit.Position.Y - heightAt(x, z);
					if (math.abs(delta) < 24) yy = y + delta;
				}
			}
			let cf = new CFrame(x, yy, z);
			if (stride >= 9) {
				const ux = readF32(buf, o + 7);
				const uz = readF32(buf, o + 8);
				if (ux !== 0 || uz !== 0) {
					// tilt the model so its local up follows the terrain normal
					const up = new Vector3(ux, math.sqrt(math.max(0, 1 - ux * ux - uz * uz)), uz);
					const axis = new Vector3(0, 1, 0).Cross(up);
					const angle = math.acos(math.clamp(up.Y, -1, 1));
					if (axis.Magnitude > 1e-5) cf = cf.mul(CFrame.fromAxisAngle(axis.Unit, angle));
				}
			}
			cf = cf.mul(CFrame.Angles(0, rotY, 0));
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

	// zone markers (invisible parts): audio ambience, NPC homes, quests hook onto them by name
	{
		const zones = new Instance("Folder");
		zones.Name = "Zones";
		zones.Parent = worldFolder;
		for (const z of bake.zones) {
			const marker = new Instance("Part");
			marker.Name = z.id;
			marker.Anchored = true;
			marker.CanCollide = false;
			marker.CanQuery = false;
			marker.CanTouch = false;
			marker.Transparency = 1;
			marker.Size = new Vector3(2, 2, 2);
			const [cx, cz] = z.center;
			marker.CFrame = new CFrame(cx, z.y !== undefined ? z.y + 2 : heightAt(cx, cz) + 4, cz);
			marker.SetAttribute("Kind", z.kind);
			marker.SetAttribute("Radius", z.radius);
			if (z.meta) for (const [k, v] of pairs(z.meta)) marker.SetAttribute(k as string, v);
			marker.Parent = zones;
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
