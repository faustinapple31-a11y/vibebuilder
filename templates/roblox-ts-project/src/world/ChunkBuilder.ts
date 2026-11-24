import { HttpService, ReplicatedStorage, ServerStorage, Workspace } from "@rbxts/services";
import { GameConfig } from "shared/config";
import { getRemoteEvent, getRemoteFunction, Remotes } from "shared/net";
import { base64ToBuffer, readF32, readU8 } from "shared/world/decode";
import { PrefabCache, hasSolid, isSolidPart } from "shared/world/prefabFactory";
import { TERRAIN_MATERIALS, type ChunkData, type PrefabVariantData, type WorldIndexData } from "shared/world/types";
import { applyTerrainOps } from "./TerrainBuilder";

/**
 * Builds a world delivered in chunks: the ground first, then the chunks from the spawn outward. The server only holds what
 * players touch (colliding parts, named and gameplay parts); everything that is only seen is built by each client around
 * its own camera (client/WorldView.ts) from the placements the server hands out chunk by chunk.
 *
 * Workspace.World / <region> / <chunk> / models
 */
export interface ChunkBuildOptions {
	onProgress?: (stage: string, done: number, total: number) => void;
	/** Build every part on the server (to bake the world into the place in Studio). */
	static?: boolean;
	/** Called once what surrounds the spawn stands. */
	onSpawnReady?: () => void;
	/** Draw only these chunks again. */
	only?: string[];
}

const VOXEL = 4;
/** Rendered surface = voxelBottom + occupancy * VOXEL + SURFACE_BIAS (measured in Studio). */
const SURFACE_BIAS = VOXEL / 2;
const HEIGHT_STEP = 32;
const DRY = -32768;
const CATEGORIES = ["vegetation", "rock", "building", "prop", "landmark", "path", "water", "npc"];
const LAYERS = ["foreground", "midground", "background"];
const SPAWN_READY_RADIUS = 420;
/** Floats per placement handed to the clients. */
export const VIEW_STRIDE = 10;

interface Slice {
	data: ChunkData;
	heights: buffer;
	water: buffer;
	materials: buffer;
}

let lastYield = os.clock();
/** Gives the frame back when this one has worked long enough. */
function breathe(): void {
	if (os.clock() - lastYield > 0.014) {
		task.wait();
		lastYield = os.clock();
	}
}

/** Chunk files: ModuleScripts (Rojo) or StringValues (pushed from WorldForge). */
export function readChunk(id: string): ChunkData | undefined {
	const folder = ServerStorage.FindFirstChild("WorldChunks");
	const inst = folder?.FindFirstChild(id);
	if (!inst) return undefined;
	if (inst.IsA("ModuleScript")) return require(inst) as ChunkData;
	if (inst.IsA("StringValue")) return HttpService.JSONDecode(inst.Value) as ChunkData;
	// a chunk pushed in several pieces
	const pieces = inst.GetChildren().filter((c): c is StringValue => c.IsA("StringValue"));
	pieces.sort((a, b) => a.Name < b.Name);
	const json = pieces.map((c) => c.Value).join("");
	return json.size() > 0 ? (HttpService.JSONDecode(json) as ChunkData) : undefined;
}

const prefabCache = new Map<string, PrefabVariantData[]>();
export function readPrefab(id: string): PrefabVariantData[] | undefined {
	const hit = prefabCache.get(id);
	if (hit) return hit;
	const module = ReplicatedStorage.FindFirstChild("WorldAssets")?.FindFirstChild("prefabs")?.FindFirstChild(id);
	if (!module || !module.IsA("ModuleScript")) return undefined;
	const data = require(module) as PrefabVariantData[];
	prefabCache.set(id, data);
	return data;
}

function sliceOf(data: ChunkData): Slice {
	return { data, heights: base64ToBuffer(data.heightsB64), water: base64ToBuffer(data.waterB64), materials: base64ToBuffer(data.materialsB64) };
}

