/**
 * Map preview — renders a generated world to PNGs so a change to the generator can be *looked* at,
 * not only scored. Same role for maps as `preview-ui-kits.ts` has for the UI libraries.
 *
 *   npx tsx scripts/preview-map.ts "village médiéval dans une forêt"      # 1 world, 4 views + plan
 *   npx tsx scripts/preview-map.ts --panel                                # the audit panel, 1 view each
 *   npx tsx scripts/preview-map.ts "<prompt>" --width 1600 --out demo-output/look
 *
 * No Roblox, no browser: a small software rasterizer (z-buffer, flat-shaded oriented boxes for every
 * prefab part, triangles for the terrain, height fog and a sky gradient from the bake's own lighting).
 * It renders what the bake says, so a floating rock or a bare verge shows up exactly as Studio would
 * show it. Writes `index.html` next to the images as a contact sheet.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { interpretPrompt } from "../packages/agents/src/local/interpreter";
import {
  STYLE_FAMILY_INDEX,
  StyleBibleSchema,
  TERRAIN_MATERIALS,
  base64ToF32,
  eulerXYZToMatrix,
  mat3Apply,
  rotY,
  sampleHeight,
  styleFamilyToBible,
  type Mat3,
  type Part,
  type Vec3,
  type WorldBake,
} from "../packages/core/src";
import { generateWorld } from "../packages/world-gen/src";
import { critiqueBake } from "../packages/quality/src";
import { encodePng } from "../packages/textures/src";

// ------------------------------------------------------------------ framebuffer
class Frame {
  readonly px: Uint8Array;
  private readonly depth: Float32Array;
  constructor(readonly w: number, readonly h: number) {
    this.px = new Uint8Array(w * h * 3);
    this.depth = new Float32Array(w * h).fill(Infinity);
  }
  /** Flat-shaded triangle with a depth test per pixel (screen coords, `z` = view depth in studs). */
  tri(a: [number, number, number], b: [number, number, number], c: [number, number, number], r: number, g: number, bl: number): void {
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const maxX = Math.min(this.w - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const maxY = Math.min(this.h - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    if (minX > maxX || minY > maxY) return;
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(area) < 1e-9) return;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((b[0] - a[0]) * (py - a[1]) - (px - a[0]) * (b[1] - a[1])) / area;
        const w1 = ((px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1])) / area;
        if (w0 < 0 || w1 < 0 || w0 + w1 > 1) continue;
        const z = a[2] + (b[2] - a[2]) * w1 + (c[2] - a[2]) * w0;
        const i = y * this.w + x;
        if (z >= this.depth[i]!) continue;
        this.depth[i] = z;
        const o = i * 3;
        this.px[o] = r;
        this.px[o + 1] = g;
        this.px[o + 2] = bl;
      }
    }
  }
  fillSky(top: [number, number, number], bottom: [number, number, number], horizon: number): void {
    for (let y = 0; y < this.h; y++) {
      const t = Math.max(0, Math.min(1, y / Math.max(1, horizon)));
      const k = Math.pow(t, 0.8);
      for (let x = 0; x < this.w; x++) {
        const o = (y * this.w + x) * 3;
        this.px[o] = Math.round(top[0] + (bottom[0] - top[0]) * k);
        this.px[o + 1] = Math.round(top[1] + (bottom[1] - top[1]) * k);
        this.px[o + 2] = Math.round(top[2] + (bottom[2] - top[2]) * k);
      }
    }
  }
}

