import { TERRAIN_MATERIAL_INDEX, deriveSeed, type Placement, type PrefabVariant, type Vec2, type Vec3 } from "@worldforge/core";
import { Rng } from "@worldforge/core";
import { progress, slopeAtWorld, type GenContext, type SettlementSite } from "../context";
import { flattenArea } from "./sites";

const MAX_BUILDING_SLOPE = 0.21; // ~12°

/**
 * Stage 11: settlement buildings.
 * Organic layout around a plaza: houses face the center or the road, spacing enforced by
 * footprint circles, slope constraint enforced (terrain is flattened under each footprint).
 */
export function placeBuildings(ctx: GenContext): void {
  const rng = new Rng(deriveSeed(ctx.seed, "buildings"));
  let idx = 0;
  for (const site of ctx.sites) {
    progress(ctx, `buildings:${site.id}`, idx++ / Math.max(1, ctx.sites.length));
    layoutSettlement(ctx, site, rng);
  }
  progress(ctx, "buildings:done", 1);
}

function layoutSettlement(ctx: GenContext, site: SettlementSite, rng: Rng): void {
  const s = site.spec;
  const cottages = ctx.prefabs["cottage"] ?? [];
  const ruinWalls = ctx.prefabs["ruin_wall"] ?? [];
  if (cottages.length === 0) return;
  const abandoned = s.type === "abandoned_village" || s.type === "ruined_town";
  const ruinRatio = s.type === "ruined_town" ? 0.55 : abandoned ? 0.25 : 0;
  const count = s.buildings;
  const plazaR = 16 + count * 1.6;
  const placed: Placement[] = [];
  const centerY = site.baseHeight;

  const tryPlace = (prefab: string, variants: PrefabVariant[], angle: number, radius: number, faceCenter: boolean): boolean => {
    const v = rng.int(0, variants.length - 1);
    const variant = variants[v]!;
    const x = site.center[0] + Math.cos(angle) * radius;
    const z = site.center[1] + Math.sin(angle) * radius;
    const foot = variant.footprintRadius;
    // road avoidance: keep the footprint off the road
    const rd = ctx.roadDistance.sample(x, z);
    if (rd < foot * 0.75) return false;
    // occupancy
    for (const o of ctx.occupants) {
      if (o.kind === "keep") {
        if (Math.hypot(x - o.position[0], z - o.position[2]) < o.radius + foot * 0.6) return false;
        continue;
      }
      if (Math.hypot(x - o.position[0], z - o.position[2]) < o.radius + foot + 3) return false;
    }
    // water
    if (ctx.waterDistance.sample(x, z) < foot + 4) return false;
    // slope check (before flattening) — reject extreme sites
    if (slopeAtWorld(ctx, x, z) > 0.6) return false;
    // flatten footprint, then verify slope
    const base = flattenArea(ctx, [x, z], foot * 1.15, 1.0);
    if (slopeAtWorld(ctx, x, z) > MAX_BUILDING_SLOPE) return false;
    // face the center (front is -Z in prefab space): rotationY such that -Z points to center
    // prefab front is -Z; rotating by θ around Y maps -Z to (-sin θ, 0, -cos θ) → θ = atan2(-dx, -dz)
    const toCenter = Math.atan2(-(site.center[0] - x), -(site.center[1] - z));
    let rotY = faceCenter ? toCenter : rng.float(0, Math.PI * 2);
    rotY += ((rng.next() * 2 - 1) * Math.PI * 12) / 180;
    const scale = 1 + (rng.next() * 2 - 1) * ctx.style.architecture.scaleVariance * 0.5;
    const position: Vec3 = [x, base, z];
    const p: Placement = {
      id: `${site.id}_${prefab}_${placed.length}`,
      prefab,
      variant: v,
      category: "building",
      position,
      rotationY: rotY,
      scale,
      layer: "midground",
      zone: site.id,
      importance: 9,
    };
    placed.push(p);
    ctx.placements.push(p);
    ctx.occupants.push({ position, radius: foot * scale, kind: "building" });
    // ground material under the footprint
    markGround(ctx, [x, z], foot * 0.9);
    return true;
  };

  // ring 1
  const n1 = Math.min(count, 8);
  const baseAngle = rng.float(0, Math.PI * 2);
  let placedCount = 0;
  for (let i = 0; i < n1; i++) {
    const a = baseAngle + (i / n1) * Math.PI * 2 + (rng.next() - 0.5) * (Math.PI / n1) * 0.9;
    let ok = false;
    for (let attempt = 0; attempt < 14 && !ok; attempt++) {
      const r = plazaR + 8 + attempt * 4 + rng.float(0, 8);
      const useRuin = rng.chance(ruinRatio) && ruinWalls.length > 0;
      ok = tryPlace(useRuin ? "ruin_wall" : "cottage", useRuin ? ruinWalls : cottages, a + (rng.next() - 0.5) * (0.2 + attempt * 0.06), r, true);
    }
    if (ok) placedCount++;
  }
  // ring 2
  const n2 = count - n1;
  for (let i = 0; i < n2; i++) {
    const a = baseAngle + (i / Math.max(1, n2)) * Math.PI * 2 + Math.PI / Math.max(1, n2) + (rng.next() - 0.5) * 0.4;
    let ok = false;
    for (let attempt = 0; attempt < 14 && !ok; attempt++) {
      const r = plazaR + 40 + attempt * 5 + rng.float(0, 12);
      const useRuin = rng.chance(ruinRatio) && ruinWalls.length > 0;
      ok = tryPlace(useRuin ? "ruin_wall" : "cottage", useRuin ? ruinWalls : cottages, a + (rng.next() - 0.5) * attempt * 0.08, r, rng.chance(0.6));
    }
    if (ok) placedCount++;
  }
  // fallback: fill missing houses anywhere around the site
  for (let extra = 0; placedCount < count && extra < 40; extra++) {
    const a = rng.float(0, Math.PI * 2);
    const r = plazaR + 10 + rng.float(0, site.radius * 0.8);
    if (tryPlace("cottage", cottages, a, r, rng.chance(0.5))) placedCount++;
  }
  // paved plaza (cobblestone core, packed earth ring) — reads as a real village square
  if (s.type !== "camp") paveDisc(ctx, site.center, plazaR * 0.75, TERRAIN_MATERIAL_INDEX.Cobblestone);
  paveDisc(ctx, site.center, plazaR * 0.75 + 5, TERRAIN_MATERIAL_INDEX.Ground, true);

  // well or campfire at the plaza
  const centerPrefab = s.type === "camp" ? "campfire" : "well";
  const cv = ctx.prefabs[centerPrefab];
  if (cv && cv.length > 0 && ctx.spec.props.sets.includes("village")) {
    const cx = site.center[0] + rng.float(-4, 4);
    const cz = site.center[1] + rng.float(-4, 4);
    const y = ctx.heights.sample(cx, cz);
    const p: Placement = {
      id: `${site.id}_${centerPrefab}`,
      prefab: centerPrefab,
      variant: rng.int(0, cv.length - 1),
      category: centerPrefab === "well" ? "building" : "prop",
      position: [cx, y, cz],
      rotationY: rng.float(0, Math.PI * 2),
      scale: 1,
      layer: "midground",
      zone: site.id,
      importance: 8,
    };
    ctx.placements.push(p);
    ctx.occupants.push({ position: p.position, radius: cv[p.variant]!.footprintRadius + 2, kind: "building" });
  }
  void centerY;
  void placedCount;
}

