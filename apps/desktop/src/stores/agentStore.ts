import { create } from "zustand";
import { WorldSpecSchema, newId, type WorldSpec } from "@worldforge/core";
import {
  Orchestrator,
  PROVIDER_META,
  ROLES,
  planModify,
  planNewGame,
  planQA,
  planWorldOnly,
  roleSystemPrompt,
  summarizeToolInput,
  type AgentEvent,
  type AgentProviderId,
  type AgentRole,
  type AgentSession,
  type AgentUsage,
  type PermissionMode,
  type Plan,
  type TaskState,
} from "@worldforge/agents";
import { historyRepo, runsRepo } from "@/lib/db";
import { getProvider } from "@/lib/agents";
import { tauriFiles, readJsonFile } from "@/lib/files";
import { path } from "@/lib/tauri";
import { useProjects } from "./projectStore";
import { useSettings } from "./settingsStore";
import { useWorld } from "./worldStore";

export interface LogEntry {
  id: string;
  kind: "user" | "text" | "thinking" | "tool" | "tool_result" | "status" | "error" | "result" | "system";
  text: string;
  ts: number;
  partial?: boolean;
  tool?: string;
  isError?: boolean;
}

export type PaneStatus = "idle" | "running" | "done" | "error" | "external";

export interface Pane {
  id: string;
  index: number;
  providerId: AgentProviderId;
  model: string;
  effort: string;
  permissionMode: PermissionMode;
  role: AgentRole;
  title: string;
  status: PaneStatus;
  statusText: string;
  session: AgentSession | null;
  log: LogEntry[];
  input: string;
  usage: AgentUsage;
  taskId?: string;
  startedAt?: number;
  runId?: string;
}

export type WorkspaceTab = "swarm" | "workshop" | "world" | "assets" | "game" | "toolbox" | "roblox" | "settings";

interface AgentState {
  panes: Pane[];
  paused: boolean;
  plan: Plan | null;
  planStatus: "idle" | "running" | "done" | "failed" | "cancelled";
  activity: string[];
  composer: string;
  tab: WorkspaceTab;
  setTab: (t: WorkspaceTab) => void;
  setComposer: (v: string) => void;
  addPane: (providerId: AgentProviderId, role?: AgentRole) => Pane;
  removePane: (id: string) => void;
  updatePane: (id: string, patch: Partial<Pane>) => void;
  clearPane: (id: string) => void;
  send: (paneId: string, text: string) => Promise<void>;
  stop: (paneId: string) => Promise<void>;
  stopAll: () => Promise<void>;
  ensurePanes: (count?: number) => void;
  runSwarm: (userPrompt: string, kind: "new-game" | "world-only" | "modify", roles?: AgentRole[]) => Promise<void>;
  runQa: (diagnostics: string, critique?: string, screenshots?: string[]) => Promise<void>;
  cancelPlan: () => void;
  resetForProject: () => void;
}

let orchestrator: Orchestrator | null = null;
const entry = (kind: LogEntry["kind"], text: string, extra: Partial<LogEntry> = {}): LogEntry => ({ id: newId("log", 8), kind, text, ts: Date.now(), ...extra });

