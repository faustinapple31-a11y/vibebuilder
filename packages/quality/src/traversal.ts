import type { Placement, Vec2, WorldBake } from "@worldforge/core";

/**
 * Can a player really go there? A walk over the finished ground from the spawn (slopes, cliffs, water, bridges, stairs),
 * the jumps of an obstacle course against what a Roblox character can do, and the sightlines of a fighting floor.
 */
export interface TraversalProblem {
  id: "unreachable" | "swim_only" | "spawn_trapped" | "impossible_jump" | "open_sightlines" | "spawn_exposed" | "no_cover";
  severity: "low" | "medium" | "high";
  message: string;
  position?: Vec2;
}

export interface TraversalReport {
  score: number;
  problems: TraversalProblem[];
  metrics: Record<string, number>;
}

/** Roblox defaults: 16 studs/s, a jump of 7.2 studs, gravity 196.2. */
export const WALK_SPEED = 16;
export const JUMP_HEIGHT = 7.2;
const GRAVITY = 196.2;

/** The widest gap a character crosses to land `rise` studs higher (negative = lower); 0 when out of reach. */
export function jumpReach(rise: number): number {
  if (rise >= JUMP_HEIGHT) return 0;
  const v = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);
  return (WALK_SPEED * (v + Math.sqrt(v * v - 2 * GRAVITY * rise))) / GRAVITY + 1;
}

/** Tallest step walked up without jumping, and the steepest slope (rise over run) the character climbs. */
const STEP = 2.6;
const CLIMB = 1.5;

interface Walk {
  dry: Uint8Array;
  wet: Uint8Array;
}

function walk(bake: WorldBake): Walk {
  const t = bake.terrain;
  const { width: w, depth: d, cellSize: c } = t;
  const h = Float32Array.from(t.heights);
  const water = new Uint8Array(w * d);
  for (let i = 0; i < h.length; i++) if (!Number.isNaN(t.water[i]!)) {
    water[i] = 1;
    h[i] = t.water[i]!;
  }
  // bridges carry the player over what is under them, stairs up what is too steep
  const free = new Uint8Array(w * d);
  const cellAt = (x: number, z: number): number => {
    const ix = Math.round((x - t.origin[0]) / c);
    const iz = Math.round((z - t.origin[1]) / c);
    return ix < 0 || iz < 0 || ix >= w || iz >= d ? -1 : iz * w + ix;
  };
  const strip = (p: Placement, pad: number, deck: boolean) => {
    const v = bake.prefabs[p.prefab]?.[p.variant];
    if (!v) return;
    const cos = Math.cos(p.rotationY);
    const sin = Math.sin(p.rotationY);
    const [x0, , z0] = v.bounds.min;
    const [x1, , z1] = v.bounds.max;
    const up = p.up ?? [0, 1, 0];
    for (let u = x0 * p.scale - pad; u <= x1 * p.scale + pad; u += c / 2) {
      for (let q = z0 * p.scale - (deck ? 0 : pad); q <= z1 * p.scale + (deck ? 0 : pad); q += c / 2) {
        const dx = u * cos + q * sin;
        const dz = -u * sin + q * cos;
        const i = cellAt(p.position[0] + dx, p.position[2] + dz);
        if (i < 0) continue;
        free[i] = 1;
        if (!deck) continue;
        water[i] = 0;
        h[i] = p.position[1] - (up[0] * dx + up[2] * dz) / Math.max(0.2, up[1]);
      }
    }
  };
  for (const p of bake.placements) {
    if (p.prefab === "bridge" || p.prefab === "plank_bridge") strip(p, 3, true);
    else if (/stairs|steps|ramp|ladder/.test(p.prefab)) strip(p, 6, false);
  }
  const start = cellAt(bake.spawn.position[0], bake.spawn.position[2]);
  const flood = (swim: boolean): Uint8Array => {
    const seen = new Uint8Array(w * d);
    if (start < 0) return seen;
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const z = (i / w) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= d) continue;
        const j = nz * w + nx;
        if (seen[j] || (water[j] && !swim)) continue;
        const rise = h[j]! - h[i]!;
        const run = c * Math.hypot(dx, dz);
        if (!(free[i] && free[j]) && rise > STEP && rise / run > CLIMB) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    return seen;
  };
  return { dry: flood(false), wet: flood(true) };
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

