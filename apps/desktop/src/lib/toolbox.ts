import { newId } from "@worldforge/core";
import { db } from "./db";
import { fs, path, publicApi } from "./tauri";

/**
 * Shared toolbox: Roblox Creator Store search (millions of public models, meshes, decals, audio and
 * animations, read through the Rust proxy) + the app-level library of generated/imported assets
 * (SQLite `assets`, shared by every project).
 */
export type ToolboxCategory = "models" | "meshes" | "decals" | "audio" | "animations";

/** Creator Store asset type ids (toolbox-service marketplace categories). */
export const TOOLBOX_TYPE: Record<ToolboxCategory, number> = { models: 10, meshes: 40, decals: 13, audio: 3, animations: 24 };

export interface StoreAsset {
  id: number;
  name: string;
  typeId: number;
  category: ToolboxCategory;
  description: string;
  creator: string;
  verified: boolean;
  upVotes: number;
  downVotes: number;
  /** seconds (audio) */
  duration?: number;
  triangles?: number;
  thumbnail?: string;
}

export interface StoreSearchResult {
  total: number;
  items: StoreAsset[];
  nextCursor?: string;
}

interface DetailsResponse {
  data?: {
    asset?: { id: number; name: string; typeId: number; description?: string; duration?: number; modelTechnicalDetails?: { objectMeshSummary?: { triangles?: number } } };
    creator?: { name?: string; isVerifiedCreator?: boolean };
    voting?: { upVotes?: number; downVotes?: number };
  }[];
}

const thumbCache = new Map<number, Promise<string | undefined>>();

async function thumbnailFor(id: number, category: ToolboxCategory): Promise<string | undefined> {
  let p = thumbCache.get(id);
  if (!p) {
    p = (async () => {
      const kind = category === "audio" ? "Asset" : "Asset";
      const res = await publicApi.get(`https://thumbnails.roblox.com/v1/assets?assetIds=${id}&size=150x150&format=Png&returnPolicy=PlaceHolder`);
      const json = JSON.parse(res.body) as { data?: { imageUrl?: string; state?: string }[] };
      const url = json.data?.[0]?.imageUrl;
      if (!url) return undefined;
      const img = await publicApi.get(url, "base64");
      if (img.status >= 300) return undefined;
      void kind;
      return `data:image/png;base64,${img.body}`;
    })().catch(() => undefined);
    thumbCache.set(id, p);
  }
  return p;
}

export async function searchCreatorStore(category: ToolboxCategory, keyword: string, opts: { limit?: number; cursor?: string; thumbnails?: boolean } = {}): Promise<StoreSearchResult> {
  const limit = opts.limit ?? 24;
  const url = `https://apis.roblox.com/toolbox-service/v1/marketplace/${TOOLBOX_TYPE[category]}?keyword=${encodeURIComponent(keyword)}&limit=${limit}${opts.cursor ? `&cursor=${encodeURIComponent(opts.cursor)}` : ""}`;
  const res = await publicApi.get(url);
  if (res.status >= 300) throw new Error(`Creator Store search failed (${res.status})`);
  const json = JSON.parse(res.body) as { totalResults?: number; nextPageCursor?: string; data?: { id: number }[] };
  const ids = (json.data ?? []).map((d) => d.id);
  if (ids.length === 0) return { total: json.totalResults ?? 0, items: [] };
  const det = await publicApi.get(`https://apis.roblox.com/toolbox-service/v1/items/details?assetIds=${ids.join(",")}`);
  const details = (JSON.parse(det.body) as DetailsResponse).data ?? [];
  const items: StoreAsset[] = details
    .filter((d) => d.asset)
    .map((d) => ({
      id: d.asset!.id,
      name: d.asset!.name,
      typeId: d.asset!.typeId,
      category,
      description: d.asset!.description ?? "",
      creator: d.creator?.name ?? "",
      verified: !!d.creator?.isVerifiedCreator,
      upVotes: d.voting?.upVotes ?? 0,
      downVotes: d.voting?.downVotes ?? 0,
      duration: d.asset!.duration,
      triangles: d.asset!.modelTechnicalDetails?.objectMeshSummary?.triangles,
    }));
  if (opts.thumbnails !== false) {
    await Promise.all(items.map(async (i) => (i.thumbnail = await thumbnailFor(i.id, category))));
  }
  return { total: json.totalResults ?? items.length, items, nextCursor: json.nextPageCursor };
}

// ---------------------------------------------------------------- local library (app-level, all projects)
export interface LibraryAsset {
  id: string;
  name: string;
  category: "image" | "mesh" | "audio" | "model";
  subcategory: string;
  source: string;
  filePath: string;
  tags: string[];
  createdAt: string;
  /** Roblox asset id when uploaded/published. */
  robloxAssetId?: number;
}

