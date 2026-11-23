import { lerp, smootherstep, type District, type DistrictFunction, type Parcel, type PathPolyline, type PrefabVariant, type Rng, type SettlementPlan, type Vec2, type Vec3 } from "@worldforge/core";
import { WALL_SEGMENT } from "@worldforge/prefabs";
import { inBounds, isWaterAt, type GenContext, type SettlementSite } from "../context";
import { GROUND_STEP } from "./ground";
import { carveRoad, placeStairs, refreshRoadDistance, routeRoad } from "./roads";

/**
 * How a settlement grows: zones first (from the ground), then streets, then plots along the streets, then the
 * building a plot deserves. Nothing is drawn at random around a centre: every candidate site is scored, and a site
 * that is technically free may still be refused.
 */

/** What a kind of building asks of its site. Distances are fractions of the settlement radius. */
export interface SiteRules {
  /** Preferred distance to the plaza, and how strictly. */
  ring: number;
  strict: number;
  /** Main axis matters (shops) or not (homes). */
  mainStreet: number;
  /** Likes being near water (+) or not (-). */
  water: number;
  /** Prefers high ground. */
  high: number;
  /** Tolerated relief under the building, studs. */
  relief: number;
  setback: number;
  /** Free ground behind and beside the building. */
  yard: number;
  gap: number;
}

export const SITE_RULES: Record<DistrictFunction, SiteRules> = {
  civic: { ring: 0.28, strict: 3.2, mainStreet: 0.7, water: 0, high: 0.5, relief: 7, setback: 2, yard: 4, gap: 4 },
  commerce: { ring: 0.36, strict: 2.4, mainStreet: 1.4, water: 0, high: 0, relief: 7, setback: 1, yard: 5, gap: 2 },
  craft: { ring: 0.72, strict: 1, mainStreet: 0.3, water: 0.9, high: -0.2, relief: 7, setback: 4, yard: 10, gap: 5 },
  residential: { ring: 0.62, strict: 0.7, mainStreet: -0.15, water: 0, high: 0.2, relief: 9, setback: 3, yard: 11, gap: 4 },
  farm: { ring: 1, strict: 1.2, mainStreet: 0.1, water: 0.3, high: -0.2, relief: 7, setback: 7, yard: 14, gap: 8 },
  military: { ring: 0.6, strict: 0.6, mainStreet: 0.4, water: 0, high: 0.3, relief: 7, setback: 4, yard: 6, gap: 5 },
};

interface Slot {
  x: number;
  z: number;
  /** From the street into the plot. */
  n: Vec2;
  t: Vec2;
  street: PathPolyline;
  main: boolean;
}

/** Oriented rectangle: `hx` along the street, `hz` along `n`. */
export interface Plot {
  x: number;
  z: number;
  n: Vec2;
  hx: number;
  hz: number;
}

export interface UrbanBuilding {
  prefab: string;
  variant: number;
}

/** Plots stay inside this share of the radius (farms go further). */
const REACH = 1.05;

export function plotsOverlap(a: Plot, b: Plot): boolean {
  for (const f of [a, b]) {
    for (const [ax, az] of [f.n, [-f.n[1], f.n[0]] as Vec2]) {
      const half = (q: Plot) => Math.abs(q.n[0] * ax + q.n[1] * az) * q.hz + Math.abs(-q.n[1] * ax + q.n[0] * az) * q.hx;
      if (Math.abs((a.x - b.x) * ax + (a.z - b.z) * az) >= half(a) + half(b)) return false;
    }
  }
  return true;
}

