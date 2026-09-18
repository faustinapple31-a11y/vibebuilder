import { TERRAIN_MATERIAL_INDEX, deriveSeed, type Placement, type PrefabVariant, type Vec2, type Vec3 } from "@worldforge/core";
import { Rng } from "@worldforge/core";
import { layerFor, progress, slopeAtWorld, type GenContext, type SettlementSite } from "../context";
import { flattenArea } from "./sites";
import { carveRoad, refreshRoadDistance } from "./roads";

/** Building prefab mix per settlement type (weights); every prefab is generated with the style's architecture kit. */
function prefabMix(ctx: GenContext, s: SettlementSite["spec"]): { item: string; weight: number }[] {
  const has = (id: string) => (ctx.prefabs[id]?.length ?? 0) > 0;
  const mix: { item: string; weight: number }[] = [];
  const push = (id: string, w: number) => has(id) && mix.push({ item: id, weight: w });
  switch (s.type) {
    case "city_district":
      push("apartment_block", 0.5);
      push("skyscraper", 0.2);
      push("shop_building", 0.3);
      break;
    case "town":
      push("house", 0.45);
      push("house_large", 0.3);
      push("shop_building", 0.25);
      break;
    case "base":
      push("house", 0.55);
      push("house_large", 0.45);
      break;
    case "harbor":
      push("house", 0.5);
      push("shop_building", 0.3);
      push("house_large", 0.2);
      break;
    case "farmstead":
      push("house", 0.6);
      push("house_large", 0.4);
      break;
    case "camp":
    case "outpost":
      push("house", 0.8);
      push("house_large", 0.2);
      break;
    default:
      push("house", 0.75);
      push("house_large", 0.25);
  }
  if (mix.length === 0 && has("cottage")) mix.push({ item: "cottage", weight: 1 });
  return mix;
}

