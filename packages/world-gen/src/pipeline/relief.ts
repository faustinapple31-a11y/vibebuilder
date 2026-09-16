import { Rng, deriveSeed, type Placement, type TerrainMaterial, type TerrainOp, type Vec2, type Vec3 } from "@worldforge/core";
import { Simplex2D } from "../noise";
import { inBounds, isWaterAt, progress, seaLevelOf, slopeAtWorld, type GenContext } from "../context";
import { SpatialHash } from "../grid";

/**
 * Stage 10c: 3D relief — what a heightmap cannot express. Emits terrain voxel ops the runtime applies
 * after the columns (`Terrain:FillBall / FillBlock / FillCylinder`, Air to carve):
 *  - caves: a tunnel from every `cave` landmark into the hillside, a chamber at the end, crystals /
 *    mushrooms / a chest inside (placements with `fixed` heights, a `cave` gameplay zone),
 *  - rock overhangs (ledges) on steep rocky slopes,
 *  - natural arches on cliffs and coasts,
 *  - lava lakes in volcano craters.
 */
export function placeRelief(ctx: GenContext): void {
  const rng = new Rng(deriveSeed(ctx.seed, "relief"));
  progress(ctx, "relief:caves", 0);
  carveCaves(ctx, rng);
  progress(ctx, "relief:overhangs", 0.4);
  addOverhangs(ctx, rng);
  progress(ctx, "relief:arches", 0.7);
  addArches(ctx, rng);
  addLava(ctx);
  progress(ctx, "relief:done", 1);
}

const rockMaterial = (ctx: GenContext): TerrainMaterial => {
  const m = ctx.style.materials.rock;
  return m === "Basalt" || m === "Slate" || m === "Sandstone" || m === "Limestone" ? m : "Rock";
};

/** Downhill unit direction at (x, z) from central differences. */
function downhill(ctx: GenContext, x: number, z: number, r = 6): Vec2 {
  const h = ctx.heights;
  const dx = h.sample(x + r, z) - h.sample(x - r, z);
  const dz = h.sample(x, z + r) - h.sample(x, z - r);
  const len = Math.hypot(dx, dz) || 1;
  return [-dx / len, -dz / len];
}

// ---------------------------------------------------------------- caves
function carveCaves(ctx: GenContext, rng: Rng): void {
  const wobble = new Simplex2D(deriveSeed(ctx.seed, "cave-wobble"));
  let n = 0;
  for (const lm of ctx.landmarks) {
    if (lm.type !== "cave") continue;
    const placement = ctx.placements.find((p) => p.id === `landmark_${lm.id}`);
    if (!placement) continue;
    const [ex, ey, ez] = lm.position;
    // the mouth faces downhill, the tunnel climbs into the slope
    const [dx, dz] = downhill(ctx, ex, ez, 10);
    const inward: Vec2 = [-dx, -dz];
    placement.rotationY = Math.atan2(-dx, -dz);
    const R = 6.5;
    let x = ex + inward[0] * 4;
    let z = ez + inward[1] * 4;
    let y = ey + R - 1.5;
    const length = rng.int(9, 13);
    let heading = Math.atan2(inward[1], inward[0]);
    const floorPts: Vec3[] = [];
    for (let i = 0; i < length; i++) {
      ctx.terrainOps.push({ op: "carve", shape: "ball", position: [x, y, z], radius: R + (i === 0 ? 0.5 : rng.float(-0.4, 0.6)), zone: lm.id });
      floorPts.push([x, y - R + 1.2, z]);
      heading += wobble.noise2(i * 0.7 + n * 10, 3) * 0.35;
      const step = R * 1.15;
      x += Math.cos(heading) * step;
      z += Math.sin(heading) * step;
      // gently descending, and always deep enough under the surface
      const surface = ctx.heights.sample(x, z);
      y = Math.min(y - 0.6, surface - R - 5);
      if (!inBounds(ctx, x, z, 30)) break;
    }
    // chamber
    const CR = rng.float(13, 17);
    const cy = y - 2;
    ctx.terrainOps.push({ op: "carve", shape: "ball", position: [x, cy, z], radius: CR, zone: lm.id });
    ctx.terrainOps.push({ op: "carve", shape: "ball", position: [x + Math.cos(heading) * CR * 0.5, cy + 3, z + Math.sin(heading) * CR * 0.5], radius: CR * 0.7, zone: lm.id });
    const floorY = cy - CR + 1.5;
    // interior: crystals around the walls, mushrooms, a chest / campfire in the middle
    const add = (prefab: string, px: number, py: number, pz: number, scale = 1, importance = 8) => {
      const variants = ctx.prefabs[prefab];
      if (!variants?.length) return;
      const vi = rng.int(0, variants.length - 1);
      const p: Placement = { id: `cave_${lm.id}_${prefab}_${ctx.placements.length}`, prefab, variant: vi, category: variants[vi]!.category, position: [px, py, pz], rotationY: rng.float(0, Math.PI * 2), scale, layer: "midground", zone: lm.id, importance, fixed: true };
      ctx.placements.push(p);
    };
    const rim = CR * 0.62;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + rng.float(-0.3, 0.3);
      const px = x + Math.cos(a) * rim;
      const pz = z + Math.sin(a) * rim;
      // wall height at that radius on the sphere: keep crystals on the floor ring
      add(k % 2 === 0 ? "crystal_cluster" : "small_mushroom", px, floorY + 0.4, pz, rng.float(0.8, 1.4), 7);
    }
    if (ctx.prefabs["treasure_chest"]?.length) add("treasure_chest", x + 2, floorY, z - 1, 1, 9);
    else if (ctx.prefabs["campfire"]?.length) add("campfire", x, floorY, z, 1, 8);
    for (const [px, py, pz] of floorPts.filter((_, i) => i % 4 === 2)) add("small_mushroom", px + rng.float(-2, 2), py, pz + rng.float(-2, 2), rng.float(0.7, 1.1), 4);
    if (ctx.prefabs["torch_post"]?.length) {
      const t0 = floorPts[Math.min(1, floorPts.length - 1)]!;
      add("torch_post", t0[0], t0[1], t0[2], 0.8, 6);
    }
    ctx.zones.push({ id: `${lm.id}_chamber`, kind: "gameplay", polygon: [], center: [x, z], radius: CR, y: floorY + 2, meta: { kind: "cave", landmark: lm.id } });
    n++;
  }
}

