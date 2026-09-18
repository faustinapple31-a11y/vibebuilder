import { clamp, deriveSeed, smoothstep, type Placement, type Vec2 } from "@worldforge/core";
import { Rng } from "@worldforge/core";
import { SpatialHash } from "../grid";
import { biomeAt, distanceToEdge, isWaterAt, layerFor, progress, settleOnGround, slopeAtWorld, type GenContext } from "../context";
import { poissonDisk } from "./vegetation";
import { placeKitProps } from "./kitProps";
import { flattenArea } from "./sites";

/**
 * Stage 13: rocks and props.
 * Rocks: Poisson pass biased to slopes, riverbanks and rocky biomes; cliff blocks on steep slopes.
 * Props: contextual sets — village (lanterns along roads, crates/barrels/fences near houses, benches, signposts),
 * forest (logs, stones), ruins (walls/arches near ruin landmarks), path slabs along stone paths.
 */
export function placeRocksAndProps(ctx: GenContext): void {
  const { spec, style } = ctx;
  const rng = new Rng(deriveSeed(ctx.seed, "props"));
  const hash = new SpatialHash<{ position: [number, number, number]; radius: number }>(32);
  for (const o of ctx.occupants) hash.insert({ position: o.position, radius: o.radius });
  // standing vegetation blocks a prop (a cactus or a bamboo clump is as solid as a pine: read the
  // prefab tags rather than guessing from the id, or a desert ruin lands inside a cactus)
  for (const p of ctx.placements) {
    if (p.category !== "vegetation") continue;
    const v = ctx.prefabs[p.prefab]?.[p.variant];
    if (!v || !(v.tags.includes("tree") || v.tags.includes("giant") || v.tags.includes("desert") || v.tags.includes("bamboo") || v.tags.includes("coral"))) continue;
    hash.insert({ position: p.position, radius: Math.max(2.5, (v.baseRadius ?? 0) * 1.6) * p.scale });
  }
  let n = 0;
  const add = (prefab: string, x: number, z: number, opts: { scale?: number; rotationY?: number; importance?: number; zone?: string; category?: Placement["category"]; margin?: number; sink?: boolean; onWater?: boolean }): boolean => {
    const variants = ctx.prefabs[prefab];
    if (!variants || variants.length === 0) return false;
    if (!inside(ctx, x, z) || (!opts.onWater && isWaterAt(ctx, x, z))) return false;
    if (opts.onWater && !isWaterAt(ctx, x, z)) return false;
    const vi = rng.int(0, variants.length - 1);
    const v = variants[vi]!;
    const scale = opts.scale ?? 1;
    // step off a terrace lip / cliff edge so the base is not left hanging in the air
    if (!opts.onWater) {
      const br = Math.max(1.5, (v.baseRadius ?? 0) * scale);
      const at = settleOnGround(ctx, x, z, br, Math.min(4, Math.max(2.2, br)));
      if (!at) return false;
      [x, z] = at;
      if (!inside(ctx, x, z) || isWaterAt(ctx, x, z)) return false;
    }
    const radius = v.footprintRadius * scale * 0.6;
    if (hash.overlaps(x, z, radius, opts.margin ?? 0.5)) return false;
    const y = opts.onWater ? ctx.water.sample(x, z) : ctx.heights.sample(x, z) - (opts.sink === false ? 0 : v.sinkDepth * scale);
    const pos: [number, number, number] = [x, y, z];
    hash.insert({ position: pos, radius });
    ctx.placements.push({
      id: `prop_${n++}`,
      prefab,
      variant: vi,
      category: opts.category ?? v.category,
      position: pos,
      rotationY: opts.rotationY ?? rng.float(0, Math.PI * 2),
      scale,
      layer: layerFor(ctx, x, z, false),
      biome: biomeAt(ctx, x, z),
      zone: opts.zone,
      importance: opts.importance ?? 3,
    });
    return true;
  };

  // ---- rocks
  progress(ctx, "props:rocks", 0);
  const rockCandidates = poissonDisk(ctx, rng, 16);
  for (const [x, z] of rockCandidates) {
    if (distanceToEdge(ctx, x, z) < 8) continue;
    const biome = biomeAt(ctx, x, z);
    const s = slopeAtWorld(ctx, x, z);
    const wd = ctx.waterDistance.sample(x, z);
    const rd = ctx.roadDistance.sample(x, z);
    if (rd < 3) continue;
    let d = 0.16;
    if (biome === "rocky" || biome === "highlands") d += 0.35;
    if (biome === "desert" || biome === "snow") d += 0.15;
    d += smoothstep(0.15, 0.5, s) * 0.35;
    if (wd < 18) d += 0.25;
    d *= 0.6 + style.rock.clusterChance * 0.6;
    if (ctx.islands) {
      // mesa lawns: a few small stones, never on the walls
      if (s > 0.3 || rng.next() > d * 0.35) continue;
      add(rng.chance(0.6) ? "stone" : "boulder", x, z, { scale: rng.float(0.5, 0.9), importance: 3 });
      continue;
    }
    if (ctx.terrainMode === "parts" && s > 0.3) continue; // terrace edges: the walls are the cliffs
    if (s > 0.8) {
      if (rng.chance(0.55)) add("cliff_block", x, z, { scale: rng.float(0.8, 1.6), importance: 5 });
      continue;
    }
    if (rng.next() > d) continue;
    // glowing crystal outcrops in the mystical biomes (style glow drives the chance)
    const mystical = biome === "mushroom_grove" || biome === "dark_forest" || biome === "swamp" || biome === "rocky" || biome === "highlands";
    if (style.mushroom.glow > 0.15 && mystical && rng.chance(0.14 + style.mushroom.glow * 0.2)) {
      add("crystal_cluster", x, z, { scale: rng.float(0.8, 1.6), importance: 5.5 });
      continue;
    }
    const cluster = rng.chance(style.rock.clusterChance * 0.5);
    add(cluster ? "rock_cluster" : "boulder", x, z, { scale: rng.float(0.7, 1.5), importance: 4 + s });
  }

  // ---- props per set
  progress(ctx, "props:sets", 0.3);
  const sets = new Set(spec.props.sets);
  const density = spec.props.density * (0.5 + style.propDensity);

  if (sets.has("village")) {
    for (const site of ctx.sites) {
      // lanterns along roads inside the settlement
      for (const road of ctx.paths.filter((p) => p.kind === "road")) {
        let acc = 0;
        let side = 1;
        for (let i = 1; i < road.points.length; i++) {
          const a = road.points[i - 1]!;
          const b = road.points[i]!;
          acc += Math.hypot(b[0] - a[0], b[1] - a[1]);
          const inSite = Math.hypot(b[0] - site.center[0], b[1] - site.center[1]) < site.radius * 1.15;
          if (!inSite || acc < 30) continue;
          acc = 0;
          side = -side;
          const nx = -(b[1] - a[1]);
          const nz = b[0] - a[0];
          const len = Math.hypot(nx, nz) || 1;
          const off = road.width / 2 + 2.5;
          const x = b[0] + (nx / len) * off * side;
          const z = b[1] + (nz / len) * off * side;
          add("lantern_post", x, z, { rotationY: Math.atan2(-(z - b[1]), x - b[0]) + Math.PI, importance: 5, zone: site.id, sink: true });
        }
      }
      // crates / barrels / fences near houses
      const houses = ctx.placements.filter((p) => p.zone === site.id && (p.category === "building" || p.prefab === "ruin_wall"));
      for (const hse of houses) {
        const foot = (ctx.prefabs[hse.prefab]?.[hse.variant]?.footprintRadius ?? 12) * hse.scale;
        const count = Math.round(rng.float(1, 4) * density);
        for (let i = 0; i < count; i++) {
          const a = rng.float(0, Math.PI * 2);
          const r = foot + 3.5 + rng.float(0, 5);
          const x = hse.position[0] + Math.cos(a) * r;
          const z = hse.position[2] + Math.sin(a) * r;
          add(rng.chance(0.5) ? "crate" : "barrel", x, z, { importance: 2, zone: site.id, margin: 0.2 });
        }
        if (rng.chance(0.7 * density)) {
          // fence line tangent to the house
          const a = rng.float(0, Math.PI * 2);
          const r = foot + 8 + rng.float(0, 5);
          const cx = hse.position[0] + Math.cos(a) * r;
          const cz = hse.position[2] + Math.sin(a) * r;
          const segs = rng.int(2, 4);
          const dir = a + Math.PI / 2;
          for (let s = 0; s < segs; s++) {
            const x = cx + Math.cos(dir) * (s - (segs - 1) / 2) * 8.5;
            const z = cz + Math.sin(dir) * (s - (segs - 1) / 2) * 8.5;
            add("fence", x, z, { rotationY: -dir, importance: 2, zone: site.id, margin: 0 });
          }
        }
      }
      // benches near the plaza, signpost at the plaza edge, cart wheel
      const benches = Math.round(3 * density);
      const plazaKeep = site.radius * 0.25;
      for (let i = 0; i < benches; i++) {
        const a = rng.float(0, Math.PI * 2);
        const r = plazaKeep + 5 + rng.float(0, 6);
        add("bench", site.center[0] + Math.cos(a) * r, site.center[1] + Math.sin(a) * r, { rotationY: -a + Math.PI / 2, importance: 3, zone: site.id, margin: 0 });
      }
      const sa = rng.float(0, Math.PI * 2);
      add("signpost", site.center[0] + Math.cos(sa) * (site.radius * 0.55), site.center[1] + Math.sin(sa) * (site.radius * 0.55), { importance: 3, zone: site.id });
      if (rng.chance(0.6)) {
        const a = rng.float(0, Math.PI * 2);
        add("cart_wheel", site.center[0] + Math.cos(a) * site.radius * 0.5, site.center[1] + Math.sin(a) * site.radius * 0.5, { importance: 1, zone: site.id });
      }
      // a cart and a few hay bales give the village a worked, lived-in look
      if (rng.chance(0.8)) {
        const a = rng.float(0, Math.PI * 2);
        add("cart", site.center[0] + Math.cos(a) * site.radius * 0.45, site.center[1] + Math.sin(a) * site.radius * 0.45, { importance: 3.5, zone: site.id, margin: 1 });
      }
      const bales = Math.round(rng.float(2, 5) * density);
      for (let i = 0; i < bales; i++) {
        const a = rng.float(0, Math.PI * 2);
        const r = site.radius * rng.float(0.5, 0.95);
        add("hay_bale", site.center[0] + Math.cos(a) * r, site.center[1] + Math.sin(a) * r, { importance: 1.5, zone: site.id, margin: 0.5 });
      }
    }
    // signposts at road junctions/ends
    for (const road of ctx.paths.filter((p) => p.kind === "road")) {
      const p = road.points[Math.min(road.points.length - 1, 4)]!;
      add("signpost", p[0] + 5, p[1] + 3, { importance: 3 });
    }
  }

  if (sets.has("forest")) {
    const cands = poissonDisk(ctx, rng, 28);
    for (const [x, z] of cands) {
      const biome = biomeAt(ctx, x, z);
      const forest = biome === "dark_forest" || biome === "forest" || biome === "pine_forest" || biome === "swamp" || biome === "mushroom_grove";
      if (!forest) continue;
      if (rng.next() > density * 0.5) continue;
      if (ctx.roadDistance.sample(x, z) < 4) continue;
      add("log", x, z, { importance: 2 });
    }
    // small stones along the paths (foreground)
    for (const road of ctx.paths.filter((p) => p.kind === "road")) {
      for (let i = 0; i < road.points.length; i += 3) {
        if (rng.next() > density * 0.5) continue;
        const p = road.points[i]!;
        const a = rng.float(0, Math.PI * 2);
        const r = road.width / 2 + rng.float(1, 6);
        add("stone", p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r, { importance: 1.5, margin: 0 });
      }
    }
  }

  // stone path slabs along stone paths (sparse, foreground detail)
  for (const road of ctx.paths.filter((p) => p.kind === "road" && (p.type === "stone_path" || p.type === "cobblestone_road"))) {
    for (let i = 0; i < road.points.length; i += 3) {
      if (rng.next() > 0.55) continue;
      const p = road.points[i]!;
      const j = rng.float(-road.width * 0.3, road.width * 0.3);
      add("stone_path_slab", p[0] + j, p[1] + rng.float(-1.5, 1.5), { importance: 1.2, margin: 0, category: "path", sink: true });
    }
  }

  if (sets.has("ruins")) {
    const ruinLms = ctx.landmarks.filter((l) => l.type === "ruins" || l.type === "temple" || l.type === "castle" || l.type === "tower");
    const centers: Vec2[] = ruinLms.map((l) => [l.position[0], l.position[2]]);
    // also ruins_field biome patches
    const cands = poissonDisk(ctx, rng, 40);
    for (const [x, z] of cands) {
      const biome = biomeAt(ctx, x, z);
      const nearRuin = centers.some((c) => Math.hypot(c[0] - x, c[1] - z) < 110);
      if (!nearRuin && biome !== "ruins_field") continue;
      if (rng.next() > density * 0.6) continue;
      const prefab = rng.chance(0.65) ? "ruin_wall" : "ruin_arch";
      if (slopeAtWorld(ctx, x, z) > 0.45) continue;
      const ok = add(prefab, x, z, { importance: 5, category: "building", scale: rng.float(0.8, 1.2) });
      if (ok) {
        const last = ctx.placements[ctx.placements.length - 1]!;
        const foot = ctx.prefabs[prefab]![last.variant]!.footprintRadius * last.scale;
        last.position[1] = flattenArea(ctx, [x, z], foot * 1.1, 0.85) - ctx.prefabs[prefab]![last.variant]!.sinkDepth * last.scale;
        ctx.occupants.push({ position: last.position, radius: foot, kind: "building" });
        if (style.mushroom.glow > 0.2 && rng.chance(0.35)) {
          const a = rng.float(0, Math.PI * 2);
          add("wisp", x + Math.cos(a) * (foot + 3), z + Math.sin(a) * (foot + 3), { importance: 2.5, margin: 0 });
        }
      }
    }
    // wisps drifting around the ruin landmarks themselves
    if (style.mushroom.glow > 0.2) {
      for (const c of centers) {
        const n = rng.int(2, 4);
        for (let i = 0; i < n; i++) {
          const a = rng.float(0, Math.PI * 2);
          const r = rng.float(22, 40);
          add("wisp", c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, { importance: 2.5, margin: 0 });
        }
      }
    }
  }

  if (sets.has("camp")) {
    const cands = poissonDisk(ctx, rng, 120);
    let camps = 0;
    for (const [x, z] of cands) {
      if (camps >= 3) break;
      if (slopeAtWorld(ctx, x, z) > 0.2) continue;
      if (ctx.roadDistance.sample(x, z) > 40 || ctx.roadDistance.sample(x, z) < 8) continue;
      if (!add("campfire", x, z, { importance: 5, margin: 3 })) continue;
      camps++;
      const tents = rng.int(1, 2);
      for (let i = 0; i < tents; i++) {
        const a = rng.float(0, Math.PI * 2) + i * 2.2;
        // the tent opening (+X) faces the fire
        add("tent", x + Math.cos(a) * 13, z + Math.sin(a) * 13, { rotationY: -a + Math.PI, importance: 4, margin: 1 });
      }
      for (let i = 0; i < 3; i++) {
        const a = rng.float(0, Math.PI * 2);
        add(rng.chance(0.5) ? "crate" : "log", x + Math.cos(a) * 7, z + Math.sin(a) * 7, { importance: 2 });
      }
    }
  }

  if (sets.has("graveyard")) {
    const site = ctx.sites[0];
    const c: Vec2 = site ? [site.center[0] + site.radius * 1.3, site.center[1]] : [ctx.origin[0] + ctx.worldW * 0.6, ctx.origin[1] + ctx.worldD * 0.6];
    for (let i = 0; i < 12; i++) {
      add("gravestone", c[0] + rng.float(-20, 20), c[1] + rng.float(-16, 16), { importance: 3 });
    }
    if (style.mushroom.glow > 0.15) {
      for (let i = 0; i < 3; i++) add("wisp", c[0] + rng.float(-18, 18), c[1] + rng.float(-14, 14), { importance: 2.5, margin: 0 });
    }
  }
  // ---- waterside: reeds on the banks, lily pads on still shallow water
  progress(ctx, "props:waterside", 0.8);
  {
    const cands = poissonDisk(ctx, rng, 7);
    for (const [x, z] of cands) {
      if (distanceToEdge(ctx, x, z) < 40) continue;
      const wd = ctx.waterDistance.sample(x, z);
      const biome = biomeAt(ctx, x, z);
      const sandy = biome === "desert" || biome === "beach";
      // freshwater only: no lily pads or reeds on the sea (island / coast features)
      const sea = ctx.ocean ? ctx.ocean.sample(x, z) > 0.05 || (ctx.shore?.sample(x, z) ?? -1) > -0.12 : false;
      if (isWaterAt(ctx, x, z)) {
        // lily pads: lakes/pools (slow water) close to the shore, not on the river's main current
        const depth = ctx.water.sample(x, z) - ctx.heights.sample(x, z);
        if (depth > 0.6 && depth < 4.5 && wd < 0.5 && !sandy && !sea && rng.chance(0.22)) {
          add("lily_pad", x, z, { importance: 3.2, margin: 0, onWater: true, scale: rng.float(0.8, 1.3) });
        }
        continue;
      }
      if (wd < 6 && !sandy && !sea && slopeAtWorld(ctx, x, z) < 0.5 && ctx.roadDistance.sample(x, z) > 4 && rng.chance(0.55)) {
        add("reeds", x, z, { importance: 3.2, margin: 0, scale: rng.float(0.8, 1.4) });
      }
    }
  }

  // ---- waterfalls: where the river drops steeply between two polyline points.
  // Roblox water renders the carved bed as a smooth slope, so the sheet only reads when the bed has a real
  // ledge; until the water stage carves stepped drops this stays opt-in (spec.props.sets includes "waterfalls").
  progress(ctx, "props:waterfalls", 0.82);
  for (const river of (sets.has("waterfalls" as never) ? ctx.paths : []).filter((p) => p.kind === "river")) {
    let lastFall: Vec2 | null = null;
    for (let i = 1; i < river.points.length - 1; i++) {
      const a = river.points[i - 1]!;
      const c = river.points[i + 1]!;
      const wa = ctx.water.sample(a[0], a[1]);
      const wc = ctx.water.sample(c[0], c[1]);
      if (Number.isNaN(wa) || Number.isNaN(wc)) continue;
      const run = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const drop = wa - wc;
      if (drop < 5 || run < 1 || drop / run < 0.35) continue;
      const p = river.points[i]!;
      // inside the playable area only (the river leaving the map is not a waterfall), and the bed must drop too
      if (distanceToEdge(ctx, p[0], p[1]) < 48) continue;
      if (ctx.heights.sample(a[0], a[1]) - ctx.heights.sample(c[0], c[1]) < 4) continue;
      if (lastFall && Math.hypot(p[0] - lastFall[0], p[1] - lastFall[1]) < 60) continue;
      // downstream direction (+Z of the prefab must point downstream)
      const dir = Math.atan2(c[0] - a[0], c[1] - a[1]);
      const variants = ctx.prefabs["waterfall"];
      if (!variants) break;
      const vi = rng.int(0, variants.length - 1);
      const scale = Math.max(0.6, Math.min(1.6, drop / 12));
      ctx.placements.push({
        id: `fall_${river.id}_${i}`,
        prefab: "waterfall",
        variant: vi,
        category: "prop",
        position: [p[0], wc, p[1]],
        rotationY: dir,
        scale,
        layer: layerFor(ctx, p[0], p[1], false),
        importance: 6,
      });
      lastFall = p;
      i += 4;
    }
  }

  // ---- flower beds in meadows / clearings (undergrowth pass is grass-heavy, beds add colour at a distance)
  {
    const cands = poissonDisk(ctx, rng, 30);
    for (const [x, z] of cands) {
      const biome = biomeAt(ctx, x, z);
      if (biome !== "meadow" && biome !== "highlands" && biome !== "forest") continue;
      if (isWaterAt(ctx, x, z) || slopeAtWorld(ctx, x, z) > 0.35 || ctx.roadDistance.sample(x, z) < 3) continue;
      if (rng.next() > (biome === "meadow" ? 0.5 : 0.18) * (0.5 + style.vegetationDensity)) continue;
      add("flower_patch", x, z, { importance: 2.4, margin: 0, scale: rng.float(0.8, 1.3) });
    }
  }

  // ---- village extras: dry-stone boundary walls, market stalls, lantern strings across the street
  if (sets.has("village")) {
    for (const site of ctx.sites) {
      const inhabited = site.spec.type === "village" || site.spec.type === "hamlet" || site.spec.type === "outpost";
      // boundary wall ring with gaps at the roads and a few missing segments
      const ringR = site.radius * 0.92;
      const segLen = 11;
      const segs = Math.floor((2 * Math.PI * ringR) / segLen);
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        const x = site.center[0] + Math.cos(a) * ringR;
        const z = site.center[1] + Math.sin(a) * ringR;
        if (ctx.roadDistance.sample(x, z) < 9 || ctx.waterDistance.sample(x, z) < 6 || slopeAtWorld(ctx, x, z) > 0.45) continue;
        if (rng.chance(inhabited ? 0.18 : 0.45)) continue;
        add("stone_wall", x, z, { rotationY: -a + Math.PI / 2, importance: 2.5, zone: site.id, margin: 0, sink: true });
      }
      // vegetable plots beside the houses of an inhabited settlement
      if (inhabited) {
        const houses = ctx.placements.filter((p) => p.zone === site.id && p.prefab === "cottage");
        for (const hse of houses) {
          if (!rng.chance(0.55)) continue;
          const foot = (ctx.prefabs.cottage?.[hse.variant]?.footprintRadius ?? 12) * hse.scale;
          const a = hse.rotationY + rng.pick([Math.PI / 2, -Math.PI / 2]) + rng.float(-0.3, 0.3);
          const r = foot + 9;
          const x = hse.position[0] + Math.sin(a) * r;
          const z = hse.position[2] + Math.cos(a) * r;
          if (slopeAtWorld(ctx, x, z) > 0.2) continue;
          add("crop_plot", x, z, { rotationY: hse.rotationY, importance: 3, zone: site.id, margin: 0.5 });
        }
      }
      // market stalls at the plaza edge, facing the centre
      const stalls = inhabited ? rng.int(1, 3) : rng.chance(0.4) ? 1 : 0;
      for (let i = 0; i < stalls; i++) {
        const a = rng.float(0, Math.PI * 2);
        const r = site.radius * 0.24 + 8;
        const x = site.center[0] + Math.cos(a) * r;
        const z = site.center[1] + Math.sin(a) * r;
        // the stall's opening (-Z) must face the plaza centre
        add("market_stall", x, z, { rotationY: Math.atan2(-(site.center[0] - x), -(site.center[1] - z)) + Math.PI, importance: 4, zone: site.id, margin: 1 });
      }
      // lantern strings across the street where roads enter the village
      let strings = 0;
      for (const road of ctx.paths.filter((p) => p.kind === "road")) {
        for (let i = 2; i < road.points.length - 2 && strings < 3; i += 2) {
          const p = road.points[i]!;
          const d = Math.hypot(p[0] - site.center[0], p[1] - site.center[1]);
          if (d > site.radius * 0.7 || d < site.radius * 0.3) continue;
          const a = road.points[i + 1]!;
          const dir = Math.atan2(a[1] - p[1], a[0] - p[0]);
          const scale = Math.min(1.4, Math.max(0.8, (road.width + 6) / 14));
          if (add("lantern_string", p[0], p[1], { rotationY: -dir, scale, importance: 4.5, zone: site.id, margin: 0, sink: true })) strings++;
          i += 6;
        }
      }
    }
  }

  // ---- ambience: lantern-lit main road at night, firefly swarms, ground mist
  progress(ctx, "props:ambience", 0.85);
  const night = spec.lighting.timeOfDay < 6 || spec.lighting.timeOfDay > 18.5;
  const glow = style.mushroom.glow;
  if (night && sets.has("village")) {
    // lantern posts every ~55 studs along the roads outside settlements: the path reads at night
    for (const road of ctx.paths.filter((p) => p.kind === "road")) {
      let acc = 40;
      let side = 1;
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1]!;
        const b = road.points[i]!;
        acc += Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (acc < 55) continue;
        const inSite = ctx.sites.some((s) => Math.hypot(b[0] - s.center[0], b[1] - s.center[1]) < s.radius * 1.15);
        if (inSite) continue;
        acc = 0;
        side = -side;
        const nx = -(b[1] - a[1]);
        const nz = b[0] - a[0];
        const len = Math.hypot(nx, nz) || 1;
        const off = road.width / 2 + 2;
        const x = b[0] + (nx / len) * off * side;
        const z = b[1] + (nz / len) * off * side;
        if (slopeAtWorld(ctx, x, z) > 0.6) continue;
        add("lantern_post", x, z, { rotationY: Math.atan2(-(z - b[1]), x - b[0]) + Math.PI, importance: 4.5, margin: 0, sink: true });
      }
    }
  }
  if (glow > 0.2 || night) {
    const cands = poissonDisk(ctx, rng, 46);
    for (const [x, z] of cands) {
      if (distanceToEdge(ctx, x, z) < 60) continue;
      const biome = biomeAt(ctx, x, z);
      const wd = ctx.waterDistance.sample(x, z);
      const wet = biome === "swamp" || biome === "mushroom_grove" || wd < 22;
      const forest = biome === "dark_forest" || biome === "forest" || biome === "pine_forest" || biome === "mushroom_grove" || biome === "swamp" || biome === "meadow";
      if (isWaterAt(ctx, x, z)) continue;
      const nearSpawn = Math.hypot(x - ctx.spawn.position[0], z - ctx.spawn.position[2]) < 90;
      if (forest && rng.chance((glow > 0.2 ? 0.28 : 0.12) + (nearSpawn ? 0.3 : 0))) add("firefly_swarm", x, z, { importance: 1.8, margin: 0, sink: false });
      else if (wet && spec.atmosphere.fogDensity > 0.25 && rng.chance(0.35)) add("mist_patch", x, z, { importance: 1.6, margin: 0, sink: false });
    }
  }
  // ---- every other prop kit (urban, apocalypse, sci-fi, western, candy…) through the generic rules
  placeKitProps(ctx, hash, { n });
  progress(ctx, "props:done", 1);
  void clamp;
}

function inside(ctx: GenContext, x: number, z: number): boolean {
  return x > ctx.origin[0] + 4 && x < ctx.origin[0] + ctx.worldW - 4 && z > ctx.origin[1] + 4 && z < ctx.origin[1] + ctx.worldD - 4;
}
