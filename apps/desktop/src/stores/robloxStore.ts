import { create } from "zustand";
import { newId, slugify } from "@worldforge/core";
import { OpenCloudClient, OpenCloudError, type CloudTransport, type PlaceInfo, type UniverseInfo } from "@worldforge/roblox-cloud";
import { runtimeTemplateFiles } from "@worldforge/roblox-export";
import { updateMeshAsset, type MeshAssetRecord } from "@/lib/meshAssets";
import { parseRbxtscOutput, parseStudioLog, validateBakeForPublish, type DiagnosticEntry, type PublishCheck } from "@worldforge/quality";
import { BAKE_WORLD_LUAU, StudioMcp, VERIFY_BAKE_JSON_LUAU, WORLD_STATS_LUAU, outFileToInstance, pushBakeChunkLuau, pushScriptLuau, type StudioInstance } from "@worldforge/agents";
import { serializeBake } from "@worldforge/core";
import { runsRepo } from "@/lib/db";
import { createTauriProcessRunner } from "@/lib/runner";
import { fs, opencloud, path, proc, studio as studioApi, capture, type StudioInfo } from "@/lib/tauri";
import { useProjects } from "./projectStore";
import { useSettings } from "./settingsStore";
import { useWorld } from "./worldStore";

export type BuildStep = "idle" | "installing" | "compiling" | "building" | "ok" | "error";

interface RobloxState {
  studio: StudioInfo | null;
  rojo: { serving: boolean; processId: string | null; port: number; connected: boolean; log: string[] };
  build: { step: BuildStep; log: string[]; diagnostics: DiagnosticEntry[]; rbxlPath: string | null; lastAt: string | null; durationMs: number };
  logs: { file: string | null; offset: number; entries: DiagnosticEntry[]; raw: string[]; tailing: boolean };
  publish: { status: "idle" | "validating" | "publishing" | "ok" | "error"; checks: PublishCheck[]; message: string | null; versionNumber: number | null };
  cloud: { hasKey: boolean; universe: UniverseInfo | null; place: PlaceInfo | null; error: string | null; loading: boolean };
  qa: { running: boolean; iteration: number; max: number; log: string[]; screenshots: string[] };
  mcp: { available: boolean; connected: boolean; connecting: boolean; studios: StudioInstance[]; activeStudioId: string | null; log: string[]; lastResult: string | null };
  connectMcp: () => Promise<boolean>;
  disconnectMcp: () => Promise<void>;
  refreshStudios: () => Promise<void>;
  bakeInStudio: () => Promise<boolean>;
  pushBakeToStudio: () => Promise<boolean>;
  pushScriptsToStudio: () => Promise<number>;
  deployToStudio: () => Promise<boolean>;
  playTest: (seconds?: number) => Promise<{ errors: DiagnosticEntry[]; output: string }>;
  captureViaMcp: (view?: { position: [number, number, number]; lookAt: [number, number, number]; fov?: number }) => Promise<string | null>;
  runLuau: (code: string, datamodel?: "Edit" | "Server" | "Client") => Promise<string>;
  generateMeshInStudio: (prompt: string) => Promise<string>;
  /** Uploads a hero mesh (FBX) as a Roblox Model asset through Open Cloud and stores the asset id. */
  publishMeshAsset: (record: MeshAssetRecord, onProgress?: (m: string) => void) => Promise<number>;
  /** Spawns a published hero mesh in the open Studio place (edit mode) in front of the camera. */
  insertMeshAssetInStudio: (record: MeshAssetRecord) => Promise<string>;
  refreshStudio: () => Promise<void>;
  installDeps: () => Promise<boolean>;
  compile: () => Promise<boolean>;
  buildPlace: () => Promise<string | null>;
  buildAll: () => Promise<string | null>;
  openInStudio: () => Promise<void>;
  launchStudio: () => Promise<void>;
  startRojoServe: () => Promise<void>;
  stopRojoServe: () => Promise<void>;
  installRojoPlugin: () => Promise<void>;
  startTail: () => Promise<void>;
  stopTail: () => void;
  clearLogs: () => void;
  captureStudio: () => Promise<string | null>;
  refreshCloud: () => Promise<void>;
  validate: () => Promise<PublishCheck[]>;
  publishPlace: (versionType: "Published" | "Saved") => Promise<void>;
  runQaLoop: () => Promise<void>;
  stopQaLoop: () => void;
}

let tailTimer: ReturnType<typeof setInterval> | null = null;
let studioMcp: StudioMcp | null = null;
let rojoPoll: ReturnType<typeof setInterval> | null = null;
let qaAbort = false;
const runner = createTauriProcessRunner();

