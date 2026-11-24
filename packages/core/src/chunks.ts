import { base64ToBytes, base64ToF32, bytesToBase64, f32ToBase64, type Placement, type PlacementLayer, type WorldBake, type WorldBakeJSON, type Zone } from "./bake";
import { CHUNK_SIZE } from "./capacity";
import type { Vec2, Vec3 } from "./math";
import type { PrefabCategory } from "./partlist";
import type { BiomeId } from "./schemas/world-spec";

/**
 * A world cut into square cells. Every placement belongs to exactly one chunk; roads, rivers and relief are cut on the
 * border and meet again on the other side (`seams`), because the plan they come from is the whole world's. A chunk can be
 * saved, loaded and drawn again alone.
 */
export interface ChunkSeam {
  /** The neighbour this way goes on into. */
  to: string;
  path: string;
  kind: "road" | "river";
  at: Vec2;
}

export interface ChunkInfo {
  id: string;
  cx: number;
  cz: number;
  /** World rectangle: x0, z0, x1, z1. */
  rect: [number, number, number, number];
  /** Region the chunk belongs to: the settlement it is nearest to, or the wild land of its biome. */
  region: string;
  /** Quarter of a settlement, when it lies in one. */
  district?: string;
  kind: "urban" | "outskirts" | "rural" | "wild" | "water";
  placements: number;
  parts: number;
  seams: ChunkSeam[];
  /** Chunks that must be there for this one to be complete (the other side of its ways). */
  depends: string[];
  /** Changes when anything in the chunk changes. */
  hash: string;
}

export interface WorldChunks {
  size: number;
  width: number;
  depth: number;
  list: ChunkInfo[];
}

export const chunkId = (cx: number, cz: number) => `c${cx}_${cz}`;

export function chunkAt(bake: WorldBake, x: number, z: number, size = CHUNK_SIZE): [number, number] {
  const t = bake.terrain;
  const w = Math.ceil((t.width * t.cellSize) / size);
  const d = Math.ceil((t.depth * t.cellSize) / size);
  return [Math.max(0, Math.min(w - 1, Math.floor((x - t.origin[0]) / size))), Math.max(0, Math.min(d - 1, Math.floor((z - t.origin[1]) / size)))];
}

