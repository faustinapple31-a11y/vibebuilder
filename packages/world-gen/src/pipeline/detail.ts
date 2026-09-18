import { Rng, deriveSeed, smoothstep, type BiomeId, type Placement, type PrefabVariant, type VegetationSpecies } from "@worldforge/core";
import { VEGETATION_KIT_SPECIES } from "@worldforge/prefabs";
import { biomeAt, distanceToEdge, inBounds, isWaterAt, layerFor, progress, settleOnGround, slopeAtWorld, type GenContext } from "../context";
import { SpatialHash } from "../grid";
import { SPECIES_PREFAB, poissonDisk } from "./vegetation";

/**
 * Stage 13b: the two bands a wide procedural scatter always leaves empty — the near field the player
 * walks through, and the horizon they look at.
 *
 *  - **verges**: a road through a generated world has bare shoulders, because every earlier stage keeps
 *    clear of it (vegetation excludes the road corridor, props sit on it). This pass fills the strip just
 *    outside the carriageway with tufts, flowers, ferns, pebbles and the odd log or fence run — the
 *    detail that makes a road look used instead of stamped.
 *  - **spawn apron**: a ring of dressing around the spawn clearing, with two trees framing the view to
 *    the focal landmark (the first thing a player ever sees, so it gets composed rather than scattered).
 *  - **waterline**: the band where the ground meets a lake, a river or the sea — pebble lines, driftwood,
 *    reeds and tufts on the bank, a few rocks breaking the surface just off it. A shoreline is the second
 *    line the eye follows after a road, and it came out as a clean paint boundary.
 *  - **horizon**: clumps of oversized trees and rock spires in the border band, so the map ends on a
 *    silhouette instead of a flat edge.
 *
 * Near-field placements carry more importance than deep-forest undergrowth, so when the budget trims,
 * it trims what nobody stands next to.
 */

const VERGE_STEP = 6;
const MAX_VERGE = 700;
const MAX_HORIZON = 650;

type Item = { position: [number, number, number]; radius: number };

export function placeDetail(ctx: GenContext): void {
  const rng = new Rng(deriveSeed(ctx.seed, "detail"));
  const hash = new SpatialHash<Item>(32);
  for (const o of ctx.occupants) hash.insert({ position: o.position, radius: o.radius });
  for (const p of ctx.placements) {
    const v = ctx.prefabs[p.prefab]?.[p.variant];
    if (!v || v.tags.includes("ground")) continue;
    const r = p.category === "vegetation" ? Math.max(1.2, (v.baseRadius ?? 1) * p.scale) : v.footprintRadius * p.scale * 0.6;
    hash.insert({ position: p.position, radius: r });
  }
  let n = 0;

  /** Places `prefab` at (x, z) if the ground is flat enough under its base and nothing is there. */
  const add = (prefab: string, x: number, z: number, opts: { scale?: number; rotationY?: number; importance?: number; margin?: number; big?: boolean; zone?: string; allowWater?: boolean } = {}): boolean => {
    const variants = ctx.prefabs[prefab];
    if (!variants || variants.length === 0) return false;
    if (!inBounds(ctx, x, z, 4) || (!opts.allowWater && isWaterAt(ctx, x, z))) return false;
    const vi = rng.int(0, variants.length - 1);
    const v: PrefabVariant = variants[vi]!;
    const scale = opts.scale ?? 1;
    const base = Math.max(1.5, (v.baseRadius ?? 0) * scale);
    // the base disc must clear the carriageway — `roadDistance` is measured from the road edge, so a
    // verge item may hug the kerb but never stand in it (and a crossing road counts too)
    const clear = (px: number, pz: number) => opts.allowWater || ctx.roadDistance.sample(px, pz) >= (v.baseRadius ?? 1) * scale;
    if (!clear(x, z)) return false;
    const at = settleOnGround(ctx, x, z, base, Math.min(4, Math.max(2.2, base)), 2);
    if (!at) return false;
    const [sx, sz] = at;
    if (!inBounds(ctx, sx, sz, 4) || (!opts.allowWater && isWaterAt(ctx, sx, sz))) return false;
    if (!clear(sx, sz)) return false;
    const radius = v.footprintRadius * scale * 0.5;
    if (hash.overlaps(sx, sz, radius, opts.margin ?? 0.4)) return false;
    const position: [number, number, number] = [sx, ctx.heights.sample(sx, sz) - v.sinkDepth * scale, sz];
    hash.insert({ position, radius });
    ctx.placements.push({
      id: `detail_${n++}`,
      prefab,
      variant: vi,
      category: v.category,
      position,
      rotationY: opts.rotationY ?? rng.float(0, Math.PI * 2),
      scale,
      layer: layerFor(ctx, sx, sz, opts.big === true),
      biome: biomeAt(ctx, sx, sz),
      zone: opts.zone,
      importance: opts.importance ?? 4.5,
    } satisfies Placement);
    return true;
  };

  progress(ctx, "detail:verges", 0);
  placeVerges(ctx, rng, add);
  progress(ctx, "detail:spawn", 0.5);
  placeSpawnApron(ctx, rng, add);
  progress(ctx, "detail:shore", 0.65);
  placeWaterline(ctx, rng, add);
  progress(ctx, "detail:horizon", 0.8);
  placeHorizon(ctx, rng, add);
  progress(ctx, "detail:done", 1);
}

