import { TERRAIN_MATERIAL_INDEX, type DistrictFunction, type FacilityId, type Placement, type PrefabVariant, type Rng, type SettlementPlan, type Vec2, type Vec3 } from "@worldforge/core";
import { inBounds, layerFor, type GenContext, type SettlementSite } from "../context";
import { buildFacility, facilityKit, facilityLot } from "./facilities";
import { carveRoad, refreshRoadDistance } from "./roads";
import { circlePoly, flattenArea, plazaRadius } from "./sites";
import { levelPad, plotsOverlap } from "./urban-plan";

/**
 * Towns made of blocks: streets bound blocks, blocks hold back-to-back rows of buildings, a square, a park, or one place
 * with a function. One lattice in (u, v), several shapes: a straight grid, curved suburban streets, rings and spokes, or a
 * long main street. The outline is whatever the ground allows, grown from the square outward, so it is never a diamond.
 */
export type BlockShape = "grid" | "curved" | "radial" | "linear";

interface Block {
  row: number;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  /** Distance to the square, 0..1. */
  r: number;
  kept: boolean;
  use: "homes" | "facility" | "plaza";
  facility?: FacilityId;
  poly: Vec2[];
}

/** The shape a settlement takes, or null when it grows organically along its lanes. */
export function blockShape(ctx: GenContext, site: SettlementSite): BlockShape | null {
  if (ctx.islands) return null;
  const s = site.spec;
  const main = ctx.sites.every((q) => q.radius <= site.radius);
  const m = main ? ctx.spec.design?.morphology : undefined;
  const paved = ["asphalt_road", "concrete_road", "neon_road", "metal_walkway"].includes(ctx.style.kits.road);
  const planned = s.layout === "grid" || (s.layout === "organic" && (s.type === "city_district" || s.type === "base" || (s.type === "town" && paved)));
  const ruined = s.type === "abandoned_village" || s.type === "ruined_town";
  if (s.layout === "ring" && !ruined) return "radial";
  if (planned || (s.type === "city_district" && !ruined)) return m === "radial" ? "radial" : m === "linear" ? "linear" : m === "organic" || (!main && s.type === "town" && s.layout === "organic") ? "curved" : "grid";
  if (ruined || !m) return null;
  if (m === "radial" && s.type === "town" && s.buildings >= 24) return "radial";
  if ((m === "linear" || s.layout === "linear") && s.type === "town" && s.buildings >= 14) return "linear";
  return null;
}

