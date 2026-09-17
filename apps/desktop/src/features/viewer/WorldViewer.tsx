import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { FlyControls, Line, OrbitControls, PointerLockControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { hexToRgb, sampleHeight, type Placement, type PrefabCategory, type WorldBake } from "@worldforge/core";
import { useWorld, type ViewerLayer } from "@/stores/worldStore";
import { useProjects } from "@/stores/projectStore";
import { loadGlbScene } from "@/lib/meshAssets";
import { path } from "@/lib/tauri";
import { terrainGeometry, variantGeometry, waterGeometry } from "./geometry";
import { createTerrainMaterial, disposeTerrainMaterial } from "./terrainMaterial";

const CATEGORY_LAYER: Record<PrefabCategory, ViewerLayer> = { vegetation: "vegetation", rock: "props", building: "buildings", prop: "props", landmark: "landmarks", path: "props", water: "water", npc: "props" };

export function WorldViewer() {
  const bake = useWorld((s) => s.bake);
  const camera = useWorld((s) => s.camera);
  const lighting = bake?.lighting;
  const fogColor = lighting ? new THREE.Color(...hexToRgb(lighting.fogColor)) : new THREE.Color("#c9d2df");
  if (!bake) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        No world yet — describe your game in the Swarm, or generate one in the AI Workshop.
      </div>
    );
  }
  return (
    <Canvas
      key={bake.meta.seed + camera}
      shadows
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ fov: 55, near: 1, far: 6000 }}
      onCreated={({ scene, gl }) => {
        scene.background = fogColor.clone().lerp(new THREE.Color("#ffffff"), 0.1);
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.0 + (lighting?.exposureCompensation ?? 0) * 0.6;
      }}
    >
      <Scene bake={bake} />
    </Canvas>
  );
}

function Scene({ bake }: { bake: WorldBake }) {
  const layers = useWorld((s) => s.layers);
  const wireframe = useWorld((s) => s.wireframe);
  const biomeColors = useWorld((s) => s.biomeColors);
  const camera = useWorld((s) => s.camera);
  const { scene } = useThree();
  const L = bake.lighting;
  const night = L.clockTime < 5.5 || L.clockTime > 19;

  useEffect(() => {
    const fog = new THREE.Color(...hexToRgb(L.fogColor));
    // the viewer is a design tool: fog is lighter than in Roblox and off in top view
    scene.fog = layers.lighting && camera !== "top" ? new THREE.Fog(fog, Math.max(80, L.fogStart * 1.6), Math.max(900, L.fogEnd * 2.6)) : null;
    scene.background = fog.clone().lerp(new THREE.Color("#ffffff"), night ? 0.05 : 0.15);
  }, [scene, L, layers.lighting, night, camera]);

  const sun = useMemo(() => {
    const angle = ((L.clockTime - 6) / 12) * Math.PI; // 6h → 0, 18h → π
    const elev = Math.max(0.15, Math.sin(angle));
    return new THREE.Vector3(Math.cos(angle) * 800, elev * 900, 300);
  }, [L.clockTime]);
  const sunColor = new THREE.Color(...hexToRgb(L.colorShiftTop));
  const ambient = new THREE.Color(...hexToRgb(L.outdoorAmbient));

  return (
    <>
      <hemisphereLight args={[new THREE.Color(...hexToRgb(L.ambient)).lerp(new THREE.Color("#ffffff"), 0.5), ambient.clone().multiplyScalar(0.7), night ? 1.1 : 1.0]} />
      <ambientLight intensity={night ? 0.35 : 0.15} color={ambient} />
      <directionalLight position={sun} color={sunColor} intensity={night ? 1.0 : Math.min(2.2, L.brightness * 0.9 + 0.6)} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-600} shadow-camera-right={600} shadow-camera-top={600} shadow-camera-bottom={-600} shadow-camera-far={2500} shadow-bias={-0.0004} />
      {layers.terrain && bake.terrain.mode !== "parts" && <Terrain bake={bake} wireframe={wireframe} biomeColors={biomeColors} sun={sun} sunColor={sunColor} ambient={ambient} />}
      {layers.water && <Water bake={bake} />}
      <Placements bake={bake} />
      {layers.paths && <Paths bake={bake} />}
      <Landmarks bake={bake} />
      <Selection bake={bake} />
      <CameraRig bake={bake} mode={camera} />
    </>
  );
}