// ---------------------------------------------------------------- overhangs
function addOverhangs(ctx: GenContext, rng: Rng): void {
  const { spec } = ctx;
  const rocky = spec.biomes.some((b) => b.id === "rocky" || b.id === "highlands" || b.id === "volcanic" || b.id === "alien" || b.id === "moon" || b.id === "desert") || spec.terrain.features.some((f) => f.type === "mountains" || f.type === "cliffs");
  if (!rocky) return;
  const hash = new SpatialHash<{ position: [number, number, number]; radius: number }>(32);
  for (const o of ctx.occupants) hash.insert({ position: o.position, radius: o.radius });
  const mat = rockMaterial(ctx);
  const want = 6 + Math.round(spec.terrain.relief * 8);
  let placed = 0;
  const sea = seaLevelOf(spec);
  for (let attempt = 0; attempt < 400 && placed < want; attempt++) {
    const x = rng.float(ctx.origin[0] + 40, ctx.origin[0] + ctx.worldW - 40);
    const z = rng.float(ctx.origin[1] + 40, ctx.origin[1] + ctx.worldD - 40);
    const s = slopeAtWorld(ctx, x, z);
    if (s < 0.7 || isWaterAt(ctx, x, z)) continue;
    const h = ctx.heights.sample(x, z);
    if (Number.isFinite(sea) && h < sea + 6) continue;
    if (ctx.roadDistance.sample(x, z) < 24 || ctx.waterDistance.sample(x, z) < 10) continue;
    if (hash.overlaps(x, z, 16, 6)) continue;
    const [dx, dz] = downhill(ctx, x, z, 8);
    const w = rng.float(14, 26);
    const d = rng.float(8, 13);
    const t = rng.float(3, 5);
    // ledge protruding downhill from the slope, its top a little tilted like a bedding plane
    const px = x + dx * d * 0.35;
    const pz = z + dz * d * 0.35;
    const py = h - t * 0.2;
    ctx.terrainOps.push({ op: "fill", shape: "block", position: [px, py, pz], size: [w, t, d], rotationY: Math.atan2(dx, dz), tilt: rng.float(-0.12, 0.05), material: mat, zone: "overhang" });
    // a second, smaller slab a few studs higher reads as strata
    if (rng.chance(0.6)) ctx.terrainOps.push({ op: "fill", shape: "block", position: [x - dx * 2, h + t * 1.4, z - dz * 2], size: [w * 0.7, t * 0.7, d * 0.7], rotationY: Math.atan2(dx, dz) + rng.float(-0.2, 0.2), tilt: rng.float(-0.1, 0.1), material: mat, zone: "overhang" });
    hash.insert({ position: [x, h, z], radius: 16 });
    ctx.occupants.push({ position: [px, py, pz], radius: w * 0.5, kind: "rock" });
    placed++;
  }
}

