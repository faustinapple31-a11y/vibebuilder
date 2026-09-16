import { MaterialService } from "@rbxts/services";
import { TextureSet } from "shared/textures";

/**
 * Custom textures → MaterialVariants. The variants themselves are built into the place by Rojo
 * (assets/materials/WorldForge_<id>.model.json + the `<Material>Name` overrides of MaterialService):
 * their map properties are not scriptable at runtime. This only re-asserts the base-material
 * override for every uploaded entry whose variant exists, so parts *and* terrain use it even if the
 * project file was edited by hand.
 */
const MATERIALS = new Map<string, Enum.Material>();
for (const m of Enum.Material.GetEnumItems()) MATERIALS.set(m.Name, m);

export function applyMaterials(): number {
	let applied = 0;
	for (const entry of TextureSet) {
		if (!entry.color) continue;
		const base = MATERIALS.get(entry.baseMaterial);
		const name = `WorldForge_${entry.id}`;
		if (!base || !MaterialService.FindFirstChild(name)) continue;
		const [ok] = pcall(() => {
			if (MaterialService.GetBaseMaterialOverride(base) !== name) MaterialService.SetBaseMaterialOverride(base, name);
		});
		if (ok) applied++;
	}
	if (applied > 0) print(`[WorldForge] ${applied} custom material variants active`);
	return applied;
}
