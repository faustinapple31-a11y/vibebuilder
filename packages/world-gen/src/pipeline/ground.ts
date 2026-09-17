import { Rng, TERRAIN_MATERIALS, TERRAIN_MATERIAL_INDEX, deriveSeed, jitterHex, mixHex, type MeshData, type PrefabVariant, type RobloxMaterial, type TerrainMaterial, type TerrainOp, type Vec2 } from "@worldforge/core";
import { PartListBuilder } from "@worldforge/prefabs";
import { progress, seaLevelOf, type GenContext } from "../context";

/**
 * Parts-built ground (every world): the heightmap is quantized into terraces (`GROUND_STEP` studs), every
 * connected plateau becomes one `ground_block` prefab — a flat slab (any polygon, holes included, ear-clipped
 * into wedge pairs) over stepped cliff walls where the neighbouring level is lower — and the water becomes
 * fill-block ops. Roads get their own thin slabs. No smooth terrain is written: the runtime only applies
 * the ops. The heightmap stays the placement reference and is exactly the slab tops.
 */
export const GROUND_STEP = 8;

const MAJORITY_PASSES = 5;
const MIN_REGION_CELLS = 24;

/** Round the heightmap to terraces, remove single-cell noise and flatten the deep sea floor. */
export function quantizeHeights(ctx: GenContext): void {
  const { width, depth } = ctx;
  const h = ctx.heights;
  const step = GROUND_STEP;
  const sea = seaLevelOf(ctx.spec);
  h.map((_x, _z, v, i) => {
    let q = Math.round(v / step) * step;
    const w = ctx.water.data[i]!;
    if (!Number.isNaN(w) && q > w - 1) q = Math.floor((w - 1.5) / step) * step; // beds stay under their water
    if (Number.isFinite(sea) && q < sea - 14) q = Math.round((sea - 18) / step) * step; // one flat sea floor level
    return q;
  });
  // majority filter (3×3) then tiny regions → neighbour level
  const lv = new Int16Array(width * depth);
  for (let i = 0; i < lv.length; i++) lv[i] = Math.round(h.data[i]! / step);
  for (let pass = 0; pass < MAJORITY_PASSES; pass++) {
    const next = new Int16Array(lv);
    for (let z = 2; z < depth - 2; z++) {
      for (let x = 2; x < width - 2; x++) {
        const i = z * width + x;
        const counts = new Map<number, number>();
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          const l = lv[i + dz * width + dx]!;
          counts.set(l, (counts.get(l) ?? 0) + 1);
        }
        let best = lv[i]!;
        let bestN = 0;
        for (const [l, n] of counts) if (n > bestN) (bestN = n), (best = l);
        if (bestN >= 13 && best !== lv[i]) next[i] = best;
      }
    }
    lv.set(next);
  }
  removeTinyRegions(lv, width, depth);
  for (let i = 0; i < lv.length; i++) {
    const w = ctx.water.data[i]!;
    let q = lv[i]! * step;
    if (!Number.isNaN(w) && q > w - 1) q = Math.floor((w - 1.5) / step) * step;
    h.data[i] = q;
  }
  // banks: a dry cell next to water never sits under that water's surface (no water walls)
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const i = z * width + x;
      if (!Number.isNaN(ctx.water.data[i]!)) continue;
      let surface = -Infinity;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const zz = z + dz;
        if (xx < 0 || zz < 0 || xx >= width || zz >= depth) continue;
        const w = ctx.water.data[zz * width + xx]!;
        if (!Number.isNaN(w) && w > surface) surface = w;
      }
      if (surface > -Infinity && h.data[i]! < surface + 0.5) h.data[i] = Math.ceil((surface + 0.5) / step) * step;
    }
  }
  h.nearest = true;
}

