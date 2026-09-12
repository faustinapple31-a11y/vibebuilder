import { Bell, Bot, Box, ChevronDown, Crown, FolderOpen, Grid2X2, Home, Layers, Library, Pause, Play, Plus, Search, Settings2, ShoppingBag, Sparkles, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { PROVIDER_META, type AgentProviderId } from "@worldforge/agents";
import { Button, Dropdown, IconButton, Pill, Tip } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useAgents, type WorkspaceTab } from "@/stores/agentStore";
import { useProjects } from "@/stores/projectStore";
import { useRoblox } from "@/stores/robloxStore";
import { useSettings } from "@/stores/settingsStore";
import { useWorld } from "@/stores/worldStore";
import { SwarmView } from "@/features/swarm/SwarmView";
import { VisualWorkshop } from "@/features/workshop/VisualWorkshop";
import { WorldView } from "@/features/world/WorldView";
import { AssetsView } from "@/features/assets/AssetsView";
import { RobloxView } from "@/features/roblox/RobloxView";
import { GameView } from "@/features/game/GameView";
import { ToolboxView } from "@/features/toolbox/ToolboxView";
import { SettingsView } from "@/features/settings/SettingsView";

const TABS: { id: WorkspaceTab; label: string; icon: React.ReactNode }[] = [
  { id: "swarm", label: "Swarm", icon: <Grid2X2 size={14} /> },
  { id: "workshop", label: "AI Workshop", icon: <Sparkles size={14} /> },
  { id: "world", label: "World", icon: <Box size={14} /> },
  { id: "assets", label: "Assets", icon: <Layers size={14} /> },
  { id: "game", label: "Game", icon: <ShoppingBag size={14} /> },
  { id: "toolbox", label: "Toolbox", icon: <Library size={14} /> },
  { id: "roblox", label: "Roblox", icon: <Play size={14} /> },
  { id: "settings", label: "Settings", icon: <Settings2 size={14} /> },
];

const AGENT_CHIPS: AgentProviderId[] = ["claude-code", "codex", "antigravity", "opencode", "gemini-cli"];

