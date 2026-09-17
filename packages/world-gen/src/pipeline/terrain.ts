import { Rng, clamp, deriveSeed, lerp, smoothstep, smootherstep, type TerrainFeature } from "@worldforge/core";
import { Simplex2D } from "../noise";
import { Grid } from "../grid";
import { applyArchipelago, type Archipelago } from "./archipelago";
import { normToWorld, progress, seaLevelOf, type GenContext } from "../context";

/**
 * Stage 1-5: base heightmap, large forms, spec features, secondary detail, erosion.
 * Never noise alone: the spec's features impose the macro composition
 * (mountains as background silhouettes, a valley for the playable core, etc.).
 */
export function generateTerrain(ctx: GenContext): void {
  const { spec, width, depth, cellSize, origin, worldW, worldD } = ctx;
  const t = spec.terrain;
  const seed = deriveSeed(ctx.seed, "terrain");
  const macro = new Simplex2D(seed);
  const detail = new Simplex2D(deriveSeed(seed, "detail"));
  const ridge = new Simplex2D(deriveSeed(seed, "ridge"));

  const amplitude = 24 + t.relief * 120; // studs
  const macroScale = Math.max(worldW, worldD) / 2.2;
  const h = ctx.heights;

  progress(ctx, "terrain:base", 0);
  h.map((x, z) => {
    const wx = origin[0] + x * cellSize;
    const wz = origin[1] + z * cellSize;
    // large forms: domain-warped fbm, remapped to [0,1] and shaped toward soft valleys
    const n = macro.warped(wx / macroScale, wz / macroScale, 0.7, 5);
    let v = clamp((n + 1) / 2, 0, 1);
    v = Math.pow(v, 1.25);
    // gentle hills mid frequency
    const hills = macro.fbm(wx / (macroScale * 0.35) + 11.7, wz / (macroScale * 0.35) - 3.1, 4) * 0.5 + 0.5;
    v = v * 0.7 + hills * 0.3;
    return t.baseHeight + v * amplitude;
  });

  progress(ctx, "terrain:features", 0.3);
  ctx.ocean = undefined;
  ctx.shore = undefined;
  const archipelago = t.features.find((f): f is Archipelago => f.type === "archipelago");
  for (const f of t.features) if (f.type !== "island" && f.type !== "coast" && f.type !== "archipelago") applyFeature(ctx, f, ridge, amplitude);

  // border rise so the world reads as a contained valley (background silhouettes) — not over the ocean
  const borderReach = Math.min(worldW, worldD) * 0.09;
  const oceanFeatures = archipelago ? [] : t.features.filter((f) => f.type === "island" || f.type === "coast");
  const ocean = oceanFeatures.length ? computeOceanMask(ctx, oceanFeatures, ridge) : undefined;
  h.map((x, z, v, i) => {
    const wx = origin[0] + x * cellSize;
    const wz = origin[1] + z * cellSize;
    const dEdge = Math.min(wx - origin[0], origin[0] + worldW - wx, wz - origin[1], origin[1] + worldD - wz);
    const m = (1 - smoothstep(0, borderReach, dEdge)) * (1 - (ocean ? ocean.data[i]! : 0));
    const r = ridge.ridged(wx / 160, wz / 160, 3);
    return v + m * m * (26 + r * 30);
  });
  if (ocean) applyOcean(ctx, ocean, ridge);

  progress(ctx, "terrain:detail", 0.55);
  // secondary detail, stronger on slopes (rockier), subtle on flats
  const slope = h.slopeGrid();
  h.map((x, z, v, i) => {
    const wx = origin[0] + x * cellSize;
    const wz = origin[1] + z * cellSize;
    const s = slope.data[i]!;
    const slopeMask = 0.35 + smoothstep(0.1, 0.6, s) * 0.65;
    const d = detail.fbm(wx / 46, wz / 46, 4) * (2.5 + t.roughness * 7) * slopeMask;
    const micro = detail.noise2(wx / 14 + 3, wz / 14 - 7) * t.roughness * 1.2;
    return v + d + micro;
  });

  // stylized strata: steep slopes read as layered cliffs (terraces blended by slope), flats untouched
  progress(ctx, "terrain:strata", 0.62);
  const slope2 = h.slopeGrid();
  const strataStep = 6 + t.roughness * 4;
  h.map((x, z, v, i) => {
    const s = slope2.data[i]!;
    const m = smoothstep(0.55, 0.95, s) * 0.55;
    if (m <= 0) return v;
    const wx = origin[0] + x * cellSize;
    const wz = origin[1] + z * cellSize;
    const wobble = ridge.noise2(wx / 70, wz / 70) * strataStep * 0.35;
    const terraced = Math.floor((v + wobble) / strataStep) * strataStep + strataStep * 0.5 - wobble;
    return lerp(v, terraced, m);
  });

  progress(ctx, "terrain:erosion", 0.7);
  erode(ctx, t.erosion);
  // hydraulic erosion: rain droplets carve gullies and deposit sediment in the valleys (real drainage patterns)
  progress(ctx, "terrain:hydraulic", 0.8);
  hydraulicErosion(ctx, t.erosion, new Rng(deriveSeed(seed, "droplets")));
  // erosion and detail must not lift the sea floor back above the surface
  if (ocean) {
    const sea = seaLevelOf(spec);
    const oc = ocean;
    h.map((x, z, v, i) => {
      const m = oc.data[i]!;
      return m > 0.5 ? Math.min(v, sea - 2 - (m - 0.5) * 24) : v;
    });
  }

  // mesa islands replace the whole relief: flat terraces, sheer cliffs, sea floor (no erosion / detail on them)
  if (archipelago) applyArchipelago(ctx, archipelago, ridge);

  // guard: never flat
  if (h.std() < 8) {
    h.map((x, z, v) => v + macro.fbm((origin[0] + x * cellSize) / 220, (origin[1] + z * cellSize) / 220, 3) * 12);
  }
  progress(ctx, "terrain:done", 1);
}

