import { deriveSeed, type BiomeId, type Placement, type PropKit, type Vec2 } from "@worldforge/core";
import { Rng } from "@worldforge/core";
import { PREFAB_INDEX, PROP_KIT_PREFABS } from "@worldforge/prefabs";
import { SpatialHash } from "../grid";
import { biomeAt, distanceToEdge, isWaterAt, layerFor, progress, settleOnGround, slopeAtWorld, type GenContext } from "../context";
import { poissonDisk } from "./vegetation";

/**
 * Generic prop placement for every prop kit (urban, apocalypse, sci-fi, western, candy…).
 * Each prefab is classified by its registry tags into a placement rule:
 *   light / vehicle / market → along roads inside settlements (alternating sides)
 *   wall                     → short runs tangent to houses
 *   water                    → shorelines
 *   floating / ambience      → wilderness, no ground contact
 *   everything else          → near houses (50%), plaza (20%), wilderness in fitting biomes (30%)
 * The legacy sets (village, forest, ruins, camp, graveyard) keep their bespoke code in props.ts.
 */
const LEGACY_SETS = new Set<string>(["village", "forest", "ruins", "camp", "graveyard"]);

/** Biomes where a kit's wilderness props feel at home (others get a low weight). */
const KIT_BIOMES: Partial<Record<PropKit, BiomeId[]>> = {
  apocalypse: ["wasteland", "ruins_field", "urban", "meadow", "forest", "dark_forest"],
  space: ["moon", "rocky", "alien"],
  scifi: ["rocky", "alien", "moon", "meadow"],
  underwater: ["ocean_floor", "beach"],
  arctic: ["snow", "tundra", "pine_forest"],
  tropical: ["beach", "meadow"],
  jungle: ["jungle", "forest", "dark_forest", "swamp"],
  horror: ["dark_forest", "swamp", "ruins_field", "meadow"],
  pirate: ["beach"],
  western: ["desert", "rocky", "meadow"],
  egypt: ["desert", "beach"],
  military: ["meadow", "wasteland", "desert", "pine_forest"],
  industrial: ["urban", "wasteland", "meadow"],
  candy: ["meadow", "forest"],
};

