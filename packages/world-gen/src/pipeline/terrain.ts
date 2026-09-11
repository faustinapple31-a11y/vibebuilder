import { clamp, deriveSeed, lerp, smoothstep, smootherstep, type TerrainFeature } from "@worldforge/core";
import { Simplex2D } from "../noise";
import { Grid } from "../grid";
import { normToWorld, progress, type GenContext } from "../context";

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
  for (const f of t.features) applyFeature(ctx, f, ridge, amplitude);

  // border rise so the world reads as a contained valley (background silhouettes)
  const borderReach = Math.min(worldW, worldD) * 0.09;
  h.map((x, z, v) => {
    const wx = origin[0] + x * cellSize;
    const wz = origin[1] + z * cellSize;
    const dEdge = Math.min(wx - origin[0], origin[0] + worldW - wx, wz - origin[1], origin[1] + worldD - wz);
    const m = 1 - smoothstep(0, borderReach, dEdge);
    const r = ridge.ridged(wx / 160, wz / 160, 3);
    return v + m * m * (26 + r * 30);
  });

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

  progress(ctx, "terrain:erosion", 0.7);
  erode(ctx, t.erosion);

  // guard: never flat
  if (h.std() < 8) {
    h.map((x, z, v) => v + macro.fbm((origin[0] + x * cellSize) / 220, (origin[1] + z * cellSize) / 220, 3) * 12);
  }
  progress(ctx, "terrain:done", 1);
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
