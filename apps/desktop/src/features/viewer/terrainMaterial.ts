import * as THREE from "three";

/**
 * Textured terrain: four seamless colour maps (grass / ground / rock / sand-or-snow) blended by the
 * per-vertex splat weights, tiled in world space, lit with a simple hemisphere + sun model and flat
 * facets (screen-space derivatives), fogged like the rest of the scene. The vertex colour (palette
 * tint + height shade) still modulates the result so the textured view matches the flat one.
 */
export interface TerrainTextureUrls {
  grass: string;
  ground: string;
  rock: string;
  sandOrSnow: string;
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
uniform vec4 uTiles;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
varying vec3 vWorld;
varying vec3 vColor;
varying vec4 vWeights;
#include <fog_pars_fragment>
void main() {
  vec4 w = vWeights / max(0.0001, vWeights.x + vWeights.y + vWeights.z + vWeights.w);
  vec2 xz = vWorld.xz;
  vec3 c = texture2D(tGrass, xz / uTiles.x).rgb * w.x
         + texture2D(tGround, xz / uTiles.y).rgb * w.y
         + texture2D(tRock, xz / uTiles.z).rgb * w.z
         + texture2D(tSand, xz / uTiles.w).rgb * w.w;
  // keep the palette / height tint of the flat view (colour attribute is linear)
  float lum = dot(vColor, vec3(0.299, 0.587, 0.114));
  // hue of the palette tint, only a little of its brightness (the textures carry their own values)
  c *= mix(vec3(1.0), vColor / max(lum, 0.05), 0.35) * mix(1.0, clamp(lum * 2.2, 0.6, 1.3), 0.25);
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  float ndl = max(0.0, dot(n, uSunDir));
  float hemi = 0.5 + 0.5 * n.y;
  vec3 lit = c * (0.2 + uAmbient * hemi * 1.1 + uSunColor * ndl * 0.85);
  gl_FragColor = vec4(lit, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

function loadTile(url: string): THREE.Texture {
  const tex = new THREE.TextureLoader().load(url);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createTerrainMaterial(urls: TerrainTextureUrls, sunDir: THREE.Vector3, sunColor: THREE.Color, ambient: THREE.Color): THREE.ShaderMaterial {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      tGrass: { value: null },
      tGround: { value: null },
      tRock: { value: null },
      tSand: { value: null },
      uTiles: { value: new THREE.Vector4(...urls.tiles) },
      uSunDir: { value: sunDir.clone().normalize() },
      uSunColor: { value: sunColor.clone() },
      uAmbient: { value: ambient.clone() },
    },
  ]) as Record<string, THREE.IUniform>;
  uniforms.tGrass!.value = loadTile(urls.grass);
  uniforms.tGround!.value = loadTile(urls.ground);
  uniforms.tRock!.value = loadTile(urls.rock);
  uniforms.tSand!.value = loadTile(urls.sandOrSnow);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, vertexColors: true, fog: true });
  return mat;
}

export function disposeTerrainMaterial(mat: THREE.ShaderMaterial): void {
  for (const k of ["tGrass", "tGround", "tRock", "tSand"]) (mat.uniforms[k]?.value as THREE.Texture | null)?.dispose();
  mat.dispose();
}
