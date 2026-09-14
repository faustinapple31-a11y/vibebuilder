import { TERRAIN_MATERIAL_INDEX, deriveSeed, mixHex, type Placement, type PrefabVariant, type Vec2, type Vec3 } from "@worldforge/core";
import { Rng } from "@worldforge/core";
import { PartListBuilder } from "@worldforge/prefabs";
import { inBounds, progress, slopeAtWorld, type GenContext } from "../context";
import { carveRoad, refreshRoadDistance } from "./roads";
import { flattenArea } from "./sites";

/**
 * Stage: gameplay layout archetypes. Lays the structures a genre needs on top of the terrain —
 * obby stages, an arena, a race track, tycoon plots, a minigame lobby with portals, a tower-defense
 * path, a sports field, a hangout plaza, a dungeon, story checkpoints. Geometry is generated as
 * on-the-fly prefab variants; every gameplay anchor becomes a `gameplay` zone with `meta`
 * attributes the roblox-ts systems read from `World/Zones` (stage index, plot index, team, …).
 */
export function placeLayout(ctx: GenContext): void {
  const { spec, style } = ctx;
  const layout = spec.layout;
  if (!layout || layout.archetype === "settlement" || layout.archetype === "open_world" || layout.archetype === "campus" || layout.archetype === "island") return;
  const rng = new Rng(deriveSeed(ctx.seed, "layout"));
  progress(ctx, `layout:${layout.archetype}`, 0);
  const accent = layout.color ?? style.palette.accent;
  const glow = style.palette.glow;
  const stone = style.palette.stone;
  const size = Math.min(ctx.worldW, ctx.worldD);
  const center = layoutCenter(ctx, layout.position);
  const extent = layout.extent * size * 0.5;

  const api: LayoutApi = {
    ctx,
    rng,
    accent,
    glow,
    stone,
    n: 0,
    place(prefab, variant, pos, rotY, zoneId, meta, radius) {
      const id = `${prefab}/${ctx.prefabs[prefab]?.length ?? 0}`;
      const list = ctx.prefabs[prefab] ?? (ctx.prefabs[prefab] = []);
      const vi = list.length;
      list.push({ ...variant, id, prefab });
      const p: Placement = { id: `layout_${api.n++}`, prefab, variant: vi, category: "building", position: pos, rotationY: rotY, scale: 1, layer: "midground", zone: zoneId, importance: 9.5 };
      ctx.placements.push(p);
      ctx.occupants.push({ position: pos, radius: radius ?? variant.footprintRadius, kind: "building" });
      if (zoneId) ctx.zones.push({ id: zoneId, kind: "gameplay", polygon: [], center: [pos[0], pos[2]], radius: radius ?? variant.footprintRadius, y: pos[1], meta: { archetype: layout.archetype, ...(meta ?? {}) } });
    },
    zone(id, x, z, radius, meta, y) {
      ctx.zones.push({ id, kind: "gameplay", polygon: [], center: [x, z], radius, y, meta: { archetype: layout.archetype, ...(meta ?? {}) } });
    },
  };

  switch (layout.archetype) {
    case "obby_course":
      obbyCourse(api, layout.count, layout.intensity, extent);
      break;
    case "arena":
      arena(api, center, Math.min(extent, 90), layout.count, layout.intensity);
      break;
    case "race_track":
      raceTrack(api, center, extent, layout.count);
      break;
    case "tycoon_plots":
      tycoonPlots(api, center, extent, layout.count);
      break;
    case "lobby_portals":
      lobbyPortals(api, center, layout.count);
      break;
    case "base_defense":
      baseDefense(api, center, extent, layout.count, layout.intensity);
      break;
    case "sports_field":
      sportsField(api, center);
      break;
    case "hangout_plaza":
      hangoutPlaza(api, center, Math.min(extent, 70));
      break;
    case "dungeon":
      dungeon(api, center, layout.count, layout.intensity);
      break;
    case "linear_story":
      storyCheckpoints(api, layout.count);
      break;
  }
  refreshRoadDistance(ctx);
  progress(ctx, "layout:done", 1);
}

interface LayoutApi {
  ctx: GenContext;
  rng: Rng;
  accent: string;
  glow: string;
  stone: string;
  n: number;
  place(prefab: string, variant: PrefabVariant, pos: Vec3, rotY: number, zoneId?: string, meta?: Record<string, string | number>, radius?: number): void;
  zone(id: string, x: number, z: number, radius: number, meta?: Record<string, string | number>, y?: number): void;
}

function layoutCenter(ctx: GenContext, position?: [number, number]): Vec2 {
  if (position) return [ctx.origin[0] + position[0] * ctx.worldW, ctx.origin[1] + position[1] * ctx.worldD];
  // default: between the spawn and the map centre, away from the first settlement
  const cx = ctx.origin[0] + ctx.worldW / 2;
  const cz = ctx.origin[1] + ctx.worldD / 2;
  const sp = ctx.spawn.position;
  let x = (sp[0] + cx) / 2;
  let z = (sp[2] + cz) / 2;
  const site = ctx.sites[0];
  if (site && Math.hypot(x - site.center[0], z - site.center[1]) < site.radius * 1.6) {
    const a = Math.atan2(z - site.center[1], x - site.center[0]);
    x = site.center[0] + Math.cos(a) * site.radius * 1.8;
    z = site.center[1] + Math.sin(a) * site.radius * 1.8;
  }
  return [x, z];
}