/** 53-bit string hash (cyrb53). */
function hashOf(parts: Iterable<number | string>): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (const p of parts) {
    const s = typeof p === "number" ? p.toFixed(3) : p;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return ((h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0"));
}

/** Where a line crosses from one chunk into the next. */
function crossings(points: Vec2[], origin: Vec2, size: number): { at: Vec2; from: [number, number]; to: [number, number] }[] {
  const out: { at: Vec2; from: [number, number]; to: [number, number] }[] = [];
  const cell = (q: Vec2): [number, number] => [Math.floor((q[0] - origin[0]) / size), Math.floor((q[1] - origin[1]) / size)];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    // every grid line between the two points, in order
    const ts: number[] = [];
    for (const k of [0, 1] as const) {
      const lo = Math.min(a[k], b[k]);
      const hi = Math.max(a[k], b[k]);
      for (let g = Math.ceil((lo - origin[k]) / size); origin[k] + g * size <= hi; g++) {
        const v = origin[k] + g * size;
        if (b[k] !== a[k]) ts.push((v - a[k]) / (b[k] - a[k]));
      }
    }
    for (const t of ts.sort((p, q) => p - q)) {
      const e = 1e-4;
      const at: Vec2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const f = cell([a[0] + (b[0] - a[0]) * (t - e), a[1] + (b[1] - a[1]) * (t - e)]);
      const g = cell([a[0] + (b[0] - a[0]) * (t + e), a[1] + (b[1] - a[1]) * (t + e)]);
      if (f[0] !== g[0] || f[1] !== g[1]) out.push({ at, from: f, to: g });
    }
  }
  return out;
}

export function chunkWorld(bake: WorldBake, size = CHUNK_SIZE): WorldChunks {
  const t = bake.terrain;
  const w = Math.max(1, Math.ceil((t.width * t.cellSize) / size));
  const d = Math.max(1, Math.ceil((t.depth * t.cellSize) / size));
  const own: Placement[][] = Array.from({ length: w * d }, () => []);
  for (const p of bake.placements) {
    const [cx, cz] = chunkAt(bake, p.position[0], p.position[2], size);
    own[cz * w + cx]!.push(p);
  }
  const seams: ChunkSeam[][] = Array.from({ length: w * d }, () => []);
  for (const path of bake.paths) {
    for (const c of crossings(path.points, t.origin, size)) {
      const inside = (q: [number, number]) => q[0] >= 0 && q[1] >= 0 && q[0] < w && q[1] < d;
      if (!inside(c.from) || !inside(c.to)) continue;
      seams[c.from[1] * w + c.from[0]]!.push({ to: chunkId(c.to[0], c.to[1]), path: path.id, kind: path.kind, at: c.at });
      seams[c.to[1] * w + c.to[0]]!.push({ to: chunkId(c.from[0], c.from[1]), path: path.id, kind: path.kind, at: c.at });
    }
  }
  const sites: Zone[] = bake.zones.filter((z) => z.kind === "settlement");
  const districts = (bake.plan?.settlements ?? []).flatMap((s) => s.districts.map((q) => ({ ...q, settlement: s.settlement })));
  const list: ChunkInfo[] = [];
  const cells = Math.max(1, Math.round(size / t.cellSize));
  for (let cz = 0; cz < d; cz++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cz * w + cx;
      const rect: ChunkInfo["rect"] = [t.origin[0] + cx * size, t.origin[1] + cz * size, Math.min(t.origin[0] + t.width * t.cellSize, t.origin[0] + (cx + 1) * size), Math.min(t.origin[1] + t.depth * t.cellSize, t.origin[1] + (cz + 1) * size)];
      const mx = (rect[0] + rect[2]) / 2;
      const mz = (rect[1] + rect[3]) / 2;
      const near = [...sites].sort((a, b) => Math.hypot(a.center[0] - mx, a.center[1] - mz) - Math.hypot(b.center[0] - mx, b.center[1] - mz))[0];
      const dn = near ? Math.hypot(near.center[0] - mx, near.center[1] - mz) : Infinity;
      // what covers most of it
      const votes = new Map<number, number>();
      let wet = 0;
      let n = 0;
      for (let z = cz * cells; z < Math.min(t.depth, (cz + 1) * cells); z += 4) {
        for (let x = cx * cells; x < Math.min(t.width, (cx + 1) * cells); x += 4) {
          const k = z * t.width + x;
          n++;
          if (!Number.isNaN(t.water[k]!)) wet++;
          votes.set(t.biomes[k]!, (votes.get(t.biomes[k]!) ?? 0) + 1);
        }
      }
      const biome = t.biomeIds[[...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0] ?? "meadow";
      const half = size * 0.6;
      const kind: ChunkInfo["kind"] = n > 0 && wet / n > 0.85 ? "water" : near && dn < near.radius + half * 0.6 ? "urban" : near && dn < near.radius * 1.6 + half ? "outskirts" : near && dn < near.radius * 3 + size * 2 ? "rural" : "wild";
      const district = kind === "urban" ? districts.filter((q) => q.settlement === near!.id).sort((a, b) => Math.hypot(a.center[0] - mx, a.center[1] - mz) - Math.hypot(b.center[0] - mx, b.center[1] - mz) || a.radius - b.radius)[0]?.id : undefined;
      let parts = 0;
      for (const p of own[i]!) parts += bake.prefabs[p.prefab]?.[p.variant]?.parts.length ?? 0;
      const hash = hashOf((function* () {
        for (const p of own[i]!) {
          yield p.id;
          yield p.prefab;
          yield p.variant;
          yield* p.position;
          yield p.rotationY;
          yield p.scale;
        }
        for (let z = cz * cells; z < Math.min(t.depth, (cz + 1) * cells); z++) for (let x = cx * cells; x < Math.min(t.width, (cx + 1) * cells); x++) {
          yield t.heights[z * t.width + x]!;
          yield t.materials[z * t.width + x]!;
        }
      })());
      list.push({ id: chunkId(cx, cz), cx, cz, rect, region: near && kind !== "wild" && kind !== "water" ? near.id : kind === "water" ? "sea" : `wild_${biome}`, ...(district ? { district } : {}), kind, placements: own[i]!.length, parts, seams: seams[i]!, depends: [...new Set(seams[i]!.map((s) => s.to))].sort(), hash });
    }
  }
  return { size, width: w, depth: d, list };
}

// ------------------------------------------------------------------ files
/** Heights are stored on 16 bits, a thirty-second of a stud apart. */
const STEP = 32;
const DRY = -32768;

export interface ChunkJSON {
  id: string;
  /** First cell and size of the terrain slice; one more row and column than the chunk, so neighbours share their edge. */
  x0: number;
  z0: number;
  w: number;
  d: number;
  base: number;
  heightsB64: string;
  waterB64: string;
  materialsB64: string;
  biomesB64: string;
  /** [prefab, variant, x, y, z, rotY, scale, upX, upZ] per placement, and what it is. */
  placementsB64: string;
  ids: string[];
  /** Category, layer, flags (1 locked, 2 fixed), importance x10, biome + 1, zone + 1: six numbers per placement. */
  meta: number[];
}

export interface WorldIndexJSON extends Omit<WorldBakeJSON, "placementsB64" | "placementMeta" | "terrain" | "prefabs"> {
  format: "chunks";
  terrain: Omit<WorldBakeJSON["terrain"], "heightsB64" | "materialsB64" | "waterB64" | "biomesB64">;
  chunks: WorldChunks;
  zoneNames: string[];
  /** A coarse copy of the ground, at most 160 cells a side: what a minimap needs. */
  overview: WorldBakeJSON["terrain"];
}

const CATEGORIES: PrefabCategory[] = ["vegetation", "rock", "building", "prop", "landmark", "path", "water", "npc"];
const LAYERS: PlacementLayer[] = ["foreground", "midground", "background"];

export interface ChunkedWorld {
  index: WorldIndexJSON;
  chunks: ChunkJSON[];
  prefabs: WorldBake["prefabs"];
}

const i16ToBase64 = (a: Int16Array) => bytesToBase64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
const base64ToI16 = (s: string) => {
  const b = base64ToBytes(s);
  const copy = new Uint8Array(b.length - (b.length % 2));
  copy.set(b.subarray(0, copy.length));
  return new Int16Array(copy.buffer);
};

function overviewOf(bake: WorldBake, minHeight: number, maxHeight: number): WorldBakeJSON["terrain"] {
  const t = bake.terrain;
  const k = Math.max(1, Math.ceil(Math.max(t.width, t.depth) / 160));
  const w = Math.floor(t.width / k);
  const d = Math.floor(t.depth / k);
  const heights = new Float32Array(w * d);
  const water = new Float32Array(w * d);
  const materials = new Uint8Array(w * d);
  const biomes = new Uint8Array(w * d);
  for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
    const i = z * k * t.width + x * k;
    heights[z * w + x] = t.heights[i]!;
    water[z * w + x] = t.water[i]!;
    materials[z * w + x] = t.materials[i]!;
    biomes[z * w + x] = t.biomes[i]!;
  }
  return { cellSize: t.cellSize * k, width: w, depth: d, origin: t.origin, heightsB64: f32ToBase64(heights), waterB64: f32ToBase64(water), materialsB64: bytesToBase64(materials), biomesB64: bytesToBase64(biomes), biomeIds: t.biomeIds, minHeight, maxHeight, ...(t.mode ? { mode: t.mode } : {}) };
}

