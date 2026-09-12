import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshyMeshProvider, runMeshGeneration, type MeshJobOptions, type MeshProvider, type MeshResult } from "@worldforge/ai-providers";
import { newId, type Part, type PrefabMeshSource, type PrefabVariant, type Vec3 } from "@worldforge/core";
import { aiTransport } from "./aiProviders";
import { readJsonFile, writeJsonFile } from "./files";
import { fs, path } from "./tauri";

/**
 * "Hero" mesh assets — high-quality AI-generated 3D models living next to the procedural prefabs.
 *
 * Lifecycle: generate (Meshy preview → refine PBR, or image-to-3D) → save GLB/FBX/thumbnail in
 * `assets/models/` + sidecar `.worldforge.json` → measure the GLB → (optional) publish the FBX as a
 * Roblox Model asset through Open Cloud → place in the world as a prefab variant carrying `source`.
 * The Roblox runtime spawns the asset with InsertService:LoadAsset; the viewer renders the GLB.
 */
export interface MeshAssetRecord {
  id: string;
  name: string;
  prompt: string;
  provider: string;
  quality: "preview" | "refined";
  createdAt: string;
  /** Project-relative paths. */
  glb: string;
  fbx?: string;
  thumbnail?: string;
  /** Raw mesh size (glTF units) and the height in studs it is placed at. */
  nativeSize: Vec3;
  heightStuds: number;
  triangles?: number;
  /** Roblox Model asset id once published. */
  robloxAssetId?: number;
  robloxOperationId?: string;
  publishedAt?: string;
  category: "landmark" | "prop" | "building" | "vegetation" | "rock";
}

export const MESH_ASSET_DIR = "assets/models";
const SIDECAR = ".worldforge.json";

export function meshProvider(): MeshProvider {
  return new MeshyMeshProvider(aiTransport);
}

export interface GenerateMeshAssetOptions extends MeshJobOptions {
  name?: string;
  heightStuds?: number;
  category?: MeshAssetRecord["category"];
  onProgress?: (message: string, progress: number) => void;
}

/** Runs the provider, stores the files and the sidecar, measures the mesh. */
export async function generateMeshAsset(projectDir: string, opts: GenerateMeshAssetOptions): Promise<MeshAssetRecord> {
  const provider = meshProvider();
  const result: MeshResult = await runMeshGeneration(provider, opts, { onProgress: (i) => opts.onProgress?.(i.message, i.progress) });
  return saveMeshResult(projectDir, result, opts);
}

export async function saveMeshResult(projectDir: string, result: MeshResult, opts: GenerateMeshAssetOptions): Promise<MeshAssetRecord> {
  const id = newId("m", 8);
  const slug =
    (opts.name ?? opts.prompt)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "model";
  const base = `${MESH_ASSET_DIR}/${slug}_${id}`;
  await fs.writeBinaryBase64(path.join(projectDir, `${base}.glb`), result.glb.data);
  if (result.fbx) await fs.writeBinaryBase64(path.join(projectDir, `${base}.fbx`), result.fbx.data);
  if (result.thumbnail) await fs.writeBinaryBase64(path.join(projectDir, `${base}.png`), result.thumbnail.data);
  const measured = await measureGlb(result.glb.data);
  const record: MeshAssetRecord = {
    id,
    name: opts.name ?? opts.prompt.slice(0, 60),
    prompt: opts.prompt,
    provider: result.provider,
    quality: result.quality,
    createdAt: new Date().toISOString(),
    glb: `${base}.glb`,
    fbx: result.fbx ? `${base}.fbx` : undefined,
    thumbnail: result.thumbnail ? `${base}.png` : undefined,
    nativeSize: measured.size,
    triangles: measured.triangles,
    heightStuds: opts.heightStuds ?? 12,
    category: opts.category ?? "landmark",
  };
  await writeJsonFile(path.join(projectDir, `${base}${SIDECAR}`), record);
  return record;
}

/** Register an already existing GLB (drag-in / other tools) as a hero asset. */
export async function importGlbAsset(projectDir: string, glbBase64: string, name: string, opts: { fbxBase64?: string; heightStuds?: number; category?: MeshAssetRecord["category"] } = {}): Promise<MeshAssetRecord> {
  return saveMeshResult(
    projectDir,
    { provider: "import", jobId: "", glb: { data: glbBase64, mimeType: "model/gltf-binary", extension: "glb" }, fbx: opts.fbxBase64 ? { data: opts.fbxBase64, mimeType: "model/fbx", extension: "fbx" } : undefined, polycountTarget: 0, quality: "refined", prompt: name },
    { prompt: name, name, quality: "refined", heightStuds: opts.heightStuds, category: opts.category },
  );
}