type Add = (prefab: string, x: number, z: number, opts?: { scale?: number; rotationY?: number; importance?: number; margin?: number; big?: boolean; zone?: string; allowWater?: boolean }) => boolean;

/** Ground cover the style and biome allow, smallest first — what a verge or an apron is dressed with. */
function groundCover(ctx: GenContext, biome: BiomeId): string[] {
  const allowed = new Set<VegetationSpecies>([...ctx.spec.vegetation.species, ...(VEGETATION_KIT_SPECIES[ctx.style.kits.vegetation] ?? []).map(([sp]) => sp)]);
  const barren = ctx.style.kits.vegetation === "none" || biome === "moon" || biome === "wasteland" || biome === "volcanic";
  const out: string[] = [];
  if (!barren) {
    for (const sp of ["grass", "flower", "fern", "bush"] as VegetationSpecies[]) {
      if (allowed.has(sp) || sp === "grass") out.push(SPECIES_PREFAB[sp]);
    }
    if (biome === "desert" || biome === "beach") out.push("grass", "grass");
  }
  out.push("stone", "stone");
  return out.filter((id) => ctx.prefabs[id]?.length);
}

/**
 * Small things that belong on a kerb rather than in a hedgerow. A city verge dressed with pebbles and
 * tufts reads as a field with a road through it; these are what a street actually has on it.
 */
const STREET_ACCENTS = ["planter", "trash_can", "traffic_cone", "fire_hydrant", "road_barrier", "mailbox", "bus_stop", "vending_machine", "neon_sign", "supply_crate", "ammo_crate", "tank_trap", "sandbag_wall", "tire_pile", "rubble_pile", "oxygen_tank", "sci_crate", "hitching_post", "amphora", "beach_umbrella", "candy_cane", "gumdrop", "stone_lantern", "small_shrine", "bamboo_fence", "warning_sign", "pallet_stack"];