/**
 * Signed shoreline distance (fraction of the feature size: negative inland, positive seaward) from island /
 * coast features, warped by noise so bays and headlands appear. Returns the ocean mask (0 land → 1 open sea)
 * and stores the shoreline distance on the context (`ctx.shore`) for `applyOcean`.
 */
function computeOceanMask(ctx: GenContext, features: TerrainFeature[], ridge: Simplex2D): Grid {
  const { origin, cellSize, worldW, worldD } = ctx;
  const size = Math.max(worldW, worldD);
  const sd = new Grid(ctx.width, ctx.depth, cellSize, origin);
  sd.data.fill(-1);
  sd.map((x, z) => {
    const wx = origin[0] + x * cellSize;
    const wz = origin[1] + z * cellSize;
    let best = -1;
    for (const f of features) {
      if (f.type === "island") {
        const c = normToWorld(ctx, f.center);
        const r = f.radius * size;
        const wobble = ridge.fbm(wx / (r * 0.9), wz / (r * 0.9), 3) * r * 0.35 * f.ruggedness + ridge.noise2(wx / 60 + 5, wz / 60 - 3) * r * 0.06 * f.ruggedness;
        const d = Math.hypot(wx - c[0], wz - c[1]) + wobble;
        best = Math.max(best, (d - r * 0.95) / r);
      } else if (f.type === "coast") {
        const reach = f.reach * size;
        for (const e of f.edges) {
          let d = Infinity;
          if (e.includes("north")) d = Math.min(d, wz - origin[1]);
          if (e.includes("south")) d = Math.min(d, origin[1] + worldD - wz);
          if (e.includes("east")) d = Math.min(d, origin[0] + worldW - wx);
          if (e.includes("west")) d = Math.min(d, wx - origin[0]);
          if (!Number.isFinite(d)) continue;
          const wobble = ridge.fbm(wx / 220 + 3, wz / 220 + 8, 3) * reach * 0.45 * f.ruggedness;
          best = Math.max(best, (reach * 0.8 - (d + wobble)) / reach);
        }
      }
    }
    return best;
  });
  ctx.shore = sd;
  const mask = new Grid(ctx.width, ctx.depth, cellSize, origin);
  mask.map((_x, _z, _v, i) => smoothstep(-0.02, 0.22, sd.data[i]!));
  ctx.ocean = mask;
  return mask;
}

/**
 * Shape the coast: the land slopes down to a beach over a wide band (no cliffs between a settlement and its
 * pier), a shallow shelf follows the waterline, then the floor drops with the ocean mask (gentle relief).
 */