/** Street type for grid settlements from the style's road kit. */
function streetType(ctx: GenContext): string {
  return ctx.style.kits.road;
}

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
  const mix = prefabMix(ctx, s);
  const ruinWalls = ctx.prefabs["ruin_wall"] ?? [];
  if (mix.length === 0) return;
  const pick = (): [string, PrefabVariant[]] => {
    const id = rng.weighted(mix);
    return [id, ctx.prefabs[id] ?? []];
  };
  const gridLike = s.layout === "grid" || (s.layout === "organic" && (s.type === "city_district" || s.type === "town" || s.type === "base"));
  if (gridLike) {
    layoutGrid(ctx, site, rng, pick);
    return;
  }
  const cottages = ctx.prefabs[mix[0]!.item] ?? [];
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
    const base = flattenArea(ctx, [x, z], foot * 1.5, 1.0, undefined, 0.78);
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
      layer: layerFor(ctx, position[0], position[2], true),
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
      const [pid, pv] = pick();
      ok = tryPlace(useRuin ? "ruin_wall" : pid, useRuin ? ruinWalls : pv, a + (rng.next() - 0.5) * (0.2 + attempt * 0.06), r, true);
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
      const [pid, pv] = pick();
      ok = tryPlace(useRuin ? "ruin_wall" : pid, useRuin ? ruinWalls : pv, a + (rng.next() - 0.5) * attempt * 0.08, r, rng.chance(0.6));
    }
    if (ok) placedCount++;
  }
  // fallback: fill missing houses anywhere around the site
  for (let extra = 0; placedCount < count && extra < 40; extra++) {
    const a = rng.float(0, Math.PI * 2);
    const r = plazaR + 10 + rng.float(0, site.radius * 0.8);
    const [pid, pv] = pick();
    if (tryPlace(pid, pv, a, r, rng.chance(0.5))) placedCount++;
  }
  void cottages;
  // paved plaza (cobblestone core, packed earth ring) — reads as a real village square
  const plazaMat = ctx.style.kits.road === "asphalt_road" || ctx.style.kits.road === "concrete_road" || ctx.style.kits.road === "neon_road" ? TERRAIN_MATERIAL_INDEX.Pavement : ctx.style.kits.road === "sand_path" ? TERRAIN_MATERIAL_INDEX.Sandstone : ctx.style.kits.road === "metal_walkway" ? TERRAIN_MATERIAL_INDEX.Slate : TERRAIN_MATERIAL_INDEX.Cobblestone;
  if (s.type !== "camp") paveDisc(ctx, site.center, plazaR * 0.75, plazaMat);
  paveDisc(ctx, site.center, plazaR * 0.75 + 5, ctx.style.kits.road === "snow_path" ? TERRAIN_MATERIAL_INDEX.Snow : TERRAIN_MATERIAL_INDEX.Ground, true);

  // well or campfire at the plaza
  const centerPrefab = s.type === "camp" ? "campfire" : "well";
  const cv = ctx.prefabs[centerPrefab];
  if (cv && cv.length > 0 && ctx.spec.props.sets.includes("village")) {
    // a road usually crosses the plaza, and a well in the middle of the carriageway is the first thing
    // anyone notices: try a few spots around the centre and keep the one with the most clearance
    const foot = cv[0]!.footprintRadius;
    let cx = site.center[0];
    let cz = site.center[1];
    let clearest = ctx.roadDistance.sample(cx, cz) - foot;
    for (let attempt = 0; attempt < 12 && clearest < 1; attempt++) {
      const a = rng.float(0, Math.PI * 2);
      const r = rng.float(3, Math.max(6, site.radius * 0.3));
      const px = site.center[0] + Math.cos(a) * r;
      const pz = site.center[1] + Math.sin(a) * r;
      const clear = ctx.roadDistance.sample(px, pz) - foot;
      if (clear > clearest) {
        clearest = clear;
        cx = px;
        cz = pz;
      }
    }
    if (clearest < 0.5) return; // the plaza is all road here: no centrepiece rather than one standing in it
    const y = ctx.heights.sample(cx, cz);
    const p: Placement = {
      id: `${site.id}_${centerPrefab}`,
      prefab: centerPrefab,
      variant: rng.int(0, cv.length - 1),
      category: centerPrefab === "well" ? "building" : "prop",
      position: [cx, y, cz],
      rotationY: rng.float(0, Math.PI * 2),
      scale: 1,
      layer: layerFor(ctx, cx, cz, true),
      zone: site.id,
      importance: 8,
    };
    ctx.placements.push(p);
    ctx.occupants.push({ position: p.position, radius: cv[p.variant]!.footprintRadius + 2, kind: "building" });
  }
  void centerY;
  void placedCount;
}

/**
 * Grid layout for towns, city districts and bases: streets every block, buildings aligned to the
 * street they face, central block kept as a plaza. Streets are real road polylines (carved, marked
 * with the style's road material) so street props, lights and vehicles follow them.
 */
