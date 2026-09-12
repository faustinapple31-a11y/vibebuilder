import { hexToColor3 } from "./decode";
import { NEON_COLOR_SCALE, makeEffect } from "./effects";
import type { PartData, PrefabVariantData } from "./types";

/**
 * PartList → Roblox Model. The model pivot is the prefab origin (ground contact point),
 * so `model:PivotTo(cf)` and `model:ScaleTo(s)` behave as expected.
 */
const MATERIALS = new Map<string, Enum.Material>();
for (const item of Enum.Material.GetEnumItems()) MATERIALS.set(item.Name, item);

function materialOf(name: string): Enum.Material {
	return MATERIALS.get(name) ?? Enum.Material.SmoothPlastic;
}

function makePart(p: PartData): BasePart {
	let part: BasePart;
	const [sx, sy, sz] = p.size;
	const rx = math.rad(p.rotation[0]);
	const ry = math.rad(p.rotation[1]);
	const rz = math.rad(p.rotation[2]);
	let cf = new CFrame(p.position[0], p.position[1], p.position[2]).mul(CFrame.fromEulerAnglesXYZ(rx, ry, rz));
	let size = new Vector3(sx, sy, sz);
	if (p.shape === "wedge") {
		part = new Instance("WedgePart");
	} else if (p.shape === "cornerWedge") {
		part = new Instance("CornerWedgePart");
	} else {
		const basic = new Instance("Part");
		if (p.shape === "sphere") basic.Shape = Enum.PartType.Ball;
		else if (p.shape === "cylinder") {
			basic.Shape = Enum.PartType.Cylinder;
			// PartList cylinders are Y-up; Roblox cylinders are X-aligned.
			cf = cf.mul(CFrame.Angles(0, 0, math.rad(90)));
			size = new Vector3(sy, sx, sz);
		} else basic.Shape = Enum.PartType.Block;
		part = basic;
	}
	part.Name = p.name ?? p.shape;
	part.Size = size;
	part.CFrame = cf;
	const color = hexToColor3(p.color);
	part.Color = p.material === "Neon" ? new Color3(color.R * NEON_COLOR_SCALE, color.G * NEON_COLOR_SCALE, color.B * NEON_COLOR_SCALE) : color;
	part.Material = materialOf(p.material);
	part.Anchored = true;
	part.TopSurface = Enum.SurfaceType.Smooth;
	part.BottomSurface = Enum.SurfaceType.Smooth;
	part.Transparency = p.transparency ?? 0;
	part.Reflectance = p.reflectance ?? 0;
	part.CastShadow = p.castShadow ?? true;
	const collide = p.collide ?? true;
	part.CanCollide = collide;
	part.CanQuery = collide;
	part.CanTouch = collide;
	if (p.light) {
		const light = new Instance("PointLight");
		light.Color = hexToColor3(p.light.color);
		light.Brightness = p.light.brightness;
		light.Range = p.light.range;
		light.Shadows = false;
		light.Parent = part;
	}
	if (p.effect) makeEffect(p.effect).Parent = part;
	return part;
}

const InsertService = game.GetService("InsertService");

/**
 * Spawns an external Roblox Model asset (uploaded through Open Cloud) and fits it to the variant:
 * pivot at the bottom centre, height scaled to the bake's bounds. Returns undefined when the asset
 * cannot be loaded (offline, not owned, moderation pending) so the placeholder parts are used instead.
 */
function loadMeshAsset(variant: PrefabVariantData): Model | undefined {
	const src = variant.source;
	if (!src || src.kind !== "roblox_asset" || src.assetId === undefined) return undefined;
	const [ok, res] = pcall(() => InsertService.LoadAsset(src.assetId!));
	if (!ok) {
		warn(`WorldForge: cannot load asset ${src.assetId} for ${variant.id}: ${res}`);
		return undefined;
	}
	const container = res as Model;
	// the container holds the asset's top-level instances; keep a single Model around them
	let model: Model;
	const children = container.GetChildren();
	if (children.size() === 1 && children[0].IsA("Model")) {
		model = children[0];
		model.Parent = undefined;
		container.Destroy();
	} else {
		model = container;
	}
	model.Name = variant.id;
	for (const d of model.GetDescendants()) {
		if (d.IsA("BasePart")) {
			d.Anchored = true;
			d.CastShadow = true;
		}
	}
	// fit: scale so the height matches the bounds, then pivot at the bottom centre
	const [cf, size] = model.GetBoundingBox();
	const targetH = math.max(0.5, variant.bounds.max[1] - math.min(0, variant.bounds.min[1]));
	if (size.Y > 0.01) {
		const s = targetH / size.Y;
		if (math.abs(s - 1) > 0.01) model.ScaleTo(s);
	}
	const [cf2, size2] = model.GetBoundingBox();
	model.WorldPivot = new CFrame(cf2.Position.X, cf2.Position.Y - size2.Y / 2, cf2.Position.Z);
	model.PivotTo(new CFrame());
	model.SetAttribute("AssetId", src.assetId);
	return model;
}

export function buildPrefabModel(variant: PrefabVariantData, minLod = 0): Model {
	const loaded = loadMeshAsset(variant);
	if (loaded) {
		loaded.SetAttribute("Prefab", variant.prefab);
		loaded.SetAttribute("Category", variant.category);
		return loaded;
	}
	const model = new Instance("Model");
	model.Name = variant.id;
	for (const p of variant.parts) {
		if ((p.lod ?? 0) < minLod) continue;
		makePart(p).Parent = model;
	}
	model.WorldPivot = new CFrame();
	model.SetAttribute("Prefab", variant.prefab);
	model.SetAttribute("Category", variant.category);
	return model;
}

export class PrefabCache {
	private full = new Map<string, Model>();
	private simple = new Map<string, Model>();
	constructor(private container: Instance) {}

	get(variant: PrefabVariantData, simple: boolean): Model {
		const map = simple ? this.simple : this.full;
		let m = map.get(variant.id);
		if (!m) {
			m = buildPrefabModel(variant, simple ? 1 : 0);
			m.Name = simple ? `${variant.id}#lod1` : variant.id;
			m.Parent = this.container;
			map.set(variant.id, m);
		}
		return m;
	}

	/** Clone + place. */
	spawn(variant: PrefabVariantData, cf: CFrame, scale: number, simple: boolean, parent: Instance): Model {
		const clone = this.get(variant, simple).Clone();
		if (math.abs(scale - 1) > 0.01) clone.ScaleTo(scale);
		clone.PivotTo(cf);
		clone.Parent = parent;
		return clone;
	}
}
