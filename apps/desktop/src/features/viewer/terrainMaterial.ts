import * as THREE from "three";

/**
 * Textured terrain: four seamless PBR sets (grass / ground / rock / sand-or-snow) blended by the
 * per-vertex splat weights, tiled in world space, lit with a simple hemisphere + sun model on the
 * normal-mapped facets (geometric normal from screen-space derivatives), fogged like the rest of the
 * scene. Repetition is broken by a second, rotated and larger sample of every set blended in by a
 * low-frequency noise, plus a macro brightness variation. The vertex colour (palette tint + height
 * shade) still modulates the result so the textured view matches the flat one.
 */
export interface TerrainTextureUrls {
  grass: string;
  ground: string;
  rock: string;
  sandOrSnow: string;
  /** tangent-space normal maps (optional — empty string = flat) */
  normals?: { grass: string; ground: string; rock: string; sandOrSnow: string };
  /** studs per tile per channel */
  tiles: [number, number, number, number];
}

const VERT = /* glsl */ `
attribute vec4 weights;
varying vec3 vWorld;
varying vec3 vColor;
varying vec4 vWeights;
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vColor = color;
  vWeights = weights;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform sampler2D tGrass;
uniform sampler2D tGround;
uniform sampler2D tRock;
uniform sampler2D tSand;
uniform sampler2D nGrass;
uniform sampler2D nGround;
uniform sampler2D nRock;
uniform sampler2D nSand;
uniform vec4 uTiles;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform float uNormalStrength;
varying vec3 vWorld;
varying vec3 vColor;
varying vec4 vWeights;
#include <fog_pars_fragment>

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

// rotation of the second (anti-tiling) sample and its transpose (brings the sampled tangent normal back to world xz)
const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);
const mat2 ROT_T = mat2(0.8, -0.6, 0.6, 0.8);

// colour + world-xz tangent perturbation of one set, two samples blended by k
void sampleSet(sampler2D tc, sampler2D tn, vec2 xz, float tile, float k, out vec3 col, out vec2 nxz) {
  vec2 uv1 = xz / tile;
  vec2 uv2 = (ROT * xz) / (tile * 1.9) + vec2(0.37, 0.61);
  col = mix(texture2D(tc, uv1).rgb, texture2D(tc, uv2).rgb, k);
  vec2 n1 = texture2D(tn, uv1).xy * 2.0 - 1.0;
  vec2 n2 = ROT_T * (texture2D(tn, uv2).xy * 2.0 - 1.0);
  nxz = mix(n1, n2, k);
}

void main() {
  vec4 w = vWeights / max(0.0001, vWeights.x + vWeights.y + vWeights.z + vWeights.w);
  vec2 xz = vWorld.xz;
  // low-frequency blend between the two tilings, and a macro brightness variation
  float k = smoothstep(0.3, 0.7, vnoise(xz / 43.0 + 7.3));
  float macro = vnoise(xz / 71.0 + 3.1) * 0.6 + vnoise(xz / 23.0 + 11.7) * 0.4;
  vec3 c = vec3(0.0);
  vec2 nxz = vec2(0.0);
  vec3 sc; vec2 sn;
  if (w.x > 0.002) { sampleSet(tGrass, nGrass, xz, uTiles.x, k, sc, sn); c += sc * w.x; nxz += sn * w.x; }
  if (w.y > 0.002) { sampleSet(tGround, nGround, xz, uTiles.y, k, sc, sn); c += sc * w.y; nxz += sn * w.y; }
  if (w.z > 0.002) { sampleSet(tRock, nRock, xz, uTiles.z, k, sc, sn); c += sc * w.z; nxz += sn * w.z; }
  if (w.w > 0.002) { sampleSet(tSand, nSand, xz, uTiles.w, k, sc, sn); c += sc * w.w; nxz += sn * w.w; }
  c *= 0.9 + macro * 0.2;
  // keep the palette / height tint of the flat view (colour attribute is linear)
  float lum = dot(vColor, vec3(0.299, 0.587, 0.114));
  // hue of the palette tint, only a little of its brightness (the textures carry their own values)
  c *= mix(vec3(1.0), vColor / max(lum, 0.05), 0.35) * mix(1.0, clamp(lum * 2.2, 0.6, 1.3), 0.25);
  vec3 ng = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  // planar (xz) tangent frame: the maps are projected from above, so the perturbation lives in world x / z
  vec3 n = normalize(ng + vec3(nxz.x, 0.0, nxz.y) * uNormalStrength);
  float ndl = max(0.0, dot(n, uSunDir));
  float hemi = 0.5 + 0.5 * n.y;
  vec3 lit = c * (0.2 + uAmbient * hemi * 1.1 + uSunColor * ndl * 0.85);
  gl_FragColor = vec4(lit, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

function loadTile(url: string, srgb: boolean): THREE.Texture {
  const tex = new THREE.TextureLoader().load(url);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** 1×1 flat tangent normal (128, 128, 255) for sets without a normal map. */
function flatNormal(): THREE.Texture {
  const tex = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  tex.needsUpdate = true;
  return tex;
}

const COLOR_KEYS = ["tGrass", "tGround", "tRock", "tSand"] as const;
const NORMAL_KEYS = ["nGrass", "nGround", "nRock", "nSand"] as const;

export function createTerrainMaterial(urls: TerrainTextureUrls, sunDir: THREE.Vector3, sunColor: THREE.Color, ambient: THREE.Color): THREE.ShaderMaterial {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      tGrass: { value: null },
      tGround: { value: null },
      tRock: { value: null },
      tSand: { value: null },
      nGrass: { value: null },
      nGround: { value: null },
      nRock: { value: null },
      nSand: { value: null },
      uTiles: { value: new THREE.Vector4(...urls.tiles) },
      uSunDir: { value: sunDir.clone().normalize() },
      uSunColor: { value: sunColor.clone() },
      uAmbient: { value: ambient.clone() },
      uNormalStrength: { value: 0.9 },
    },
  ]) as Record<string, THREE.IUniform>;
  const colors = [urls.grass, urls.ground, urls.rock, urls.sandOrSnow];
  const normals = urls.normals ? [urls.normals.grass, urls.normals.ground, urls.normals.rock, urls.normals.sandOrSnow] : ["", "", "", ""];
  COLOR_KEYS.forEach((k, i) => (uniforms[k]!.value = loadTile(colors[i]!, true)));
  NORMAL_KEYS.forEach((k, i) => (uniforms[k]!.value = normals[i] ? loadTile(normals[i]!, false) : flatNormal()));
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, vertexColors: true, fog: true });
  return mat;
}

export function disposeTerrainMaterial(mat: THREE.ShaderMaterial): void {
  for (const k of [...COLOR_KEYS, ...NORMAL_KEYS]) (mat.uniforms[k]?.value as THREE.Texture | null)?.dispose();
  mat.dispose();
}