/** Paints a disc of terrain material; `ringOnly` keeps existing Cobblestone (paints the surroundings only). */
function paveDisc(ctx: GenContext, c: Vec2, r: number, material: number, ringOnly = false): void {
  const h = ctx.heights;
  const [cx, cz] = h.toCell(c[0], c[1]);
  const rc = Math.ceil(r / ctx.cellSize);
  for (let dz = -rc; dz <= rc; dz++) {
    for (let dx = -rc; dx <= rc; dx++) {
      const x = Math.round(cx) + dx;
      const z = Math.round(cz) + dz;
      if (x < 0 || z < 0 || x >= ctx.width || z >= ctx.depth) continue;
      const [wx, wz] = h.toWorld(x, z);
      if (Math.hypot(wx - c[0], wz - c[1]) > r) continue;
      const i = z * ctx.width + x;
      if (ctx.materials[i] === TERRAIN_MATERIAL_INDEX.Water) continue;
      if (ringOnly && ctx.materials[i] === TERRAIN_MATERIAL_INDEX.Cobblestone) continue;
      ctx.materials[i] = material;
    }
  }
}

function markGround(ctx: GenContext, c: Vec2, r: number): void {
  const h = ctx.heights;
  const [cx, cz] = h.toCell(c[0], c[1]);
  const rc = Math.ceil(r / ctx.cellSize);
  for (let dz = -rc; dz <= rc; dz++) {
    for (let dx = -rc; dx <= rc; dx++) {
      const x = Math.round(cx) + dx;
      const z = Math.round(cz) + dz;
      if (x < 0 || z < 0 || x >= ctx.width || z >= ctx.depth) continue;
      const [wx, wz] = h.toWorld(x, z);
      if (Math.hypot(wx - c[0], wz - c[1]) > r) continue;
      const i = z * ctx.width + x;
      if (ctx.materials[i] !== TERRAIN_MATERIAL_INDEX.Water) ctx.materials[i] = TERRAIN_MATERIAL_INDEX.Ground;
    }
  }
}
