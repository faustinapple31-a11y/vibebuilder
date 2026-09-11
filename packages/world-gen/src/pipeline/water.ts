import { chaikin, deriveSeed, resamplePolyline, smoothstep, type Vec2 } from "@worldforge/core";
import { Rng } from "@worldforge/core";
import { Simplex2D } from "../noise";
import { astar } from "../pathfinding";
import { distanceToPolylinesGrid } from "../grid";
import { edgeToWorld, progress, type GenContext } from "../context";

/**
 * Stage 7: rivers and lakes.
 * A river is a monotonically descending path found by A* (uphill is expensive),
 * carved into the heightmap with a bed + soft banks, and filled with water voxels.
 */
export function generateWater(ctx: GenContext): void {
  const { spec } = ctx;
  const rng = new Rng(deriveSeed(ctx.seed, "water"));
  const meanderNoise = new Simplex2D(deriveSeed(ctx.seed, "meander"));
  ctx.water.data.fill(NaN);
  const reuse = !ctx.regenerate.has("water") && ctx.previous;

  let idx = 0;
  for (const river of spec.rivers) {
    progress(ctx, `water:river:${river.id}`, idx / Math.max(1, spec.rivers.length));
    const prev = reuse ? ctx.previous!.paths.find((p) => p.kind === "river" && p.id === river.id) : undefined;
    if (prev) carveRiverFromPolyline(ctx, river, prev.points);
    else carveRiver(ctx, river, rng, meanderNoise);
    idx++;
  }
  for (const lake of spec.lakes) {
    carveLake(ctx, lake);
  }

  // distance-to-water grid for biome moisture and placement rules
  const waterLines = ctx.paths.filter((p) => p.kind === "river").map((p) => ({ points: p.points, width: p.width }));
  const lakeCircles = spec.lakes.map((l) => ({ points: circlePoints(normToWorldLocal(ctx, l.center), l.radius, 24), width: 2 }));
  ctx.waterDistance = distanceToPolylinesGrid(ctx.heights, [...waterLines, ...lakeCircles], 400);
  // lakes: inside radius → negative distance
  for (const l of spec.lakes) {
    const c = normToWorldLocal(ctx, l.center);
    ctx.waterDistance.map((x, z, v) => {
      const [wx, wz] = ctx.heights.toWorld(x, z);
      const d = Math.hypot(wx - c[0], wz - c[1]) - l.radius;
      return Math.min(v, d);
    });
  }
  progress(ctx, "water:done", 1);
}

function normToWorldLocal(ctx: GenContext, n: Vec2): Vec2 {
  return [ctx.origin[0] + n[0] * ctx.worldW, ctx.origin[1] + n[1] * ctx.worldD];
}

function circlePoints(c: Vec2, r: number, n: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
  }
  return out;
}

function carveRiver(ctx: GenContext, river: GenContext["spec"]["rivers"][number], rng: Rng, meander: Simplex2D): void {
  const h = ctx.heights;
  const { width, depth, cellSize } = ctx;
  // source: highest cell near the `from` edge band (search a window around the edge point)
  const from = edgeToWorld(ctx, river.from, 0.06);
  const to = edgeToWorld(ctx, river.to, 0.03);
  const src = pickCell(ctx, from, 0.22, (x, z) => h.get(x, z) + rng.next() * 6, true);
  const dst = pickCell(ctx, to, 0.22, (x, z) => -h.get(x, z) + rng.next() * 6, true);

  const uphillK = 22;
  const meanderK = 3.5 * river.meander;
  const path = astar(src, dst, {
    width,
    depth,
    cost: (ax, az, bx, bz, dist) => {
      const ha = h.get(ax, az);
      const hb = h.get(bx, bz);
      const up = Math.max(0, hb - ha);
      const down = Math.max(0, ha - hb);
      const m = (meander.noise2(bx / 9, bz / 9) + 1) * 0.5 * meanderK;
      return dist * (1 + m) + up * uphillK - Math.min(down, 3) * 0.15;
    },
    heuristicWeight: 0.9,
  });
  if (!path) return;

  // world polyline, smoothed and resampled
  const worldPts = path.map(([cx, cz]) => h.toWorld(cx, cz));
  const smooth = resamplePolyline(chaikin(worldPts, 2), cellSize);
  carveRiverFromPolyline(ctx, river, smooth);
}

