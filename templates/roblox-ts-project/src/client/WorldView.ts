import { Players, ReplicatedStorage, RunService, UserInputService, Workspace } from "@rbxts/services";
import { Remotes, waitRemoteEvent, waitRemoteFunction } from "shared/net";
import { readF32 } from "shared/world/decode";
import { PrefabCache, type ModelMode } from "shared/world/prefabFactory";
import { VIEW, isProfile, type DetailProfile, type ViewSettings } from "shared/world/profiles";
import type { PrefabVariantData, WorldIndexData } from "shared/world/types";

/**
 * Everything that is only seen, built around the camera. The server holds what players touch; this holds the rest, at a
 * level of detail that depends on the distance, and lets go of it behind them:
 *   0  every detail          near
 *   1  the main shapes       further
 *   2  two-part silhouettes  tall trees only
 *   -  nothing
 * A level is another set of instances, not a hidden one: what is far costs neither memory nor draw calls.
 */
const STRIDE = 10;
const CELL = 64;

interface Cell {
	chunk: string;
	x: number;
	z: number;
	/** Slots of the chunk's view. */
	items: number[];
	tier: number;
	wanted: number;
	folder?: Folder;
	models: Map<number, Model>;
}

interface ChunkView {
	id: string;
	rect: [number, number, number, number];
	state: "none" | "asked" | "ready";
	buf?: buffer;
	gone: Set<number>;
	cells: Cell[];
}

const MODES: ModelMode[] = ["view0", "view1", "view2"];

function pickProfile(): DetailProfile {
	const own = Players.LocalPlayer.GetAttribute("WorldDetail");
	if (isProfile(own)) return own;
	const place = Workspace.GetAttribute("WorldDetail");
	const base: DetailProfile = isProfile(place) ? place : "balanced";
	// a phone draws less than a computer whatever the place asks for
	if (UserInputService.TouchEnabled && !UserInputService.MouseEnabled) return "performance";
	const [ok, level] = pcall(() => UserSettings().GetService("UserGameSettings").SavedQualityLevel.Value);
	if (ok && level > 0 && level <= 3) return "performance";
	if (ok && level >= 9 && base === "balanced") return "high";
	return base;
}

