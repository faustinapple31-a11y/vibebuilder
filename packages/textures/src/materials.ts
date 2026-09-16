import type { TextureManifest } from "./manifest";

/**
 * Uploaded texture sets → MaterialVariants built into the place by Rojo. MaterialVariant maps and
 * MaterialService overrides are not scriptable at runtime (Plugin capability), so they are emitted as
 * `assets/materials/WorldForge_<id>.model.json` (variant + TerrainDetail faces) and as the
 * `<Material>Name` override properties of MaterialService in default.project.json.
 */
export const MATERIAL_VARIANT_PREFIX = "WorldForge_";

/** Roblox materials the terrain can be painted with (TerrainDetail faces only make sense for these). */
const TERRAIN_MATERIALS = new Set(["Grass", "LeafyGrass", "Ground", "Mud", "Rock", "Slate", "Sand", "Snow", "Cobblestone", "WoodPlanks", "Brick", "Ice", "CrackedLava", "Concrete", "Glacier", "Salt", "Sandstone", "Basalt", "Asphalt", "Limestone", "Pavement"]);

export function materialVariantName(id: string): string {
  return `${MATERIAL_VARIANT_PREFIX}${id}`;
}

function uploaded(manifest: TextureManifest | null) {
  return (manifest?.entries ?? []).filter((e) => (e.imageIds?.color ?? 0) > 0);
}

/** `$properties` of MaterialService: `GrassName: "WorldForge_grass"`… for every uploaded entry. */
export function materialOverrides(manifest: TextureManifest | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of uploaded(manifest)) out[`${e.baseMaterial}Name`] = materialVariantName(e.id);
  return out;
}

/** Rojo `.model.json` files (one MaterialVariant per uploaded entry) under assets/materials/. */
export function buildMaterialModelFiles(manifest: TextureManifest | null): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  for (const e of uploaded(manifest)) {
    const ids = e.imageIds!;
    const maps: Record<string, unknown> = { ColorMap: `rbxassetid://${ids.color}`, StudsPerTile: e.studsPerTile };
    if (ids.normal > 0) maps.NormalMap = `rbxassetid://${ids.normal}`;
    if (ids.roughness > 0) maps.RoughnessMap = `rbxassetid://${ids.roughness}`;
    const children = TERRAIN_MATERIALS.has(e.baseMaterial) ? ["Top", "Side", "Bottom"].map((face) => ({ name: face, className: "TerrainDetail", properties: { Face: face, ...maps } })) : [];
    const model = { className: "MaterialVariant", properties: { BaseMaterial: e.baseMaterial, MaterialPattern: "Regular", ...maps }, children };
    files.push({ path: `assets/materials/${materialVariantName(e.id)}.model.json`, content: JSON.stringify(model, null, 2) + "\n" });
  }
  return files;
}