// ---------------------------------------------------------------- verges
function placeVerges(ctx: GenContext, rng: Rng, add: Add): void {
  const roads = ctx.paths.filter((p) => p.kind === "road");
  if (roads.length === 0) return;
  const cover = new Map<BiomeId, string[]>();
  const coverFor = (biome: BiomeId): string[] => {
    let c = cover.get(biome);
    if (!c) cover.set(biome, (c = groundCover(ctx, biome)));
    return c;
  };
  // what this world's own prop kits offer for a kerb (a city wants a planter, not a pebble)
  const street = STREET_ACCENTS.filter((id) => ctx.prefabs[id]?.length);
  let placed = 0;
  // longest roads first: the main arteries get their verge even when the budget runs out
  const ordered = [...roads].sort((a, b) => b.points.length * b.width - a.points.length * a.width);
  for (const road of ordered) {
    const pts = road.points;
    let acc = VERGE_STEP;
    let fenceRun = 0;
    for (let i = 1; i < pts.length && placed < MAX_VERGE; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-3) continue;
      const tx = (b[0] - a[0]) / len;
      const tz = (b[1] - a[1]) / len;
      for (let t = 0; t < len && placed < MAX_VERGE; t += 1) {
        acc += 1;
        if (acc < VERGE_STEP) continue;
        acc = 0;
        const px = a[0] + tx * t;
        const pz = a[1] + tz * t;
        if (isWaterAt(ctx, px, pz) || slopeAtWorld(ctx, px, pz) > 0.75) continue;
        const biome = biomeAt(ctx, px, pz);
        const mix = coverFor(biome);
        if (mix.length === 0) continue;
        // a fence follows the road for a few segments at a time, on one side only (field boundaries)
        if (fenceRun <= 0 && rng.chance(0.045) && ctx.prefabs["fence"]?.length) fenceRun = rng.int(3, 7) * (rng.chance(0.5) ? 1 : -1);
        for (const sgn of [-1, 1]) {
          const off = road.width / 2 + rng.float(0.9, 3.4);
          const x = px - tz * sgn * off;
          const z = pz + tx * sgn * off;
          if (fenceRun !== 0 && Math.sign(fenceRun) === sgn) {
            if (add("fence", px - tz * sgn * (road.width / 2 + 2.4), pz + tx * sgn * (road.width / 2 + 2.4), { rotationY: Math.atan2(-tz, tx), importance: 7.6, margin: 0 })) placed++;
            continue;
          }
          if (!rng.chance(0.62)) continue;
          const prefab = mix[rng.int(0, mix.length - 1)]!;
          const scale = prefab === "stone" ? rng.float(0.35, 0.8) : rng.float(0.8, 1.3);
          if (add(prefab, x, z, { scale, importance: 7.5, margin: 0 })) placed++;
        }
        if (fenceRun > 0) fenceRun--;
        else if (fenceRun < 0) fenceRun++;
        // a rarer accent: a fallen log, a patch of flowers or a milestone at the roadside
        if (rng.chance(0.085)) {
          const sgn = rng.chance(0.5) ? 1 : -1;
          const off = road.width / 2 + rng.float(2.6, 5);
          const accent = rng.weighted([
            { item: "log", weight: ctx.prefabs["log"]?.length && ctx.style.kits.vegetation !== "none" ? 1 : 0 },
            { item: "flower_patch", weight: ctx.prefabs["flower_patch"]?.length && ctx.style.kits.vegetation !== "none" ? 1 : 0 },
            { item: street.length > 0 ? street[rng.int(0, street.length - 1)]! : "stone", weight: street.length > 0 ? 1.6 : 0 },
            { item: "stone", weight: 1 },
          ]);
          if (add(accent, px - tz * sgn * off, pz + tx * sgn * off, { scale: accent === "stone" ? rng.float(0.6, 1.1) : rng.float(0.85, 1.2), importance: 7.2, margin: 0.2 })) placed++;
        }
      }
    }
  }
}

// ---------------------------------------------------------------- spawn apron
function placeSpawnApron(ctx: GenContext, rng: Rng, add: Add): void {
  const [sx, , sz] = ctx.spawn.position;
  const look = ctx.spawn.lookAt;
  const facing = Math.atan2(look[2] - sz, look[0] - sx);
  const biome = biomeAt(ctx, sx, sz);
  const mix = groundCover(ctx, biome);
  const light = ["lantern_post", "torch_post", "stone_lantern", "streetlight", "tiki_torch", "brazier", "energy_pylon"].find((id) => ctx.prefabs[id]?.length);
  // two trees framing the view corridor: the composition the player sees on their first frame
  const treeId = ["round_tree", "pine_tree", "birch", "palm", "snow_pine", "jungle_tree", "cherry_tree", "acacia", "alien_tree", "candy_tree"].find((id) => ctx.prefabs[id]?.length);
  if (treeId && ctx.style.kits.vegetation !== "none") {
    for (const sgn of [-1, 1]) {
      const a = facing + sgn * 0.75;
      for (const r of [30, 36, 42]) {
        if (add(treeId, sx + Math.cos(a) * r, sz + Math.sin(a) * r, { scale: rng.float(1.15, 1.5), importance: 7.5, big: true, margin: 1 })) break;
      }
    }
  }
  // the rim of the clearing, not its floor: the spawn keeps a 24-stud walkable circle (an occupant),
  // so anything closer than that is rejected and the apron would come out empty
  const slots = 18;
  for (let i = 0; i < slots; i++) {
    const a = (i / slots) * Math.PI * 2 + rng.float(-0.1, 0.1);
    const r = rng.float(27, 41);
    const x = sx + Math.cos(a) * r;
    const z = sz + Math.sin(a) * r;
    // a lantern or a bench on the road side of the clearing, ground cover everywhere else
    if (light && i % 5 === 0 && add(light, x, z, { importance: 7, margin: 0.5 })) continue;
    if (mix.length === 0) continue;
    const prefab = rng.chance(0.25) && ctx.prefabs["flower_patch"]?.length && ctx.style.kits.vegetation !== "none" ? "flower_patch" : mix[rng.int(0, mix.length - 1)]!;
    add(prefab, x, z, { scale: prefab === "stone" ? rng.float(0.4, 0.9) : rng.float(0.85, 1.25), importance: 6.5, margin: 0.2 });
  }
}