function Terrain({ bake, wireframe, biomeColors, sun, sunColor, ambient }: { bake: WorldBake; wireframe: boolean; biomeColors: boolean; sun: THREE.Vector3; sunColor: THREE.Color; ambient: THREE.Color }) {
  const geo = useMemo(() => terrainGeometry(bake.terrain, biomeColors, bake.lighting.terrainColors), [bake.terrain, biomeColors, bake.lighting.terrainColors]);
  useEffect(() => () => geo.dispose(), [geo]);
  const select = useWorld((s) => s.select);
  const textures = useWorld((s) => s.textures);
  // textured terrain (generated PBR set): grass / ground / rock / sand-or-snow splat, world-space tiling
  const textured = useMemo(() => {
    if (!textures || biomeColors || wireframe) return null;
    const u = textures.urls;
    const e = (id: string) => textures.manifest.entries.find((x) => x.id === id);
    const snowy = (() => {
      // channel 3 shows snow when the map has more snow / ice than sand
      let snow = 0;
      let sand = 0;
      const m = bake.terrain.materials;
      for (let i = 0; i < m.length; i += 7) {
        const v = m[i]!;
        if (v === 8 || v === 14) snow++;
        else if (v === 7) sand++;
      }
      return snow > sand;
    })();
    const g = u["grass"];
    const gr = u["ground"];
    const r = u["rock"];
    const sn = u[snowy ? "snow" : "sand"];
    if (!g || !gr || !r || !sn) return null;
    const mat = createTerrainMaterial({ grass: g.color, ground: gr.color, rock: r.color, sandOrSnow: sn.color, normals: { grass: g.normal, ground: gr.normal, rock: r.normal, sandOrSnow: sn.normal }, tiles: [e("grass")?.studsPerTile ?? 8, e("ground")?.studsPerTile ?? 8, e("rock")?.studsPerTile ?? 10, e(snowy ? "snow" : "sand")?.studsPerTile ?? 8] }, sun, sunColor, ambient);
    return mat;
  }, [textures, biomeColors, wireframe, bake.terrain, sun, sunColor, ambient]);
  useEffect(() => () => { if (textured) disposeTerrainMaterial(textured); }, [textured]);
  return (
    <mesh geometry={geo} receiveShadow castShadow onClick={(e) => { e.stopPropagation(); select(null); }} material={textured ?? undefined}>
      {!textured && <meshStandardMaterial vertexColors roughness={0.95} metalness={0} wireframe={wireframe} flatShading />}
    </mesh>
  );
}

function Water({ bake }: { bake: WorldBake }) {
  const geo = useMemo(() => waterGeometry(bake.terrain), [bake.terrain]);
  const color = new THREE.Color(...hexToRgb(bake.lighting.fogColor)).lerp(new THREE.Color("#3d6f8f"), 0.7);
  if (!geo) return null;
  return (
    <mesh geometry={geo} position={[0, 0.15, 0]}>
      <meshStandardMaterial color={color} transparent opacity={0.8} roughness={0.2} metalness={0.1} />
    </mesh>
  );
}

interface Group {
  key: string;
  prefab: string;
  variant: number;
  simple: boolean;
  items: Placement[];
}

function Placements({ bake }: { bake: WorldBake }) {
  const layers = useWorld((s) => s.layers);
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const p of bake.placements) {
      const layer = CATEGORY_LAYER[p.category];
      if (!layers[layer]) continue;
      const simple = p.layer === "background";
      const key = `${p.prefab}/${p.variant}/${simple ? 1 : 0}`;
      let g = map.get(key);
      if (!g) map.set(key, (g = { key, prefab: p.prefab, variant: p.variant, simple, items: [] }));
      g.items.push(p);
    }
    return [...map.values()];
  }, [bake, layers]);
  return (
    <>
      {groups.map((g) => (bake.prefabs[g.prefab]?.[g.variant]?.source?.glbPath ? <MeshAssetGroup key={g.key} bake={bake} group={g} /> : <InstancedGroup key={g.key} bake={bake} group={g} />))}
    </>
  );
}

