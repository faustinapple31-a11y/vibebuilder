import { Bot, Globe2, MonitorPlay, Send, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PROVIDER_META, ROLES, type AgentRole } from "@worldforge/agents";
import { Button, Empty, Pill, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import { useAgents } from "@/stores/agentStore";
import { useProjects } from "@/stores/projectStore";
import { useRoblox } from "@/stores/robloxStore";
import { useSettings } from "@/stores/settingsStore";
import { useWorld } from "@/stores/worldStore";
import { WorldViewer } from "@/features/viewer/WorldViewer";
import { AgentPane } from "./AgentPane";

const ROLE_SETS: { id: string; label: string; roles: AgentRole[] }[] = [
  { id: "full", label: "Full game (design → world → gameplay → UI → audio → integration)", roles: ["design", "world", "asset", "gameplay", "ui", "audio", "integration"] },
  { id: "core", label: "Design + world + gameplay + UI", roles: ["design", "world", "gameplay", "ui"] },
  { id: "world", label: "World only", roles: ["world"] },
  { id: "design", label: "Design only", roles: ["design"] },
];

export function SwarmView() {
  const panes = useAgents((s) => s.panes);
  const ensurePanes = useAgents((s) => s.ensurePanes);
  const composer = useAgents((s) => s.composer);
  const setComposer = useAgents((s) => s.setComposer);
  const runSwarm = useAgents((s) => s.runSwarm);
  const planStatus = useAgents((s) => s.planStatus);
  const plan = useAgents((s) => s.plan);
  const activity = useAgents((s) => s.activity);
  const send = useAgents((s) => s.send);
  const defaults = useSettings((s) => s.defaults);
  const setDefaults = useSettings((s) => s.setDefaults);
  const project = useProjects((s) => s.current)!;
  const bake = useWorld((s) => s.bake);
  const spec = useWorld((s) => s.spec);
  const generating = useWorld((s) => s.generating);
  const progress = useWorld((s) => s.progress);
  const build = useRoblox((s) => s.build);
  const rojo = useRoblox((s) => s.rojo);
  const [roleSet, setRoleSet] = useState("core");
  const [mode, setMode] = useState<"swarm" | "world" | "modify">("swarm");

  useEffect(() => {
    if (panes.length === 0) ensurePanes();
  }, [panes.length, ensurePanes]);

  const isModification = useMemo(() => !!spec && /^(plus|moins|ajoute|enl[eè]ve|supprime|change|modifie|rends|more|less|fewer|add|remove|make|regen|r[ée]g[ée]n)/i.test(composer.trim()), [composer, spec]);

  const submit = async () => {
    const text = composer.trim();
    if (!text) return;
    setComposer("");
    if (mode === "world" || (mode === "swarm" && isModification && spec)) {
      // world-only / modification: send to a world-capable pane (fast path through the local interpreter when no agent)
      const world = panes.find((p) => p.role === "world") ?? panes.find((p) => p.status !== "running") ?? panes[0];
      if (world) {
        useAgents.getState().updatePane(world.id, { role: "world", title: "World design" });
        await send(world.id, text);
      } else await runSwarm(text, "world-only");
      return;
    }
    const roles = ROLE_SETS.find((r) => r.id === roleSet)?.roles;
    await runSwarm(text, "new-game", roles);
  };

  const tasks = plan?.tasks ?? [];
  return (
    <div className="grid h-full grid-cols-[minmax(440px,42%)_1fr] gap-3 p-3">
      {/* left: agents */}
      <div className="flex min-h-0 flex-col gap-3">
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto pr-0.5">
          {panes.length === 0 ? (
            <Empty title="No agents yet" icon={<Bot size={28} />}>
              Add agents with the chips above (Claude Code, Codex, OpenCode, Gemini CLI). Choose how many run in parallel and their model per agent.
            </Empty>
          ) : (
            panes.map((p) => <AgentPane key={p.id} pane={p} />)
          )}
        </div>
        {/* composer */}
        <div className="panel p-3">
          <div className="mb-1.5 flex items-center gap-2 text-xs text-muted">
            <Sparkles size={13} className="text-brand" /> Décris ton idée comme à un pote — le swarm conçoit, génère le monde, code le gameplay et l’UI.
          </div>
          <textarea
            className="w-full resize-none rounded-lg border border-line bg-panel-2 px-3 py-2 text-[13px] outline-none focus:border-brand"
            rows={3}
            placeholder={spec ? `Je veux créer… (ou une modification : “plus médiéval”, “ajoute une rivière derrière le village”, “moins d'arbres”)` : "Je veux créer un jeu de survie dans une forêt mystérieuse avec un village abandonné, des champignons géants, une rivière et des ruines…"}
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
            }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-line text-xs">
              {(["swarm", "world"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)} className={cn("flex items-center gap-1 px-2 py-1", mode === m ? "bg-ink text-white" : "bg-panel text-ink-2 hover:bg-panel-2")}>
                  {m === "swarm" ? <Bot size={12} /> : <Globe2 size={12} />} {m === "swarm" ? "Swarm" : "World only"}
                </button>
              ))}
            </div>
            {mode === "swarm" && (
              <Select value={roleSet} onChange={(e) => setRoleSet(e.target.value)} className="max-w-[260px]">
                {ROLE_SETS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            )}
            <label className="flex items-center gap-1 text-xs text-muted">
              agents
              <Select value={String(defaults.swarmSize)} onChange={(e) => void setDefaults({ swarmSize: Number(e.target.value), concurrency: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </label>
            <div className="ml-auto flex items-center gap-2">
              {isModification && spec && mode === "swarm" && <span className="text-[11px] text-brand">modification → world agent</span>}
              <Button variant="brand" size="sm" icon={planStatus === "running" ? <Wand2 size={13} className="spin" /> : <Send size={13} />} disabled={!composer.trim() || planStatus === "running"} onClick={() => void submit()}>
                {planStatus === "running" ? "Running…" : "Send"} <kbd className="ml-1 border-brand-2 bg-brand-2 text-white">⌘⏎</kbd>
              </Button>
            </div>
          </div>
          {(tasks.length > 0 || activity.length > 0) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {tasks.map((t) => (
                <Pill key={t.id} dot={t.status === "done" ? "ok" : t.status === "failed" || t.status === "skipped" ? "err" : t.status === "running" || t.status === "validating" ? "busy" : "idle"} title={t.error}>
                  {ROLES[t.role].title}
                  {t.providerId && <span className="text-faint">· {PROVIDER_META[t.providerId].short}</span>}
                </Pill>
              ))}
              {activity.length > 0 && <span className="truncate text-[11px] text-muted">{activity[activity.length - 1]}</span>}
            </div>
          )}
        </div>
      </div>

      {/* right: studio / preview */}
      <div className="panel flex min-h-0 flex-col overflow-hidden">
        <div className="flex h-9 items-center gap-2 border-b border-line px-3 text-[13px]">
          <MonitorPlay size={14} className="text-muted" />
          <span className="font-medium">Studio · {project.meta.name}</span>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-ink-2">
            <span className={cn("dot", rojo.connected ? "dot-ok" : rojo.serving ? "dot-warn" : generating ? "dot-busy" : bake ? "dot-ok" : "")} />
            {rojo.connected ? "Syncing" : rojo.serving ? "Waiting for Studio plugin" : generating ? "Generating" : bake ? "Preview" : "No world"}
          </span>
        </div>
        <div className="relative min-h-0 flex-1 bg-[#dfe6ef]">
          <WorldViewer />
          <div className="pointer-events-none absolute bottom-3 left-3 flex gap-2">
            {(generating || build.step === "compiling" || build.step === "building" || build.step === "installing") && (
              <span className="pill pointer-events-auto bg-ink text-white">
                <span className="dot dot-busy" /> {generating ? `Building map · ${progress.stage} ${Math.round(progress.p * 100)}%` : build.step + "…"}
              </span>
            )}
            {!generating && bake && (
              <span className="pill">
                {bake.placements.length} placements · ≈{bake.stats.partsEstimate} parts · {bake.meta.version}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
