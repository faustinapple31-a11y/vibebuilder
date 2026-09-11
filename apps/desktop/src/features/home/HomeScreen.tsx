import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { CheckCircle2, Circle, Download, FolderOpen, Loader2, Plus, RefreshCw, Sparkles, Trash2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { STYLE_PRESET_LIST, WORLD_TEMPLATES, getWorldTemplate, type StylePresetId } from "@worldforge/core";
import { Button, Dialog, Input, Label, Select } from "@/components/ui";
import { cn, timeAgo } from "@/lib/utils";
import { useProjects } from "@/stores/projectStore";
import { useSettings } from "@/stores/settingsStore";
import { useWorld } from "@/stores/worldStore";
import { useAgents } from "@/stores/agentStore";

export function HomeScreen() {
  const projects = useProjects((s) => s.projects);
  const refresh = useProjects((s) => s.refresh);
  const openProject = useProjects((s) => s.open);
  const importFolder = useProjects((s) => s.importFolder);
  const remove = useProjects((s) => s.remove);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex h-full flex-col overflow-auto bg-bg">
      <header className="flex h-12 items-center gap-3 border-b border-line bg-bg-elev px-5">
        <div className="h-6 w-6 rounded-md bg-gradient-to-br from-brand to-brand-2" />
        <span className="text-sm font-semibold">WorldForge AI</span>
        <span className="text-xs text-muted">Describe your game. AI agents build a real Roblox project.</span>
      </header>
      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-[1fr_320px] gap-6 p-6">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Projects</h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={<FolderOpen size={13} />}
                onClick={async () => {
                  const dir = await openDialog({ directory: true, multiple: false, title: "Open an existing WorldForge / roblox-ts project" });
                  if (typeof dir === "string") await importFolder(dir);
                }}
              >
                Open folder
              </Button>
              <Button variant="brand" size="sm" icon={<Plus size={13} />} onClick={() => setCreating(true)}>
                New project
              </Button>
            </div>
          </div>
          {projects.length === 0 ? (
            <div className="panel flex flex-col items-center gap-3 p-10 text-center">
              <Sparkles className="text-brand" />
              <div className="text-sm font-medium">No project yet</div>
              <div className="max-w-md text-xs text-muted">Create a project, then describe your game to the swarm — e.g. “Crée un jeu Roblox dans une forêt mystérieuse avec un village abandonné.”</div>
              <Button variant="brand" size="md" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
                Create your first project
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              {projects.map((p) => (
                <div key={p.id} className="panel group flex flex-col overflow-hidden">
                  <button className="h-28 w-full bg-gradient-to-br from-[#5b6b8a] via-[#3e5a45] to-[#7b4f8f] opacity-90 transition-opacity group-hover:opacity-100" onClick={() => void openProject(p.id)} title="Open" />
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <div className="flex items-center justify-between">
                      <button className="truncate text-sm font-semibold hover:text-brand" onClick={() => void openProject(p.id)}>
                        {p.name}
                      </button>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium uppercase", p.status === "published" ? "bg-ok-soft text-ok" : p.status === "generated" ? "bg-brand-soft text-brand" : "bg-line text-muted")}>{p.status}</span>
                    </div>
                    <div className="text-[11px] text-muted">
                      {p.style_preset.replace(/_/g, " ")} · updated {timeAgo(p.updated_at)}
                    </div>
                    <div className="text-[11px] text-faint">
                      build {p.last_build_status ?? "–"} {p.last_build_at ? timeAgo(p.last_build_at) : ""} · publish {p.last_publish_at ? timeAgo(p.last_publish_at) : "never"}
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      <Button size="xs" variant="primary" onClick={() => void openProject(p.id)}>
                        Open
                      </Button>
                      <Button size="xs" variant="ghost" icon={<Trash2 size={11} />} onClick={() => confirm(`Remove "${p.name}" from the list? Files are kept on disk.`) && void remove(p.id, false)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <aside className="space-y-4">
          <Onboarding />
        </aside>
      </div>
      <NewProjectDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function Onboarding() {
  const tools = useSettings((s) => s.tools);
  const detecting = useSettings((s) => s.detecting);
  const detect = useSettings((s) => s.detectTools);
  const installTool = useSettings((s) => s.installTool);
  const installing = useSettings((s) => s.installing);
  const installLog = useSettings((s) => s.installLog);
  const missing = tools?.tools.filter((t) => !t.found && t.installable) ?? [];
  return (
    <div className="panel p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Environment</h3>
        <Button size="xs" variant="ghost" icon={detecting ? <Loader2 size={11} className="spin" /> : <RefreshCw size={11} />} onClick={() => void detect()}>
          Re-detect
        </Button>
      </div>
      {tools && (
        <div className="mb-2 text-[11px] text-muted">
          {tools.system.os} {tools.system.arch} · {tools.system.ram_gb} GB RAM · {tools.system.cpu_cores} cores · {tools.system.docker ? "Docker" : "no Docker"} · {tools.system.wsl ? "WSL2" : "no WSL"}
        </div>
      )}
      <ul className="space-y-1">
        {(tools?.tools ?? []).map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-xs">
            {t.found ? <CheckCircle2 size={14} className="text-ok" /> : t.installable ? <Circle size={14} className="text-faint" /> : <XCircle size={14} className="text-err/70" />}
            <span className={cn("flex-1", !t.found && "text-muted")}>{t.name}</span>
            <span className="max-w-[120px] truncate text-[10px] text-faint" title={t.path ?? t.install_hint}>
              {t.version ?? (t.found ? "" : t.install_hint)}
            </span>
            {!t.found && t.installable && (
              <Button size="xs" variant="outline" loading={installing[t.id] === "running"} icon={<Download size={10} />} onClick={() => void installTool(t.id)}>
                Install
              </Button>
            )}
          </li>
        ))}
      </ul>
      {missing.length > 0 && (
        <Button className="mt-3 w-full" size="sm" variant="brand" icon={<Download size={12} />} onClick={() => missing.forEach((t) => void installTool(t.id))}>
          Install missing ({missing.length})
        </Button>
      )}
      {installLog.length > 0 && <pre className="term mt-3 max-h-32 overflow-auto rounded-md p-2 text-[10px]">{installLog.slice(-12).join("\n")}</pre>}
    </div>
  );
}

function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useProjects((s) => s.create);
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<StylePresetId>("stylized_mystical");
  const [template, setTemplate] = useState<string>("moonlit_forest_village");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await create({ name: name.trim(), stylePreset: preset });
      if (template !== "none") {
        const spec = getWorldTemplate(template);
        const world = useWorld.getState();
        world.setSpec({ ...spec, name: name.trim(), stylePreset: preset });
        world.setStyle((await import("@worldforge/core")).getStylePreset(preset));
        void world.generate({ label: `template ${template}` });
      }
      useAgents.getState().setTab(template === "none" ? "swarm" : "world");
      onOpenChange(false);
      setName("");
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New project" description="Creates a real roblox-ts + Rojo project folder in your WorldForge Projects directory.">
      <div className="space-y-3">
        <div>
          <Label>Name</Label>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Moonlit Forest Village" onKeyDown={(e) => e.key === "Enter" && void submit()} />
        </div>
        <div>
          <Label>Art direction</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {STYLE_PRESET_LIST.map((p) => (
              <button key={p.id} onClick={() => setPreset(p.id)} className={cn("rounded-lg border px-2.5 py-2 text-left text-xs hover:bg-panel-2", preset === p.id ? "border-brand bg-brand-soft" : "border-line")}>
                <div className="font-medium">{p.name}</div>
                <div className="text-[10px] text-muted">{p.description}</div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label hint="generated immediately, editable later">Starting world</Label>
          <Select value={template} onChange={(e) => setTemplate(e.target.value)} className="w-full">
            <option value="none">Empty — let the swarm design it from my prompt</option>
            {WORLD_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.description}
              </option>
            ))}
          </Select>
        </div>
        {error && <div className="rounded-md bg-err-soft p-2 text-xs text-err">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="brand" loading={busy} onClick={() => void submit()} disabled={!name.trim()}>
            Create project
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
