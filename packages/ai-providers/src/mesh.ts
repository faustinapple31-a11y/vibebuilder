import { AiProviderError, type AiHttpRequest, type AiHttpResponse, type AiTransport, type GeneratedFile } from "./index";

/**
 * High-quality 3D model generation.
 *
 * A "hero" asset (statue, boss, vehicle, artifact…) goes further than the procedural low-poly prefabs:
 * text or reference image → textured PBR mesh (preview + refine stages) → GLB (viewer) + FBX (Roblox
 * Model asset via Open Cloud) + thumbnail. The provider is injected; Meshy is the reference
 * implementation, Roblox Studio's own generator is driven from the app through MCP.
 */
export type MeshQuality = "preview" | "refined";
export type MeshArtStyle = "stylized" | "realistic" | "sculpture";

export interface MeshJobOptions {
  prompt: string;
  negativePrompt?: string;
  artStyle?: MeshArtStyle;
  /** Target triangle count after remeshing (1 000 – 300 000). Roblox MeshParts accept up to ~20k triangles per part. */
  targetPolycount?: number;
  topology?: "triangle" | "quad";
  /** "refined" runs the texture/PBR stage (slower, "super quality"); "preview" is geometry only. */
  quality: MeshQuality;
  /** Reference image (image-to-3D). Base64 bytes + mime. */
  image?: { data: string; mimeType: string };
  symmetry?: "off" | "auto" | "on";
}

export interface MeshJobStatus {
  status: "pending" | "running" | "done" | "failed";
  /** 0–100 within the current stage. */
  progress: number;
  stage: "preview" | "refine" | "image";
  modelUrls?: { glb?: string; fbx?: string; obj?: string; usdz?: string };
  thumbnailUrl?: string;
  textureUrls?: { baseColor?: string; metallic?: string; normal?: string; roughness?: string }[];
  error?: string;
  /** Set when the provider chained a second stage: poll this id from now on. */
  nextJobId?: string;
}

export interface MeshProvider {
  id: string;
  name: string;
  startMesh(opts: MeshJobOptions): Promise<{ jobId: string }>;
  pollMesh(jobId: string, opts: MeshJobOptions): Promise<MeshJobStatus>;
  downloadFile(url: string, mimeType: string, extension: string): Promise<GeneratedFile>;
}

export interface MeshResult {
  provider: string;
  jobId: string;
  glb: GeneratedFile;
  fbx?: GeneratedFile;
  thumbnail?: GeneratedFile;
  polycountTarget: number;
  quality: MeshQuality;
  prompt: string;
}

async function call(transport: AiTransport, req: AiHttpRequest): Promise<AiHttpResponse> {
  const res = await transport(req);
  if (res.status < 200 || res.status >= 300) throw new AiProviderError(req.provider, res.status, res.body);
  return res;
}

const MESHY = "https://api.meshy.ai";

interface MeshyTask {
  id?: string;
  status?: string;
  progress?: number;
  model_urls?: { glb?: string; fbx?: string; obj?: string; usdz?: string };
  thumbnail_url?: string;
  texture_urls?: { base_color?: string; metallic?: string; normal?: string; roughness?: string }[];
  task_error?: { message?: string };
}

/**
 * Meshy — text-to-3D (preview → refine with PBR textures) and image-to-3D.
 * Job ids are prefixed with their endpoint so a single poll function can follow both flows.
 */
export class MeshyMeshProvider implements MeshProvider {
  id = "meshy";
  name = "Meshy (text / image → textured 3D)";
  constructor(private transport: AiTransport) {}

  async startMesh(opts: MeshJobOptions): Promise<{ jobId: string }> {
    if (opts.image) {
      const res = await call(this.transport, {
        provider: "meshy",
        method: "POST",
        url: `${MESHY}/openapi/v1/image-to-3d`,
        jsonBody: {
          image_url: `data:${opts.image.mimeType};base64,${opts.image.data}`,
          enable_pbr: opts.quality === "refined",
          should_remesh: true,
          should_texture: true,
          target_polycount: opts.targetPolycount ?? 12000,
          topology: opts.topology ?? "triangle",
          symmetry_mode: opts.symmetry ?? "auto",
          ai_model: "latest",
        },
      });
      const json = JSON.parse(res.body) as { result?: string };
      if (!json.result) throw new AiProviderError("meshy", res.status, res.body);
      return { jobId: `i2d:${json.result}` };
    }
    const res = await call(this.transport, {
      provider: "meshy",
      method: "POST",
      url: `${MESHY}/openapi/v2/text-to-3d`,
      jsonBody: {
        mode: "preview",
        prompt: opts.prompt,
        negative_prompt: opts.negativePrompt,
        art_style: opts.artStyle === "realistic" ? "realistic" : opts.artStyle === "sculpture" ? "sculpture" : "cartoon",
        should_remesh: true,
        target_polycount: opts.targetPolycount ?? 12000,
        topology: opts.topology ?? "triangle",
        symmetry_mode: opts.symmetry ?? "auto",
        ai_model: "latest",
      },
    });
    const json = JSON.parse(res.body) as { result?: string };
    if (!json.result) throw new AiProviderError("meshy", res.status, res.body);
    return { jobId: `t2d:${json.result}` };
  }