// ---------------------------------------------------------------- waterline
function placeWaterline(ctx: GenContext, rng: Rng, add: Add): void {
  const pebble = ctx.prefabs["stone"]?.length ? "stone" : undefined;
  const drift = ctx.prefabs["log"]?.length ? "log" : undefined;
  const reeds = ctx.prefabs["reeds"]?.length ? "reeds" : undefined;
  const shell = ["clam", "surfboard", "treasure_chest"].find((id) => ctx.prefabs[id]?.length);
  if (!pebble && !drift && !reeds) return;
  let placed = 0;
  const limit = 380;
  for (const [x, z] of poissonDisk(ctx, rng, 7)) {
    if (placed >= limit) break;
    if (!inBounds(ctx, x, z, 8)) continue;
    const wd = ctx.waterDistance.sample(x, z);
    const wet = isWaterAt(ctx, x, z);
    // shallows just off the bank: a rock or a reed clump breaking the surface
    if (wet) {
      if (wd > 1.6 || !pebble) continue;
      const depth = ctx.water.sample(x, z) - ctx.heights.sample(x, z);
      if (!(depth > 0.4 && depth < 5) || !rng.chance(0.3)) continue;
      const tall = Math.max(1, ctx.prefabs[pebble]![0]!.bounds.max[1]);
      if (add(pebble, x, z, { scale: Math.min(3, Math.max(0.8, (depth + rng.float(1, 3)) / tall)), importance: 6.2, margin: 0.2, allowWater: true })) placed++;
      continue;
    }
    if (wd > 5.5 || slopeAtWorld(ctx, x, z) > 0.7) continue;
    // the bank itself: pebbles right at the edge, tufts and reeds a little further up
    const atEdge = wd < 2.4;
    const biome = biomeAt(ctx, x, z);
    const sandy = biome === "beach" || biome === "desert";
    const pick = rng.weighted([
      { item: pebble ?? "", weight: pebble ? (atEdge ? 3 : 1.4) : 0 },
      { item: reeds ?? "", weight: reeds && !sandy && !atEdge ? 2.2 : 0 },
      { item: drift ?? "", weight: drift && ctx.style.kits.vegetation !== "none" ? 0.5 : 0 },
      { item: shell ?? "", weight: shell && sandy && atEdge ? 0.35 : 0 },
    ]);
    if (pick === "" || !rng.chance(atEdge ? 0.55 : 0.32)) continue;
    const scale = pick === pebble ? rng.float(0.3, 0.85) : rng.float(0.8, 1.3);
    if (add(pick, x, z, { scale, importance: atEdge ? 6.4 : 6, margin: 0.1 })) placed++;
  }
}