function ground(ctx: GenContext, x: number, z: number): number {
  return ctx.heights.sample(x, z);
}

function build(b: PartListBuilder, id: string, category: PrefabVariant["category"] = "building"): PrefabVariant {
  return b.build({ id, prefab: id, category, sinkDepth: 0, tags: ["layout"] });
}

// ------------------------------------------------------------------ obby
function obbyCourse(api: LayoutApi, stages: number, intensity: number, extent: number): void {
  const { ctx, rng, accent, glow } = api;
  const sp = ctx.spawn.position;
  const cx = ctx.origin[0] + ctx.worldW / 2;
  const cz = ctx.origin[1] + ctx.worldD / 2;
  let heading = Math.atan2(cz - sp[2], cx - sp[0]);
  let x = sp[0] + Math.cos(heading) * 30;
  let z = sp[2] + Math.sin(heading) * 30;
  let y = ground(ctx, x, z) + 4;
  const palette = ["#e05050", "#e0a040", "#e0e050", "#60d060", "#40b0e0", "#8060e0", "#e060c0"];
  const gap = 5 + intensity * 7;
  const stepsPerStage = 3 + Math.round(intensity * 3);
  const totalLen = stages * stepsPerStage;
  const turnEvery = 6;
  let stepI = 0;
  // highest ground under a platform footprint (centre + 4 offsets): platforms must clear slopes, not just their centre
  const groundMax = (px: number, pz: number, r: number) => Math.max(ground(ctx, px, pz), ground(ctx, px + r, pz), ground(ctx, px - r, pz), ground(ctx, px, pz + r), ground(ctx, px, pz - r));
  // steer: keep the course inside the map and away from hillsides (the heading whose ground ahead rises least)
  const steer = () => {
    const margin = 60;
    const ahead = (h: number, d: number): [number, number] => [x + Math.cos(h) * d, z + Math.sin(h) * d];
    const [ax, az] = ahead(heading, 60);
    if (!inBounds(ctx, ax, az, margin)) heading = Math.atan2(cz - z, cx - x) + rng.float(-0.4, 0.4);
    let best = heading;
    let bestRise = Infinity;
    for (const h of [heading, heading + 0.7, heading - 0.7, heading + 1.4, heading - 1.4]) {
      const [bx, bz] = ahead(h, 34);
      if (!inBounds(ctx, bx, bz, margin)) continue;
      const rise = groundMax(bx, bz, 10) - y;
      if (rise < bestRise) {
        bestRise = rise;
        best = h;
      }
    }
    if (groundMax(ax, az, 10) - y > 6) heading = best;
  };
  for (let s = 0; s < stages; s++) {
    const col = palette[s % palette.length]!;
    // stage platform with checkpoint pad
    const b = new PartListBuilder();
    b.box([0, -1, 0], [16, 2, 16], mixHex(col, "#ffffff", 0.2), { material: "SmoothPlastic", collide: true, lod: 2 });
    b.box([0, 0.15, 0], [6, 0.3, 6], glow, { material: "Neon", collide: true, lod: 1, light: { type: "point", color: glow, brightness: 1, range: 18 } });
    b.box([-7.5, 4, -7.5], [1, 8, 1], col, { material: "SmoothPlastic", collide: false, lod: 0 });
    b.box([-7.5, 8.4, -6], [0.2, 2.4, 3], accent, { material: "Neon", collide: false, lod: 0 }); // flag
    api.place("obby_stage", build(b, "obby_stage"), [x, y, z], 0, `obby_stage_${s + 1}`, { stage: s + 1, kind: s === stages - 1 ? "finish" : "checkpoint" }, 10);
    if (s === 0) ctx.spawn = { position: [x, y + 3, z], lookAt: [x + Math.cos(heading) * 30, y + 3, z + Math.sin(heading) * 30] };
    if (s === stages - 1) break;
    // steps between stages
    for (let k = 0; k < stepsPerStage; k++) {
      stepI++;
      if (stepI % turnEvery === 0) heading += rng.float(-0.9, 0.9);
      steer();
      const kind = rng.next();
      const len = kind < 0.25 ? 14 : 8;
      const w = kind < 0.25 ? 3 : kind < 0.5 ? 6 : 8;
      x += Math.cos(heading) * (len / 2 + gap + 4);
      z += Math.sin(heading) * (len / 2 + gap + 4);
      y += rng.float(1.5, 3.5 + intensity * 2);
      const gY = groundMax(x, z, len / 2);
      if (y < gY + 3) y = gY + 3;
      const pb = new PartListBuilder();
      pb.box([0, -0.75, 0], [w, 1.5, len], col, { material: "SmoothPlastic", collide: true, lod: 2 });
      if (kind > 0.75) {
        // kill-brick hazard on the platform edge
        pb.box([0, 0.35, len * 0.25], [w * 0.6, 0.7, 2.5], "#ff2020", { material: "Neon", collide: true, lod: 1, name: "KillBrick" });
      }
      if (kind >= 0.5 && kind <= 0.75) pb.box([0, 2.5, 0], [1.2, 5, 1.2], mixHex(col, "#000000", 0.2), { material: "SmoothPlastic", collide: true, lod: 0 }); // obstacle pole
      api.place("obby_step", build(pb, "obby_step"), [x, y, z], -heading + Math.PI / 2, undefined, undefined, Math.max(w, len) * 0.6);
    }
    steer();
    x += Math.cos(heading) * (gap + 14);
    z += Math.sin(heading) * (gap + 14);
    y += 2;
    const gY = groundMax(x, z, 9);
    if (y < gY + 3) y = gY + 3;
    void totalLen;
    void extent;
  }
}