function removeTinyRegions(lv: Int16Array, width: number, depth: number): void {
  const seen = new Uint8Array(lv.length);
  const stack: number[] = [];
  for (let start = 0; start < lv.length; start++) {
    if (seen[start]) continue;
    const level = lv[start]!;
    const cells: number[] = [];
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      cells.push(i);
      const x = i % width;
      const z = (i - x) / width;
      const nb = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, z > 0 ? i - width : -1, z < depth - 1 ? i + width : -1];
      for (const j of nb) if (j >= 0 && !seen[j] && lv[j] === level) (seen[j] = 1), stack.push(j);
    }
    if (cells.length >= MIN_REGION_CELLS) continue;
    // most common neighbouring level
    const counts = new Map<number, number>();
    for (const i of cells) {
      const x = i % width;
      const z = (i - x) / width;
      const nb = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, z > 0 ? i - width : -1, z < depth - 1 ? i + width : -1];
      for (const j of nb) if (j >= 0 && lv[j] !== level) counts.set(lv[j]!, (counts.get(lv[j]!) ?? 0) + 1);
    }
    let best = level;
    let bestN = 0;
    for (const [l, n] of counts) if (n > bestN) (bestN = n), (best = l);
    for (const i of cells) lv[i] = best;
  }
}

/** Snap a disc of cells to one terrace level (parts-mode flatten). Returns the pad height. */
export function flattenToLevel(ctx: GenContext, center: Vec2, radius: number, targetHeight?: number): number {
  const h = ctx.heights;
  const step = GROUND_STEP;
  const [ccx, ccz] = h.toCell(center[0], center[1]);
  const rc = Math.ceil(radius / ctx.cellSize) + 1;
  let sum = 0;
  let count = 0;
  for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) {
    const x = Math.round(ccx) + dx;
    const z = Math.round(ccz) + dz;
    if (x < 0 || z < 0 || x >= ctx.width || z >= ctx.depth) continue;
    const [wx, wz] = h.toWorld(x, z);
    if (Math.hypot(wx - center[0], wz - center[1]) > radius) continue;
    const i = z * ctx.width + x;
    if (!Number.isNaN(ctx.water.data[i]!)) continue;
    sum += h.data[i]!;
    count++;
  }
  const base = Math.round((targetHeight ?? (count ? sum / count : h.sample(center[0], center[1]))) / step) * step;
  for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) {
    const x = Math.round(ccx) + dx;
    const z = Math.round(ccz) + dz;
    if (x < 0 || z < 0 || x >= ctx.width || z >= ctx.depth) continue;
    const [wx, wz] = h.toWorld(x, z);
    if (Math.hypot(wx - center[0], wz - center[1]) > radius) continue;
    const i = z * ctx.width + x;
    if (!Number.isNaN(ctx.water.data[i]!)) continue;
    h.data[i] = base;
  }
  return base;
}

// ---------------------------------------------------------------- regions → polygons

/** A rim point; `out` = terrace level just outside the edge that starts here (walls know exactly what they face). */
interface TPt {
  x: number;
  z: number;
  out: number;
}

interface Loop {
  pts: TPt[];
  area: number;
}

/**
 * Boundary loops of a cell set on the corner lattice (world coordinates), every edge tagged with the level
 * of the cell across it; outer loops have positive area.
 */