// ---------------------------------------------------------------- horizon
function placeHorizon(ctx: GenContext, rng: Rng, add: Add): void {
  const band = Math.min(ctx.worldW, ctx.worldD) * 0.13;
  const treeIds = ["pine_tree", "snow_pine", "round_tree", "jungle_tree", "dead_tree", "cypress", "baobab", "palm", "alien_tree", "burnt_tree"].filter((id) => ctx.prefabs[id]?.length);
  const rockIds = ["cliff_block", "boulder", "rock_cluster", "ice_spike", "crystal_cluster", "meteorite"].filter((id) => ctx.prefabs[id]?.length);
  const barren = ctx.style.kits.vegetation === "none" || treeIds.length === 0;
  if (barren && rockIds.length === 0) return;
  // a city's horizon is a skyline, not a ridge of boulders: a few distant towers, far apart and large
  const urbanKit = ctx.style.kits.props.some((k) => k === "urban" || k === "cyber" || k === "industrial" || k === "apocalypse");
  const towerIds = urbanKit ? ["skyscraper", "skyscraper_ruin", "radio_tower", "storage_tank", "cable_pole"].filter((id) => ctx.prefabs[id]?.length) : [];
  let towers = 0;
  let placed = 0;
  // clump centres along the border band, then a handful of silhouettes around each
  const perSide = Math.max(7, Math.round(Math.min(ctx.worldW, ctx.worldD) / 75));
  const sides: [number, number][] = [];
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < perSide; i++) {
      const t = (i + rng.float(0.15, 0.85)) / perSide;
      const d = rng.float(14, band);
      const along = s % 2 === 0 ? ctx.origin[0] + ctx.worldW * t : ctx.origin[1] + ctx.worldD * t;
      if (s === 0) sides.push([along, ctx.origin[1] + d]);
      else if (s === 1) sides.push([ctx.origin[0] + ctx.worldW - d, along]);
      else if (s === 2) sides.push([along, ctx.origin[1] + ctx.worldD - d]);
      else sides.push([ctx.origin[0] + d, along]);
    }
  }
  // an island's border band is open ocean, so its silhouette has to come from the shore: shallow water
  // off the coast carries sea stacks that read against the sky from anywhere on the beach
  if (ctx.ocean && rockIds.length > 0) {
    const shoreClumps: [number, number][] = [];
    for (const [x, z] of poissonDisk(ctx, rng, 46)) {
      if (shoreClumps.length >= perSide * 3) break;
      if (!inBounds(ctx, x, z, 24) || !isWaterAt(ctx, x, z)) continue;
      const d = ctx.water.sample(x, z) - ctx.heights.sample(x, z);
      if (!(d > 1.5 && d < 22)) continue;
      const wd = ctx.waterDistance.sample(x, z);
      if (wd > 70) continue; // far out at sea it is scenery nobody can place
      shoreClumps.push([x, z]);
    }
    sides.push(...shoreClumps);
  }
  for (const [cx, cz] of sides) {
    if (placed >= MAX_HORIZON) break;
    if (!inBounds(ctx, cx, cz, 10)) continue;
    // an island or an archipelago has open sea where the border band would be: give it sea stacks —
    // rocks standing on the shallow sea floor, scaled until they break the surface
    if (isWaterAt(ctx, cx, cz)) {
      if (rockIds.length === 0) continue;
      const depth = ctx.water.sample(cx, cz) - ctx.heights.sample(cx, cz);
      if (!(depth > 1.5 && depth < 26)) continue;
      const count = rng.int(2, 4);
      for (let k = 0; k < count && placed < MAX_HORIZON; k++) {
        const a = rng.float(0, Math.PI * 2);
        const r = rng.float(0, 20);
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        if (distanceToEdge(ctx, x, z) < 10 || !isWaterAt(ctx, x, z)) continue;
        const d = ctx.water.sample(x, z) - ctx.heights.sample(x, z);
        if (!(d > 1.5 && d < 26)) continue;
        const prefab = rockIds[rng.int(0, rockIds.length - 1)]!;
        const tall = Math.max(2, ctx.prefabs[prefab]![0]!.bounds.max[1]);
        const scale = Math.min(4.5, Math.max(1.2, ((d + rng.float(6, 16)) / tall)));
        if (add(prefab, x, z, { scale, importance: 6.8, big: true, margin: 1.5, allowWater: true })) placed++;
      }
      continue;
    }
    const biome = biomeAt(ctx, cx, cz);
    // a skyline clump: two or three towers, then back to the natural silhouettes
    if (towerIds.length > 0 && towers < 22 && rng.chance(0.55)) {
      const n = rng.int(1, 3);
      for (let k = 0; k < n && towers < 22; k++) {
        const a = rng.float(0, Math.PI * 2);
        const r = rng.float(6, 26);
        const x = cx + Math.cos(a) * r;
        const z = cz + Math.sin(a) * r;
        const id = towerIds[rng.int(0, towerIds.length - 1)]!;
        if (add(id, x, z, { scale: rng.float(1.1, 1.8), importance: 6.8, big: true, margin: 6 })) {
          towers++;
          placed++;
        }
      }
      continue;
    }
    const stony = barren || biome === "rocky" || biome === "highlands" || biome === "snow" || biome === "desert" || biome === "moon" || biome === "volcanic" || rng.chance(0.3);
    const ids = stony && rockIds.length > 0 ? rockIds : treeIds;
    if (ids.length === 0) continue;
    const prefab = ids[rng.int(0, ids.length - 1)]!;
    const count = rng.int(3, 7);
    for (let k = 0; k < count && placed < MAX_HORIZON; k++) {
      const a = rng.float(0, Math.PI * 2);
      const r = rng.float(0, 24);
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (distanceToEdge(ctx, x, z) < 10) continue;
      // the closer to the edge, the larger: the ridge line reads over everything in front of it
      const edge = 1 - smoothstep(10, band * 1.6, distanceToEdge(ctx, x, z));
      const scale = stony ? rng.float(1.4, 2.6) * (0.8 + edge * 0.5) : rng.float(1.25, 1.75) * (0.85 + edge * 0.35);
      if (add(prefab, x, z, { scale, importance: 6.8, big: true, margin: 1 })) placed++;
    }
  }
}
