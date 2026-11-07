import { TERRAIN_MATERIAL_INDEX, clamp, deriveSeed, type LandmarkSpec, type Vec2, type Vec3 } from "@worldforge/core";
import { Rng } from "@worldforge/core";
import { Simplex2D } from "../noise";
import { distanceToEdge, hasLineOfSight, normToWorld, progress, type GenContext } from "../context";
import { layoutKeepOut } from "./layout";
import { flattenArea, circlePoly } from "./sites";

/** Landmark type → prefab id and approximate height (for visibility tests) and footprint. */
export const LANDMARK_PREFAB: Record<LandmarkSpec["type"], { prefab: string; height: number; footprint: number; water?: boolean }> = {
  giant_tree: { prefab: "giant_tree", height: 90, footprint: 30 },
  ruins: { prefab: "ancient_ruins", height: 22, footprint: 30 },
  tower: { prefab: "tower", height: 50, footprint: 14 },
  castle: { prefab: "castle", height: 46, footprint: 60 },
  manor: { prefab: "manor", height: 42, footprint: 34 },
  chalet: { prefab: "chalet", height: 26, footprint: 20 },
  statue: { prefab: "statue", height: 36, footprint: 12 },
  windmill: { prefab: "windmill", height: 40, footprint: 14 },
  temple: { prefab: "temple", height: 34, footprint: 32 },
  portal: { prefab: "portal", height: 26, footprint: 16 },
  well: { prefab: "well", height: 10, footprint: 6 },
  mountain_peak: { prefab: "cliff_block", height: 100, footprint: 110 },
  volcano: { prefab: "lava_vent", height: 100, footprint: 110 },
  campfire: { prefab: "campfire", height: 4, footprint: 6 },
  bridge: { prefab: "bridge", height: 8, footprint: 16 },
  crashed_plane: { prefab: "crashed_plane", height: 26, footprint: 64 },
  radio_tower: { prefab: "radio_tower", height: 70, footprint: 10 },
  skyscraper: { prefab: "skyscraper_landmark", height: 160, footprint: 22 },
  skyscraper_ruin: { prefab: "skyscraper_ruin", height: 90, footprint: 26 },
  water_tower: { prefab: "water_tower", height: 40, footprint: 11 },
  pyramid: { prefab: "pyramid", height: 56, footprint: 52 },
  colosseum: { prefab: "colosseum", height: 36, footprint: 42 },
  torii_gate: { prefab: "torii_gate", height: 28, footprint: 14 },
  lighthouse: { prefab: "lighthouse", height: 56, footprint: 12 },
  pirate_ship: { prefab: "pirate_ship", height: 60, footprint: 32, water: true },
  rocket: { prefab: "rocket", height: 80, footprint: 22 },
  ufo: { prefab: "ufo", height: 40, footprint: 24 },
  dome_base: { prefab: "dome_base", height: 22, footprint: 26 },
  crystal_spire: { prefab: "crystal_spire", height: 48, footprint: 16 },
  ferris_wheel: { prefab: "ferris_wheel", height: 60, footprint: 30 },
  stadium: { prefab: "stadium", height: 34, footprint: 72 },
  fountain: { prefab: "fountain", height: 16, footprint: 13 },
  obelisk: { prefab: "obelisk", height: 58, footprint: 10 },
  waterfall_cliff: { prefab: "waterfall_cliff", height: 36, footprint: 24 },
  gas_station: { prefab: "gas_station", height: 14, footprint: 26 },
  church: { prefab: "church", height: 70, footprint: 28 },
  barn: { prefab: "barn", height: 28, footprint: 24 },
  cave: { prefab: "cave_entrance", height: 16, footprint: 14 },
};

/**
 * Stage 10: landmark placement with view corridors.
 * Candidates come from the zone hint; the score combines visibility from key viewpoints
 * (spawn/villages), isolation from other landmarks and zone fit.
 */
