import { TERRAIN_MATERIALS, type PathPolyline, type Placement, type PrefabVariant, type StyleBible, type Vec2, type WorldBake, type WorldSpec } from "@worldforge/core";

/**
 * What Blender needs to build a world, cut so that a process only ever reads one region: the plan (style, pieces of the
 * kit, list of regions) and one file per region with its own slice of the ground, the ways that cross it and what stands
 * in it. The planner decides where things are; every triangle is Blender's.
 */
export const REGION_SIZE = 512;
/** Ground known around a region, in cells: what erosion and slopes look at across the border. */
const MARGIN = 24;

/** Drawn by the region builder itself (roads, kerbs, markings, ground), never as pieces. */
const GROUND_WORK = new Set(["ground_block", "road_strip", "road_stripe", "crosswalk", "kerb", "stone_path_slab", "race_kerb", "lava_strip"]);

export interface KitEntry {
  key: string;
  prefab: string;
  variant: number;
  category: string;
  tags: string[];
  min: [number, number, number];
  max: [number, number, number];
  sink: number;
  /** Colliding boxes of the layout: centre, size, rotation in degrees (Roblox axes). */
  boxes: { c: number[]; s: number[]; r: number[] }[];
  /** The layout's own shapes, for what has no builder yet. */
  parts: { shape: string; position: number[]; size: number[]; rotation: number[]; color: string; material: string; transparency: number; name?: string }[];
  uses: number;
}

export interface RegionInfo {
  id: string;
  cx: number;
  cz: number;
  /** x0, z0, x1, z1 in studs. */
  rect: [number, number, number, number];
  neighbours: string[];
  placements: number;
  wet: number;
}

export interface BlenderPlan {
  version: 1;
  id: string;
  name: string;
  prompt: string;
  style: string;
  architecture: string;
  weathering: number;
  seed: number;
  palette: Record<string, string>;
  materialNames: readonly string[];
  size: [number, number];
  cellSize: number;
  origin: Vec2;
  regionSize: number;
  kit: KitEntry[];
  regions: RegionInfo[];
  lighting: WorldBake["lighting"];
  spawn: WorldBake["spawn"];
  focal?: number[];
  green: boolean;
  environment: string;
  settlements: { id: string; center: Vec2; radius: number; type: string }[];
}

export interface RegionPlan {
  id: string;
  rect: [number, number, number, number];
  grid: { x0: number; z0: number; w: number; d: number; heights: number[]; materials: number[]; water: (number | null)[]; biomes: number[] };
  biomeIds: string[];
  paths: { id: string; kind: string; type: string; width: number; points: Vec2[]; street: boolean }[];
  placements: { id: string; key: string; p: number[]; r: number; s: number; up?: number[]; cat: string; zone?: string; fixed?: boolean; block: number }[];
  /** Level ground: x, z, radius. */
  flat: number[][];
  ops: WorldBake["terrain"]["ops"];
  /** Footprints of everything that stands on level ground here and just across the border: x, z, radius. */
  blocks: number[][];
}