function applyOcean(ctx: GenContext, mask: Grid, ridge: Simplex2D): void {
  const sea = seaLevelOf(ctx.spec);
  const h = ctx.heights;
  const { origin, cellSize } = ctx;
  const sd = ctx.shore;
  if (!sd) return;
  h.map((x, z, v, i) => {
    const d = sd.data[i]!;
    if (d < -0.55) return v;
    const wx = origin[0] + x * cellSize;
    const wz = origin[1] + z * cellSize;
    const n = ridge.fbm(wx / 140, wz / 140, 3);
    // coastal plain: inland height eases down to a few studs above the sea over ~half the island radius
    const coastal = smoothstep(-0.55, -0.04, d);
    const plain = sea + 5 + (1 - coastal) * 10 + n * 2.5;
    let out = lerp(v, Math.min(v, plain), coastal);
    // beach → shelf → floor
    const m = mask.data[i]!;
    if (d > -0.04) {
      const beach = sea + 2.5 - smoothstep(-0.04, 0.04, d) * 3.5; // crosses the waterline at the shore
      const floor = sea - 6 - m * m * 28 + n * 6;
      const target = lerp(beach, floor, smoothstep(0.04, 0.6, d));
      out = Math.min(out, target);
    }
    return out;
  });
}

function applyFeature(ctx: GenContext, f: TerrainFeature, ridge: Simplex2D, amplitude: number): void {
  const { width, depth, cellSize, origin, worldW, worldD } = ctx;
  const h = ctx.heights;
  const size = Math.max(worldW, worldD);
  switch (f.type) {
    case "mountains": {
      const reach = f.reach * size;
      const inten = f.intensity;
      h.map((x, z, v) => {
        const wx = origin[0] + x * cellSize;
        const wz = origin[1] + z * cellSize;
        let m = 0;
        if (f.placement === "point" && f.center) {
          const c = normToWorld(ctx, f.center);
          const d = Math.hypot(wx - c[0], wz - c[1]);
          m = 1 - smoothstep(reach * 0.3, reach, d);
        } else {
          for (const e of f.edges) {
            let d = Infinity;
            if (e.includes("north")) d = Math.min(d, wz - origin[1]);
            if (e.includes("south")) d = Math.min(d, origin[1] + worldD - wz);
            if (e.includes("east")) d = Math.min(d, origin[0] + worldW - wx);
            if (e.includes("west")) d = Math.min(d, wx - origin[0]);
            if (e === "center") d = Math.hypot(wx - (origin[0] + worldW / 2), wz - (origin[1] + worldD / 2));
            const mm = 1 - smootherstep(reach * 0.25, reach, d);
            m = Math.max(m, mm);
          }
        }
        if (m <= 0) return v;
        const r = ridge.ridged(wx / 210, wz / 210, 5, 2.1, 0.55);
        const big = ridge.fbm(wx / 480 + 40, wz / 480 - 20, 3) * 0.5 + 0.5;
        return v + m * inten * (r * 0.75 + big * 0.35) * (amplitude * 1.35 + 60);
      });
      break;
    }
    case "hills": {
      const sc = 200 * f.scale;
      h.map((x, z, v) => {
        const wx = origin[0] + x * cellSize;
        const wz = origin[1] + z * cellSize;
        const b = ridge.billow(wx / sc + 7, wz / sc + 3, 3);
        return v + (b - 0.35) * f.intensity * amplitude * 0.5;
      });
      break;
    }
    case "valley": {
      const c = normToWorld(ctx, f.center);
      const r = f.radius * size;
      h.map((x, z, v) => {
        const wx = origin[0] + x * cellSize;
        const wz = origin[1] + z * cellSize;
        const d = Math.hypot(wx - c[0], wz - c[1]);
        const m = 1 - smootherstep(r * 0.35, r, d);
        return v - m * f.depth * amplitude * 0.55;
      });
      break;
    }
    case "plateau": {
      const c = normToWorld(ctx, f.center);
      const r = f.radius * size;
      const target = ctx.spec.terrain.baseHeight + f.height * amplitude;
      h.map((x, z, v) => {
        const wx = origin[0] + x * cellSize;
        const wz = origin[1] + z * cellSize;
        const d = Math.hypot(wx - c[0], wz - c[1]) + ridge.noise2(wx / 90, wz / 90) * r * 0.15;
        const m = 1 - smoothstep(r * 0.75, r, d);
        return lerp(v, Math.max(v, target), m);
      });
      break;
    }
    case "cliffs": {
      const step = 14 + f.intensity * 12;
      h.map((x, z, v) => {
        const wx = origin[0] + x * cellSize;
        const wz = origin[1] + z * cellSize;
        const mask = smoothstep(0.1, 0.5, ridge.fbm(wx / 300 + 9, wz / 300 + 2, 3) * 0.5 + 0.5);
        const terraced = Math.floor(v / step) * step + step * 0.5;
        return lerp(v, terraced, mask * f.intensity * 0.85);
      });
      break;
    }
    case "crater": {
      const c = normToWorld(ctx, f.center);
      const r = f.radius * size;
      h.map((x, z, v) => {
        const wx = origin[0] + x * cellSize;
        const wz = origin[1] + z * cellSize;
        const d = Math.hypot(wx - c[0], wz - c[1]);
        const rim = Math.exp(-Math.pow((d - r) / (r * 0.25), 2)) * amplitude * 0.5;
        const bowl = (1 - smoothstep(r * 0.2, r * 0.9, d)) * amplitude * 0.45;
        return v + rim - bowl;
      });
      break;
    }
  }
  void width;
  void depth;
}