export function layoutBlocks(ctx: GenContext, site: SettlementSite, rng: Rng, shape: BlockShape, pick: () => [string, PrefabVariant[]]): void {
  const s = site.spec;
  const city = s.type === "city_district";
  const base = s.type === "base" || s.type === "outpost";
  const type = ctx.style.kits.road;
  const oldTown = !["asphalt_road", "concrete_road", "neon_road", "metal_walkway"].includes(type);
  const streetW = city ? 13 : base ? 12 : oldTown ? 8 : 10;
  const avenueW = streetW + (city ? 5 : 3);
  const main = ctx.sites.every((q) => q.radius <= site.radius);
  const wanted = main ? (ctx.spec.design?.facilities ?? []) : [];
  const size = (v: PrefabVariant): [number, number] => [v.bounds.max[0] - v.bounds.min[0], v.bounds.max[2] - v.bounds.min[2]];
  // the prefabs this place is made of, by what it draws
  const pool = new Map<string, PrefabVariant[]>();
  for (let k = 0; k < 24; k++) {
    const [id, vs] = pick();
    if (vs.length) pool.set(id, vs);
  }
  if (pool.size === 0) return;
  let lotW = 0;
  let lotD = 0;
  let n0 = 0;
  for (const vs of pool.values()) for (const v of vs) {
    const [w, d] = size(v);
    lotW += w;
    lotD = Math.max(lotD, Math.min(d, 44));
    n0++;
  }
  lotW = Math.min(40, lotW / n0);
  const setback = city ? 3 : base ? 6 : oldTown ? 2 : 9;
  const gap = city ? 2.5 : base ? 8 : oldTown ? 3 : 9;
  const yard = city ? 8 : oldTown ? 10 : 14;
  const inside = wanted.filter((id) => facilityLot(id).central).map((id) => facilityLot(id).lot);
  const single = shape === "linear" && s.buildings < 26;
  const inner = Math.max(single ? lotD + setback + yard : 2 * (lotD + setback) + yard, ...inside.filter((l) => l[0] < 80).map((l) => l[1] + 6));
  const pitchV = inner + streetW;
  const len = Math.max(inner * 0.9, (lotW + gap) * (city ? 3.2 : shape === "linear" ? 5 : 3.6) + streetW);
  const target = Math.round(s.buildings * (city ? 1.3 : 1.05));

  // ---- the lattice
  const roads = ctx.paths.filter((p) => p.kind === "road");
  const arrival = roads.flatMap((p) => p.points).filter((q) => Math.abs(Math.hypot(q[0] - site.center[0], q[1] - site.center[1]) - len) < len * 0.6);
  let yaw = arrival.length ? Math.atan2(arrival[0]![1] - site.center[1], arrival[0]![0] - site.center[0]) : rng.float(0, Math.PI);
  if (shape === "linear" && ctx.waterDistance.sample(site.center[0], site.center[1]) < site.radius * 1.6) {
    // a seaside town stretches along the water
    const e = 24;
    const gx = ctx.waterDistance.sample(site.center[0] + e, site.center[1]) - ctx.waterDistance.sample(site.center[0] - e, site.center[1]);
    const gz = ctx.waterDistance.sample(site.center[0], site.center[1] + e) - ctx.waterDistance.sample(site.center[0], site.center[1] - e);
    if (Math.hypot(gx, gz) > 1) yaw = Math.atan2(gx, -gz);
  }
  // a city that goes on beyond its district keeps the lines of its lots
  const cell = ctx.heights.toCell(site.center[0], site.center[1]);
  if (shape === "grid" && ctx.biomeIds?.[ctx.biomes[Math.round(cell[1]) * ctx.width + Math.round(cell[0])]!] === "urban") yaw = 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const ph = [rng.float(0, 6.28), rng.float(0, 6.28), rng.float(0, 6.28)] as const;
  const bend = shape === "curved" ? 0.3 * len : shape === "linear" ? 0.22 * len : 0;
  const wave = len * (shape === "linear" ? 2.6 : 1.25);
  const wobble = oldTown ? 0.07 : 0.025;
  const W = (u: number, v: number): Vec2 => {
    let x: number;
    let z: number;
    if (shape === "radial") {
      const r = v * (1 + wobble * Math.sin(3 * u + ph[0]) + wobble * 0.7 * Math.sin(5 * u + ph[1]));
      const a = u + (wobble * 24 * Math.sin(v / 46 + ph[2])) / Math.max(30, v);
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    } else {
      x = u + (shape === "curved" ? bend * (Math.sin(v / wave + ph[0]) - Math.sin(ph[0])) : 0);
      z = v + (bend ? bend * (Math.sin(u / wave + ph[1]) - Math.sin(ph[1])) : 0);
    }
    return [site.center[0] + x * cos - z * sin, site.center[1] + x * sin + z * cos];
  };
  const blocks: Block[] = [];
  const areas = wanted.filter((id) => facilityLot(id).central).length + target / Math.max(1, 2 * Math.floor((len - streetW) / (lotW + gap)));
  const reach = Math.max(site.radius * (shape === "linear" ? 1.5 : 1.1), Math.sqrt(areas * len * pitchV) * 0.8);
  const r0 = Math.max(plazaRadius(site.radius) * 1.25, city ? 34 : 24);
  if (shape === "radial") {
    const spokes = rng.int(5, 7);
    for (let j = 0; ; j++) {
      const v0 = r0 + j * pitchV;
      const v1 = v0 + pitchV;
      if (v0 > reach) break;
      let n = spokes;
      while ((2 * Math.PI * (v0 + pitchV * 0.5)) / (n * 2) > len * 0.72) n *= 2;
      for (let i = 0; i < n; i++) blocks.push({ row: j, u0: (i * 2 * Math.PI) / n, u1: ((i + 1) * 2 * Math.PI) / n, v0, v1, r: 0, kept: false, use: "homes", poly: [] });
    }
  } else {
    const rows = shape === "linear" ? (single ? 1 : Math.max(2, Math.ceil(s.buildings / 40))) : Math.max(3, Math.ceil(reach / pitchV));
    const cols: number[] = [0];
    for (let side = 0; side < 2; side++) {
      let u = 0;
      while (u < reach) {
        u += side === 0 && u === 0 ? len * 0.8 : len * rng.float(0.82, 1.28);
        cols.push(side === 0 ? u : -u);
      }
    }
    cols.sort((a, b) => a - b);
    // the square sits in the middle of the first block, beside the avenues
    const shift = (cols[cols.indexOf(0) + 1]! + 0) / 2;
    const vs: number[] = [];
    for (let j = -rows; j <= rows; j++) vs.push(shape === "linear" ? j * pitchV : (j + (j >= 0 ? 0.5 : 0.5)) * pitchV);
    for (let j = 0; j + 1 < vs.length; j++) for (let i = 0; i + 1 < cols.length; i++) blocks.push({ row: j, u0: cols[i]! - shift, u1: cols[i + 1]! - shift, v0: vs[j]!, v1: vs[j + 1]!, r: 0, kept: false, use: "homes", poly: [] });
  }

  // ---- what the ground allows
  const quad = (b: Block): Vec2[] => {
    const out: Vec2[] = [];
    for (let i = 0; i <= 6; i++) out.push(W(b.u0 + ((b.u1 - b.u0) * i) / 6, b.v0));
    for (let i = 0; i <= 6; i++) out.push(W(b.u1 + ((b.u0 - b.u1) * i) / 6, b.v1));
    return out;
  };
  const ok = (b: Block): boolean => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 3; j++) {
      const [x, z] = W(b.u0 + ((b.u1 - b.u0) * i) / 4, b.v0 + ((b.v1 - b.v0) * j) / 3);
      if (!inBounds(ctx, x, z, 34) || ctx.waterDistance.sample(x, z) < 7) return false;
      const y = ctx.heights.sample(x, z);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    // a landmark stands on a square of its own, never across a street
    for (const o of ctx.occupants) {
      if (o.kind !== "landmark") continue;
      const rim = [0, 0.25, 0.5, 0.75, 1].flatMap((t) => [W(b.u0 + (b.u1 - b.u0) * t, b.v0), W(b.u0 + (b.u1 - b.u0) * t, b.v1), W(b.u0, b.v0 + (b.v1 - b.v0) * t), W(b.u1, b.v0 + (b.v1 - b.v0) * t)]);
      const edge = Math.min(...rim.map((q) => Math.hypot(q[0] - o.position[0], q[1] - o.position[2])));
      if (inPoly([o.position[0], o.position[2]], quad(b)) && edge > o.radius + 3) b.use = "plaza";
      else if (edge < o.radius + 8) return false;
    }
    return hi - lo < (ctx.terrainMode === "parts" ? 40 : 30);
  };
  const touching = (a: Block, b: Block): boolean => {
    const e = 1e-3;
    const full = 2 * Math.PI;
    const over = (p0: number, p1: number, q0: number, q1: number) => Math.min(p1, q1) - Math.max(p0, q0) > e;
    if (a.row === b.row) return Math.abs(a.u0 - b.u1) < e || Math.abs(a.u1 - b.u0) < e || (shape === "radial" && (Math.abs(a.u0 + full - b.u1) < e || Math.abs(b.u0 + full - a.u1) < e));
    return Math.abs(a.row - b.row) === 1 && over(a.u0, a.u1, b.u0, b.u1);
  };
  const free = blocks.filter(ok);
  const heart = (b: Block) => {
    const c = W((b.u0 + b.u1) / 2, (b.v0 + b.v1) / 2);
    return Math.hypot(c[0] - site.center[0], c[1] - site.center[1]);
  };
  const order = new Map(free.map((b) => [b, heart(b) * (1 + (rng.next() - 0.5) * (shape === "grid" && base ? 0.05 : 0.3))]));
  const kept: Block[] = [];
  const capacity = (b: Block): number => {
    const run = shape === "radial" ? (b.u1 - b.u0) * ((b.v0 + b.v1) / 2) : b.u1 - b.u0;
    return Math.max(0, Math.floor((run - streetW) / (lotW + gap))) * (single ? 1 : 2);
  };
  // in a straight or curved town the block around the centre is the square
  if (shape === "grid" || shape === "curved") {
    const c = free.find((b) => b.u0 <= 0 && b.u1 >= 0 && b.v0 <= 0 && b.v1 >= 0);
    if (c) {
      c.use = "plaza";
      c.kept = true;
      kept.push(c);
    }
  }
  // the first turn round the square, then outward, always touching what is already there
  const centralCount = wanted.filter((id) => facilityLot(id).central).length;
  const lots = () => kept.reduce((n, b) => n + (b.use === "homes" ? capacity(b) : 0), 0);
  const grow = (enough: () => boolean): void => {
    while (!(kept.length > 2 && enough())) {
    let next: Block | null = null;
    for (const b of free) {
      if (b.kept) continue;
      if (kept.length && !kept.some((q) => touching(q, b)) && !(shape === "radial" && b.row === 0)) continue;
      if (order.get(b)! > reach * 1.15) continue;
      if (!next || order.get(b)! < order.get(next)!) next = b;
    }
    if (!next) break;
    next.kept = true;
    kept.push(next);
    }
  };
  grow(() => kept.filter((b) => b.use === "homes").length >= centralCount * 1.35 && lots() >= target);
  if (kept.length < 2) return;
  let far = 1;
  const rank = () => {
    far = Math.max(1, ...kept.map(heart));
    for (const b of kept) b.r = heart(b) / far;
  };
  rank();

  // ---- places with a function take a block, or two joined ones
  const taken = (b: Block) => b.use !== "homes";
  const innerSize = (b: Block): [number, number] => {
    const vm = (b.v0 + b.v1) / 2;
    const run = shape === "radial" ? (b.u1 - b.u0) * (vm - (b.v1 - b.v0) * 0.2) : b.u1 - b.u0;
    return [run - streetW - 3, b.v1 - b.v0 - streetW];
  };
  const join = (a: Block, b: Block): Block => ({ ...a, u0: Math.min(a.u0, b.u0), u1: Math.max(a.u1, b.u1) });
  for (const id of [...wanted].sort((a, b) => facilityLot(b).lot[0] * facilityLot(b).lot[1] - facilityLot(a).lot[0] * facilityLot(a).lot[1])) {
    const f = facilityLot(id);
    if (!f.central) continue;
    let best: { b: Block; mate?: Block; v: number } | null = null;
    const consider = (b: Block, mate?: Block) => {
      const [w, d] = innerSize(mate ? join(b, mate) : b);
      if (w < f.lot[0] || d < f.lot[1]) return;
      if (shape === "radial") {
        // a straight building in a curved block: its inner corners reach sideways, its outer ones outward
        const q = mate ? join(b, mate) : b;
        const vm = (q.v0 + q.v1) / 2;
        const side = Math.atan(f.lot[0] / 2 / Math.max(1, vm - f.lot[1] / 2)) + (streetW / 2 + 1) / vm;
        if (side > (q.u1 - q.u0) / 2 || Math.hypot(vm + f.lot[1] / 2, f.lot[0] / 2) > q.v1 - streetW / 2) return;
      }
      const like = kept.some((q) => q.facility && f.beside.includes(q.facility) && touching(q, b)) ? 0.5 : 0;
      const apart = kept.some((q) => q.facility && !f.beside.includes(q.facility) && touching(q, b)) && !base ? 0.35 : 0;
      const v = -Math.abs(b.r - f.ring) + like - apart - (mate ? 0.6 : 0) - Math.max(0, w - f.lot[0] * 1.6) * 0.002 + rng.next() * 0.15;
      if (!best || v > best.v) best = { b, mate, v };
    };
    for (const b of kept) {
      if (taken(b)) continue;
      consider(b);
      for (const q of kept) if (q !== b && !taken(q) && q.row === b.row && Math.abs(q.u0 - b.u1) < 1e-3) consider(b, q);
    }
    const found = best as { b: Block; mate?: Block; v: number } | null;
    if (!found) continue;
    if (found.mate) {
      found.b.u1 = found.mate.u1;
      kept.splice(kept.indexOf(found.mate), 1);
      found.mate.kept = false;
    }
    found.b.use = "facility";
    found.b.facility = id;
  }
  // the homes that were displaced find room further out
  grow(() => lots() >= target);
  rank();
  for (const b of kept) {
    b.poly = quad(b);
  }

  // ---- the streets that bound what was kept
  const step = ctx.cellSize * 2;
  const line = (f: (t: number) => Vec2): Vec2[] => {
    const a = f(0);
    let length = 0;
    let last = a;
    for (let i = 1; i <= 12; i++) {
      const q = f(i / 12);
      length += Math.hypot(q[0] - last[0], q[1] - last[1]);
      last = q;
    }
    const n = Math.max(2, Math.ceil(length / step));
    return Array.from({ length: n + 1 }, (_, i) => f(i / n));
  };
  const streets: { id: string; points: Vec2[]; width: number }[] = [];
  const full = 2 * Math.PI;
  const cut = (xs: number[]) => [...new Set(xs.map((x) => Math.round(x * 1e4) / 1e4))].sort((a, b) => a - b);
  // along u: runs where the block above or below is kept
  for (const v of cut(kept.flatMap((b) => [b.v0, b.v1]))) {
    const on = kept.filter((b) => Math.abs(b.v0 - v) < 1e-2 || Math.abs(b.v1 - v) < 1e-2);
    const marks = cut(on.flatMap((b) => [b.u0, b.u1]));
    const runs: [number, number][] = [];
    for (let i = 0; i + 1 < marks.length; i++) {
      const m = (marks[i]! + marks[i + 1]!) / 2;
      if (!on.some((b) => m > b.u0 && m < b.u1)) continue;
      const lastRun = runs[runs.length - 1];
      if (lastRun && Math.abs(lastRun[1] - marks[i]!) < 1e-3) lastRun[1] = marks[i + 1]!;
      else runs.push([marks[i]!, marks[i + 1]!]);
    }
    if (shape === "radial" && runs.length > 1 && runs[0]![0] < 1e-2 && runs[runs.length - 1]![1] > full - 1e-2) {
      const tail = runs.pop()!;
      runs[0] = [tail[0] - full, runs[0]![1]];
    }
    const avenue = shape === "linear" ? Math.abs(v) < 1 : shape === "radial" ? Math.abs(v - r0) < 1 : Math.abs(Math.abs(v) - pitchV / 2) < 1;
    runs.forEach(([a, b], k) => streets.push({ id: `${site.id}_street_z${Math.round(v)}_${k}`, points: line((t) => W(a + (b - a) * t, v)), width: avenue ? avenueW : streetW }));
  }
  // along v: the edge of a block, joined with the one before it when they line up
  const edges: { u: number; v0: number; v1: number }[] = [];
  for (const b of kept) for (const u0 of [b.u0, b.u1]) {
    const u = shape === "radial" ? Math.round(((u0 % full) + (Math.abs((u0 % full) - full) < 1e-3 ? -full : 0)) * 1e4) / 1e4 : u0;
    if (!edges.some((e) => Math.abs(e.u - u) < 1e-3 && Math.abs(e.v0 - b.v0) < 1e-3)) edges.push({ u, v0: b.v0, v1: b.v1 });
  }
  edges.sort((a, b) => a.u - b.u || a.v0 - b.v0);
  const firstRow = cut(kept.filter((b) => b.row === 0).flatMap((b) => [b.u0, b.u1]));
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]!;
    let v1 = e.v1;
    while (edges[i + 1] && Math.abs(edges[i + 1]!.u - e.u) < 1e-3 && Math.abs(edges[i + 1]!.v0 - v1) < 1e-3) v1 = edges[++i]!.v1;
    const avenue = shape === "radial" ? e.v0 <= r0 + 1 && firstRow.length > 0 : shape !== "linear" && e.v0 < 0 && v1 > 0 && kept.some((b) => b.use === "plaza" && (Math.abs(b.u0 - e.u) < 1e-3 || Math.abs(b.u1 - e.u) < 1e-3));
    const from = shape === "radial" && Math.abs(e.v0 - r0) < 1 ? r0 * 0.96 : e.v0;
    streets.push({ id: `${site.id}_street_x${Math.round(e.u * 100)}_${Math.round(e.v0)}`, points: line((t) => W(e.u, from + (v1 - from) * t)), width: avenue ? avenueW : streetW });
  }

  // ---- the roads that came first end on those streets
  const nearStreet = (q: Vec2): Vec2 => {
    let bestQ = q;
    let d = Infinity;
    for (const st of streets) for (const p of st.points) {
      const dd = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (dd < d) {
        d = dd;
        bestQ = p;
      }
    }
    return bestQ;
  };
  const within = (q: Vec2): boolean => (shape === "radial" && Math.hypot(q[0] - site.center[0], q[1] - site.center[1]) < r0 + 2) || kept.some((b) => inPoly(q, b.poly));
  const erased = new Set<number>();
  for (const road of roads) {
    if (!road.points.some((q) => within(q as Vec2))) continue;
    const runs: Vec2[][] = [[]];
    for (const q of road.points as Vec2[]) {
      if (within(q)) {
        if (runs[runs.length - 1]!.length) runs.push([]);
        const [cx, cz] = ctx.heights.toCell(q[0], q[1]);
        const rc = Math.ceil(road.width / ctx.cellSize);
        for (let dz = -rc; dz <= rc; dz++) for (let dx = -rc; dx <= rc; dx++) erased.add((Math.round(cz) + dz) * ctx.width + Math.round(cx) + dx);
      } else runs[runs.length - 1]!.push(q);
    }
    // a scrap of the old road left in a hole of the town is no road
    const keptRuns = runs.filter((r) => r.length > 2 && (r.length > 24 || r.some((q) => Math.hypot(q[0] - site.center[0], q[1] - site.center[1]) > far + pitchV)));
    ctx.paths.splice(ctx.paths.indexOf(road), 1);
    const close = far + Math.max(len, pitchV);
    const near = (q: Vec2) => Math.hypot(q[0] - site.center[0], q[1] - site.center[1]) < close;
    keptRuns.forEach((r, k) => {
      const a = r[0]!;
      const z = r[r.length - 1]!;
      const snapA = near(a) && (k > 0 || within(road.points[0] as Vec2));
      const snapZ = near(z) && (k < keptRuns.length - 1 || within(road.points[road.points.length - 1] as Vec2));
      const pts = [...(snapA ? [nearStreet(a)] : []), ...r, ...(snapZ ? [nearStreet(z)] : [])];
      ctx.paths.push({ ...road, id: k === 0 ? road.id : `${road.id}_${k}`, points: pts });
    });
  }
  // the ground under an erased road is what grows around the town
  const votes = new Map<number, number>();
  for (let a = 0; a < 48; a++) {
    for (const k of [1.15, 1.35]) {
      const q = ctx.heights.toCell(site.center[0] + Math.cos(a * 0.1309) * far * k, site.center[1] + Math.sin(a * 0.1309) * far * k);
      const m = ctx.materials[Math.round(q[1]) * ctx.width + Math.round(q[0])];
      if (m !== undefined && m !== TERRAIN_MATERIAL_INDEX.Water && m !== TERRAIN_MATERIAL_INDEX.Asphalt) votes.set(m, (votes.get(m) ?? 0) + 1);
    }
  }
  const lawn = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? TERRAIN_MATERIAL_INDEX.Ground;
  for (const i of erased) if (i >= 0 && i < ctx.materials.length && ctx.materials[i] !== TERRAIN_MATERIAL_INDEX.Water) ctx.materials[i] = city ? TERRAIN_MATERIAL_INDEX.Pavement : lawn;

  // ---- one gentle plane under the district
  const soil = Uint8Array.from(ctx.materials);
  flattenArea(ctx, site.center, far + pitchV * 0.6, shape === "linear" ? 0.6 : 0.82, undefined, 0.8);
  ctx.materials.set(soil);
  for (const p of ctx.paths) if (p.kind === "road" && roads.some((q) => q.id === p.id || p.id.startsWith(`${q.id}_`)) && p.points.some((q) => Math.hypot(q[0] - site.center[0], q[1] - site.center[1]) < far + pitchV)) carveRoad(ctx, p.points as Vec2[], p.width, p.type);
  for (const st of streets) {
    ctx.paths.push({ id: st.id, kind: "road", type, points: st.points, width: st.width });
    carveRoad(ctx, st.points, st.width, type);
  }
  refreshRoadDistance(ctx);
  // a dense town is paved between its walls; a suburb keeps its lawns
  if (city || base) {
    const mat = city ? (oldTown ? TERRAIN_MATERIAL_INDEX.Cobblestone : TERRAIN_MATERIAL_INDEX.Pavement) : oldTown ? -1 : TERRAIN_MATERIAL_INDEX.Concrete ?? -1;
    if (mat >= 0) for (const b of kept) if (b.facility !== "park") paintPoly(ctx, b.poly, mat);
  }

  else if (!oldTown) for (const b of kept) paintPoly(ctx, b.poly, lawn);
  // the town is as large as it was built: walls, fields and outskirts start there
  site.radius = far + pitchV * 0.5;
  const zone = ctx.zones.find((q) => q.id === site.id && q.kind === "settlement");
  if (zone) {
    zone.radius = site.radius;
    zone.polygon = circlePoly(site.center, site.radius, 16);
  }

  // ---- districts and buildings
  const quarters: { id: string; function: DistrictFunction; r0: number; r1: number }[] = base
    ? [
        { id: "command", function: "civic", r0: 0, r1: 0.35 },
        { id: "quarters", function: "military", r0: 0.35, r1: 0.7 },
        { id: "stores", function: "craft", r0: 0.7, r1: 9 },
      ]
    : [
        { id: "centre", function: "civic", r0: 0, r1: 0.3 },
        { id: "downtown", function: "commerce", r0: 0.3, r1: 0.6 },
        { id: "homes", function: "residential", r0: 0.6, r1: 9 },
      ];
  const plan: SettlementPlan = { settlement: site.id, plaza: { center: site.center, radius: plazaRadius(site.radius) }, districts: quarters.map((q, i) => ({ id: `${site.id}_${q.id}`, function: q.function, center: site.center, radius: Math.min(far, q.r1 * far), priority: i + 1, capacity: 0 })), parcels: [], refused: {} };
  ctx.plan.settlements.push(plan);
  const has = (id: string) => (ctx.prefabs[id]?.length ?? 0) > 0;
  const pickFor = (r: number): [string, PrefabVariant[]] => {
    let id = pick()[0];
    if (city && r < 0.4 && has("skyscraper") && rng.chance(0.65)) id = "skyscraper";
    else if (city && r >= 0.65 && id === "skyscraper" && has("apartment_block")) id = rng.chance(0.7) ? "apartment_block" : "shop_building";
    else if (!city && !base && r < 0.4 && has("shop_building") && rng.chance(0.45)) id = "shop_building";
    else if (base && r < 0.35 && has("house_large")) id = "house_large";
    return [id, ctx.prefabs[id] ?? []];
  };
  // the places first: their lots are levelled once, whatever stands around
  const kit = facilityKit(ctx, rng);
  const lotsTaken: { x: number; z: number; n: Vec2; hx: number; hz: number }[] = [];
  for (const b of kept) {
    if (!b.facility) continue;
    const uc = (b.u0 + b.u1) / 2;
    const vc = (b.v0 + b.v1) / 2;
    const at = W(uc, vc);
    const out = W(uc, b.v0);
    const yawF = Math.atan2(-(out[0] - at[0]), -(out[1] - at[1]));
    const [lw, ld] = facilityLot(b.facility).lot;
    lotsTaken.push({ x: at[0], z: at[1], n: [Math.sin(yawF), Math.cos(yawF)], hx: lw / 2, hz: ld / 2 });
    buildFacility(ctx, kit, b.facility, at, yawF, ctx.heights.sample(at[0], at[1]), site, false);
  }
  let placed = 0;
  for (const b of [...kept].sort((p, q) => p.r - q.r)) {
    if (b.use !== "homes") continue;
    const quarter = Math.max(0, quarters.findIndex((q) => b.r >= q.r0 && b.r < q.r1));
    const sides = single ? [b.v0 >= -1 ? 0 : 1] : [0, 1];
    for (const side of sides) {
      if (placed >= target * 1.15) break;
      const vEdge = side === 0 ? b.v0 + streetW / 2 + setback : b.v1 - streetW / 2 - setback;
      const e = shape === "radial" ? 0.01 : 1;
      const um = (b.u0 + b.u1) / 2;
      const mid = side === 0 ? vEdge + lotD / 2 : vEdge - lotD / 2;
      // in a ring, the row is as long as its inner edge
      const line0 = shape === "radial" ? (side === 0 ? vEdge : vEdge - lotD) : mid;
      const pa = W(um - e, line0);
      const pb = W(um + e, line0);
      const su = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / (2 * e);
      const run = (b.u1 - b.u0) * su - streetW - 4;
      // what fits on the frontage, then the slack is shared between the gaps
      const row: { id: string; v: number; w: number; d: number; k: number }[] = [];
      let used = 0;
      for (let guard = 0; guard < 14; guard++) {
        let choice: (typeof row)[number] | null = null;
        for (let t = 0; t < 5 && !choice; t++) {
          const [id, vs] = t < 4 ? pickFor(b.r) : ([...pool.entries()].sort((p, q) => size(p[1][0]!)[0] - size(q[1][0]!)[0])[0] as [string, PrefabVariant[]]);
          if (!vs.length) continue;
          const vi = rng.int(0, vs.length - 1);
          const k = 1 + (rng.next() * 2 - 1) * ctx.style.architecture.scaleVariance * 0.25;
          const [w, d] = size(vs[vi]!);
          const room = single || inner / 2 + 2 >= d * k ? true : false;
          if (room && used + w * k + (row.length ? gap : 0) <= run) choice = { id, v: vi, w: w * k, d: d * k, k };
        }
        if (!choice) break;
        used += choice.w + (row.length ? gap : 0);
        row.push(choice);
      }
      if (row.length === 0) continue;
      const slack = Math.min((run - used) / (row.length + 1), gap * 2.2);
      let at = -(used + slack * (row.length - 1)) / 2;
      for (const q of row) {
        const u = um + (at + q.w / 2) / su;
        at += q.w + gap + slack;
        const variant = ctx.prefabs[q.id]![q.v]!;
        const v = side === 0 ? vEdge + q.d / 2 : vEdge - q.d / 2;
        const [x0, z0] = W(u, v);
        const street = W(u, side === 0 ? b.v0 : b.v1);
        const dl = Math.max(0.1, Math.hypot(street[0] - x0, street[1] - z0));
        const dir: Vec2 = [(street[0] - x0) / dl, (street[1] - z0) / dl];
        const rotY = Math.atan2(-dir[0], -dir[1]);
        // the prefab may not be centred on its origin
        const ox = ((variant.bounds.max[0] + variant.bounds.min[0]) / 2) * q.k;
        const oz = ((variant.bounds.max[2] + variant.bounds.min[2]) / 2) * q.k;
        const x = x0 - (ox * Math.cos(rotY) + oz * Math.sin(rotY));
        const z = z0 - (-ox * Math.sin(rotY) + oz * Math.cos(rotY));
        if (!inBounds(ctx, x, z, 24) || ctx.waterDistance.sample(x, z) < Math.max(q.w, q.d) / 2 + 2) continue;
        if (ctx.roadDistance.sample(x, z) < Math.min(q.w, q.d) * 0.42) continue;
        if (ctx.occupants.some((o) => (o.kind === "landmark" && Math.hypot(x - o.position[0], z - o.position[2]) < o.radius + variant.footprintRadius * 0.6) || (o.kind === "keep" && shape !== "linear" && Math.hypot(x - o.position[0], z - o.position[2]) < o.radius + q.d * 0.3))) continue;
        if (lotsTaken.some((o) => plotsOverlap(o, { x: x0, z: z0, n: [-dir[0], -dir[1]], hx: q.w / 2, hz: q.d / 2 }))) continue;
        const y = levelPad(ctx, { x: x0, z: z0, n: [-dir[0], -dir[1]], hx: q.w / 2 + 1, hz: q.d / 2 + 1 }, ctx.heights.sample(x0, z0), 8);
        const position: Vec3 = [x, y, z];
        const p: Placement = { id: `${site.id}_${q.id}_${placed}`, prefab: q.id, variant: q.v, category: "building", position, rotationY: rotY, scale: q.k, layer: layerFor(ctx, x, z, true), zone: site.id, importance: 9 };
        ctx.placements.push(p);
        ctx.occupants.push({ position, radius: Math.min(variant.footprintRadius * q.k, Math.max(q.w, q.d) * 0.55), kind: "building" });
        plan.districts[quarter]!.capacity++;
        plan.parcels.push({ id: `${site.id}_block_${placed}`, district: plan.districts[quarter]!.id, function: plan.districts[quarter]!.function, center: [x, z], rotationY: rotY, frontage: q.w, depth: q.d, street: side === 0 ? "front" : "back", building: p.id });
        placed++;
      }
    }
  }
  plan.districts = plan.districts.filter((d) => d.capacity > 0);
  // the square
  const plazaMat = ["asphalt_road", "concrete_road", "neon_road"].includes(type) ? TERRAIN_MATERIAL_INDEX.Pavement : type === "metal_walkway" ? TERRAIN_MATERIAL_INDEX.Slate : type === "sand_path" ? TERRAIN_MATERIAL_INDEX.Sandstone : TERRAIN_MATERIAL_INDEX.Cobblestone;
  const square = kept.find((b) => b.use === "plaza");
  if (square) paintPoly(ctx, square.poly, plazaMat);
  else if (shape === "radial") paintPoly(ctx, Array.from({ length: 32 }, (_, i) => W((i / 32) * full, r0)), plazaMat);
}

function inPoly(q: Vec2, poly: Vec2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a[1] > q[1] !== b[1] > q[1] && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

/** Paints the ground inside a polygon, streets and water left as they are. */
function paintPoly(ctx: GenContext, poly: Vec2[], material: number): void {
  const xs = poly.map((q) => q[0]);
  const zs = poly.map((q) => q[1]);
  const [ax, az] = ctx.heights.toCell(Math.min(...xs), Math.min(...zs));
  const [bx, bz] = ctx.heights.toCell(Math.max(...xs), Math.max(...zs));
  for (let gz = Math.max(0, Math.floor(az)); gz <= Math.min(ctx.depth - 1, Math.ceil(bz)); gz++) {
    for (let gx = Math.max(0, Math.floor(ax)); gx <= Math.min(ctx.width - 1, Math.ceil(bx)); gx++) {
      const i = gz * ctx.width + gx;
      if (ctx.materials[i] === TERRAIN_MATERIAL_INDEX.Water || ctx.roadDistance.data[i]! <= 0) continue;
      if (inPoly(ctx.heights.toWorld(gx, gz), poly)) ctx.materials[i] = material;
    }
  }
}