const hex = (h: string): [number, number, number] => {
  const n = Number.parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// ------------------------------------------------------------------ camera
interface Camera {
  pos: Vec3;
  yaw: number;
  pitch: number;
  fov: number;
}

function makeProjector(cam: Camera, w: number, h: number) {
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const fwd: Vec3 = [cy * cp, sp, sy * cp];
  const right: Vec3 = [-sy, 0, cy];
  const up: Vec3 = [-cy * sp, cp, -sy * sp];
  const f = w / 2 / Math.tan(cam.fov / 2);
  return (p: Vec3): [number, number, number] | undefined => {
    const dx = p[0] - cam.pos[0];
    const dy = p[1] - cam.pos[1];
    const dz = p[2] - cam.pos[2];
    const z = dx * fwd[0] + dy * fwd[1] + dz * fwd[2];
    if (z < 1.2) return undefined;
    const x = dx * right[0] + dy * right[1] + dz * right[2];
    const y = dx * up[0] + dy * up[1] + dz * up[2];
    return [w / 2 + (x / z) * f, h / 2 - (y / z) * f, z];
  };
}

const LIGHT: Vec3 = [0.42, 0.78, -0.47];

/** Face shade (0.45…1.15) from the face normal, plus a touch of ambient sky bounce on up-facing faces. */
function shade(n: Vec3): number {
  const d = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
  return 0.52 + Math.max(0, d) * 0.55 + Math.max(0, n[1]) * 0.08;
}

// ------------------------------------------------------------------ render
type Tri = [Vec3, Vec3, Vec3];

const BOX_QUADS: number[][] = [
  [2, 3, 7, 6], [0, 4, 5, 1], [4, 6, 7, 5], [0, 1, 3, 2], [1, 5, 7, 3], [0, 2, 6, 4],
];
const BOX_CORNERS: Vec3[] = [];
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) BOX_CORNERS.push([sx, sy, sz]);

function boxTris(h: Vec3): Tri[] {
  const c = BOX_CORNERS.map((v) => [v[0] * h[0], v[1] * h[1], v[2] * h[2]] as Vec3);
  const out: Tri[] = [];
  for (const q of BOX_QUADS) {
    out.push([c[q[0]!]!, c[q[1]!]!, c[q[2]!]!]);
    out.push([c[q[0]!]!, c[q[2]!]!, c[q[3]!]!]);
  }
  return out;
}

/** Low-poly ellipsoid — what a Roblox ball part looks like, and the fallback for a canopy mesh. */
function sphereTris(h: Vec3, rings = 5, seg = 9): Tri[] {
  const at = (i: number, j: number): Vec3 => {
    const phi = (i / rings) * Math.PI;
    const th = (j / seg) * Math.PI * 2;
    return [Math.sin(phi) * Math.cos(th) * h[0], Math.cos(phi) * h[1], Math.sin(phi) * Math.sin(th) * h[2]];
  };
  const out: Tri[] = [];
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i + 1, j + 1);
      const d = at(i, j + 1);
      out.push([a, b, c], [a, c, d]);
    }
  }
  return out;
}

/** Roblox cylinder: circular section in Y/Z, axis along X. */
function cylinderTris(h: Vec3, seg = 10): Tri[] {
  const ring = (sx: number, j: number): Vec3 => [sx * h[0], Math.cos((j / seg) * Math.PI * 2) * h[1], Math.sin((j / seg) * Math.PI * 2) * h[2]];
  const out: Tri[] = [];
  for (let j = 0; j < seg; j++) {
    const a = ring(-1, j);
    const b = ring(1, j);
    const c = ring(1, j + 1);
    const d = ring(-1, j + 1);
    out.push([a, b, c], [a, c, d]);
    out.push([[-h[0], 0, 0], d, a]);
    out.push([[h[0], 0, 0], b, c]);
  }
  return out;
}

/** Roblox wedge: the -Z/+Y edge is cut away (a ramp rising toward +Z). */
function wedgeTris(h: Vec3): Tri[] {
  const [x, y, z] = h;
  const a: Vec3 = [-x, -y, -z];
  const b: Vec3 = [x, -y, -z];
  const c: Vec3 = [x, -y, z];
  const d: Vec3 = [-x, -y, z];
  const e: Vec3 = [-x, y, z];
  const f: Vec3 = [x, y, z];
  return [
    [a, c, b], [a, d, c],
    [d, e, f], [d, f, c],
    [a, b, f], [a, f, e],
    [b, c, f],
    [a, e, d],
  ];
}