/**
 * Thermal erosion: material slides from cells whose slope exceeds the talus angle,
 * followed by light smoothing. Produces natural, playable slopes and softer valley floors.
 */
function erode(ctx: GenContext, strength: number): void {
  const h = ctx.heights;
  const { width, depth, cellSize } = ctx;
  const iterations = Math.round(6 + strength * 22);
  const talus = Math.tan(0.62) * cellSize; // ~35° max stable slope
  const rate = 0.28;
  const delta = new Float32Array(width * depth);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ] as const;
  for (let it = 0; it < iterations; it++) {
    delta.fill(0);
    for (let z = 1; z < depth - 1; z++) {
      for (let x = 1; x < width - 1; x++) {
        const i = z * width + x;
        const v = h.data[i]!;
        let total = 0;
        let maxDiff = 0;
        const diffs: number[] = [];
        for (const [dx, dz] of dirs) {
          const j = (z + dz) * width + (x + dx);
          const diag = dx !== 0 && dz !== 0;
          const d = v - h.data[j]! - talus * (diag ? 1.414 : 1);
          if (d > 0) {
            diffs.push(d);
            total += d;
            if (d > maxDiff) maxDiff = d;
          } else diffs.push(0);
        }
        if (total <= 0) continue;
        const move = maxDiff * rate;
        delta[i] -= move;
        for (let k = 0; k < dirs.length; k++) {
          const d = diffs[k]!;
          if (d <= 0) continue;
          const [dx, dz] = dirs[k]!;
          delta[(z + dz) * width + (x + dx)] += move * (d / total);
        }
      }
    }
    for (let i = 0; i < delta.length; i++) h.data[i] += delta[i]!;
  }
  // light smoothing scaled by erosion strength, preserving ridges via blend
  const blurred = h.blur(1, 1);
  const k = 0.25 + strength * 0.45;
  for (let i = 0; i < h.data.length; i++) h.data[i] = lerp(h.data[i]!, blurred.data[i]!, k);
}

/**
 * Particle-based hydraulic erosion (droplets). Each droplet follows the gradient, picks up sediment
 * proportionally to its speed and the slope, and deposits it when it slows down or climbs — the
 * classic Lague / Beyer model. Erosion is spread over a small brush so channels stay smooth at 4-stud cells.
 */