// ------------------------------------------------------------------ arena
function arena(api: LayoutApi, c: Vec2, R: number, covers: number, intensity: number): void {
  const { ctx, rng, accent, stone } = api;
  const base = flattenArea(ctx, c, R + 12, 1.0);
  paint(ctx, c, R, ctx.style.kits.road === "metal_walkway" ? TERRAIN_MATERIAL_INDEX.Slate : TERRAIN_MATERIAL_INDEX.Cobblestone);
  // wall ring with 4 entrances
  const segs = 28;
  const wallH = 9;
  for (let i = 0; i < segs; i++) {
    if (i % 7 === 0) continue; // entrance
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const len = 2 * Math.PI * R * (1 / segs) + 0.6;
    const b = new PartListBuilder();
    b.box([0, wallH / 2, 0], [len, wallH, 2.4], stone, { material: ctx.style.materials.stoneWall, collide: true, lod: 2 });
    b.box([0, wallH + 0.6, 0], [len, 1.2, 3.2], mixHex(stone, "#000000", 0.2), { material: ctx.style.materials.stoneWall, collide: true, lod: 1 });
    if (i % 2 === 0) b.box([0, wallH + 2.4, 0], [0.6, 2.6, 0.6], accent, { material: "Neon", collide: false, lod: 0, light: { type: "point", color: accent, brightness: 1, range: 20 } });
    const am = (a0 + a1) / 2;
    api.place("arena_wall", build(b, "arena_wall"), [c[0] + Math.cos(am) * R, base, c[1] + Math.sin(am) * R], -am, undefined, undefined, len * 0.5);
  }
  // covers
  for (let i = 0; i < covers; i++) {
    const a = rng.float(0, Math.PI * 2);
    const r = rng.float(R * 0.2, R * 0.8);
    const b = new PartListBuilder();
    const w = rng.float(4, 8);
    b.box([0, 2, 0], [w, 4 + intensity * 3, 2.5], mixHex(stone, accent, 0.25), { material: ctx.style.materials.stoneWall, collide: true, lod: 1 });
    api.place("arena_cover", build(b, "arena_cover"), [c[0] + Math.cos(a) * r, base, c[1] + Math.sin(a) * r], rng.float(0, Math.PI), undefined, undefined, w * 0.6);
  }
  // team spawn pads + centre point
  for (const [team, a] of [["a", 0], ["b", Math.PI]] as [string, number][]) {
    const b = new PartListBuilder();
    b.cylinder([0, 0.2, 0], 14, 0.4, team === "a" ? "#3a7ad0" : "#d04040", { material: "Neon", collide: true, lod: 1 });
    api.place("arena_spawn", build(b, "arena_spawn"), [c[0] + Math.cos(a) * R * 0.78, base, c[1] + Math.sin(a) * R * 0.78], 0, `arena_spawn_${team}`, { team }, 8);
  }
  const cb = new PartListBuilder();
  cb.cylinder([0, 0.2, 0], 12, 0.4, accent, { material: "Neon", collide: true, lod: 1, light: { type: "point", color: accent, brightness: 1.5, range: 30 } });
  api.place("arena_center", build(cb, "arena_center"), [c[0], base, c[1]], 0, "arena_center", { kind: "capture_point" }, 7);
  ctx.spawn = { position: [c[0] + Math.cos(Math.PI / 2) * (R + 22), base + 3, c[1] + Math.sin(Math.PI / 2) * (R + 22)], lookAt: [c[0], base + 3, c[1]] };
  api.zone("arena", c[0], c[1], R, { kind: "arena" }, base);
}

// ------------------------------------------------------------------ race track
function raceTrack(api: LayoutApi, c: Vec2, extent: number, checkpoints: number): void {
  const { ctx, rng, accent, glow } = api;
  const rx = Math.max(60, extent);
  const rz = Math.max(45, extent * 0.65);
  const n = 64;
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wob = 1 + Math.sin(a * 3 + 1.3) * 0.12 + Math.cos(a * 2) * 0.08;
    pts.push([c[0] + Math.cos(a) * rx * wob, c[1] + Math.sin(a) * rz * wob]);
  }
  pts.push(pts[0]!);
  const type = ctx.style.kits.road === "asphalt_road" || ctx.style.kits.road === "neon_road" || ctx.style.kits.road === "concrete_road" ? ctx.style.kits.road : "asphalt_road";
  ctx.paths.push({ id: "race_track", kind: "road", type, points: pts, width: 22 });
  carveRoad(ctx, pts, 22, type);
  // checkpoint gates
  for (let k = 0; k < checkpoints; k++) {
    const i = Math.floor((k / checkpoints) * n);
    const p = pts[i]!;
    const q = pts[(i + 1) % n]!;
    const heading = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const y = ground(ctx, p[0], p[1]);
    const b = new PartListBuilder();
    const start = k === 0;
    for (const sx of [-1, 1]) b.box([sx * 13, 6, 0], [1.4, 12, 1.4], start ? "#f4f4f0" : accent, { material: "Metal", collide: true, lod: 1 });
    b.box([0, 12.4, 0], [28, 1.4, 1.4], start ? "#f4f4f0" : accent, { material: "Metal", collide: true, lod: 1 });
    b.box([0, 10.6, 0], [26, 2, 0.3], start ? "#202020" : glow, { material: "Neon", collide: false, lod: 1, light: { type: "point", color: glow, brightness: 1, range: 24 } });
    if (start) for (let i2 = 0; i2 < 12; i2++) b.box([-11 + i2 * 2, 0.15, 0], [2, 0.3, 4], i2 % 2 ? "#ffffff" : "#202020", { material: "SmoothPlastic", collide: false, lod: 0 });
    api.place("race_gate", build(b, "race_gate"), [p[0], y, p[1]], -heading + Math.PI / 2, start ? "race_start" : `race_cp_${k}`, { index: k, kind: start ? "start" : "checkpoint" }, 4);
    if (start) ctx.spawn = { position: [p[0] - Math.cos(heading) * 12, y + 3, p[1] - Math.sin(heading) * 12], lookAt: [q[0], y + 3, q[1]] };
  }
  api.zone("race_track", c[0], c[1], Math.max(rx, rz), { kind: "track", laps: 3 });
}