export async function listMeshAssets(projectDir: string): Promise<MeshAssetRecord[]> {
  const dir = path.join(projectDir, MESH_ASSET_DIR);
  if (!(await fs.exists(dir))) return [];
  const entries = await fs.listDir(dir);
  const out: MeshAssetRecord[] = [];
  for (const e of entries) {
    if (!e.name.endsWith(SIDECAR)) continue;
    const rec = await readJsonFile<MeshAssetRecord>(path.join(dir, e.name));
    if (rec?.id && rec.glb) out.push(rec);
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateMeshAsset(projectDir: string, record: MeshAssetRecord): Promise<void> {
  const base = record.glb.replace(/\.glb$/, "");
  await writeJsonFile(path.join(projectDir, `${base}${SIDECAR}`), record);
}

export async function deleteMeshAsset(projectDir: string, record: MeshAssetRecord): Promise<void> {
  const base = record.glb.replace(/\.glb$/, "");
  for (const ext of [".glb", ".fbx", ".png", SIDECAR]) {
    const p = path.join(projectDir, `${base}${ext}`);
    if (await fs.exists(p)) await fs.remove(p);
  }
}

// ---------------------------------------------------------------- GLB helpers (three.js)
const gltfCache = new Map<string, Promise<THREE.Group>>();

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export function parseGlb(b64: string): Promise<THREE.Group> {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(base64ToArrayBuffer(b64), "", (gltf) => resolve(gltf.scene), (err) => reject(err instanceof Error ? err : new Error(String(err))));
  });
}

/** Loads (and caches) a project GLB as a three.js group, feet at y = 0, centred on x/z. */
export function loadGlbScene(absolutePath: string): Promise<THREE.Group> {
  let p = gltfCache.get(absolutePath);
  if (!p) {
    p = (async () => {
      const b64 = await fs.readBinaryBase64(absolutePath);
      const scene = await parseGlb(b64);
      const box = new THREE.Box3().setFromObject(scene);
      const center = box.getCenter(new THREE.Vector3());
      scene.position.set(-center.x, -box.min.y, -center.z);
      const wrapper = new THREE.Group();
      wrapper.add(scene);
      wrapper.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      return wrapper;
    })();
    gltfCache.set(absolutePath, p);
  }
  return p;
}

export function clearGlbCache(): void {
  gltfCache.clear();
}

export async function measureGlb(b64: string): Promise<{ size: Vec3; triangles: number }> {
  const scene = await parseGlb(b64);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  let triangles = 0;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      const g = m.geometry as THREE.BufferGeometry;
      triangles += g.index ? g.index.count / 3 : g.getAttribute("position").count / 3;
    }
  });
  return { size: [size.x || 1, size.y || 1, size.z || 1], triangles: Math.round(triangles) };
}

// ---------------------------------------------------------------- prefab bridge
export function meshAssetPrefabId(record: MeshAssetRecord): string {
  return `mesh_${record.id}`;
}

/**
 * Prefab variant for a hero asset: bounds scaled to `heightStuds`, a neutral placeholder box as the
 * PartList (shown only when the Roblox asset cannot be loaded), and `source` for runtime + viewer.
 */
export function meshAssetToVariant(record: MeshAssetRecord): PrefabVariant {
  const k = record.heightStuds / Math.max(0.001, record.nativeSize[1]);
  const w = record.nativeSize[0] * k;
  const h = record.heightStuds;
  const d = record.nativeSize[2] * k;
  const placeholder: Part = { shape: "box", position: [0, h / 2, 0], size: [w, h, d], rotation: [0, 0, 0], color: "#9a9aa6", material: "SmoothPlastic", transparency: 0.35, collide: true, name: "placeholder", lod: 2 };
  const source: PrefabMeshSource = { kind: "roblox_asset", assetId: record.robloxAssetId, glbPath: record.glb, fbxPath: record.fbx, thumbnailPath: record.thumbnail, provider: record.provider, prompt: record.prompt, nativeSize: record.nativeSize };
  return {
    id: `${meshAssetPrefabId(record)}/0`,
    prefab: meshAssetPrefabId(record),
    category: record.category,
    parts: [placeholder],
    bounds: { min: [-w / 2, 0, -d / 2], max: [w / 2, h, d / 2] },
    sinkDepth: Math.min(1, h * 0.03),
    footprintRadius: Math.max(w, d) / 2,
    baseRadius: Math.max(w, d) / 2,
    tags: ["hero", "mesh", record.category],
    source,
  };
}