function traceLoops(cells: Set<number>, width: number, depth: number, cellSize: number, origin: Vec2, levelAt: (i: number) => number, outsideWorld: number): Loop[] {
  // directed edges keyed by start corner; corner id = z * (width + 1) + x
  const W = width + 1;
  const edges = new Map<number, { to: number; out: number }[]>();
  const push = (a: number, b: number, out: number) => {
    const list = edges.get(a);
    if (list) list.push({ to: b, out });
    else edges.set(a, [{ to: b, out }]);
  };
  const across = (x: number, z: number) => (x < 0 || z < 0 || x >= width || z >= depth ? outsideWorld : levelAt(z * width + x));
  for (const i of cells) {
    const x = i % width;
    const z = (i - x) / width;
    const c00 = z * W + x;
    const c10 = c00 + 1;
    const c01 = c00 + W;
    const c11 = c01 + 1;
    if (z === 0 || !cells.has(i - width)) push(c00, c10, across(x, z - 1)); // north
    if (x === width - 1 || !cells.has(i + 1)) push(c10, c11, across(x + 1, z)); // east
    if (z === depth - 1 || !cells.has(i + width)) push(c11, c01, across(x, z + 1)); // south
    if (x === 0 || !cells.has(i - 1)) push(c01, c00, across(x - 1, z)); // west
  }
  const loops: Loop[] = [];
  const toWorld = (c: number, out: number): TPt => {
    const x = c % W;
    const z = (c - x) / W;
    return { x: origin[0] + (x - 0.5) * cellSize, z: origin[1] + (z - 0.5) * cellSize, out };
  };
  for (const [start, list] of edges) {
    while (list.length) {
      const first = list.pop()!;
      const pts: TPt[] = [toWorld(start, first.out)];
      let cur = first.to;
      let guard = 0;
      while (cur !== start && guard++ < 200000) {
        const nxt = edges.get(cur);
        if (!nxt || nxt.length === 0) break;
        const e = nxt.pop()!;
        pts.push(toWorld(cur, e.out));
        cur = e.to;
      }
      let area = 0;
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k]!;
        const b = pts[(k + 1) % pts.length]!;
        area += a.x * b.z - b.x * a.z;
      }
      loops.push({ pts, area: area / 2 });
    }
  }
  return loops;
}

/** Reverse a tagged loop (edge tags follow their edges). */
function reverseT(pts: TPt[]): TPt[] {
  const n = pts.length;
  const out: TPt[] = [];
  for (let j = 0; j < n; j++) {
    const p = pts[n - 1 - j]!;
    const e = pts[(2 * n - 2 - j) % n]!; // old edge (n-2-j) → its start point carries the tag
    out.push({ x: p.x, z: p.z, out: e.out });
  }
  return out;
}

/** Douglas-Peucker on a closed tagged loop: a merged edge faces the lowest level of the edges it replaces. */
function simplifyT(pts: TPt[], eps: number): TPt[] {
  if (pts.length < 6) return pts;
  let far = 0;
  let farD = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i]!.x - pts[0]!.x, pts[i]!.z - pts[0]!.z);
    if (d > farD) (farD = d), (far = i);
  }
  const keepA = dpIdx(pts, 0, far, eps);
  const keepB = dpIdx(pts, far, pts.length, eps); // index pts.length ≡ pts[0]
  const keep = [...keepA.slice(0, -1), ...keepB.slice(0, -1)];
  const out: TPt[] = [];
  for (let k = 0; k < keep.length; k++) {
    const i0 = keep[k]!;
    const i1 = keep[(k + 1) % keep.length]!;
    let lowest = Infinity;
    for (let i = i0; i !== i1; i = (i + 1) % pts.length) lowest = Math.min(lowest, pts[i]!.out);
    out.push({ x: pts[i0]!.x, z: pts[i0]!.z, out: lowest });
  }
  return out;
}

/** Indices kept by Douglas-Peucker between pts[a] and pts[b] (b may equal pts.length = wrap to 0). */
function dpIdx(pts: TPt[], a: number, b: number, eps: number): number[] {
  const at = (i: number) => pts[i % pts.length]!;
  if (b - a < 2) return [a, b];
  const A = at(a);
  const B = at(b);
  let idx = -1;
  let maxD = eps;
  const abx = B.x - A.x;
  const abz = B.z - A.z;
  const ab2 = abx * abx + abz * abz || 1e-9;
  for (let i = a + 1; i < b; i++) {
    const P = at(i);
    const t = Math.max(0, Math.min(1, ((P.x - A.x) * abx + (P.z - A.z) * abz) / ab2));
    const d = Math.hypot(P.x - (A.x + abx * t), P.z - (A.z + abz * t));
    if (d > maxD) (maxD = d), (idx = i);
  }
  if (idx < 0) return [a, b];
  return [...dpIdx(pts, a, idx, eps).slice(0, -1), ...dpIdx(pts, idx, b, eps)];
}

