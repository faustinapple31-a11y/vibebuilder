import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { EFFECT_PRESETS, GLOWING_EFFECTS, TERRAIN_MATERIAL_COLORS, TERRAIN_MATERIALS, hashString, hexToRgb, type Part, type PrefabVariant, type TerrainData, type TerrainMaterial } from "@worldforge/core";

/** Unit primitives matching the PartList conventions (see packages/core/src/partlist.ts). */
const unit = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(0.5, 10, 8),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  wedge: makeWedge(),
  cornerWedge: makeCornerWedge(),
};

/** Wedge: vertical face at +Z, slope descending toward -Z (Roblox WedgePart). */
function makeWedge(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  // prettier-ignore
  const v = [
    // bottom (y=-.5)
    -0.5,-0.5,-0.5,  0.5,-0.5,-0.5,  0.5,-0.5,0.5,  -0.5,-0.5,0.5,
    // back vertical (z=+.5)
    -0.5,-0.5,0.5,  0.5,-0.5,0.5,  0.5,0.5,0.5,  -0.5,0.5,0.5,
    // slope: front-bottom edge → top-back edge
    -0.5,-0.5,-0.5,  0.5,-0.5,-0.5,  0.5,0.5,0.5,  -0.5,0.5,0.5,
    // side x=-.5 (triangle)
    -0.5,-0.5,-0.5,  -0.5,-0.5,0.5,  -0.5,0.5,0.5,
    // side x=+.5 (triangle)
    0.5,-0.5,-0.5,  0.5,-0.5,0.5,  0.5,0.5,0.5,
  ];
  // prettier-ignore
  const idx = [
    0,2,1, 0,3,2,        // bottom (facing down)
    4,5,6, 4,6,7,        // back
    8,11,10, 8,10,9,     // slope (facing up/front)
    12,13,14,            // left
    15,17,16,            // right
  ];
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** CornerWedge approximation (pyramid quarter): apex at (+.5, +.5, -.5). */
function makeCornerWedge(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  // prettier-ignore
  const v = [
    -0.5,-0.5,-0.5,  0.5,-0.5,-0.5,  0.5,-0.5,0.5,  -0.5,-0.5,0.5, // base
    0.5,0.5,-0.5, // apex
  ];
  // prettier-ignore
  const idx = [0,2,1, 0,3,2, 0,1,4, 1,2,4, 2,3,4, 3,0,4];
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface VariantGeometry {
  opaque: THREE.BufferGeometry | null;
  emissive: THREE.BufferGeometry | null;
  /** The variant object the geometry was built from (a new bake produces new objects → rebuild). */
  source?: PrefabVariant;
}

const cache = new Map<string, VariantGeometry>();
const tmpColor = new THREE.Color();

function partGeometry(p: Part): THREE.BufferGeometry {
  const base = unit[p.shape] ?? unit.box;
  const g = base.clone();
  const m = new THREE.Matrix4();
  const e = new THREE.Euler(THREE.MathUtils.degToRad(p.rotation[0]), THREE.MathUtils.degToRad(p.rotation[1]), THREE.MathUtils.degToRad(p.rotation[2]), "XYZ");
  m.compose(new THREE.Vector3(...p.position), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(Math.max(0.01, p.size[0]), Math.max(0.01, p.size[1]), Math.max(0.01, p.size[2])));
  g.applyMatrix4(m);
  // per-vertex color
  const [r, gg, b] = hexToRgb(p.color);
  tmpColor.setRGB(r, gg, b, THREE.SRGBColorSpace);
  const count = g.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute("uv");
  return g;
}

function effectMotes(p: Part, seed: number): THREE.BufferGeometry[] {
  const preset = EFFECT_PRESETS[p.effect!.kind];
  const color = p.effect!.color ?? preset.color;
  const count = p.effect!.kind === "embers" ? 5 : 7;
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
  const out: THREE.BufferGeometry[] = [];
  const size = Math.max(0.18, preset.size[1] * 0.9);
  for (let i = 0; i < count; i++) {
    const mote: Part = {
      shape: "sphere",
      position: [p.position[0] + (rnd() - 0.5) * p.size[0], p.position[1] + (rnd() - 0.5) * p.size[1], p.position[2] + (rnd() - 0.5) * p.size[2]],
      rotation: [0, 0, 0],
      size: [size, size, size],
      color,
      material: "Neon",
    };
    out.push(partGeometry(mote));
  }
  return out;
}

/** Merged geometry for a prefab variant at a LOD tier (0 = full, 1 = simple). */
export function variantGeometry(variant: PrefabVariant, minLod = 0): VariantGeometry {
  const key = `${variant.id}#${minLod}`;
  const hit = cache.get(key);
  if (hit && hit.source === variant) return hit;
  if (hit) {
    // same id, different bake/style: drop the stale geometry
    hit.opaque?.dispose();
    hit.emissive?.dispose();
    cache.delete(key);
  }
  const opaqueParts: THREE.BufferGeometry[] = [];
  const emissiveParts: THREE.BufferGeometry[] = [];
  variant.parts.forEach((p, i) => {
    if ((p.lod ?? 0) < minLod) return;
    if (p.effect && GLOWING_EFFECTS.includes(p.effect.kind)) {
      // static stand-ins for the Roblox particles: a few glowing motes inside the emitter volume
      emissiveParts.push(...effectMotes(p, hashString(`${variant.id}#${i}`)));
    }
    if ((p.transparency ?? 0) > 0.85) return;
    (p.material === "Neon" ? emissiveParts : opaqueParts).push(partGeometry(p));
  });
  const merge = (list: THREE.BufferGeometry[]) => {
    if (list.length === 0) return null;
    const merged = mergeGeometries(list, false);
    list.forEach((l) => l.dispose());
    return merged;
  };
  const out: VariantGeometry = { opaque: merge(opaqueParts), emissive: merge(emissiveParts), source: variant };
  cache.set(key, out);
  return out;
}

export function clearGeometryCache(): void {
  for (const v of cache.values()) {
    v.opaque?.dispose();
    v.emissive?.dispose();
  }
  cache.clear();
}

/** Terrain mesh geometry with vertex colors (by material or by biome). */
export function terrainGeometry(t: TerrainData, biomeColors: boolean, materialColors?: Partial<Record<TerrainMaterial, string>>): THREE.BufferGeometry {
  const { width, depth, cellSize, origin } = t;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(width * depth * 3);
  const col = new Float32Array(width * depth * 3);
  const palette = TERRAIN_MATERIALS.map((m) => {
    // style-driven colors from the bake (what Roblox shows after Terrain:SetMaterialColor), viewer defaults otherwise
    const [r, gg, b] = hexToRgb(materialColors?.[m] ?? TERRAIN_MATERIAL_COLORS[m]);
    return new THREE.Color().setRGB(r, gg, b, THREE.SRGBColorSpace);
  });
  const biomePalette = ["#4f7a4a", "#8a5a9a", "#c9a65a", "#5a8fb0", "#7a6a50", "#9a4a4a", "#4a9a8a", "#b08a4a", "#6a6aa0", "#a0c0a0", "#c0b0a0", "#a08080"].map((h) => new THREE.Color(h));
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const i = z * width + x;
      pos[i * 3] = origin[0] + x * cellSize;
      pos[i * 3 + 1] = t.heights[i]!;
      pos[i * 3 + 2] = origin[1] + z * cellSize;
      const c = biomeColors ? biomePalette[t.biomes[i]! % biomePalette.length]! : (palette[t.materials[i]!] ?? palette[1]!);
      // subtle height shading for readability
      const shade = 0.85 + ((t.heights[i]! - 20) / 400) * 0.6;
      col[i * 3] = c.r * shade;
      col[i * 3 + 1] = c.g * shade;
      col[i * 3 + 2] = c.b * shade;
    }
  }
  const idx: number[] = [];
  for (let z = 0; z < depth - 1; z++) {
    for (let x = 0; x < width - 1; x++) {
      const a = z * width + x;
      const b = a + 1;
      const c = a + width;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Water surface: one quad per water cell. */
export function waterGeometry(t: TerrainData): THREE.BufferGeometry | null {
  const { width, depth, cellSize, origin } = t;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let z = 0; z < depth - 1; z++) {
    for (let x = 0; x < width - 1; x++) {
      const i = z * width + x;
      const w = t.water[i]!;
      if (Number.isNaN(w)) continue;
      const wx = origin[0] + x * cellSize;
      const wz = origin[1] + z * cellSize;
      const b = pos.length / 3;
      pos.push(wx, w, wz, wx + cellSize, w, wz, wx, w, wz + cellSize, wx + cellSize, w, wz + cellSize);
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  if (pos.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
