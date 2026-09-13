import { CheckCircle2, Circle, Download, KeyRound, RefreshCw, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { CLAUDE_EFFORTS, CLAUDE_MODELS, CODEX_EFFORTS, CODEX_MODELS, GEMINI_MODELS, OPENCODE_MODELS, PROVIDER_META, PROVIDER_ORDER, type AgentProviderId, type PermissionMode } from "@worldforge/agents";
import { Button, Input, Label, Select, Switch } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useProjects } from "@/stores/projectStore";
import { useSettings, type SecretName } from "@/stores/settingsStore";

const MODELS: Partial<Record<AgentProviderId, { id: string; label: string }[]>> = { "claude-code": CLAUDE_MODELS, codex: CODEX_MODELS, opencode: OPENCODE_MODELS, "gemini-cli": GEMINI_MODELS };
const EFFORTS: Partial<Record<AgentProviderId, string[]>> = { "claude-code": CLAUDE_EFFORTS, codex: CODEX_EFFORTS };
const TOOL_BY_PROVIDER: Partial<Record<AgentProviderId, string>> = { "claude-code": "claude", codex: "codex", opencode: "opencode", "gemini-cli": "gemini", antigravity: "antigravity" };

export function SettingsView() {
  const s = useSettings();
  const project = useProjects((st) => st.current);
  const updateMeta = useProjects((st) => st.updateMeta);
  return (
    <div className="grid h-full grid-cols-2 gap-3 overflow-auto p-3">
      <section className="panel space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Agents</h3>
          <Button size="xs" variant="ghost" icon={<RefreshCw size={11} />} onClick={() => void s.detectProviders().then(() => s.detectTools())}>
            Re-detect
          </Button>
        </div>
        <p className="text-xs text-muted">WorldForge drives the official CLIs with your own accounts. Credentials stay in each tool; nothing is sent to a WorldForge server.</p>
        <div className="space-y-2">
          {PROVIDER_ORDER.map((id) => {
            const det = s.providers[id];
            const meta = PROVIDER_META[id];
            const models = MODELS[id];
            const efforts = EFFORTS[id];
            const toolId = TOOL_BY_PROVIDER[id];
            const tool = toolId ? s.tools?.tools.find((t) => t.id === toolId) : null;
            return (
              <div key={id} className={cn("rounded-lg border border-line p-2.5", s.defaults.provider === id && "border-brand/40 bg-brand-soft/30")}>
                <div className="flex items-center gap-2">
                  {det?.installed ? <CheckCircle2 size={14} className="text-ok" /> : id === "local-rules" ? <CheckCircle2 size={14} className="text-ok" /> : <XCircle size={14} className="text-faint" />}
                  <span className="text-sm font-semibold" style={{ color: meta.color }}>
                    {meta.name}
                  </span>
                  <span className="text-[11px] text-muted">{det?.version ?? (det?.installed ? "" : id === "local-rules" ? "built-in, offline" : meta.installHint)}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {det?.installed && id !== "local-rules" && id !== "antigravity" && <span className={cn("text-[11px]", det.probablyAuthenticated ? "text-ok" : "text-warn")}>{det.probablyAuthenticated ? "logged in" : `not logged in? run: ${det.authHint}`}</span>}
                    {!det?.installed && tool?.installable && (
                      <Button size="xs" variant="outline" icon={<Download size={10} />} loading={s.installing[tool.id] === "running"} onClick={() => void s.installTool(tool.id)}>
                        Install
                      </Button>
                    )}
                    <label className="flex items-center gap-1 text-[11px] text-muted">
                      default
                      <input type="radio" checked={s.defaults.provider === id} onChange={() => void s.setDefaults({ provider: id })} />
                    </label>
                  </span>
                </div>
                {(models || efforts) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    {models && (
                      <label className="flex items-center gap-1">
                        model
                        <input list={`settings-models-${id}`} className="h-6 w-40 rounded border border-line bg-panel px-1.5 text-xs outline-none focus:border-brand" value={s.defaults.models[id] ?? ""} placeholder="default" onChange={(e) => void s.setDefaults({ models: { [id]: e.target.value } })} />
                        <datalist id={`settings-models-${id}`}>
                          {models.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </datalist>
                      </label>
                    )}
                    {efforts && (
                      <label className="flex items-center gap-1">
                        effort
                        <Select value={s.defaults.efforts[id] ?? ""} onChange={(e) => void s.setDefaults({ efforts: { [id]: e.target.value } })}>
                          <option value="">default</option>
                          {efforts.map((e) => (
                            <option key={e} value={e}>
                              {e}
                            </option>
                          ))}
                        </Select>
                      </label>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div>
            <Label>Permission mode</Label>
            <Select value={s.defaults.permissionMode} onChange={(e) => void s.setDefaults({ permissionMode: e.target.value as PermissionMode })} className="w-full">
              <option value="acceptEdits">Accept edits (recommended)</option>
              <option value="safe">Safe — ask before actions</option>
              <option value="bypass">Bypass permissions (isolated projects only)</option>
            </Select>
          </div>
          <div>
            <Label>Agent runtime</Label>
            <Select value={s.defaults.runtime} onChange={(e) => void s.setDefaults({ runtime: e.target.value as "host" | "docker" | "wsl" })} className="w-full">
              <option value="host">Host (project folder sandbox)</option>
              <option value="docker" disabled={!s.tools?.system.docker}>
                Docker container {s.tools?.system.docker ? "" : "(not detected)"}
              </option>
              <option value="wsl" disabled={!s.tools?.system.wsl}>
                WSL2 {s.tools?.system.wsl ? "" : "(not detected)"}
              </option>
            </Select>
          </div>
          <div>
            <Label>Default swarm size</Label>
            <Select value={String(s.defaults.swarmSize)} onChange={(e) => void s.setDefaults({ swarmSize: Number(e.target.value), concurrency: Number(e.target.value) })} className="w-full">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} agent{n > 1 ? "s" : ""} in parallel
                </option>
              ))}
            </Select>
          </div>
        </div>
      </section>

      <div className="space-y-3">
        <section className="panel space-y-3 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound size={14} /> Keys (OS secure storage)
          </h3>
          <p className="text-xs text-muted">Stored in the Windows Credential Manager / macOS Keychain. Never written to project files or logs. Open Cloud requests are signed by the Rust backend; the key never reaches the UI.</p>
          <KeyField name="openCloud" label="Roblox Open Cloud API key" hint="create.roblox.com → Credentials · scopes: universe-places:write, universe:read" />
          <KeyField name="gemini" label="Gemini API key (image generation)" hint="optional — image provider" />
          <KeyField name="meshy" label="Meshy API key (3D generation)" hint="optional — mesh provider" />
          <KeyField name="elevenlabs" label="ElevenLabs API key (audio)" hint="optional — audio provider" />
        </section>
        <section className="panel space-y-3 p-4">
          <h3 className="text-sm font-semibold">QA loop</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <label className="flex items-center justify-between">
              Max iterations
              <Select value={String(project?.meta.qa.maxIterations ?? s.defaults.qa.maxIterations)} onChange={(e) => project && void updateMeta({ qa: { ...project.meta.qa, maxIterations: Number(e.target.value) as 3 | 5 | 10 } })}>
                {[3, 5, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex items-center justify-between">
              Stop at score
              <Input className="w-16" value={String(project?.meta.qa.stopOnScore ?? 85)} onChange={(e) => project && void updateMeta({ qa: { ...project.meta.qa, stopOnScore: Number(e.target.value) || 85 } })} />
            </label>
            <label className="flex items-center justify-between">
              Auto-fix world problems <Switch checked={project?.meta.qa.autoFix ?? true} onChange={(v) => project && void updateMeta({ qa: { ...project.meta.qa, autoFix: v } })} />
            </label>
            <label className="flex items-center justify-between">
              Vision critic (screenshots) <Switch checked={project?.meta.qa.useVision ?? true} onChange={(v) => project && void updateMeta({ qa: { ...project.meta.qa, useVision: v } })} />
            </label>
          </div>
        </section>
        <section className="panel p-4">
          <h3 className="mb-2 text-sm font-semibold">Environment</h3>
          <ul className="space-y-1 text-xs">
            {(s.tools?.tools ?? []).map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                {t.found ? <CheckCircle2 size={13} className="text-ok" /> : <Circle size={13} className="text-faint" />}
                <span className={cn(!t.found && "text-muted")}>{t.name}</span>
                <span className="ml-auto truncate text-[11px] text-faint" title={t.path ?? ""}>
                  {t.version ?? t.install_hint}
                </span>
                {!t.found && t.installable && (
                  <Button size="xs" variant="outline" loading={s.installing[t.id] === "running"} onClick={() => void s.installTool(t.id)}>
                    Install
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {s.paths && (
            <div className="mt-2 text-[11px] text-faint">
              Projects: {s.paths.projects_dir} · Tools: {s.paths.tools_dir}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function KeyField({ name, label, hint }: { name: SecretName; label: string; hint: string }) {
  const has = useSettings((s) => s.keys[name]);
  const setKey = useSettings((s) => s.setKey);
  const removeKey = useSettings((s) => s.removeKey);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <Label hint={hint}>{label}</Label>
      <div className="mt-1 flex items-center gap-1.5">
        <span className={cn("dot", has ? "dot-ok" : "")} />
        <Input type="password" placeholder={has ? "•••••••• (stored)" : "paste key"} value={value} onChange={(e) => setValue(e.target.value)} />
        <Button
          size="sm"
          variant="outline"
          loading={busy}
          disabled={!value.trim()}
          onClick={async () => {
            setBusy(true);
            await setKey(name, value);
            setValue("");
            setBusy(false);
          }}
        >
          Save
        </Button>
        {has && (
          <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => void removeKey(name)} />
        )}
      </div>
    </div>
  );
}
