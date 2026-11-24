import { TERRAIN_MATERIAL_INDEX, mixHex, type Rng, type Vec2 } from "@worldforge/core";
import { PartListBuilder } from "@worldforge/prefabs";
import { inBounds, isWaterAt } from "../context";
import { buildFacility, facilityKit } from "./facilities";
import { build, ground, paint, type LayoutApi } from "./layout";
import { carveRoad, refreshRoadDistance } from "./roads";
import { flattenArea } from "./sites";

/**
 * A competitive arena: two bases, three lanes, one middle worth holding. Every piece has a twin turned by half a turn, so
 * neither team has the better ground; no lane can be watched end to end, and each has cover to cross it.
 */
export function laneArena(api: LayoutApi, c: Vec2, L: number, covers: number, intensity: number): void {
  const { ctx, rng, accent, stone } = api;
  const W = L * 0.62;
  const base = flattenArea(ctx, c, L * 1.25 + 16, 1.0, undefined, 0.85);
  paint(ctx, c, L * 1.18, ctx.style.kits.road === "metal_walkway" ? TERRAIN_MATERIAL_INDEX.Slate : TERRAIN_MATERIAL_INDEX.Concrete);
  const yaw = rng.float(0, Math.PI * 2);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const flip = rng.chance(0.5) ? 1 : -1;
  const dark = mixHex(stone, "#000000", 0.25);
  const light = mixHex(stone, "#ffffff", 0.15);
  const S = { material: ctx.style.materials.stoneWall, collide: true, lod: 2 } as const;
  const at = (x: number, z: number): Vec2 => [c[0] + x * cos + z * sin, c[1] - x * sin + z * cos];
  const put = (id: string, make: (b: PartListBuilder) => void, x: number, z: number, turn: number, r: number) => {
    const b = new PartListBuilder();
    make(b);
    const [wx, wz] = at(x, z);
    api.place(id, build(b, id), [wx, base, wz], yaw + turn, undefined, undefined, r);
  };
  /** The piece and its twin: half a turn around the centre. */
  const pair = (id: string, make: (b: PartListBuilder, team: number) => void, x: number, z: number, turn: number, r: number) => {
    put(id, (b) => make(b, 0), x, z * flip, turn * flip, r);
    put(id, (b) => make(b, 1), -x, -z * flip, turn * flip + Math.PI, r);
  };
  // outer wall: straight runs with buttresses
  for (const s of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      put("arena_wall", (b) => {
        b.box([0, 7, 0], [(2 * L) / 8 + 0.4, 14, 3], i % 2 ? stone : dark, S);
        b.box([0, 7.5, 0], [3, 15, 5], light, { ...S, lod: 1 });
      }, -L + ((2 * L) / 8) * (i + 0.5), s * W, 0, L / 8);
    }
    for (let i = 0; i < 5; i++) {
      put("arena_wall", (b) => {
        b.box([0, 7, 0], [3, 14, (2 * W) / 5 + 0.4], i % 2 ? dark : stone, S);
        b.box([0, 12, 0], [3.4, 1, (2 * W) / 5], i === 2 ? accent : light, { material: "SmoothPlastic", collide: false, lod: 0 });
      }, s * L, -W + ((2 * W) / 5) * (i + 0.5), 0, W / 5);
    }
  }
  const team = ["#3a7ad0", "#d04040"];
  // the bases: a spawn that nobody can see into, two ways out
  pair("arena_screen", (b, t) => {
    b.box([0, 5, 0], [2.4, 10, W * 0.62], dark, S);
    b.box([1.4, 7, 0], [0.4, 2, W * 0.5], team[t]!, { material: "Neon", collide: false, lod: 0 });
    for (const q of [-1, 1]) b.box([-L * 0.06, 5, q * W * 0.31], [L * 0.12, 10, 2.4], dark, S);
  }, -L * 0.74, 0, 0, 8);
  // a block between the middle and a side lane: in by two doors, up by a ramp, out by a window
  const bw = L * rng.float(0.28, 0.34);
  const bd = W * rng.float(0.26, 0.32);
  pair("arena_block", (b, t) => {
    const h = 10;
    for (const q of [-1, 1]) {
      for (const p of [-1, 1]) b.box([q * bw * 0.5, h / 2, p * (bd * 0.25 + 2)], [1.6, h, bd * 0.5 - 4], stone, S);
      b.box([q * bw * 0.5, 9, 0], [1.6, 2, 9], stone, S);
      b.box([0, 1.8, q * bd * 0.5], [bw, 3.6, 1.6], stone, S);
      b.box([0, 9, q * bd * 0.5], [bw, 2, 1.6], stone, S);
      for (const p of [-1, 0, 1]) b.box([p * bw * 0.4, 5, q * bd * 0.5], [bw * 0.16, 10, 1.6], stone, S);
    }
    b.box([0, h + 0.4, 0], [bw + 1.6, 0.8, bd + 1.6], light, S);
    for (const q of [-1, 1]) b.box([0, h + 2, q * (bd * 0.5 + 0.2)], [bw, 2.6, 1], dark, { ...S, lod: 1 });
    b.box([bw * 0.5 + 0.2, h + 2, 0], [1, 2.6, bd], team[t]!, { material: "SmoothPlastic", collide: true, lod: 1 });
    b.wedge([-bw * 0.5 - 9, h / 2, 0], [8, h + 0.8, 18], light, { ...S, rotation: [0, 90, 0] });
  }, -L * 0.34, -W * 0.36, 0, Math.min(bw, bd) * 0.6);
  // the other side: stacked containers, lower, a different fight
  pair("arena_stack", (b) => {
    const u = L * 0.085;
    const M = { material: "Metal", collide: true, lod: 2 } as const;
    b.box([0, 3.5, 0], [u * 2, 7, 7], mixHex(accent, stone, 0.35), M);
    b.box([u * 0.5, 3.5, 8.6], [u, 7, 7], mixHex("#3f6f8f", stone, 0.3), M);
    b.box([u * 0.3, 10, 1], [u * 1.3, 6, 7], mixHex("#a8632e", stone, 0.3), M);
    b.box([-u - 2.4, 1.6, 0], [4.6, 3.2, 5], "#7d6b4c", { material: "WoodPlanks", collide: true, lod: 1 });
    for (let i = 0; i < 6; i++) b.box([-u * 0.9 + i * u * 0.36, 3.5, -3.6], [0.4, 6.4, 0.3], dark, { material: "Metal", collide: false, lod: 0 });
  }, -L * 0.3, W * 0.4, 0.12, 10);
  // the middle: a raised platform with four ramps and a screen on it
  put("arena_mid", (b) => {
    b.box([0, 2, 0], [L * 0.2, 4, W * 0.36], stone, S);
    for (const q of [-1, 1]) {
      b.wedge([q * (L * 0.1 + 5), 2, 0], [W * 0.2, 4, 10], light, { ...S, rotation: [0, q > 0 ? -90 : 90, 0] });
      b.wedge([0, 2, q * (W * 0.18 + 5)], [L * 0.1, 4, 10], light, { ...S, rotation: [0, q > 0 ? 180 : 0, 0] });
      b.box([q * L * 0.055, 6.4, q * W * 0.06], [5, 4.8, 2.4], dark, S);
    }
  }, 0, 0, 0, L * 0.1);
  // side lanes: a full screen across the middle of each, so nobody shoots from end to end
  pair("arena_screen", (b) => {
    b.box([0, 5, 0], [2.6, 10, W * 0.24], dark, S);
    b.box([0, 10.4, 0], [3.4, 0.8, W * 0.26], light, { ...S, lod: 1 });
  }, L * 0.02, -W * 0.74, 0.25, 6);
  // cover along the lanes, low and high in turn
  const lanes: [number, number[]][] = [[-0.76, [0.22, 0.42, 0.62]], [0, [0.24, 0.42, 0.58]], [0.74, [0.12, 0.34, 0.6]]];
  let made = 0;
  for (const [lz, xs] of lanes) {
    for (const x of xs) {
      if (made >= Math.max(8, covers)) break;
      const high = made % 3 === 1;
      const w = rng.float(6, 9);
      pair("arena_cover", (b) => {
        if (high) {
          b.box([0, 3.6, 0], [w, 7.2, 3], mixHex(stone, accent, 0.2), S);
          b.box([0, 7.5, 0], [w + 0.6, 0.6, 3.6], light, { ...S, lod: 1 });
        } else {
          b.box([0, 1.8 + intensity * 0.3, 0], [w, 3.6 + intensity * 0.6, 2.6], mixHex(stone, accent, 0.3), { ...S, lod: 1 });
          b.box([w * 0.32, 1.6, 3.2], [3.4, 3.2, 3.4], "#7d6b4c", { material: "WoodPlanks", collide: true, lod: 1 });
        }
      }, -L * (x + rng.float(-0.03, 0.03)), W * (lz + rng.float(-0.06, 0.06)), Math.PI / 2 + rng.float(-0.35, 0.35), w * 0.6);
      made++;
    }
  }
  for (const [name, t, s] of [["a", 0, -1], ["b", 1, 1]] as [string, number, number][]) {
    const b = new PartListBuilder();
    b.cylinder([0, 0.2, 0], 16, 0.4, team[t]!, { material: "Neon", collide: true, lod: 1 });
    const [x, z] = at(s * L * 0.88, 0);
    api.place("arena_spawn", build(b, "arena_spawn"), [x, base, z], 0, `arena_spawn_${name}`, { team: name }, 8);
  }
  const b = new PartListBuilder();
  b.cylinder([0, 4.2, 0], 12, 0.4, accent, { material: "Neon", collide: true, lod: 1, light: { type: "point", color: accent, brightness: 1.5, range: 30 } });
  api.place("arena_center", build(b, "arena_center"), [c[0], base, c[1]], 0, "arena_center", { kind: "capture_point" }, 7);
  // players join inside their base, never outside the walls
  const [sx, sz] = at(-L * 0.88, 0);
  ctx.spawn = { position: [sx, base + 3.4, sz], lookAt: [c[0], base + 3, c[1]] };
  api.zone("arena", c[0], c[1], L, { kind: "arena", lanes: 3 }, base);
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function spline(ctrl: Vec2[], step: number): Vec2[] {
  const out: Vec2[] = [];
  const n = ctrl.length;
  const f = (a: number, b: number, c: number, d: number, t: number) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [ctrl[(i + n - 1) % n]!, ctrl[i]!, ctrl[(i + 1) % n]!, ctrl[(i + 2) % n]!];
    const k = Math.max(3, Math.round(dist(p1, p2) / step));
    for (let j = 0; j < k; j++) out.push([f(p0[0], p1[0], p2[0], p3[0], j / k), f(p0[1], p1[1], p2[1], p3[1], j / k)]);
  }
  return out;
}

