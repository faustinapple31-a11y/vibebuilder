import { TERRAIN_MATERIALS, TERRAIN_MATERIAL_INDEX, hexToRgb, sampleHeight, type Vec2, type WorldBake } from "@worldforge/core";
import { reviewLevelDesign } from "./level-design";

/**
 * A world judged at three scales: from the air (composition, forests, open space, borders, relief), from a hill
 * (settlement, roads, farmland, transitions) and from the ground (navigation, discovery, obstruction). A pretty aerial
 * picture alone cannot score high.
 */
export interface WorldProblem {
  scale: "aerial" | "mid" | "ground";
  id: string;
  severity: "low" | "medium" | "high";
  message: string;
  position?: Vec2;
}

export interface WorldReview {
  score: number;
  scales: { aerial: number; mid: number; ground: number };
  problems: WorldProblem[];
  metrics: Record<string, number>;
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
/** 1 inside [a, b], falling to 0 over `soft` outside. */
const band = (v: number, a: number, b: number, soft: number) => (v < a ? clamp(1 - (a - v) / soft) : v > b ? clamp(1 - (v - b) / soft) : 1);

export interface TreeField {
  cell: number;
  w: number;
  d: number;
  counts: Uint16Array;
}

export function treeField(bake: WorldBake, cell = 16): TreeField {
  const t = bake.terrain;
  const w = Math.ceil((t.width * t.cellSize) / cell);
  const d = Math.ceil((t.depth * t.cellSize) / cell);
  const counts = new Uint16Array(w * d);
  for (const p of bake.placements) {
    if (p.category !== "vegetation" || (bake.prefabs[p.prefab]?.[p.variant]?.bounds.max[1] ?? 0) * p.scale < 8) continue;
    const x = Math.floor((p.position[0] - t.origin[0]) / cell);
    const z = Math.floor((p.position[2] - t.origin[1]) / cell);
    if (x >= 0 && z >= 0 && x < w && z < d) counts[z * w + x]!++;
  }
  return { cell, w, d, counts };
}

/** Connected regions of a mask (4-neighbours): sizes, largest first. */
function regions(mask: Uint8Array, w: number, d: number): number[] {
  const seen = new Uint8Array(mask.length);
  const out: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    let n = 0;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      n++;
      const x = k % w;
      for (const j of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, k - w, k + w]) {
        if (j < 0 || j >= w * d || !mask[j] || seen[j]) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    out.push(n);
  }
  return out.sort((a, b) => b - a);
}