export function placeLandmarks(ctx: GenContext): void {
  const { spec } = ctx;
  const rng = new Rng(deriveSeed(ctx.seed, "landmarks"));
  const slope = ctx.heights.slopeGrid();
  const [minH, maxH] = ctx.heights.minMax();
  const range = Math.max(1, maxH - minH);
  ctx.landmarks = [];

  const viewpoints: { id: string; pos: Vec2 }[] = ctx.sites.map((s) => ({ id: s.id, pos: s.center }));
  if (viewpoints.length === 0) viewpoints.push({ id: "center", pos: [ctx.origin[0] + ctx.worldW / 2, ctx.origin[1] + ctx.worldD / 2] });

  const ordered = [...spec.landmarks].sort((a, b) => roleRank(a.role) - roleRank(b.role));
  let idx = 0;
  for (const lm of ordered) {
    progress(ctx, `landmarks:${lm.id}`, idx++ / Math.max(1, ordered.length));
    const info = LANDMARK_PREFAB[lm.type];
    const scaleMult = lm.scale;
    let pos: Vec2 | null = lm.position ? normToWorld(ctx, lm.position) : null;
    // ships and other water landmarks moor on the sea / lake near the shore when the map has water
    const afloat = info.water === true ? searchWaterPosition(ctx, info, viewpoints, rng) : null;
    if (afloat) pos = afloat;
    if (!pos) {
      pos = searchPosition(ctx, lm, info, slope, minH, range, viewpoints, rng);
    }
    if (!pos) continue;
    // flatten footprint and get base height (water landmarks sit at the water surface, terrain untouched)
    const footprint = info.footprint * scaleMult;
    const peak = (lm.type === "mountain_peak" || lm.type === "volcano") && !ctx.plateau && !ctx.islands;
    const base = peak ? raisePeak(ctx, pos, info.height * scaleMult, info.footprint * 1.45 * scaleMult, lm.type === "volcano") : afloat ? ctx.water.sample(pos[0], pos[1]) : lm.type === "well" && ctx.sites[0] ? ctx.heights.sample(pos[0], pos[1]) : flattenArea(ctx, pos, footprint * 1.4, 1.0, undefined, 0.78);
    const position: Vec3 = [pos[0], base, pos[1]];
    const corridors = viewpoints.map((v) => ({
      from: v.id,
      fromPosition: v.pos,
      visible: hasLineOfSight(ctx, [v.pos[0], ctx.heights.sample(v.pos[0], v.pos[1]) + 6, v.pos[1]], [pos[0], base + info.height * scaleMult * 0.6, pos[1]]),
    }));
    ctx.landmarks.push({ id: lm.id, type: lm.type, role: lm.role, position, scale: scaleMult, viewCorridors: corridors });
    ctx.zones.push({ id: lm.id, kind: "landmark", polygon: circlePoly(pos, footprint, 12), center: pos, radius: footprint });
    ctx.occupants.push({ position, radius: peak ? 24 : footprint, kind: "landmark" });
  }
  progress(ctx, "landmarks:done", 1);
}

/**
 * A mountain is terrain, not a prop: a summit block on a flattened pad read as a boulder on a plinth. The ground
 * itself rises, with a noisy outline and rock on its upper slopes; a volcano keeps a crater. Returns the summit.
 */
function raisePeak(ctx: GenContext, c: Vec2, height: number, radius: number, crater: boolean): number {
  const h = ctx.heights;
  const noise = new Simplex2D(deriveSeed(ctx.seed, "peak"));
  const rock = crater ? TERRAIN_MATERIAL_INDEX.Basalt : TERRAIN_MATERIAL_INDEX.Rock;
  const floor = h.sample(c[0], c[1]);
  const [cx, cz] = h.toCell(c[0], c[1]);
  const reach = Math.ceil((radius * 1.35) / ctx.cellSize);
  for (let dz = -reach; dz <= reach; dz++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const x = Math.round(cx) + dx;
      const z = Math.round(cz) + dz;
      if (x < 0 || z < 0 || x >= ctx.width || z >= ctx.depth) continue;
      const i = z * ctx.width + x;
      if (!Number.isNaN(ctx.water.data[i]!)) continue;
      const [wx, wz] = h.toWorld(x, z);
      const d = Math.hypot(wx - c[0], wz - c[1]);
      const t = clamp(1 - d / (radius * (1 + noise.fbm(wx / 70, wz / 70, 3) * 0.3)), 0, 1);
      if (t <= 0) continue;
      let rise = height * t ** 1.6 * (1 + noise.fbm(wx / 26, wz / 26, 2) * 0.14);
      if (crater) rise = Math.min(rise, height * 0.78);
      if (crater && d < radius * 0.13) rise = height * (0.5 + (d / (radius * 0.13)) * 0.28);
      if (floor + rise > h.data[i]!) h.data[i] = floor + rise;
      if (t > 0.3) ctx.materials[i] = rock;
      // lava runs down from the rim in narrow tongues: what says "volcano" from the foot of the mountain
      if (crater && t > 0.12 && Math.abs(noise.fbm(Math.atan2(wz - c[1], wx - c[0]) * 3.2, 7, 2)) < 0.07) ctx.materials[i] = TERRAIN_MATERIAL_INDEX.CrackedLava;
    }
  }
  return h.sample(c[0], c[1]);
}