export interface PlanFiles {
  plan: BlenderPlan;
  regions: RegionPlan[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

function kitEntry(v: PrefabVariant, prefab: string, variant: number): KitEntry {
  return {
    key: `${prefab}_${variant}`,
    prefab,
    variant,
    category: v.category,
    tags: v.tags,
    min: v.bounds.min.map(r2) as [number, number, number],
    max: v.bounds.max.map(r2) as [number, number, number],
    sink: r2(v.sinkDepth),
    boxes: v.parts.filter((p) => p.collide !== false && p.shape !== "sphere" && p.shape !== "mesh").map((p) => ({ c: p.position.map(r2), s: p.size.map(r2), r: p.rotation.map(r2) })),
    parts: v.parts.map((p) => ({ shape: p.shape, position: p.position.map(r2), size: p.size.map(r2), rotation: p.rotation.map(r2), color: p.color, material: p.material, transparency: p.transparency ?? 0, ...(p.name ? { name: p.name } : {}) })),
    uses: 0,
  };
}

export function planWorld(bake: WorldBake, spec: WorldSpec, style: StyleBible, options: { regionSize?: number; prompt?: string } = {}): PlanFiles {
  const t = bake.terrain;
  const size = options.regionSize ?? REGION_SIZE;
  const W = t.width * t.cellSize;
  const D = t.depth * t.cellSize;
  const nx = Math.max(1, Math.ceil((W - t.cellSize) / size));
  const nz = Math.max(1, Math.ceil((D - t.cellSize) / size));
  const id = (cx: number, cz: number) => `r${cx}_${cz}`;
  const at = (x: number, z: number): [number, number] => [Math.max(0, Math.min(nx - 1, Math.floor((x - t.origin[0]) / size))), Math.max(0, Math.min(nz - 1, Math.floor((z - t.origin[1]) / size)))];
  const own = new Map<string, Placement[]>();
  const kit = new Map<string, KitEntry>();
  for (const p of bake.placements) {
    const v = bake.prefabs[p.prefab]?.[p.variant];
    if (!v || GROUND_WORK.has(p.prefab)) continue;
    const key = `${p.prefab}_${p.variant}`;
    let e = kit.get(key);
    if (!e) kit.set(key, (e = kitEntry(v, p.prefab, p.variant)));
    e.uses++;
    const k = id(...at(p.position[0], p.position[2]));
    const list = own.get(k);
    if (list) list.push(p);
    else own.set(k, [p]);
  }
  const blocks = bake.placements.filter((p) => p.category !== "vegetation" && p.prefab !== "stone" && !GROUND_WORK.has(p.prefab)).map((p) => [r2(p.position[0]), r2(p.position[2]), r2((bake.prefabs[p.prefab]?.[p.variant]?.footprintRadius ?? 1) * p.scale)]).filter((b) => b[2]! > 3);
  const flat = [
    [bake.spawn.position[0], bake.spawn.position[2], 30],
    ...bake.zones.filter((z) => z.kind === "settlement" || z.kind === "landmark" || (z.kind === "gameplay" && z.meta?.kind !== "cave")).map((z) => [z.center[0], z.center[1], z.kind === "settlement" ? z.radius * 0.85 : Math.min(z.radius, 60)]),
  ];
  const regions: RegionPlan[] = [];
  const infos: RegionInfo[] = [];
  const cells = Math.round(size / t.cellSize);
  for (let cz = 0; cz < nz; cz++) {
    for (let cx = 0; cx < nx; cx++) {
      const rid = id(cx, cz);
      // a region ends on the last row of cells, never past it
      const rect: [number, number, number, number] = [t.origin[0] + cx * size, t.origin[1] + cz * size, Math.min(t.origin[0] + W - t.cellSize, t.origin[0] + (cx + 1) * size), Math.min(t.origin[1] + D - t.cellSize, t.origin[1] + (cz + 1) * size)];
      const gx0 = Math.max(0, cx * cells - MARGIN);
      const gz0 = Math.max(0, cz * cells - MARGIN);
      const gx1 = Math.min(t.width - 1, (cx + 1) * cells + MARGIN);
      const gz1 = Math.min(t.depth - 1, (cz + 1) * cells + MARGIN);
      const w = gx1 - gx0 + 1;
      const d = gz1 - gz0 + 1;
      const grid: RegionPlan["grid"] = { x0: t.origin[0] + gx0 * t.cellSize, z0: t.origin[1] + gz0 * t.cellSize, w, d, heights: [], materials: [], water: [], biomes: [] };
      let wet = 0;
      for (let z = gz0; z <= gz1; z++) for (let x = gx0; x <= gx1; x++) {
        const i = z * t.width + x;
        const q = t.water[i]!;
        grid.heights.push(r2(t.heights[i]!));
        grid.materials.push(t.materials[i]!);
        grid.biomes.push(t.biomes[i]!);
        grid.water.push(Number.isNaN(q) ? null : r2(q));
        if (!Number.isNaN(q)) wet++;
      }
      const near = MARGIN * t.cellSize + 40;
      const touches = (p: PathPolyline) => p.points.some((q) => q[0] > rect[0] - near && q[0] < rect[2] + near && q[1] > rect[1] - near && q[1] < rect[3] + near);
      const list = own.get(rid) ?? [];
      regions.push({
        id: rid,
        rect,
        grid,
        biomeIds: t.biomeIds,
        paths: bake.paths.filter((p) => p.points.length > 1 && touches(p)).map((p) => ({ id: p.id, kind: p.kind, type: p.type, width: r2(p.width), points: p.points.map((q) => [r2(q[0]), r2(q[1])] as Vec2), street: p.id.includes("_street_") })),
        placements: list.map((p) => ({ id: p.id, key: `${p.prefab}_${p.variant}`, p: p.position.map(r2), r: Math.round(p.rotationY * 1e4) / 1e4, s: Math.round(p.scale * 1e3) / 1e3, ...(p.up ? { up: p.up.map((v) => Math.round(v * 1e4) / 1e4) } : {}), cat: p.category, ...(p.zone ? { zone: p.zone } : {}), ...(p.fixed ? { fixed: true } : {}), block: p.category === "vegetation" || p.prefab === "stone" ? 0 : r2((bake.prefabs[p.prefab]?.[p.variant]?.footprintRadius ?? 1) * p.scale) })),
        flat: flat.filter(([x, z, r]) => x! > rect[0] - near - r! && x! < rect[2] + near + r! && z! > rect[1] - near - r! && z! < rect[3] + near + r!),
        blocks: blocks.filter(([x, z, r]) => x! > rect[0] - near - r! && x! < rect[2] + near + r! && z! > rect[1] - near - r! && z! < rect[3] + near + r!),
        ops: t.ops.filter((o) => o.position[0] >= rect[0] - 80 && o.position[0] < rect[2] + 80 && o.position[2] >= rect[1] - 80 && o.position[2] < rect[3] + 80),
      });
      infos.push({ id: rid, cx, cz, rect, neighbours: [[cx - 1, cz], [cx + 1, cz], [cx, cz - 1], [cx, cz + 1]].filter(([a, b]) => a! >= 0 && b! >= 0 && a! < nx && b! < nz).map(([a, b]) => id(a!, b!)), placements: list.length, wet: Math.round((wet / (w * d)) * 100) / 100 });
    }
  }
  // grown by the region builder on the finished ground
  const grow = (prefab: string, n: number, size: [number, number, number], category: string) => {
    for (let k = 0; k < n; k++) kit.set(`${prefab}_${k}`, { key: `${prefab}_${k}`, prefab, variant: k, category, tags: [], min: [-size[0] / 2, 0, -size[1] / 2], max: [size[0] / 2, size[2], size[1] / 2], sink: 0, boxes: [], parts: [], uses: 1 });
  };
  if ([...kit.keys()].some((k) => /^(grass|fern|bush|flower)_/.test(k))) {
    grow("meadow_grass", 4, [2.4, 2.4, 1.2], "vegetation");
    grow("meadow_fern", 4, [3, 3, 1.5], "vegetation");
  }
  grow("meadow_pebble", 4, [1.2, 1, 0.8], "rock");
  grow("meadow_outcrop", 4, [14, 11, 9], "rock");
  const trees = new Set(["round_tree", "birch", "pine_tree", "willow", "jungle_tree", "cherry_tree", "palm"]);
  const plan: BlenderPlan = {
    version: 1,
    id: spec.id,
    name: spec.name,
    prompt: options.prompt ?? spec.notes ?? spec.name,
    style: spec.stylePreset,
    architecture: style.architecture.style,
    weathering: style.architecture.weathering,
    seed: bake.meta.seed,
    palette: style.palette as unknown as Record<string, string>,
    materialNames: TERRAIN_MATERIALS,
    size: [W, D],
    cellSize: t.cellSize,
    origin: t.origin,
    regionSize: size,
    kit: [...kit.values()].sort((a, b) => (a.key < b.key ? -1 : 1)),
    regions: infos,
    lighting: bake.lighting,
    spawn: bake.spawn,
    ...(bake.landmarks.find((l) => l.role === "focal") ? { focal: bake.landmarks.find((l) => l.role === "focal")!.position } : {}),
    green: [...kit.values()].some((e) => trees.has(e.prefab)),
    environment: spec.design?.environment ?? "",
    settlements: bake.zones.filter((z) => z.kind === "settlement").map((z) => ({ id: z.id, center: z.center, radius: z.radius, type: spec.settlements.find((s) => s.id === z.id)?.type ?? z.id.split("_")[0]! })),
  };
  return { plan, regions };
}