/** Chaikin corner cutting on a tagged loop (the corner edge faces the lower of its two neighbours). */
function chaikinT(pts: TPt[]): TPt[] {
  const out: TPt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    out.push({ x: p.x * 0.75 + q.x * 0.25, z: p.z * 0.75 + q.z * 0.25, out: p.out }, { x: p.x * 0.25 + q.x * 0.75, z: p.z * 0.25 + q.z * 0.75, out: Math.min(p.out, q.out) });
  }
  return out;
}

const xy = (pts: TPt[]): Vec2[] => pts.map((p) => [p.x, p.z] as Vec2);

function signedArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

// ---------------------------------------------------------------- triangulation (ear clipping with holes)

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** Outer polygon (CCW) + holes (CW) → one simple polygon with bridge edges to each hole. */
function bridgeHoles(outer: Vec2[], holes: Vec2[][]): Vec2[] {
  let poly = outer.slice();
  const sorted = holes.slice().sort((a, b) => Math.max(...b.map((p) => p[0])) - Math.max(...a.map((p) => p[0])));
  for (const hole of sorted) {
    let mi = 0;
    for (let i = 1; i < hole.length; i++) if (hole[i]![0] > hole[mi]![0]) mi = i;
    const M = hole[mi]!;
    // closest visible vertex of the current polygon
    let best = -1;
    let bestD = Infinity;
    for (let v = 0; v < poly.length; v++) {
      const V = poly[v]!;
      const d = Math.hypot(V[0] - M[0], V[1] - M[1]);
      if (d >= bestD) continue;
      let visible = true;
      for (let e = 0; e < poly.length && visible; e++) {
        const p = poly[e]!;
        const q = poly[(e + 1) % poly.length]!;
        if (p === V || q === V) continue;
        if (segmentsIntersect(M, V, p, q)) visible = false;
      }
      for (let e = 0; e < hole.length && visible; e++) {
        const p = hole[e]!;
        const q = hole[(e + 1) % hole.length]!;
        if (p === M || q === M) continue;
        if (segmentsIntersect(M, V, p, q)) visible = false;
      }
      if (visible) (bestD = d), (best = v);
    }
    if (best < 0) continue; // no bridge found: the hole is skipped (slab covers it)
    const rotated = [...hole.slice(mi), ...hole.slice(0, mi)];
    poly = [...poly.slice(0, best + 1), ...rotated, M, poly[best]!, ...poly.slice(best + 1)];
  }
  return poly;
}

function earClip(poly: Vec2[]): [Vec2, Vec2, Vec2][] {
  const n = poly.length;
  if (n < 3) return [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(i);
  const cross = (a: Vec2, b: Vec2, c: Vec2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inTri = (p: Vec2, a: Vec2, b: Vec2, c: Vec2) => {
    const d1 = cross(a, b, p);
    const d2 = cross(b, c, p);
    const d3 = cross(c, a, p);
    const neg = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9;
    const pos = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9;
    return !(neg && pos);
  };
  const tris: [Vec2, Vec2, Vec2][] = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 20000) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length]!;
      const i1 = idx[k]!;
      const i2 = idx[(k + 1) % idx.length]!;
      const a = poly[i0]!;
      const b = poly[i1]!;
      const c = poly[i2]!;
      const area2 = cross(a, b, c);
      if (area2 <= 1e-9) {
        if (Math.abs(area2) <= 1e-9) {
          // collinear spike: drop the vertex
          idx.splice(k, 1);
          clipped = true;
          break;
        }
        continue; // reflex
      }
      let ear = true;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        const p = poly[j]!;
        if ((p[0] === a[0] && p[1] === a[1]) || (p[0] === b[0] && p[1] === b[1]) || (p[0] === c[0] && p[1] === c[1])) continue;
        if (inTri(p, a, b, c)) {
          ear = false;
          break;
        }
      }
      if (!ear) continue;
      tris.push([a, b, c]);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // degenerate leftovers: stop (a fan from the centroid fills the rest)
  }
  if (idx.length === 3) tris.push([poly[idx[0]!]!, poly[idx[1]!]!, poly[idx[2]!]!]);
  else if (idx.length > 3) {
    let cx = 0;
    let cz = 0;
    for (const i of idx) (cx += poly[i]![0]), (cz += poly[i]![1]);
    cx /= idx.length;
    cz /= idx.length;
    for (let k = 0; k < idx.length; k++) tris.push([[cx, cz], poly[idx[k]!]!, poly[idx[(k + 1) % idx.length]!]!]);
  }
  return tris;
}