/** Signed turn per stud at each point of a closed line, averaged over a few points. */
function curvature(pts: Vec2[]): number[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i + n - 3) % n]!;
    const b = pts[(i + 3) % n]!;
    const h = Math.atan2(b[1] - p[1], b[0] - p[0]) - Math.atan2(p[1] - a[1], p[0] - a[0]);
    return Math.atan2(Math.sin(h), Math.cos(h)) / Math.max(1, (dist(a, p) + dist(p, b)) / 2);
  });
}

/** A circuit drawn many times and judged: a long straight, corners both ways, one tight, nothing that crosses itself. */
function drawCircuit(api: LayoutApi, c: Vec2, rx: number, rz: number, rng: Rng): Vec2[] {
  const { ctx } = api;
  let best: Vec2[] = [];
  let bestV = -Infinity;
  for (let k = 0; k < 160; k++) {
    const n = rng.int(8, 12);
    const ctrl: Vec2[] = [];
    const phase = rng.float(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const a = phase + ((i + rng.float(-0.28, 0.28)) / n) * Math.PI * 2;
      const r = rng.chance(0.36) ? rng.float(0.3, 0.55) : rng.float(0.72, 1);
      ctrl.push([c[0] + Math.cos(a) * rx * r, c[1] + Math.sin(a) * rz * r]);
    }
    // the main straight: two points pulled apart on one side
    const i = rng.int(0, n - 1);
    const p = ctrl[i]!;
    const q = ctrl[(i + 1) % n]!;
    ctrl.splice(i + 1, 0, [p[0] * 0.67 + q[0] * 0.33, p[1] * 0.67 + q[1] * 0.33], [p[0] * 0.33 + q[0] * 0.67, p[1] * 0.33 + q[1] * 0.67]);
    const pts = spline(ctrl, 8);
    const cv = curvature(pts);
    let v = 0;
    const tight = Math.max(...cv.map(Math.abs));
    if (tight > 1 / 24) v -= (tight * 24 - 1) * 6;
    if (tight < 1 / 60) v -= 1;
    let straight = 0;
    let run = 0;
    let signs = 0;
    let last = 0;
    for (let j = 0; j < pts.length * 2; j++) {
      const t = cv[j % pts.length]!;
      if (Math.abs(t) < 0.0035) run += dist(pts[j % pts.length]!, pts[(j + 1) % pts.length]!);
      else run = 0;
      straight = Math.max(straight, Math.min(run, rx * 1.6));
      if (Math.abs(t) > 0.008 && Math.sign(t) !== last) {
        signs++;
        last = Math.sign(t);
      }
    }
    v += Math.min(1.4, straight / (rx * 0.75)) + Math.min(2.4, signs / 7);
    let near = Infinity;
    for (let a = 0; a < pts.length; a += 2) for (let b = a + 14; b < pts.length; b += 2) if (pts.length - b + a > 14) near = Math.min(near, dist(pts[a]!, pts[b]!));
    if (near < 58) v -= (58 - near) / 6;
    let bad = 0;
    for (const s of pts) if (!inBounds(ctx, s[0], s[1], 40) || isWaterAt(ctx, s[0], s[1]) || ctx.waterDistance.sample(s[0], s[1]) < 16) bad++;
    v -= (bad / pts.length) * 20;
    if (v > bestV) {
      bestV = v;
      best = pts;
    }
  }
  return best;
}