/** Hero meshes (AI-generated GLB): the real model, one clone per placement, fitted to the variant bounds. */
function MeshAssetGroup({ bake, group }: { bake: WorldBake; group: Group }) {
  const variant = bake.prefabs[group.prefab]?.[group.variant];
  const projectPath = useProjects((s) => s.current?.path);
  const select = useWorld((s) => s.select);
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const glb = variant?.source?.glbPath;
  useEffect(() => {
    let alive = true;
    setScene(null);
    if (!glb || !projectPath) return;
    loadGlbScene(path.join(projectPath, glb))
      .then((g) => alive && setScene(g))
      .catch((e) => console.warn("mesh asset load failed", glb, e));
    return () => {
      alive = false;
    };
  }, [glb, projectPath]);
  if (!variant || !scene) return <InstancedGroup bake={bake} group={group} />;
  // scale the raw mesh (glTF units) so its height matches the bounds in studs
  const native = variant.source?.nativeSize ?? [1, 1, 1];
  const fit = (variant.bounds.max[1] - Math.min(0, variant.bounds.min[1])) / Math.max(0.001, native[1]);
  return (
    <>
      {group.items.map((p) => {
        const q = new THREE.Quaternion().setFromAxisAngle(UP, p.rotationY);
        if (p.up) q.premultiply(new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(p.up[0], p.up[1], p.up[2]).normalize()));
        return (
          <primitive
            key={p.id}
            object={scene.clone()}
            position={[p.position[0], p.position[1], p.position[2]]}
            quaternion={q}
            scale={fit * p.scale}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              select(p.id);
            }}
          />
        );
      })}
    </>
  );
}

