import { HttpService, Players, ReplicatedStorage, RunService, Workspace } from "@rbxts/services";
import { base64ToBuffer, readF32, readU8 } from "shared/world/decode";
import { TERRAIN_MATERIALS, type WorldBakeData } from "shared/world/types";
import { corner, darken, panel, scaleContainer, stroke, text, theme } from "./kit";

/**
 * Minimap: a top-down map drawn from the WorldBake the client already has in
 * ReplicatedStorage.WorldAssets — the height / water / material grids are downsampled to a grid of
 * small frames (colour per terrain material, blue where there is water, darker with depth), landmarks
 * and gameplay zones get a dot, and the local player gets a rotating arrow. No image asset, no
 * server call; it is built once and only the arrow moves afterwards.
 */
const SIZE = 168;
const CELLS = 42;

/** Terrain material → minimap colour (indices of TERRAIN_MATERIALS). */
const MATERIAL_COLORS: Record<string, string> = {
	Grass: "#5f9a4a",
	LeafyGrass: "#4f8a3f",
	Ground: "#7a6440",
	Mud: "#5e4a30",
	Rock: "#7d7a74",
	Slate: "#63666b",
	Sand: "#d8c48a",
	Snow: "#e8eef2",
	Cobblestone: "#8a857c",
	Basalt: "#4a4744",
	Limestone: "#c8c0a8",
	Sandstone: "#c2a06a",
	Ice: "#bfe4f2",
	Asphalt: "#4b4b4f",
	Water: "#2f6f9a",
};

export class Minimap {
	private gui: ScreenGui;
	private frame: Frame;
	private grid: Frame;
	private arrow: Frame;
	private label: TextLabel;
	private terrain: WorldBakeData["terrain"] | undefined;
	private built = false;

	constructor() {
		const pg = Players.LocalPlayer.WaitForChild("PlayerGui") as PlayerGui;
		this.gui = new Instance("ScreenGui");
		this.gui.Name = "WorldForgeMinimap";
		this.gui.ResetOnSpawn = false;
		this.gui.IgnoreGuiInset = true;
		this.gui.DisplayOrder = 2;
		this.gui.Parent = pg;

		this.frame = panel(new UDim2(0, SIZE, 0, SIZE + 22), new UDim2(1, -SIZE - 18, 1, -SIZE - 40), this.gui, { color: theme.pill, strokeThickness: theme.strokeThickness, radius: math.min(14, theme.radius), zIndex: 3 });
		this.label = text("MAP", new UDim2(1, -12, 0, 18), new UDim2(0, 6, 0, 2), this.frame, { size: 13, align: Enum.TextXAlignment.Center, zIndex: 6, outline: 1.5 });
		this.grid = new Instance("Frame");
		this.grid.Size = new UDim2(0, SIZE - 12, 0, SIZE - 12);
		this.grid.Position = new UDim2(0, 6, 0, 20);
		this.grid.BackgroundColor3 = darken(theme.pill, 0.3);
		this.grid.BorderSizePixel = 0;
		this.grid.ClipsDescendants = true;
		this.grid.ZIndex = 4;
		corner(this.grid, 10);
		stroke(this.grid, theme.ink, 2.5);
		this.grid.Parent = this.frame;

		this.arrow = new Instance("Frame");
		this.arrow.Size = new UDim2(0, 10, 0, 10);
		this.arrow.BackgroundColor3 = theme.highlight;
		this.arrow.BorderSizePixel = 0;
		this.arrow.ZIndex = 9;
		this.arrow.Rotation = 45;
		corner(this.arrow, 2);
		stroke(this.arrow, theme.ink, 2);
		this.arrow.Parent = this.grid;
		scaleContainer(this.frame);
	}

	setEnabled(value: boolean): void {
		this.gui.Enabled = value;
		if (value && !this.built) this.build();
	}

	/** Reads the bake the client has in ReplicatedStorage (same source as the world builder). */
	private loadBake(): WorldBakeData | undefined {
		const assets = ReplicatedStorage.FindFirstChild("WorldAssets") as Folder | undefined;
		if (!assets) return undefined;
		const pushed = assets.FindFirstChild("WorldBakeJson");
		if (pushed && pushed.IsA("StringValue") && pushed.Value.size() > 0) {
			const [ok, decoded] = pcall(() => HttpService.JSONDecode(pushed.Value) as WorldBakeData);
			if (ok) return decoded as WorldBakeData;
		}
		const module = assets.FindFirstChild("WorldBake") as ModuleScript | undefined;
		if (!module) return undefined;
		const [ok, data] = pcall(() => require(module) as WorldBakeData);
		return ok ? (data as WorldBakeData) : undefined;
	}

