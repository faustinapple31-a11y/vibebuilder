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
  /** 1/z per pixel: depth is only linear in screen space once inverted, and a ground slab clipped at
   *  the near plane otherwise takes the depth of its clipped corner and paints over the whole world. */
  private readonly invZ: Float32Array;
  constructor(readonly w: number, readonly h: number) {
    this.px = new Uint8Array(w * h * 3);
    this.invZ = new Float32Array(w * h); // 0 = infinitely far
  }
  /** Flat-shaded triangle with a perspective-correct depth test (screen coords, `z` = view depth). */
  tri(a: [number, number, number], b: [number, number, number], c: [number, number, number], r: number, g: number, bl: number): void {
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const maxX = Math.min(this.w - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const maxY = Math.min(this.h - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    if (minX > maxX || minY > maxY) return;
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(area) < 1e-9) return;
    const ia = 1 / a[2];
    const ib = 1 / b[2];
    const ic = 1 / c[2];
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((b[0] - a[0]) * (py - a[1]) - (px - a[0]) * (b[1] - a[1])) / area;
        const w1 = ((px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1])) / area;
        if (w0 < 0 || w1 < 0 || w0 + w1 > 1) continue;
        const iz = ia + (ib - ia) * w1 + (ic - ia) * w0;
        const i = y * this.w + x;
        if (iz <= this.invZ[i]!) continue;
        this.invZ[i] = iz;
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

const NEAR = 1.2;

/**
 * World → camera space and camera space → screen, kept apart on purpose: a triangle has to be clipped
 * against the near plane *before* the perspective divide. Dropping a triangle because one vertex is
 * behind the camera punches a hole in the ground exactly where the camera stands — the bigger the
 * triangle, the bigger the hole, which is why whole ground slabs used to disappear and show the sky.
 */
function makeProjector(cam: Camera, w: number, h: number) {
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const fwd: Vec3 = [cy * cp, sp, sy * cp];
  const right: Vec3 = [-sy, 0, cy];
  const up: Vec3 = [-cy * sp, cp, -sy * sp];
  const f = w / 2 / Math.tan(cam.fov / 2);
  const toView = (p: Vec3): Vec3 => {
    const dx = p[0] - cam.pos[0];
    const dy = p[1] - cam.pos[1];
    const dz = p[2] - cam.pos[2];
    return [
      dx * right[0] + dy * right[1] + dz * right[2],
      dx * up[0] + dy * up[1] + dz * up[2],
      dx * fwd[0] + dy * fwd[1] + dz * fwd[2],
    ];
  };
  const toScreen = (v: Vec3): [number, number, number] => [w / 2 + (v[0] / v[2]) * f, h / 2 - (v[1] / v[2]) * f, v[2]];
  const project = (p: Vec3): [number, number, number] | undefined => {
    const v = toView(p);
    return v[2] < NEAR ? undefined : toScreen(v);
  };
  /** Screen-space triangles of a world triangle, clipped against the near plane (0, 1 or 2 of them). */
  const clipTri = (a: Vec3, b: Vec3, c: Vec3): [number, number, number][][] => {
    const vs = [toView(a), toView(b), toView(c)];
    const inside = vs.filter((v) => v[2] >= NEAR);
    if (inside.length === 3) return [[toScreen(vs[0]!), toScreen(vs[1]!), toScreen(vs[2]!)]];
    if (inside.length === 0) return [];
    // walk the edges, keeping the inside vertices and the crossings (Sutherland–Hodgman on one plane)
    const poly: Vec3[] = [];
    for (let i = 0; i < 3; i++) {
      const cur = vs[i]!;
      const nxt = vs[(i + 1) % 3]!;
      const curIn = cur[2] >= NEAR;
      const nxtIn = nxt[2] >= NEAR;
      if (curIn) poly.push(cur);
      if (curIn !== nxtIn) {
        const t = (NEAR - cur[2]) / (nxt[2] - cur[2]);
        poly.push([cur[0] + (nxt[0] - cur[0]) * t, cur[1] + (nxt[1] - cur[1]) * t, NEAR]);
      }
    }
    if (poly.length < 3) return [];
    const p0 = toScreen(poly[0]!);
    const out: [number, number, number][][] = [];
    for (let i = 1; i + 1 < poly.length; i++) out.push([p0, toScreen(poly[i]!), toScreen(poly[i + 1]!)]);
    return out;
  };
  return { project, clipTri };
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

/**
 * Roblox WedgePart: vertical face at +Z, slope descending toward -Z. Same vertices and winding as the
 * app's viewer (`apps/desktop/src/features/viewer/geometry.ts`) — get the winding wrong and every roof
 * in the scene shows its inside faces, which reads as a dark, inward-folded roof.
 */
function wedgeTris(h: Vec3): Tri[] {
  const [x, y, z] = h;
  const A: Vec3 = [-x, -y, -z];
  const B: Vec3 = [x, -y, -z];
  const C: Vec3 = [x, -y, z];
  const D: Vec3 = [-x, -y, z];
  const H: Vec3 = [-x, y, z];
  const G: Vec3 = [x, y, z];
  return [
    [A, C, B], [A, D, C], // bottom
    [D, C, G], [D, G, H], // vertical face at +Z
    [A, H, G], [A, G, B], // slope
    [A, D, H], // left
    [B, G, C], // right
  ];
}

/** CornerWedge: a quarter pyramid with its apex at (+x, +y, -z), as the viewer approximates it. */
function cornerWedgeTris(h: Vec3): Tri[] {
  const [x, y, z] = h;
  const p0: Vec3 = [-x, -y, -z];
  const p1: Vec3 = [x, -y, -z];
  const p2: Vec3 = [x, -y, z];
  const p3: Vec3 = [-x, -y, z];
  const ap: Vec3 = [x, y, -z];
  return [[p0, p2, p1], [p0, p3, p2], [p0, p1, ap], [p1, p2, ap], [p2, p3, ap], [p3, p0, ap]];
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
      return wedgeTris(h);
    case "cornerWedge":
      return cornerWedgeTris(h);
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
  const { project, clipTri } = makeProjector(cam, w, h);
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
        const w00: Vec3 = [x0, surface[0]!, z0];
        const w10: Vec3 = [x1, surface[1]!, z0];
        const w01: Vec3 = [x0, surface[2]!, z1];
        const w11: Vec3 = [x1, surface[3]!, z1];
        const p00 = project(w00);
        const p11 = project(w11);
        const n: Vec3 = flat ? [0, 1, 0] : (() => {
          const nx = (surface[0]! + surface[2]! - surface[1]! - surface[3]!) / (2 * t.cellSize);
          const nz = (surface[0]! + surface[1]! - surface[2]! - surface[3]!) / (2 * t.cellSize);
          const l = Math.hypot(nx, 1, nz);
          return [nx / l, 1 / l, nz / l] as Vec3;
        })();
        const sh = shade(n);
        const c = mix([Math.min(255, color[0] * sh), Math.min(255, color[1] * sh), Math.min(255, color[2] * sh)], fogFactor(((p00?.[2] ?? far) + (p11?.[2] ?? far)) / 2));
        for (const [pa, pb, pc] of [...clipTri(w00, w10, w11), ...clipTri(w00, w11, w01)]) frame.tri(pa, pb, pc, c[0], c[1], c[2]);
      };
      if (!parts) draw([y00, y10, y01, y11], tintOf(names[mAt(ix, iz)] ?? "Grass"), false);
      if (water.some((v) => !Number.isNaN(v))) {
        draw(water.map((v, k) => (Number.isNaN(v) ? [y00, y10, y01, y11][k]! : v)), hex(bake.lighting.terrain?.waterColor ?? "#2f6f9a"), true);
      }
    }
  }
  // ---- prefab parts: real geometry (mesh triangles, balls, cylinders, wedges), painter's order
  type Job = { d: number; prefab: string; part: Part; m: Mat3; origin: Vec3; scale: number; meshes: Record<string, { trianglesB64: string; triangleCount: number; bounds: { min: Vec3; max: Vec3 } }> | undefined };
  const jobs: Job[] = [];
  for (const p of bake.placements) {
    const v = bake.prefabs[p.prefab]?.[p.variant];
    if (!v) continue;
    // cull against the placement's extent, not its centre: a ground slab is hundreds of studs across and
    // its centroid can sit past the far plane while the part under the camera is the one being drawn —
    // dropping it showed the sky through the floor
    const reach = Math.max(
      Math.abs(v.bounds.min[0]), Math.abs(v.bounds.max[0]),
      Math.abs(v.bounds.min[2]), Math.abs(v.bounds.max[2]),
    ) * p.scale;
    const d = Math.max(0, Math.hypot(p.position[0] - cam.pos[0], p.position[2] - cam.pos[2]) - reach);
    if (d > far) continue;
    const m = placementMatrix(p.rotationY, p.up);
    for (const part of v.parts) {
      if ((part.transparency ?? 0) > 0.6) continue;
      if (d > far * 0.4 && (part.lod ?? 2) < 1) continue; // far away, silhouette parts only
      jobs.push({ d, prefab: p.prefab, part, m, origin: p.position, scale: p.scale, meshes: v.meshes as Job["meshes"] });
    }
  }
  jobs.sort((a, b) => b.d - a.d);
  for (const job of jobs) {
    const { part, m, origin, scale } = job;
    const local = eulerXYZToMatrix(part.rotation);
    const base = hex(part.color);
    const detail = job.d < far * 0.34;
    const tris = partTris(part, job.meshes, scale, detail);
    for (const tri of tris) {
      const world = tri.map((v) => {
        const l = mat3Apply(local, v);
        const r = mat3Apply(m, [l[0] + part.position[0] * scale, l[1] + part.position[1] * scale, l[2] + part.position[2] * scale]);
        return [origin[0] + r[0], origin[1] + r[1], origin[2] + r[2]] as Vec3;
      });
      // the shade comes from the world-space normal, so it is the same whether or not the triangle
      // had to be clipped
      const e1 = [world[1]![0] - world[0]![0], world[1]![1] - world[0]![1], world[1]![2] - world[0]![2]];
      const e2 = [world[2]![0] - world[0]![0], world[2]![1] - world[0]![1], world[2]![2] - world[0]![2]];
      const nx = e1[1]! * e2[2]! - e1[2]! * e2[1]!;
      const ny = e1[2]! * e2[0]! - e1[0]! * e2[2]!;
      const nz = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
      const nl = Math.hypot(nx, ny, nz) || 1;
      const sh = shade([nx / nl, ny / nl, nz / nl]);
      for (const [a, b, c] of clipTri(world[0]!, world[1]!, world[2]!)) {
        // back-face cull on screen winding (the local triangles are wound counter-clockwise outward)
        if ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]) >= 0) continue;
        const col = mix([Math.min(255, base[0] * sh), Math.min(255, base[1] * sh), Math.min(255, base[2] * sh)], fogFactor((a[2] + b[2] + c[2]) / 3));
        frame.tri(a, b, c, col[0], col[1], col[2]);
      }
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
  /** Raises the eye clear of anything tall standing around it — a village camera that lands inside a
   *  pine canopy renders a wall of green and nothing else. */
  const clearOfProps = (from: Vec3): Vec3 => {
    let y = from[1];
    for (const p of bake.placements) {
      const v = bake.prefabs[p.prefab]?.[p.variant];
      if (!v) continue;
      const reach = v.footprintRadius * p.scale + 8;
      if (Math.hypot(p.position[0] - from[0], p.position[2] - from[2]) > reach) continue;
      y = Math.max(y, p.position[1] + v.bounds.max[1] * p.scale + 6);
    }
    return [from[0], y, from[2]];
  };
  /**
   * Raises the eye until the ground between it and its subject is below the line of sight. A terrace
   * wall between the camera and the village fills the frame with a green slab and shows nothing of the
   * world — a camera that cannot see its subject is a wasted image.
   */
  const clearOf = (from: Vec3, at: Vec3): Vec3 => {
    let y = from[1];
    for (let pass = 0; pass < 6; pass++) {
      let worst = 0;
      const steps = 48;
      for (let i = 1; i < steps; i++) {
        const k = i / steps;
        const x = from[0] + (at[0] - from[0]) * k;
        const z = from[2] + (at[2] - from[2]) * k;
        const rayY = y + (at[1] - y) * k;
        worst = Math.max(worst, sampleHeight(bake.terrain, x, z) + 2 - rayY);
      }
      if (worst <= 0) break;
      y += worst + 4;
    }
    return [from[0], y, from[2]];
  };
  const spawn = bake.spawn.position;
  const look = bake.spawn.lookAt;
  const p0 = eye(spawn[0], spawn[2], 6);
  out.push({ name: "spawn", cam: { pos: p0, yaw: toward(p0, look), pitch: -0.04, fov: 1.15 }, far: 640 });
  const focal = bake.landmarks.find((l) => l.role === "focal") ?? bake.landmarks[0];
  if (focal) {
    const d = 150;
    const a = Math.atan2(focal.position[2] - spawn[2], focal.position[0] - spawn[0]);
    const raw = eye(focal.position[0] - Math.cos(a) * d, focal.position[2] - Math.sin(a) * d, 26);
    const p = clearOf(clearOfProps(raw), [focal.position[0], focal.position[1] + 18, focal.position[2]]);
    const drop = -Math.atan2(p[1] - (focal.position[1] + 18), d);
    out.push({ name: "landmark", cam: { pos: p, yaw: a, pitch: Math.min(-0.05, drop), fov: 1.05 }, far: 760 });
  }
  const village = bake.zones.find((z) => z.kind === "settlement");
  if (village) {
    const d = village.radius + 90;
    const target: Vec3 = [village.center[0], (village.y ?? sampleHeight(bake.terrain, village.center[0], village.center[1])) + 10, village.center[1]];
    const p = clearOf(clearOfProps(eye(village.center[0] - d * 0.7, village.center[1] - d * 0.7, 42)), target);
    const drop = -Math.atan2(p[1] - target[1], d);
    out.push({ name: "village", cam: { pos: p, yaw: Math.atan2(d * 0.7, d * 0.7), pitch: Math.min(-0.12, drop), fov: 1.05 }, far: 700 });
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