const transport: CloudTransport = async (req) => {
  const res = await opencloud.request({
    method: req.method,
    url: req.url,
    json_body: req.jsonBody !== undefined ? JSON.stringify(req.jsonBody) : undefined,
    body_file: req.bodyFile,
    content_type: req.contentType,
    headers: req.headers,
    multipart: req.multipart?.map((p) => ({ name: p.name, text: p.text, file_path: p.filePath, file_name: p.fileName, content_type: p.contentType })),
  });
  return { status: res.status, body: res.body, headers: res.headers };
};
export const cloudClient = new OpenCloudClient(transport);

async function streamStep(id: string, program: string, args: string[], cwd: string, onLine: (l: string) => void): Promise<number> {
  return new Promise<number>((resolve) => {
    const unsubOut = runner.onOutput(id, (_s, line) => onLine(line));
    const unsubExit = runner.onExit(id, (code) => {
      unsubOut();
      unsubExit();
      resolve(code);
    });
    runner.spawn({ id, program, args, cwd }).catch((e) => {
      onLine(`spawn failed: ${(e as Error).message ?? e}`);
      unsubOut();
      unsubExit();
      resolve(-1);
    });
  });
}

export const useRoblox = create<RobloxState>((set, get) => ({
  studio: null,
  rojo: { serving: false, processId: null, port: 34872, connected: false, log: [] },
  build: { step: "idle", log: [], diagnostics: [], rbxlPath: null, lastAt: null, durationMs: 0 },
  logs: { file: null, offset: 0, entries: [], raw: [], tailing: false },
  publish: { status: "idle", checks: [], message: null, versionNumber: null },
  cloud: { hasKey: false, universe: null, place: null, error: null, loading: false },
  qa: { running: false, iteration: 0, max: 3, log: [], screenshots: [] },
  mcp: { available: false, connected: false, connecting: false, studios: [], activeStudioId: null, log: [], lastResult: null },

  async refreshStudio() {
    try {
      const info = await studioApi.info();
      set((s) => ({ studio: info, mcp: { ...s.mcp, available: !!info.mcp_server } }));
    } catch {
      /* ignore */
    }
  },

  async connectMcp() {
    const info = get().studio ?? (await studioApi.info());
    if (!info.mcp_server) {
      set((s) => ({ mcp: { ...s.mcp, log: [...s.mcp.log, "Studio MCP server not found (enable it in Studio: Assistant → Manage MCP Servers)"] } }));
      return false;
    }
    if (studioMcp?.connected) {
      await get().refreshStudios();
      return true;
    }
    set((s) => ({ mcp: { ...s.mcp, connecting: true } }));
    try {
      studioMcp = new StudioMcp(runner, `studio_mcp_${newId("", 6)}`);
      studioMcp.client.onLog = (line) => set((s) => ({ mcp: { ...s.mcp, log: [...s.mcp.log.slice(-200), line] } }));
      await studioMcp.connect(info.mcp_server);
      set((s) => ({ mcp: { ...s.mcp, connected: true, connecting: false, log: [...s.mcp.log, `MCP connected: ${studioMcp?.client.serverInfo.name ?? "Roblox Studio"} (${studioMcp?.tools.length ?? 0} tools)`] } }));
      await get().refreshStudios();
      return true;
    } catch (e) {
      set((s) => ({ mcp: { ...s.mcp, connected: false, connecting: false, log: [...s.mcp.log, `MCP connection failed: ${(e as Error).message ?? e}`] } }));
      return false;
    }
  },
  async disconnectMcp() {
    await studioMcp?.close();
    studioMcp = null;
    set((s) => ({ mcp: { ...s.mcp, connected: false, studios: [], activeStudioId: null } }));
  },
  async refreshStudios() {
    if (!studioMcp?.connected) return;
    try {
      const studios = await studioMcp.listStudios();
      set((s) => ({ mcp: { ...s.mcp, studios, activeStudioId: studioMcp?.activeStudioId ?? null } }));
    } catch (e) {
      set((s) => ({ mcp: { ...s.mcp, log: [...s.mcp.log, `list studios failed: ${(e as Error).message ?? e}`] } }));
    }
  },

  /** Push the current WorldBake JSON into the open Studio place (no Rojo round-trip needed). */
  async pushBakeToStudio() {
    const bake = useWorld.getState().bake;
    if (!bake) return false;
    if (!(await get().connectMcp())) return false;
    await get().refreshStudios();
    if (!studioMcp?.activeStudioId) return false;
    const log = (m: string) => set((s) => ({ mcp: { ...s.mcp, log: [...s.mcp.log.slice(-200), m] } }));
    try {
      const json = JSON.stringify(serializeBake(bake));
      const CHUNK = 150000;
      const total = Math.ceil(json.length / CHUNK);
      log(`pushing WorldBake ${bake.meta.version} to Studio (${(json.length / 1024).toFixed(0)} KB in ${total} chunks)…`);
      for (let i = 0; i < total; i++) {
        await studioMcp.executeLuau(pushBakeChunkLuau(i, total, json.slice(i * CHUNK, (i + 1) * CHUNK)), "Edit", 120000);
      }
      const verify = await studioMcp.executeLuau(VERIFY_BAKE_JSON_LUAU, "Edit", 60000);
      log(verify.trim());
      return verify.includes("pushed bake ok");
    } catch (e) {
      log(`push failed: ${(e as Error).message ?? e}`);
      return false;
    }
  },

  /** Push compiled scripts (out/**\/*.luau) into the open place through MCP — Rojo-free sync. */
  async pushScriptsToStudio() {
    const cur = useProjects.getState().current;
    if (!cur) return 0;
    if (!(await get().connectMcp())) return 0;
    await get().refreshStudios();
    if (!studioMcp?.activeStudioId) return 0;
    const log = (m: string) => set((s) => ({ mcp: { ...s.mcp, log: [...s.mcp.log.slice(-200), m] } }));
    const outDir = path.join(cur.path, "out");
    const files = (await fs.walk(outDir, 2000).catch(() => [] as string[])).filter((f) => f.endsWith(".luau") || f.endsWith(".lua"));
    let n = 0;
    for (const rel of files) {
      const target = outFileToInstance(rel);
      if (!target) continue;
      try {
        const source = await fs.readText(path.join(outDir, rel));
        await studioMcp.executeLuau(pushScriptLuau(target.path, target.className, source), "Edit", 60000);
        n++;
      } catch (e) {
        log(`push ${rel} failed: ${(e as Error).message ?? e}`);
      }
    }
    log(`synced ${n}/${files.length} script(s) into Studio`);
    return n;
  },

  /** Compile → push scripts → push bake → build world in Studio. */
  async deployToStudio() {
    const ok = await get().compile();
    if (!ok) return false;
    const n = await get().pushScriptsToStudio();
    if (n === 0) return false;
    return get().bakeInStudio();
  },

  /** Build the world inside the open Studio place (edit mode) through execute_luau. */
  async bakeInStudio() {
    if (!(await get().connectMcp())) return false;
    await get().refreshStudios();
    if (!studioMcp?.activeStudioId) {
      set((s) => ({ mcp: { ...s.mcp, log: [...s.mcp.log, "No Studio instance is connected — open the place in Studio first"] } }));
      return false;
    }
    const log = (m: string) => set((s) => ({ mcp: { ...s.mcp, log: [...s.mcp.log.slice(-200), m] } }));
    await get().pushBakeToStudio();
    try {
      log("execute_luau: building world in the edit DataModel…");
      const t0 = Date.now();
      const out = await studioMcp.executeLuau(BAKE_WORLD_LUAU, "Edit", 600000);
      const stats = await studioMcp.executeLuau(WORLD_STATS_LUAU, "Edit", 60000);
      log(`${out.trim()} · ${stats.trim()} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      set((s) => ({ mcp: { ...s.mcp, lastResult: stats.trim() } }));
      return true;
    } catch (e) {
      log(`bake failed: ${(e as Error).message ?? e}`);
      return false;
    }
  },

  /** Start play mode, wait, collect the console output, stop. */
  async playTest(seconds = 20) {
    const empty = { errors: [] as DiagnosticEntry[], output: "" };
    if (!(await get().connectMcp())) return empty;
    await get().refreshStudios();
    if (!studioMcp?.activeStudioId) return empty;
    const log = (m: string) => set((s) => ({ mcp: { ...s.mcp, log: [...s.mcp.log.slice(-200), m] } }));
    try {
      log(`start_stop_play: starting play test (${seconds}s)…`);
      await studioMcp.startStopPlay(true);
      await new Promise((r) => setTimeout(r, seconds * 1000));
      const output = await studioMcp.getConsoleOutput();
      await studioMcp.startStopPlay(false);
      const lines = output.split(/\r?\n/).filter(Boolean);
      const parsed = parseStudioLog(output);
      const errors = parsed.filter((e) => e.severity === "error");
      log(`play test done: ${lines.length} console lines, ${errors.length} error(s)`);
      set((s) => ({ logs: { ...s.logs, raw: [...s.logs.raw, ...lines].slice(-600), entries: [...s.logs.entries, ...parsed].slice(-300) } }));
      return { errors, output };
    } catch (e) {
      log(`play test failed: ${(e as Error).message ?? e}`);
      try {
        await studioMcp.startStopPlay(false);
      } catch {
        /* ignore */
      }
      return empty;
    }
  },

  /** Execute a Luau snippet in Studio and log the output (Luau console). */
  async runLuau(code, datamodel = "Edit") {
    if (!(await get().connectMcp())) return "";
    await get().refreshStudios();
    if (!studioMcp?.activeStudioId) return "";
    const log = (m: string) => set((s) => ({ mcp: { ...s.mcp, log: [...s.mcp.log.slice(-200), m] } }));
    try {
      const out = await studioMcp.executeLuau(code, datamodel, 300000);
      log(`[luau/${datamodel}] ${out.trim().slice(0, 4000)}`);
      return out;
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      log(`[luau/${datamodel}] error: ${msg.slice(0, 2000)}`);
      return `error: ${msg}`;
    }
  },

  /** Roblox Studio's built-in AI mesh generator (inserts the mesh into the open place). */
  async generateMeshInStudio(prompt) {
    if (!(await get().connectMcp())) throw new Error("Studio MCP not available");
    await get().refreshStudios();
    if (!studioMcp?.activeStudioId) throw new Error("No Studio instance connected");
    const log = (m: string) => set((s) => ({ mcp: { ...s.mcp, log: [...s.mcp.log.slice(-200), m] } }));
    log(`generate_mesh: ${prompt.slice(0, 80)}…`);
    const out = await studioMcp.generateMesh(prompt, { x: 12, y: 12, z: 12 }, 6000);
    log(`generate_mesh → ${out.slice(0, 200)}`);
    return out;
  },

  async publishMeshAsset(record, onProgress) {
    const cur = useProjects.getState().current;
    if (!cur) throw new Error("No project open");
    if (!record.fbx) throw new Error("This model has no FBX file — Roblox Model assets are uploaded as .fbx (regenerate with Meshy or import an FBX)");
    const creator = { userId: cur.meta.roblox.creatorUserId, groupId: cur.meta.roblox.creatorGroupId };
    if (!creator.userId && !creator.groupId) throw new Error("Set the creator user id (or group id) of your Open Cloud key in the Roblox tab first");
    onProgress?.("uploading FBX to Roblox (Assets API)…");
    const op = await cloudClient.createAsset({ filePath: path.join(cur.path, record.fbx), fileName: record.fbx.split("/").pop() ?? "model.fbx", assetType: "Model", displayName: record.name, description: `WorldForge AI · ${record.prompt}`.slice(0, 1000), creator });
    let assetId = op.assetId;
    if (!assetId) {
      onProgress?.(`processing (operation ${op.operationId})…`);
      assetId = await cloudClient.waitForAsset(op.operationId);
    }
    const id = Number(assetId);
    await updateMeshAsset(cur.path, { ...record, robloxAssetId: id, robloxOperationId: op.operationId, publishedAt: new Date().toISOString() });
    await useWorld.getState().refreshMeshAssets();
    onProgress?.(`published as asset ${id}`);
    return id;
  },

  async insertMeshAssetInStudio(record) {
    if (!record.robloxAssetId) throw new Error("Publish the model to Roblox first (it needs an asset id to be inserted)");
    const code = `local InsertService = game:GetService("InsertService")
local ok, res = pcall(function() return InsertService:LoadAsset(${record.robloxAssetId}) end)
if not ok then return "error: " .. tostring(res) end
local model = res
local child = model:GetChildren()[1]
if #model:GetChildren() == 1 and child:IsA("Model") then child.Parent = nil; model:Destroy(); model = child end
model.Name = ${JSON.stringify(record.name.slice(0, 50))}
for _, d in ipairs(model:GetDescendants()) do if d:IsA("BasePart") then d.Anchored = true end end
local cf, size = model:GetBoundingBox()
local target = ${record.heightStuds.toFixed(2)}
if size.Y > 0.01 then model:ScaleTo(target / size.Y) end
cf, size = model:GetBoundingBox()
local cam = workspace.CurrentCamera
local focus = cam.CFrame.Position + cam.CFrame.LookVector * (size.Magnitude + 20)
local ray = workspace:Raycast(focus + Vector3.new(0, 200, 0), Vector3.new(0, -600, 0))
local ground = ray and ray.Position or focus
model.WorldPivot = CFrame.new(cf.Position.X, cf.Position.Y - size.Y / 2, cf.Position.Z)
model:PivotTo(CFrame.new(ground))
local folder = workspace:FindFirstChild("World") and workspace.World:FindFirstChild("Hero") or Instance.new("Folder")
folder.Name = "Hero"; folder.Parent = workspace:FindFirstChild("World") or workspace
model.Parent = folder
return string.format("inserted %s (%d parts, %.1f studs tall) at %s", model.Name, #model:GetDescendants(), size.Y, tostring(ground))`;
    return get().runLuau(code, "Edit");
  },

  /** Screenshot through Studio's own capture (camera at the spawn looking at the village). */
  async captureViaMcp(view) {
    const cur = useProjects.getState().current;
    if (!cur || !(await get().connectMcp())) return null;
    await get().refreshStudios();
    if (!studioMcp?.activeStudioId) return null;
    const bake = useWorld.getState().bake;
    try {
      const v = view ?? (bake ? { position: [bake.spawn.position[0], bake.spawn.position[1] + 7, bake.spawn.position[2]] as [number, number, number], lookAt: [bake.spawn.lookAt[0], bake.spawn.lookAt[1] + 12, bake.spawn.lookAt[2]] as [number, number, number], fov: 70 } : null);
      if (v) {
        // position the Studio camera (default: at the spawn, looking at the composition target)
        const f = (n: number) => n.toFixed(1);
        await studioMcp.executeLuau(`local cam = workspace.CurrentCamera; cam.CameraType = Enum.CameraType.Scriptable; cam.CFrame = CFrame.lookAt(Vector3.new(${f(v.position[0])}, ${f(v.position[1])}, ${f(v.position[2])}), Vector3.new(${f(v.lookAt[0])}, ${f(v.lookAt[1])}, ${f(v.lookAt[2])})); cam.FieldOfView = ${v.fov ?? 70}; return "camera set"`, "Edit", 30000);
        await new Promise((r) => setTimeout(r, 2500)); // let streaming + exposure settle
      }
      const res = await studioMcp.screenCapture(`WorldForge_${Date.now()}`);
      if (!res.image) {
        set((s) => ({ mcp: { ...s.mcp, log: [...s.mcp.log, `screen_capture returned no image: ${res.text.slice(0, 200)}`] } }));
        return null;
      }
      const out = path.join(cur.path, "qa", "screens", `studio_mcp_${Date.now()}.png`);
      await fs.writeBinaryBase64(out, res.image.data);
      set((s) => ({ qa: { ...s.qa, screenshots: [...s.qa.screenshots, out] }, mcp: { ...s.mcp, log: [...s.mcp.log, `screenshot saved ${out}`] } }));
      return out;
    } catch (e) {
      set((s) => ({ mcp: { ...s.mcp, log: [...s.mcp.log, `screen_capture failed: ${(e as Error).message ?? e}`] } }));
      return null;
    }
  },

  async installDeps() {
    const cur = useProjects.getState().current;
    if (!cur) return false;
    if (await fs.exists(path.join(cur.path, "node_modules", "roblox-ts"))) return true;
    set((s) => ({ build: { ...s.build, step: "installing", log: [...s.build.log, "$ npm install"] } }));
    const code = await streamStep(`npm_${newId("", 6)}`, "npm", ["install", "--no-audit", "--no-fund"], cur.path, (l) => set((s) => ({ build: { ...s.build, log: [...s.build.log.slice(-400), l] } })));
    if (code !== 0) {
      set((s) => ({ build: { ...s.build, step: "error", log: [...s.build.log, `npm install failed (${code})`] } }));
      return false;
    }
    return true;
  },

  async compile() {
    const cur = useProjects.getState().current;
    if (!cur) return false;
    if (!(await get().installDeps())) return false;
    const t0 = Date.now();
    // keep the WorldForge runtime (world builder, prefab factory, effects) in sync with the app version
    const runtime = runtimeTemplateFiles({ projectName: cur.row.name, projectId: cur.row.id, stylePreset: cur.meta.stylePreset });
    await fs.writeFiles(cur.path, runtime.map((f) => [f.path, f.content]));
    set((s) => ({ build: { ...s.build, step: "compiling", log: [...s.build.log, `runtime synced (${runtime.length} files)`, "$ rbxtsc"], diagnostics: [] } }));
    const lines: string[] = [];
    const rbxtsc = (await fs.exists(path.join(cur.path, "node_modules", ".bin", "rbxtsc.cmd"))) ? path.join(cur.path, "node_modules", ".bin", "rbxtsc.cmd") : (await fs.exists(path.join(cur.path, "node_modules", ".bin", "rbxtsc"))) ? path.join(cur.path, "node_modules", ".bin", "rbxtsc") : "rbxtsc";
    const code = await streamStep(`rbxtsc_${newId("", 6)}`, rbxtsc, [], cur.path, (l) => {
      lines.push(l);
      set((s) => ({ build: { ...s.build, log: [...s.build.log.slice(-400), l] } }));
    });
    const diagnostics = parseRbxtscOutput(lines.join("\n"));
    const ok = code === 0 && !diagnostics.some((d) => d.severity === "error");
    set((s) => ({ build: { ...s.build, step: ok ? "ok" : "error", diagnostics, durationMs: Date.now() - t0, lastAt: new Date().toISOString() } }));
    await useProjects.getState().touch({ last_build_at: new Date().toISOString(), last_build_status: ok ? "ok" : "error" });
    return ok;
  },

  async buildPlace() {
    const cur = useProjects.getState().current;
    if (!cur) return null;
    const rojo = await proc.resolve("rojo");
    if (!rojo) {
      set((s) => ({ build: { ...s.build, step: "error", log: [...s.build.log, "Rojo is not installed (Settings → Install)"] } }));
      return null;
    }
    const slug = slugify(cur.meta.name);
    const out = path.join(cur.path, "build", `${slug}.rbxl`);
    await fs.mkdirp(path.join(cur.path, "build"));
    set((s) => ({ build: { ...s.build, step: "building", log: [...s.build.log, `$ rojo build -o build/${slug}.rbxl`] } }));
    const code = await streamStep(`rojo_build_${newId("", 6)}`, rojo, ["build", "-o", out], cur.path, (l) => set((s) => ({ build: { ...s.build, log: [...s.build.log.slice(-400), l] } })));
    if (code !== 0) {
      set((s) => ({ build: { ...s.build, step: "error" } }));
      return null;
    }
    set((s) => ({ build: { ...s.build, step: "ok", rbxlPath: out, lastAt: new Date().toISOString() } }));
    return out;
  },

  async buildAll() {
    const cur = useProjects.getState().current;
    if (!cur) return null;
    const buildId = await runsRepo.startBuild(cur.row.id, "build");
    set((s) => ({ build: { ...s.build, log: [] } }));
    const ok = await get().compile();
    if (!ok) {
      await runsRepo.endBuild(buildId, "error", { diagnostics: get().build.diagnostics });
      return null;
    }
    const out = await get().buildPlace();
    await runsRepo.endBuild(buildId, out ? "ok" : "error", { rbxl: out });
    return out;
  },

  async openInStudio() {
    let rbxl = get().build.rbxlPath;
    if (!rbxl) rbxl = await get().buildAll();
    if (!rbxl) return;
    await studioApi.openPlace(rbxl);
    setTimeout(() => void get().refreshStudio(), 4000);
    void get().startTail();
  },
  async launchStudio() {
    await studioApi.launch();
    setTimeout(() => void get().refreshStudio(), 4000);
  },

  async startRojoServe() {
    const cur = useProjects.getState().current;
    if (!cur || get().rojo.serving) return;
    const rojo = await proc.resolve("rojo");
    if (!rojo) return;
    const id = `rojo_serve_${newId("", 6)}`;
    const unsubOut = runner.onOutput(id, (_s, line) => set((s) => ({ rojo: { ...s.rojo, log: [...s.rojo.log.slice(-200), line] } })));
    const unsubExit = runner.onExit(id, () => {
      unsubOut();
      unsubExit();
      if (rojoPoll) clearInterval(rojoPoll);
      set((s) => ({ rojo: { ...s.rojo, serving: false, processId: null, connected: false } }));
    });
    await runner.spawn({ id, program: rojo, args: ["serve", "--port", String(get().rojo.port)], cwd: cur.path });
    set((s) => ({ rojo: { ...s.rojo, serving: true, processId: id } }));
    rojoPoll = setInterval(async () => {
      try {
        const st = await studioApi.rojoStatus(get().rojo.port);
        const sessions = (st as { sessionId?: string; clientConnections?: unknown[] }).clientConnections;
        set((s) => ({ rojo: { ...s.rojo, connected: Array.isArray(sessions) ? sessions.length > 0 : s.rojo.connected } }));
      } catch {
        /* server not up yet */
      }
    }, 3000);
  },
  async stopRojoServe() {
    const id = get().rojo.processId;
    if (id) await runner.kill(id);
    if (rojoPoll) clearInterval(rojoPoll);
    set((s) => ({ rojo: { ...s.rojo, serving: false, processId: null, connected: false } }));
  },
  async installRojoPlugin() {
    try {
      const msg = await studioApi.installRojoPlugin();
      set((s) => ({ rojo: { ...s.rojo, log: [...s.rojo.log, msg] } }));
    } catch (e) {
      set((s) => ({ rojo: { ...s.rojo, log: [...s.rojo.log, String(e)] } }));
    }
    await get().refreshStudio();
  },

  async startTail() {
    if (get().logs.tailing) return;
    const files = await studioApi.listLogs(1);
    const file = files[0]?.path ?? null;
    if (!file) return;
    const size = files[0]!.size;
    set({ logs: { file, offset: Math.max(0, size - 64 * 1024), entries: [], raw: [], tailing: true } });
    const poll = async () => {
      const st = get().logs;
      if (!st.file) return;
      try {
        const latest = await studioApi.listLogs(1);
        let file = st.file;
        let offset = st.offset;
        if (latest[0] && latest[0].path !== file) {
          file = latest[0].path;
          offset = 0;
        }
        const chunk = await studioApi.readLog(file, offset);
        if (chunk.content) {
          const raw = chunk.content.split(/\r?\n/).filter(Boolean);
          const entries = parseStudioLog(chunk.content);
          set((s) => ({ logs: { ...s.logs, file, offset: chunk.offset, raw: [...s.logs.raw, ...raw].slice(-600), entries: [...s.logs.entries, ...entries].slice(-300) } }));
        } else set((s) => ({ logs: { ...s.logs, file, offset: chunk.offset } }));
      } catch {
        /* file rotated */
      }
    };
    tailTimer = setInterval(poll, 1500);
    await poll();
  },
  stopTail() {
    if (tailTimer) clearInterval(tailTimer);
    tailTimer = null;
    set((s) => ({ logs: { ...s.logs, tailing: false } }));
  },
  clearLogs() {
    set((s) => ({ logs: { ...s.logs, entries: [], raw: [] } }));
  },

  async captureStudio() {
    const cur = useProjects.getState().current;
    if (!cur) return null;
    const out = path.join(cur.path, "qa", "screens", `studio_${Date.now()}.png`);
    try {
      const res = await capture.window("Roblox Studio", out);
      set((s) => ({ qa: { ...s.qa, screenshots: [...s.qa.screenshots, res.path] } }));
      return res.path;
    } catch (e) {
      set((s) => ({ qa: { ...s.qa, log: [...s.qa.log, `capture failed: ${(e as Error).message ?? e}`] } }));
      return null;
    }
  },

  async refreshCloud() {
    const cur = useProjects.getState().current;
    const hasKey = await opencloud.hasKey().catch(() => false);
    set((s) => ({ cloud: { ...s.cloud, hasKey, error: null } }));
    if (!hasKey || !cur?.meta.roblox.universeId) return;
    set((s) => ({ cloud: { ...s.cloud, loading: true } }));
    try {
      const universe = await cloudClient.getUniverse(cur.meta.roblox.universeId);
      const place = cur.meta.roblox.placeId ? await cloudClient.getPlace(cur.meta.roblox.universeId, cur.meta.roblox.placeId) : null;
      set((s) => ({ cloud: { ...s.cloud, universe, place, loading: false } }));
    } catch (e) {
      set((s) => ({ cloud: { ...s.cloud, loading: false, error: e instanceof OpenCloudError ? `${e.status}: ${e.body.slice(0, 200)}` : (e as Error).message } }));
    }
  },

  async validate() {
    const cur = useProjects.getState().current;
    const checks: PublishCheck[] = [];
    if (!cur) return checks;
    set((s) => ({ publish: { ...s.publish, status: "validating", message: null } }));
    checks.push(validateBakeForPublish(useWorld.getState().bake));
    const ok = await get().compile();
    const errs = get().build.diagnostics.filter((d) => d.severity === "error");
    checks.push({ id: "scripts", label: "Scripts", ok, details: ok ? "rbxtsc compiled without errors" : `${errs.length} TypeScript error(s)` });
    const walk = await fs.walk(cur.path, 4000).catch(() => [] as string[]);
    const manifest = walk.includes("design/asset.manifest.json");
    checks.push({ id: "assets", label: "Assets", ok: true, details: manifest ? "asset manifest present" : "no asset manifest (prefabs only)" });
    checks.push({ id: "ui", label: "UI", ok: walk.some((f) => f.startsWith("src/ui/")), details: walk.filter((f) => f.startsWith("src/ui/")).length + " UI module(s)" });
    checks.push({ id: "audio", label: "Audio", ok: true, details: walk.includes("design/audio.manifest.json") ? "audio manifest present" : "no audio manifest" });
    const rbxl = ok ? await get().buildPlace() : null;
    const size = rbxl ? await fs.fileSize(rbxl).catch(() => 0) : 0;
    checks.push({ id: "build", label: "Build", ok: !!rbxl && size > 0 && size < 100 * 1024 * 1024, details: rbxl ? `${(size / 1024 / 1024).toFixed(1)} MB place file` : "build failed" });
    await get().refreshCloud();
    const c = get().cloud;
    checks.push({ id: "roblox", label: "Roblox connection", ok: c.hasKey && !!cur.meta.roblox.universeId && !!cur.meta.roblox.placeId && !c.error, details: !c.hasKey ? "no Open Cloud API key" : !cur.meta.roblox.universeId ? "universe/place ids not set" : c.error ? c.error : `${c.universe?.displayName ?? "universe"} / ${c.place?.displayName ?? "place"}` });
    set((s) => ({ publish: { ...s.publish, status: checks.every((x) => x.ok) ? "idle" : "error", checks, message: checks.every((x) => x.ok) ? "All checks passed" : "Some checks failed" } }));
    return checks;
  },

  async publishPlace(versionType) {
    const cur = useProjects.getState().current;
    if (!cur) return;
    const checks = await get().validate();
    if (!checks.every((c) => c.ok)) return;
    const rbxl = get().build.rbxlPath;
    if (!rbxl || !cur.meta.roblox.universeId || !cur.meta.roblox.placeId) return;
    set((s) => ({ publish: { ...s.publish, status: "publishing", message: `Uploading to place ${cur.meta.roblox.placeId}…` } }));
    const buildId = await runsRepo.startBuild(cur.row.id, "publish");
    try {
      const res = await cloudClient.publishPlace(cur.meta.roblox.universeId, cur.meta.roblox.placeId, rbxl, versionType);
      set((s) => ({ publish: { ...s.publish, status: "ok", versionNumber: res.versionNumber, message: `${versionType} as version ${res.versionNumber}` } }));
      await useProjects.getState().updateMeta({ roblox: { ...cur.meta.roblox, lastPublishedVersion: res.versionNumber, lastPublishedAt: new Date().toISOString() } });
      await useProjects.getState().touch({ last_publish_at: new Date().toISOString(), status: "published" });
      await runsRepo.endBuild(buildId, "ok", res);
    } catch (e) {
      const msg = e instanceof OpenCloudError ? `${e.status}: ${e.body.slice(0, 300)}` : ((e as Error).message ?? String(e));
      set((s) => ({ publish: { ...s.publish, status: "error", message: msg } }));
      await runsRepo.endBuild(buildId, "error", { error: msg });
    }
  },

  async runQaLoop() {
    const cur = useProjects.getState().current;
    if (!cur || get().qa.running) return;
    const settings = useSettings.getState().defaults.qa;
    const max = cur.meta.qa.maxIterations ?? settings.maxIterations;
    qaAbort = false;
    set({ qa: { running: true, iteration: 0, max, log: [`QA loop: up to ${max} iterations, stop at score ≥ ${settings.stopOnScore}`], screenshots: [] } });
    const log = (m: string) => set((s) => ({ qa: { ...s.qa, log: [...s.qa.log, m] } }));
    const { useAgents } = await import("./agentStore");
    for (let i = 1; i <= max && !qaAbort; i++) {
      set((s) => ({ qa: { ...s.qa, iteration: i } }));
      log(`— iteration ${i}/${max}: build`);
      const ok = await get().compile();
      const diags = get().build.diagnostics.filter((d) => d.severity === "error");
      const world = useWorld.getState();
      const report = world.report;
      const runtimeErrors = get().logs.entries.filter((e) => e.severity === "error").slice(-30);
      let runtimeFromPlay: DiagnosticEntry[] = [];
      if (ok && get().studio?.running && get().mcp.available) {
        // real play-test through the Studio MCP server: rebuild the place, run, collect console
        if (get().mcp.connected || (await get().connectMcp())) {
          const baked = await get().bakeInStudio();
          log(baked ? "world baked in Studio (edit mode)" : "bake in Studio skipped");
          const pt = await get().playTest(20);
          runtimeFromPlay = pt.errors;
          if (settings.useVision) {
            const shot = await get().captureViaMcp();
            if (shot) log(`screenshot: ${shot}`);
          }
        }
      } else if (ok && get().studio?.running) {
        const shot = settings.useVision ? await get().captureStudio() : null;
        if (shot) log(`screenshot: ${shot}`);
      }
      const allRuntime = [...runtimeErrors, ...runtimeFromPlay].slice(-30);
      log(`build ${ok ? "ok" : `failed (${diags.length} errors)`}, world score ${report?.score ?? "–"}, runtime errors ${allRuntime.length}`);
      const problems = report?.problems ?? [];
      const nothingToFix = ok && allRuntime.length === 0 && (report?.score ?? 0) >= settings.stopOnScore;
      if (nothingToFix) {
        log(`✓ target reached (score ${report?.score})`);
        break;
      }
      // 1) deterministic fixes for world problems
      if (settings.autoFix && report && report.fixes.length > 0) {
        log(`applying ${report.fixes.length} world fix(es): ${report.problems.map((p) => p.id).join(", ")}`);
        await world.applyReportFixes();
      }
      // 2) agent fixes for code/runtime errors
      const diagText = [...diags.map((d) => `${d.file ?? ""}:${d.line ?? ""} ${d.code ?? ""} ${d.message}`), ...allRuntime.map((e) => `[studio] ${e.message}`)].join("\n");
      if (diagText || (problems.length && settings.useVision && get().qa.screenshots.length)) {
        log(`dispatching QA agent (${diags.length} compile, ${allRuntime.length} runtime)`);
        await useAgents.getState().runQa(diagText || "(no compiler errors)", report ? JSON.stringify({ score: report.score, problems: report.problems }, null, 1) : undefined, settings.useVision ? get().qa.screenshots.slice(-1) : undefined);
      } else if (!ok) {
        log("no agent available to fix compile errors");
        break;
      } else if (!diagText && !(report && report.fixes.length)) {
        log("nothing left to fix automatically");
        break;
      }
      get().clearLogs();
    }
    set((s) => ({ qa: { ...s.qa, running: false } }));
    log("QA loop finished");
  },
  stopQaLoop() {
    qaAbort = true;
  },
}));
