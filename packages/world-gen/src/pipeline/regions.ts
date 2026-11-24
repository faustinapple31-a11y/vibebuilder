import { Rng, clamp, deriveSeed, smoothstep, type Vec2 } from "@worldforge/core";
import { distanceToEdge, hasLineOfSight, type GenContext } from "../context";
import { Simplex2D } from "../noise";

/**
 * Where the woods are, and where they are not. The forest is drawn as a few masses with ragged outlines, clearings
 * and edges; the rest is meadow with groves and lone trees. Coverage is a target, met exactly, so open space is a
 * decision of the composition and not what is left over.
 */
export type RegionClass = "dense" | "woods" | "edge" | "clearing" | "grove" | "meadow" | "countryside" | "riverside" | "alpine" | "bare";

export interface Regions {
  /** Tree density multiplier at a point (0..1), before biome and spec density. */
  trees(x: number, z: number): number;
  /** Undergrowth multiplier. */
  ground(x: number, z: number): number;
  classAt(x: number, z: number): RegionClass;
  shares: Record<string, number>;
  /** Roads planted with a row of trees on both sides: points and facing. */
  avenues: { at: Vec2; side: 1 | -1 }[];
}

const COVERAGE: Record<string, number> = { none: 0, sparse: 0.16, medium: 0.36, dense: 0.56 };