const heightOf = (s: Slice, x: number, z: number): number => buffer.readi16(s.heights, (math.clamp(z, 0, s.data.d - 1) * s.data.w + math.clamp(x, 0, s.data.w - 1)) * 2) / HEIGHT_STEP + s.data.base;
const waterOf = (s: Slice, x: number, z: number): number => {
	const v = buffer.readi16(s.water, (math.clamp(z, 0, s.data.d - 1) * s.data.w + math.clamp(x, 0, s.data.w - 1)) * 2);
	return v === DRY ? -math.huge : v / HEIGHT_STEP + s.data.base;
};

/** Height of the baked ground at a world point of this slice. */
function sampleSlice(index: WorldIndexData, s: Slice, x: number, z: number): number {
	const t = index.terrain;
	const fx = math.clamp((x - t.origin[0]) / t.cellSize - s.data.x0, 0, s.data.w - 1.001);
	const fz = math.clamp((z - t.origin[1]) / t.cellSize - s.data.z0, 0, s.data.d - 1.001);
	if (t.mode === "parts") return heightOf(s, math.round(fx), math.round(fz));
	const x0 = math.floor(fx);
	const z0 = math.floor(fz);
	const tx = fx - x0;
	const tz = fz - z0;
	return (heightOf(s, x0, z0) * (1 - tx) + heightOf(s, x0 + 1, z0) * tx) * (1 - tz) + (heightOf(s, x0, z0 + 1) * (1 - tx) + heightOf(s, x0 + 1, z0 + 1) * tx) * tz;
}

