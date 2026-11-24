import type { WorldBake } from "./bake";

/**
 * How heavy a world is, and how to show it. Nothing here ever removes content: the generator builds what the project asks
 * for, the capacity report says what it costs, and a profile decides how it is represented (how far the small details are
 * drawn, how much is streamed), never how much of it exists.
 */
export const DETAIL_PROFILES = ["performance", "balanced", "high", "maximum"] as const;
export type DetailProfile = (typeof DETAIL_PROFILES)[number];

export interface ProfileSettings {
  /** Non-colliding details (window frames, flowers, signs) are built around the player up to this distance, studs. */
  detailRadius: number;
  /** Main shapes of what is only seen (crowns, roofs) up to this distance, studs. */
  shapeRadius: number;
  /** Workspace streaming radii, studs. */
  streamingMin: number;
  streamingTarget: number;
  /** Small parts cast shadows. */
  smallShadows: boolean;
  /** Ground cover (grass tufts, pebbles) shown up to this distance, studs. */
  coverRadius: number;
}

export const PROFILES: Record<DetailProfile, ProfileSettings> = {
  performance: { detailRadius: 110, shapeRadius: 320, streamingMin: 96, streamingTarget: 512, smallShadows: false, coverRadius: 90 },
  balanced: { detailRadius: 220, shapeRadius: 560, streamingMin: 192, streamingTarget: 1024, smallShadows: false, coverRadius: 180 },
  high: { detailRadius: 360, shapeRadius: 900, streamingMin: 256, streamingTarget: 1600, smallShadows: true, coverRadius: 300 },
  maximum: { detailRadius: 600, shapeRadius: 1400, streamingMin: 384, streamingTarget: 2560, smallShadows: true, coverRadius: 480 },
};

export interface CapacityAdvice {
  id: string;
  /** "limit" is a limit of Roblox itself, "heavy" a cost worth knowing. */
  level: "info" | "heavy" | "limit";
  message: string;
  /** What to do about it, without removing content. */
  action: string;
}

export interface CapacityReport {
  /** World size in studs and in kilometres (1 stud = 0.28 m). */
  size: { width: number; depth: number; km2: number };
  models: number;
  /** Parts if every model were built in full, at once. */
  partsTotal: number;
  /** Parts that exist on the server: colliding ones and the structural shapes. */
  partsServer: number;
  /** Parts drawn around one player for each profile: the densest place of the world. */
  partsAround: Record<DetailProfile, number>;
  meshParts: number;
  uniqueModels: number;
  uniqueMeshes: number;
  /** Triangles of the whole world, instances included (estimate for primitives). */
  triangles: number;
  colliders: number;
  lights: number;
  textures: number;
  chunks: { count: number; size: number; heaviest: number; mean: number; empty: number };
  /** Megabytes of exported data (terrain + placements + models), before compression. */
  exportMb: number;
  /** Estimated server memory, megabytes. */
  memoryMb: number;
  /** Estimated cost of drawing the densest place, 0..100 for each profile (100 = too heavy for that class of device). */
  renderCost: Record<DetailProfile, number>;
  generationMs: number;
  advice: CapacityAdvice[];
}

/** Triangles of a Roblox primitive at full fidelity. */
const TRIS: Record<string, number> = { box: 12, wedge: 8, cornerWedge: 6, cylinder: 96, sphere: 320, mesh: 200 };
/**
 * Parts drawn comfortably around a player on the class of device each profile is meant for. Measured in Studio on a desktop:
 * 52 000 parts around the player at 123 frames per second, 74 000 (36 000 from the server) at a steady 60 with no frame over 21 ms.
 */
const COMFORT: Record<DetailProfile, number> = { performance: 18_000, balanced: 70_000, high: 120_000, maximum: 180_000 };
/** Memory of one streamed instance and of one model, kilobytes (measured order of magnitude). */
const KB_PART = 1.1;
const KB_MODEL = 1.6;

export const CHUNK_SIZE = 256;

