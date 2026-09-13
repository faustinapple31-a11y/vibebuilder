/**
 * Types mirroring @worldforge/core's WorldBakeJSON (the ModuleScript produced by Rojo
 * from assets/world/WorldBake.json). Keep in sync with packages/core/src/bake.ts.
 */
export type PartShape = "box" | "sphere" | "cylinder" | "wedge" | "cornerWedge";

export interface PartLight {
	type: "point";
	color: string;
	brightness: number;
	range: number;
}

export type PartEffectKind = "fireflies" | "spores" | "embers" | "smoke" | "sparkle" | "mist";
export interface PartEffect {
	kind: PartEffectKind;
	color?: string;
	rate?: number;
}

export interface PartData {
	shape: PartShape;
	position: [number, number, number];
	rotation: [number, number, number];
	size: [number, number, number];
	color: string;
	material: string;
	transparency?: number;
	reflectance?: number;
	castShadow?: boolean;
	collide?: boolean;
	light?: PartLight;
	effect?: PartEffect;
	name?: string;
	lod?: number;
}

export interface PrefabMeshSource {
	kind: "roblox_asset";
	assetId?: number;
	glbPath?: string;
	fbxPath?: string;
	provider: string;
	prompt: string;
	nativeSize?: [number, number, number];
}

export interface PrefabVariantData {
	id: string;
	prefab: string;
	category: string;
	parts: PartData[];
	bounds: { min: [number, number, number]; max: [number, number, number] };
	sinkDepth: number;
	footprintRadius: number;
	baseRadius?: number;
	tags: string[];
	/** External Roblox Model asset (AI-generated hero mesh); parts are only a fallback placeholder. */
	source?: PrefabMeshSource;
}

export interface PlacementMeta {
	id: string;
	category: string;
	layer: "foreground" | "midground" | "background";
	locked: boolean;
	importance: number;
	biome?: string;
	zone?: string;
}

export interface LightingData {
	clockTime: number;
	brightness: number;
	ambient: string;
	outdoorAmbient: string;
	colorShiftTop: string;
	colorShiftBottom: string;
	exposureCompensation: number;
	globalShadows: boolean;
	shadowSoftness: number;
	fogStart: number;
	fogEnd: number;
	fogColor: string;
	atmosphere: { density: number; offset: number; color: string; decay: string; glare: number; haze: number };
	colorCorrection: { saturation: number; contrast: number; tintColor: string; brightness: number };
	bloom: { intensity: number; size: number; threshold: number };
	sunRays: { intensity: number; spread: number };
	sky: { sunAngularSize: number; moonAngularSize: number; starCount: number };
	technology?: "ShadowMap" | "Future";
	terrain?: { waterColor: string; waterTransparency: number; waterReflectance: number; waterWaveSize: number; waterWaveSpeed: number };
}

export interface WorldBakeData {
	meta: { specId: string; specName: string; seed: number; version: string; generatedAt: string; generatorVersion: string; stylePreset: string };
	terrain: {
		cellSize: number;
		width: number;
		depth: number;
		origin: [number, number];
		heightsB64: string;
		materialsB64: string;
		waterB64: string;
		biomesB64: string;
		biomeIds: string[];
		minHeight: number;
		maxHeight: number;
	};
	prefabs: { [prefab: string]: PrefabVariantData[] };
	placementsB64: string;
	placementCount: number;
	prefabIndex: string[];
	placementMeta: PlacementMeta[];
	lighting: LightingData;
	spawn: { position: [number, number, number]; lookAt: [number, number, number] };
	zones: { id: string; kind: string; center: [number, number]; radius: number; y?: number; meta?: Record<string, string | number> }[];
	landmarks: { id: string; type: string; role: string; position: [number, number, number]; scale: number }[];
}

export const TERRAIN_MATERIALS: Enum.Material[] = [
	Enum.Material.Air,
	Enum.Material.Grass,
	Enum.Material.LeafyGrass,
	Enum.Material.Ground,
	Enum.Material.Mud,
	Enum.Material.Rock,
	Enum.Material.Slate,
	Enum.Material.Sand,
	Enum.Material.Snow,
	Enum.Material.Water,
	Enum.Material.Cobblestone,
	Enum.Material.Basalt,
	Enum.Material.Limestone,
	Enum.Material.Sandstone,
	Enum.Material.Ice,
	Enum.Material.Asphalt,
	Enum.Material.Pavement,
];