export function Workspace() {
  const current = useProjects((s) => s.current)!;
  const projects = useProjects((s) => s.projects);
  const openProject = useProjects((s) => s.open);
  const close = useProjects((s) => s.close);
  const tab = useAgents((s) => s.tab);
  const setTab = useAgents((s) => s.setTab);
  const addPane = useAgents((s) => s.addPane);
  const paused = useAgents((s) => s.paused);
  const planStatus = useAgents((s) => s.planStatus);
  const stopAll = useAgents((s) => s.stopAll);
  const providers = useSettings((s) => s.providers);
  const studio = useRoblox((s) => s.studio);
  const rojo = useRoblox((s) => s.rojo);
  const build = useRoblox((s) => s.build);
  const generating = useWorld((s) => s.generating);
  const bake = useWorld((s) => s.bake);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      void useRoblox.getState().refreshStudio();
    }, 8000);
    return () => clearInterval(t);
  }, []);
  void now;

  const pluginConnected = rojo.serving && rojo.connected;
  return (
    <div className="flex h-full flex-col bg-bg">
      {/* top bar */}
      <header className="flex h-11 items-center gap-2 border-b border-line bg-bg-elev px-3">
        <button className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-ink-2 hover:bg-line/60" onClick={close}>
          <Home size={14} /> <span className="text-[13px]">Home</span>
        </button>
        <span className="text-faint">›</span>
        <Dropdown
          trigger={
            <button className="flex items-center gap-1.5 rounded-md px-1.5 py-1 font-medium hover:bg-line/60">
              <FolderOpen size={14} className="text-muted" /> {current.meta.name} <ChevronDown size={12} className="text-muted" />
            </button>
          }
          items={[
            ...projects.slice(0, 8).map((p) => ({ label: p.name, checked: p.id === current.row.id, onSelect: () => void openProject(p.id) })),
            { separator: true, label: "" },
            { label: "All projects…", onSelect: close },
          ]}
        />
        <Tip content="Agents (Swarm)">
          <IconButton onClick={() => setTab("swarm")}>
            <Bot size={15} />
          </IconButton>
        </Tip>
        <Tip content="Publish to Roblox">
          <IconButton onClick={() => setTab("roblox")}>
            <Crown size={15} />
          </IconButton>
        </Tip>
        <div className="mx-auto flex items-center gap-4 text-xs text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className={cn("dot", pluginConnected ? "dot-ok" : rojo.serving ? "dot-warn" : "")} /> {pluginConnected ? "Plugin connected" : rojo.serving ? "Rojo serving — connect the plugin" : "Plugin not connected"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cn("dot", studio?.running ? "dot-ok" : studio?.found ? "" : "dot-err")} /> {studio?.running ? "Synced with Studio" : studio?.found ? "Studio detected" : "Studio not found"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cn("dot", build.step === "ok" ? "dot-ok" : build.step === "error" ? "dot-err" : build.step === "idle" ? "" : "dot-busy")} /> {build.step === "ok" ? "Build successful" : build.step === "error" ? "Build failed" : build.step === "idle" ? (build.rbxlPath ? "1 place open" : "Not built") : build.step + "…"}
          </span>
          {generating && (
            <span className="flex items-center gap-1.5 text-brand">
              <span className="dot dot-busy" /> Generating world
            </span>
          )}
        </div>
        <Button size="sm" variant="brand" icon={<Upload size={13} />} onClick={() => setTab("roblox")}>
          Publish
        </Button>
        <IconButton>
          <Search size={15} />
        </IconButton>
        <IconButton>
          <Bell size={15} />
        </IconButton>
        <div className="ml-1 h-7 w-7 rounded-full bg-gradient-to-br from-brand to-brand-2 text-center text-[11px] font-bold leading-7 text-white">WF</div>
      </header>

      {/* tabs row */}
      <div className="flex h-10 items-center gap-1 border-b border-line bg-bg px-2">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn("flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-ink-2 hover:bg-line/60", tab === t.id && "bg-panel font-medium text-ink shadow-sm border border-line")}>
            {t.icon} {t.label}
          </button>
        ))}
        <span className="mx-2 h-5 w-px bg-line" />
        <Pill dot={bake ? "ok" : "idle"} title="World version">
          {current.meta.worldVersion !== "v0.0" ? current.meta.worldVersion : "no world"}
        </Pill>
        <span className="mx-1 h-5 w-px bg-line" />
        {AGENT_CHIPS.map((id) => {
          const det = providers[id];
          const meta = PROVIDER_META[id];
          return (
            <Tip key={id} content={det?.installed ? `Add a ${meta.name} agent` : `${meta.name} not installed — ${meta.installHint}`}>
              <button
                onClick={() => {
                  addPane(id);
                  setTab("swarm");
                }}
                className={cn("flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors", det?.installed ? "border-line bg-panel hover:bg-panel-2" : "border-dashed border-line text-faint hover:text-ink-2")}
                style={det?.installed ? { color: meta.color } : undefined}
              >
                <Plus size={12} /> {meta.name}
              </button>
            </Tip>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          {planStatus === "running" && (
            <span className="flex items-center gap-1.5 text-xs text-brand">
              <span className="dot dot-busy" /> swarm running
            </span>
          )}
          <Button size="sm" variant="ghost" icon={paused ? <Play size={13} /> : <Pause size={13} />} onClick={() => (planStatus === "running" ? void stopAll() : useAgents.setState({ paused: !paused }))}>
            {planStatus === "running" ? "Stop" : paused ? "Resume" : "Pause"}
          </Button>
        </div>
      </div>

      {/* body */}
      <main className="min-h-0 flex-1 overflow-hidden">
        {tab === "swarm" && <SwarmView />}
        {tab === "workshop" && <VisualWorkshop />}
        {tab === "world" && <WorldView />}
        {tab === "assets" && <AssetsView />}
        {tab === "game" && <GameView />}
        {tab === "toolbox" && <ToolboxView />}
        {tab === "roblox" && <RobloxView />}
        {tab === "settings" && <SettingsView />}
      </main>
    </div>
  );
}