/**
 * Water landmark search: a water cell with water all around the footprint, land within ~50 studs
 * (moored near the coast), preferably visible from the settlements and not too far from them.
 */
function searchWaterPosition(ctx: GenContext, info: { height: number; footprint: number }, viewpoints: { id: string; pos: Vec2 }[], rng: Rng): Vec2 | null {
  const h = ctx.heights;
  const water = (x: number, z: number) => !Number.isNaN(ctx.water.sample(x, z));
  let best: Vec2 | null = null;
  let bestScore = -Infinity;
  const r = info.footprint * 0.55;
  for (let z = 2; z < ctx.depth - 2; z += 4) {
    for (let x = 2; x < ctx.width - 2; x += 4) {
      const i = z * ctx.width + x;
      if (Number.isNaN(ctx.water.data[i]!)) continue;
      const [wx, wz] = h.toWorld(x, z);
      if (distanceToEdge(ctx, wx, wz) < 40) continue;
      let clear = true;
      let landNear = false;
      for (let k = 0; k < 8 && clear; k++) {
        const a = (k / 8) * Math.PI * 2;
        if (!water(wx + Math.cos(a) * r, wz + Math.sin(a) * r)) clear = false;
        if (!water(wx + Math.cos(a) * 50, wz + Math.sin(a) * 50)) landNear = true;
      }
      if (!clear || !landNear) continue;
      // depth: the hull needs a few studs of water
      if (ctx.water.data[i]! - h.data[i]! < 4) continue;
      let vis = 0;
      let near = 0;
      for (const v of viewpoints) {
        const d = Math.hypot(wx - v.pos[0], wz - v.pos[1]);
        near = Math.max(near, d < 80 ? 0.3 : d < 260 ? 1 : 260 / d);
        const from: Vec3 = [v.pos[0], h.sample(v.pos[0], v.pos[1]) + 6, v.pos[1]];
        if (hasLineOfSight(ctx, from, [wx, ctx.water.data[i]! + info.height * 0.5, wz], 8)) vis += 1;
      }
      vis /= Math.max(1, viewpoints.length);
      let iso = 1;
      for (const other of ctx.landmarks) {
        const d = Math.hypot(wx - other.position[0], wz - other.position[2]);
        if (d < 120) iso *= d / 120;
      }
      const score = (0.4 + vis) * near * iso * (0.85 + rng.next() * 0.3);
      if (score > bestScore) {
        bestScore = score;
        best = [wx, wz];
      }
    }
  }
  return best;
}

function roleRank(role: string): number {
  return role === "focal" ? 0 : role === "secondary" ? 1 : 2;
}

