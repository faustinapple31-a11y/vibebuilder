import { MaterialService } from "@rbxts/services";
import { TextureSet } from "shared/textures";

/**
 * Custom textures → MaterialVariants. For every entry of `shared/textures.ts` whose maps were uploaded
 * (asset ids ≠ 0), a MaterialVariant overrides the base material for parts *and* terrain
 * (MaterialService base-material overrides apply to both; TerrainDetail children give the terrain its
 * top / side faces). Entries without ids are skipped: the palette-tinted defaults stay in place.
 */
const MATERIALS = new Map<string, Enum.Material>();
for (const m of Enum.Material.GetEnumItems()) MATERIALS.set(m.Name, m);

type Maps = { ColorMap?: string; NormalMap?: string; RoughnessMap?: string; StudsPerTile?: number; BaseMaterial?: Enum.Material; MaterialPattern?: Enum.MaterialPattern };

/** MaterialVariant / TerrainDetail map properties are Content-typed and not all exposed to the type package: set them dynamically. */
function setMaps(inst: Instance, maps: Maps): boolean {
	const [ok, err] = pcall(() => {
		const target = inst as unknown as Record<string, unknown>;
		for (const [k, v] of pairs(maps as Record<string, unknown>)) target[k as string] = v;
	});
	if (!ok) warn(`WorldForge: cannot configure ${inst.ClassName}: ${err}`);
	return ok;
}

export function applyMaterials(): number {
	let applied = 0;
	for (const entry of TextureSet) {
		if (!entry.color) continue;
		const base = MATERIALS.get(entry.baseMaterial);
		if (!base) continue;
		const name = `WorldForge_${entry.id}`;
		let variant = MaterialService.FindFirstChild(name) as MaterialVariant | undefined;
		if (!variant) {
			variant = new Instance("MaterialVariant");
			variant.Name = name;
			setMaps(variant, { BaseMaterial: base });
			variant.Parent = MaterialService;
		}
		const maps: Maps = { ColorMap: `rbxassetid://${entry.color}`, StudsPerTile: entry.studsPerTile, MaterialPattern: Enum.MaterialPattern.Regular };
		if (entry.normal) maps.NormalMap = `rbxassetid://${entry.normal}`;
		if (entry.roughness) maps.RoughnessMap = `rbxassetid://${entry.roughness}`;
		if (!setMaps(variant, maps)) continue;
		// terrain faces reuse the same maps
		for (const face of ["Top", "Side", "Bottom"] as const) {
			let detail = variant.FindFirstChild(face) as TerrainDetail | undefined;
			if (!detail) {
				detail = new Instance("TerrainDetail");
				detail.Name = face;
				detail.Face = Enum.TerrainFace[face];
				detail.Parent = variant;
			}
			setMaps(detail, { ColorMap: maps.ColorMap, NormalMap: maps.NormalMap, RoughnessMap: maps.RoughnessMap, StudsPerTile: entry.studsPerTile });
		}
		const [ok] = pcall(() => MaterialService.SetBaseMaterialOverride(base, name));
		if (ok) applied++;
	}
	if (applied > 0) print(`[WorldForge] ${applied} custom material variants applied`);
	return applied;
}