function meshTris(data: { trianglesB64: string; triangleCount: number; bounds: { min: Vec3; max: Vec3 } }, size: Vec3): Tri[] {
  const f = base64ToF32(data.trianglesB64);
  const bw = data.bounds.max[0] - data.bounds.min[0] || 1;
  const bh = data.bounds.max[1] - data.bounds.min[1] || 1;
  const bd = data.bounds.max[2] - data.bounds.min[2] || 1;
  const sx = size[0] / bw;
  const sy = size[1] / bh;
  const sz = size[2] / bd;
  const out: Tri[] = [];
  for (let t = 0; t < data.triangleCount; t++) {
    const o = t * 9;
    out.push([
      [f[o]! * sx, f[o + 1]! * sy, f[o + 2]! * sz],
      [f[o + 3]! * sx, f[o + 4]! * sy, f[o + 5]! * sz],
      [f[o + 6]! * sx, f[o + 7]! * sy, f[o + 8]! * sz],
    ]);
  }
  return out;
}

/** Local triangles of a part, already scaled (`detail` false → the cheap silhouette form). */
function partTris(part: Part, meshes: Record<string, { trianglesB64: string; triangleCount: number; bounds: { min: Vec3; max: Vec3 } }> | undefined, scale: number, detail: boolean): Tri[] {
  const h: Vec3 = [(part.size[0] / 2) * scale, (part.size[1] / 2) * scale, (part.size[2] / 2) * scale];
  switch (part.shape) {
    case "sphere":
      return sphereTris(h, detail ? 5 : 3, detail ? 9 : 5);
    case "cylinder":
      return cylinderTris(h, detail ? 10 : 5);
    case "wedge":
    case "cornerWedge":
      return wedgeTris(h);
    case "mesh": {
      const data = part.mesh !== undefined ? meshes?.[part.mesh] : undefined;
      if (!data) return part.meshFallback === "box" ? boxTris(h) : sphereTris(h, 4, 7);
      if (!detail) return part.meshFallback === "box" ? boxTris(h) : sphereTris(h, 3, 5);
      return meshTris(data, [part.size[0] * scale, part.size[1] * scale, part.size[2] * scale]);
    }
    default:
      return boxTris(h);
  }
}

