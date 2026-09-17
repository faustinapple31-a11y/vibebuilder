import { Workspace } from "@rbxts/services";
import { base64ToBuffer, readF32, readU8 } from "shared/world/decode";
import { TERRAIN_MATERIALS, type TerrainOpData, type WorldBakeData } from "shared/world/types";

/**
 * Builds Roblox Terrain voxels from the baked heightmap.
 * Chunked WriteVoxels (16×16 cells) over the [min,max] height band of each chunk,
 * with a Rock base filled by FillBlock. Yields between chunks to keep the server responsive.
 *
 * Calibrated against Studio raycasts: smooth terrain renders its surface half a voxel (2 studs) above
 * `voxelBottom + occupancy × 4`, so heights are shifted down by SURFACE_BIAS before voxelisation, and each
 * voxel samples the heightmap at its centre (mean of the 4 surrounding cells) rather than at a corner.
 * Result: the rendered surface matches the heightmap to ±0.05 studs on flat ground.
 */
export interface TerrainBuildResult {
	chunks: number;
	seconds: number;
}

const VOXEL = 4;
/** Rendered surface = voxelBottom + occupancy * VOXEL + SURFACE_BIAS (measured in Studio). */
const SURFACE_BIAS = VOXEL / 2;

/** Bilinear heightmap sampler in world coordinates (same interpolation as the generator). */
export function makeHeightSampler(data: WorldBakeData["terrain"]): (x: number, z: number) => number {
	const heights = base64ToBuffer(data.heightsB64);
	const { width, depth, cellSize } = data;
	const [ox, oz] = data.origin;
	return (x: number, z: number) => {
		const fx = math.clamp((x - ox) / cellSize, 0, width - 1.001);
		const fz = math.clamp((z - oz) / cellSize, 0, depth - 1.001);
		const x0 = math.floor(fx);
		const z0 = math.floor(fz);
		const tx = fx - x0;
		const tz = fz - z0;
		const h00 = readF32(heights, z0 * width + x0);
		const h10 = readF32(heights, z0 * width + x0 + 1);
		const h01 = readF32(heights, (z0 + 1) * width + x0);
		const h11 = readF32(heights, (z0 + 1) * width + x0 + 1);
		return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
	};
}

