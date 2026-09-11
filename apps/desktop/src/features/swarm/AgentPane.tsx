import { GripVertical, MoreHorizontal, Square, TerminalSquare, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PROVIDER_META, ROLES, type AgentProviderId, type AgentRole, type PermissionMode } from "@worldforge/agents";
import { Dropdown, IconButton, Select } from "@/components/ui";
import { getProvider } from "@/lib/agents";
import { cn, fmtDuration } from "@/lib/utils";
import { useAgents, type LogEntry, type Pane } from "@/stores/agentStore";
import { useProjects } from "@/stores/projectStore";
import { useSettings } from "@/stores/settingsStore";

const PERM_LABEL: Record<PermissionMode, string> = { safe: "safe mode (asks)", acceptEdits: "accept edits on", bypass: "bypass permissions" };
const PERM_CYCLE: PermissionMode[] = ["acceptEdits", "safe", "bypass"];

export function AgentPane({ pane }: { pane: Pane }) {
  const update = useAgents((s) => s.updatePane);
  const remove = useAgents((s) => s.removePane);
  const clear = useAgents((s) => s.clearPane);
  const send = useAgents((s) => s.send);
  const stop = useAgents((s) => s.stop);
  const project = useProjects((s) => s.current);
  const detection = useSettings((s) => s.providers[pane.providerId]);
  const meta = PROVIDER_META[pane.providerId];
  const caps = getProvider(pane.providerId).getCapabilities();
  const logRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const running = pane.status === "running";

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [pane.log.length, pane.log[pane.log.length - 1]?.text.length]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed(Date.now() - (pane.startedAt ?? Date.now())), 1000);
    return () => clearInterval(t);
  }, [running, pane.startedAt]);

  const submit = () => {
    const text = pane.input.trim();
    if (!text || running) return;
    void send(pane.id, text);
  };

  const modelLabel = caps.models.find((m) => m.id === pane.model)?.label ?? (pane.model || "default");
  const roleTitle = pane.role === "chat" ? "" : ROLES[pane.role].title;

  return (
    <div className={cn("panel flex min-h-[220px] flex-col overflow-hidden", running && "border-brand/40")}>
      {/* header */}
      <div className="flex h-9 items-center gap-2 border-b border-line px-2">
        <GripVertical size={14} className="text-faint" />
        <TerminalSquare size={14} style={{ color: meta.color }} />
        <span className="text-[13px] font-semibold" style={{ color: meta.color }}>
          {meta.name}
        </span>
        <span className="text-xs text-faint">#{pane.index}</span>
        <input
          className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-ink outline-none placeholder:text-faint"
          value={pane.title}
          placeholder={roleTitle || "Untitled task"}
          onChange={(e) => update(pane.id, { title: e.target.value })}
        />
        <span className={cn("truncate text-xs", running ? "text-brand" : pane.status === "error" ? "text-err" : "text-muted")}>{pane.statusText}</span>
        <Dropdown
          trigger={
            <IconButton>
              <MoreHorizontal size={14} />
            </IconButton>
          }
          items={[
            ...(Object.keys(ROLES) as AgentRole[]).map((r) => ({ label: `Role: ${ROLES[r].title}`, checked: pane.role === r, onSelect: () => update(pane.id, { role: r, title: r === "chat" ? "" : ROLES[r].title }) })),
            { separator: true, label: "" },
            { label: "Clear log", onSelect: () => clear(pane.id) },
            { label: "New session (forget context)", onSelect: () => update(pane.id, { session: null, log: [...pane.log, { id: `${Date.now()}`, kind: "system", text: "— new session —", ts: Date.now() }] }) },
            { separator: true, label: "" },
            { label: "Remove agent", danger: true, onSelect: () => remove(pane.id) },
          ]}
        />
        <IconButton onClick={() => remove(pane.id)} title="Close">
          <X size={14} />
        </IconButton>
      </div>

      {/* log */}
      <div ref={logRef} className="term min-h-0 flex-1 overflow-auto px-3 py-2">
        {pane.log.length === 0 ? (
          <div className="text-term-muted">
            <div className="mb-2">
              &gt;_ {meta.name}
              {detection && !detection.installed && <span className="text-err"> — not installed ({meta.installHint})</span>}
              {detection?.installed && !detection.probablyAuthenticated && pane.providerId !== "local-rules" && <span className="text-warn"> — not logged in? run “{detection.authHint}”</span>}
            </div>
            <div className="ml-3">model: {modelLabel} {pane.effort && `${pane.effort} `}<span className="text-faint">/model to change</span></div>
            <div className="ml-3">role: {ROLES[pane.role].title.toLowerCase()}</div>
            <div className="ml-3">directory: {project?.path}</div>
          </div>
        ) : (
          pane.log.map((e) => <LogLine key={e.id} e={e} />)
        )}
        {running && (
          <div className="mt-1 text-brand">
            <span className="mr-1 inline-block animate-pulse">✳</span>
            {pane.statusText}… <span className="text-term-muted">({fmtDuration(elapsed)} · esc to interrupt)</span>
          </div>
        )}
        <div className="mt-1 text-right text-[11px] text-term-muted">
          ● {modelLabel}
          {pane.effort ? ` · ${pane.effort}` : ""} {caps.efforts ? "· /effort" : ""}
          {pane.usage.costUsd !== undefined && ` · $${pane.usage.costUsd.toFixed(3)}`}
          {pane.usage.outputTokens !== undefined && ` · ${pane.usage.outputTokens} out`}
        </div>
      </div>

      {/* input */}
      <div className="border-t border-line bg-term px-3 py-1.5">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 font-mono text-[13px] text-brand">›</span>
          <textarea
            className="term-input max-h-24"
            rows={1}
            placeholder={running ? "Working… press esc to interrupt" : `Ask ${meta.short} to do anything`}
            value={pane.input}
            disabled={running && pane.providerId !== "local-rules"}
            onChange={(e) => update(pane.id, { input: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape" && running) void stop(pane.id);
              else if (e.key === "Tab" && e.shiftKey) {
                e.preventDefault();
                const i = PERM_CYCLE.indexOf(pane.permissionMode);
                update(pane.id, { permissionMode: PERM_CYCLE[(i + 1) % PERM_CYCLE.length]! });
              }
            }}
          />
          {running ? (
            <IconButton title="Stop" onClick={() => void stop(pane.id)}>
              <Square size={12} />
            </IconButton>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-term-muted">
          <button
            className="hover:text-ink"
            onClick={() => {
              const i = PERM_CYCLE.indexOf(pane.permissionMode);
              update(pane.id, { permissionMode: PERM_CYCLE[(i + 1) % PERM_CYCLE.length]! });
            }}
          >
            ▸ {PERM_LABEL[pane.permissionMode]} <span className="text-faint">(shift+tab to cycle)</span>
          </button>
          <span className="text-faint">·</span>
          <label className="flex items-center gap-1">
            model
            {caps.customModel ? (
              <input list={`models-${pane.id}`} className="w-28 rounded border border-line bg-panel px-1 text-[11px] text-ink outline-none focus:border-brand" value={pane.model} placeholder="default" onChange={(e) => update(pane.id, { model: e.target.value })} />
            ) : (
              <span>{modelLabel}</span>
            )}
            <datalist id={`models-${pane.id}`}>
              {caps.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </datalist>
          </label>
          {caps.efforts && (
            <label className="flex items-center gap-1">
              effort
              <Select value={pane.effort} onChange={(e) => update(pane.id, { effort: e.target.value })} className="h-5">
                <option value="">default</option>
                {caps.efforts.map((ef) => (
                  <option key={ef} value={ef}>
                    {ef}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <label className="flex items-center gap-1">
            role
            <Select value={pane.role} onChange={(e) => update(pane.id, { role: e.target.value as AgentRole, title: e.target.value === "chat" ? "" : ROLES[e.target.value as AgentRole].title })} className="h-5">
              {(Object.keys(ROLES) as AgentRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLES[r].title}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-1">
            agent
            <Select value={pane.providerId} onChange={(e) => update(pane.id, { providerId: e.target.value as AgentProviderId, session: null, model: useSettings.getState().defaults.models[e.target.value as AgentProviderId] ?? "", effort: useSettings.getState().defaults.efforts[e.target.value as AgentProviderId] ?? "" })} className="h-5">
              {(Object.keys(PROVIDER_META) as AgentProviderId[]).map((id) => (
                <option key={id} value={id}>
                  {PROVIDER_META[id].name}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>
    </div>
  );
}

function LogLine({ e }: { e: LogEntry }) {
  switch (e.kind) {
    case "user":
      return <div className="whitespace-pre-wrap text-term-muted">&gt; {e.text}</div>;
    case "text":
    case "result":
      return (
        <div className="whitespace-pre-wrap">
          <span className="text-ink">● </span>
          {e.text}
          {e.partial && <span className="animate-pulse">▍</span>}
        </div>
      );
    case "thinking":
      return <div className="line-clamp-2 whitespace-pre-wrap italic text-term-muted">∴ {e.text.slice(-240)}</div>;
    case "tool":
      return (
        <div className="whitespace-pre-wrap text-ok">
          <span>● </span>
          <span className="font-semibold">{e.text.split("(")[0]}</span>
          <span className="text-term-ink">({e.text.slice(e.text.indexOf("(") + 1)}</span>
        </div>
      );
    case "tool_result":
      return <div className="whitespace-pre-wrap text-err/80">  ↳ {e.text}</div>;
    case "status":
      return <div className="text-term-muted">✳ {e.text}</div>;
    case "error":
      return <div className="whitespace-pre-wrap text-err">✗ {e.text}</div>;
    case "system":
      return <div className="text-faint">{e.text}</div>;
  }
}