const tmpObj = new THREE.Object3D();
const tmpQuat = new THREE.Quaternion();
const tmpAlign = new THREE.Quaternion();
const tmpUp = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function InstancedGroup({ bake, group }: { bake: WorldBake; group: Group }) {
  const variant = bake.prefabs[group.prefab]?.[group.variant];
  const select = useWorld((s) => s.select);
  const geo = useMemo(() => (variant ? variantGeometry(variant, group.simple ? 1 : 0) : null), [variant, group.simple]);
  const opaqueRef = useRef<THREE.InstancedMesh>(null);
  const emissiveRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    for (const ref of [opaqueRef, emissiveRef]) {
      const mesh = ref.current;
      if (!mesh) continue;
      group.items.forEach((p, i) => {
        tmpObj.position.set(p.position[0], p.position[1], p.position[2]);
        // rotation = alignUp(terrain normal) · Ry(rotationY), same as the Roblox runtime
        tmpQuat.setFromAxisAngle(UP, p.rotationY);
        if (p.up) {
          tmpUp.set(p.up[0], p.up[1], p.up[2]).normalize();
          tmpAlign.setFromUnitVectors(UP, tmpUp);
          tmpQuat.premultiply(tmpAlign);
        }
        tmpObj.quaternion.copy(tmpQuat);
        tmpObj.scale.setScalar(p.scale);
        tmpObj.updateMatrix();
        mesh.setMatrixAt(i, tmpObj.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [group]);
  if (!geo || !variant) return null;
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined) select(group.items[e.instanceId]?.id ?? null);
  };
  const big = variant.category === "building" || variant.category === "landmark";
  return (
    <>
      {geo.opaque && (
        <instancedMesh ref={opaqueRef} args={[geo.opaque, undefined, group.items.length]} castShadow={big || !group.simple} receiveShadow={big} onClick={onClick} frustumCulled>
          <meshStandardMaterial vertexColors roughness={0.9} metalness={0} flatShading />
        </instancedMesh>
      )}
      {geo.emissive && (
        <instancedMesh ref={emissiveRef} args={[geo.emissive, undefined, group.items.length]} onClick={onClick}>
          <meshBasicMaterial vertexColors toneMapped={false} />
        </instancedMesh>
      )}
    </>
  );
}

function Paths({ bake }: { bake: WorldBake }) {
  const lines = useMemo(
    () =>
      bake.paths
        .filter((p) => p.kind === "road")
        .map((p) => ({ id: p.id, points: p.points.map(([x, z]) => new THREE.Vector3(x, sampleHeight(bake.terrain, x, z) + 0.6, z)) })),
    [bake],
  );
  return (
    <>
      {lines.map((l) => (
        <Line key={l.id} points={l.points} color="#e8dcc0" lineWidth={1.5} transparent opacity={0.55} />
      ))}
    </>
  );
}

function Landmarks({ bake }: { bake: WorldBake }) {
  const layers = useWorld((s) => s.layers);
  if (!layers.landmarks) return null;
  return (
    <>
      {bake.landmarks.map((l) => (
        <mesh key={l.id} position={[l.position[0], l.position[1] + 90, l.position[2]]}>
          <sphereGeometry args={[2.5, 8, 6]} />
          <meshBasicMaterial color={l.role === "focal" ? "#ffd166" : l.role === "secondary" ? "#8ecae6" : "#b48cff"} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

function Selection({ bake }: { bake: WorldBake }) {
  const id = useWorld((s) => s.selectedPlacementId);
  const p = id ? bake.placements.find((x) => x.id === id) : null;
  if (!p) return null;
  const v = bake.prefabs[p.prefab]?.[p.variant];
  const size = v ? [(v.bounds.max[0] - v.bounds.min[0]) * p.scale, (v.bounds.max[1] - v.bounds.min[1]) * p.scale, (v.bounds.max[2] - v.bounds.min[2]) * p.scale] : [8, 8, 8];
  const cy = v ? ((v.bounds.max[1] + v.bounds.min[1]) / 2) * p.scale : 4;
  return (
    <group position={[p.position[0], p.position[1] + cy, p.position[2]]} rotation={[0, p.rotationY, 0]}>
      <mesh>
        <boxGeometry args={[size[0]! + 1, size[1]! + 1, size[2]! + 1]} />
        <meshBasicMaterial color="#b48cff" wireframe toneMapped={false} />
      </mesh>
    </group>
  );
}

function CameraRig({ bake, mode }: { bake: WorldBake; mode: "orbit" | "fly" | "top" | "first-person" }) {
  const { camera, gl } = useThree();
  const spawn = bake.spawn;
  const village = bake.zones.find((z) => z.kind === "settlement");
  const target = useMemo(() => new THREE.Vector3(village ? village.center[0] : spawn.lookAt[0], sampleHeight(bake.terrain, village ? village.center[0] : spawn.lookAt[0], village ? village.center[1] : spawn.lookAt[2]) + 6, village ? village.center[1] : spawn.lookAt[2]), [bake, village, spawn]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // dev/QA hook: scripts can move the viewer camera (fly mode) through window.__wfCamera
    if (import.meta.env.DEV) (window as unknown as { __wfCamera?: THREE.Camera }).__wfCamera = camera;
  }, [camera]);
  useEffect(() => {
    if (mode === "first-person") {
      camera.position.set(spawn.position[0], spawn.position[1] + 5, spawn.position[2]);
      camera.lookAt(spawn.lookAt[0], spawn.lookAt[1] + 5, spawn.lookAt[2]);
    } else if (mode === "top") {
      camera.position.set(0, 1400, 1);
      camera.lookAt(0, 0, 0);
    } else if (mode === "fly") {
      camera.position.set(spawn.position[0] + 60, spawn.position[1] + 60, spawn.position[2] + 60);
      camera.lookAt(target);
    } else {
      const dir = new THREE.Vector3(spawn.position[0] - target.x, 0, spawn.position[2] - target.z).normalize();
      camera.position.copy(target).add(dir.multiplyScalar(320)).add(new THREE.Vector3(0, 190, 0));
      camera.lookAt(target);
    }
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    setReady(true);
  }, [mode, camera, spawn, target]);
  if (!ready) return null;
  if (mode === "fly") return <FlyControls movementSpeed={140} rollSpeed={0.35} dragToLook />;
  if (mode === "first-person") return <FirstPerson bake={bake} />;
  return <OrbitControls makeDefault target={target} maxPolarAngle={Math.PI / 2 - 0.02} minDistance={20} maxDistance={2500} enableDamping dampingFactor={0.08} domElement={gl.domElement} />;
}

function FirstPerson({ bake }: { bake: WorldBake }) {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const down = (e: KeyboardEvent) => (keys.current[e.code] = true);
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  useFrame((_, dt) => {
    const speed = (keys.current["ShiftLeft"] ? 60 : 24) * dt;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    if (keys.current["KeyW"] || keys.current["ArrowUp"]) camera.position.addScaledVector(fwd, speed);
    if (keys.current["KeyS"] || keys.current["ArrowDown"]) camera.position.addScaledVector(fwd, -speed);
    if (keys.current["KeyD"] || keys.current["ArrowRight"]) camera.position.addScaledVector(right, speed);
    if (keys.current["KeyA"] || keys.current["ArrowLeft"]) camera.position.addScaledVector(right, -speed);
    const h = sampleHeight(bake.terrain, camera.position.x, camera.position.z);
    camera.position.y += (h + 5 - camera.position.y) * Math.min(1, dt * 10);
  });
  return <PointerLockControls />;
}
