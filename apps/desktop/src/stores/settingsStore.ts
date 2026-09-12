import { create } from "zustand";
import { PROVIDER_ORDER, type AgentDetection, type AgentProviderId, type PermissionMode } from "@worldforge/agents";
import { settingsRepo } from "@/lib/db";
import { getProviders, initProviders } from "@/lib/agents";
import { fs, proc, secrets, tools, type AppPaths, type SecretSource, type ToolsReport } from "@/lib/tauri";

export const SECRET_KEYS = {
  openCloud: "roblox_open_cloud_api_key",
  gemini: "gemini_image_api_key",
  meshy: "meshy_api_key",
  elevenlabs: "elevenlabs_api_key",
} as const;
export type SecretName = keyof typeof SECRET_KEYS;

export interface AgentDefaults {
  provider: AgentProviderId;
  models: Partial<Record<AgentProviderId, string>>;
  efforts: Partial<Record<AgentProviderId, string>>;
  permissionMode: PermissionMode;
  runtime: "host" | "docker" | "wsl";
  /** Number of agents the swarm creates by default. */
  swarmSize: number;
  concurrency: number;
  qa: { maxIterations: 3 | 5 | 10; autoFix: boolean; useVision: boolean; stopOnScore: number };
  onboardingDone: boolean;
}

const DEFAULTS: AgentDefaults = {
  provider: "claude-code",
  models: { "claude-code": "fable", codex: "", opencode: "", "gemini-cli": "" },
  efforts: { "claude-code": "high", codex: "high" },
  permissionMode: "acceptEdits",
  runtime: "host",
  swarmSize: 3,
  concurrency: 3,
  qa: { maxIterations: 3, autoFix: true, useVision: true, stopOnScore: 85 },
  onboardingDone: false,
};

interface SettingsState {
  ready: boolean;
  paths: AppPaths | null;
  tools: ToolsReport | null;
  detecting: boolean;
  providers: Partial<Record<AgentProviderId, AgentDetection>>;
  defaults: AgentDefaults;
  keys: Record<SecretName, boolean>;
  /** Where each configured key comes from (keyring vs .env / environment). */
  keySources: Record<SecretName, SecretSource>;
  installing: Record<string, "running" | "done" | "error">;
  installLog: string[];
  error: string | null;
  init: () => Promise<void>;
  detectTools: () => Promise<void>;
  detectProviders: () => Promise<void>;
  installTool: (id: string) => Promise<void>;
  setDefaults: (patch: Partial<AgentDefaults>) => Promise<void>;
  setKey: (name: SecretName, value: string) => Promise<void>;
  removeKey: (name: SecretName) => Promise<void>;
  refreshKeys: () => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  ready: false,
  paths: null,
  tools: null,
  detecting: false,
  providers: {},
  defaults: DEFAULTS,
  keys: { openCloud: false, gemini: false, meshy: false, elevenlabs: false },
  keySources: { openCloud: "none", gemini: "none", meshy: "none", elevenlabs: "none" },
  installing: {},
  installLog: [],
  error: null,

  async init() {
    try {
      const paths = await fs.appPaths();
      initProviders(paths.home);
      // kill child processes left behind by a previous webview session (dev reloads, crashes)
      try {
        for (const id of await proc.list()) if (/^(studio_mcp|rojo_serve|claude-code_|codex_|opencode_|gemini-cli_|npm_|rbxtsc_|rojo_build_)/.test(id)) await proc.kill(id);
      } catch {
        /* ignore */
      }
      const defaults = { ...DEFAULTS, ...(await settingsRepo.get<Partial<AgentDefaults>>("agentDefaults", {})) };
      set({ paths, defaults, ready: true });
      await Promise.all([get().detectTools(), get().refreshKeys()]);
      await get().detectProviders();
    } catch (e) {
      set({ error: (e as Error).message ?? String(e), ready: true });
    }
  },

  async detectTools() {
    set({ detecting: true });
    try {
      const report = await tools.detect();
      set({ tools: report });
    } catch (e) {
      set({ error: (e as Error).message ?? String(e) });
    } finally {
      set({ detecting: false });
    }
  },

  async detectProviders() {
    const map = getProviders();
    const results: Partial<Record<AgentProviderId, AgentDetection>> = {};
    await Promise.all(
      PROVIDER_ORDER.map(async (id) => {
        const p = map.get(id);
        if (!p) return;
        try {
          results[id] = await p.detect();
        } catch (e) {
          results[id] = { installed: false, probablyAuthenticated: false, authHint: (e as Error).message };
        }
      }),
    );
    set({ providers: results });
  },

  async installTool(id) {
    set((s) => ({ installing: { ...s.installing, [id]: "running" }, installLog: [...s.installLog, `▶ installing ${id}…`] }));
    try {
      const plan = await tools.installPlan(id);
      if (plan.kind === "download-rojo") {
        const p = await tools.installRojo();
        set((s) => ({ installLog: [...s.installLog, `✓ Rojo installed at ${p}`] }));
      } else if (plan.program) {
        const res = await proc.run(plan.program, plan.args, undefined, 600);
        const text = (res.stdout + "\n" + res.stderr).trim().split(/\r?\n/).slice(-6);
        set((s) => ({ installLog: [...s.installLog, ...text] }));
        if (res.code !== 0) throw new Error(`npm exited with ${res.code}`);
      }
      set((s) => ({ installing: { ...s.installing, [id]: "done" } }));
      await get().detectTools();
      await get().detectProviders();
    } catch (e) {
      set((s) => ({ installing: { ...s.installing, [id]: "error" }, installLog: [...s.installLog, `✗ ${id}: ${(e as Error).message ?? e}`] }));
    }
  },

  async setDefaults(patch) {
    const defaults = { ...get().defaults, ...patch, models: { ...get().defaults.models, ...(patch.models ?? {}) }, efforts: { ...get().defaults.efforts, ...(patch.efforts ?? {}) }, qa: { ...get().defaults.qa, ...(patch.qa ?? {}) } };
    set({ defaults });
    await settingsRepo.set("agentDefaults", defaults);
  },

  async setKey(name, value) {
    await secrets.set(SECRET_KEYS[name], value.trim());
    await get().refreshKeys();
  },
  async removeKey(name) {
    await secrets.delete(SECRET_KEYS[name]);
    await get().refreshKeys();
  },
  async refreshKeys() {
    const entries = await Promise.all((Object.keys(SECRET_KEYS) as SecretName[]).map(async (n) => [n, await secrets.source(SECRET_KEYS[n]).catch((): SecretSource => "none")] as const));
    set({
      keys: Object.fromEntries(entries.map(([n, s]) => [n, s !== "none"])) as Record<SecretName, boolean>,
      keySources: Object.fromEntries(entries) as Record<SecretName, SecretSource>,
    });
  },
}));

export function toolById(report: ToolsReport | null, id: string) {
  return report?.tools.find((t) => t.id === id) ?? null;
}