function renderView(bake: WorldBake, cam: Camera, w: number, h: number, far: number): Frame {
  const frame = new Frame(w, h);
  const project = makeProjector(cam, w, h);
  const sky = hex(bake.lighting.atmosphere?.color ?? "#9fc6e8");
  const fog = hex(bake.lighting.fogColor ?? bake.lighting.atmosphere?.color ?? "#b9cfdd");
  frame.fillSky([Math.round(sky[0] * 0.72), Math.round(sky[1] * 0.78), Math.round(sky[2] * 0.95)], fog, h * 0.5);
  const t = bake.terrain;
  const MATERIAL_TINT: Record<string, string> = {
    Grass: "#5f9a4a", LeafyGrass: "#4f8a3f", Ground: "#7a6440", Mud: "#5e4a30", Rock: "#7d7a74", Slate: "#63666b",
    Sand: "#d8c48a", Snow: "#e8eef2", Cobblestone: "#8a857c", Basalt: "#4a4744", Limestone: "#c8c0a8",
    Sandstone: "#c2a06a", Ice: "#bfe4f2", Asphalt: "#4b4b4f", Pavement: "#8f8f8c", Concrete: "#9a9a95", Water: "#2f6f9a",
  };
  const palette = (bake.lighting.terrainColors ?? {}) as Record<string, string | undefined>;
  const tintOf = (m: string): [number, number, number] => hex(palette[m] ?? MATERIAL_TINT[m] ?? "#6a7f3f");
  // the bake's own fog ramp, so the preview washes out exactly where Studio would
  const fogStart = bake.lighting.fogStart ?? far * 0.25;
  const fogEnd = Math.max(fogStart + 1, bake.lighting.fogEnd ?? far);
  const haze = Math.min(1, 0.35 + (bake.lighting.atmosphere?.density ?? 0.3) * 0.9);
  const fogFactor = (z: number) => Math.min(0.9, Math.max(0, (z - fogStart) / (fogEnd - fogStart)) * haze);
  const mix = (c: [number, number, number], k: number): [number, number, number] => [
    Math.round(c[0] + (fog[0] - c[0]) * k),
    Math.round(c[1] + (fog[1] - c[1]) * k),
    Math.round(c[2] + (fog[2] - c[2]) * k),
  ];
  const names = TERRAIN_MATERIALS;
  const cellsFar = Math.ceil(far / t.cellSize);
  const [gcx, gcz] = [Math.round((cam.pos[0] - t.origin[0]) / t.cellSize), Math.round((cam.pos[2] - t.origin[1]) / t.cellSize)];
  const hAt = (ix: number, iz: number) => t.heights[Math.max(0, Math.min(t.depth - 1, iz)) * t.width + Math.max(0, Math.min(t.width - 1, ix))]!;
  const wAt = (ix: number, iz: number) => t.water[Math.max(0, Math.min(t.depth - 1, iz)) * t.width + Math.max(0, Math.min(t.width - 1, ix))]!;
  const mAt = (ix: number, iz: number) => t.materials[Math.max(0, Math.min(t.depth - 1, iz)) * t.width + Math.max(0, Math.min(t.width - 1, ix))]!;
  // in parts mode the visible ground is the slab prefabs, not the heightmap: only the sea is poured
  const parts = t.mode === "parts";
  for (let dz = -cellsFar; dz <= cellsFar; dz++) {
    for (let dx = -cellsFar; dx <= cellsFar; dx++) {
      const ix = gcx + dx;
      const iz = gcz + dz;
      if (ix < 0 || iz < 0 || ix >= t.width - 1 || iz >= t.depth - 1) continue;
      const x0 = t.origin[0] + ix * t.cellSize;
      const z0 = t.origin[1] + iz * t.cellSize;
      const x1 = x0 + t.cellSize;
      const z1 = z0 + t.cellSize;
      const y00 = hAt(ix, iz);
      const y10 = hAt(ix + 1, iz);
      const y01 = hAt(ix, iz + 1);
      const y11 = hAt(ix + 1, iz + 1);
      const water = [wAt(ix, iz), wAt(ix + 1, iz), wAt(ix, iz + 1), wAt(ix + 1, iz + 1)];
      const draw = (surface: number[], color: [number, number, number], flat: boolean) => {
        const p00 = project([x0, surface[0]!, z0]);
        const p10 = project([x1, surface[1]!, z0]);
        const p01 = project([x0, surface[2]!, z1]);
        const p11 = project([x1, surface[3]!, z1]);
        if (!p00 || !p10 || !p01 || !p11) return;
        const n: Vec3 = flat ? [0, 1, 0] : (() => {
          const nx = (surface[0]! + surface[2]! - surface[1]! - surface[3]!) / (2 * t.cellSize);
          const nz = (surface[0]! + surface[1]! - surface[2]! - surface[3]!) / (2 * t.cellSize);
          const l = Math.hypot(nx, 1, nz);
          return [nx / l, 1 / l, nz / l] as Vec3;
        })();
        const sh = shade(n);
        const c = mix([Math.min(255, color[0] * sh), Math.min(255, color[1] * sh), Math.min(255, color[2] * sh)], fogFactor((p00[2] + p11[2]) / 2));
        frame.tri(p00, p10, p11, c[0], c[1], c[2]);
        frame.tri(p00, p11, p01, c[0], c[1], c[2]);
      };
      if (!parts) draw([y00, y10, y01, y11], tintOf(names[mAt(ix, iz)] ?? "Grass"), false);
      if (water.some((v) => !Number.isNaN(v))) {
        draw(water.map((v, k) => (Number.isNaN(v) ? [y00, y10, y01, y11][k]! : v)), hex(bake.lighting.terrain?.waterColor ?? "#2f6f9a"), true);
      }
    }
  }
  // ---- prefab parts: real geometry (mesh triangles, balls, cylinders, wedges), painter's order
  type Job = { d: number; part: Part; m: Mat3; origin: Vec3; scale: number; meshes: Record<string, { trianglesB64: string; triangleCount: number; bounds: { min: Vec3; max: Vec3 } }> | undefined };
  const jobs: Job[] = [];
  for (const p of bake.placements) {
    const d = Math.hypot(p.position[0] - cam.pos[0], p.position[2] - cam.pos[2]);
    if (d > far) continue;
    const v = bake.prefabs[p.prefab]?.[p.variant];
    if (!v) continue;
    const m = placementMatrix(p.rotationY, p.up);
    for (const part of v.parts) {
      if ((part.transparency ?? 0) > 0.6) continue;
      if (d > far * 0.4 && (part.lod ?? 2) < 1) continue; // far away, silhouette parts only
      jobs.push({ d, part, m, origin: p.position, scale: p.scale, meshes: v.meshes as Job["meshes"] });
    }
  }
  jobs.sort((a, b) => b.d - a.d);
  for (const job of jobs) {
    const { part, m, origin, scale } = job;
    const local = eulerXYZToMatrix(part.rotation);
    const base = hex(part.color);
    const detail = job.d < far * 0.34;
    for (const tri of partTris(part, job.meshes, scale, detail)) {
      const world = tri.map((v) => {
        const l = mat3Apply(local, v);
        const r = mat3Apply(m, [l[0] + part.position[0] * scale, l[1] + part.position[1] * scale, l[2] + part.position[2] * scale]);
        return [origin[0] + r[0], origin[1] + r[1], origin[2] + r[2]] as Vec3;
      });
      const a = project(world[0]!);
      const b = project(world[1]!);
      const c = project(world[2]!);
      if (!a || !b || !c) continue;
      // back-face cull on screen winding (the local triangles above are wound counter-clockwise outward)
      if ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]) >= 0) continue;
      const e1 = [world[1]![0] - world[0]![0], world[1]![1] - world[0]![1], world[1]![2] - world[0]![2]];
      const e2 = [world[2]![0] - world[0]![0], world[2]![1] - world[0]![1], world[2]![2] - world[0]![2]];
      const nx = e1[1]! * e2[2]! - e1[2]! * e2[1]!;
      const ny = e1[2]! * e2[0]! - e1[0]! * e2[2]!;
      const nz = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
      const nl = Math.hypot(nx, ny, nz) || 1;
      const sh = shade([nx / nl, ny / nl, nz / nl]);
      const col = mix([Math.min(255, base[0] * sh), Math.min(255, base[1] * sh), Math.min(255, base[2] * sh)], fogFactor((a[2] + b[2] + c[2]) / 3));
      frame.tri(a, b, c, col[0], col[1], col[2]);
    }
  }
  return frame;
}

