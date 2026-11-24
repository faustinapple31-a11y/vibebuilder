import { Rng, deriveSeed, type SettlementSpec, type Vec2 } from "@worldforge/core";
import { isWaterAt, progress, type GenContext } from "../context";
import { carveRoad, placeBridges, placeStairs, refreshRoadDistance, routeRoad } from "./roads";

/**
 * A region is peopled in proportion to its size: the spec names the places that matter, the rest of the land gets the
 * villages, hamlets, farms and camps that kind of country has. Same spec, same country.
 */
type Kind = SettlementSpec["type"];

/** Places per square of 1024 studs, beyond the first one (which the spec fills itself). */
const COUNTRY: Record<string, [Kind, number][]> = {
  urban: [["town", 0.5], ["village", 0.3], ["farmstead", 0.3]],
  suburban: [["town", 0.4], ["village", 0.15], ["farmstead", 0.15]],
  rural: [["village", 0.4], ["hamlet", 0.45], ["farmstead", 0.7]],
  agricultural: [["village", 0.35], ["hamlet", 0.4], ["farmstead", 1]],
  historical: [["village", 0.42], ["hamlet", 0.45], ["farmstead", 0.65]],
  fantasy: [["village", 0.42], ["hamlet", 0.4], ["camp", 0.25], ["farmstead", 0.45]],
  coastal: [["town", 0.15], ["village", 0.35], ["hamlet", 0.3]],
  island: [["hamlet", 0.45], ["camp", 0.45], ["village", 0.15]],
  tropical: [["hamlet", 0.45], ["camp", 0.45], ["village", 0.15]],
  military: [["hamlet", 0.5], ["outpost", 0.45], ["farmstead", 0.35], ["village", 0.18]],
  forest: [["hamlet", 0.22], ["camp", 0.45], ["farmstead", 0.15]],
  jungle: [["camp", 0.5], ["hamlet", 0.18]],
  desert: [["camp", 0.4], ["hamlet", 0.22], ["village", 0.1]],
  arctic: [["camp", 0.35], ["outpost", 0.3]],
  alpine: [["hamlet", 0.4], ["farmstead", 0.3], ["village", 0.12]],
  mountain: [["hamlet", 0.3], ["camp", 0.3], ["farmstead", 0.15]],
  industrial: [["outpost", 0.3], ["base", 0.2], ["hamlet", 0.2]],
  scientific: [["outpost", 0.5]],
  space: [["outpost", 0.6]],
  alien: [["outpost", 0.35], ["camp", 0.3]],
  volcanic: [["camp", 0.35], ["outpost", 0.2]],
  post_apocalyptic: [["abandoned_village", 0.35], ["camp", 0.45], ["hamlet", 0.1]],
  wetland: [["hamlet", 0.35], ["camp", 0.35]],
};

const SIZE: Partial<Record<Kind, [number, number]>> = { town: [18, 36], village: [8, 17], hamlet: [4, 7], farmstead: [2, 4], camp: [3, 5], outpost: [4, 7], base: [6, 10], abandoned_village: [6, 12] };

/** The places the country adds to those of the spec. Nothing on a map the size of one settlement. */
export function impliedSettlements(ctx: GenContext): SettlementSpec[] {
  const design = ctx.spec.design;
  if (!design || ctx.islands || ctx.spec.settlements.length === 0) return [];
  if (!["region", "massive", "city", "metropolis", "island", "town", "settlement"].includes(design.scale)) return [];
  const land = ((ctx.worldW * ctx.worldD) / 1024 / 1024) * (ctx.ocean ? 0.55 : 1);
  const beyond = land - (design.scale === "city" || design.scale === "metropolis" ? 1.6 : 1.25);
  if (beyond <= 0.3) return [];
  const mix = COUNTRY[design.environment];
  if (!mix) return [];
  const rng = new Rng(deriveSeed(ctx.seed, "country"));
  const out: SettlementSpec[] = [];
  const named = new Map<Kind, number>();
  for (const s of ctx.spec.settlements.slice(1)) named.set(s.type, (named.get(s.type) ?? 0) + 1);
  const thin = design.density === "wilderness" ? 0.6 : design.density === "very_dense" ? 1.2 : 1;
  for (const [type, per] of mix) {
    const wanted = Math.max(0, Math.round(per * beyond * thin) - (named.get(type) ?? 0));
    const [lo, hi] = SIZE[type] ?? [4, 8];
    for (let k = 0; k < wanted; k++) {
      out.push({ id: `${type}_x${k + 1}`, type, buildings: rng.int(lo, hi), layout: "organic", weathering: type === "abandoned_village" ? 0.9 : 0.4 });
    }
  }
  // the large ones choose their ground first
  return out.sort((a, b) => b.buildings - a.buildings);
}