/** Writes the voxels of one chunk, 64 studs at a time. Cells larger than a voxel are interpolated. */
function writeTerrain(index: WorldIndexData, s: Slice): void {
	const terrain = Workspace.Terrain;
	const t = index.terrain;
	const size = index.chunks.size;
	const x0w = t.origin[0] + s.data.x0 * t.cellSize;
	const z0w = t.origin[1] + s.data.z0 * t.cellSize;
	const spanX = math.min(size, (t.width - s.data.x0) * t.cellSize);
	const spanZ = math.min(size, (t.depth - s.data.z0) * t.cellSize);
	const globalMin = math.floor((t.minHeight - 8) / VOXEL) * VOXEL;
	terrain.FillBlock(new CFrame(x0w + spanX / 2, globalMin - 16, z0w + spanZ / 2), new Vector3(spanX, 32, spanZ), Enum.Material.Rock);
	const per = t.cellSize / VOXEL;
	const N = 16;
	const nvx = math.floor(spanX / VOXEL);
	const nvz = math.floor(spanZ / VOXEL);
	const at = (vx: number, vz: number): number => {
		const fx = (vx + 0.5) / per;
		const fz = (vz + 0.5) / per;
		const ix = math.floor(fx);
		const iz = math.floor(fz);
		const tx = fx - ix;
		const tz = fz - iz;
		return (heightOf(s, ix, iz) * (1 - tx) + heightOf(s, ix + 1, iz) * tx) * (1 - tz) + (heightOf(s, ix, iz + 1) * (1 - tx) + heightOf(s, ix + 1, iz + 1) * tx) * tz;
	};
	for (let bz = 0; bz < nvz; bz += N) {
		for (let bx = 0; bx < nvx; bx += N) {
			const nx = math.min(N, nvx - bx);
			const nz = math.min(N, nvz - bz);
			let minH = math.huge;
			let maxH = -math.huge;
			for (let iz = 0; iz <= nz; iz++) {
				for (let ix = 0; ix <= nx; ix++) {
					const h = at(bx + ix, bz + iz);
					const w = waterOf(s, math.floor((bx + ix) / per), math.floor((bz + iz) / per));
					if (h < minH) minH = h;
					if (h > maxH) maxH = h;
					if (w > maxH) maxH = w;
				}
			}
			const yMin = math.floor((minH - 6 - SURFACE_BIAS) / VOXEL) * VOXEL;
			const yMax = math.ceil((maxH + 4) / VOXEL) * VOXEL;
			const ny = math.max(1, (yMax - yMin) / VOXEL);
			const px = x0w + bx * VOXEL;
			const pz = z0w + bz * VOXEL;
			if (yMin > globalMin) terrain.FillBlock(new CFrame(px + (nx * VOXEL) / 2, (globalMin + yMin) / 2, pz + (nz * VOXEL) / 2), new Vector3(nx * VOXEL, yMin - globalMin, nz * VOXEL), Enum.Material.Rock);
			const mats: Enum.Material[][][] = [];
			const occ: number[][][] = [];
			for (let ix = 0; ix < nx; ix++) {
				const mx: Enum.Material[][] = [];
				const ox: number[][] = [];
				for (let iy = 0; iy < ny; iy++) {
					mx.push(new Array<Enum.Material>(nz, Enum.Material.Air));
					ox.push(new Array<number>(nz, 0));
				}
				for (let iz = 0; iz < nz; iz++) {
					const cx = math.floor((bx + ix) / per);
					const cz = math.floor((bz + iz) / per);
					const h = at(bx + ix, bz + iz) - SURFACE_BIAS;
					const w = waterOf(s, cx, cz) - SURFACE_BIAS;
					const surf = TERRAIN_MATERIALS[readU8(s.materials, math.clamp(cz, 0, s.data.d - 1) * s.data.w + math.clamp(cx, 0, s.data.w - 1))] ?? Enum.Material.Grass;
					const top = surf === Enum.Material.Water ? Enum.Material.Mud : surf;
					for (let iy = 0; iy < ny; iy++) {
						const yb = yMin + iy * VOXEL;
						const yt = yb + VOXEL;
						if (yt <= h) {
							ox[iy][iz] = 1;
							mx[iy][iz] = h - yt < 7 ? top : Enum.Material.Rock;
						} else if (yb < h) {
							ox[iy][iz] = (h - yb) / VOXEL;
							mx[iy][iz] = top;
						} else if (yb < w) {
							ox[iy][iz] = math.min(1, (w - yb) / VOXEL);
							mx[iy][iz] = Enum.Material.Water;
						} else break;
					}
				}
				mats.push(mx);
				occ.push(ox);
			}
			const region = new Region3(new Vector3(px, yMin, pz), new Vector3(px + nx * VOXEL, yMax, pz + nz * VOXEL)).ExpandToGrid(VOXEL);
			terrain.WriteVoxels(region, VOXEL, mats, occ);
			breathe();
		}
	}
}

/** What the clients build for themselves, per chunk, and what has been destroyed since. */
const views = new Map<string, buffer>();
const gone = new Map<string, number[]>();

function serveViews(): void {
	const remote = getRemoteFunction(Remotes.WorldChunkView);
	remote.OnServerInvoke = (_player, id) => {
		if (!typeIs(id, "string")) return undefined;
		const view = views.get(id);
		return view ? [view, gone.get(id) ?? []] : undefined;
	};
}