export function measureCapacity(bake: WorldBake, chunkSize = CHUNK_SIZE): CapacityReport {
  const t = bake.terrain;
  const W = t.width * t.cellSize;
  const D = t.depth * t.cellSize;
  const w = Math.max(1, Math.ceil(W / chunkSize));
  const d = Math.max(1, Math.ceil(D / chunkSize));
  const server = new Float64Array(w * d);
  const shape = new Float64Array(w * d);
  const detail = new Float64Array(w * d);
  const cost = new Map<string, { parts: number; server: number; shape: number; mesh: number; tris: number; colliders: number; lights: number }>();
  const meshes = new Set<string>();
  const materials = new Set<string>();
  const used = new Set<string>();
  let partsTotal = 0;
  let partsServer = 0;
  let meshParts = 0;
  let triangles = 0;
  let colliders = 0;
  let lights = 0;
  for (const p of bake.placements) {
    const v = bake.prefabs[p.prefab]?.[p.variant];
    if (!v) continue;
    const key = `${p.prefab}/${p.variant}`;
    used.add(key);
    let c = cost.get(key);
    if (!c) {
      c = { parts: 0, server: 0, shape: 0, mesh: 0, tris: 0, colliders: 0, lights: 0 };
      for (const q of v.parts) {
        c.parts++;
        const solid = q.collide !== false;
        // what the server holds: what is touched or named; the clients build the rest around themselves
        if (solid || q.name !== undefined || q.billboard) c.server++;
        else if ((q.lod ?? 0) > 0) c.shape++;
        if (solid) c.colliders++;
        if (q.light) c.lights++;
        if (q.shape === "mesh") {
          c.mesh++;
          const m = q.mesh !== undefined ? v.meshes?.[q.mesh] : undefined;
          c.tris += m?.triangleCount ?? TRIS.mesh!;
          if (q.mesh !== undefined) meshes.add(q.mesh);
        } else c.tris += TRIS[q.shape] ?? 12;
        materials.add(q.material);
      }
      cost.set(key, c);
    }
    partsTotal += c.parts;
    partsServer += c.server;
    meshParts += c.mesh;
    triangles += c.tris;
    colliders += c.colliders;
    lights += c.lights;
    const x = Math.max(0, Math.min(w - 1, Math.floor((p.position[0] - t.origin[0]) / chunkSize)));
    const z = Math.max(0, Math.min(d - 1, Math.floor((p.position[2] - t.origin[1]) / chunkSize)));
    server[z * w + x]! += c.server;
    shape[z * w + x]! += c.shape;
    detail[z * w + x]! += c.parts - c.server - c.shape;
  }
  /** The densest disc of the given radius, approximated on the chunk grid. */
  const densest = (grid: Float64Array, radius: number): number => {
    const r = Math.max(0, radius / chunkSize);
    const k = Math.ceil(r);
    let best = 0;
    for (let z = 0; z < d; z++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let dz = -k; dz <= k; dz++) for (let dx = -k; dx <= k; dx++) {
          if (x + dx < 0 || z + dz < 0 || x + dx >= w || z + dz >= d || Math.hypot(dx, dz) > r + 0.3) continue;
          sum += grid[(z + dz) * w + x + dx]!;
        }
        // a disc smaller than a chunk holds its share of it
        const area = k === 0 || r < 0.6 ? Math.min(1, Math.PI * r * r) : 1;
        best = Math.max(best, sum * area);
      }
    }
    return Math.round(best);
  };
  const partsAround = {} as Record<DetailProfile, number>;
  const renderCost = {} as Record<DetailProfile, number>;
  for (const profile of DETAIL_PROFILES) {
    const s = PROFILES[profile];
    // far models are drawn from their imposters: what counts in full is what stands within half of the streaming radius
    partsAround[profile] = densest(server, s.streamingTarget * 0.5) + densest(shape, s.shapeRadius) + densest(detail, s.detailRadius);
    renderCost[profile] = Math.round(Math.min(400, (100 * partsAround[profile]) / COMFORT[profile]));
  }
  const loads = Array.from(server, (v, i) => v + shape[i]! + detail[i]!);
  const cells = t.width * t.depth;
  let variantParts = 0;
  for (const key of used) {
    const c = cost.get(key)!;
    variantParts += c.parts;
  }
  const exportMb = (cells * 10 * 1.34 + bake.placements.length * 110 + variantParts * 190 + t.ops.length * 160) / 1e6;
  // voxels are dense only near the surface: about a dozen of them under each column
  const memoryMb = (partsServer * KB_PART + bake.placements.length * KB_MODEL) / 1024 + (cells * (t.cellSize / 4) ** 2 * 12 * 2) / 1e6;
  const advice: CapacityAdvice[] = [];
  const far = Math.max(W, D) / 2;
  if (far > 8192) advice.push({ id: "precision", level: far > 16_384 ? "limit" : "heavy", message: `the world reaches ${Math.round(far)} studs from the origin; positions lose precision far from it`, action: "keep the main places near the origin, or split the world into several places linked by teleports" });
  if (memoryMb > 3500) advice.push({ id: "server_memory", level: "limit", message: `about ${Math.round(memoryMb)} MB on the server, whose memory is finite (6.25 GB, more with player slots)`, action: "merge trees and rocks into mesh assets (Blender kit), or split the world into several places" });
  else if (memoryMb > 1800) advice.push({ id: "server_memory", level: "heavy", message: `about ${Math.round(memoryMb)} MB on the server`, action: "publish the kit meshes so a tree is one or two MeshParts instead of ten parts" });
  if (exportMb > 90) advice.push({ id: "file_size", level: "limit", message: `about ${Math.round(exportMb)} MB of world data; a place file is limited to 100 MB`, action: "export the regions as separate places" });
  if (renderCost.balanced > 100) advice.push({ id: "dense_place", level: "heavy", message: `${partsAround.balanced} parts around a player in the densest place (balanced profile)`, action: "use mesh assets for the buildings there, or play that place with the performance profile" });
  if (used.size > 900) advice.push({ id: "many_models", level: "heavy", message: `${used.size} different models: the more are shared, the more are drawn in one go`, action: "lower the number of variants per prefab; the world keeps its size" });
  if (lights > 1500) advice.push({ id: "many_lights", level: "heavy", message: `${lights} lights in the world`, action: "lights are details: the client only builds those near the player" });
  return {
    size: { width: W, depth: D, km2: Math.round(((W * 0.28) / 1000) * ((D * 0.28) / 1000) * 100) / 100 },
    models: bake.placements.length,
    partsTotal,
    partsServer,
    partsAround,
    meshParts,
    uniqueModels: used.size,
    uniqueMeshes: meshes.size,
    triangles,
    colliders,
    lights,
    textures: materials.size,
    chunks: { count: w * d, size: chunkSize, heaviest: Math.round(Math.max(0, ...loads)), mean: Math.round(loads.reduce((a, b) => a + b, 0) / loads.length), empty: loads.filter((v) => v === 0).length },
    exportMb: Math.round(exportMb * 10) / 10,
    memoryMb: Math.round(memoryMb),
    renderCost,
    generationMs: bake.stats.generationMs,
    advice,
  };
}