/** Levels a rectangle and blends out of it, without ever touching a street or the pad of another building. */
export function levelPad(ctx: GenContext, plot: Plot, y: number, blend: number): number {
  const h = ctx.heights;
  const parts = ctx.terrainMode === "parts";
  const base = parts ? Math.round(y / GROUND_STEP) * GROUND_STEP : y;
  const mask = (ctx.padMask ??= new Uint8Array(ctx.width * ctx.depth));
  const margin = parts ? 0 : blend;
  const [cx, cz] = h.toCell(plot.x, plot.z);
  const rc = Math.ceil((Math.hypot(plot.hx, plot.hz) + margin) / ctx.cellSize) + 1;
  const core: number[] = [];
  for (let dz = -rc; dz <= rc; dz++) {
    for (let dx = -rc; dx <= rc; dx++) {
      const gx = Math.round(cx) + dx;
      const gz = Math.round(cz) + dz;
      if (gx < 0 || gz < 0 || gx >= ctx.width || gz >= ctx.depth) continue;
      const i = gz * ctx.width + gx;
      if (mask[i] || !Number.isNaN(ctx.water.data[i]!)) continue;
      const [wx, wz] = h.toWorld(gx, gz);
      const u = Math.abs((wx - plot.x) * -plot.n[1] + (wz - plot.z) * plot.n[0]) - plot.hx;
      const v = Math.abs((wx - plot.x) * plot.n[0] + (wz - plot.z) * plot.n[1]) - plot.hz;
      const out = Math.hypot(Math.max(0, u), Math.max(0, v));
      if (out > margin) continue;
      const rd = ctx.roadDistance.data[i]!;
      if (rd <= 0.5) continue;
      const w = out > 0 ? (1 - smootherstep(0, blend, out)) * smootherstep(0, 6, rd) : 1;
      h.data[i] = lerp(h.data[i]!, base, parts ? 1 : w);
      if (out === 0) core.push(i);
    }
  }
  for (const i of core) mask[i] = 1;
  return base;
}

function angle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function nearestRoadPoint(ctx: GenContext, p: Vec2): Vec2 | null {
  let best: Vec2 | null = null;
  let d = Infinity;
  for (const r of ctx.paths) {
    if (r.kind !== "road") continue;
    for (const q of r.points) {
      const dd = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (dd < d) {
        d = dd;
        best = [q[0], q[1]];
      }
    }
  }
  return best;
}

