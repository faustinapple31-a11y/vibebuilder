import type { StyleBible } from "@worldforge/core";
import { buildTexturesTs, bytesToBase64, generateTextureSet, webDeflate, withAssetIds, type TextureManifest } from "@worldforge/textures";
import { readJsonFile, writeJsonFile } from "./files";
import { fs, path } from "./tauri";

/**
 * Project textures: procedural PBR sets generated for the style (assets/textures/<style>/*.png +
 * design/textures.manifest.json + src/shared/textures.ts). Uploading the PNGs as Roblox images fills
 * the asset ids the runtime's MaterialVariants need; until then the palette-tinted defaults apply.
 */
export const TEXTURE_MANIFEST_PATH = "design/textures.manifest.json";

export async function loadTextureManifest(projectPath: string): Promise<TextureManifest | null> {
  return readJsonFile<TextureManifest>(path.join(projectPath, TEXTURE_MANIFEST_PATH));
}

async function writeTexturesTs(projectPath: string, manifest: TextureManifest | null): Promise<void> {
  await fs.writeText(path.join(projectPath, "src", "shared", "textures.ts"), buildTexturesTs(manifest));
}

export interface GeneratedTexturePreview {
  id: string;
  /** data: URL of the colour map (PNG) */
  color: string;
  normal: string;
}

/** Generate the whole set for the style, write PNGs + manifest + textures.ts; returns previews. */
export async function generateProjectTextures(projectPath: string, style: StyleBible, seed: number, opts: { size?: number; onProgress?: (done: number, total: number, id: string) => void } = {}): Promise<{ manifest: TextureManifest; previews: GeneratedTexturePreview[] }> {
  const res = await generateTextureSet(style, seed, { size: opts.size ?? 512, deflate: webDeflate, onProgress: opts.onProgress });
  // keep already-uploaded ids when regenerating with the same style (same ids → same materials)
  const previous = await loadTextureManifest(projectPath);
  let manifest = res.manifest;
  if (previous && previous.style === manifest.style) {
    const ids: Record<string, TextureManifest["entries"][number]["assetIds"]> = {};
    for (const e of previous.entries) ids[e.id] = e.assetIds;
    manifest = withAssetIds(manifest, ids);
  }
  const previews: GeneratedTexturePreview[] = [];
  for (const f of res.files) {
    await fs.mkdirp(path.join(projectPath, f.path.split("/").slice(0, -1).join("/")));
    await fs.writeBinaryBase64(path.join(projectPath, f.path), bytesToBase64(f.bytes));
  }
  for (const e of manifest.entries) {
    const color = res.files.find((f) => f.path === e.files.color)!;
    const normal = res.files.find((f) => f.path === e.files.normal)!;
    previews.push({ id: e.id, color: `data:image/png;base64,${bytesToBase64(color.bytes)}`, normal: `data:image/png;base64,${bytesToBase64(normal.bytes)}` });
  }
  await writeJsonFile(path.join(projectPath, TEXTURE_MANIFEST_PATH), manifest);
  await writeTexturesTs(projectPath, manifest);
  return { manifest, previews };
}

/** Previews of an existing set (reads the PNGs back). */
export async function textureManifestPreviews(projectPath: string, manifest: TextureManifest): Promise<GeneratedTexturePreview[]> {
  const out: GeneratedTexturePreview[] = [];
  for (const e of manifest.entries) {
    const [color, normal] = await Promise.all([fs.readBinaryBase64(path.join(projectPath, e.files.color)).catch(() => ""), fs.readBinaryBase64(path.join(projectPath, e.files.normal)).catch(() => "")]);
    if (color) out.push({ id: e.id, color: `data:image/png;base64,${color}`, normal: normal ? `data:image/png;base64,${normal}` : "" });
  }
  return out;
}

export type UploadImage = (filePath: string, displayName: string) => Promise<number>;

/** Upload every map without an asset id through `upload` (Open Cloud image asset), update the manifest and textures.ts. */
export async function uploadProjectTextures(projectPath: string, manifest: TextureManifest, upload: UploadImage, onProgress?: (text: string) => void): Promise<TextureManifest> {
  let current = manifest;
  for (const e of current.entries) {
    const ids: Partial<typeof e.assetIds> = {};
    for (const map of ["color", "normal", "roughness"] as const) {
      if (e.assetIds[map]) continue;
      onProgress?.(`uploading ${e.id} ${map}…`);
      ids[map] = await upload(path.join(projectPath, e.files[map]), `wf_${current.style}_${e.id}_${map}`);
    }
    if (Object.keys(ids).length) {
      current = withAssetIds(current, { [e.id]: ids });
      await writeJsonFile(path.join(projectPath, TEXTURE_MANIFEST_PATH), current);
      await writeTexturesTs(projectPath, current);
    }
  }
  onProgress?.("textures uploaded");
  return current;
}
