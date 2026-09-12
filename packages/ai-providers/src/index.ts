/**
 * Provider-agnostic AI asset generation (images, meshes, audio).
 * Transport is injected: the desktop app routes calls through the Rust `ai_request` proxy which
 * attaches the user's API key from the OS keyring (the key never reaches the webview).
 */
export type AiProviderKey = "gemini" | "meshy" | "elevenlabs";

export interface AiHttpRequest {
  provider: AiProviderKey;
  method: "GET" | "POST";
  url: string;
  jsonBody?: unknown;
  /** "text" → body as string (JSON/text); "base64" → binary body base64-encoded. */
  response?: "text" | "base64";
  headers?: Record<string, string>;
}

export interface AiHttpResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export type AiTransport = (req: AiHttpRequest) => Promise<AiHttpResponse>;

export class AiProviderError extends Error {
  constructor(
    public provider: string,
    public status: number,
    public body: string,
  ) {
    super(`${provider} ${status}: ${body.slice(0, 300)}`);
  }
}

export interface GeneratedFile {
  /** base64 bytes */
  data: string;
  mimeType: string;
  /** suggested extension without dot */
  extension: string;
  meta?: Record<string, unknown>;
}

export interface ImageProvider {
  id: string;
  name: string;
  generateImage(req: { prompt: string; aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3"; negativePrompt?: string }): Promise<GeneratedFile>;
}

export interface MeshProvider {
  id: string;
  name: string;
  /** Starts a generation job; returns a job id to poll. */
  startMesh(req: { prompt: string; artStyle?: "stylized" | "realistic" | "sculpture"; targetPolycount?: number }): Promise<{ jobId: string }>;
  /** Poll until done. Returns download URLs when ready. */
  pollMesh(jobId: string): Promise<{ status: "pending" | "running" | "done" | "failed"; progress?: number; glbUrl?: string; thumbnailUrl?: string; error?: string }>;
  /** Download a finished mesh (GLB) as base64. */
  downloadMesh(url: string): Promise<GeneratedFile>;
}

export interface AudioProvider {
  id: string;
  name: string;
  generateSound(req: { prompt: string; durationSeconds?: number; promptInfluence?: number }): Promise<GeneratedFile>;
  generateMusic(req: { prompt: string; durationSeconds?: number }): Promise<GeneratedFile>;
}

async function call(transport: AiTransport, req: AiHttpRequest): Promise<AiHttpResponse> {
  const res = await transport(req);
  if (res.status < 200 || res.status >= 300) throw new AiProviderError(req.provider, res.status, res.body);
  return res;
}

// ---------------------------------------------------------------- Gemini (images)
export class GeminiImageProvider implements ImageProvider {
  id = "gemini";
  name = "Gemini (image generation)";
  constructor(
    private transport: AiTransport,
    private model = "gemini-2.5-flash-image",
  ) {}

  async generateImage(req: { prompt: string; aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" }): Promise<GeneratedFile> {
    const res = await call(this.transport, {
      provider: "gemini",
      method: "POST",
      url: `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
      jsonBody: {
        contents: [{ parts: [{ text: req.prompt }] }],
        generationConfig: { responseModalities: ["IMAGE"], ...(req.aspectRatio ? { imageConfig: { aspectRatio: req.aspectRatio } } : {}) },
      },
    });
    const json = JSON.parse(res.body) as { candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string }; text?: string }[] } }[] };
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part?.inlineData) throw new AiProviderError("gemini", 200, `no image in response: ${res.body.slice(0, 200)}`);
    const mime = part.inlineData.mimeType || "image/png";
    return { data: part.inlineData.data, mimeType: mime, extension: mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png" };
  }
}

// ---------------------------------------------------------------- Meshy (3D)
export class MeshyProvider implements MeshProvider {
  id = "meshy";
  name = "Meshy (text → 3D)";
  constructor(private transport: AiTransport) {}

  async startMesh(req: { prompt: string; artStyle?: "stylized" | "realistic" | "sculpture"; targetPolycount?: number }): Promise<{ jobId: string }> {
    const res = await call(this.transport, {
      provider: "meshy",
      method: "POST",
      url: "https://api.meshy.ai/openapi/v2/text-to-3d",
      jsonBody: {
        mode: "preview",
        prompt: req.prompt,
        art_style: req.artStyle === "realistic" ? "realistic" : req.artStyle === "sculpture" ? "sculpture" : "cartoon",
        should_remesh: true,
        target_polycount: req.targetPolycount ?? 8000,
        topology: "triangle",
      },
    });
    const json = JSON.parse(res.body) as { result?: string };
    if (!json.result) throw new AiProviderError("meshy", res.status, res.body);
    return { jobId: json.result };
  }

  async pollMesh(jobId: string) {
    const res = await call(this.transport, { provider: "meshy", method: "GET", url: `https://api.meshy.ai/openapi/v2/text-to-3d/${jobId}` });
    const j = JSON.parse(res.body) as { status?: string; progress?: number; model_urls?: { glb?: string }; thumbnail_url?: string; task_error?: { message?: string } };
    const status = j.status === "SUCCEEDED" ? "done" : j.status === "FAILED" || j.status === "CANCELED" ? "failed" : j.status === "IN_PROGRESS" ? "running" : "pending";
    return { status: status as "pending" | "running" | "done" | "failed", progress: j.progress, glbUrl: j.model_urls?.glb, thumbnailUrl: j.thumbnail_url, error: j.task_error?.message };
  }

  async downloadMesh(url: string): Promise<GeneratedFile> {
    const res = await call(this.transport, { provider: "meshy", method: "GET", url, response: "base64" });
    return { data: res.body, mimeType: "model/gltf-binary", extension: "glb" };
  }
}

// ---------------------------------------------------------------- ElevenLabs (audio)
export class ElevenLabsProvider implements AudioProvider {
  id = "elevenlabs";
  name = "ElevenLabs (sound & music)";
  constructor(private transport: AiTransport) {}

  async generateSound(req: { prompt: string; durationSeconds?: number; promptInfluence?: number }): Promise<GeneratedFile> {
    const res = await call(this.transport, {
      provider: "elevenlabs",
      method: "POST",
      url: "https://api.elevenlabs.io/v1/sound-generation",
      jsonBody: { text: req.prompt, duration_seconds: req.durationSeconds, prompt_influence: req.promptInfluence ?? 0.3 },
      response: "base64",
    });
    return { data: res.body, mimeType: "audio/mpeg", extension: "mp3" };
  }

  async generateMusic(req: { prompt: string; durationSeconds?: number }): Promise<GeneratedFile> {
    const res = await call(this.transport, {
      provider: "elevenlabs",
      method: "POST",
      url: "https://api.elevenlabs.io/v1/music",
      jsonBody: { prompt: req.prompt, music_length_ms: Math.round((req.durationSeconds ?? 60) * 1000) },
      response: "base64",
    });
    return { data: res.body, mimeType: "audio/mpeg", extension: "mp3" };
  }
}

/** Host allow-list mirrored by the Rust proxy. */
export const AI_PROVIDER_HOSTS: Record<AiProviderKey, string[]> = {
  gemini: ["https://generativelanguage.googleapis.com/"],
  meshy: ["https://api.meshy.ai/", "https://assets.meshy.ai/"],
  elevenlabs: ["https://api.elevenlabs.io/"],
};