// ------------------------------------------------------------------ tycoon plots
function tycoonPlots(api: LayoutApi, c: Vec2, extent: number, plots: number): void {
  const { ctx, rng, accent, glow, stone } = api;
  const R = Math.max(70, Math.min(extent, 40 + plots * 12));
  const hubY = flattenArea(ctx, c, 26, 1.0);
  paint(ctx, c, 22, TERRAIN_MATERIAL_INDEX.Cobblestone);
  ctx.spawn = { position: [c[0], hubY + 3, c[1] + 10], lookAt: [c[0], hubY + 3, c[1] - 30] };
  api.zone("tycoon_hub", c[0], c[1], 22, { kind: "hub" }, hubY);
  const palette = ["#e05050", "#e0a040", "#60d060", "#40b0e0", "#8060e0", "#e060c0", "#e0e050", "#40d0c0"];
  for (let i = 0; i < plots; i++) {
    const a = (i / plots) * Math.PI * 2 + Math.PI / plots;
    const x = c[0] + Math.cos(a) * R;
    const z = c[1] + Math.sin(a) * R;
    const S = 56;
    const base = flattenArea(ctx, [x, z], S * 0.75, 1.0);
    const col = palette[i % palette.length]!;
    const b = new PartListBuilder();
    b.box([0, -0.4, 0], [S, 0.8, S], mixHex(stone, "#ffffff", 0.2), { material: "Concrete", collide: true, lod: 2 });
    b.box([0, 0.3, -S / 2 + 1], [S, 0.6, 2], col, { material: "SmoothPlastic", collide: true, lod: 1 });
    b.box([0, 0.3, S / 2 - 1], [S, 0.6, 2], col, { material: "SmoothPlastic", collide: true, lod: 1 });
    b.box([-S / 2 + 1, 0.3, 0], [2, 0.6, S], col, { material: "SmoothPlastic", collide: true, lod: 1 });
    b.box([S / 2 - 1, 0.3, 0], [2, 0.6, S], col, { material: "SmoothPlastic", collide: true, lod: 1 });
    // claim button + sign + conveyor strip + collector
    b.cylinder([0, 0.5, -S * 0.3], 6, 1, glow, { material: "Neon", collide: true, lod: 1, name: "ClaimButton", light: { type: "point", color: glow, brightness: 1, range: 16 } });
    b.box([0, 7, -S * 0.45], [0.8, 14, 0.8], "#3a3a40", { material: "Metal", collide: false, lod: 1 });
    b.box([0, 13, -S * 0.45], [12, 4, 0.5], col, { material: "SmoothPlastic", collide: false, lod: 1, name: "PlotSign" });
    b.box([0, 0.6, S * 0.1], [6, 0.6, S * 0.5], "#3a3a40", { material: "DiamondPlate", collide: true, lod: 1, name: "Conveyor" });
    b.box([0, 2, S * 0.4], [10, 4, 6], mixHex(col, "#000000", 0.3), { material: "Metal", collide: true, lod: 1, name: "Collector" });
    b.box([0, 4.3, S * 0.4], [8, 0.6, 4], glow, { material: "Neon", collide: false, lod: 0 });
    for (let k = 0; k < 4; k++) b.cylinder([-S * 0.3 + k * S * 0.2, 0.4, S * 0.1 + (k % 2 ? 8 : -8)], 5, 0.8, mixHex(col, "#ffffff", 0.4), { material: "SmoothPlastic", collide: true, lod: 0, name: `ButtonPad_${k + 1}` });
    api.place("tycoon_plot", build(b, "tycoon_plot"), [x, base, z], -a + Math.PI / 2, `tycoon_plot_${i + 1}`, { plot: i + 1, color: col, kind: "plot" }, S * 0.75);
    // path from the hub to the plot
    const pts: Vec2[] = [];
    for (let t = 0; t <= 8; t++) pts.push([c[0] + (x - c[0]) * (t / 8), c[1] + (z - c[1]) * (t / 8)]);
    ctx.paths.push({ id: `tycoon_path_${i}`, kind: "road", type: ctx.style.kits.road, points: pts, width: 8 });
    carveRoad(ctx, pts, 8, ctx.style.kits.road);
  }
  void accent;
  void rng;
}