export function circuit(api: LayoutApi, c: Vec2, extent: number, checkpoints: number): void {
  const { ctx, rng, accent, glow } = api;
  const room = Math.min(ctx.worldW, ctx.worldD) * 0.36;
  const rx = Math.max(130, Math.min(room, extent * 1.5));
  const rz = rx * 0.76;
  const pts = drawCircuit(api, c, rx, rz, rng);
  const n = pts.length;
  const width = 24;
  // levelled, not bared: the infield keeps its grass
  const soil = Uint8Array.from(ctx.materials);
  flattenArea(ctx, c, rx * 1.2, 0.55, undefined, 0.9);
  ctx.materials.set(soil);
  const type = ["asphalt_road", "neon_road", "concrete_road"].includes(ctx.style.kits.road) ? ctx.style.kits.road : "asphalt_road";
  const closed = [...pts, pts[0]!];
  ctx.paths.push({ id: "race_track", kind: "road", type, points: closed, width });
  carveRoad(ctx, closed, width, type);
  refreshRoadDistance(ctx);
  const cv = curvature(pts);
  // the start: well along the longest straight
  let start = 0;
  let bestRun = -1;
  for (let i = 0; i < n; i++) {
    let run = 0;
    while (run < n && Math.abs(cv[(i + run) % n]!) < 0.005) run++;
    if (run > bestRun) {
      bestRun = run;
      start = (i + Math.floor(run * 0.6)) % n;
    }
  }
  const head = (i: number) => Math.atan2(pts[(i + 1) % n]![1] - pts[(i + n - 1) % n]![1], pts[(i + 1) % n]![0] - pts[(i + n - 1) % n]![0]);
  const gates = Math.max(6, checkpoints);
  for (let k = 0; k < gates; k++) {
    const i = (start + Math.floor((k / gates) * n)) % n;
    const p = pts[i]!;
    const heading = head(i);
    const y = ground(ctx, p[0], p[1]);
    const b = new PartListBuilder();
    const first = k === 0;
    for (const s of [-1, 1]) {
      b.box([s * 14.5, 8, 0], [1.6, 16, 1.6], first ? "#f4f4f0" : accent, { material: "Metal", collide: true, lod: 1 });
      b.box([s * 14.5, 0.6, 0], [3.4, 1.2, 3.4], "#50555a", { material: "Concrete", collide: true, lod: 1 });
    }
    b.box([0, 16.6, 0], [31, 2, 2], first ? "#f4f4f0" : accent, { material: "Metal", collide: true, lod: 1 });
    b.box([0, 14.4, 0], [28, 2.4, 0.4], first ? "#202020" : glow, { material: "Neon", collide: false, lod: 1, light: { type: "point", color: glow, brightness: 1, range: 24 } });
    if (first) for (let r = 0; r < 3; r++) for (let q = 0; q < 12; q++) b.box([-11 + q * 2, 0.14, -2 + r * 2], [2, 0.24, 2], (q + r) % 2 ? "#ffffff" : "#202020", { material: "SmoothPlastic", collide: false, lod: 0 });
    api.place("race_gate", build(b, "race_gate"), [p[0], y, p[1]], -heading + Math.PI / 2, first ? "race_start" : `race_cp_${k}`, { index: k, kind: first ? "start" : "checkpoint" }, 4);
    if (!first) continue;
    // the grid, two by two
    for (let g = 0; g < 8; g++) {
      const back = (i + n - 2 - Math.floor(g / 2) * 2) % n;
      const q = pts[back]!;
      const h = head(back);
      const s = g % 2 ? 1 : -1;
      const m = new PartListBuilder();
      m.box([0, 0.12, 0], [6, 0.14, 0.6], "#ffffff", { material: "SmoothPlastic", collide: false, lod: 0 });
      for (const e of [-1, 1]) m.box([e * 3, 0.12, 1.6], [0.5, 0.14, 3.4], "#ffffff", { material: "SmoothPlastic", collide: false, lod: 0 });
      api.place("race_grid", build(m, "race_grid"), [q[0] - Math.sin(h) * 5 * s, ground(ctx, q[0], q[1]), q[1] + Math.cos(h) * 5 * s], -h + Math.PI / 2, `race_grid_${g}`, { kind: "grid", index: g }, 3);
    }
    const q = pts[(i + n - 3) % n]!;
    ctx.spawn = { position: [q[0], ground(ctx, q[0], q[1]) + 3, q[1]], lookAt: [pts[(i + 4) % n]![0], y + 3, pts[(i + 4) % n]![1]] };
  }
  // kerbs inside the corners, barriers outside
  for (let i = 0; i < n; i++) {
    const t = cv[i]!;
    if (Math.abs(t) < 0.009) continue;
    const p = pts[i]!;
    const h = head(i);
    const len = dist(p, pts[(i + 1) % n]!) + 0.6;
    const side = Math.sign(t);
    for (const [s, off, id] of [[side, width / 2 - 0.6, "race_kerb"], [-side, width / 2 + 5, "race_barrier"]] as [number, number, string][]) {
      const x = p[0] - Math.sin(h) * off * s;
      const z = p[1] + Math.cos(h) * off * s;
      if (id === "race_barrier" && ctx.roadDistance.sample(x, z) < 2) continue;
      const b = new PartListBuilder();
      if (id === "race_kerb") b.box([0, 0.2, 0], [len, 0.4, 2.2], i % 2 ? "#c8352c" : "#f2f0ea", { material: "Concrete", collide: true, lod: 1 });
      else {
        b.box([0, 1.5, 0], [len * (1 + Math.abs(t) * 14), 3, 1.2], i % 2 ? "#f2f0ea" : "#b7bcc0", { material: "Concrete", collide: true, lod: 2 });
        b.box([0, 2.4, -0.7 * s], [len, 0.7, 0.2], i % 2 ? "#c8352c" : "#f2f0ea", { material: "SmoothPlastic", collide: false, lod: 0 });
      }
      api.place(id, build(b, id), [x, ground(ctx, x, z), z], -h, undefined, undefined, 2);
    }
  }
  // the paddock on the inside of the straight, the stands on the outside
  const kit = facilityKit(ctx, rng);
  const h0 = head(start);
  const P = pts[start]!;
  const toC = (c[0] - P[0]) * -Math.sin(h0) + (c[1] - P[1]) * Math.cos(h0) > 0 ? 1 : -1;
  const clear = (x: number, z: number, hx: number, hz: number, yaw: number) => {
    for (let u = -1; u <= 1; u += 0.5) {
      for (let w = -1; w <= 1; w += 0.5) {
        const qx = x + u * hx * Math.cos(yaw) + w * hz * Math.sin(yaw);
        const qz = z - u * hx * Math.sin(yaw) + w * hz * Math.cos(yaw);
        if (!inBounds(ctx, qx, qz, 24) || isWaterAt(ctx, qx, qz) || ctx.roadDistance.sample(qx, qz) < 3) return false;
      }
    }
    return !ctx.occupants.some((o) => o.kind === "landmark" && Math.hypot(o.position[0] - x, o.position[2] - z) < o.radius + Math.max(hx, hz));
  };
  const corner = (f: number): [number, number] => {
    const i = (start + Math.floor(n * f)) % n;
    return [i, -Math.sign(cv[i]!) || 1];
  };
  let built = 0;
  for (const [i, s] of [[start, -toC] as [number, number], corner(0.27), corner(0.5), corner(0.74)]) {
    for (let k = 0; k < 8; k++) {
      const j = (i + k * 2) % n;
      const h = head(j);
      const x = pts[j]![0] - Math.sin(h) * (width / 2 + 24) * s;
      const z = pts[j]![1] + Math.cos(h) * (width / 2 + 24) * s;
      // the front (-Z) looks at the track
      const yaw = Math.atan2(-(pts[j]![0] - x), -(pts[j]![1] - z));
      if (!clear(x, z, 36, 15, yaw)) continue;
      buildFacility(ctx, kit, "grandstand", [x, z], yaw, ground(ctx, x, z), undefined, false);
      built++;
      break;
    }
  }
  for (const off of [26, 32]) {
    const x = P[0] - Math.sin(h0) * (width / 2 + off) * toC;
    const z = P[1] + Math.cos(h0) * (width / 2 + off) * toC;
    const yaw = Math.atan2(-(P[0] - x), -(P[1] - z));
    if (!clear(x, z, 44, 14, yaw)) continue;
    flattenArea(ctx, [x, z], 48, 0.9);
    const b = new PartListBuilder();
    for (let k = 0; k < 7; k++) {
      b.box([-42 + k * 12, 5, 2], [1, 10, 16], "#cfd3d6", { material: "Concrete", collide: true, lod: 2 });
      b.box([-36 + k * 12, 8.6, -6], [11, 2, 0.6], k % 2 ? accent : "#e9e7e0", { material: "SmoothPlastic", collide: false, lod: 1 });
    }
    b.box([42, 5, 2], [1, 10, 16], "#cfd3d6", { material: "Concrete", collide: true, lod: 2 });
    b.box([0, 5, 10], [84, 10, 1], "#b9bec2", { material: "Concrete", collide: true, lod: 2 });
    b.box([0, 10.5, 1], [86, 1, 20], "#8b9196", { material: "Metal", collide: true, lod: 2 });
    b.box([0, 15, 4], [70, 8, 10], "#2c3b47", { material: "Glass", collide: true, transparency: 0.3, lod: 2 });
    b.box([0, 19.4, 3], [74, 0.8, 14], "#e9e7e0", { material: "Metal", collide: true, lod: 2 });
    api.place("race_pit", build(b, "race_pit"), [x, ground(ctx, x, z), z], yaw, "race_pit", { kind: "pit" }, 20);
    break;
  }
  api.zone("race_track", c[0], c[1], Math.max(rx, rz), { kind: "track", laps: 3, stands: built });
}