// ---------------------------------------------------------------- the stage

const PART_MATERIAL: Partial<Record<TerrainMaterial, RobloxMaterial>> = {
  Grass: "Grass", LeafyGrass: "LeafyGrass", Ground: "Ground", Mud: "Mud", Rock: "Rock", Slate: "Slate", Sand: "Sand", Snow: "Snow", Cobblestone: "Cobblestone", Ice: "Ice", CrackedLava: "CrackedLava", Concrete: "Concrete", Brick: "Brick", WoodPlanks: "WoodPlanks", Glacier: "Ice", Salt: "Salt", Sandstone: "Sandstone", Basalt: "Basalt", Asphalt: "Asphalt", Limestone: "Limestone", Pavement: "Pavement",
};
const ROCKY = new Set<TerrainMaterial>(["Rock", "Slate", "Snow", "Basalt", "Limestone", "Glacier", "Ice", "Sandstone", "CrackedLava"]);

export function buildGround(ctx: GenContext): void {
  progress(ctx, "ground", 0);
  const { width, depth, cellSize, origin, style } = ctx;
  const step = GROUND_STEP;
  const h = ctx.heights;
  const colors = ctx.lighting?.terrainColors ?? {};
  const lv = new Int16Array(width * depth);
  for (let i = 0; i < lv.length; i++) lv[i] = Math.round(h.data[i]! / step);
  const sea = seaLevelOf(ctx.spec);
  let minLevel = Infinity;
  for (let i = 0; i < lv.length; i++) if (lv[i]! < minLevel) minLevel = lv[i]!;
  const rng = new Rng(deriveSeed(ctx.seed, "ground"));
  const pctx = { rng, style, meshes: {} as Record<string, MeshData> };
  const earth = mixHex("#7d5638", style.palette.ground, 0.3);
  const stone = mixHex("#7a746e", style.palette.stone, 0.4);

  // regions (4-connected same level)
  const seen = new Uint8Array(lv.length);
  const variants: PrefabVariant[] = [];
  const placements: typeof ctx.placements = [];
  const stack: number[] = [];
  let regionCount = 0;
  for (let start = 0; start < lv.length; start++) {
    if (seen[start]) continue;
    const level = lv[start]!;
    const cells = new Set<number>();
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      cells.add(i);
      const x = i % width;
      const z = (i - x) / width;
      const nb = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, z > 0 ? i - width : -1, z < depth - 1 ? i + width : -1];
      for (const j of nb) if (j >= 0 && !seen[j] && lv[j] === level) (seen[j] = 1), stack.push(j);
    }
    regionCount++;
    // dominant material of the region
    const matCount = new Map<number, number>();
    let wet = 0;
    for (const i of cells) {
      const m = ctx.materials[i]!;
      matCount.set(m, (matCount.get(m) ?? 0) + 1);
      if (!Number.isNaN(ctx.water.data[i]!)) wet++;
    }
    let mat: TerrainMaterial = "Grass";
    let bestN = 0;
    for (const [m, n] of matCount) {
      const name = TERRAIN_MATERIALS[m] as TerrainMaterial | undefined;
      if (!name || name === "Water" || name === "Air" || name === "Cobblestone" || name === "Pavement" || name === "Asphalt") continue; // roads are their own slabs
      if (n > bestN) (bestN = n), (mat = name);
    }
    if (wet > cells.size * 0.6) mat = "Sand";
    // loops → polygon(s)
    const loops = traceLoops(cells, width, depth, cellSize, origin, (i) => lv[i]!, minLevel - 1);
    if (loops.length === 0) continue;
    loops.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
    const outerRaw = loops[0]!;
    const orient = (pts: TPt[], ccw: boolean) => (signedArea(xy(pts)) > 0 === ccw ? pts : reverseT(pts));
    const shape = (pts: TPt[]) => {
      let s = simplifyT(pts, cellSize * 0.9);
      if (s.length >= 10) s = simplifyT(chaikinT(s), cellSize * 0.4);
      return s;
    };
    const outerT = orient(shape(outerRaw.pts), true);
    if (outerT.length < 3) continue;
    const holesT = loops
      .slice(1)
      .filter((l) => Math.abs(l.area) > cellSize * cellSize * 2)
      .map((l) => orient(shape(l.pts), false))
      .filter((l) => l.length >= 3);
    const outer = xy(outerT);
    const holes = holesT.map(xy);
    const merged = holes.length ? bridgeHoles(outer, holes) : outer;
    const tris = earClip(merged);
    // pivot = centroid of the outer loop at the slab top
    let cx = 0;
    let cz = 0;
    for (const p of outer) (cx += p[0]), (cz += p[1]);
    cx /= outer.length;
    cz /= outer.length;
    const top = level * step;
    const b = new PartListBuilder();
    const topColor = jitterHex(colors[mat] ?? "#6a7f3f", rng.float(-3, 3), rng.float(-0.03, 0.03), rng.float(-0.03, 0.03));
    const partMat = PART_MATERIAL[mat] ?? "Grass";
    const slabT = 2;
    for (const [p, q, r] of tris) b.triangleSlab([p[0] - cx, p[1] - cz], [q[0] - cx, q[1] - cz], [r[0] - cx, r[1] - cz], -slabT / 2, slabT, topColor, { material: partMat, collide: true, castShadow: true, lod: 2 });
    // walls: along every loop edge whose outside is lower
    const wallColor = ROCKY.has(mat) ? stone : mat === "Sand" || wet > 0 ? mixHex(earth, "#c9b27a", 0.5) : earth;
    const wallMat: RobloxMaterial = ROCKY.has(mat) ? "Slate" : "Ground";
    const loopsForWalls = [outerT, ...holesT];
    let wallParts = 0;
    for (const loop of loopsForWalls) {
      const ccw = signedArea(xy(loop)) > 0;
      for (let i = 0; i < loop.length; i++) {
        const tp = loop[i]!;
        const tq = loop[(i + 1) % loop.length]!;
        const p: Vec2 = [tp.x, tp.z];
        const q: Vec2 = [tq.x, tq.z];
        const ex = q[0] - p[0];
        const ez = q[1] - p[1];
        const len = Math.hypot(ex, ez);
        if (len < 0.3) continue;
        // outward normal: right of the direction for a CCW loop (x right, z down), left otherwise
        let nx = ez / len;
        let nz = -ex / len;
        if (!ccw) (nx = -nx), (nz = -nz);
        const outsideLevel = tp.out;
        if (outsideLevel >= level) continue;
        const drop = (level - outsideLevel) * step + 0.4;
        const bands = drop <= step * 3 + 1 ? 1 : drop <= step * 6 + 1 ? 2 : 3;
        const yaw = (Math.atan2(-ez, ex) * 180) / Math.PI;
        const t = 2.4;
        for (let k = 0; k < bands; k++) {
          const inset = 0.4 + k * 1.0;
          const y0 = -slabT - (drop - slabT) * (k / bands);
          const y1 = -slabT - (drop - slabT) * ((k + 1) / bands);
          const bx = (p[0] + q[0]) / 2 - nx * (inset + t / 2) - cx;
          const bz = (p[1] + q[1]) / 2 - nz * (inset + t / 2) - cz;
          b.box([bx, (y0 + y1) / 2, bz], [len + t * 0.8, y0 - y1 + 0.1, t], k === 0 ? wallColor : mixHex(wallColor, "#000000", 0.06 * k), { material: wallMat, rotation: [0, yaw, 0], collide: true, lod: k === 0 ? 2 : 1 });
          wallParts++;
        }
      }
    }
    // green lip along the outer edge of grass slabs (the overhang line of the reference look)
    if (!ROCKY.has(mat) && mat !== "Sand" && cells.size >= 150 && outer.length >= 12) {
      const ccw = signedArea(outer) > 0;
      for (let i = 0; i < outerT.length; i++) {
        const tp = outerT[i]!;
        const tq = outerT[(i + 1) % outerT.length]!;
        const p: Vec2 = [tp.x, tp.z];
        const q: Vec2 = [tq.x, tq.z];
        const ex = q[0] - p[0];
        const ez = q[1] - p[1];
        const len = Math.hypot(ex, ez);
        if (len < 0.3) continue;
        let nx = ez / len;
        let nz = -ex / len;
        if (!ccw) (nx = -nx), (nz = -nz);
        if (tp.out >= level) continue;
        const yaw = (Math.atan2(-ez, ex) * 180) / Math.PI;
        b.box([(p[0] + q[0]) / 2 - nx * 0.7 - cx, -slabT / 2, (p[1] + q[1]) / 2 - nz * 0.7 - cz], [len + 1.2, slabT, 1.6], mixHex(topColor, "#000000", 0.12), { material: partMat, rotation: [0, yaw, 0], collide: true, lod: 2 });
      }
    }
    const variant = b.build({ id: `ground_block/${variants.length}`, prefab: "ground_block", category: "prop", sinkDepth: 0, footprintRadius: 1, tags: ["layout", "floating", "ground"] });
    if (variant.parts.length === 0) continue;
    placements.push({
      id: `ground_${variants.length}`,
      prefab: "ground_block",
      variant: variants.length,
      category: "prop",
      position: [cx, top, cz],
      rotationY: 0,
      scale: 1,
      layer: "midground",
      importance: 10,
      fixed: true,
      locked: true,
      zone: "ground",
    });
    variants.push(variant);
    if (regionCount % 40 === 0) progress(ctx, "ground", Math.min(0.9, start / lv.length));
  }
  ctx.prefabs["ground_block"] = variants;
  // road slabs
  const roadVariants: PrefabVariant[] = [];
  for (const path of ctx.paths) {
    if (path.kind !== "road" || path.points.length < 2) continue;
    const mi = roadMaterialIndex(path.type);
    const mat = TERRAIN_MATERIALS[mi] as TerrainMaterial;
    const rb = new PartListBuilder();
    const p0 = path.points[0]!;
    const y0 = h.sample(p0[0], p0[1]);
    let n = 0;
    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1]!;
      const c = path.points[i]!;
      const wa = ctx.water.sample(a[0], a[1]);
      const wc = ctx.water.sample(c[0], c[1]);
      if (!Number.isNaN(wa) || !Number.isNaN(wc)) continue; // bridges handle water
      const ha = h.sample(a[0], a[1]);
      const hc = h.sample(c[0], c[1]);
      if (Math.abs(ha - hc) > 0.5) continue; // level change: the stairs cover it
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 0.5) continue;
      const yaw = (Math.atan2(-(c[1] - a[1]), c[0] - a[0]) * 180) / Math.PI;
      rb.box([(a[0] + c[0]) / 2 - p0[0], ha - y0 + 0.16, (a[1] + c[1]) / 2 - p0[1]], [len + 1.2, 0.32, path.width], colors[mat] ?? "#8a7a5a", { material: PART_MATERIAL[mat] ?? "Sand", rotation: [0, yaw, 0], collide: true, castShadow: false, lod: n++ % 2 === 0 ? 2 : 1 });
    }
    const v = rb.build({ id: `road_strip/${roadVariants.length}`, prefab: "road_strip", category: "path", sinkDepth: 0, footprintRadius: 1, tags: ["layout", "floating", "ground"] });
    if (v.parts.length === 0) continue;
    placements.push({ id: `road_strip_${roadVariants.length}`, prefab: "road_strip", variant: roadVariants.length, category: "path", position: [p0[0], y0, p0[1]], rotationY: 0, scale: 1, layer: "midground", importance: 10, fixed: true, locked: true, zone: path.id });
    roadVariants.push(v);
  }
  ctx.prefabs["road_strip"] = roadVariants;
  // the ground is spawned first at runtime (everything else snaps onto it)
  ctx.placements.unshift(...placements);
  // water: fill blocks per surface height (greedy rectangles)
  ctx.terrainOps.push(...waterOps(ctx));
  ctx.terrainMode = "parts";
  void sea;
  progress(ctx, "ground", 1);
}