/** Streets a settlement opens for itself when the through roads do not give it enough frontage. */
function openStreets(ctx: GenContext, site: SettlementSite, rng: Rng, need: number, plazaR: number): void {
  const R = site.radius;
  const [cx, cz] = site.center;
  const through = ctx.paths.filter((p) => p.kind === "road" && p.points.some((q) => Math.hypot(q[0] - cx, q[1] - cz) < R * 0.9));
  const frontage = () => {
    let len = 0;
    for (const p of ctx.paths) {
      if (p.kind !== "road") continue;
      for (let i = 1; i < p.points.length; i++) {
        const [ax, az] = p.points[i - 1]!;
        const [bx, bz] = p.points[i]!;
        const d = Math.hypot(bx - cx, bz - cz);
        if (d > plazaR && d < R * REACH) len += Math.hypot(bx - ax, bz - az) * 2;
      }
    }
    return len;
  };
  const mainWidth = through.length ? Math.max(...through.map((p) => p.width)) : 8;
  const type = through[0]?.type ?? ctx.style.kits.road;
  const rural = !["asphalt_road", "concrete_road", "neon_road", "metal_walkway", "snow_path", "sand_path"].includes(type);
  /** Bearings the settlement already opens to, at mid radius. */
  const bearings: number[] = [];
  for (const p of through) {
    for (let i = 1; i < p.points.length; i++) {
      const a = p.points[i - 1]!;
      const b = p.points[i]!;
      const da = Math.hypot(a[0] - cx, a[1] - cz) - R * 0.5;
      const db = Math.hypot(b[0] - cx, b[1] - cz) - R * 0.5;
      if (da * db <= 0) bearings.push(Math.atan2(b[1] - cz, b[0] - cx));
    }
  }
  let n = 0;
  const open = (nodes: Vec2[], width: number, kind: string): boolean => {
    const pts = routeRoad(ctx, rng, nodes, { waterCost: 60 });
    if (!pts || pts.length < 6) return false;
    let bad = 0;
    let along = 0;
    let counted = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1]!;
      const [bx, bz] = pts[i]!;
      const r = Math.hypot(bx - cx, bz - cz);
      if (isWaterAt(ctx, bx, bz) || r > R * 1.25 || !inBounds(ctx, bx, bz, 24)) return false;
      const run = Math.hypot(bx - ax, bz - az) || 1;
      if (ctx.terrainMode !== "parts" && Math.abs(ctx.heights.sample(ax, az) - ctx.heights.sample(bx, bz)) / run > 0.55) bad++;
      if (r > R * 0.34) {
        counted++;
        if (ctx.roadDistance.sample(bx, bz) < 15) along++;
      }
    }
    // a street that runs beside another one, or climbs a bank, is worth nothing
    if (bad > pts.length * 0.06 || (counted > 0 && along / counted > 0.4)) return false;
    const id = `${site.id}_${kind}_${n++}`;
    const streetType = rural && kind === "lane" ? "dirt_path" : type;
    ctx.paths.push({ id, kind: "road", type: streetType, points: pts, width });
    carveRoad(ctx, pts, width, streetType);
    placeStairs(ctx, id, pts);
    refreshRoadDistance(ctx);
    return true;
  };
  const at = (a: number, r: number): Vec2 => [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
  const turn = Math.PI * 2;
  const gaps = () => {
    const s = bearings.map((a) => ((a % turn) + turn) % turn).sort((a, b) => a - b);
    return s.map((a, i) => ({ from: a, size: i + 1 < s.length ? s[i + 1]! - a : s[0]! + turn - a })).sort((a, b) => b.size - a.size);
  };
  const streetW = Math.max(6, Math.round(mainWidth * 0.75));
  const laneW = Math.max(4, Math.round(mainWidth * 0.5));
  if (bearings.length === 0) bearings.push(Math.atan2(ctx.spawn.position[2] - cz, ctx.spawn.position[0] - cx));
  for (let round = 0; round < 7 && (frontage() < need * 1.35 || (round === 0 && need >= 180)); round++) {
    const gap = gaps()[0]!;
    if (gap.size < 0.75) break;
    // a street out of the plaza through the widest empty sector
    let a = gap.from + gap.size / 2 + (rng.next() - 0.5) * 0.35;
    let done = false;
    for (let tries = 0; tries < 4 && !done; tries++) {
      const bend = (rng.next() - 0.5) * 0.4;
      done = open([at(a, plazaR * 0.5), at(a + bend, R * 0.5), at(a + bend * 0.5, R * (round === 0 ? 0.95 : 0.82))], streetW, "street");
      if (!done) a += (tries % 2 ? 1 : -1) * (0.25 + tries * 0.12);
    }
    bearings.push(a);
    // then a lane that joins it to its neighbour, so there are two ways round
    if (done && (frontage() < need * 1.6 || round === 0)) {
      const g = gaps()
        .filter((q) => Math.abs(angle(q.from - a)) < 0.02 || Math.abs(angle(q.from + q.size - a)) < 0.02)
        .sort((p, q) => p.size - q.size)[0];
      if (g && g.size > 0.5 && g.size < 3.6) {
        const r = R * rng.float(0.56, 0.66);
        const steps = Math.max(2, Math.round(g.size / 0.55));
        const nodes: Vec2[] = [];
        for (let k = 0; k <= steps; k++) nodes.push(at(g.from + (g.size * k) / steps, r));
        nodes[0] = nearestRoadPoint(ctx, nodes[0]!) ?? nodes[0]!;
        nodes[steps] = nearestRoadPoint(ctx, nodes[steps]!) ?? nodes[steps]!;
        open(nodes, laneW, "lane");
      }
    }
  }
}

