import type { ProcessRunner } from "../runner";
import { McpClient, mcpImage, mcpText, type McpTool } from "./client";

/**
 * Roblox Studio built-in MCP server bridge (create.roblox.com/docs/studio/mcp).
 * Studio must be running with "Enable Studio as MCP server" turned on.
 */
export interface StudioInstance {
  id: string;
  name: string;
  placeId?: number | string;
  [k: string]: unknown;
}

export type DataModelType = "Edit" | "Client" | "Server";

export interface StudioState {
  playState?: string;
  datamodelTypes?: string[];
  raw: string;
}

export class StudioMcp {
  readonly client: McpClient;
  tools: McpTool[] = [];
  studios: StudioInstance[] = [];
  activeStudioId: string | null = null;

  constructor(runner: ProcessRunner, processId = "studio_mcp") {
    this.client = new McpClient(runner, processId);
  }

  get connected(): boolean {
    return this.client.connected;
  }

  async connect(program: string, args: string[] = []): Promise<void> {
    await this.client.connect(program, args);
    this.tools = await this.client.listTools();
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  hasTool(name: string): boolean {
    return this.tools.some((t) => t.name === name);
  }

  async listStudios(): Promise<StudioInstance[]> {
    const res = await this.client.callTool("list_roblox_studios", {}, 30000);
    const text = mcpText(res);
    try {
      const parsed = JSON.parse(text) as { studios?: StudioInstance[] } | StudioInstance[];
      this.studios = Array.isArray(parsed) ? parsed : (parsed.studios ?? []);
    } catch {
      this.studios = [];
    }
    if (!this.activeStudioId || !this.studios.some((s) => s.id === this.activeStudioId)) this.activeStudioId = this.studios[0]?.id ?? null;
    return this.studios;
  }

  private sid(): string {
    if (!this.activeStudioId) throw new Error("No Roblox Studio instance connected (open a place in Studio with the MCP server enabled)");
    return this.activeStudioId;
  }

  async getState(): Promise<StudioState> {
    const res = await this.client.callTool("get_studio_state", { studio_id: this.sid() }, 30000);
    const raw = mcpText(res);
    try {
      const j = JSON.parse(raw) as Record<string, unknown>;
      return { playState: (j.playState ?? j.state ?? j.mode) as string | undefined, datamodelTypes: (j.datamodelTypes ?? j.availableDataModels ?? j.datamodel_types) as string[] | undefined, raw };
    } catch {
      return { raw };
    }
  }

  /** Execute Luau in Studio. Returns the printed/returned output; throws on tool error. */
  async executeLuau(code: string, datamodel: DataModelType = "Edit", timeoutMs = 300000): Promise<string> {
    const res = await this.client.callTool("execute_luau", { code, datamodel_type: datamodel, studio_id: this.sid() }, timeoutMs);
    const text = mcpText(res);
    if (res.isError) throw new Error(text || "execute_luau failed");
    return text;
  }

  async startStopPlay(start: boolean): Promise<string> {
    const res = await this.client.callTool("start_stop_play", { is_start: start, studio_id: this.sid() }, 120000);
    return mcpText(res);
  }

  async getConsoleOutput(): Promise<string> {
    const res = await this.client.callTool("get_console_output", { studio_id: this.sid() }, 60000);
    return mcpText(res);
  }

  /** Screen capture; returns base64 PNG data (or null) plus any text. */
  async screenCapture(captureId: string, cameraPosition?: [number, number, number], lookAt?: [number, number, number]): Promise<{ image: { data: string; mimeType: string } | null; text: string }> {
    const args: Record<string, unknown> = { capture_id: captureId, studio_id: this.sid() };
    if (cameraPosition) args.camera_position = cameraPosition;
    if (lookAt) args.look_at_position = lookAt;
    const res = await this.client.callTool("screen_capture", args, 120000);
    return { image: mcpImage(res), text: mcpText(res) };
  }

  async inspect(path: string): Promise<string> {
    const res = await this.client.callTool("inspect_instance", { path, studio_id: this.sid() }, 60000);
    return mcpText(res);
  }

  /** AI mesh generation inside Studio (Roblox's own generator) — a real MeshProvider backend. */
  async generateMesh(textPrompt: string, size?: { x: number; y: number; z: number }, maxTriangles?: number): Promise<string> {
    const args: Record<string, unknown> = { textPrompt, studio_id: this.sid() };
    if (size) args.size = size;
    if (maxTriangles) args.maxTriangles = maxTriangles;
    const res = await this.client.callTool("generate_mesh", args, 600000);
    return mcpText(res);
  }

  async generateProceduralModel(prompt: string): Promise<string> {
    const res = await this.client.callTool("generate_procedural_model", { prompt, studio_id: this.sid() }, 600000);
    return mcpText(res);
  }
}

/** Luau that stores one JSON chunk of the WorldBake in ReplicatedStorage.WorldAssets.WorldBakeJson. */
export function pushBakeChunkLuau(index: number, total: number, chunk: string): string {
  // JSON never contains "]==]" so a level-2 long string is safe.
  return `local RS = game:GetService("ReplicatedStorage")
local assets = RS:FindFirstChild("WorldAssets") or Instance.new("Folder", RS)
assets.Name = "WorldAssets"
local folder = assets:FindFirstChild("WorldBakeJson")
if ${index} == 0 then
  if folder then folder:Destroy() end
  folder = Instance.new("Folder")
  folder.Name = "WorldBakeJson"
  folder.Parent = assets
end
local sv = Instance.new("StringValue")
sv.Name = string.format("chunk_%03d", ${index})
sv.Value = [==[${chunk}]==]
sv.Parent = folder
return string.format("chunk %d/%d stored (%d chars)", ${index + 1}, ${total}, #sv.Value)`;
}

export const VERIFY_BAKE_JSON_LUAU = `
local folder = game:GetService("ReplicatedStorage"):FindFirstChild("WorldAssets") and game:GetService("ReplicatedStorage").WorldAssets:FindFirstChild("WorldBakeJson")
if not folder then return "no pushed bake" end
local parts = {}
for _, c in ipairs(folder:GetChildren()) do table.insert(parts, c) end
table.sort(parts, function(a, b) return a.Name < b.Name end)
local buf = {}
for _, c in ipairs(parts) do table.insert(buf, c.Value) end
local json = table.concat(buf)
local ok, data = pcall(function() return game:GetService("HttpService"):JSONDecode(json) end)
if not ok then return "invalid json: " .. tostring(data) end
return string.format("pushed bake ok: %d chars, %d placements, version %s", #json, data.placementCount or -1, tostring(data.meta and data.meta.version))
`;

/**
 * Map a compiled roblox-ts output file (relative to out/) to a Roblox instance path + class,
 * mirroring the template's default.project.json tree.
 */
export function outFileToInstance(rel: string): { path: string[]; className: "Script" | "LocalScript" | "ModuleScript" } | null {
  const norm = rel.replace(/\\/g, "/");
  if (!norm.endsWith(".luau") && !norm.endsWith(".lua")) return null;
  const [root, ...rest] = norm.split("/");
  const roots: Record<string, string[]> = {
    server: ["ServerScriptService", "TS"],
    world: ["ServerScriptService", "World"],
    systems: ["ServerScriptService", "Systems"],
    shared: ["ReplicatedStorage", "TS"],
    client: ["StarterPlayer", "StarterPlayerScripts", "TS"],
    ui: ["StarterPlayer", "StarterPlayerScripts", "UI"],
  };
  const base = roots[root ?? ""];
  if (!base || rest.length === 0) return null;
  const file = rest[rest.length - 1]!;
  const dirs = rest.slice(0, -1);
  let name = file.replace(/\.luau?$/, "");
  let className: "Script" | "LocalScript" | "ModuleScript" = "ModuleScript";
  if (name.endsWith(".server")) {
    className = "Script";
    name = name.slice(0, -".server".length);
  } else if (name.endsWith(".client")) {
    className = "LocalScript";
    name = name.slice(0, -".client".length);
  }
  if (name === "init") {
    // init.luau turns its folder into the script itself
    const folder = dirs.pop();
    if (!folder) return null;
    return { path: [...base, ...dirs, folder], className };
  }
  return { path: [...base, ...dirs, name], className };
}

/** Luau that creates/updates one script instance with the given source. */
export function pushScriptLuau(path: string[], className: string, source: string): string {
  const level = "=====";
  const safe = source.includes(`]${level}]`) ? source.replace(/\]=====\]/g, "] =====]") : source;
  const pathLiteral = path.map((p) => JSON.stringify(p)).join(", ");
  return `local path = { ${pathLiteral} }
local parent = game:GetService(path[1])
for i = 2, #path - 1 do
  local child = parent:FindFirstChild(path[i])
  if not child then
    child = Instance.new("Folder")
    child.Name = path[i]
    child.Parent = parent
  end
  parent = child
end
local name = path[#path]
local inst = parent:FindFirstChild(name)
if inst and not inst:IsA(${JSON.stringify(className)}) then
  -- a Folder becomes the script (init.luau semantics): move children over
  local replacement = Instance.new(${JSON.stringify(className)})
  replacement.Name = name
  for _, c in ipairs(inst:GetChildren()) do c.Parent = replacement end
  inst:Destroy()
  inst = replacement
  inst.Parent = parent
elseif not inst then
  inst = Instance.new(${JSON.stringify(className)})
  inst.Name = name
  inst.Parent = parent
end
inst.Source = [${level}[${safe}]${level}]
return "ok " .. inst:GetFullName() .. " (" .. #inst.Source .. " chars)"`;
}