  async pollMesh(jobId: string, opts: MeshJobOptions): Promise<MeshJobStatus> {
    const [kind, id] = jobId.includes(":") ? (jobId.split(":") as [string, string]) : ["t2d", jobId];
    const url = kind === "i2d" ? `${MESHY}/openapi/v1/image-to-3d/${id}` : `${MESHY}/openapi/v2/text-to-3d/${id}`;
    const res = await call(this.transport, { provider: "meshy", method: "GET", url });
    const t = JSON.parse(res.body) as MeshyTask;
    const stage: MeshJobStatus["stage"] = kind === "i2d" ? "image" : kind === "ref" ? "refine" : "preview";
    const status: MeshJobStatus["status"] = t.status === "SUCCEEDED" ? "done" : t.status === "FAILED" || t.status === "CANCELED" ? "failed" : t.status === "IN_PROGRESS" ? "running" : "pending";
    const out: MeshJobStatus = {
      status,
      progress: t.progress ?? 0,
      stage,
      modelUrls: t.model_urls,
      thumbnailUrl: t.thumbnail_url,
      textureUrls: t.texture_urls?.map((u) => ({ baseColor: u.base_color, metallic: u.metallic, normal: u.normal, roughness: u.roughness })),
      error: t.task_error?.message,
    };
    // text-to-3D preview finished and the caller wants textures: chain the refine stage
    if (status === "done" && stage === "preview" && opts.quality === "refined") {
      const ref = await call(this.transport, {
        provider: "meshy",
        method: "POST",
        url: `${MESHY}/openapi/v2/text-to-3d`,
        jsonBody: { mode: "refine", preview_task_id: id, enable_pbr: true, ai_model: "latest" },
      });
      const json = JSON.parse(ref.body) as { result?: string };
      if (!json.result) throw new AiProviderError("meshy", ref.status, ref.body);
      return { ...out, status: "running", progress: 0, stage: "refine", nextJobId: `ref:${json.result}` };
    }
    return out;
  }

  async downloadFile(url: string, mimeType: string, extension: string): Promise<GeneratedFile> {
    const res = await call(this.transport, { provider: "meshy", method: "GET", url, response: "base64" });
    return { data: res.body, mimeType, extension };
  }
}

export interface RunMeshOptions {
  /** Poll interval in ms (Meshy tasks take 1–6 minutes). */
  pollMs?: number;
  timeoutMs?: number;
  onProgress?: (info: { stage: MeshJobStatus["stage"]; progress: number; message: string }) => void;
  /** Also download the FBX (needed for the Roblox Model upload). Default true. */
  fbx?: boolean;
  sleep?: (ms: number) => Promise<void>;
}

/** Full generation loop: start → poll (chaining stages) → download GLB / FBX / thumbnail. */
export async function runMeshGeneration(provider: MeshProvider, opts: MeshJobOptions, run: RunMeshOptions = {}): Promise<MeshResult> {
  const sleep = run.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const pollMs = run.pollMs ?? 5000;
  const timeout = run.timeoutMs ?? 20 * 60 * 1000;
  const started = Date.now();
  let { jobId } = await provider.startMesh(opts);
  run.onProgress?.({ stage: opts.image ? "image" : "preview", progress: 0, message: `${provider.name}: job ${jobId} started` });
  let last: MeshJobStatus | null = null;
  for (;;) {
    if (Date.now() - started > timeout) throw new Error(`${provider.name}: generation timed out after ${Math.round(timeout / 60000)} min`);
    await sleep(pollMs);
    const st = await provider.pollMesh(jobId, opts);
    last = st;
    if (st.nextJobId) {
      jobId = st.nextJobId;
      run.onProgress?.({ stage: st.stage, progress: 0, message: "geometry ready — texturing (PBR)…" });
      continue;
    }
    run.onProgress?.({ stage: st.stage, progress: st.progress, message: `${st.stage} ${st.progress}%` });
    if (st.status === "failed") throw new Error(`${provider.name}: ${st.error ?? "generation failed"}`);
    if (st.status === "done") break;
  }
  const urls = last?.modelUrls ?? {};
  if (!urls.glb) throw new Error(`${provider.name}: finished without a GLB url`);
  run.onProgress?.({ stage: last!.stage, progress: 100, message: "downloading model…" });
  const glb = await provider.downloadFile(urls.glb, "model/gltf-binary", "glb");
  const fbx = run.fbx !== false && urls.fbx ? await provider.downloadFile(urls.fbx, "model/fbx", "fbx") : undefined;
  const thumbnail = last?.thumbnailUrl ? await provider.downloadFile(last.thumbnailUrl, "image/png", "png") : undefined;
  return { provider: provider.id, jobId, glb, fbx, thumbnail, polycountTarget: opts.targetPolycount ?? 12000, quality: opts.quality, prompt: opts.prompt };
}