function appendEvent(pane: Pane, ev: AgentEvent): Pane {
  const log = pane.log.slice();
  const last = log[log.length - 1];
  switch (ev.type) {
    case "text": {
      if (ev.partial) {
        if (last && last.kind === "text" && last.partial) log[log.length - 1] = { ...last, text: last.text + ev.text };
        else log.push(entry("text", ev.text, { partial: true }));
      } else if (last && last.kind === "text" && last.partial) log[log.length - 1] = { ...last, text: ev.text, partial: false };
      else if (!(last && last.kind === "text" && last.text === ev.text)) log.push(entry("text", ev.text));
      return { ...pane, log };
    }
    case "thinking":
      if (last && last.kind === "thinking") log[log.length - 1] = { ...last, text: (last.text + ev.text).slice(-1200) };
      else log.push(entry("thinking", ev.text.slice(-1200)));
      return { ...pane, log };
    case "tool_use":
      log.push(entry("tool", `${ev.name}(${summarizeToolInput(ev.input)})`, { tool: ev.name }));
      return { ...pane, log, statusText: `${ev.name}…` };
    case "tool_result":
      if (ev.isError) log.push(entry("tool_result", ev.output.slice(0, 400), { isError: true }));
      return { ...pane, log };
    case "status":
      log.push(entry("status", ev.text));
      return { ...pane, log };
    case "error":
      log.push(entry("error", ev.message));
      return { ...pane, log, status: "error", statusText: "Error" };
    case "usage":
      return { ...pane, usage: { ...pane.usage, ...ev.usage } };
    case "session":
      return ev.model ? { ...pane, statusText: `${ev.model}` } : pane;
    case "done":
      if (ev.result && !(last && last.kind === "text" && last.text.trim() === ev.result.trim())) log.push(entry("result", ev.result));
      for (let i = log.length - 1; i >= 0; i--) if (log[i]!.partial) log[i] = { ...log[i]!, partial: false };
      return { ...pane, log };
    default:
      return pane;
  }
}

function defaultsFor(providerId: AgentProviderId) {
  const d = useSettings.getState().defaults;
  return { model: d.models[providerId] ?? "", effort: d.efforts[providerId] ?? "", permissionMode: d.permissionMode };
}