/** Every place the spec does not route itself joins the network: to the nearest road or place, and some twice (loops). */
export function connectCountry(ctx: GenContext): void {
  const extra = ctx.sites.filter((s) => !ctx.spec.settlements.some((q) => q.id === s.id));
  if (extra.length === 0) return;
  progress(ctx, "roads:country", 0);
  const rng = new Rng(deriveSeed(ctx.seed, "country-roads"));
  const modern = ["asphalt_road", "concrete_road", "neon_road"].includes(ctx.style.kits.road);
  const soft = ["snow_path", "sand_path"].includes(ctx.style.kits.road) ? ctx.style.kits.road : "dirt_path";
  const joined: Vec2[] = ctx.sites.filter((s) => !extra.includes(s)).map((s) => s.center);
  const roadPoints = (): Vec2[] => ctx.paths.filter((p) => p.kind === "road").flatMap((p) => p.points.filter((_, i) => i % 4 === 0) as Vec2[]);
  const open = (id: string, from: Vec2, to: Vec2, width: number, type: string): boolean => {
    const pts = routeRoad(ctx, rng, [from, to], { waterCost: 10 });
    if (!pts || pts.length < 4) return false;
    ctx.paths.push({ id, kind: "road", type, points: pts, width });
    carveRoad(ctx, pts, width, type);
    placeBridges(ctx, id, pts, width);
    placeStairs(ctx, id, pts);
    return true;
  };
  let near = roadPoints();
  const left = [...extra];
  while (left.length) {
    // the one closest to what is already connected
    let best: { s: (typeof left)[number]; at: Vec2; d: number } | null = null;
    for (const s of left) {
      for (const q of [...joined, ...near]) {
        const d = Math.hypot(q[0] - s.center[0], q[1] - s.center[1]);
        if (!best || d < best.d) best = { s, at: q, d };
      }
    }
    if (!best) break;
    const { s, at } = best;
    left.splice(left.indexOf(s), 1);
    const big = s.spec.type === "town" || s.spec.type === "village" || s.spec.type === "base";
    if (best.d > 12) {
      // the nearest point may lie across a cliff: the next ones, well apart, are tried too
      const tries: Vec2[] = [at];
      for (const q of [...joined, ...near].sort((p, r) => Math.hypot(p[0] - s.center[0], p[1] - s.center[1]) - Math.hypot(r[0] - s.center[0], r[1] - s.center[1]))) {
        if (tries.length >= 5) break;
        if (tries.every((t) => Math.hypot(t[0] - q[0], t[1] - q[1]) > 180)) tries.push(q);
      }
      for (const from of tries) if (open(`country_${s.id}`, from, s.center, big ? (modern ? 10 : 7) : modern ? 7 : 5, modern && big ? ctx.style.kits.road : soft)) break;
    }
    joined.push(s.center);
    near = roadPoints();
  }
  // loops: a place with a single way in gets a second one to its second neighbour
  const all = ctx.sites;
  extra.forEach((s, k) => {
    if (k % 2 === 1) return;
    const others = all.filter((q) => q !== s).sort((a, b) => Math.hypot(a.center[0] - s.center[0], a.center[1] - s.center[1]) - Math.hypot(b.center[0] - s.center[0], b.center[1] - s.center[1]));
    const to = others[1];
    if (!to || Math.hypot(to.center[0] - s.center[0], to.center[1] - s.center[1]) > 1100 || isWaterAt(ctx, to.center[0], to.center[1])) return;
    open(`country_loop_${s.id}`, s.center, to.center, 5, soft);
  });
  refreshRoadDistance(ctx);
  progress(ctx, "roads:country", 1);
}