interface AssetRow {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  source: string;
  file_path: string;
  tags: string | null;
  created_at: string;
}

export async function listLibrary(category?: LibraryAsset["category"]): Promise<LibraryAsset[]> {
  const rows = await (await db()).select<AssetRow[]>(category ? "SELECT * FROM assets WHERE category = $1 ORDER BY created_at DESC" : "SELECT * FROM assets ORDER BY created_at DESC", category ? [category] : []);
  return rows.map((r) => {
    const tags = safeTags(r.tags);
    const rbx = tags.find((t) => t.startsWith("rbxassetid:"));
    return { id: r.id, name: r.name, category: r.category as LibraryAsset["category"], subcategory: r.subcategory ?? "", source: r.source, filePath: r.file_path, tags, createdAt: r.created_at, robloxAssetId: rbx ? Number(rbx.slice(11)) : undefined };
  });
}

function safeTags(raw: string | null): string[] {
  try {
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

/** Copies a local file into the shared library folder and registers it. */
export async function importToLibrary(sourcePath: string, category: LibraryAsset["category"], name?: string, tags: string[] = []): Promise<LibraryAsset> {
  const paths = await fs.appPaths();
  const ext = sourcePath.split(".").pop()?.toLowerCase() ?? "bin";
  const id = newId("lib", 8);
  const dir = path.join(paths.app_data, "toolbox", category);
  const dest = path.join(dir, `${id}.${ext}`);
  await fs.copyFile(sourcePath, dest);
  const label = name ?? (sourcePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? id);
  await (await db()).execute("INSERT INTO assets (id, name, category, subcategory, style, biome, source, license, file_path, tags, created_at) VALUES ($1,$2,$3,$4,'library','any','import','user',$5,$6,$7)", [id, label.slice(0, 80), category, ext, dest, JSON.stringify(["import", ...tags]), new Date().toISOString()]);
  return { id, name: label, category, subcategory: ext, source: "import", filePath: dest, tags: ["import", ...tags], createdAt: new Date().toISOString() };
}

export async function setLibraryRobloxId(asset: LibraryAsset, robloxAssetId: number): Promise<void> {
  const tags = [...asset.tags.filter((t) => !t.startsWith("rbxassetid:")), `rbxassetid:${robloxAssetId}`];
  await (await db()).execute("UPDATE assets SET tags = $1 WHERE id = $2", [JSON.stringify(tags), asset.id]);
}

export async function removeFromLibrary(asset: LibraryAsset): Promise<void> {
  await (await db()).execute("DELETE FROM assets WHERE id = $1", [asset.id]);
  if (await fs.exists(asset.filePath)) await fs.remove(asset.filePath).catch(() => {});
}

/** Luau that inserts a Creator Store asset into the open place in front of the camera. */
export function insertAssetLuau(assetId: number, name: string, category: ToolboxCategory): string {
  if (category === "audio") {
    return `local s = Instance.new("Sound")
s.Name = ${JSON.stringify(name.slice(0, 50))}
s.SoundId = "rbxassetid://${assetId}"
s.Looped = true
s.Volume = 0.5
s.Parent = game:GetService("SoundService")
return "inserted Sound " .. s.Name .. " in SoundService"`;
  }
  return `local ok, objects = pcall(function() return game:GetObjects("rbxassetid://${assetId}") end)
if not ok then return "error: " .. tostring(objects) end
local folder = workspace:FindFirstChild("Toolbox") or Instance.new("Folder")
folder.Name = "Toolbox"; folder.Parent = workspace
local cam = workspace.CurrentCamera
local focus = cam.CFrame.Position + cam.CFrame.LookVector * 24
local ray = workspace:Raycast(focus + Vector3.new(0, 150, 0), Vector3.new(0, -500, 0))
local ground = ray and ray.Position or focus
local n = 0
for _, obj in ipairs(objects) do
  if obj:IsA("Model") then
    local cf, size = obj:GetBoundingBox()
    obj.WorldPivot = CFrame.new(cf.Position.X, cf.Position.Y - size.Y / 2, cf.Position.Z)
    obj:PivotTo(CFrame.new(ground))
  elseif obj:IsA("BasePart") then
    obj.CFrame = CFrame.new(ground + Vector3.new(0, obj.Size.Y / 2, 0))
  end
  obj.Name = ${JSON.stringify(name.slice(0, 50))}
  obj.Parent = folder
  n += 1
end
return string.format("inserted %d object(s) at %s", n, tostring(ground))`;
}