// ------------------------------------------------------------------ lobby with portals
function lobbyPortals(api: LayoutApi, c: Vec2, portals: number): void {
  const { ctx, accent, glow, stone } = api;
  const R = 34 + portals * 3;
  const base = flattenArea(ctx, c, R + 10, 1.0);
  paint(ctx, c, R + 6, ctx.style.kits.road === "asphalt_road" ? TERRAIN_MATERIAL_INDEX.Pavement : TERRAIN_MATERIAL_INDEX.Cobblestone);
  ctx.spawn = { position: [c[0], base + 3, c[1]], lookAt: [c[0], base + 3, c[1] - 40] };
  api.zone("lobby", c[0], c[1], R, { kind: "lobby" }, base);
  const palette = ["#e05050", "#e0a040", "#60d060", "#40b0e0", "#8060e0", "#e060c0", "#e0e050", "#40d0c0"];
  for (let i = 0; i < portals; i++) {
    const a = (i / portals) * Math.PI * 2;
    const col = palette[i % palette.length]!;
    const b = new PartListBuilder();
    for (const sx of [-1, 1]) b.box([sx * 6, 7, 0], [2.4, 14, 2.4], stone, { material: ctx.style.materials.stoneWall, collide: true, lod: 2 });
    b.box([0, 14.6, 0], [15, 2.4, 2.4], stone, { material: ctx.style.materials.stoneWall, collide: true, lod: 2 });
    b.box([0, 7, 0], [9.8, 12.5, 0.4], col, { material: "ForceField", collide: false, lod: 1, transparency: 0.3, name: "PortalPlane", light: { type: "point", color: col, brightness: 1.5, range: 26 } });
    b.box([0, 16.6, 0], [12, 2.6, 0.5], mixHex(col, "#ffffff", 0.3), { material: "Neon", collide: false, lod: 1, name: "PortalSign" });
    b.effect([0, 7, 0], [9, 12, 2], { kind: "sparkle", color: col, rate: 3, size: 0.3 }, { lod: 0 });
    api.place("lobby_portal", build(b, "lobby_portal"), [c[0] + Math.cos(a) * R, base, c[1] + Math.sin(a) * R], -a + Math.PI / 2, `lobby_portal_${i + 1}`, { index: i + 1, color: col, kind: "portal" }, 9);
  }
  const cb = new PartListBuilder();
  cb.cylinder([0, 0.4, 0], 18, 0.8, mixHex(stone, "#ffffff", 0.3), { material: "Marble", collide: true, lod: 1 });
  cb.cylinder([0, 1.2, 0], 10, 0.8, mixHex(stone, "#ffffff", 0.4), { material: "Marble", collide: true, lod: 1 });
  cb.box([0, 5, 0], [1, 8, 1], accent, { material: "Neon", collide: false, lod: 0, light: { type: "point", color: glow, brightness: 2, range: 40 } });
  cb.box([0, 10, 0], [6, 2, 0.4], glow, { material: "Neon", collide: false, lod: 0, name: "LobbyBoard" });
  api.place("lobby_center", build(cb, "lobby_center"), [c[0], base, c[1] - 24], 0, "lobby_board", { kind: "board" }, 10);
}

