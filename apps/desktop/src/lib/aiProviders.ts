import { ElevenLabsProvider, GeminiImageProvider, MeshyProvider, type AiTransport, type GeneratedFile } from "@worldforge/ai-providers";
import { newId } from "@worldforge/core";
import { db } from "./db";
import { ai, fs, path } from "./tauri";

/** Transport backed by the Rust proxy (keys stay in the keyring). */
export const aiTransport: AiTransport = async (req) => {
  const res = await ai.request({ provider: req.provider, method: req.method, url: req.url, json_body: req.jsonBody !== undefined ? JSON.stringify(req.jsonBody) : undefined, response: req.response, headers: req.headers });
  return { status: res.status, body: res.body, headers: res.headers };
};

export const geminiImages = new GeminiImageProvider(aiTransport);
export const meshy = new MeshyProvider(aiTransport);
export const elevenLabs = new ElevenLabsProvider(aiTransport);

export type GenKind = "image" | "mesh" | "sound" | "music";

/** Save a generated file into the project and register it in the local asset registry. */
export async function saveGeneratedAsset(projectDir: string, projectId: string, kind: GenKind, prompt: string, file: GeneratedFile, provider: string): Promise<{ path: string; id: string }> {
  const folder = kind === "image" ? "images" : kind === "mesh" ? "models" : "audio";
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const id = newId("ast", 8);
  const rel = `assets/${folder}/${slug || kind}_${id}.${file.extension}`;
  const full = path.join(projectDir, rel);
  await fs.writeBinaryBase64(full, file.data);
  const category = kind === "image" ? "image" : kind === "mesh" ? "mesh" : "audio";
  await (await db()).execute(
    "INSERT INTO assets (id, name, category, subcategory, style, biome, source, license, file_path, tags, created_at) VALUES ($1,$2,$3,$4,'generated','any','generated','user-generated',$5,$6,$7)",
    [id, prompt.slice(0, 80), category, kind, full, JSON.stringify([provider, kind, projectId]), new Date().toISOString()],
  );
  return { path: full, id };
}