/** Placement rotation: yaw, then the tilt that maps local +Y onto `up` (what the runtime applies). */
function placementMatrix(rotationY: number, up: Vec3 | undefined): Mat3 {
  const m = rotY((-rotationY * 180) / Math.PI);
  if (!up) return m;
  const len = Math.hypot(up[0], up[1], up[2]) || 1;
  const n: Vec3 = [up[0] / len, up[1] / len, up[2] / len];
  const al = Math.hypot(n[2], -n[0]);
  if (al < 1e-4) return m;
  const ax = n[2] / al;
  const az = -n[0] / al;
  const ang = Math.acos(Math.max(-1, Math.min(1, n[1])));
  const c = Math.cos(ang);
  const sn = Math.sin(ang);
  const k = 1 - c;
  const tilt: Mat3 = [
    ax * ax * k + c, -az * sn, ax * az * k,
    az * sn, c, -ax * sn,
    ax * az * k, ax * sn, az * az * k + c,
  ];
  const out: number[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out.push(tilt[i * 3]! * m[j]! + tilt[i * 3 + 1]! * m[3 + j]! + tilt[i * 3 + 2]! * m[6 + j]!);
  return out as Mat3;
}

/** Cameras worth looking at: the player's first frame, the village, the focal landmark, a wide sweep. */
function cameras(bake: WorldBake): { name: string; cam: Camera; far: number }[] {
  const out: { name: string; cam: Camera; far: number }[] = [];
  const eye = (x: number, z: number, up: number): Vec3 => [x, sampleHeight(bake.terrain, x, z) + up, z];
  const toward = (from: Vec3, at: Vec3): number => Math.atan2(at[2] - from[2], at[0] - from[0]);
  const spawn = bake.spawn.position;
  const look = bake.spawn.lookAt;
  const p0 = eye(spawn[0], spawn[2], 6);
  out.push({ name: "spawn", cam: { pos: p0, yaw: toward(p0, look), pitch: -0.04, fov: 1.15 }, far: 640 });
  const focal = bake.landmarks.find((l) => l.role === "focal") ?? bake.landmarks[0];
  if (focal) {
    const d = 150;
    const a = Math.atan2(focal.position[2] - spawn[2], focal.position[0] - spawn[0]);
    const p = eye(focal.position[0] - Math.cos(a) * d, focal.position[2] - Math.sin(a) * d, 26);
    out.push({ name: "landmark", cam: { pos: p, yaw: a, pitch: -0.1, fov: 1.05 }, far: 760 });
  }
  const village = bake.zones.find((z) => z.kind === "settlement");
  if (village) {
    const d = village.radius + 90;
    const p = eye(village.center[0] - d * 0.7, village.center[1] - d * 0.7, 42);
    out.push({ name: "village", cam: { pos: p, yaw: Math.atan2(d * 0.7, d * 0.7), pitch: -0.22, fov: 1.05 }, far: 700 });
  }
  const cx = bake.terrain.origin[0] + (bake.terrain.width * bake.terrain.cellSize) / 2;
  const cz = bake.terrain.origin[1] + (bake.terrain.depth * bake.terrain.cellSize) / 2;
  const span = Math.min(bake.terrain.width, bake.terrain.depth) * bake.terrain.cellSize;
  out.push({
    name: "wide",
    cam: { pos: [cx - span * 0.42, bake.stats.heightMax + span * 0.16, cz - span * 0.42], yaw: Math.PI / 4, pitch: -0.42, fov: 1.15 },
    far: span * 1.3,
  });
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string, fallback: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
  };
  const panel = args.includes("--panel");
  const width = Number.parseInt(flag("width", panel ? "960" : "1280"), 10);
  const height = Math.round(width * 0.5625);
  const outDir = flag("out", "demo-output/map-preview");
  const prompts = panel
    ? ["village médiéval dans une forêt avec un château", "île tropicale de survie avec un village de pêcheurs", "ville cyberpunk néon la nuit", "désert avec une pyramide et une oasis", "montagne enneigée avec un chalet", "ferme cozy au bord d'un lac"]
    : [args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1]?.startsWith("--") !== true) ?? "village médiéval dans une forêt avec un château"];
  mkdirSync(outDir, { recursive: true });
  const cards: string[] = [];
  for (const prompt of prompts) {
    const { spec } = interpretPrompt(prompt);
    const fam = STYLE_FAMILY_INDEX[spec.stylePreset] ?? STYLE_FAMILY_INDEX.stylized_mystical!;
    const style = StyleBibleSchema.parse(styleFamilyToBible(fam));
    const bake = generateWorld(spec, style);
    const report = critiqueBake(bake, spec, style);
    const slug = prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    const views = panel ? cameras(bake).slice(0, 1) : cameras(bake);
    const imgs: string[] = [];
    for (const { name, cam, far } of views) {
      const frame = renderView(bake, cam, width, height, far);
      const file = `${slug}-${name}.png`;
      writeFileSync(join(outDir, file), await encodePng(width, height, frame.px, 3));
      imgs.push(file);
      console.log(`  ${file}`);
    }
    cards.push(
      `<section><h2>${prompt}</h2><p>${spec.stylePreset} · score ${report.score}/100 · ${bake.placements.length} placements · σ ${bake.stats.heightStd.toFixed(0)} · ${report.problems.map((p) => p.id).join(", ") || "no complaints"}</p>` +
        imgs.map((f) => `<figure><img src="${f}" alt="${f}"><figcaption>${f.replace(`${slug}-`, "").replace(".png", "")}</figcaption></figure>`).join("") +
        `</section>`,
    );
    console.log(`${report.score}/100  ${prompt}`);
  }
  writeFileSync(
    join(outDir, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>WorldForge map preview</title>` +
      `<style>body{margin:0;padding:24px;background:#12141a;color:#e8e6e1;font:14px/1.5 system-ui,sans-serif}h1{font-size:20px}h2{font-size:16px;margin:28px 0 4px}p{color:#9a9a9a;margin:0 0 10px}figure{margin:0 0 14px}img{width:100%;max-width:1280px;display:block;border-radius:8px}figcaption{color:#7a7a7a;font-size:12px;padding-top:4px}</style>` +
      `<h1>Map preview</h1>${cards.join("")}`,
  );
  console.log(`→ ${join(outDir, "index.html")}`);
}

void main();