export function startWorldView(): void {
	task.spawn(() => {
		const assets = ReplicatedStorage.WaitForChild("WorldAssets", 60) as Folder | undefined;
		const module = assets?.WaitForChild("WorldBake", 60) as ModuleScript | undefined;
		if (!module || !module.IsA("ModuleScript")) return;
		const index = require(module) as WorldIndexData;
		if (index.format !== "chunks" || Workspace.GetAttribute("WorldStatic") === true) return;
		const ask = waitRemoteFunction(Remotes.WorldChunkView);
		const prefabs = assets!.WaitForChild("prefabs") as Folder;
		const loaded = new Map<string, PrefabVariantData[]>();
		const variantsOf = (id: string): PrefabVariantData[] | undefined => {
			let v = loaded.get(id);
			if (!v) {
				const m = prefabs.FindFirstChild(id);
				if (!m || !m.IsA("ModuleScript")) return undefined;
				v = require(m) as PrefabVariantData[];
				loaded.set(id, v);
			}
			return v;
		};
		const root = new Instance("Folder");
		root.Name = "WorldView";
		root.Parent = Workspace;
		const templates = new Instance("Folder");
		templates.Name = "WorldViewTemplates";
		const cache = new PrefabCache(templates);
		let view: ViewSettings = VIEW[pickProfile()];
		Players.LocalPlayer.GetAttributeChangedSignal("WorldDetail").Connect(() => (view = VIEW[pickProfile()]));
		Workspace.GetAttributeChangedSignal("WorldDetail").Connect(() => (view = VIEW[pickProfile()]));

		const chunks = new Map<string, ChunkView>();
		for (const c of index.chunks.list) chunks.set(c.id, { id: c.id, rect: c.rect, state: "none", gone: new Set(), cells: [] });
		waitRemoteEvent(Remotes.WorldChunkRemoved).OnClientEvent.Connect((id, slot) => {
			if (!typeIs(id, "string") || !typeIs(slot, "number")) return;
			const c = chunks.get(id);
			if (!c) return;
			c.gone.add(slot);
			for (const cell of c.cells) {
				const m = cell.models.get(slot);
				if (m) {
					m.Destroy();
					cell.models.delete(slot);
				}
			}
		});

		let asking = 0;
		const fetchChunk = (c: ChunkView) => {
			c.state = "asked";
			asking++;
			task.spawn(() => {
				const [ok, res] = pcall(() => ask.InvokeServer(c.id) as [buffer, number[]] | undefined);
				asking--;
				if (!ok || res === undefined) {
					// not built yet on the server: asked again a little later
					task.delay(2, () => (c.state = "none"));
					return;
				}
				const [buf, gone] = res;
				for (const g of gone) c.gone.add(g);
				c.buf = buf;
				const cells = new Map<string, Cell>();
				const n = math.floor(buffer.len(buf) / 4 / STRIDE);
				for (let i = 0; i < n; i++) {
					const x = math.floor(readF32(buf, i * STRIDE + 2) / CELL);
					const z = math.floor(readF32(buf, i * STRIDE + 4) / CELL);
					const key = `${x}_${z}`;
					let cell = cells.get(key);
					if (!cell) {
						cell = { chunk: c.id, x: (x + 0.5) * CELL, z: (z + 0.5) * CELL, items: [], tier: -1, wanted: -1, models: new Map() };
						cells.set(key, cell);
						c.cells.push(cell);
					}
					cell.items.push(i);
				}
				c.state = "ready";
			});
		};

		const dirty: Cell[] = [];
		const drop = (cell: Cell) => {
			cell.folder?.Destroy();
			cell.folder = undefined;
			cell.models.clear();
			cell.tier = -1;
		};
		const build = (cell: Cell, tier: number) => {
			const c = chunks.get(cell.chunk)!;
			const buf = c.buf!;
			const folder = new Instance("Folder");
			folder.Name = `${cell.chunk}_${math.round(cell.x)}_${math.round(cell.z)}`;
			const models = new Map<number, Model>();
			let last = os.clock();
			for (const slot of cell.items) {
				if (cell.wanted !== tier) {
					folder.Destroy();
					return;
				}
				if (c.gone.has(slot)) continue;
				const o = slot * STRIDE;
				const cover = readF32(buf, o + 9) === 1;
				if (cover && tier > 0) continue;
				const variant = variantsOf(index.prefabIndex[readF32(buf, o)])?.[readF32(buf, o + 1)];
				if (!variant) continue;
				const scale = readF32(buf, o + 6);
				if (tier === 2 && (variant.category !== "vegetation" || variant.bounds.max[1] * scale < 9)) continue;
				const ux = readF32(buf, o + 7);
				const uz = readF32(buf, o + 8);
				let cf = new CFrame(readF32(buf, o + 2), readF32(buf, o + 3), readF32(buf, o + 4));
				if (ux !== 0 || uz !== 0) {
					const up = new Vector3(ux, math.sqrt(math.max(0, 1 - ux * ux - uz * uz)), uz);
					const axis = new Vector3(0, 1, 0).Cross(up);
					if (axis.Magnitude > 1e-5) cf = cf.mul(CFrame.fromAxisAngle(axis.Unit, math.acos(math.clamp(up.Y, -1, 1))));
				}
				cf = cf.mul(CFrame.Angles(0, readF32(buf, o + 5), 0));
				const model = cache.spawnAs(variant, cf, scale, cover ? "cover" : MODES[tier], folder);
				if (model.GetChildren().size() === 0) {
					model.Destroy();
					continue;
				}
				if (!view.shadows && (tier > 0 || cover)) for (const d of model.GetDescendants()) if (d.IsA("BasePart")) d.CastShadow = false;
				models.set(slot, model);
				if (os.clock() - last > view.budget) {
					RunService.Heartbeat.Wait();
					last = os.clock();
				}
			}
			const old = cell.folder;
			folder.Parent = root;
			old?.Destroy();
			cell.folder = folder;
			cell.models = models;
			cell.tier = tier;
		};

		task.spawn(() => {
			for (;;) {
				const cell = dirty.shift();
				if (!cell) {
					RunService.Heartbeat.Wait();
					continue;
				}
				if (cell.wanted === cell.tier) continue;
				if (cell.wanted === -1) drop(cell);
				else build(cell, cell.wanted);
			}
		});

		for (;;) {
			const cam = Workspace.CurrentCamera;
			if (cam) {
				const p = cam.CFrame.Position;
				const far = view.silhouette;
				const todo: [number, ChunkView][] = [];
				for (const [, c] of chunks) {
					const dx = math.max(c.rect[0] - p.X, 0, p.X - c.rect[2]);
					const dz = math.max(c.rect[1] - p.Z, 0, p.Z - c.rect[3]);
					const d = math.sqrt(dx * dx + dz * dz);
					if (c.state === "none" && d < far) todo.push([d, c]);
					else if (c.state === "ready" && d > far + 600) {
						for (const cell of c.cells) drop(cell);
						c.cells = [];
						c.buf = undefined;
						c.state = "none";
					}
				}
				todo.sort((a, b) => a[0] < b[0]);
				for (const [, c] of todo) if (asking < 3) fetchChunk(c);
				const queue: [number, Cell][] = [];
				for (const [, c] of chunks) {
					if (c.state !== "ready") continue;
					for (const cell of c.cells) {
						const d = math.sqrt(math.pow(cell.x - p.X, 2) + math.pow(cell.z - p.Z, 2)) - CELL * 0.7;
						// a level is only left once well past its limit, so walking along a border rebuilds nothing
						const slack = (t: number) => (cell.tier !== -1 && cell.tier <= t ? 1.15 : 1);
						const want = d < view.detail * slack(0) ? 0 : d < view.shape * slack(1) ? 1 : d < view.silhouette * slack(2) ? 2 : -1;
						if (want === cell.wanted && want === cell.tier) continue;
						cell.wanted = want;
						if (want !== cell.tier) queue.push([d, cell]);
					}
				}
				queue.sort((a, b) => a[0] < b[0]);
				dirty.clear();
				for (const [, cell] of queue) dirty.push(cell);
			}
			task.wait(0.35);
		}
	});
}
