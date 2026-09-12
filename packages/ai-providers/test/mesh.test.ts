import { describe, expect, it } from "vitest";
import { MeshyMeshProvider, runMeshGeneration, type AiHttpRequest, type AiHttpResponse } from "../src";

/** Fake Meshy: preview task → refine task → downloads. Records every request. */
function fakeMeshy() {
  const calls: AiHttpRequest[] = [];
  let previewPolls = 0;
  let refinePolls = 0;
  const transport = async (req: AiHttpRequest): Promise<AiHttpResponse> => {
    calls.push(req);
    const ok = (body: unknown) => ({ status: 200, body: typeof body === "string" ? body : JSON.stringify(body), headers: {} });
    if (req.method === "POST" && req.url.endsWith("/openapi/v2/text-to-3d")) {
      const b = req.jsonBody as { mode: string; preview_task_id?: string };
      if (b.mode === "preview") return ok({ result: "prev-1" });
      expect(b.preview_task_id).toBe("prev-1");
      return ok({ result: "ref-1" });
    }
    if (req.url.endsWith("/text-to-3d/prev-1")) {
      previewPolls++;
      return ok(previewPolls < 2 ? { status: "IN_PROGRESS", progress: 40 } : { status: "SUCCEEDED", progress: 100, model_urls: { glb: "https://assets.meshy.ai/p.glb" } });
    }
    if (req.url.endsWith("/text-to-3d/ref-1")) {
      refinePolls++;
      return ok(refinePolls < 2 ? { status: "IN_PROGRESS", progress: 55 } : { status: "SUCCEEDED", progress: 100, model_urls: { glb: "https://assets.meshy.ai/r.glb", fbx: "https://assets.meshy.ai/r.fbx" }, thumbnail_url: "https://assets.meshy.ai/r.png" });
    }
    if (req.url.startsWith("https://assets.meshy.ai/")) return ok(`b64:${req.url.split("/").pop()}`);
    return { status: 404, body: "nope", headers: {} };
  };
  return { transport, calls };
}

describe("high-quality mesh generation", () => {
  it("chains preview → refine (PBR) and downloads GLB, FBX and thumbnail", async () => {
    const { transport, calls } = fakeMeshy();
    const provider = new MeshyMeshProvider(transport);
    const stages: string[] = [];
    const result = await runMeshGeneration(provider, { prompt: "a stone golem", quality: "refined", targetPolycount: 20000 }, { sleep: async () => {}, pollMs: 0, onProgress: (i) => stages.push(`${i.stage}:${i.progress}`) });
    expect(result.glb.data).toBe("b64:r.glb");
    expect(result.fbx?.data).toBe("b64:r.fbx");
    expect(result.thumbnail?.data).toBe("b64:r.png");
    expect(result.quality).toBe("refined");
    expect(stages.some((s) => s.startsWith("refine:"))).toBe(true);
    const start = calls.find((c) => c.method === "POST")!.jsonBody as { target_polycount: number; art_style: string; should_remesh: boolean };
    expect(start.target_polycount).toBe(20000);
    expect(start.should_remesh).toBe(true);
    expect(calls.filter((c) => c.method === "POST").length).toBe(2);
  });

  it("stops after the preview when quality is preview", async () => {
    const { transport, calls } = fakeMeshy();
    const result = await runMeshGeneration(new MeshyMeshProvider(transport), { prompt: "a crate", quality: "preview" }, { sleep: async () => {}, pollMs: 0 });
    expect(result.glb.data).toBe("b64:p.glb");
    expect(calls.filter((c) => c.method === "POST").length).toBe(1);
  });

  it("uses image-to-3D when a reference image is given", async () => {
    const calls: AiHttpRequest[] = [];
    const transport = async (req: AiHttpRequest): Promise<AiHttpResponse> => {
      calls.push(req);
      if (req.method === "POST") return { status: 200, body: JSON.stringify({ result: "img-1" }), headers: {} };
      if (req.url.endsWith("/image-to-3d/img-1")) return { status: 200, body: JSON.stringify({ status: "SUCCEEDED", progress: 100, model_urls: { glb: "https://assets.meshy.ai/i.glb" } }), headers: {} };
      return { status: 200, body: "glb-bytes", headers: {} };
    };
    const result = await runMeshGeneration(new MeshyMeshProvider(transport), { prompt: "", quality: "refined", image: { data: "AAAA", mimeType: "image/png" } }, { sleep: async () => {}, pollMs: 0 });
    expect(calls[0]!.url).toContain("/openapi/v1/image-to-3d");
    expect((calls[0]!.jsonBody as { image_url: string }).image_url).toBe("data:image/png;base64,AAAA");
    expect(result.glb.data).toBe("glb-bytes");
  });

  it("surfaces provider failures", async () => {
    const transport = async (req: AiHttpRequest): Promise<AiHttpResponse> => (req.method === "POST" ? { status: 200, body: JSON.stringify({ result: "x" }), headers: {} } : { status: 200, body: JSON.stringify({ status: "FAILED", task_error: { message: "content policy" } }), headers: {} });
    await expect(runMeshGeneration(new MeshyMeshProvider(transport), { prompt: "bad", quality: "preview" }, { sleep: async () => {}, pollMs: 0 })).rejects.toThrow(/content policy/);
  });
});
