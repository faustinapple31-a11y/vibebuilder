/**
 * Roblox Open Cloud client. Transport is injected so the desktop app can route requests through
 * the Rust proxy (which attaches the API key from the OS keyring) while Node scripts use fetch.
 */
export interface CloudRequest {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  url: string;
  jsonBody?: unknown;
  /** Local file sent as the raw body (place publishing). */
  bodyFile?: string;
  contentType?: string;
  headers?: Record<string, string>;
  /** multipart/form-data parts (Assets API uploads). */
  multipart?: CloudMultipartPart[];
}

export interface CloudMultipartPart {
  name: string;
  /** Text field (e.g. the JSON `request` part). */
  text?: string;
  /** Local file part. */
  filePath?: string;
  fileName?: string;
  contentType?: string;
}

export type AssetType = "Model" | "Decal" | "Audio" | "Video";

export interface AssetOperation {
  operationId: string;
  done: boolean;
  assetId?: string;
  path?: string;
  error?: string;
}

/** Content types accepted by the Assets API per asset type. */
export const ASSET_CONTENT_TYPES: Record<AssetType, Record<string, string>> = {
  Model: { fbx: "model/fbx" },
  Decal: { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", bmp: "image/bmp", tga: "image/tga" },
  Audio: { mp3: "audio/mpeg", ogg: "audio/ogg" },
  Video: { mp4: "video/mp4", mov: "video/mov" },
}

export interface CloudResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export type CloudTransport = (req: CloudRequest) => Promise<CloudResponse>;

export const OPEN_CLOUD_BASE = "https://apis.roblox.com";

export class OpenCloudError extends Error {
  constructor(
    public status: number,
    public body: string,
    public url: string,
  ) {
    super(`Open Cloud ${status} on ${url}: ${body.slice(0, 300)}`);
  }
}

export interface UniverseInfo {
  path: string;
  displayName: string;
  description?: string;
  visibility?: string;
  createTime?: string;
  updateTime?: string;
  user?: string;
  group?: string;
  id: string;
}

export interface PlaceInfo {
  path: string;
  displayName: string;
  description?: string;
  serverSize?: number;
  id: string;
}

export interface PublishResult {
  versionNumber: number;
}

export interface DeveloperProduct {
  id?: number | string;
  productId?: number;
  name: string;
  description?: string;
  priceInRobux: number;
  iconImageAssetId?: number;
}

export interface GamePassInfo {
  id: number;
  name: string;
  description?: string;
  price?: number;
  isForSale?: boolean;
}

export class OpenCloudClient {
  constructor(private transport: CloudTransport) {}

  private async call<T>(req: CloudRequest): Promise<T> {
    const res = await this.transport(req);
    if (res.status < 200 || res.status >= 300) throw new OpenCloudError(res.status, res.body, req.url);
    if (!res.body) return undefined as T;
    try {
      return JSON.parse(res.body) as T;
    } catch {
      return res.body as unknown as T;
    }
  }

  /** Requires `universe:read`. */
  async getUniverse(universeId: number | string): Promise<UniverseInfo> {
    const data = await this.call<Omit<UniverseInfo, "id">>({ method: "GET", url: `${OPEN_CLOUD_BASE}/cloud/v2/universes/${universeId}` });
    return { ...data, id: String(universeId) };
  }

  /** Requires `universe.place:read`. */
  async getPlace(universeId: number | string, placeId: number | string): Promise<PlaceInfo> {
    const data = await this.call<Omit<PlaceInfo, "id">>({ method: "GET", url: `${OPEN_CLOUD_BASE}/cloud/v2/universes/${universeId}/places/${placeId}` });
    return { ...data, id: String(placeId) };
  }

  /** Requires `universe.place:write`. */
  async updatePlace(universeId: number | string, placeId: number | string, patch: { displayName?: string; description?: string; serverSize?: number }): Promise<PlaceInfo> {
    const mask = Object.keys(patch).join(",");
    const data = await this.call<Omit<PlaceInfo, "id">>({ method: "PATCH", url: `${OPEN_CLOUD_BASE}/cloud/v2/universes/${universeId}/places/${placeId}?updateMask=${mask}`, jsonBody: patch });
    return { ...data, id: String(placeId) };
  }

  /** Requires `universe.place:write`. */
  async updateUniverse(universeId: number | string, patch: { displayName?: string; description?: string; visibility?: "PUBLIC" | "PRIVATE" }): Promise<UniverseInfo> {
    const mask = Object.keys(patch).join(",");
    const data = await this.call<Omit<UniverseInfo, "id">>({ method: "PATCH", url: `${OPEN_CLOUD_BASE}/cloud/v2/universes/${universeId}?updateMask=${mask}`, jsonBody: patch });
    return { ...data, id: String(universeId) };
  }

  /**
   * Publish (or save) a place file. Requires `universe-places:write` on the API key.
   * `versionType`: "Published" makes it live; "Saved" only stores a new version.
   */
  async publishPlace(universeId: number | string, placeId: number | string, rbxlPath: string, versionType: "Published" | "Saved" = "Published"): Promise<PublishResult> {
    return this.call<PublishResult>({
      method: "POST",
      url: `${OPEN_CLOUD_BASE}/universes/v1/${universeId}/places/${placeId}/versions?versionType=${versionType}`,
      bodyFile: rbxlPath,
      contentType: "application/octet-stream",
    });
  }

  /**
   * Upload a file as a new asset (Assets API, `asset:write`). Model assets take .fbx (textures embedded),
   * so an AI-generated mesh becomes a real Roblox Model that `InsertService:LoadAsset` can spawn.
   * The creator is the user or group the API key belongs to.
   */
  async createAsset(opts: { filePath: string; fileName: string; assetType: AssetType; displayName: string; description?: string; creator: { userId?: number | string; groupId?: number | string } }): Promise<AssetOperation> {
    const ext = opts.fileName.split(".").pop()?.toLowerCase() ?? "";
    const contentType = ASSET_CONTENT_TYPES[opts.assetType][ext];
    if (!contentType) throw new Error(`${opts.assetType} assets do not accept .${ext} files`);
    const creator = opts.creator.groupId ? { groupId: String(opts.creator.groupId) } : { userId: String(opts.creator.userId ?? "") };
    if (!creator.groupId && !creator.userId) throw new Error("Open Cloud asset upload needs the creator user id or group id (Roblox tab)");
    const request = { assetType: opts.assetType, displayName: opts.displayName.slice(0, 50), description: (opts.description ?? "Generated with WorldForge AI").slice(0, 1000), creationContext: { creator } };
    const res = await this.call<{ path?: string; operationId?: string; done?: boolean; response?: { assetId?: string }; error?: { message?: string } }>({
      method: "POST",
      url: `${OPEN_CLOUD_BASE}/assets/v1/assets`,
      multipart: [
        { name: "request", text: JSON.stringify(request), contentType: "application/json" },
        { name: "fileContent", filePath: opts.filePath, fileName: opts.fileName, contentType },
      ],
    });
    const operationId = res.operationId ?? res.path?.split("/").pop() ?? "";
    return { operationId, done: !!res.done, assetId: res.response?.assetId, path: res.path, error: res.error?.message };
  }

  /** Poll an Assets API operation until the asset id is known. */
  async getAssetOperation(operationId: string): Promise<AssetOperation> {
    const res = await this.call<{ path?: string; done?: boolean; response?: { assetId?: string; moderationResult?: { moderationState?: string } }; error?: { message?: string } }>({ method: "GET", url: `${OPEN_CLOUD_BASE}/assets/v1/operations/${operationId}` });
    return { operationId, done: !!res.done, assetId: res.response?.assetId, path: res.path, error: res.error?.message };
  }

  async waitForAsset(operationId: string, opts: { pollMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<string> {
    const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    const started = Date.now();
    for (;;) {
      const op = await this.getAssetOperation(operationId);
      if (op.error) throw new Error(`Roblox asset upload failed: ${op.error}`);
      if (op.done && op.assetId) return op.assetId;
      if (Date.now() - started > (opts.timeoutMs ?? 5 * 60 * 1000)) throw new Error("Roblox asset upload timed out (operation still pending)");
      await sleep(opts.pollMs ?? 3000);
    }
  }

  /** Developer products (Open Cloud developer-products API). */
  async listDeveloperProducts(universeId: number | string): Promise<DeveloperProduct[]> {
    const data = await this.call<{ developerProducts?: DeveloperProduct[] } | DeveloperProduct[]>({ method: "GET", url: `${OPEN_CLOUD_BASE}/developer-products/v1/universes/${universeId}/developerproducts?pageNumber=1&pageSize=50` });
    return Array.isArray(data) ? data : (data.developerProducts ?? []);
  }

  async createDeveloperProduct(universeId: number | string, product: { name: string; description?: string; priceInRobux: number }): Promise<DeveloperProduct> {
    return this.call<DeveloperProduct>({
      method: "POST",
      url: `${OPEN_CLOUD_BASE}/developer-products/v1/universes/${universeId}/developerproducts?name=${encodeURIComponent(product.name)}&description=${encodeURIComponent(product.description ?? "")}&priceInRobux=${product.priceInRobux}`,
      jsonBody: {},
    });
  }

  async updateDeveloperProduct(universeId: number | string, productId: number | string, patch: { name?: string; description?: string; priceInRobux?: number }): Promise<DeveloperProduct> {
    return this.call<DeveloperProduct>({ method: "POST", url: `${OPEN_CLOUD_BASE}/developer-products/v1/universes/${universeId}/developerproducts/${productId}/update`, jsonBody: patch });
  }

  /** Game passes: listing is supported; creation is done in the Creator Dashboard (the app opens it). */
  async listGamePasses(universeId: number | string): Promise<GamePassInfo[]> {
    const data = await this.call<{ gamePasses?: GamePassInfo[] }>({ method: "GET", url: `${OPEN_CLOUD_BASE}/game-passes/v1/universes/${universeId}/game-passes?pageSize=50` });
    return data.gamePasses ?? [];
  }

  /** Data stores (debug/inspection). Requires `universe-datastores.objects:read`. */
  async listDataStores(universeId: number | string): Promise<unknown> {
    return this.call({ method: "GET", url: `${OPEN_CLOUD_BASE}/cloud/v2/universes/${universeId}/data-stores` });
  }
}

export function creatorDashboardUrls(universeId: number | string) {
  return {
    overview: `https://create.roblox.com/dashboard/creations/experiences/${universeId}/overview`,
    passes: `https://create.roblox.com/dashboard/creations/experiences/${universeId}/monetization/passes`,
    products: `https://create.roblox.com/dashboard/creations/experiences/${universeId}/monetization/developer-products`,
    apiKeys: "https://create.roblox.com/dashboard/credentials",
  };
}

/** Node/browser transport using fetch with a key (scripts only; the app uses the Rust proxy). */
export function fetchTransport(apiKey: string, fetchImpl: typeof fetch = fetch): CloudTransport {
  return async (req) => {
    const headers: Record<string, string> = { "x-api-key": apiKey, ...(req.headers ?? {}) };
    let body: BodyInit | undefined;
    if (req.bodyFile) {
      const { readFileSync } = await import("node:fs");
      body = new Uint8Array(readFileSync(req.bodyFile));
      headers["content-type"] = req.contentType ?? "application/octet-stream";
    } else if (req.jsonBody !== undefined) {
      body = JSON.stringify(req.jsonBody);
      headers["content-type"] = "application/json";
    }
    const res = await fetchImpl(req.url, { method: req.method, headers, body });
    const out: Record<string, string> = {};
    res.headers.forEach((v, k) => (out[k] = v));
    return { status: res.status, body: await res.text(), headers: out };
  };
}