/** A path that comes back past itself, so one tower covers several passes: back and forth, or a square spiral. */
export function defensePath(api: LayoutApi, c: Vec2, R: number, waypoints: number): Vec2[] {
  const { rng } = api;
  const turn = rng.float(0, Math.PI * 2);
  const mirror = rng.chance(0.5) ? 1 : -1;
  const local: Vec2[] = [];
  const legs = Math.max(3, Math.min(5, Math.round(waypoints / 2.6)));
  if (rng.chance(0.65)) {
    // back and forth, legs of unequal length
    for (let i = 0; i < legs; i++) {
      const z = -R * 0.78 + (i * R * 1.56) / (legs - 1);
      const s = i % 2 ? 1 : -1;
      local.push([s * R * rng.float(0.62, 0.95), z + rng.float(-0.06, 0.06) * R], [-s * R * rng.float(0.62, 0.95), z + rng.float(-0.06, 0.06) * R]);
    }
  } else {
    // a square spiral closing on the base
    for (let i = 0; i <= 7; i++) {
      const r = R * (0.98 - i * 0.115);
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      local.push([Math.cos(a) * r * 1.15, Math.sin(a) * r * 1.15]);
    }
    local.push([0, 0]);
  }
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return local.map(([x, z]): Vec2 => [c[0] + (x * cos - z * mirror * sin) * 0.9, c[1] + (x * sin + z * mirror * cos) * 0.9]);
}

/** Corners rounded just enough to look walked, in even steps. */
export function rounded(pts: Vec2[], r: number): Vec2[] {
  const out: Vec2[] = [pts[0]!];
  for (let i = 1; i + 1 < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const c = pts[i + 1]!;
    const la = Math.min(r, dist(a, b) / 2.2) / dist(a, b);
    const lc = Math.min(r, dist(b, c) / 2.2) / dist(b, c);
    const p: Vec2 = [b[0] + (a[0] - b[0]) * la, b[1] + (a[1] - b[1]) * la];
    const q: Vec2 = [b[0] + (c[0] - b[0]) * lc, b[1] + (c[1] - b[1]) * lc];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      out.push([(1 - t) ** 2 * p[0] + 2 * (1 - t) * t * b[0] + t * t * q[0], (1 - t) ** 2 * p[1] + 2 * (1 - t) * t * b[1] + t * t * q[1]]);
    }
  }
  out.push(pts[pts.length - 1]!);
  const even: Vec2[] = [out[0]!];
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1]!;
    const b = out[i]!;
    const n = Math.max(1, Math.round(dist(a, b) / 6));
    for (let k = 1; k <= n; k++) even.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return even;
}
