/**
 * Types mirroring @worldforge/core's WorldBakeJSON (the ModuleScript produced by Rojo
 * from assets/world/WorldBake.json). Keep in sync with packages/core/src/bake.ts.
 */
export type PartShape = "box" | "sphere" | "cylinder" | "wedge" | "cornerWedge" | "mesh";

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
	/** Mesh key in `PrefabVariantData.meshes` (shape "mesh"); `size` is the scaled mesh bounds. */
	mesh?: string;
	meshFallback?: "sphere" | "box";
	lod?: number;
}

/** Procedural triangle soup (9 floats per triangle, centred on its bounds). */
export interface MeshDataJSON {
	trianglesB64: string;
	triangleCount: number;
	bounds: { min: [number, number, number]; max: [number, number, number] };
	assetId?: number;
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
	/** Procedural meshes referenced by parts of shape "mesh". */
	meshes?: { [key: string]: MeshDataJSON };
}

export interface PlacementMeta {
	id: string;
	category: string;
	layer: "foreground" | "midground" | "background";
	locked: boolean;
	importance: number;
	biome?: string;
	zone?: string;
	/** Keep the baked height (cave interiors): no terrain snap. */
	fixed?: boolean;
}

export interface TerrainOpData {
	op: "carve" | "fill";
	shape: "ball" | "cylinder" | "block";
	position: [number, number, number];
	radius?: number;
	size?: [number, number, number];
	height?: number;
	rotationY?: number;
	tilt?: number;
	material?: string;
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
	sky: { sunAngularSize: number; moonAngularSize: number; starCount: number; celestialBodies?: boolean };
	technology?: "ShadowMap" | "Future";
	terrain?: { waterColor: string; waterTransparency: number; waterReflectance: number; waterWaveSize: number; waterWaveSpeed: number };
	/** Terrain:SetMaterialColor per material name (hex). */
	terrainColors?: { [material: string]: string };
	terrainDecoration?: boolean;
	clouds?: { enabled: boolean; cover: number; density: number; color: string };
	/** Ambient weather rendered by the client (src/client/Weather.ts) from Lighting attributes. */
	weather?: { kind: string; intensity: number; color: string };
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
		/** 3D voxel ops applied after the columns: caves (carve), overhangs / arches / lava (fill). */
		ops?: TerrainOpData[];
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
	Enum.Material.CrackedLava,
	Enum.Material.Glacier,
	Enum.Material.Salt,
	Enum.Material.Concrete,
	Enum.Material.Brick,
	Enum.Material.WoodPlanks,
];