export function buildTerrain(data: WorldBakeData["terrain"], onProgress?: (done: number, total: number) => void): TerrainBuildResult {
	const terrain = Workspace.Terrain;
	const t0 = os.clock();
	if (data.mode === "parts") {
		// the ground is parts (terrace slabs + walls carried by the bake): only the water blocks are terrain
		applyTerrainOps(data.ops ?? []);
		if (onProgress) onProgress(1, 1);
		return { chunks: 0, seconds: os.clock() - t0 };
	}
	const heights = base64ToBuffer(data.heightsB64);
	const materials = base64ToBuffer(data.materialsB64);
	const water = base64ToBuffer(data.waterB64);
	const { width, depth, cellSize } = data;
	const [ox, oz] = data.origin;
	const globalMin = math.floor((data.minHeight - 8) / VOXEL) * VOXEL;
	const baseBottom = globalMin - 64;

	// Rock base under the whole world
	terrain.FillBlock(
		new CFrame(ox + (width * cellSize) / 2, (baseBottom + globalMin) / 2, oz + (depth * cellSize) / 2),
		new Vector3(width * cellSize + 16, globalMin - baseBottom, depth * cellSize + 16),
		Enum.Material.Rock,
	);

	const CH = 16;
	const chunksX = math.ceil(width / CH);
	const chunksZ = math.ceil(depth / CH);
	const total = chunksX * chunksZ;
	let done = 0;
	const cellsPerVoxel = math.max(1, math.floor(VOXEL / cellSize));
	/** Height at the centre of the voxel whose corner is cell (x, z): mean of the 4 cells around the centre. */
	const heightAt = (x: number, z: number): number => {
		const x1 = math.min(width - 1, x + 1);
		const z1 = math.min(depth - 1, z + 1);
		return (readF32(heights, z * width + x) + readF32(heights, z * width + x1) + readF32(heights, z1 * width + x) + readF32(heights, z1 * width + x1)) / 4;
	};
	const waterAt = (x: number, z: number): number => {
		const w = readF32(water, z * width + x);
		return w === w ? w : -math.huge; // NaN → no water
	};

	for (let cz = 0; cz < chunksZ; cz++) {
		for (let cx = 0; cx < chunksX; cx++) {
			const x0 = cx * CH;
			const z0 = cz * CH;
			const x1 = math.min(width, x0 + CH);
			const z1 = math.min(depth, z0 + CH);
			// band
			let minH = math.huge;
			let maxH = -math.huge;
			for (let z = z0; z < z1; z++) {
				for (let x = x0; x < x1; x++) {
					const i = z * width + x;
					const h = readF32(heights, i);
					const w = readF32(water, i);
					if (h < minH) minH = h;
					if (h > maxH) maxH = h;
					if (w === w && w > maxH) maxH = w; // NaN check
				}
			}
			const yMin = math.floor((minH - 6 - SURFACE_BIAS) / VOXEL) * VOXEL;
			const yMax = math.ceil((maxH + 4) / VOXEL) * VOXEL;
			const ny = math.max(1, (yMax - yMin) / VOXEL);
			const nx = (x1 - x0) / cellsPerVoxel;
			const nz = (z1 - z0) / cellsPerVoxel;
			// fill between global min and chunk band bottom
			if (yMin > globalMin) {
				terrain.FillBlock(
					new CFrame(ox + ((x0 + x1) / 2) * cellSize, (globalMin + yMin) / 2, oz + ((z0 + z1) / 2) * cellSize),
					new Vector3((x1 - x0) * cellSize, yMin - globalMin, (z1 - z0) * cellSize),
					Enum.Material.Rock,
				);
			}
			const mats: Enum.Material[][][] = [];
			const occ: number[][][] = [];
			for (let ix = 0; ix < nx; ix++) {
				const mx: Enum.Material[][] = [];
				const oxx: number[][] = [];
				for (let iy = 0; iy < ny; iy++) {
					const my: Enum.Material[] = [];
					const oy: number[] = [];
					const yb = yMin + iy * VOXEL;
					const yt = yb + VOXEL;
					for (let iz = 0; iz < nz; iz++) {
						const x = x0 + ix * cellsPerVoxel;
						const z = z0 + iz * cellsPerVoxel;
						const i = z * width + x;
						const h = heightAt(x, z) - SURFACE_BIAS;
						const w = waterAt(x, z) - SURFACE_BIAS;
						const surf = TERRAIN_MATERIALS[readU8(materials, i)] ?? Enum.Material.Grass;
						let m: Enum.Material = Enum.Material.Air;
						let o = 0;
						if (yt <= h) {
							o = 1;
							m = h - yt < 7 ? (surf === Enum.Material.Water ? Enum.Material.Mud : surf) : Enum.Material.Rock;
						} else if (yb < h) {
							o = (h - yb) / VOXEL;
							m = surf === Enum.Material.Water ? Enum.Material.Mud : surf;
						} else if (yb < w) {
							o = math.min(1, (w - yb) / VOXEL);
							m = Enum.Material.Water;
						}
						my.push(m);
						oy.push(o);
					}
					mx.push(my);
					oxx.push(oy);
				}
				mats.push(mx);
				occ.push(oxx);
			}
			const region = new Region3(new Vector3(ox + x0 * cellSize, yMin, oz + z0 * cellSize), new Vector3(ox + x0 * cellSize + nx * VOXEL, yMax, oz + z0 * cellSize + nz * VOXEL)).ExpandToGrid(VOXEL);
			terrain.WriteVoxels(region, VOXEL, mats, occ);
			done++;
			if (onProgress) onProgress(done, total);
			if (done % 8 === 0) task.wait();
		}
	}
	applyTerrainOps(data.ops ?? []);
	return { chunks: total, seconds: os.clock() - t0 };
}

const MATERIAL_BY_NAME = new Map<string, Enum.Material>(Enum.Material.GetEnumItems().map((m) => [m.Name, m]));

/** Caves, overhangs, arches and lava: 3D voxel ops the heightmap cannot express. */
export function applyTerrainOps(ops: TerrainOpData[]): number {
	const terrain = Workspace.Terrain;
	let n = 0;
	for (const op of ops) {
		const material = op.op === "carve" ? Enum.Material.Air : (MATERIAL_BY_NAME.get(op.material ?? "Rock") ?? Enum.Material.Rock);
		const [x, y, z] = op.position;
		const cf = new CFrame(x, y, z).mul(CFrame.Angles(0, op.rotationY ?? 0, 0)).mul(CFrame.Angles(op.tilt ?? 0, 0, 0));
		const ok = pcall(() => {
			if (op.shape === "ball") terrain.FillBall(new Vector3(x, y, z), op.radius ?? 4, material);
			else if (op.shape === "cylinder") terrain.FillCylinder(cf, op.height ?? 4, op.radius ?? 4, material);
			else {
				const [sx, sy, sz] = op.size ?? [4, 4, 4];
				terrain.FillBlock(cf, new Vector3(sx, sy, sz), material);
			}
		});
		if (ok[0]) n++;
		if (n % 25 === 0) task.wait();
	}
	return n;
}
