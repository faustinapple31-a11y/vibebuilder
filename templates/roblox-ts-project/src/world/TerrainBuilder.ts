import { Workspace } from "@rbxts/services";
import { base64ToBuffer, readF32, readU8 } from "shared/world/decode";
import { TERRAIN_MATERIALS, type WorldBakeData } from "shared/world/types";

/**
 * Builds Roblox Terrain voxels from the baked heightmap.
 * Chunked WriteVoxels (16×16 cells) over the [min,max] height band of each chunk,
 * with a Rock base filled by FillBlock. Yields between chunks to keep the server responsive.
 */
export interface TerrainBuildResult {
	chunks: number;
	seconds: number;
}

const VOXEL = 4;

export function buildTerrain(data: WorldBakeData["terrain"], onProgress?: (done: number, total: number) => void): TerrainBuildResult {
	const terrain = Workspace.Terrain;
	const t0 = os.clock();
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
			const yMin = math.floor((minH - 6) / VOXEL) * VOXEL;
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
						const h = readF32(heights, i);
						const w = readF32(water, i);
						const surf = TERRAIN_MATERIALS[readU8(materials, i)] ?? Enum.Material.Grass;
						let m: Enum.Material = Enum.Material.Air;
						let o = 0;
						if (yt <= h) {
							o = 1;
							m = h - yt < 7 ? (surf === Enum.Material.Water ? Enum.Material.Mud : surf) : Enum.Material.Rock;
						} else if (yb < h) {
							o = (h - yb) / VOXEL;
							m = surf === Enum.Material.Water ? Enum.Material.Mud : surf;
						} else if (w === w && yb < w) {
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
	return { chunks: total, seconds: os.clock() - t0 };
}
