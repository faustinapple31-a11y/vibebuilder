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