export function reviewTraversal(bake: WorldBake): TraversalReport {
  const t = bake.terrain;
  const problems: TraversalProblem[] = [];
  const metrics: Record<string, number> = {};
  let lost = 0;
  const flag = (id: TraversalProblem["id"], severity: TraversalProblem["severity"], cost: number, message: string, position?: Vec2) => {
    lost += cost;
    problems.push({ id, severity, message, ...(position ? { position } : {}) });
  };
  const obby = bake.placements.filter((p) => p.prefab === "obby_stage" || p.prefab === "obby_step");
  const { dry, wet } = walk(bake);
  let land = 0;
  let on = 0;
  for (let i = 0; i < t.heights.length; i++) {
    if (!Number.isNaN(t.water[i]!)) continue;
    land++;
    if (dry[i]) on++;
  }
  metrics.walkable = land ? on / land : 0;
  if (obby.length === 0) {
    if (metrics.walkable < 0.12 && !(bake.terrain.mode === "parts")) flag("spawn_trapped", "high", 40, `only ${Math.round(metrics.walkable * 100)}% of the land can be walked to from the spawn`, [bake.spawn.position[0], bake.spawn.position[2]]);
    const near = (seen: Uint8Array, x: number, z: number, r: number): boolean => {
      const k = Math.ceil(r / t.cellSize);
      const ix = Math.round((x - t.origin[0]) / t.cellSize);
      const iz = Math.round((z - t.origin[1]) / t.cellSize);
      for (let dz = -k; dz <= k; dz++) for (let dx = -k; dx <= k; dx++) {
        if (dx * dx + dz * dz > k * k) continue;
        const gx = ix + dx;
        const gz = iz + dz;
        if (gx >= 0 && gz >= 0 && gx < t.width && gz < t.depth && seen[gz * t.width + gx]) return true;
      }
      return false;
    };
    const SEA = new Set(["pirate_ship", "shipwreck"]);
    const targets = [
      ...bake.landmarks.filter((l) => !SEA.has(l.type)).map((l) => ({ id: l.type as string, x: l.position[0], z: l.position[2], r: l.type === "mountain_peak" || l.type === "volcano" ? 130 : 46 })),
      ...bake.zones.filter((z) => z.kind === "settlement").map((z) => ({ id: z.id, x: z.center[0], z: z.center[1], r: z.radius * 0.4 })),
      ...bake.zones.filter((z) => z.kind === "gameplay" && (z.y === undefined || z.meta?.kind === "facility")).map((z) => ({ id: z.id, x: z.center[0], z: z.center[1], r: Math.max(14, z.radius * 0.7) })),
    ];
    let bad = 0;
    for (const q of targets) {
      if (near(dry, q.x, q.z, q.r)) continue;
      bad++;
      if (near(wet, q.x, q.z, q.r)) flag("swim_only", "medium", 5, `"${q.id}" is only reached by swimming`, [q.x, q.z]);
      else flag("unreachable", "high", 12, `"${q.id}" cannot be reached on foot from the spawn`, [q.x, q.z]);
    }
    metrics.targets = targets.length;
    metrics.reached = targets.length ? 1 - bad / targets.length : 1;
  } else {
    // the course: each platform against the one before it
    const size = (p: Placement, dx: number, dz: number): number => {
      const v = bake.prefabs[p.prefab]![p.variant]!;
      const hx = Math.min(-v.bounds.min[0], v.bounds.max[0]);
      const hz = Math.min(-v.bounds.min[2], v.bounds.max[2]);
      const l = Math.hypot(dx, dz) || 1;
      const u = Math.abs((dx * Math.cos(p.rotationY) - dz * Math.sin(p.rotationY)) / l);
      const q = Math.abs((dx * Math.sin(p.rotationY) + dz * Math.cos(p.rotationY)) / l);
      return Math.min(u > 1e-6 ? hx / u : Infinity, q > 1e-6 ? hz / q : Infinity);
    };
    const order = [...obby].sort((a, b) => Number(a.id.split("_")[1]) - Number(b.id.split("_")[1]));
    let worst = 0;
    let impossible = 0;
    for (let i = 1; i < order.length; i++) {
      const a = order[i - 1]!;
      const b = order[i]!;
      const dx = b.position[0] - a.position[0];
      const dz = b.position[2] - a.position[2];
      const gap = Math.max(0, Math.hypot(dx, dz) - size(a, dx, dz) - size(b, dx, dz));
      const reach = jumpReach(b.position[1] - a.position[1]);
      const ratio = reach > 0 ? gap / reach : 9;
      worst = Math.max(worst, ratio);
      if (ratio <= 1) continue;
      impossible++;
      if (impossible <= 5) flag("impossible_jump", "high", 0, `jump ${i} asks for ${gap.toFixed(1)} studs, ${reach.toFixed(1)} are possible ${(b.position[1] - a.position[1]).toFixed(1)} higher`, [b.position[0], b.position[2]]);
    }
    metrics.hardestJump = worst;
    metrics.impossibleJumps = impossible;
    lost += clamp(impossible / Math.max(1, order.length - 1)) * 160 + (impossible ? 12 : 0);
  }

  // ---------------------------------------------------------------- the fighting floor
  const arena = bake.zones.find((z) => z.meta?.kind === "arena");
  if (arena) {
    const walls = bake.placements.filter((p) => p.prefab.startsWith("arena_") && !/spawn|center/.test(p.prefab)).flatMap((p) => {
      const v = bake.prefabs[p.prefab]?.[p.variant];
      return v ? v.parts.filter((q) => q.collide !== false && q.position[1] + q.size[1] / 2 > 4.6 && q.position[1] - q.size[1] / 2 < 4.4 && q.shape !== "wedge").map((q) => {
        const cos = Math.cos(p.rotationY);
        const sin = Math.sin(p.rotationY);
        return { x: p.position[0] + q.position[0] * cos + q.position[2] * sin, z: p.position[2] - q.position[0] * sin + q.position[2] * cos, hx: q.size[0] / 2, hz: q.size[2] / 2, cos, sin };
      }) : [];
    });
    /** How far an eye sees from a point in a direction. */
    const sight = (x: number, z: number, dx: number, dz: number, max: number): number => {
      let best = max;
      for (const b of walls) {
        const ox = (x - b.x) * b.cos - (z - b.z) * b.sin;
        const oz = (x - b.x) * b.sin + (z - b.z) * b.cos;
        const ux = dx * b.cos - dz * b.sin;
        const uz = dx * b.sin + dz * b.cos;
        let t0 = 0;
        let t1 = best;
        for (const [o, u, half] of [[ox, ux, b.hx], [oz, uz, b.hz]] as const) {
          if (Math.abs(u) < 1e-9) {
            if (Math.abs(o) > half) t1 = -1;
          } else {
            const a = (-half - o) / u;
            const c = (half - o) / u;
            t0 = Math.max(t0, Math.min(a, c));
            t1 = Math.min(t1, Math.max(a, c));
          }
        }
        if (t1 >= t0 && t0 < best) best = t0;
      }
      return best;
    };
    let rays = 0;
    let long = 0;
    let sum = 0;
    let cover = 0;
    let points = 0;
    const R = arena.radius;
    for (let i = 0; i < 70; i++) {
      const a = i * 2.39996;
      const r = R * 0.62 * Math.sqrt((i + 0.5) / 70);
      const x = arena.center[0] + Math.cos(a) * r;
      const z = arena.center[1] + Math.sin(a) * r;
      if (sight(x, z, 1, 0, 1) < 0.01) continue;
      points++;
      let nearest = Infinity;
      for (let k = 0; k < 16; k++) {
        const s = sight(x, z, Math.cos(k * 0.3927), Math.sin(k * 0.3927), R * 2.4);
        rays++;
        sum += s;
        if (s > 110) long++;
        nearest = Math.min(nearest, s);
      }
      if (nearest < 16) cover++;
    }
    metrics.sightline = rays ? sum / rays : 0;
    metrics.longSightlines = rays ? long / rays : 0;
    metrics.coverNear = points ? cover / points : 0;
    if (metrics.longSightlines > 0.12) flag("open_sightlines", "medium", Math.min(22, (metrics.longSightlines - 0.12) * 120), `${Math.round(metrics.longSightlines * 100)}% of the views cross more than 110 studs: snipers own the floor`, arena.center as Vec2);
    if (metrics.coverNear < 0.55) flag("no_cover", "medium", (0.55 - metrics.coverNear) * 40, `cover is close at only ${Math.round(metrics.coverNear * 100)}% of the floor`, arena.center as Vec2);
    const spawns = bake.zones.filter((z) => z.meta?.team !== undefined);
    if (spawns.length >= 2) {
      const [a, b] = [spawns[0]!, spawns[1]!];
      const l = Math.hypot(b.center[0] - a.center[0], b.center[1] - a.center[1]);
      if (sight(a.center[0], a.center[1], (b.center[0] - a.center[0]) / l, (b.center[1] - a.center[1]) / l, l) >= l - 1) flag("spawn_exposed", "high", 14, "the two teams see each other from their spawns", a.center as Vec2);
    }
  }
  return { score: Math.round(clamp(100 - lost, 0, 100) * 10) / 10, problems, metrics };
}