export const useAgents = create<AgentState>((set, get) => ({
  panes: [],
  paused: false,
  plan: null,
  planStatus: "idle",
  activity: [],
  composer: "",
  tab: "swarm",
  setTab: (tab) => set({ tab }),
  setComposer: (composer) => set({ composer }),

  addPane(providerId, role = "chat") {
    const d = defaultsFor(providerId);
    const index = get().panes.length + 1;
    const pane: Pane = {
      id: newId("pane", 8),
      index,
      providerId,
      model: d.model,
      effort: d.effort,
      permissionMode: d.permissionMode,
      role,
      title: role === "chat" ? "" : ROLES[role].title,
      status: "idle",
      statusText: "Ready",
      session: null,
      log: [],
      input: "",
      usage: {},
    };
    set((s) => ({ panes: [...s.panes, pane] }));
    return pane;
  },
  removePane(id) {
    const pane = get().panes.find((p) => p.id === id);
    if (pane?.session && pane.status === "running") void getProvider(pane.providerId).stop(pane.session);
    set((s) => ({ panes: s.panes.filter((p) => p.id !== id).map((p, i) => ({ ...p, index: i + 1 })) }));
  },
  updatePane(id, patch) {
    set((s) => ({ panes: s.panes.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  },
  clearPane(id) {
    get().updatePane(id, { log: [], usage: {}, status: "idle", statusText: "Ready", session: null });
  },

  ensurePanes(count) {
    const d = useSettings.getState().defaults;
    const n = count ?? d.swarmSize;
    const detected = useSettings.getState().providers;
    const preferred: AgentProviderId = detected[d.provider]?.installed ? d.provider : (["claude-code", "codex", "opencode", "gemini-cli"] as AgentProviderId[]).find((p) => detected[p]?.installed) ?? "local-rules";
    while (get().panes.length < n) get().addPane(preferred);
  },

  async send(paneId, text) {
    const pane = get().panes.find((p) => p.id === paneId);
    const cur = useProjects.getState().current;
    if (!pane || !cur || !text.trim()) return;
    const provider = getProvider(pane.providerId);
    const detection = useSettings.getState().providers[pane.providerId];
    if (detection && !detection.installed) {
      get().updatePane(paneId, { log: [...pane.log, entry("error", `${PROVIDER_META[pane.providerId].name} is not installed. Install it from Settings or pick another agent.`)] });
      return;
    }
    let session = pane.session;
    if (!session || session.provider !== pane.providerId) {
      session = await provider.startSession({ cwd: cur.path, model: pane.model || undefined, effort: pane.effort || undefined, permissionMode: pane.permissionMode, role: pane.role, systemPrompt: roleSystemPrompt(pane.role), allowedTools: pane.permissionMode === "bypass" ? undefined : ROLES[pane.role].allowedTools });
    } else {
      session.options.model = pane.model || undefined;
      session.options.effort = pane.effort || undefined;
      session.options.permissionMode = pane.permissionMode;
      session.options.role = pane.role;
      session.options.systemPrompt = roleSystemPrompt(pane.role);
    }
    const runId = await runsRepo.startAgent({ projectId: cur.row.id, provider: pane.providerId, role: pane.role, model: pane.model || null, prompt: text });
    const histId = await historyRepo.add(cur.row.id, pane.role, pane.providerId, text);
    get().updatePane(paneId, { session, status: "running", statusText: ROLES[pane.role].activity, startedAt: Date.now(), runId, input: "", log: [...pane.log, entry("user", text)] });
    const specPath = path.join(cur.path, "worlds", cur.meta.currentWorld, "world.spec.json");
    const before = JSON.stringify(await readJsonFile<unknown>(specPath));
    let result: string | undefined;
    let failed = false;
    try {
      for await (const ev of provider.sendPrompt(session, text)) {
        if (ev.type === "raw") continue;
        if (ev.type === "done") result = ev.result;
        set((s) => ({ panes: s.panes.map((p) => (p.id === paneId ? appendEvent(p, ev) : p)) }));
      }
    } catch (e) {
      failed = true;
      set((s) => ({ panes: s.panes.map((p) => (p.id === paneId ? { ...p, log: [...p.log, entry("error", (e as Error).message ?? String(e))] } : p)) }));
    }
    const after = get().panes.find((p) => p.id === paneId);
    const status: PaneStatus = failed || after?.status === "error" ? "error" : pane.providerId === "antigravity" ? "external" : "done";
    get().updatePane(paneId, { status, statusText: status === "error" ? "Error" : status === "external" ? "Opened in Antigravity" : "Ready" });
    await runsRepo.endAgent(runId, status, after?.usage ?? {}, result ?? null);
    if (result) await historyRepo.setSummary(histId, result);
    // world changes made by the agent → validate, retry once with the errors, then regenerate
    let afterSpec = JSON.stringify(await readJsonFile<unknown>(specPath));
    if (afterSpec !== before && afterSpec !== "null") {
      let parsed = WorldSpecSchema.safeParse(JSON.parse(afterSpec));
      if (!parsed.success && !failed && pane.providerId !== "local-rules" && pane.providerId !== "antigravity") {
        const errors = parsed.error.issues.slice(0, 15).map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
        set((s) => ({ panes: s.panes.map((p) => (p.id === paneId ? { ...p, status: "running", statusText: "Fixing invalid WorldSpec…", log: [...p.log, entry("status", `world.spec.json is invalid — asking the agent to fix it:\n${errors}`)] } : p)) }));
        try {
          for await (const ev of provider.sendPrompt(session, `Your last edit left worlds/${cur.meta.currentWorld}/world.spec.json INVALID against the OUTPUT CONTRACT schema:\n${errors}\nFix only these fields (use exact enum values) and keep everything else.`)) {
            if (ev.type === "raw") continue;
            set((s) => ({ panes: s.panes.map((p) => (p.id === paneId ? appendEvent(p, ev) : p)) }));
          }
        } catch (e) {
          set((s) => ({ panes: s.panes.map((p) => (p.id === paneId ? { ...p, log: [...p.log, entry("error", (e as Error).message ?? String(e))] } : p)) }));
        }
        get().updatePane(paneId, { status: "done", statusText: "Ready" });
        afterSpec = JSON.stringify(await readJsonFile<unknown>(specPath));
        parsed = WorldSpecSchema.safeParse(JSON.parse(afterSpec));
      }
      if (!parsed.success) {
        const errors = parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        set((s) => ({ panes: s.panes.map((p) => (p.id === paneId ? { ...p, log: [...p.log, entry("error", `world.spec.json still invalid, world not regenerated: ${errors}`)] } : p)) }));
      }
      if (parsed.success) {
        const world = useWorld.getState();
        world.setSpec(parsed.data);
        let layers: import("@worldforge/world-gen").GenLayer[] | undefined;
        let newSeed = false;
        try {
          const meta = result ? (JSON.parse(result) as { regenerate?: import("@worldforge/world-gen").GenLayer[]; newSeed?: boolean }) : null;
          if (meta?.regenerate) layers = meta.regenerate;
          if (meta?.newSeed) newSeed = true;
        } catch {
          /* free-form result */
        }
        set((s) => ({ activity: [...s.activity, `World spec changed by ${PROVIDER_META[pane.providerId].name} → regenerating ${layers ? layers.join(", ") : "world"}`] }));
        await world.generate({ layers, newSeed, label: `agent: ${text.slice(0, 40)}` });
      }
    }
  },

  async stop(paneId) {
    const pane = get().panes.find((p) => p.id === paneId);
    if (pane?.session) await getProvider(pane.providerId).stop(pane.session);
    get().updatePane(paneId, { status: "idle", statusText: "Stopped" });
  },
  async stopAll() {
    orchestrator?.cancel();
    for (const p of get().panes) if (p.status === "running") await get().stop(p.id);
  },

  async runSwarm(userPrompt, kind, roles) {
    const cur = useProjects.getState().current;
    if (!cur) return;
    if (get().planStatus === "running") return;
    const plan = kind === "new-game" ? planNewGame(userPrompt, roles) : kind === "world-only" ? planWorldOnly(userPrompt) : planModify(userPrompt, roles ?? ["world"]);
    await runPlan(plan, userPrompt);
  },

  async runQa(diagnostics, critique, screenshots) {
    const plan = planQA("Fix the reported problems", diagnostics, critique, screenshots);
    await runPlan(plan, "QA loop");
  },

  cancelPlan() {
    orchestrator?.cancel();
    set({ planStatus: "cancelled" });
  },

  resetForProject() {
    orchestrator?.cancel();
    set({ panes: [], plan: null, planStatus: "idle", activity: [], composer: "" });
  },
}));

async function runPlan(plan: Plan, userPrompt: string): Promise<void> {
  const cur = useProjects.getState().current!;
  const store = useAgents;
  const settings = useSettings.getState();
  store.getState().ensurePanes();
  store.setState({ plan, planStatus: "running", activity: [...store.getState().activity, `Plan ${plan.kind}: ${plan.tasks.map((t) => t.role).join(" → ")}`] });
  const histId = await historyRepo.add(cur.row.id, plan.kind, "swarm", userPrompt);

  const paneFor = async (task: TaskState): Promise<Pane> => {
    // wait for an idle pane (prefer matching role / free ones), create if allowed. The pane is reserved
    // synchronously (status running + taskId) so two parallel tasks can never share it while their sessions start.
    for (;;) {
      const panes = store.getState().panes;
      const idle = panes.filter((p) => p.status !== "running");
      const match = idle.find((p) => p.role === task.role) ?? idle.find((p) => p.role === "chat") ?? idle[0] ?? (panes.length < 8 ? store.getState().addPane(settings.defaults.provider) : undefined);
      if (match) {
        store.getState().updatePane(match.id, { status: "running", statusText: "Starting…", taskId: task.id, title: task.title, role: task.role });
        return store.getState().panes.find((p) => p.id === match.id) ?? match;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  };

  orchestrator = new Orchestrator({
    files: tauriFiles,
    projectDir: cur.path,
    projectName: cur.meta.name,
    history: async () => (await historyRepo.list(cur.row.id, 8)).reverse().map((h) => ({ prompt: h.prompt, summary: h.response_summary ?? undefined })),
    bakeCheck: async (spec: WorldSpec) => {
      const { generateWorld } = await import("@worldforge/world-gen");
      const { getStylePreset } = await import("@worldforge/core");
      generateWorld({ ...spec, size: { width: 512, depth: 512 } }, getStylePreset(spec.stylePreset));
    },
    acquireSession: async (task) => {
      const pane = await paneFor(task);
      let providerId = pane.providerId;
      const det = useSettings.getState().providers[providerId];
      if (det && !det.installed) {
        store.getState().updatePane(pane.id, { log: [...pane.log, entry("status", `${PROVIDER_META[providerId].name} not installed → using the local rule-based interpreter for this task`)] });
        providerId = "local-rules";
      }
      const provider = getProvider(providerId);
      let session: AgentSession;
      try {
        session = await provider.startSession({ cwd: cur.path, model: pane.model || undefined, effort: pane.effort || undefined, permissionMode: pane.permissionMode, role: task.role, systemPrompt: ROLES[task.role].systemPrompt, allowedTools: pane.permissionMode === "bypass" ? undefined : ROLES[task.role].allowedTools });
      } catch (err) {
        // release the reserved pane so the next task can use it
        store.getState().updatePane(pane.id, { status: "error", statusText: `Failed to start: ${String(err)}`.slice(0, 80), taskId: undefined });
        throw err;
      }
      const runId = await runsRepo.startAgent({ projectId: cur.row.id, provider: providerId, role: task.role, model: pane.model || null, prompt: `[${plan.kind}] ${userPrompt}` });
      store.getState().updatePane(pane.id, { role: task.role, title: task.title, status: "running", statusText: ROLES[task.role].activity, session, taskId: task.id, startedAt: Date.now(), runId, log: [...pane.log, entry("user", `${task.title}: ${userPrompt}`)] });
      return { provider, session };
    },
    releaseSession: (task, _session) => {
      const pane = store.getState().panes.find((p) => p.taskId === task.id);
      if (pane?.runId) void runsRepo.endAgent(pane.runId, task.status, pane.usage, task.result ?? null);
    },
    onEvent: (e) => {
      if (e.type === "agent") {
        if (e.event.type === "raw") return;
        store.setState((s) => ({ panes: s.panes.map((p) => (p.taskId === e.taskId ? appendEvent(p, e.event) : p)) }));
      } else if (e.type === "task") {
        const t = e.task;
        store.setState((s) => ({
          plan: s.plan ? { ...s.plan, tasks: s.plan.tasks.map((x) => (x.id === t.id ? { ...t } : x)) } : s.plan,
          panes: s.panes.map((p) => (p.taskId === t.id ? { ...p, status: t.status === "running" ? "running" : t.status === "validating" ? "running" : t.status === "done" ? "done" : t.status === "pending" ? p.status : "error", statusText: t.status === "validating" ? "Validating output…" : t.status === "done" ? "Done" : t.status === "failed" ? `Failed: ${t.error ?? ""}`.slice(0, 80) : t.status === "running" ? ROLES[t.role].activity : p.statusText } : p)),
          activity: [...s.activity, `${ROLES[t.role].title}: ${t.status}${t.error ? ` (${t.error.slice(0, 80)})` : ""}`],
        }));
        if (t.status === "done") void afterTask(t);
      } else if (e.type === "log") {
        store.setState((s) => ({ activity: [...s.activity, e.message] }));
      } else if (e.type === "plan") {
        store.setState({ planStatus: e.status === "started" ? "running" : e.status });
      }
    },
  });
  const done = await orchestrator.run(plan, { concurrency: settings.defaults.concurrency });
  const summary = done.tasks.map((t) => `${t.role}: ${t.status}`).join(", ");
  await historyRepo.setSummary(histId, summary);
  store.setState((s) => ({ panes: s.panes.map((p) => (p.status === "running" ? { ...p, status: "idle", statusText: "Ready" } : p)) }));
}

async function afterTask(task: TaskState): Promise<void> {
  if (task.role === "world") {
    const world = useWorld.getState();
    await world.loadForProject();
    await world.generate({ label: "swarm: world" });
  }
  if (task.role === "gameplay" || task.role === "ui" || task.role === "integration" || task.role === "qa") {
    const { useRoblox } = await import("./robloxStore");
    void useRoblox.getState().compile();
  }
}