/** Carve a river bed + banks + water along an existing polyline (used for locked water layers too). */
export function carveRiverFromPolyline(ctx: GenContext, river: GenContext["spec"]["rivers"][number], smooth: Vec2[]): void {
  const h = ctx.heights;
  const { width, depth } = ctx;
  // monotonic water surface along the path
  const surface: number[] = [];
  let cur = h.sample(smooth[0]![0], smooth[0]![1]) - 1;
  for (const p of smooth) {
    const t = h.sample(p[0], p[1]);
    cur = Math.min(cur, t - 0.5);
    surface.push(cur);
  }
  // smooth the surface profile so it does not staircase
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < surface.length - 1; i++) {
      surface[i] = Math.min(surface[i - 1]!, (surface[i - 1]! + surface[i]! + surface[i + 1]!) / 3);
    }
  }

  const halfW = river.width / 2;
  const bankW = river.width * 0.9;
  const reach = halfW + bankW;
  // rasterize: for each cell near the polyline compute nearest segment
  const bed = new Float32Array(width * depth).fill(NaN);
  const wl = new Float32Array(width * depth).fill(NaN);
  const dist = new Float32Array(width * depth).fill(Infinity);
  for (let i = 1; i < smooth.length; i++) {
    const a = smooth[i - 1]!;
    const b = smooth[i]!;
    const sa = surface[i - 1]!;
    const sb = surface[i]!;
    const [cx0, cz0] = h.toCell(Math.min(a[0], b[0]) - reach, Math.min(a[1], b[1]) - reach);
    const [cx1, cz1] = h.toCell(Math.max(a[0], b[0]) + reach, Math.max(a[1], b[1]) + reach);
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const ab2 = abx * abx + abz * abz || 1e-9;
    for (let z = Math.max(0, Math.floor(cz0)); z <= Math.min(depth - 1, Math.ceil(cz1)); z++) {
      for (let x = Math.max(0, Math.floor(cx0)); x <= Math.min(width - 1, Math.ceil(cx1)); x++) {
        const [wx, wz] = h.toWorld(x, z);
        const t = Math.max(0, Math.min(1, ((wx - a[0]) * abx + (wz - a[1]) * abz) / ab2));
        const d = Math.hypot(wx - (a[0] + abx * t), wz - (a[1] + abz * t));
        const k = z * width + x;
        if (d < dist[k]!) {
          dist[k] = d;
          const s = sa + (sb - sa) * t;
          wl[k] = s;
          bed[k] = s - river.depth;
        }
      }
    }
  }
  for (let k = 0; k < bed.length; k++) {
    const d = dist[k]!;
    if (!Number.isFinite(d) || d > reach) continue;
    const cur = h.data[k]!;
    const s = wl[k]!;
    if (d <= halfW) {
      // bed profile: parabolic
      const prof = 1 - Math.pow(d / halfW, 2) * 0.55;
      const target = s - river.depth * prof;
      h.data[k] = Math.min(cur, target);
      ctx.water.data[k] = s;
    } else {
      // banks: blend toward the surface height + slight rise
      const t = smoothstep(halfW, halfW + bankW, d);
      const bankTarget = s + 0.8 + (cur - s) * t;
      h.data[k] = Math.min(cur, Math.max(bankTarget, s + 0.3));
      if (h.data[k]! < s) ctx.water.data[k] = s;
    }
  }
  ctx.paths.push({ id: river.id, kind: "river", type: "river", points: smooth, width: river.width });
}

function carveLake(ctx: GenContext, lake: GenContext["spec"]["lakes"][number]): void {
  const h = ctx.heights;
  const c = normToWorldLocal(ctx, lake.center);
  const r = lake.radius;
  // rim height = min terrain on the rim ring
  let rim = Infinity;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    rim = Math.min(rim, h.sample(c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r));
  }
  const level = rim - 1.2;
  const depth = Math.max(6, r * 0.18);
  h.map((x, z, v, i) => {
    const [wx, wz] = h.toWorld(x, z);
    const d = Math.hypot(wx - c[0], wz - c[1]);
    if (d > r * 1.35) return v;
    if (d <= r) {
      const prof = 1 - Math.pow(d / r, 2);
      const target = level - depth * prof - 0.5;
      const nv = Math.min(v, target);
      ctx.water.data[i] = level;
      return nv;
    }
    const t = smoothstep(r, r * 1.35, d);
    const nv = Math.min(v, level + 0.6 + (v - level) * t);
    if (nv < level) ctx.water.data[i] = level;
    return nv;
  });
}

/** Pick the best cell in a window around a world point (window = fraction of the world size). */
function pickCell(ctx: GenContext, around: Vec2, windowFrac: number, score: (x: number, z: number) => number, _max: boolean): Vec2 {
  const h = ctx.heights;
  const [cx, cz] = h.toCell(around[0], around[1]);
  const wx = Math.round((windowFrac * ctx.width) / 2);
  const wz = Math.round((windowFrac * ctx.depth) / 2);
  let best: Vec2 = [Math.round(cx), Math.round(cz)];
  let bestS = -Infinity;
  for (let z = Math.max(2, Math.round(cz) - wz); z <= Math.min(ctx.depth - 3, Math.round(cz) + wz); z += 2) {
    for (let x = Math.max(2, Math.round(cx) - wx); x <= Math.min(ctx.width - 3, Math.round(cx) + wx); x += 2) {
      const s = score(x, z);
      if (s > bestS) {
        bestS = s;
        best = [x, z];
      }
    }
  }
  return best;
}