// ------------------------------------------------------------------ tower defense path
function baseDefense(api: LayoutApi, c: Vec2, extent: number, waypoints: number, intensity: number): void {
  const { ctx, rng, accent, glow, stone } = api;
  const R = Math.max(80, extent);
  // winding path from the far side of the layout area to the base at the centre
  const startA = rng.float(0, Math.PI * 2);
  const pts: Vec2[] = [];
  const n = Math.max(6, waypoints);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = R * (1 - t) + 14 * t;
    const a = startA + t * (1.5 + intensity * 2.5) * Math.PI + Math.sin(t * 9) * 0.25;
    pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
  }
  const smooth: Vec2[] = [];
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < 6; k++) smooth.push([pts[i]![0] + (pts[i + 1]![0] - pts[i]![0]) * (k / 6), pts[i]![1] + (pts[i + 1]![1] - pts[i]![1]) * (k / 6)]);
  smooth.push(pts[pts.length - 1]!);
  ctx.paths.push({ id: "td_path", kind: "road", type: "dirt_path", points: smooth, width: 10 });
  carveRoad(ctx, smooth, 10, "dirt_path");
  for (let i = 0; i <= n; i++) {
    const p = pts[i]!;
    const y = ground(ctx, p[0], p[1]);
    if (i === 0) {
      const b = new PartListBuilder();
      b.box([0, 6, 0], [14, 12, 6], mixHex(stone, "#000000", 0.3), { material: ctx.style.materials.stoneWall, collide: true, lod: 2 });
      b.box([0, 5, -3.2], [7, 9, 0.6], "#1a1018", { material: "SmoothPlastic", collide: false, lod: 1 });
      b.sphere([0, 5, -3.5], 3, "#ff3030", { material: "Neon", collide: false, lod: 0, transparency: 0.4, light: { type: "point", color: "#ff3030", brightness: 1.5, range: 30 } });
      const q = pts[1]!;
      api.place("td_spawn", build(b, "td_spawn"), [p[0], y, p[1]], -Math.atan2(q[1] - p[1], q[0] - p[0]) + Math.PI / 2, "td_spawn", { kind: "enemy_spawn", index: 0 }, 9);
      continue;
    }
    api.zone(`td_waypoint_${i}`, p[0], p[1], 5, { kind: "waypoint", index: i }, y);
    // tower pads on both sides of the path
    if (i < n) {
      const q = pts[i + 1]!;
      const heading = Math.atan2(q[1] - p[1], q[0] - p[0]);
      for (const side of [-1, 1]) {
        const px = p[0] + Math.cos(heading + Math.PI / 2) * 11 * side;
        const pz = p[1] + Math.sin(heading + Math.PI / 2) * 11 * side;
        if (slopeAtWorld(ctx, px, pz) > 0.4) continue;
        const b = new PartListBuilder();
        b.cylinder([0, 0.3, 0], 8, 0.6, mixHex(stone, "#ffffff", 0.2), { material: "Concrete", collide: true, lod: 1 });
        b.cylinder([0, 0.65, 0], 5, 0.1, glow, { material: "Neon", collide: false, lod: 0, name: "TowerPad" });
        api.place("td_pad", build(b, "td_pad"), [px, ground(ctx, px, pz), pz], 0, `td_pad_${i}_${side > 0 ? "r" : "l"}`, { kind: "tower_pad", index: i }, 4.5);
      }
    }
  }
  // the base
  const bx = pts[n]![0];
  const bz = pts[n]![1];
  const baseY = flattenArea(ctx, [bx, bz], 20, 1.0);
  const b = new PartListBuilder();
  b.box([0, 4, 0], [22, 8, 22], stone, { material: ctx.style.materials.stoneWall, collide: true, lod: 2 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box([sx * 10, 9, sz * 10], [5, 18, 5], mixHex(stone, "#000000", 0.15), { material: ctx.style.materials.stoneWall, collide: true, lod: 2 });
  b.sphere([0, 12, 0], 6, accent, { material: "Neon", collide: false, lod: 1, transparency: 0.3, light: { type: "point", color: accent, brightness: 2, range: 50 }, name: "Core" });
  b.box([0, 8.5, 0], [12, 1, 12], mixHex(stone, "#ffffff", 0.1), { material: ctx.style.materials.stoneWall, collide: true, lod: 1 });
  api.place("td_base", build(b, "td_base"), [bx, baseY, bz], 0, "td_base", { kind: "base", hp: 100 }, 16);
  ctx.spawn = { position: [bx + 26, baseY + 3, bz], lookAt: [bx, baseY + 6, bz] };
}

// ------------------------------------------------------------------ sports field
function sportsField(api: LayoutApi, c: Vec2): void {
  const { ctx, accent } = api;
  const L = 96;
  const W = 60;
  const base = flattenArea(ctx, c, Math.max(L, W) * 0.6 + 10, 1.0);
  const b = new PartListBuilder();
  b.box([0, -0.5, 0], [L, 1, W], mixHex(ctx.style.palette.foliage, "#3a9a3a", 0.5), { material: "Grass", collide: true, lod: 2 });
  for (let i = 0; i < 5; i++) b.box([-L / 2 + 6 + (i * (L - 12)) / 4, 0.06, 0], [0.6, 0.12, W - 6], "#ffffff", { material: "SmoothPlastic", collide: false, lod: 1 });
  b.box([0, 0.06, W / 2 - 3], [L - 6, 0.12, 0.6], "#ffffff", { material: "SmoothPlastic", collide: false, lod: 1 });
  b.box([0, 0.06, -W / 2 + 3], [L - 6, 0.12, 0.6], "#ffffff", { material: "SmoothPlastic", collide: false, lod: 1 });
  b.cylinder([0, 0.07, 0], 18, 0.12, "#ffffff", { material: "SmoothPlastic", collide: false, lod: 1 });
  for (const sx of [-1, 1]) {
    b.box([sx * (L / 2 - 3), 4, 0], [0.5, 8, 16], "#ffffff", { material: "Fabric", collide: false, lod: 1, transparency: 0.55 });
    b.box([sx * (L / 2 - 3), 8, 0], [0.6, 0.6, 16], "#ffffff", { material: "SmoothPlastic", collide: true, lod: 1 });
    for (const sz of [-1, 1]) b.box([sx * (L / 2 - 3), 4, sz * 8], [0.6, 8, 0.6], "#ffffff", { material: "SmoothPlastic", collide: true, lod: 1 });
    for (let r = 0; r < 4; r++) b.box([0, 1 + r * 2.2, sx * (W / 2 + 6 + r * 3)], [L, 2.2, 3], r % 2 ? "#8a8a90" : mixHex(accent, "#8a8a90", 0.5), { material: "Concrete", collide: true, lod: 2 });
  }
  api.place("sports_field", build(b, "sports_field"), [c[0], base, c[1]], 0, "field_center", { kind: "field" }, L * 0.55);
  api.zone("goal_home", c[0] - (L / 2 - 3), c[1], 9, { kind: "goal", team: "a" }, base);
  api.zone("goal_away", c[0] + (L / 2 - 3), c[1], 9, { kind: "goal", team: "b" }, base);
  api.zone("team_spawn_a", c[0] - L * 0.25, c[1], 8, { kind: "team_spawn", team: "a" }, base);
  api.zone("team_spawn_b", c[0] + L * 0.25, c[1], 8, { kind: "team_spawn", team: "b" }, base);
  ctx.spawn = { position: [c[0], base + 3, c[1] + W / 2 + 22], lookAt: [c[0], base + 3, c[1]] };
}

// ------------------------------------------------------------------ hangout plaza
function hangoutPlaza(api: LayoutApi, c: Vec2, R: number): void {
  const { ctx, accent, glow, stone } = api;
  const base = flattenArea(ctx, c, R + 8, 1.0);
  paint(ctx, c, R, ctx.style.kits.road === "asphalt_road" ? TERRAIN_MATERIAL_INDEX.Pavement : TERRAIN_MATERIAL_INDEX.Cobblestone);
  ctx.spawn = { position: [c[0], base + 3, c[1] + R * 0.6], lookAt: [c[0], base + 3, c[1]] };
  api.zone("plaza", c[0], c[1], R, { kind: "plaza" }, base);
  // stage with lights at the far end
  const b = new PartListBuilder();
  b.box([0, 1, 0], [30, 2, 16], mixHex(stone, "#ffffff", 0.2), { material: "Concrete", collide: true, lod: 2 });
  b.box([0, 1.2, 0], [28, 0.2, 14], mixHex(accent, "#000000", 0.2), { material: "SmoothPlastic", collide: false, lod: 1 });
  for (const sx of [-1, 1]) {
    b.box([sx * 14, 8, 6], [1, 14, 1], "#3a3a40", { material: "Metal", collide: true, lod: 1 });
    b.sphere([sx * 12, 14, 5], 1.6, glow, { material: "Neon", collide: false, lod: 0, light: { type: "point", color: glow, brightness: 1.5, range: 30 } });
  }
  b.box([0, 14.6, 6], [30, 1, 1], "#3a3a40", { material: "Metal", collide: true, lod: 1 });
  b.box([0, 9, 8], [26, 10, 0.3], mixHex(accent, "#ffffff", 0.3), { material: "Neon", collide: false, lod: 1, transparency: 0.3, name: "Screen" });
  api.place("plaza_stage", build(b, "plaza_stage"), [c[0], base, c[1] - R * 0.7], 0, "plaza_stage", { kind: "stage" }, 16);
  // ring of benches / seats around a central feature (fountain landmark if the style has one)
  const fv = ctx.prefabs["fountain"];
  if (fv && fv.length) {
    ctx.placements.push({ id: "layout_fountain", prefab: "fountain", variant: 0, category: "landmark", position: [c[0], base - fv[0]!.sinkDepth, c[1]], rotationY: 0, scale: 1, layer: "midground", zone: "plaza", importance: 9 });
    ctx.occupants.push({ position: [c[0], base, c[1]], radius: fv[0]!.footprintRadius, kind: "landmark" });
  }
}

// ------------------------------------------------------------------ dungeon (chain of walled rooms)
function dungeon(api: LayoutApi, c: Vec2, rooms: number, intensity: number): void {
  const { ctx, rng, accent, glow, stone } = api;
  const roomS = 34;
  const corridor = 14;
  let x = c[0];
  let z = c[1];
  let heading = rng.float(0, Math.PI * 2);
  const wallH = 12;
  const mat = ctx.style.materials.stoneWall;
  for (let i = 0; i < rooms; i++) {
    const base = flattenArea(ctx, [x, z], roomS * 0.8, 1.0);
    const boss = i === rooms - 1;
    const S = boss ? roomS * 1.4 : roomS;
    const b = new PartListBuilder();
    b.box([0, -0.5, 0], [S, 1, S], mixHex(stone, "#000000", 0.2), { material: "Cobblestone", collide: true, lod: 2 });
    // four walls with openings on the entry and exit sides
    const openings = new Set<number>([0]); // 0 = entry side (-Z local), 2 = exit
    if (!boss) openings.add(2);
    for (let side = 0; side < 4; side++) {
      const a = (side * Math.PI) / 2;
      const cx = Math.sin(a) * (S / 2 - 1);
      const cz = -Math.cos(a) * (S / 2 - 1);
      const rot = -(side * 90);
      if (openings.has(side)) {
        b.box([cx + Math.cos(a) * (S / 4 + corridor / 4), wallH / 2, cz + Math.sin(a) * (S / 4 + corridor / 4)], [S / 2 - corridor / 2, wallH, 2], stone, { material: mat, collide: true, lod: 2, rotation: [0, rot, 0] });
        b.box([cx - Math.cos(a) * (S / 4 + corridor / 4), wallH / 2, cz - Math.sin(a) * (S / 4 + corridor / 4)], [S / 2 - corridor / 2, wallH, 2], stone, { material: mat, collide: true, lod: 2, rotation: [0, rot, 0] });
        b.box([cx, wallH - 1.5, cz], [corridor + 1, 3, 2], stone, { material: mat, collide: true, lod: 1, rotation: [0, rot, 0] });
      } else {
        b.box([cx, wallH / 2, cz], [S, wallH, 2], stone, { material: mat, collide: true, lod: 2, rotation: [0, rot, 0] });
      }
    }
    // torches, pillars, loot / boss pad
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.box([sx * (S / 2 - 5), wallH / 2, sz * (S / 2 - 5)], [3, wallH, 3], mixHex(stone, "#000000", 0.1), { material: mat, collide: true, lod: 1 });
      b.sphere([sx * (S / 2 - 5), wallH * 0.75, sz * (S / 2 - 5) - sz * 2], 1.2, "#ff8a30", { material: "Neon", collide: false, lod: 0, light: { type: "point", color: "#ff9040", brightness: 1.4, range: 26 }, effect: { kind: "embers", color: "#ff9040", rate: 1.5, size: 0.25 } });
    }
    if (boss) {
      b.cylinder([0, 0.3, 0], 16, 0.6, mixHex(accent, "#000000", 0.2), { material: "Neon", collide: true, lod: 1, name: "BossPad", light: { type: "point", color: accent, brightness: 1.5, range: 34 } });
    } else if (rng.chance(0.6 + intensity * 0.3)) {
      b.box([S * 0.25, 1, S * 0.2], [4, 2, 3], "#8a6a3a", { material: "Wood", collide: true, lod: 0, name: "LootChest" });
      b.box([S * 0.25, 2.2, S * 0.2], [4.2, 0.4, 3.2], "#d0a020", { material: "Metal", collide: false, lod: 0 });
    }
    // roof beams (open top keeps lighting simple; beams sell the enclosure)
    for (let k = -1; k <= 1; k++) b.box([0, wallH + 0.5, (k * S) / 3], [S + 2, 1.2, 1.6], mixHex(stone, "#3a2a22", 0.5), { material: "Wood", collide: false, lod: 1 });
    api.place("dungeon_room", build(b, "dungeon_room"), [x, base, z], -heading + Math.PI / 2, boss ? "dungeon_boss" : `dungeon_room_${i + 1}`, { kind: boss ? "boss_room" : "room", index: i + 1 }, S * 0.75);
    if (i === 0) ctx.spawn = { position: [x - Math.cos(heading) * (S / 2 + 12), base + 3, z - Math.sin(heading) * (S / 2 + 12)], lookAt: [x, base + 3, z] };
    if (boss) break;
    // corridor to the next room
    const nx = x + Math.cos(heading) * (S / 2 + roomS / 2 + 18);
    const nz = z + Math.sin(heading) * (S / 2 + roomS / 2 + 18);
    const cb = new PartListBuilder();
    const len = Math.hypot(nx - x, nz - z) - S / 2 - roomS / 2 + 4;
    cb.box([0, -0.5, 0], [corridor, 1, len], mixHex(stone, "#000000", 0.2), { material: "Cobblestone", collide: true, lod: 2 });
    for (const sx of [-1, 1]) cb.box([sx * (corridor / 2 - 1), wallH * 0.4, 0], [2, wallH * 0.8, len], stone, { material: mat, collide: true, lod: 2 });
    cb.box([0, wallH * 0.8 + 0.5, 0], [corridor + 2, 1, len], mixHex(stone, "#3a2a22", 0.5), { material: "Wood", collide: true, lod: 1 });
    const mx = (x + nx) / 2;
    const mz = (z + nz) / 2;
    flattenArea(ctx, [mx, mz], len * 0.6, 1.0, base);
    api.place("dungeon_corridor", build(cb, "dungeon_corridor"), [mx, base, mz], -heading + Math.PI / 2, undefined, undefined, len * 0.5);
    x = nx;
    z = nz;
    heading += rng.float(-0.9, 0.9);
    void glow;
  }
}

