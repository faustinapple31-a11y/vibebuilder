import { create } from "zustand";
import { newId, slugify } from "@worldforge/core";
import { OpenCloudClient, OpenCloudError, type CloudTransport, type PlaceInfo, type UniverseInfo } from "@worldforge/roblox-cloud";
import { parseRbxtscOutput, parseStudioLog, validateBakeForPublish, type DiagnosticEntry, type PublishCheck } from "@worldforge/quality";
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
let rojoPoll: ReturnType<typeof setInterval> | null = null;
let qaAbort = false;
const runner = createTauriProcessRunner();

const transport: CloudTransport = async (req) => {
  const res = await opencloud.request({ method: req.method, url: req.url, json_body: req.jsonBody !== undefined ? JSON.stringify(req.jsonBody) : undefined, body_file: req.bodyFile, content_type: req.contentType, headers: req.headers });
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

  async refreshStudio() {
    try {
      set({ studio: await studioApi.info() });
    } catch {
      /* ignore */
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
    set((s) => ({ build: { ...s.build, step: "compiling", log: [...s.build.log, "$ rbxtsc"], diagnostics: [] } }));
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
      log(`build ${ok ? "ok" : `failed (${diags.length} errors)`}, world score ${report?.score ?? "–"}, runtime errors ${runtimeErrors.length}`);
      if (ok && get().studio?.running) {
        const shot = settings.useVision ? await get().captureStudio() : null;
        if (shot) log(`screenshot: ${shot}`);
      }
      const problems = report?.problems ?? [];
      const nothingToFix = ok && runtimeErrors.length === 0 && (report?.score ?? 0) >= settings.stopOnScore;
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
      const diagText = [...diags.map((d) => `${d.file ?? ""}:${d.line ?? ""} ${d.code ?? ""} ${d.message}`), ...runtimeErrors.map((e) => `[studio] ${e.message}`)].join("\n");
      if (diagText || (problems.length && settings.useVision && get().qa.screenshots.length)) {
        log(`dispatching QA agent (${diags.length} compile, ${runtimeErrors.length} runtime)`);
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