export function reviewWorld(bake: WorldBake): WorldReview {
  const problems: WorldProblem[] = [];
  const metrics: Record<string, number> = {};
  const note = (scale: WorldProblem["scale"], id: string, value: number, message: string, position?: Vec2) => {
    if (value >= 0.75) return;
    problems.push({ scale, id, severity: value < 0.3 ? "high" : value < 0.55 ? "medium" : "low", message, ...(position ? { position } : {}) });
  };
  const t = bake.terrain;
  const W = t.width * t.cellSize;
  const D = t.depth * t.cellSize;
  const h = (x: number, z: number) => sampleHeight(t, x, z);
  const wet = (x: number, z: number) => {
    const ix = Math.round((x - t.origin[0]) / t.cellSize);
    const iz = Math.round((z - t.origin[1]) / t.cellSize);
    return ix >= 0 && iz >= 0 && ix < t.width && iz < t.depth && !Number.isNaN(t.water[iz * t.width + ix]!);
  };
  const slope = (x: number, z: number, e: number) => Math.hypot(h(x + e, z) - h(x - e, z), h(x, z + e) - h(x, z - e)) / (2 * e);
  const roads = bake.paths.filter((p) => p.kind === "road");
  const sites = bake.zones.filter((z) => z.kind === "settlement");
  const level = reviewLevelDesign(bake);
  const design = bake.meta.design;
  // a place is judged as what it was meant to be: a desert has no forest, an outpost no suburbs, a city no meadows
  const environment = design?.environment ?? "";
  const town = design ? environment === "urban" || (environment === "industrial" && design.density === "very_dense") : ["modern_city", "cyberpunk"].includes(bake.meta.stylePreset);
  const bare = ["desert", "arctic", "space", "alien", "volcanic", "underwater", "underground", "industrial", "military", "scientific", "abstract"].includes(environment);
  // islands are judged as islands: no range, no long road, no forest mass to find on them
  const isles = design?.scale === "archipelago";
  const arena = design?.scale === "arena" || isles;
  const wild = design !== undefined && ["sparse", "open", "wilderness"].includes(design.density);

  // ---------------------------------------------------------------- from the air
  const f = treeField(bake);
  const land = new Uint8Array(f.w * f.d);
  const open = new Uint8Array(f.w * f.d);
  const wooded = new Uint8Array(f.w * f.d);
  const built = new Uint8Array(f.w * f.d);
  for (const p of bake.placements) {
    if (p.category !== "building" && p.category !== "landmark") continue;
    const r = (bake.prefabs[p.prefab]?.[p.variant]?.footprintRadius ?? 8) * p.scale;
    for (let dz = -r; dz <= r; dz += f.cell) for (let dx = -r; dx <= r; dx += f.cell) {
      const x = Math.floor((p.position[0] + dx - t.origin[0]) / f.cell);
      const z = Math.floor((p.position[2] + dz - t.origin[1]) / f.cell);
      if (x >= 0 && z >= 0 && x < f.w && z < f.d) built[z * f.w + x] = 1;
    }
  }
  let landN = 0;
  let woodN = 0;
  for (let z = 0; z < f.d; z++) for (let x = 0; x < f.w; x++) {
    const i = z * f.w + x;
    const wx = t.origin[0] + (x + 0.5) * f.cell;
    const wz = t.origin[1] + (z + 0.5) * f.cell;
    if (wet(wx, wz)) continue;
    land[i] = 1;
    landN++;
    // under trees: three of them within the block and its neighbours
    let close = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && z + dz >= 0 && x + dx < f.w && z + dz < f.d) close += f.counts[(z + dz) * f.w + x + dx]!;
    if (close >= 3) (wooded[i] = 1), woodN++;
    else if (!built[i] && slope(wx, wz, 8) < 0.5) open[i] = 1;
  }
  const trees = f.counts.reduce((a, b) => a + b, 0);
  const coverage = woodN / Math.max(1, landN);
  metrics.treeCoverage = coverage;
  const scores: Record<string, number> = {};
  if (trees > 60) {
    // variation at the scale of a grove: a uniform scatter sits near 0.4, regions with clearings above 1
    const big: number[] = [];
    const k = 4;
    for (let z = 0; z + k <= f.d; z += k) for (let x = 0; x + k <= f.w; x += k) {
      let n = 0;
      let l = 0;
      for (let dz = 0; dz < k; dz++) for (let dx = 0; dx < k; dx++) (n += f.counts[(z + dz) * f.w + x + dx]!), (l += land[(z + dz) * f.w + x + dx]!);
      if (l >= k * k * 0.7) big.push(n);
    }
    const mean = big.reduce((a, b) => a + b, 0) / Math.max(1, big.length);
    const cv = Math.sqrt(big.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, big.length)) / Math.max(0.1, mean);
    metrics.forestVariation = cv;
    scores.forest = clamp((cv - 0.35) / 0.6);
    note("aerial", "uniform_forest", scores.forest, `trees are spread evenly over the map (variation ${cv.toFixed(2)} between 64-stud blocks, a composed map is above 0.9)`);
    // contiguous masses: how much of the wood belongs to a few big forests
    const reg = regions(wooded, f.w, f.d);
    const mass = reg.filter((n) => n >= 24).reduce((a, b) => a + b, 0) / Math.max(1, woodN);
    metrics.forestMass = mass;
    scores.mass = bare || arena ? Math.max(0.8, clamp((mass - 0.35) / 0.4)) : clamp((mass - 0.35) / 0.4);
    note("aerial", "scattered_trees", scores.mass, `only ${Math.round(mass * 100)}% of the wooded ground belongs to a real forest, the rest is scatter`);
  } else {
    scores.forest = 1;
    scores.mass = 1;
  }
  const openReg = regions(open, f.w, f.d);
  const bigOpen = openReg.filter((n) => n >= 30).length;
  const openShare = openReg.reduce((a, b) => a + b, 0) / Math.max(1, landN);
  const largest = (openReg[0] ?? 0) / Math.max(1, landN);
  metrics.openShare = openShare;
  metrics.openings = bigOpen;
  metrics.largestOpening = largest;
  scores.negative = town || arena || (design && design.openness >= 0.7) ? 1 : band(openShare, 0.18, 0.62, 0.2) * clamp((bigOpen + 1) / 4);
  note("aerial", "no_negative_space", scores.negative, `${bigOpen} open spaces over 30 cells, ${Math.round(openShare * 100)}% of the land is open`);
  // relief: small bumps on ground one walks on
  let bump = 0;
  let bn = 0;
  let steepN = 0;
  const steep = new Uint8Array(f.w * f.d);
  for (let z = 1; z < f.d - 1; z++) for (let x = 1; x < f.w - 1; x++) {
    const wx = t.origin[0] + (x + 0.5) * f.cell;
    const wz = t.origin[1] + (z + 0.5) * f.cell;
    if (wet(wx, wz)) continue;
    const s = slope(wx, wz, 16);
    if (s > 0.5) (steep[z * f.w + x] = 1), steepN++;
    if (s < 0.3) {
      const r = 12;
      bump += Math.abs(h(wx, wz) - (h(wx + r, wz) + h(wx - r, wz) + h(wx, wz + r) + h(wx, wz - r)) / 4);
      bn++;
    }
  }
  metrics.bumpiness = bn ? bump / bn : 0;
  scores.calm = t.mode === "parts" ? 1 : clamp(1 - (metrics.bumpiness - 0.35) / 1.2);
  note("aerial", "noisy_ground", scores.calm, `gentle ground is bumpy: ${metrics.bumpiness.toFixed(2)} studs every 12 studs`);
  const ranges = regions(steep, f.w, f.d);
  metrics.rangeShare = steepN ? ranges.filter((n) => n >= 12).reduce((a, b) => a + b, 0) / steepN : 1;
  scores.ranges = steepN < 20 || isles ? 1 : clamp((metrics.rangeShare - 0.3) / 0.45);
  note("aerial", "isolated_rocks", scores.ranges, `${Math.round((1 - metrics.rangeShare) * 100)}% of the steep ground is isolated bumps, not ranges`);
  // borders: does the world close?
  let closed = 0;
  let total = 0;
  const inner = Math.min(W, D) * 0.16;
  for (let k = 0; k < 120; k++) {
    const a = (k / 120) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const q = 1 / Math.max(Math.abs(c), Math.abs(s));
    const at = (inset: number): Vec2 => [t.origin[0] + W / 2 + c * q * (W / 2 - inset), t.origin[1] + D / 2 + s * q * (D / 2 - inset)];
    total++;
    const [ex, ez] = at(14);
    const [ix, iz] = at(inner);
    if (wet(ex, ez)) {
      closed++;
      continue;
    }
    let tree = 0;
    for (let inset = 8; inset < 90; inset += 14) {
      const [x, z] = at(inset);
      tree += f.counts[Math.min(f.d - 1, Math.max(0, Math.floor((z - t.origin[1]) / f.cell))) * f.w + Math.min(f.w - 1, Math.max(0, Math.floor((x - t.origin[0]) / f.cell)))]!;
    }
    let top = -Infinity;
    for (let inset = 6; inset < inner; inset += 10) {
      const [x, z] = at(inset);
      top = Math.max(top, h(x, z));
    }
    if (top - h(ix, iz) > 16 || tree >= 4) closed++;
  }
  metrics.closedBorder = closed / total;
  scores.border = clamp((metrics.closedBorder - 0.5) / 0.38);
  // flat country, a base or a circuit ends on open ground: the border still needs a fence of relief or trees, but less of one
  if (design && (bare || arena || design.openness >= 0.7)) scores.border = Math.max(scores.border, clamp((metrics.closedBorder - 0.2) / 0.4));
  note("aerial", "open_border", scores.border, `${Math.round((1 - metrics.closedBorder) * 100)}% of the border simply ends: no relief, no forest, no water`);
  // proportions: what share of the map lives
  const main = [...sites].sort((a, b) => b.radius - a.radius)[0];
  if (main) {
    const houses = bake.placements.filter((p) => p.category === "building" && /house|cottage|shop|apartment|skyscraper/.test(p.prefab));
    let reach = 0;
    for (const p of houses) reach = Math.max(reach, Math.min(main.radius * 1.4, Math.hypot(p.position[0] - main.center[0], p.position[2] - main.center[1])));
    const share = (Math.PI * reach * reach) / (W * D);
    metrics.settlementShare = share;
    const type = bake.plan?.settlements[0] ? houses.length : 0;
    metrics.buildings = houses.length;
    scores.proportion = town ? band(share, 0.12, 0.7, 0.12) : wild ? band(share, 0.004, 0.2, 0.004) : band(share, 0.055, 0.3, 0.055);
    void type;
    note("aerial", "settlement_proportion", scores.proportion, `the settlement covers ${(share * 100).toFixed(1)}% of the map`, main.center as Vec2);
  } else scores.proportion = 1;
  const pois = [...bake.landmarks.map((l) => [l.position[0], l.position[2]] as Vec2), ...sites.map((s) => s.center as Vec2)];
  let near = Infinity;
  for (let i = 0; i < pois.length; i++) for (let j = i + 1; j < pois.length; j++) near = Math.min(near, Math.hypot(pois[i]![0] - pois[j]![0], pois[i]![1] - pois[j]![1]));
  scores.spacing = pois.length < 2 ? 1 : clamp((near / Math.min(W, D) - 0.05) / 0.06);
  note("aerial", "crowded_landmarks", scores.spacing, `two places of interest stand ${Math.round(near)} studs apart`);
  const aerial = 100 * (0.2 * scores.forest! + 0.12 * scores.mass! + 0.16 * scores.negative! + 0.12 * scores.calm! + 0.1 * scores.ranges! + 0.14 * scores.border! + 0.1 * scores.proportion! + 0.06 * scores.spacing!);

  // ---------------------------------------------------------------- from a hill
  const mid: number[] = [];
  mid.push(level.criteria.urban / 100, level.criteria.architecture / 100, level.criteria.roads / 100);
  if (main) {
    const bearings: number[] = [];
    for (const r of roads) {
      for (let i = 1; i < r.points.length; i++) {
        const a = Math.hypot(r.points[i - 1]![0] - main.center[0], r.points[i - 1]![1] - main.center[1]) - main.radius * 1.2;
        const b = Math.hypot(r.points[i]![0] - main.center[0], r.points[i]![1] - main.center[1]) - main.radius * 1.2;
        if (a * b < 0) bearings.push(Math.atan2(r.points[i]![1] - main.center[1], r.points[i]![0] - main.center[0]));
      }
    }
    const distinct = bearings.filter((a, i) => bearings.slice(0, i).every((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) > 0.5)).length;
    metrics.entrances = distinct;
    mid.push(clamp(distinct / 3));
    note("mid", "few_entrances", clamp(distinct / 3), `the settlement has ${distinct} way(s) in`, main.center as Vec2);
    // an open belt around the houses, then the woods: not trees against the walls, not bare to the horizon
    let belt = 0;
    let beltN = 0;
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * 6.2832;
      for (const r of [1.15, 1.35]) {
        const x = Math.floor((main.center[0] + Math.cos(a) * main.radius * r - t.origin[0]) / f.cell);
        const z = Math.floor((main.center[1] + Math.sin(a) * main.radius * r - t.origin[1]) / f.cell);
        if (x < 0 || z < 0 || x >= f.w || z >= f.d) continue;
        beltN++;
        if (f.counts[z * f.w + x] === 0) belt++;
      }
    }
    metrics.openBelt = beltN ? belt / beltN : 1;
    mid.push(clamp((metrics.openBelt - 0.3) / 0.35));
    note("mid", "no_countryside", clamp((metrics.openBelt - 0.3) / 0.35), `woods press against the settlement: only ${Math.round(metrics.openBelt * 100)}% of its surroundings are open`, main.center as Vec2);
    const fields = bake.placements.filter((p) => p.prefab === "farm_field").length;
    metrics.fields = fields;
    const farming = bake.prefabs["farm_field"] && (bake.plan?.settlements ?? []).some((s) => s.districts.some((q) => q.function === "farm"));
    if (farming && !["alpine", "mountain", "arctic", "desert", "urban", "suburban", "underground", "jungle"].includes(environment)) {
      mid.push(clamp(fields / 8));
      note("mid", "no_farmland", clamp(fields / 8), `${fields} field tile(s) for a farming settlement`);
    }
  }
  // every place connected by an intentional way
  const reach = pois.length ? pois.filter((p) => roads.some((r) => r.points.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 70 + r.width))).length / pois.length : 1;
  metrics.connected = reach;
  mid.push(reach);
  note("mid", "unconnected_place", reach, `${Math.round((1 - reach) * 100)}% of the places have no road or trail`);
  const midScore = (100 * mid.reduce((a, b) => a + b, 0)) / mid.length;

  // ---------------------------------------------------------------- on the ground
  const ground: number[] = [level.criteria.player / 100, level.criteria.composition / 100, level.criteria.relief / 100];
  // rhythm along the main road: open and closed alternate
  const way = [...roads].sort((a, b) => b.points.length - a.points.length)[0];
  if (way && trees > 60 && !town && !bare && !arena) {
    const closedAt = way.points.filter((_, i) => i % 4 === 0).map((q) => {
      const x = Math.floor((q[0] - t.origin[0]) / f.cell);
      const z = Math.floor((q[1] - t.origin[1]) / f.cell);
      let n = 0;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) n += x + dx >= 0 && z + dz >= 0 && x + dx < f.w && z + dz < f.d ? (f.counts[(z + dz) * f.w + x + dx]! > 0 ? 1 : 0) : 0;
      return n >= 8;
    });
    let changes = 0;
    for (let i = 1; i < closedAt.length; i++) if (closedAt[i] !== closedAt[i - 1]) changes++;
    const share = closedAt.filter(Boolean).length / Math.max(1, closedAt.length);
    metrics.rhythm = changes;
    metrics.roadClosed = share;
    const r = clamp(changes / 3) * 0.6 + band(share, 0.12, 0.75, 0.15) * 0.4;
    ground.push(r);
    note("ground", "no_rhythm", r, `along the main road the space changes ${changes} time(s) (${Math.round(share * 100)}% under trees)`);
  }
  const finds = bake.zones.filter((z) => z.meta?.kind === "viewpoint" || z.meta?.kind === "secret").length;
  metrics.finds = finds;
  const found = clamp(finds / Math.max(1, Math.min(2, design?.discoveries ?? 2)));
  if (design?.discoveries !== 0) ground.push(found);
  note("ground", "nothing_to_find", design?.discoveries === 0 ? 1 : found, `${finds} viewpoint or hidden place`);
  const groundScore = (100 * ground.reduce((a, b) => a + b, 0)) / ground.length;

  const rank = { high: 0, medium: 1, low: 2 };
  problems.sort((a, b) => rank[a.severity] - rank[b.severity]);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return { score: r1(aerial * 0.4 + midScore * 0.3 + groundScore * 0.3), scales: { aerial: r1(aerial), mid: r1(midScore), ground: r1(groundScore) }, problems, metrics };
}