// ------------------------------------------------------------------ story checkpoints along the main road
function storyCheckpoints(api: LayoutApi, count: number): void {
  const { ctx, accent, glow } = api;
  const road = ctx.paths.filter((p) => p.kind === "road").sort((a, b) => b.points.length - a.points.length)[0];
  if (!road) return;
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(((i + 1) / (count + 1)) * (road.points.length - 1));
    const p = road.points[idx]!;
    const q = road.points[Math.min(road.points.length - 1, idx + 1)]!;
    const heading = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const nx = -Math.sin(heading);
    const nz = Math.cos(heading);
    const x = p[0] + nx * (road.width / 2 + 4);
    const z = p[1] + nz * (road.width / 2 + 4);
    const b = new PartListBuilder();
    b.box([0, 3, 0], [1, 6, 1], "#3a3a40", { material: "Metal", collide: true, lod: 1 });
    b.box([0, 6.5, 0], [3, 2, 0.3], accent, { material: "Neon", collide: false, lod: 0, light: { type: "point", color: glow, brightness: 1, range: 18 } });
    api.place("story_marker", build(b, "story_marker"), [x, ground(ctx, x, z), z], -heading, `story_checkpoint_${i + 1}`, { kind: "checkpoint", index: i + 1, chapter: i + 1 }, 3);
  }
}

function paint(ctx: GenContext, c: Vec2, r: number, material: number): void {
  const h = ctx.heights;
  const [cx0, cz0] = h.toCell(c[0] - r, c[1] - r);
  const [cx1, cz1] = h.toCell(c[0] + r, c[1] + r);
  for (let z = Math.max(0, Math.floor(cz0)); z <= Math.min(ctx.depth - 1, Math.ceil(cz1)); z++) {
    for (let x = Math.max(0, Math.floor(cx0)); x <= Math.min(ctx.width - 1, Math.ceil(cx1)); x++) {
      const [wx, wz] = h.toWorld(x, z);
      if (Math.hypot(wx - c[0], wz - c[1]) > r) continue;
      const k = z * ctx.width + x;
      if (Number.isNaN(ctx.water.data[k]!)) ctx.materials[k] = material;
    }
  }
}