function hydraulicErosion(ctx: GenContext, strength: number, rng: Rng): void {
  if (strength <= 0.05) return;
  const h = ctx.heights;
  const { width, depth } = ctx;
  const data = h.data;
  const before = Float32Array.from(data);
  const droplets = Math.round(width * depth * (0.2 + strength * 0.6));
  const maxLife = 40;
  const inertia = 0.08;
  const capacityFactor = 3.2;
  const maxCapacity = 3;
  const minCapacity = 0.01;
  const erodeSpeed = 0.4;
  const depositSpeed = 0.3;
  const maxDeposit = 0.12; // per step, spread over the wide deposit brush: no sediment mounds in the pits
  const evaporate = 0.015;
  const gravity = 4;
  const radius = 2;
  // brush offsets + weights (linear falloff)
  const brush: [number, number, number][] = [];
  let wsum = 0;
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = Math.hypot(dx, dz);
      if (d > radius) continue;
      const w = 1 - d / (radius + 0.001);
      brush.push([dx, dz, w]);
      wsum += w;
    }
  }
  for (const b of brush) b[2] /= wsum;
  const depositBrush: [number, number, number][] = [];
  let dsum = 0;
  for (let dz = -3; dz <= 3; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      const d = Math.hypot(dx, dz);
      if (d > 3) continue;
      const w = 1 - d / 3.001;
      depositBrush.push([dx, dz, w]);
      dsum += w;
    }
  }
  for (const b of depositBrush) b[2] /= dsum;
  // per-cell erosion budget: a funnel cannot dig a bottomless pit
  const maxErosionPerCell = 4 + strength * 6;
  const eroded = new Float32Array(width * depth);
  const depositAt = (x0: number, z0: number, amount: number) => {
    for (const [bx, bz, w] of depositBrush) {
      const cx = x0 + bx;
      const cz = z0 + bz;
      if (cx < 0 || cz < 0 || cx >= width || cz >= depth) continue;
      data[cz * width + cx] += amount * w;
    }
  };
  const heightAndGradient = (px: number, pz: number): [number, number, number] => {
    const x0 = Math.floor(px);
    const z0 = Math.floor(pz);
    const fx = px - x0;
    const fz = pz - z0;
    const i = z0 * width + x0;
    const nw = data[i]!;
    const ne = data[i + 1]!;
    const sw = data[i + width]!;
    const se = data[i + width + 1]!;
    const gx = (ne - nw) * (1 - fz) + (se - sw) * fz;
    const gz = (sw - nw) * (1 - fx) + (se - ne) * fx;
    const height = nw * (1 - fx) * (1 - fz) + ne * fx * (1 - fz) + sw * (1 - fx) * fz + se * fx * fz;
    return [height, gx, gz];
  };
  for (let n = 0; n < droplets; n++) {
    let px = rng.float(1, width - 2.001);
    let pz = rng.float(1, depth - 2.001);
    let dx = 0;
    let dz = 0;
    let speed = 1;
    let water = 1;
    let sediment = 0;
    for (let life = 0; life < maxLife; life++) {
      const x0 = Math.floor(px);
      const z0 = Math.floor(pz);
      const fx = px - x0;
      const fz = pz - z0;
      const [hOld, gx, gz] = heightAndGradient(px, pz);
      dx = dx * inertia - gx * (1 - inertia);
      dz = dz * inertia - gz * (1 - inertia);
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) {
        // stalled in a hollow: the water evaporates and leaves its sediment
        depositAt(x0, z0, Math.min(sediment, maxDeposit * 2));
        break;
      }
      dx /= len;
      dz /= len;
      px += dx;
      pz += dz;
      if (px < 1 || px >= width - 2 || pz < 1 || pz >= depth - 2) break;
      const [hNew] = heightAndGradient(px, pz);
      const deltaH = hNew - hOld;
      const capacity = Math.min(maxCapacity, Math.max(-deltaH * speed * water * capacityFactor, minCapacity));
      if (sediment > capacity || deltaH > 0) {
        // deposit around the old cell (brush), capped so converging droplets never pile up mounds
        const amount = Math.min(maxDeposit, deltaH > 0 ? Math.min(deltaH, sediment) : (sediment - capacity) * depositSpeed);
        sediment -= amount;
        depositAt(x0, z0, amount);
        if (deltaH > 0 && sediment < 0.02) break; // the droplet stalled in a pit
      } else {
        const amount = Math.min((capacity - sediment) * erodeSpeed, -deltaH);
        for (const [bx, bz, w] of brush) {
          const cx = x0 + bx;
          const cz = z0 + bz;
          if (cx < 0 || cz < 0 || cx >= width || cz >= depth) continue;
          const j = cz * width + cx;
          const take = Math.min(data[j]! - (ctx.spec.terrain.baseHeight - 40), amount * w, maxErosionPerCell - eroded[j]!);
          if (take <= 0) continue;
          data[j] -= take;
          eroded[j] += take;
          sediment += take;
        }
      }
      speed = Math.sqrt(Math.max(0, speed * speed + deltaH * gravity));
      water *= 1 - evaporate;
    }
  }
  // the raw droplet field is pocked at the cell scale: smooth the *delta* (channels and fans are wider
  // than a droplet, dimples are not) and apply it with a little gain
  const delta = new Grid(width, depth, ctx.cellSize, ctx.origin);
  for (let i = 0; i < data.length; i++) delta.data[i] = data[i]! - before[i]!;
  const smooth = delta.blur(1, 2);
  for (let i = 0; i < data.length; i++) data[i] = before[i]! + smooth.data[i]! * 1.3;
}

export function computeMoisture(ctx: GenContext): void {
  const n = new Simplex2D(deriveSeed(ctx.seed, "moisture"));
  const { origin, cellSize } = ctx;
  const [minH, maxH] = ctx.heights.minMax();
  ctx.moisture.map((x, z) => {
    const wx = origin[0] + x * cellSize;
    const wz = origin[1] + z * cellSize;
    const base = n.fbm(wx / 380, wz / 380, 4) * 0.5 + 0.5;
    const hNorm = (ctx.heights.get(x, z) - minH) / Math.max(1, maxH - minH);
    return clamp(base * 0.7 + (1 - hNorm) * 0.4, 0, 1);
  });
}

export function makeGrid(ctx: GenContext, fill = 0): Grid {
  const g = new Grid(ctx.width, ctx.depth, ctx.cellSize, ctx.origin);
  if (fill !== 0) g.data.fill(fill);
  return g;
}