// ------------------------------------------------------------------ aerial capture
const MAT_COLOR: Partial<Record<string, string>> = { Grass: "#6f9a4a", LeafyGrass: "#5d8740", Ground: "#a5835a", Mud: "#7a5f45", Rock: "#8f8b84", Slate: "#7f8088", Basalt: "#4b484b", Sand: "#d9c08c", Snow: "#eef2f6", Cobblestone: "#9c968c", Limestone: "#c2b79f", Sandstone: "#c59a6a", Asphalt: "#55565a", Pavement: "#a4a3a0", Concrete: "#a7a7a5", Ice: "#bfe0ee", CrackedLava: "#c8421c" };

/** Orthographic top view, shaded by the relief: what the composition looks like before any renderer gets to flatter it. */
export function aerialPixels(bake: WorldBake, px = 1024): { width: number; height: number; data: Uint8Array } {
  const t = bake.terrain;
  const W = t.width * t.cellSize;
  const D = t.depth * t.cellSize;
  const height = Math.round((px * D) / W);
  const data = new Uint8Array(px * height * 3);
  const rgb = (hex: string): [number, number, number] => {
    const c = hexToRgb(hex) as unknown as { r: number; g: number; b: number } | [number, number, number];
    const a = Array.isArray(c) ? c : [c.r, c.g, c.b];
    return (a.some((v) => v > 1) ? a : a.map((v) => v * 255)) as [number, number, number];
  };
  const palette = TERRAIN_MATERIALS.map((n) => rgb(MAT_COLOR[n] ?? "#8a9a6a"));
  const set = (x: number, y: number, c: readonly number[], k = 1, alpha = 1) => {
    if (x < 0 || y < 0 || x >= px || y >= height) return;
    const i = (y * px + x) * 3;
    for (let q = 0; q < 3; q++) data[i + q] = Math.max(0, Math.min(255, data[i + q]! * (1 - alpha) + c[q]! * k * alpha));
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < px; x++) {
    const wx = t.origin[0] + (x / px) * W;
    const wz = t.origin[1] + (y / height) * D;
    const ix = Math.min(t.width - 1, Math.round((wx - t.origin[0]) / t.cellSize));
    const iz = Math.min(t.depth - 1, Math.round((wz - t.origin[1]) / t.cellSize));
    const i = iz * t.width + ix;
    if (!Number.isNaN(t.water[i]!)) {
      set(x, y, [62, 124, 166]);
      continue;
    }
    const e = 5;
    const dx = sampleHeight(t, wx + e, wz) - sampleHeight(t, wx - e, wz);
    const dz = sampleHeight(t, wx, wz + e) - sampleHeight(t, wx, wz - e);
    const len = Math.hypot(dx, 2 * e, dz);
    const light = 0.5 + 0.62 * Math.max(0, (-dx * 0.55 + 2 * e * 0.75 - dz * 0.36) / len);
    const rock = Math.min(1, Math.max(0, Math.hypot(dx, dz) / (2 * e) - 0.55) * 2.2);
    const base = palette[(t.materials as ArrayLike<number>)[i]!] ?? palette[TERRAIN_MATERIAL_INDEX.Grass]!;
    set(x, y, base.map((c, q) => c * (1 - rock) + [143, 138, 130][q]! * rock), light);
  }
  const sc = px / W;
  const disc = (wx: number, wz: number, r: number, c: readonly number[], shade = true, alpha = 1) => {
    const cx = (wx - t.origin[0]) * sc;
    const cy = (wz - t.origin[1]) * sc;
    const R = Math.max(0.7, r * sc);
    for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= R) set(x, y, c, shade ? 1.1 - 0.5 * ((x - cx + (y - cy)) / (2 * R) + 0.5) : 1, alpha);
    }
  };
  for (const r of bake.paths) if (r.kind === "road") for (const q of r.points) disc(q[0], q[1], Math.max(2, r.width / 2), r.type.includes("asphalt") ? [82, 83, 88] : r.type === "dirt_path" ? [176, 140, 96] : [186, 168, 138], false, 0.9);
  const box = (p: (typeof bake.placements)[number], c: readonly number[]) => {
    const v = bake.prefabs[p.prefab]?.[p.variant];
    if (!v) return;
    const hx = ((v.bounds.max[0] - v.bounds.min[0]) / 2) * p.scale;
    const hz = ((v.bounds.max[2] - v.bounds.min[2]) / 2) * p.scale;
    const cos = Math.cos(p.rotationY);
    const sin = Math.sin(p.rotationY);
    const R = Math.hypot(hx, hz) * sc;
    const cx = (p.position[0] - t.origin[0]) * sc;
    const cy = (p.position[2] - t.origin[1]) * sc;
    for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
      const dx = (x - cx) / sc;
      const dz = (y - cy) / sc;
      const u = dx * cos - dz * sin;
      const w = dx * sin + dz * cos;
      if (Math.abs(u) <= hx && Math.abs(w) <= hz) set(x, y, c, w > 0 ? 0.8 : 1.1);
    }
  };
  const order = { prop: 0, path: 0, rock: 1, vegetation: 2, building: 3, landmark: 4 } as Record<string, number>;
  for (const p of [...bake.placements].sort((a, b) => (order[a.category] ?? 0) - (order[b.category] ?? 0))) {
    const v = bake.prefabs[p.prefab]?.[p.variant];
    if (!v || p.prefab === "ground_block" || p.prefab === "road_strip") continue;
    const tall = v.bounds.max[1] * p.scale;
    if (p.category === "vegetation" && tall > 8) {
      const dark = /pine|cypress|spruce/.test(p.prefab);
      disc(p.position[0] + 2, p.position[2] + 2, v.footprintRadius * p.scale * 0.6, [30, 48, 30], false, 0.35);
      disc(p.position[0], p.position[2], v.footprintRadius * p.scale * 0.55, dark ? [38, 84, 56] : /dead|burnt/.test(p.prefab) ? [110, 96, 82] : /birch|cherry/.test(p.prefab) ? [124, 146, 62] : [66, 112, 48]);
    } else if (p.category === "building" && p.prefab !== "bridge") box(p, [176, 74, 52]);
    else if (p.category === "landmark") box(p, [226, 214, 190]);
    else if (p.prefab === "farm_field" || p.prefab === "crop_plot") box(p, p.variant % 2 ? [214, 168, 70] : [168, 176, 72]);
    else if (p.prefab === "town_wall" || p.prefab === "gate_tower") box(p, [120, 118, 116]);
    else if (p.category === "rock" && tall > 4) disc(p.position[0], p.position[2], v.footprintRadius * p.scale * 0.5, [150, 146, 140]);
  }
  disc(bake.spawn.position[0], bake.spawn.position[2], 9, [250, 60, 220], false);
  for (const z of bake.zones) if (z.meta?.kind === "viewpoint" || z.meta?.kind === "secret") disc(z.center[0], z.center[1], 7, z.meta.kind === "secret" ? [255, 230, 40] : [60, 240, 255], false);
  return { width: px, height, data };
}