export function buildChunks(index: WorldIndexData, worldFolder: Folder, options: ChunkBuildOptions = {}): { placements: number; chunks: number } {
	const progress = options.onProgress ?? (() => {});
	const [sx, , sz] = index.spawn.position;
	const dist = (c: WorldIndexData["chunks"]["list"][number]) => math.sqrt(math.pow((c.rect[0] + c.rect[2]) / 2 - sx, 2) + math.pow((c.rect[1] + c.rect[3]) / 2 - sz, 2));
	const list = index.chunks.list.filter((c) => options.only === undefined || options.only.includes(c.id));
	list.sort((a, b) => dist(a) < dist(b));
	const slices = new Map<string, Slice>();
	lastYield = os.clock();

	// ---- the ground of the whole world: a model settles on finished terrain, whichever chunk it leans into
	let n = 0;
	for (const c of list) {
		const data = readChunk(c.id);
		if (!data) {
			warn(`WorldForge: chunk ${c.id} is missing`);
			continue;
		}
		const s = sliceOf(data);
		slices.set(c.id, s);
		if (index.terrain.mode !== "parts") writeTerrain(index, s);
		n++;
		progress("terrain", n, list.size());
		breathe();
	}
	if (options.only === undefined) applyTerrainOps(index.terrain.ops ?? []);

	// ---- models
	const assets = ReplicatedStorage.FindFirstChild("WorldAssets") ?? ReplicatedStorage;
	assets.FindFirstChild("Prefabs")?.Destroy();
	const cacheFolder = new Instance("Folder");
	cacheFolder.Name = "Prefabs";
	cacheFolder.Parent = ServerStorage;
	const cache = new PrefabCache(cacheFolder);
	const snap = new RaycastParams();
	snap.FilterType = Enum.RaycastFilterType.Include;
	const groundFolder = new Instance("Folder");
	groundFolder.Name = "Ground";
	groundFolder.Parent = worldFolder;
	snap.FilterDescendantsInstances = [Workspace.Terrain, groundFolder];
	snap.IgnoreWater = true;
	const removedEvent = getRemoteEvent(Remotes.WorldChunkRemoved);
	const collect = GameConfig.collectibles.enabled ? (GameConfig.collectibles.prefabs as readonly string[]) : [];
	serveViews();
	const regions = new Map<string, Folder>();
	let total = 0;
	let spawnReady = false;
	let done = 0;
	for (const c of list) {
		if (!spawnReady && dist(c) > SPAWN_READY_RADIUS) {
			spawnReady = true;
			options.onSpawnReady?.();
		}
		const s = slices.get(c.id);
		if (!s) continue;
		let region = regions.get(c.region);
		if (!region) {
			region = (worldFolder.FindFirstChild(c.region) as Folder | undefined) ?? new Instance("Folder");
			region.Name = c.region;
			region.Parent = worldFolder;
			regions.set(c.region, region);
		}
		region.FindFirstChild(c.id)?.Destroy();
		const folder = new Instance("Folder");
		folder.Name = c.id;
		folder.SetAttribute("Kind", c.kind);
		folder.SetAttribute("Region", c.region);
		if (c.district !== undefined) folder.SetAttribute("District", c.district);
		folder.Parent = region;
		const buf = base64ToBuffer(s.data.placementsB64);
		const count = s.data.ids.size();
		const seen: number[] = [];
		const lost: number[] = [];
		gone.set(c.id, lost);
		// parts-built ground first: the rest of the chunk settles on it
		for (let pass = 0; pass < 2; pass++) {
			for (let i = 0; i < count; i++) {
				const o = i * 9;
				const prefabName = index.prefabIndex[readF32(buf, o)];
				const variant = readPrefab(prefabName)?.[readF32(buf, o + 1)];
				if (!variant) continue;
				const ground = variant.tags.includes("ground");
				if (ground !== (pass === 0)) continue;
				const m = i * 6;
				const category = CATEGORIES[s.data.meta[m]];
				const fixed = bit32.btest(s.data.meta[m + 2], 2);
				const zone = s.data.meta[m + 5];
				const x = readF32(buf, o + 2);
				const y = readF32(buf, o + 3);
				const z = readF32(buf, o + 4);
				const rotY = readF32(buf, o + 5);
				const scale = readF32(buf, o + 6);
				let yy = y;
				const floating = fixed || variant.tags.includes("floating") || variant.tags.includes("layout");
				if (prefabName !== "bridge" && !floating && !ground) {
					const hit = Workspace.Raycast(new Vector3(x, y + 150, z), new Vector3(0, -400, 0), snap);
					if (hit) {
						let delta = hit.Position.Y - sampleSlice(index, s, x, z);
						if (category === "building" || variant.tags.includes("interior")) {
							// the smooth voxel surface can rise above the flattened heightmap around a slab
							const r = math.max(2, variant.footprintRadius * scale * 0.7);
							for (let k = 0; k < 8; k++) {
								const a = (k * math.pi) / 4;
								const px = x + math.cos(a) * r;
								const pz = z + math.sin(a) * r;
								const h2 = Workspace.Raycast(new Vector3(px, y + 150, pz), new Vector3(0, -400, 0), snap);
								if (h2) delta = math.max(delta, math.min(h2.Position.Y - sampleSlice(index, s, px, pz), delta + 3));
							}
						}
						if (math.abs(delta) < 24) yy = y + delta;
					}
				} else if (fixed && !ground) {
					const hit = Workspace.Raycast(new Vector3(x, y + 6, z), new Vector3(0, -18, 0), snap);
					if (hit) yy = hit.Position.Y - variant.sinkDepth * scale * 0.5;
				}
				const ux = readF32(buf, o + 7);
				const uz = readF32(buf, o + 8);
				const id = s.data.ids[i];
				const solid = hasSolid(variant);
				const gameplay = category === "building" || category === "landmark" || category === "npc" || variant.tags.includes("layout") || collect.includes(prefabName);
				if (options.static === true || solid || gameplay || ground) {
					let cf = new CFrame(x, yy, z);
					if (ux !== 0 || uz !== 0) {
						const up = new Vector3(ux, math.sqrt(math.max(0, 1 - ux * ux - uz * uz)), uz);
						const axis = new Vector3(0, 1, 0).Cross(up);
						if (axis.Magnitude > 1e-5) cf = cf.mul(CFrame.fromAxisAngle(axis.Unit, math.acos(math.clamp(up.Y, -1, 1))));
					}
					cf = cf.mul(CFrame.Angles(0, rotY, 0));
					// a model with nothing solid that gameplay needs is kept whole
					const mode = options.static === true || !solid || ground ? "full" : "solid";
					const model = cache.spawnAs(variant, cf, scale, mode, ground ? groundFolder : folder);
					model.Name = id;
					model.SetAttribute("Chunk", c.id);
					model.SetAttribute("Layer", LAYERS[s.data.meta[m + 1]]);
					if (zone > 0) model.SetAttribute("Zone", index.zoneNames[zone - 1]);
					const biome = s.data.meta[m + 4];
					if (biome > 0) model.SetAttribute("Biome", index.terrain.biomeIds[biome - 1]);
					// beyond the streaming radius the engine draws a low-detail mesh of the model instead of nothing
					if (category === "building" || category === "landmark") pcall(() => ((model as unknown as { LevelOfDetail: unknown }).LevelOfDetail = Enum.ModelLevelOfDetail.StreamingMesh));
					total++;
					if (mode === "solid") {
						const slot = seen.size() / VIEW_STRIDE;
						model.Destroying.Once(() => {
							lost.push(slot);
							removedEvent.FireAllClients(c.id, slot);
						});
						seen.push(readF32(buf, o), readF32(buf, o + 1), x, yy, z, rotY, scale, ux, uz, 0);
					}
				} else {
					seen.push(readF32(buf, o), readF32(buf, o + 1), x, yy, z, rotY, scale, ux, uz, 1);
					total++;
				}
				breathe();
			}
		}
		const view = buffer.create(seen.size() * 4);
		seen.forEach((v, i) => buffer.writef32(view, i * 4, v));
		views.set(c.id, view);
		done++;
		progress("placements", done, list.size());
	}
	if (!spawnReady) options.onSpawnReady?.();
	return { placements: total, chunks: list.size() };
}

/** Ground height at a point, for what is placed after the build. */
export function groundAt(x: number, z: number, fallback: number): number {
	const params = new RaycastParams();
	params.FilterType = Enum.RaycastFilterType.Include;
	params.FilterDescendantsInstances = [Workspace.Terrain];
	const hit = Workspace.Raycast(new Vector3(x, 2000, z), new Vector3(0, -4000, 0), params);
	return hit ? hit.Position.Y : fallback;
}

void isSolidPart;