function searchPosition(
  ctx: GenContext,
  lm: LandmarkSpec,
  info: { height: number; footprint: number },
  slope: ReturnType<GenContext["heights"]["slopeGrid"]>,
  minH: number,
  range: number,
  viewpoints: { id: string; pos: Vec2 }[],
  rng: Rng,
): Vec2 | null {
  const h = ctx.heights;
  const step = 4;
  const marginStuds = Math.min(ctx.worldW, ctx.worldD) * (lm.role === "hidden" ? 0.1 : 0.14);
  let best: Vec2 | null = null;
  let bestScore = -Infinity;
  const smooth = h.blur(3);
  const keepOut = layoutKeepOut(ctx);
  for (let z = 2; z < ctx.depth - 2; z += step) {
    for (let x = 2; x < ctx.width - 2; x += step) {
      const i = z * ctx.width + x;
      const [wx, wz] = h.toWorld(x, z);
      if (distanceToEdge(ctx, wx, wz) < marginStuds) continue;
      if (!Number.isNaN(ctx.water.data[i]!)) continue;
      if (keepOut && Math.hypot(wx - keepOut.center[0], wz - keepOut.center[1]) < keepOut.radius + info.footprint) continue;
      const s = slope.data[i]!;
      if (s > 0.55) continue;
      const hn = (h.data[i]! - minH) / range;
      const wd = ctx.waterDistance.data[i]!;
      // zone fit
      let fit = 0.4;
      switch (lm.preferredZone) {
        case "hill": {
          const isLocalMax = smooth.get(x, z) >= Math.max(smooth.get(x + 6, z), smooth.get(x - 6, z), smooth.get(x, z + 6), smooth.get(x, z - 6)) - 2;
          fit = (isLocalMax ? 0.8 : 0.2) + hn * 0.6 - (hn > 0.85 ? 0.5 : 0);
          break;
        }
        case "ridge":
          fit = hn * 1.1 - (hn > 0.92 ? 0.6 : 0);
          break;
        case "plateau":
        case "clearing":
          fit = (s < 0.15 ? 0.9 : 0.2) + (0.5 - Math.abs(hn - 0.45)) * 0.5;
          break;
        case "valley":
          fit = (1 - hn) * 0.9 + (s < 0.2 ? 0.3 : 0);
          break;
        case "riverbank":
          fit = wd > 6 && wd < 40 ? 1.0 : 0.05;
          break;
        case "coast":
          // any shore (sea, lake, river) — low ground next to the water
          fit = wd > 4 && wd < 36 ? 1.0 - hn * 0.3 : 0.05;
          break;
        case "flat":
          fit = s < 0.12 ? 1.0 : s < 0.25 ? 0.4 : 0.05;
          break;
        case "outskirts": {
          const site = ctx.sites[0];
          if (!site) {
            fit = 0.5;
            break;
          }
          const d = Math.hypot(wx - site.center[0], wz - site.center[1]);
          fit = d > site.radius + 20 && d < site.radius * 2.2 + 60 ? 1.0 : 0.1;
          break;
        }
        case "forest_edge": {
          const b = ctx.biomeIds[ctx.biomes[i]!]!;
          const near = ctx.biomeIds[ctx.biomes[Math.min(ctx.biomes.length - 1, i + 6)]!]!;
          fit = b !== near ? 0.9 : 0.3;
          break;
        }
        case "village": {
          const site = ctx.sites[0];
          fit = site ? (Math.hypot(wx - site.center[0], wz - site.center[1]) < site.radius * 0.35 ? 1 : 0) : 0.3;
          break;
        }
        default:
          fit = 0.5 + (0.5 - Math.abs(hn - 0.5)) * 0.4;
      }
      if (fit <= 0) continue;
      // isolation
      let iso = 1;
      for (const other of ctx.landmarks) {
        const d = Math.hypot(wx - other.position[0], wz - other.position[2]);
        if (d < 140) iso *= d / 140;
      }
      if (lm.preferredZone !== "village") {
        for (const site of ctx.sites) {
          const d = Math.hypot(wx - site.center[0], wz - site.center[1]);
          if (d < site.radius + info.footprint + 20) iso *= 0.05;
          // the focal is the promise of the map: 500 studs away, a castle fills 6° of a 70° view
          else if (lm.role === "focal") iso *= clamp(1 - (d - (site.radius + info.footprint + 110)) / 260, 0.08, 1);
        }
      }
      // visibility
      let vis = 0;
      if (lm.role !== "hidden") {
        for (const v of viewpoints) {
          const from: Vec3 = [v.pos[0], h.sample(v.pos[0], v.pos[1]) + 6, v.pos[1]];
          const to: Vec3 = [wx, h.data[i]! + info.height * lm.scale * 0.6, wz];
          if (hasLineOfSight(ctx, from, to, 8)) vis += 1;
        }
        vis /= viewpoints.length;
      } else {
        // hidden: prefer NOT visible
        let seen = 0;
        for (const v of viewpoints) {
          const from: Vec3 = [v.pos[0], h.sample(v.pos[0], v.pos[1]) + 6, v.pos[1]];
          if (hasLineOfSight(ctx, from, [wx, h.data[i]! + 4, wz], 8)) seen++;
        }
        vis = 1 - seen / viewpoints.length;
      }
      const visW = lm.role === "focal" ? 2.2 : 1.0;
      const score = fit * (0.3 + vis * visW) * iso * (0.85 + rng.next() * 0.3) - s * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = [wx, wz];
      }
    }
  }
  return best;
}