/** Luau snippet that (re)builds the world in the edit DataModel and marks the place as prebaked. */
export const BAKE_WORLD_LUAU = `
local RS = game:GetService("ReplicatedStorage")
local SSS = game:GetService("ServerScriptService")
local ok, err = pcall(function()
  local World = SSS:FindFirstChild("World")
  assert(World, "ServerScriptService.World not found — build & sync the project (rojo) first")
  local builder = require(World:WaitForChild("WorldBuilder"))
  local bake = builder.loadBake()
  local report = builder.buildWorld(bake, { yieldEvery = 400 })
  workspace:SetAttribute("WorldPrebaked", true)
  print(string.format("[WorldForge] baked %d placements, %d terrain chunks in %.1fs", report.placements, report.terrainChunks, report.seconds))
end)
if not ok then error(err) end
return "ok"
`;

export const WORLD_STATS_LUAU = `
local world = workspace:FindFirstChild("World")
local parts, models = 0, 0
if world then
  for _, d in ipairs(world:GetDescendants()) do
    if d:IsA("BasePart") then parts += 1 elseif d:IsA("Model") then models += 1 end
  end
end
local terrainRegion = workspace.Terrain:CountCells()
return string.format("models=%d parts=%d terrainCells=%d prebaked=%s ready=%s", models, parts, terrainRegion, tostring(workspace:GetAttribute("WorldPrebaked")), tostring(workspace:GetAttribute("WorldReady")))
`;