	/** Downsamples the terrain grids into CELLS × CELLS frames and drops the landmark / zone dots. */
	private build(): void {
		this.built = true;
		const bake = this.loadBake();
		if (!bake) {
			this.label.Text = "MAP — loading";
			task.delay(4, () => {
				this.built = false;
				if (this.gui.Enabled) this.build();
			});
			return;
		}
		this.terrain = bake.terrain;
		this.label.Text = "MAP";
		const t = bake.terrain;
		const heights = base64ToBuffer(t.heightsB64);
		const materials = base64ToBuffer(t.materialsB64);
		const water = base64ToBuffer(t.waterB64);
		const inner = SIZE - 12;
		const px = math.ceil(inner / CELLS);
		const span = math.max(t.width, t.depth);
		const range = math.max(1, t.maxHeight - t.minHeight);
		for (let cz = 0; cz < CELLS; cz++) {
			for (let cx = 0; cx < CELLS; cx++) {
				// sample the centre of the cell (the grid is square: the world is padded to `span`)
				const gx = math.floor(((cx + 0.5) / CELLS) * span);
				const gz = math.floor(((cz + 0.5) / CELLS) * span);
				if (gx >= t.width || gz >= t.depth) continue;
				const i = gz * t.width + gx;
				const h = readF32(heights, i);
				const w = readF32(water, i);
				const material = TERRAIN_MATERIALS[readU8(materials, i)];
				const name = material !== undefined ? material.Name : "Grass";
				let color = Color3.fromHex(MATERIAL_COLORS[name] ?? "#5f9a4a");
				// water: blue, darker where it is deeper than the ground
				if (w === w && w > h) {
					const depth = math.clamp((w - h) / 12, 0, 1);
					color = Color3.fromHex("#4f9fd0").Lerp(Color3.fromHex("#14405f"), depth);
				} else {
					// relief shading from the normalised height
					const k = math.clamp((h - t.minHeight) / range, 0, 1);
					color = color.Lerp(new Color3(1, 1, 1), k * 0.35).Lerp(new Color3(0, 0, 0), (1 - k) * 0.25);
				}
				const cell = new Instance("Frame");
				cell.Size = new UDim2(0, px, 0, px);
				cell.Position = new UDim2(0, cx * px, 0, cz * px);
				cell.BackgroundColor3 = color;
				cell.BorderSizePixel = 0;
				cell.ZIndex = 5;
				cell.Parent = this.grid;
			}
		}
		// landmarks and gameplay zones
		for (const landmark of bake.landmarks) this.dot(landmark.position[0], landmark.position[2], theme.highlight, 7, landmark.type);
		for (const zone of bake.zones) this.dot(zone.center[0], zone.center[1], theme.accent, 5, zone.kind);
		const spawn = bake.spawn.position;
		this.dot(spawn[0], spawn[2], theme.info[0], 6, "spawn");
		this.startTracking();
	}

	/** World (x, z) → grid pixel; returns undefined when the point falls outside the map. */
	private toPixel(x: number, z: number): [number, number] | undefined {
		const t = this.terrain;
		if (!t) return undefined;
		const span = math.max(t.width, t.depth);
		const inner = SIZE - 12;
		const px = math.ceil(inner / CELLS);
		const gx = (x - t.origin[0]) / t.cellSize;
		const gz = (z - t.origin[1]) / t.cellSize;
		if (gx < 0 || gz < 0 || gx > span || gz > span) return undefined;
		return [(gx / span) * CELLS * px, (gz / span) * CELLS * px];
	}

	private dot(x: number, z: number, color: Color3, size: number, name: string): void {
		const at = this.toPixel(x, z);
		if (!at) return;
		const d = new Instance("Frame");
		d.Name = name;
		d.Size = new UDim2(0, size, 0, size);
		d.Position = new UDim2(0, at[0] - size / 2, 0, at[1] - size / 2);
		d.BackgroundColor3 = color;
		d.BorderSizePixel = 0;
		d.ZIndex = 7;
		corner(d, math.floor(size / 2));
		stroke(d, theme.ink, 1.5);
		d.Parent = this.grid;
	}

	/** Moves the player arrow (and rotates it with the camera) while the minimap is visible. */
	private startTracking(): void {
		const player = Players.LocalPlayer;
		RunService.RenderStepped.Connect(() => {
			if (!this.gui.Enabled) return;
			const char = player.Character;
			const root = char?.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
			if (!root) return;
			const at = this.toPixel(root.Position.X, root.Position.Z);
			if (!at) return;
			this.arrow.Position = new UDim2(0, at[0] - 5, 0, at[1] - 5);
			const camera = Workspace.CurrentCamera;
			if (camera) {
				const look = camera.CFrame.LookVector;
				this.arrow.Rotation = 45 - math.deg(math.atan2(look.X, -look.Z));
			}
		});
	}
}