export function serializeChunks(bake: WorldBake, size = CHUNK_SIZE): ChunkedWorld {
  const t = bake.terrain;
  const chunks = chunkWorld(bake, size);
  const prefabIndex = Object.keys(bake.prefabs);
  const pIdx = new Map(prefabIndex.map((p, i) => [p, i]));
  const zoneNames: string[] = [];
  const zIdx = new Map<string, number>();
  const cells = Math.round(size / t.cellSize);
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let i = 0; i < t.heights.length; i++) {
    const h = t.heights[i]!;
    if (h < minHeight) minHeight = h;
    if (h > maxHeight) maxHeight = h;
  }
  const own = new Map<string, Placement[]>(chunks.list.map((c) => [c.id, []]));
  for (const p of bake.placements) own.get(chunkId(...chunkAt(bake, p.position[0], p.position[2], size)))!.push(p);
  const out: ChunkJSON[] = chunks.list.map((c) => {
    const x0 = c.cx * cells;
    const z0 = c.cz * cells;
    const w = Math.min(t.width - x0, cells + 1);
    const d = Math.min(t.depth - z0, cells + 1);
    const heights = new Int16Array(w * d);
    const water = new Int16Array(w * d);
    const materials = new Uint8Array(w * d);
    const biomes = new Uint8Array(w * d);
    const base = Math.round((minHeight + maxHeight) / 2);
    for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
      const k = (z0 + z) * t.width + x0 + x;
      const i = z * w + x;
      heights[i] = Math.round((t.heights[k]! - base) * STEP);
      const q = t.water[k]!;
      water[i] = Number.isNaN(q) ? DRY : Math.round((q - base) * STEP);
      materials[i] = t.materials[k]!;
      biomes[i] = t.biomes[k]!;
    }
    const list = own.get(c.id)!;
    const buf = new Float32Array(list.length * 9);
    const meta: number[] = [];
    list.forEach((p, i) => {
      buf.set([pIdx.get(p.prefab) ?? 0, p.variant, p.position[0], p.position[1], p.position[2], p.rotationY, p.scale, p.up ? p.up[0] : 0, p.up ? p.up[2] : 0], i * 9);
      let zone = 0;
      if (p.zone !== undefined) {
        let z = zIdx.get(p.zone);
        if (z === undefined) {
          z = zoneNames.length;
          zoneNames.push(p.zone);
          zIdx.set(p.zone, z);
        }
        zone = z + 1;
      }
      meta.push(CATEGORIES.indexOf(p.category), LAYERS.indexOf(p.layer), (p.locked ? 1 : 0) + (p.fixed ? 2 : 0), Math.round(p.importance * 10), p.biome ? t.biomeIds.indexOf(p.biome) + 1 : 0, zone);
    });
    return { id: c.id, x0, z0, w, d, base, heightsB64: i16ToBase64(heights), waterB64: i16ToBase64(water), materialsB64: bytesToBase64(materials), biomesB64: bytesToBase64(biomes), placementsB64: f32ToBase64(buf), ids: list.map((p) => p.id), meta };
  });
  const index: WorldIndexJSON = {
    format: "chunks",
    meta: bake.meta,
    terrain: { cellSize: t.cellSize, width: t.width, depth: t.depth, origin: t.origin, biomeIds: t.biomeIds, minHeight, maxHeight, ops: t.ops ?? [], ...(t.mode ? { mode: t.mode } : {}) },
    placementCount: bake.placements.length,
    prefabIndex,
    zones: bake.zones,
    paths: bake.paths,
    landmarks: bake.landmarks,
    lighting: bake.lighting,
    spawn: bake.spawn,
    stats: bake.stats,
    ...(bake.plan ? { plan: bake.plan } : {}),
    chunks,
    zoneNames,
    overview: overviewOf(bake, minHeight, maxHeight),
  };
  return { index, chunks: out, prefabs: bake.prefabs };
}