export function placeKitProps(ctx: GenContext, hash: SpatialHash<{ position: [number, number, number]; radius: number }>, counter: { n: number }): void {
  const { spec, style } = ctx;
  const rng = new Rng(deriveSeed(ctx.seed, "kit-props"));
  const density = spec.props.density * (0.5 + style.propDensity);
  const kits = [...new Set([...(spec.props.sets as string[]), ...style.kits.props])].filter((k) => !LEGACY_SETS.has(k)) as PropKit[];
  if (kits.length === 0) return;

  const add = (prefab: string, x: number, z: number, opts: { rotationY?: number; importance?: number; zone?: string; margin?: number; sink?: boolean; scale?: number } = {}): boolean => {
    const variants = ctx.prefabs[prefab];
    if (!variants || variants.length === 0) return false;
    if (distanceToEdge(ctx, x, z) < 6 || isWaterAt(ctx, x, z)) return false;
    if (slopeAtWorld(ctx, x, z) > 0.55) return false;
    const vi = rng.int(0, variants.length - 1);
    const v = variants[vi]!;
    const scale = opts.scale ?? 1;
    if (ctx.roadDistance.sample(x, z) < (v.baseRadius ?? 1) * scale + 1) return false; // never in the carriageway
    const br = Math.max(1.5, (v.baseRadius ?? 0) * scale);
    const at = settleOnGround(ctx, x, z, br, Math.min(4, Math.max(2.2, br)));
    if (!at) return false;
    [x, z] = at;
    if (distanceToEdge(ctx, x, z) < 6 || isWaterAt(ctx, x, z)) return false;
    if (ctx.roadDistance.sample(x, z) < (v.baseRadius ?? 1) * scale + 1) return false;
    const radius = v.footprintRadius * scale * 0.6;
    if (hash.overlaps(x, z, radius, opts.margin ?? 0.5)) return false;
    const y = ctx.heights.sample(x, z) - (opts.sink === false ? 0 : v.sinkDepth * scale);
    const pos: [number, number, number] = [x, y, z];
    hash.insert({ position: pos, radius });
    ctx.placements.push({
      id: `kprop_${counter.n++}`,
      prefab,
      variant: vi,
      category: v.category,
      position: pos,
      rotationY: opts.rotationY ?? rng.float(0, Math.PI * 2),
      scale,
      layer: layerFor(ctx, x, z, false),
      biome: biomeAt(ctx, x, z),
      zone: opts.zone,
      importance: opts.importance ?? 3,
    } satisfies Placement);
    return true;
  };

  const classify = (id: string) => {
    const tags = PREFAB_INDEX[id]?.tags ?? [];
    if (tags.includes("floating") || tags.includes("ambience")) return "wild_air";
    if (tags.includes("water")) return "shore";
    if (tags.includes("wall")) return "wall";
    if (tags.includes("light")) return "roadside";
    if (tags.includes("vehicle") || tags.includes("market")) return "roadside_big";
    if (tags.includes("statue") || tags.includes("tower")) return "plaza";
    return "mixed";
  };

  const houses = ctx.placements.filter((p) => p.category === "building");
  const roads = ctx.paths.filter((p) => p.kind === "road");
  let ki = 0;
  for (const kit of kits) {
    progress(ctx, `props:${kit}`, 0.5 + (0.4 * ki++) / kits.length);
    const ids = (PROP_KIT_PREFABS[kit] ?? []).filter((id) => ctx.prefabs[id]?.length);
    if (ids.length === 0) continue;
    const roadside = ids.filter((id) => classify(id) === "roadside");
    const roadsideBig = ids.filter((id) => classify(id) === "roadside_big");
    const walls = ids.filter((id) => classify(id) === "wall");
    const shore = ids.filter((id) => classify(id) === "shore");
    const air = ids.filter((id) => classify(id) === "wild_air");
    const plaza = ids.filter((id) => classify(id) === "plaza");
    const mixed = ids.filter((id) => classify(id) === "mixed");

    // ---- along roads inside settlements: lights alternate sides every ~28 studs, vehicles/markets sparser
    if (roadside.length + roadsideBig.length > 0) {
      // the village pass already lit its own streets: a second light every 15 studs reads as a
      // mechanical row, so a new one keeps its distance from every light already standing
      const lightSpots: Vec2[] = [];
      for (const p of ctx.placements) {
        if (ctx.prefabs[p.prefab]?.[p.variant]?.tags.includes("light")) lightSpots.push([p.position[0], p.position[2]]);
      }
      const lightNear = (x: number, z: number, r: number) => lightSpots.some((q) => Math.hypot(q[0] - x, q[1] - z) < r);
      let lights = 0;
      let bigs = 0;
      const maxLights = 40;
      const maxBig = 10;
      for (const road of roads) {
        let acc = 0;
        let side = 1;
        let k = 0;
        for (let i = 1; i < road.points.length; i++) {
          const a = road.points[i - 1]!;
          const b = road.points[i]!;
          acc += Math.hypot(b[0] - a[0], b[1] - a[1]);
          const site = ctx.sites.find((s) => Math.hypot(b[0] - s.center[0], b[1] - s.center[1]) < s.radius * 1.2);
          const urbanKit = kit === "urban" || kit === "cyber" || kit === "suburban" || kit === "apocalypse" || kit === "industrial";
          if (!site && !urbanKit) continue;
          if (acc < (site ? 32 : 70) * rng.float(0.85, 1.35)) continue;
          acc = 0;
          side = -side;
          k++;
          const nx = -(b[1] - a[1]);
          const nz = b[0] - a[0];
          const len = Math.hypot(nx, nz) || 1;
          const big = roadsideBig.length > 0 && bigs < maxBig && (roadside.length === 0 ? rng.chance(0.35 * density) : rng.chance(0.18 * density));
          if (!big && (roadside.length === 0 || lights >= maxLights)) continue;
          const list = big ? roadsideBig : roadside;
          if (big) bigs++;
          else lights++;
          const off = road.width / 2 + (big ? 5 : 2.5) + rng.float(-0.6, 1.8);
          const x = b[0] + (nx / len) * off * side;
          const z = b[1] + (nz / len) * off * side;
          if (!big && lightNear(x, z, 26)) continue;
          const heading = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
          const facing = (big ? heading + (side > 0 ? 0 : Math.PI) : heading + Math.PI) + rng.float(-0.12, 0.12);
          if (add(list[rng.int(0, list.length - 1)]!, x, z, { rotationY: facing, importance: big ? 4 : 5, zone: site?.id, sink: true, margin: big ? 1 : 0 }) && !big) lightSpots.push([x, z]);
        }
      }
    }
    // ---- near houses: mixed props + wall runs
    for (const hse of houses) {
      const v = ctx.prefabs[hse.prefab]?.[hse.variant];
      const foot = (v?.footprintRadius ?? 12) * hse.scale;
      const count = Math.round(rng.float(1, 3) * density);
      for (let i = 0; i < count && mixed.length; i++) {
        const a = rng.float(0, Math.PI * 2);
        const r = foot + 3 + rng.float(0, 6);
        add(mixed[rng.int(0, mixed.length - 1)]!, hse.position[0] + Math.cos(a) * r, hse.position[2] + Math.sin(a) * r, { importance: 2.5, zone: hse.zone, margin: 0.3 });
      }
      if (walls.length && rng.chance(0.5 * density)) {
        const a = rng.float(0, Math.PI * 2);
        const r = foot + 9 + rng.float(0, 4);
        const cx = hse.position[0] + Math.cos(a) * r;
        const cz = hse.position[2] + Math.sin(a) * r;
        const dir = a + Math.PI / 2;
        const wall = walls[rng.int(0, walls.length - 1)]!;
        const segLen = (ctx.prefabs[wall]?.[0]?.footprintRadius ?? 6) * 1.9;
        const segs = rng.int(2, 3);
        for (let s = 0; s < segs; s++) add(wall, cx + Math.cos(dir) * (s - (segs - 1) / 2) * segLen, cz + Math.sin(dir) * (s - (segs - 1) / 2) * segLen, { rotationY: -dir, importance: 2, zone: hse.zone, margin: 0 });
      }
    }
    // ---- plaza statues / towers and a few mixed props around settlement centres
    for (const site of ctx.sites) {
      const keep = site.radius * 0.25;
      if (plaza.length && rng.chance(0.8)) {
        const a = rng.float(0, Math.PI * 2);
        add(plaza[rng.int(0, plaza.length - 1)]!, site.center[0] + Math.cos(a) * keep * 0.5, site.center[1] + Math.sin(a) * keep * 0.5, { importance: 4.5, zone: site.id, margin: 1 });
      }
      const n = Math.round(4 * density);
      for (let i = 0; i < n && mixed.length; i++) {
        const a = rng.float(0, Math.PI * 2);
        const r = keep + 4 + rng.float(0, site.radius * 0.5);
        add(mixed[rng.int(0, mixed.length - 1)]!, site.center[0] + Math.cos(a) * r, site.center[1] + Math.sin(a) * r, { importance: 3, zone: site.id, margin: 0.3 });
      }
    }
    // ---- wilderness scatter in fitting biomes
    const wildBiomes = new Set<BiomeId>(KIT_BIOMES[kit] ?? []);
    const wildIds = [...mixed, ...air];
    if (wildIds.length) {
      const cands = poissonDisk(ctx, rng, 34);
      for (const [x, z] of cands) {
        if (distanceToEdge(ctx, x, z) < 30) continue;
        const biome = biomeAt(ctx, x, z);
        const fit = wildBiomes.size === 0 ? 0.35 : wildBiomes.has(biome) ? 1 : 0.15;
        const nearSite = ctx.sites.some((s) => Math.hypot(x - s.center[0], z - s.center[1]) < s.radius * 1.1);
        if (nearSite) continue;
        if (rng.next() > 0.22 * density * fit) continue;
        const id = wildIds[rng.int(0, wildIds.length - 1)]!;
        add(id, x, z, { importance: 2, sink: !air.includes(id), margin: 0.5 });
      }
    }
    // ---- shoreline props (boats, dock posts, anchors…)
    if (shore.length) {
      const cands = poissonDisk(ctx, rng, 26);
      for (const [x, z] of cands) {
        const wd = ctx.waterDistance.sample(x, z);
        if (wd < 3 || wd > 9) continue;
        if (rng.next() > 0.35 * density) continue;
        add(shore[rng.int(0, shore.length - 1)]!, x, z, { importance: 2.5, margin: 0.5 });
      }
    }
  }
}
