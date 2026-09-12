import { describe, expect, it } from "vitest";
import { OpenCloudClient, type CloudRequest, type CloudResponse } from "../src";

describe("Open Cloud Assets API", () => {
  it("uploads an FBX as a Model asset (multipart) and resolves the asset id from the operation", async () => {
    const calls: CloudRequest[] = [];
    let polls = 0;
    const transport = async (req: CloudRequest): Promise<CloudResponse> => {
      calls.push(req);
      if (req.method === "POST" && req.url.endsWith("/assets/v1/assets")) return { status: 200, body: JSON.stringify({ path: "operations/op-42", operationId: "op-42", done: false }), headers: {} };
      if (req.url.endsWith("/assets/v1/operations/op-42")) {
        polls++;
        return { status: 200, body: JSON.stringify(polls < 2 ? { path: "operations/op-42", done: false } : { path: "operations/op-42", done: true, response: { path: "assets/123456", assetId: "123456" } }), headers: {} };
      }
      return { status: 404, body: "nope", headers: {} };
    };
    const client = new OpenCloudClient(transport);
    const op = await client.createAsset({ filePath: "C:/proj/assets/models/golem.fbx", fileName: "golem.fbx", assetType: "Model", displayName: "Stone golem", creator: { userId: 1234 } });
    expect(op.operationId).toBe("op-42");
    const upload = calls[0]!;
    expect(upload.multipart?.map((p) => p.name)).toEqual(["request", "fileContent"]);
    const request = JSON.parse(upload.multipart![0]!.text!) as { assetType: string; creationContext: { creator: { userId: string } } };
    expect(request.assetType).toBe("Model");
    expect(request.creationContext.creator.userId).toBe("1234");
    expect(upload.multipart![1]!.contentType).toBe("model/fbx");
    const id = await client.waitForAsset(op.operationId, { sleep: async () => {}, pollMs: 0 });
    expect(id).toBe("123456");
  });

  it("refuses unsupported file types and missing creators", async () => {
    const client = new OpenCloudClient(async () => ({ status: 200, body: "{}", headers: {} }));
    await expect(client.createAsset({ filePath: "x.glb", fileName: "x.glb", assetType: "Model", displayName: "x", creator: { userId: 1 } })).rejects.toThrow(/\.glb/);
    await expect(client.createAsset({ filePath: "x.fbx", fileName: "x.fbx", assetType: "Model", displayName: "x", creator: {} })).rejects.toThrow(/creator/);
  });
});