function layoutGrid(ctx: GenContext, site: SettlementSite, rng: Rng, pick: () => [string, PrefabVariant[]]): void {
  const s = site.spec;
  const R = site.radius;
  const city = s.type === "city_district";
  const streetW = city ? 14 : 10;
  const avgFoot = (() => {
    const [, pv] = pick();
    return pv[0]?.footprintRadius ?? 12;
  })();
  const cell = avgFoot * 2 + 6 + streetW; // block pitch
  // grid just big enough for the requested buildings (plus the plaza cell), capped by the site radius
  const half = Math.min(Math.floor(R / cell), Math.max(1, Math.ceil((Math.sqrt(s.buildings + 2) - 1) / 2)));
  if (half < 1) return;
  const yaw = rng.float(0, Math.PI / 2);
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const toWorld = (gx: number, gz: number): Vec2 => [site.center[0] + gx * cosY - gz * sinY, site.center[1] + gx * sinY + gz * cosY];
  // streets: lines through the grid (offset by half a cell so buildings sit between them)
  const type = streetType(ctx);
  for (let i = -half; i <= half + 1; i++) {
    const c = (i - 0.5) * cell;
    const a = toWorld(c, -(half + 0.5) * cell);
    const b = toWorld(c, (half + 0.5) * cell);
    const a2 = toWorld(-(half + 0.5) * cell, c);
    const b2 = toWorld((half + 0.5) * cell, c);
    for (const [pts, id] of [
      [[a, b], `${site.id}_street_x${i}`],
      [[a2, b2], `${site.id}_street_z${i}`],
    ] as [Vec2[], string][]) {
      const points = resample(pts[0]!, pts[1]!, ctx.cellSize * 2);
      ctx.paths.push({ id, kind: "road", type, points, width: streetW });
      carveRoad(ctx, points, streetW, type);
    }
  }
  refreshRoadDistance(ctx);
  // blocks → buildings
  let placed = 0;
  const target = s.buildings;
  const cells: [number, number][] = [];
  for (let gx = -half; gx <= half; gx++) for (let gz = -half; gz <= half; gz++) cells.push([gx, gz]);
  cells.sort((p, q) => Math.hypot(p[0], p[1]) - Math.hypot(q[0], q[1]));
  for (const [gx, gz] of cells) {
    if (placed >= target) break;
    if (gx === 0 && gz === 0 && !city) continue; // plaza
    const [pid, pv] = pick();
    if (pv.length === 0) continue;
    const vi = rng.int(0, pv.length - 1);
    const v = pv[vi]!;
    const c = toWorld(gx * cell, gz * cell);
    // face the nearest street: -Z of the prefab points toward the street side chosen by the cell parity
    const faceX = Math.abs(gx) >= Math.abs(gz);
    const dir = faceX ? [-Math.sign(gx || 1) * cosY, -Math.sign(gx || 1) * sinY] : [Math.sign(gz || 1) * sinY, -Math.sign(gz || 1) * cosY];
    const rotY = Math.atan2(-dir[0]!, -dir[1]!) + yaw * 0;
    const x = c[0];
    const z = c[1];
    if (ctx.waterDistance.sample(x, z) < v.footprintRadius + 3) continue;
    // the grid carves its own streets, but a road routed before the district can cross a block: without
    // this a tower ends up in the middle of the main road (the organic layout already keeps a clearance)
    if (ctx.roadDistance.sample(x, z) < v.footprintRadius * 0.75) continue;
    if (slopeAtWorld(ctx, x, z) > 0.55) continue;
    let blockedByLandmark = false;
    for (const o of ctx.occupants) if (o.kind === "landmark" && Math.hypot(x - o.position[0], z - o.position[2]) < o.radius + v.footprintRadius * 0.6) blockedByLandmark = true;
    if (blockedByLandmark) continue;
    const base = flattenArea(ctx, [x, z], v.footprintRadius * 1.5, 1.0, undefined, 0.78);
    if (slopeAtWorld(ctx, x, z) > MAX_BUILDING_SLOPE) continue;
    const scale = 1 + (rng.next() * 2 - 1) * ctx.style.architecture.scaleVariance * 0.3;
    const position: Vec3 = [x, base, z];
    const p: Placement = { id: `${site.id}_${pid}_${placed}`, prefab: pid, variant: vi, category: "building", position, rotationY: rotY, scale, layer: layerFor(ctx, position[0], position[2], true), zone: site.id, importance: 9 };
    ctx.placements.push(p);
    ctx.occupants.push({ position, radius: v.footprintRadius * scale, kind: "building" });
    placed++;
  }
  // paved core (plaza) for towns
  const plazaMat = type === "asphalt_road" || type === "concrete_road" || type === "neon_road" ? TERRAIN_MATERIAL_INDEX.Pavement : type === "metal_walkway" ? TERRAIN_MATERIAL_INDEX.Slate : type === "sand_path" ? TERRAIN_MATERIAL_INDEX.Sandstone : TERRAIN_MATERIAL_INDEX.Cobblestone;
  if (!city) paveDisc(ctx, site.center, cell * 0.45, plazaMat);
}

function resample(a: Vec2, b: Vec2, step: number): Vec2[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(2, Math.ceil(len / step));
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return out;
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