function roadMaterialIndex(type: string): number {
  switch (type) {
    case "cobblestone": return TERRAIN_MATERIAL_INDEX.Cobblestone;
    case "asphalt_road": return TERRAIN_MATERIAL_INDEX.Asphalt;
    case "concrete_road": return TERRAIN_MATERIAL_INDEX.Concrete;
    case "neon_road": return TERRAIN_MATERIAL_INDEX.Slate;
    case "sand_path": return TERRAIN_MATERIAL_INDEX.Sand;
    case "snow_path": return TERRAIN_MATERIAL_INDEX.Snow;
    case "stone": return TERRAIN_MATERIAL_INDEX.Limestone;
    case "planks": return TERRAIN_MATERIAL_INDEX.WoodPlanks;
    default: return TERRAIN_MATERIAL_INDEX.Sand; // dirt paths read as sandy tracks on the lawn slabs
  }
}

/** Greedy rectangles of water cells grouped by surface height → fill-block ops (Water) down to the bed. */
function waterOps(ctx: GenContext): TerrainOp[] {
  const { width, depth, cellSize, origin } = ctx;
  const ops: TerrainOp[] = [];
  const used = new Uint8Array(width * depth);
  const key = (i: number) => Math.round(ctx.water.data[i]! * 2);
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const i = z * width + x;
      if (used[i] || Number.isNaN(ctx.water.data[i]!)) continue;
      const k = key(i);
      // grow right, then down
      let w = 1;
      while (x + w < width && !used[i + w] && !Number.isNaN(ctx.water.data[i + w]!) && key(i + w) === k) w++;
      let d = 1;
      outer: while (z + d < depth) {
        for (let dx = 0; dx < w; dx++) {
          const j = (z + d) * width + x + dx;
          if (used[j] || Number.isNaN(ctx.water.data[j]!) || key(j) !== k) break outer;
        }
        d++;
      }
      let bed = Infinity;
      for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) {
        const j = (z + dz) * width + x + dx;
        used[j] = 1;
        if (ctx.heights.data[j]! < bed) bed = ctx.heights.data[j]!;
      }
      const surface = k / 2;
      const bottom = bed - 1;
      const cx = origin[0] + (x + w / 2 - 0.5) * cellSize;
      const cz = origin[1] + (z + d / 2 - 0.5) * cellSize;
      ops.push({ op: "fill", shape: "block", position: [cx, (bottom + surface) / 2, cz], size: [w * cellSize, surface - bottom, d * cellSize], material: "Water" });
    }
  }
  return ops;
}