/** Zones before buildings: the ground says where the fields, the workshops and the homes go. */
function zoneDistricts(ctx: GenContext, site: SettlementSite, programme: Record<DistrictFunction, number>): District[] {
  const R = site.radius;
  const [cx, cz] = site.center;
  const at = (a: number, r: number): Vec2 => [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
  const sectors = Array.from({ length: 16 }, (_, k) => {
    const a = (k / 16) * Math.PI * 2;
    let build = 0;
    let high = 0;
    let water = 400;
    for (let i = 0; i < 6; i++) {
      const [x, z] = at(a, R * (0.45 + i * 0.12));
      const s = ctx.analysis?.at(x, z);
      build += s?.buildable ?? 0.5;
      high += s?.altitude ?? 0.5;
      water = Math.min(water, ctx.waterDistance.sample(x, z));
    }
    return { a, build: build / 6, high: high / 6, water };
  });
  const used: number[] = [];
  const pick = (score: (s: (typeof sectors)[number]) => number): number => {
    const best = [...sectors].sort((p, q) => score(q) - score(p)).find((s) => used.every((u) => Math.abs(angle(u - s.a)) > 0.7)) ?? sectors[0]!;
    used.push(best.a);
    return best.a;
  };
  const toSpawn = Math.atan2(ctx.spawn.position[2] - cz, ctx.spawn.position[0] - cx);
  const out: District[] = [];
  const add = (fn: DistrictFunction, id: string, center: Vec2, radius: number, priority: number, capacity: number) => {
    if (capacity > 0) out.push({ id: `${site.id}_${id}`, function: fn, center, radius, priority, capacity });
  };
  add("civic", "centre", [cx, cz], R * 0.34, 1, programme.civic);
  add("commerce", "market", at(toSpawn, R * 0.3), R * 0.4, 2, programme.commerce);
  add("military", "quarters", at(toSpawn + Math.PI, R * 0.45), R * 0.6, 2, programme.military);
  if (programme.craft > 0) add("craft", "workshops", at(pick((s) => s.build + (s.water < 90 ? 0.6 - s.water / 200 : 0) - s.high * 0.2), R * 0.7), R * 0.4, 3, programme.craft);
  if (programme.farm > 0) add("farm", "farms", at(pick((s) => s.build * 1.6 + (s.water < 120 ? 0.15 : 0)), R * 0.95), R * 0.6, 5, programme.farm);
  const homes = programme.residential;
  const quarters = homes > 9 ? 3 : homes > 4 ? 2 : homes > 0 ? 1 : 0;
  for (let q = 0; q < quarters; q++) add("residential", `homes_${q + 1}`, at(pick((s) => s.build + (q === 0 ? s.high * 0.5 : 0)), R * 0.6), R * 0.45, 4, Math.ceil(homes / quarters));
  return out;
}

/** How many buildings of each function a settlement of this kind is made of. */
export function programmeOf(type: string, count: number): Record<DistrictFunction, number> {
  const p: Record<DistrictFunction, number> = { civic: 0, commerce: 0, craft: 0, residential: 0, farm: 0, military: 0 };
  const share = (k: number) => Math.round(count * k);
  if (type === "base" || type === "outpost") {
    p.civic = count > 2 ? 1 : 0;
    p.craft = share(0.2);
    p.military = count - p.civic - p.craft;
    return p;
  }
  if (count >= 5) p.civic = Math.max(1, share(0.08));
  const rural = type === "village" || type === "hamlet" || type === "farmstead" || type === "abandoned_village" || type === "camp";
  p.commerce = share(type === "farmstead" || type === "camp" ? 0 : rural ? 0.16 : 0.26);
  p.craft = count >= 6 ? Math.max(1, share(type === "harbor" ? 0.18 : 0.1)) : 0;
  p.farm = type === "camp" ? 0 : type === "farmstead" ? share(0.5) : rural && count >= 5 ? Math.max(1, share(0.16)) : 0;
  p.residential = Math.max(0, count - p.civic - p.commerce - p.craft - p.farm);
  return p;
}

const ORDER: DistrictFunction[] = ["civic", "commerce", "military", "craft", "residential", "farm"];

/**
 * Streets, plots and buildings of one organic settlement. Returns how many buildings found a site; the caller decides
 * what to do with the rest. `choose` gives the prefab for a function (a shop on a market street, a home elsewhere).
 */
export function planSettlement(
  ctx: GenContext,
  site: SettlementSite,
  rng: Rng,
  count: number,
  choose: (fn: DistrictFunction) => UrbanBuilding | null,
  place: (b: UrbanBuilding, at: Vec3, rotationY: number, scale: number) => string,
): number {
  const R = site.radius;
  const [cx, cz] = site.center;
  const plazaR = Math.max(14, R * 0.25);
  const programme = programmeOf(site.spec.type, count);
  openStreets(ctx, site, rng, count * 30, plazaR);
  const districts = zoneDistricts(ctx, site, programme);
  const plan: SettlementPlan = { settlement: site.id, plaza: { center: [cx, cz], radius: plazaR }, districts, parcels: [], refused: {} };
  ctx.plan.settlements.push(plan);
  const refuse = (why: string): null => {
    plan.refused[why] = (plan.refused[why] ?? 0) + 1;
    return null;
  };
  const walled = ctx.style.environment.walls !== "none" && (ctx.prefabs["town_wall"]?.length ?? 0) > 0 && !["city_district", "camp", "outpost"].includes(site.spec.type);
  const wallR = R * 1.12 + 10;

  // every place on both sides of every street where a plot could open
  const slots: Slot[] = [];
  const mainWidth = Math.max(...ctx.paths.filter((p) => p.kind === "road").map((p) => p.width), 6);
  for (const street of ctx.paths) {
    if (street.kind !== "road") continue;
    const pts = street.points;
    for (let i = 2; i < pts.length - 2; i++) {
      const p = pts[i]!;
      const r = Math.hypot(p[0] - cx, p[1] - cz);
      if (r > R * 2 || r < plazaR * 0.7) continue;
      const a = pts[i - 2]!;
      const b = pts[i + 2]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const t: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      for (const side of [1, -1]) {
        const n: Vec2 = [-t[1] * side, t[0] * side];
        const off = street.width / 2 + 2;
        slots.push({ x: p[0] + n[0] * off, z: p[1] + n[1] * off, n, t, street, main: street.width >= mainWidth * 0.95 });
      }
    }
  }

  const taken: Plot[] = [];
  const [sx, , sz] = ctx.spawn.position;
  const look = Math.atan2(ctx.spawn.lookAt[2] - sz, ctx.spawn.lookAt[0] - sx);
  const parts = ctx.terrainMode === "parts";
  let placed = 0;

  const fits = (slot: Slot, v: PrefabVariant, rules: SiteRules, tight: number): { plot: Plot; pad: Plot; y: number } | null => {
    const bw = Math.max(Math.abs(v.bounds.min[0]), v.bounds.max[0]);
    const bd = Math.max(Math.abs(v.bounds.min[2]), v.bounds.max[2]);
    const edge = Math.min(1, Math.hypot(slot.x - cx, slot.z - cz) / R);
    const gap = rules.gap * lerp(0.5, 1.5, edge) * tight;
    const setback = rules.setback * lerp(0.6, 1.5, edge);
    const yard = rules.yard * lerp(0.6, 1.4, edge) * tight;
    const depth = setback + bd * 2 + yard;
    const plot: Plot = { x: slot.x + slot.n[0] * (depth / 2), z: slot.z + slot.n[1] * (depth / 2), n: slot.n, hx: bw + gap / 2, hz: depth / 2 };
    const pad: Plot = { x: slot.x + slot.n[0] * (setback + bd), z: slot.z + slot.n[1] * (setback + bd), n: slot.n, hx: bw * 0.95, hz: bd * 0.95 };
    for (const o of taken) if (plotsOverlap(plot, o)) return refuse("plot taken");
    const reach = Math.hypot(pad.hx, pad.hz);
    if (Math.hypot(pad.x - cx, pad.z - cz) < plazaR + pad.hz * 0.6) return refuse("plaza");
    for (const o of ctx.occupants) {
      const d = Math.hypot(pad.x - o.position[0], pad.z - o.position[2]);
      if (o.kind === "keep") {
        if (d < o.radius + reach * 0.7 && Math.hypot(o.position[0] - cx, o.position[2] - cz) > 4) return refuse("kept clear");
      } else if (d < o.radius + reach * 0.9) return refuse("occupied");
    }
    // the first view keeps its axis: no facade right in front of the spawn
    const dx = pad.x - sx;
    const dz = pad.z - sz;
    const ahead = dx * Math.cos(look) + dz * Math.sin(look);
    if (ahead > 0 && ahead < 130 && Math.abs(-dx * Math.sin(look) + dz * Math.cos(look)) < reach + 9) return refuse("first view");
    let lo = Infinity;
    let hi = -Infinity;
    let sum = 0;
    let c = 0;
    for (let u = -2; u <= 2; u++) {
      for (let w = -2; w <= 2; w++) {
        const px = pad.x + slot.t[0] * ((u / 2) * (pad.hx + 2)) + slot.n[0] * ((w / 2) * (pad.hz + 1));
        const pz = pad.z + slot.t[1] * ((u / 2) * (pad.hx + 2)) + slot.n[1] * ((w / 2) * (pad.hz + 1));
        if (!inBounds(ctx, px, pz, 18)) return refuse("border");
        if (isWaterAt(ctx, px, pz) || ctx.waterDistance.sample(px, pz) < 5) return refuse("water");
        if (ctx.roadDistance.sample(px, pz) < 0.8) return refuse("street");
        const y = ctx.heights.sample(px, pz);
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
        sum += y;
        c++;
      }
    }
    if (hi - lo > (parts ? GROUND_STEP * 1.05 : rules.relief)) return refuse("too steep");
    if (ctx.roadDistance.sample(slot.x + slot.n[0] * depth, slot.z + slot.n[1] * depth) < 0.5) return refuse("street");
    const street = ctx.heights.sample(slot.x - slot.n[0] * 2, slot.z - slot.n[1] * 2);
    if (Math.abs(sum / c - street) > (parts ? GROUND_STEP * 1.05 : 7)) return refuse("too far from the street level");
    return { plot, pad, y: parts ? street : lerp(sum / c, street, 0.45) };
  };

  const score = (slot: Slot, fn: DistrictFunction, rules: SiteRules): number => {
    const px = slot.x + slot.n[0] * 12;
    const pz = slot.z + slot.n[1] * 12;
    const r = Math.hypot(px - cx, pz - cz) / R;
    const outside = fn === "farm" && walled;
    if (outside ? r * R < wallR + WALL_SEGMENT || r > 1.95 : r > (fn === "farm" ? 1.35 : REACH) || (walled && r * R > wallR - 26)) return -9;
    let s = -Math.abs(r - (outside ? 1.5 : rules.ring)) * rules.strict;
    s += (slot.main ? 1 : 0) * rules.mainStreet;
    const ground = ctx.analysis?.at(px, pz);
    s += (ground?.buildable ?? 0.6) * 0.8 + (ground?.altitude ?? 0.5) * rules.high;
    if (rules.water) s += rules.water * Math.max(0, 1 - ctx.waterDistance.sample(px, pz) / 110);
    const quarter = districts.filter((d) => d.function === fn);
    if (quarter.length) s += Math.max(...quarter.map((d) => Math.max(0, 1 - Math.hypot(px - d.center[0], pz - d.center[1]) / d.radius))) * 1.1;
    // homes gather with homes; a smithy keeps away from the town hall
    for (const p of plan.parcels) {
      if (Math.hypot(px - p.center[0], pz - p.center[1]) > 46) continue;
      if (p.function === fn) s += fn === "residential" ? 0.12 : 0.05;
      else if (fn === "craft" && p.function === "civic") s -= 0.3;
    }
    return s;
  };

  for (const fn of ORDER) {
    const rules = SITE_RULES[fn];
    for (let k = 0; k < programme[fn]; k++) {
      const b = choose(fn);
      const v = b && ctx.prefabs[b.prefab]?.[b.variant];
      if (!b || !v) continue;
      const ranked = slots
        .map((slot) => ({ slot, s: score(slot, fn, rules) + rng.next() * 0.22 }))
        .filter((q) => q.s > -2.6)
        .sort((p, q) => q.s - p.s);
      let done = false;
      for (const tight of [1, 0.55]) {
        for (const { slot } of ranked) {
          const fit = fits(slot, v, rules, tight);
          if (!fit) continue;
          const edge = Math.min(1, Math.hypot(slot.x - cx, slot.z - cz) / R);
          const scale = 1 + (rng.next() * 2 - 1) * ctx.style.architecture.scaleVariance * 0.35;
          const front = Math.atan2(slot.n[0], slot.n[1]);
          const facing = front + ((rng.next() * 2 - 1) * Math.PI * lerp(1.5, 5, edge)) / 180;
          const y = levelPad(ctx, { ...fit.pad, hx: fit.pad.hx + 2.5, hz: fit.pad.hz + 2.5 }, fit.y, 9);
          const quarter = districts.filter((d) => d.function === fn).sort((p, q) => Math.hypot(p.center[0] - slot.x, p.center[1] - slot.z) - Math.hypot(q.center[0] - slot.x, q.center[1] - slot.z))[0];
          const parcel: Parcel = { id: `${site.id}_plot_${plan.parcels.length}`, district: quarter?.id ?? site.id, function: fn, center: [fit.plot.x, fit.plot.z], rotationY: front, frontage: fit.plot.hx * 2, depth: fit.plot.hz * 2, street: slot.street.id };
          parcel.building = place(b, [fit.pad.x, y, fit.pad.z], facing, scale);
          plan.parcels.push(parcel);
          taken.push(fit.plot);
          placed++;
          done = true;
          break;
        }
        if (done) break;
      }
    }
  }
  return placed;
}