export function composeRegions(ctx: GenContext): Regions {
  const { spec } = ctx;
  const seed = deriveSeed(ctx.seed, "regions");
  const rng = new Rng(seed);
  const mass = new Simplex2D(seed);
  const rag = new Simplex2D(deriveSeed(seed, "edge"));
  const cell = 8;
  const w = Math.ceil(ctx.worldW / cell);
  const d = Math.ceil(ctx.worldD / cell);
  const size = Math.min(ctx.worldW, ctx.worldD);
  const at = (i: number, j: number): Vec2 => [ctx.origin[0] + (i + 0.5) * cell, ctx.origin[1] + (j + 0.5) * cell];
  const level = spec.biomes.reduce((s, b) => s + (COVERAGE[b.vegetation ?? "medium"] ?? 0.36) * b.weight, 0) / Math.max(0.01, spec.biomes.reduce((s, b) => s + b.weight, 0));
  const biomeLevel = ctx.biomeIds.map((id) => (COVERAGE[spec.biomes.find((b) => b.id === id)?.vegetation ?? "medium"] ?? 0.36) - level);
  const target = clamp(level * (0.62 + spec.vegetation.density * 0.65), 0.03, 0.7);

  // scale of the masses: two or three forests across a map, more of them on a larger one
  const L = Math.min(size * 0.27, 460 + Math.max(0, size - 1700) * 0.14);
  const field = new Float32Array(w * d).fill(-9);
  const [sx, sy, sz] = ctx.spawn.position;
  const look = Math.atan2(ctx.spawn.lookAt[2] - sz, ctx.spawn.lookAt[0] - sx);
  const reach = Math.hypot(ctx.spawn.lookAt[0] - sx, ctx.spawn.lookAt[2] - sz);
  const zoneRadius = new Map(ctx.zones.map((q) => [q.id, q.radius]));
  // rhythm: the roads go through a stretch of wood between two openings, they never run in the open all the way
  const passages: Vec2[] = [];
  for (const road of ctx.paths) {
    if (road.kind !== "road" || road.width < 5 || road.points.length < 30) continue;
    let run = 0;
    let wooded = true;
    for (let k = 1; k < road.points.length; k++) {
      const p = road.points[k]!;
      run += Math.hypot(p[0] - road.points[k - 1]![0], p[1] - road.points[k - 1]![1]);
      if (run > (wooded ? 85 : 120)) {
        run = 0;
        wooded = !wooded;
      }
      if (!wooded || Math.hypot(p[0] - sx, p[1] - sz) < 110) continue;
      if (ctx.sites.some((s) => Math.hypot(p[0] - s.center[0], p[1] - s.center[1]) < s.radius * 1.3)) continue;
      if (k % 4 === 0) passages.push(p as Vec2);
    }
  }
  // the passages each square of ground can feel
  const near = new Map<number, Vec2[]>();
  for (const p of passages) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const k = (Math.floor(p[0] / 64) + a) * 4096 + Math.floor(p[1] / 64) + b;
    const list = near.get(k);
    if (list) list.push(p);
    else near.set(k, [p]);
  }
  for (let j = 0; j < d; j++) {
    for (let i = 0; i < w; i++) {
      const [x, z] = at(i, j);
      const g = ctx.analysis!.at(x, z);
      if (g.cls === "water" || g.cls === "cliff") continue;
      let f = mass.warped(x / L, z / L, 0.9, 3) + rag.fbm(x / 70, z / 70, 3) * 0.26 + rag.noise2(x / 24, z / 24) * 0.07;
      // the border is wooded where it is not already a range, so the world closes on something
      const edge = distanceToEdge(ctx, x, z) + rag.fbm(x / 120 + 9, z / 120, 2) * 40;
      f += (1 - smoothstep(Math.min(size, 1600) * 0.04, Math.min(size, 1600) * 0.14, edge)) * 0.75;
      // slopes keep their woods, valleys and flats were cleared long ago
      f += smoothstep(0.1, 0.35, g.slope) * 0.28 + clamp(g.tpi / 30, -0.2, 0.2);
      f += (ctx.moisture.sample(x, z) - 0.5) * 0.35;
      // the woods stand in the wooded countries
      f += (biomeLevel[ctx.biomes[Math.round((z - ctx.origin[1]) / ctx.cellSize) * ctx.width + Math.round((x - ctx.origin[0]) / ctx.cellSize)] ?? 0] ?? 0) * 1.3;
      // countryside round a settlement: fields and pastures, with a ragged outline
      for (const s of ctx.sites) {
        const flat = Math.hypot(x - s.center[0], z - s.center[1]);
        if (flat > s.radius * 2.6) continue;
        const dist = flat + rag.fbm(x / 90 - 4, z / 90, 2) * s.radius * 0.5;
        f -= 1.5 * (1 - smoothstep(s.radius * 1.05, s.radius * 1.75, dist));
      }
      for (const l of ctx.landmarks) {
        const r = zoneRadius.get(l.id) ?? 30;
        if (Math.abs(x - l.position[0]) > r * 2 || Math.abs(z - l.position[2]) > r * 2) continue;
        f -= 1.1 * (1 - smoothstep(r * 1.15, r * 1.9, Math.hypot(x - l.position[0], z - l.position[2])));
      }
      let pass = 0;
      for (const p of near.get(Math.floor(x / 64) * 4096 + Math.floor(z / 64)) ?? []) {
        const dd = Math.hypot(x - p[0], z - p[1]);
        if (dd < 62) pass = Math.max(pass, 1 - smoothstep(26, 62, dd + rag.noise2(x / 30, z / 30) * 12));
      }
      f += pass * 1.15;
      // what the spawn looks at stays readable: an opening that widens with distance
      const dx = x - sx;
      const dz = z - sz;
      const along = dx * Math.cos(look) + dz * Math.sin(look);
      if (along > 0 && along < reach * 1.05) {
        const off = Math.abs(-dx * Math.sin(look) + dz * Math.cos(look));
        f -= 1.2 * (1 - smoothstep(18 + along * 0.16, 44 + along * 0.3, off));
      }
      field[j * w + i] = f;
    }
  }
  void sy;
  const land = Array.from(field).filter((v) => v > -8).sort((a, b) => b - a);
  const cut = land.length ? land[Math.min(land.length - 1, Math.floor(land.length * target))]! : 0;

  // clearings: a few, inside the masses, irregular, at least one the size of a village square
  const clearings: { c: Vec2; r: number }[] = [];
  const wanted = Math.round(Math.max(2, (ctx.worldW * ctx.worldD) / 130_000) * Math.min(1, target * 2));
  for (let tries = 0; tries < 200 + wanted * 40 && clearings.length < wanted; tries++) {
    const i = rng.int(4, w - 5);
    const j = rng.int(4, d - 5);
    if (field[j * w + i]! < cut + 0.22) continue;
    const c = at(i, j);
    if (clearings.some((q) => Math.hypot(q.c[0] - c[0], q.c[1] - c[1]) < 130)) continue;
    clearings.push({ c, r: rng.float(20, 46) });
  }
  // groves: islands of trees in the open
  const groves: { c: Vec2; r: number }[] = [];
  const grovesWanted = Math.round(Math.max(4, (ctx.worldW * ctx.worldD) / 70_000));
  for (let tries = 0; tries < 300 + grovesWanted * 30 && groves.length < grovesWanted && target > 0.04; tries++) {
    const i = rng.int(3, w - 4);
    const j = rng.int(3, d - 4);
    const f = field[j * w + i]!;
    if (f < -8 || f > cut - 0.15) continue;
    const c = at(i, j);
    if (groves.some((q) => Math.hypot(q.c[0] - c[0], q.c[1] - c[1]) < 80) || ctx.sites.some((s) => Math.hypot(c[0] - s.center[0], c[1] - s.center[1]) < s.radius * 1.1)) continue;
    groves.push({ c, r: rng.float(10, 24) });
  }
  const inBlob = (list: { c: Vec2; r: number }[], x: number, z: number) => {
    let best = 0;
    for (const q of list) {
      const dist = Math.hypot(x - q.c[0], z - q.c[1]);
      if (dist > q.r * 1.7) continue;
      const wob = 1 + rag.fbm(x / 22 + q.c[0], z / 22 + q.c[1], 2) * 0.45;
      best = Math.max(best, 1 - smoothstep(0.7, 1.05, dist / (q.r * wob)));
    }
    return best;
  };
  const fieldAt = (x: number, z: number) => {
    const fx = clamp((x - ctx.origin[0]) / cell - 0.5, 0, w - 1.001);
    const fz = clamp((z - ctx.origin[1]) / cell - 0.5, 0, d - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const i1 = Math.min(w - 1, i + 1);
    const j1 = Math.min(d - 1, j + 1);
    return (field[j * w + i]! * (1 - tx) + field[j * w + i1]! * tx) * (1 - tz) + (field[j1 * w + i]! * (1 - tx) + field[j1 * w + i1]! * tx) * tz;
  };
  const classAt = (x: number, z: number): RegionClass => {
    const g = ctx.analysis!.at(x, z);
    if (g.cls === "water" || g.cls === "cliff") return "bare";
    const f = fieldAt(x, z) - cut;
    if (g.altitude > 0.78 && g.slope > 0.25) return "alpine";
    if (f > 0) {
      if (inBlob(clearings, x, z) > 0.5) return "clearing";
      return f > 0.3 ? "dense" : f > 0.09 ? "woods" : "edge";
    }
    if (inBlob(groves, x, z) > 0.4) return "grove";
    if (ctx.waterDistance.sample(x, z) < 24 && g.slope < 0.4) return "riverside";
    for (const s of ctx.sites) if (Math.hypot(x - s.center[0], z - s.center[1]) < s.radius * 1.7) return "countryside";
    return "meadow";
  };
  const trees = (x: number, z: number): number => {
    switch (classAt(x, z)) {
      case "dense":
        return 1;
      case "woods":
        return 0.78 + rag.noise2(x / 34, z / 34) * 0.2;
      case "edge":
        return 0.4 + rag.noise2(x / 22, z / 22) * 0.3;
      case "grove":
        return 0.85;
      case "riverside":
        return rag.noise2(x / 46 + 3, z / 46) > 0.05 ? 0.5 : 0.03;
      case "alpine":
        return 0.16 + Math.max(0, rag.noise2(x / 60, z / 60)) * 0.4;
      case "clearing":
        return 0.012;
      case "countryside":
        return rag.noise2(x / 30 + 8, z / 30) > 0.62 ? 0.28 : 0.014;
      case "meadow":
        return rag.noise2(x / 38 - 6, z / 38) > 0.66 ? 0.2 : 0.022;
      default:
        return 0;
    }
  };
  const ground = (x: number, z: number): number => {
    switch (classAt(x, z)) {
      case "dense":
      case "woods":
        return 1;
      case "edge":
        return 1.2; // brambles and tall grass where the light gets in
      case "clearing":
        return 0.9;
      case "grove":
      case "riverside":
        return 1.05;
      case "countryside":
      case "meadow": {
        const drift = rag.fbm(x / 48 + 20, z / 48, 2); // flowers and tall grass come in drifts, not everywhere
        return drift > 0.12 ? 0.95 : 0.3;
      }
      case "alpine":
        return 0.25;
      default:
        return 0;
    }
  };

  // an avenue: the main road, just outside the settlement, planted on both sides
  const avenues: Regions["avenues"] = [];
  const site = [...ctx.sites].sort((a, b) => b.radius - a.radius)[0];
  const road = site && ctx.paths.filter((p) => p.kind === "road").sort((a, b) => b.width - a.width || b.points.length - a.points.length)[0];
  if (site && road && target > 0.05 && !ctx.islands) {
    let acc = 0;
    for (let k = 1; k < road.points.length; k++) {
      const a = road.points[k - 1]!;
      const b = road.points[k]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      acc += len;
      const r = Math.hypot(b[0] - site.center[0], b[1] - site.center[1]);
      if (acc < 20 || r < site.radius * 1.12 || r > site.radius * 2.1) continue;
      acc = 0;
      for (const side of [1, -1] as const) {
        const off = road.width / 2 + 7;
        const p: Vec2 = [b[0] + (-(b[1] - a[1]) / len) * off * side, b[1] + ((b[0] - a[0]) / len) * off * side];
        if (hasLineOfSight(ctx, [p[0], ctx.heights.sample(p[0], p[1]) + 4, p[1]], [b[0], ctx.heights.sample(b[0], b[1]) + 4, b[1]])) avenues.push({ at: p, side });
      }
    }
  }
  const counts: Record<string, number> = {};
  let n = 0;
  for (let j = 0; j < d; j += 2) for (let i = 0; i < w; i += 2) {
    const c = classAt(...at(i, j));
    counts[c] = (counts[c] ?? 0) + 1;
    n++;
  }
  const shares = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Math.round((v / n) * 1000) / 1000]));
  return { trees, ground, classAt, shares, avenues };
}
