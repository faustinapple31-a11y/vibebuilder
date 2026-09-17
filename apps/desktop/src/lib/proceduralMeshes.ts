import type { WorldBake } from "@worldforge/core";
import { MESH_MANIFEST_PATH, meshIdResolverLuau, meshToFbx, uniqueMeshes, type MeshAssetManifest } from "@worldforge/roblox-export";
import { readJsonFile, writeJsonFile } from "./files";
import { fs, path } from "./tauri";

/**
 * Procedural meshes → Roblox mesh assets (design/meshes.manifest.json). Upload = the bake's distinct meshes
 * as ASCII FBX "Model" assets through Open Cloud; resolve = Studio reads the MeshId inside each model.
 * `applyMeshAssetIds` (roblox-export) stamps the ids into the bake before every world export.
 */
export async function loadMeshManifest(projectPath: string): Promise<MeshAssetManifest> {
  const raw = await readJsonFile<MeshAssetManifest>(path.join(projectPath, MESH_MANIFEST_PATH));
  return raw && raw.version === 1 && raw.entries ? raw : { version: 1, entries: {} };
}

export type UploadModel = (filePath: string, displayName: string) => Promise<number>;

export async function uploadProjectMeshes(projectPath: string, bake: WorldBake, upload: UploadModel, onProgress?: (text: string) => void): Promise<MeshAssetManifest> {
  const manifest = await loadMeshManifest(projectPath);
  const meshes = uniqueMeshes(bake);
  const dir = path.join(projectPath, "assets", "meshes");
  await fs.mkdirp(dir);
  let n = 0;
  for (const m of meshes) {
    const existing = manifest.entries[m.hash];
    if (existing && existing.modelAssetId > 0) continue;
    n++;
    onProgress?.(`uploading mesh ${m.key} (${n})…`);
    const file = path.join(dir, `${m.key}_${m.hash}.fbx`);
    await fs.writeText(file, meshToFbx(m.data, `${m.key}_${m.hash}`));
    const modelAssetId = await upload(file, `wf_${m.key}_${m.hash}`);
    manifest.entries[m.hash] = { key: m.key, triangles: m.data.triangleCount, modelAssetId, meshId: 0 };
    await writeJsonFile(path.join(projectPath, MESH_MANIFEST_PATH), manifest);
  }
  return manifest;
}

/** MeshIds of the uploaded models through the Studio bridge; returns the number resolved. */
export async function resolveMeshIds(projectPath: string, manifest: MeshAssetManifest, runLuau: (code: string, datamodel: "Edit" | "Server") => Promise<string>, onProgress?: (text: string) => void): Promise<number> {
  const pending = Object.values(manifest.entries).filter((e) => e.modelAssetId > 0 && e.meshId === 0);
  if (pending.length === 0) return 0;
  onProgress?.(`resolving ${pending.length} mesh ids in Studio…`);
  const code = meshIdResolverLuau(pending.map((e) => e.modelAssetId));
  let res = "";
  for (const dm of ["Edit", "Server"] as const) {
    res = await runLuau(code, dm).catch(() => "");
    if (res.includes("=")) break;
  }
  let resolved = 0;
  for (const pair of res.split(",")) {
    const [model, mesh] = pair.split("=");
    const entry = Object.values(manifest.entries).find((e) => String(e.modelAssetId) === model);
    if (entry && mesh && Number(mesh) > 0) {
      entry.meshId = Number(mesh);
      resolved++;
    }
  }
  if (resolved === 0) throw new Error("Studio could not resolve the mesh ids (is it logged in as the creator of the key?)");
  await writeJsonFile(path.join(projectPath, MESH_MANIFEST_PATH), manifest);
  onProgress?.(`${resolved} mesh ids resolved`);
  return resolved;
}
