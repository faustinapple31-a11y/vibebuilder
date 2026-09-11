import { hexToColor3 } from "./decode";
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
	part.Color = hexToColor3(p.color);
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
	return part;
}

export function buildPrefabModel(variant: PrefabVariantData, minLod = 0): Model {
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