// ---------------------------------------------------------------- arches
function addArches(ctx: GenContext, rng: Rng): void {
  const { spec } = ctx;
  const suits = spec.biomes.some((b) => b.id === "rocky" || b.id === "desert" || b.id === "beach" || b.id === "wasteland" || b.id === "alien") || spec.terrain.features.some((f) => f.type === "cliffs" || f.type === "island" || f.type === "coast");
  if (!suits) return;
  const mat = rockMaterial(ctx);
  const want = rng.int(1, 2);
  let placed = 0;
  const sea = seaLevelOf(spec);
  for (let attempt = 0; attempt < 300 && placed < want; attempt++) {
    const x = rng.float(ctx.origin[0] + 60, ctx.origin[0] + ctx.worldW - 60);
    const z = rng.float(ctx.origin[1] + 60, ctx.origin[1] + ctx.worldD - 60);
    if (isWaterAt(ctx, x, z)) continue;
    const h = ctx.heights.sample(x, z);
    const s = slopeAtWorld(ctx, x, z);
    if (s > 0.35) continue;
    if (ctx.roadDistance.sample(x, z) < 30) continue;
    // prefer the shore band on island / coast maps, rocky ground otherwise
    const shore = Number.isFinite(sea) ? h < sea + 12 && ctx.waterDistance.sample(x, z) < 40 : true;
    if (!shore && rng.chance(0.7)) continue;
    let clash = false;
    for (const o of ctx.occupants) if (Math.hypot(x - o.position[0], z - o.position[2]) < o.radius + 30) clash = true;
    if (clash) continue;
    const span = rng.float(30, 44);
    const rotY = rng.float(0, Math.PI);
    const ux = Math.cos(rotY);
    const uz = -Math.sin(rotY);
    const legH = rng.float(16, 24);
    const legW = rng.float(7, 10);
    const thick = rng.float(6, 9);
    for (const sgn of [-1, 1]) {
      const lx = x + ux * sgn * (span / 2 - legW / 2);
      const lz = z + uz * sgn * (span / 2 - legW / 2);
      const lh = ctx.heights.sample(lx, lz);
      ctx.terrainOps.push({ op: "fill", shape: "block", position: [lx, (lh - 4 + h + legH) / 2, lz], size: [legW, h + legH - (lh - 4), thick], rotationY: rotY, material: mat, zone: "arch" });
    }
    ctx.terrainOps.push({ op: "fill", shape: "block", position: [x, h + legH + thick * 0.35, z], size: [span + 2, thick * 0.9, thick], rotationY: rotY, tilt: 0, material: mat, zone: "arch" });
    // round the opening: carve a ball under the span so it reads as a natural arch, not a gate
    ctx.terrainOps.push({ op: "carve", shape: "ball", position: [x, h + legH * 0.55, z], radius: legH * 0.5, zone: "arch" });
    ctx.occupants.push({ position: [x, h, z], radius: span * 0.55, kind: "rock" });
    placed++;
  }
}

// ---------------------------------------------------------------- lava
function addLava(ctx: GenContext): void {
  const volcano = ctx.spec.landmarks.some((l) => l.type === "volcano");
  const crater = ctx.spec.terrain.features.find((f) => f.type === "crater");
  if (!crater || !(volcano || ctx.style.kits.biomes.includes("volcanic") || ctx.spec.biomes.some((b) => b.id === "volcanic"))) return;
  const c: Vec2 = [ctx.origin[0] + crater.center[0] * ctx.worldW, ctx.origin[1] + crater.center[1] * ctx.worldD];
  const r = crater.radius * Math.max(ctx.worldW, ctx.worldD);
  // lava lake at the bowl floor
  let floor = Infinity;
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    floor = Math.min(floor, ctx.heights.sample(c[0] + Math.cos(a) * r * 0.3, c[1] + Math.sin(a) * r * 0.3));
  }
  floor = Math.min(floor, ctx.heights.sample(c[0], c[1]));
  ctx.terrainOps.push({ op: "fill", shape: "cylinder", position: [c[0], floor + 1.5, c[1]], radius: r * 0.42, height: 3, material: "CrackedLava", zone: "volcano" });
  ctx.zones.push({ id: "lava_lake", kind: "gameplay", polygon: [], center: c, radius: r * 0.42, y: floor + 3, meta: { kind: "lava" } });
}