export function deserializeChunks(world: ChunkedWorld): WorldBake {
  const { index } = world;
  const t = index.terrain;
  const n = t.width * t.depth;
  const heights = new Float32Array(n);
  const water = new Float32Array(n).fill(NaN);
  const materials = new Uint8Array(n);
  const biomes = new Uint8Array(n);
  const placements: Placement[] = [];
  for (const c of world.chunks) {
    const h = base64ToI16(c.heightsB64);
    const q = base64ToI16(c.waterB64);
    const m = base64ToBytes(c.materialsB64);
    const b = base64ToBytes(c.biomesB64);
    for (let z = 0; z < c.d; z++) for (let x = 0; x < c.w; x++) {
      const k = (c.z0 + z) * t.width + c.x0 + x;
      const i = z * c.w + x;
      heights[k] = h[i]! / STEP + c.base;
      water[k] = q[i] === DRY ? NaN : q[i]! / STEP + c.base;
      materials[k] = m[i]!;
      biomes[k] = b[i]!;
    }
    const buf = base64ToF32(c.placementsB64);
    c.ids.forEach((id, i) => {
      const o = i * 9;
      const [cat, layer, flags, importance, biome, zone] = c.meta.slice(i * 6, i * 6 + 6) as [number, number, number, number, number, number];
      const ux = buf[o + 7]!;
      const uz = buf[o + 8]!;
      const up: Vec3 | undefined = ux !== 0 || uz !== 0 ? [ux, Math.sqrt(Math.max(0, 1 - ux * ux - uz * uz)), uz] : undefined;
      placements.push({
        up,
        id,
        prefab: index.prefabIndex[buf[o]!]!,
        variant: buf[o + 1]!,
        category: CATEGORIES[cat]!,
        position: [buf[o + 2]!, buf[o + 3]!, buf[o + 4]!],
        rotationY: buf[o + 5]!,
        scale: buf[o + 6]!,
        layer: LAYERS[layer]!,
        locked: (flags & 1) !== 0,
        importance: importance / 10,
        biome: biome > 0 ? (t.biomeIds[biome - 1] as BiomeId) : undefined,
        zone: zone > 0 ? index.zoneNames[zone - 1] : undefined,
        fixed: (flags & 2) !== 0 || undefined,
      });
    });
  }
  return {
    meta: index.meta,
    terrain: { cellSize: t.cellSize, width: t.width, depth: t.depth, origin: t.origin, heights, materials, water, biomes, biomeIds: t.biomeIds, ops: t.ops ?? [], ...(t.mode ? { mode: t.mode } : {}) },
    prefabs: world.prefabs,
    placements,
    zones: index.zones,
    paths: index.paths,
    landmarks: index.landmarks,
    lighting: index.lighting,
    spawn: index.spawn,
    stats: index.stats,
    ...(index.plan ? { plan: index.plan } : {}),
  };
}
