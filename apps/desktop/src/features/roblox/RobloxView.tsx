import { openUrl } from "@tauri-apps/plugin-opener";
import { Camera, CheckCircle2, ExternalLink, Hammer, Link2, MonitorPlay, Play, Plug, RefreshCw, ShieldCheck, Square, Upload, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { creatorDashboardUrls } from "@worldforge/roblox-cloud";
import { Button, Input, Label, Pill } from "@/components/ui";
import { cn, timeAgo } from "@/lib/utils";
import { secrets } from "@/lib/tauri";
import { useProjects } from "@/stores/projectStore";
import { useRoblox } from "@/stores/robloxStore";
import { useSettings } from "@/stores/settingsStore";
import { useWorld } from "@/stores/worldStore";

export function RobloxView() {
  const r = useRoblox();
  const project = useProjects((s) => s.current)!;
  const updateMeta = useProjects((s) => s.updateMeta);
  const keys = useSettings((s) => s.keys);
  const bake = useWorld((s) => s.bake);
  const [universeId, setUniverseId] = useState(String(project.meta.roblox.universeId ?? ""));
  const [placeId, setPlaceId] = useState(String(project.meta.roblox.placeId ?? ""));
  const [creatorUserId, setCreatorUserId] = useState(String(project.meta.roblox.creatorUserId ?? ""));
  const [creatorGroupId, setCreatorGroupId] = useState(String(project.meta.roblox.creatorGroupId ?? ""));
  const [tab, setTab] = useState<"build" | "logs" | "qa">("build");
  const [luau, setLuau] = useState("print(\"hello from WorldForge\")\nreturn workspace:GetAttribute(\"WorldReady\")");

  useEffect(() => {
    void r.refreshStudio();
    void r.refreshCloud();
    // ids kept in .env (ROBLOX_CREATOR_USER_ID, ROBLOX_UNIVERSE_ID, ROBLOX_PLACE_ID) prefill an unconfigured project
    void secrets
      .envConfig()
      .then((env) => {
        if (!project.meta.roblox.universeId && env.universe_id) setUniverseId(String(env.universe_id));
        if (!project.meta.roblox.placeId && env.place_id) setPlaceId(String(env.place_id));
        if (!project.meta.roblox.creatorUserId && env.creator_user_id) setCreatorUserId(String(env.creator_user_id));
        if (!project.meta.roblox.creatorGroupId && env.creator_group_id) setCreatorGroupId(String(env.creator_group_id));
      })
      .catch(() => {});
  }, []);

  const saveIds = async () => {
    await updateMeta({
      roblox: {
        ...project.meta.roblox,
        universeId: universeId ? Number(universeId) : undefined,
        placeId: placeId ? Number(placeId) : undefined,
        creatorUserId: creatorUserId ? Number(creatorUserId) : undefined,
        creatorGroupId: creatorGroupId ? Number(creatorGroupId) : undefined,
      },
    });
    await r.refreshCloud();
  };
  const busy = r.build.step === "installing" || r.build.step === "compiling" || r.build.step === "building";
  const errors = r.build.diagnostics.filter((d) => d.severity === "error");

  return (
    <div className="grid h-full grid-cols-[360px_1fr] gap-3 overflow-hidden p-3">
      <aside className="flex min-h-0 flex-col gap-3 overflow-auto">
        <section className="panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MonitorPlay size={15} /> Roblox Studio
            </div>
            <Button size="xs" variant="ghost" icon={<RefreshCw size={11} />} onClick={() => void r.refreshStudio()} />
          </div>
          <div className="space-y-1 text-xs">
            <Status ok={!!r.studio?.found} label="Studio detected" detail={r.studio?.path ?? "not found"} />
            <Status ok={!!r.studio?.running} label="Studio running" detail={r.studio?.running ? "connected" : "launch it or open the place"} warn />
            <Status ok={!!r.studio?.rojo_plugin} label="Rojo plugin installed" detail={r.studio?.plugins_dir ?? ""} warn />
            <Status ok={r.rojo.connected} label="Project synced" detail={r.rojo.serving ? (r.rojo.connected ? `rojo serve :${r.rojo.port} connected` : `rojo serve :${r.rojo.port} — press Connect in the Rojo plugin`) : "rojo serve stopped"} warn />
            <Status ok={r.build.step === "ok"} label="Build successful" detail={r.build.lastAt ? `${timeAgo(r.build.lastAt)}${r.build.rbxlPath ? " · " + r.build.rbxlPath.split(/[\\/]/).pop() : ""}` : "not built yet"} warn />
            <Status ok={r.mcp.connected} label="Studio MCP bridge" detail={r.mcp.connected ? `connected · ${r.mcp.studios.length} studio instance(s)${r.mcp.studios[0] ? " · " + String(r.mcp.studios[0].name ?? r.mcp.studios[0].id) : ""}` : r.mcp.available ? "available — enable “Studio as MCP server” in Studio (Assistant → Manage MCP Servers)" : "not found (update Roblox Studio)"} warn />
          </div>
          {r.mcp.available && (
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <Button size="sm" variant={r.mcp.connected ? "outline" : "brand"} loading={r.mcp.connecting} onClick={() => (r.mcp.connected ? void r.refreshStudios() : void r.connectMcp())}>
                {r.mcp.connected ? "Refresh studios" : "Connect MCP"}
              </Button>
              <Button size="sm" variant="brand" data-testid="deploy-studio" disabled={!r.mcp.connected || r.mcp.studios.length === 0} onClick={() => void r.deployToStudio()}>
                Deploy to Studio
              </Button>
              <Button size="sm" variant="outline" disabled={!r.mcp.connected || r.mcp.studios.length === 0} onClick={() => void r.bakeInStudio()}>
                Bake world only
              </Button>
              <Button size="sm" variant="outline" disabled={!r.mcp.connected || r.mcp.studios.length === 0} onClick={() => void r.playTest(20)}>
                Play-test 20s
              </Button>
              <Button size="sm" variant="outline" disabled={!r.mcp.connected || r.mcp.studios.length === 0} onClick={() => void r.captureViaMcp()}>
                Screenshot (Studio)
              </Button>
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <Button size="sm" variant="primary" icon={<Hammer size={12} />} loading={busy} onClick={() => void r.buildAll()}>
              Build
            </Button>
            <Button size="sm" variant="brand" icon={<Play size={12} />} disabled={!r.studio?.found || busy} onClick={() => void r.openInStudio()}>
              Open in Studio
            </Button>
            <Button size="sm" variant="outline" icon={<MonitorPlay size={12} />} disabled={!r.studio?.found} onClick={() => void r.launchStudio()}>
              Run Studio
            </Button>
            <Button size="sm" variant="outline" icon={r.rojo.serving ? <Square size={12} /> : <Plug size={12} />} onClick={() => (r.rojo.serving ? void r.stopRojoServe() : void r.startRojoServe())}>
              {r.rojo.serving ? "Stop sync" : "Sync project"}
            </Button>
            {!r.studio?.rojo_plugin && (
              <Button size="sm" variant="outline" className="col-span-2" icon={<Plug size={12} />} onClick={() => void r.installRojoPlugin()}>
                Install Rojo plugin into Studio
              </Button>
            )}
          </div>
          <div className="mt-2 text-[11px] text-muted">Open in Studio builds the .rbxl and launches Studio. Sync starts <code>rojo serve</code>; press Connect in the Rojo plugin for live TypeScript → Studio updates. Press ▶ Play in Studio to run the game; runtime errors show in Logs.</div>
        </section>

        <section className="panel p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Link2 size={15} /> Open Cloud
          </div>
          <div className="space-y-2 text-xs">
            <Status ok={keys.openCloud} label="API key in secure storage" detail={keys.openCloud ? "configured (Settings → Roblox)" : "add your Open Cloud key in Settings"} />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Universe id</Label>
                <Input value={universeId} onChange={(e) => setUniverseId(e.target.value.replace(/\D/g, ""))} placeholder="1234567890" />
              </div>
              <div>
                <Label>Place id</Label>
                <Input value={placeId} onChange={(e) => setPlaceId(e.target.value.replace(/\D/g, ""))} placeholder="987654321" />
              </div>
              <div>
                <Label hint="asset uploads">Creator user id</Label>
                <Input value={creatorUserId} onChange={(e) => setCreatorUserId(e.target.value.replace(/\D/g, ""))} placeholder="your Roblox user id" />
              </div>
              <div>
                <Label hint="or group">Creator group id</Label>
                <Input value={creatorGroupId} onChange={(e) => setCreatorGroupId(e.target.value.replace(/\D/g, ""))} placeholder="optional" />
              </div>
            </div>
            <div className="text-[11px] text-faint">Hero 3D models are uploaded as Model assets with the Assets API (`asset:read`/`asset:write` scopes) under this creator — the owner of the API key.</div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => void saveIds()}>
                Save & check
              </Button>
              <Button size="sm" variant="ghost" icon={<ExternalLink size={11} />} onClick={() => void openUrl(universeId ? creatorDashboardUrls(universeId).overview : "https://create.roblox.com/dashboard/creations")}>
                Creator Dashboard
              </Button>
            </div>
            {r.cloud.loading && <div className="text-muted">Checking…</div>}
            {r.cloud.error && <div className="rounded-md bg-err-soft p-2 text-err">{r.cloud.error}</div>}
            {r.cloud.universe && (
              <div className="rounded-md bg-ok-soft p-2 text-ok">
                {r.cloud.universe.displayName} {r.cloud.place ? `· ${r.cloud.place.displayName}` : ""}
              </div>
            )}
            {universeId && (
              <div className="flex gap-1.5">
                <Button size="xs" variant="ghost" icon={<ExternalLink size={10} />} onClick={() => void openUrl(creatorDashboardUrls(universeId).passes)}>
                  Game passes
                </Button>
                <Button size="xs" variant="ghost" icon={<ExternalLink size={10} />} onClick={() => void openUrl(creatorDashboardUrls(universeId).products)}>
                  Developer products
                </Button>
              </div>
            )}
          </div>
        </section>

        <section className="panel p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Upload size={15} /> Publish
          </div>
          <div className="mb-2 text-[11px] text-muted">BUILD → VALIDATE → PREVIEW → TEST → PUBLISH</div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" icon={<ShieldCheck size={12} />} loading={r.publish.status === "validating"} onClick={() => void r.validate()}>
              Validate
            </Button>
            <Button size="sm" variant="brand" icon={<Upload size={12} />} loading={r.publish.status === "publishing"} disabled={!keys.openCloud || !project.meta.roblox.placeId} onClick={() => confirm(`Publish to place ${project.meta.roblox.placeId}? This makes the new version live.`) && void r.publishPlace("Published")}>
              Publish
            </Button>
            <Button size="sm" variant="outline" disabled={!keys.openCloud || !project.meta.roblox.placeId} onClick={() => void r.publishPlace("Saved")}>
              Save version
            </Button>
          </div>
          {r.publish.checks.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {r.publish.checks.map((c) => (
                <li key={c.id} className="flex items-start gap-1.5">
                  {c.ok ? <CheckCircle2 size={13} className="mt-0.5 text-ok" /> : <XCircle size={13} className="mt-0.5 text-err" />}
                  <span className="font-medium">{c.label}</span>
                  <span className="text-muted">— {c.details}</span>
                </li>
              ))}
            </ul>
          )}
          {r.publish.message && <div className={cn("mt-2 rounded-md p-2 text-xs", r.publish.status === "error" ? "bg-err-soft text-err" : "bg-ok-soft text-ok")}>{r.publish.message}</div>}
          {project.meta.roblox.lastPublishedVersion && <div className="mt-1 text-[11px] text-muted">Last published: v{project.meta.roblox.lastPublishedVersion} {timeAgo(project.meta.roblox.lastPublishedAt)}</div>}
        </section>
      </aside>

      <div className="panel flex min-h-0 flex-col overflow-hidden">
        <div className="flex h-9 items-center gap-1 border-b border-line px-2">
          {(["build", "logs", "qa"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cn("rounded-md px-2 py-1 text-xs capitalize hover:bg-line/60", tab === t && "bg-ink text-white")}>
              {t === "qa" ? "QA loop" : t}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {tab === "build" && <Pill dot={r.build.step === "ok" ? "ok" : r.build.step === "error" ? "err" : busy ? "busy" : "idle"}>{r.build.step}{errors.length ? ` · ${errors.length} errors` : ""}</Pill>}
            {tab === "logs" && (
              <>
                <Pill dot={r.logs.tailing ? "ok" : "idle"}>{r.logs.tailing ? "tailing Studio log" : "not tailing"}</Pill>
                <Button size="xs" variant="outline" onClick={() => (r.logs.tailing ? r.stopTail() : void r.startTail())}>
                  {r.logs.tailing ? "Stop" : "Start"}
                </Button>
                <Button size="xs" variant="ghost" onClick={r.clearLogs}>
                  Clear
                </Button>
              </>
            )}
            {tab === "qa" && (
              <>
                <Button size="xs" variant="outline" icon={<Camera size={10} />} onClick={() => void r.captureStudio()}>
                  Screenshot Studio
                </Button>
                <Button size="xs" variant={r.qa.running ? "danger" : "brand"} onClick={() => (r.qa.running ? r.stopQaLoop() : void r.runQaLoop())}>
                  {r.qa.running ? `Stop (iteration ${r.qa.iteration}/${r.qa.max})` : "Run QA loop"}
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="term min-h-0 flex-1 overflow-auto p-3">
          {tab === "build" && (
            <>
              {errors.length > 0 && (
                <div className="mb-2 rounded-md border border-err/30 bg-err-soft p-2 text-err">
                  {errors.map((d, i) => (
                    <div key={i}>
                      {d.file}:{d.line}:{d.column} {d.code} {d.message}
                    </div>
                  ))}
                </div>
              )}
              {r.build.log.length === 0 ? <div className="text-term-muted">Press Build to run npm install → rbxtsc → rojo build.{bake ? "" : " Generate a world first."}</div> : r.build.log.map((l, i) => <div key={i} className={cn("whitespace-pre-wrap", /error/i.test(l) && "text-err")}>{l}</div>)}
            </>
          )}
          {tab === "logs" && (
            <>
              {r.logs.entries.length > 0 && (
                <div className="mb-2 rounded-md border border-warn/30 bg-warn-soft p-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase text-warn">Runtime diagnostics ({r.logs.entries.length})</div>
                  {r.logs.entries.slice(-40).map((e, i) => (
                    <div key={i} className={cn("whitespace-pre-wrap", e.severity === "error" ? "text-err" : "text-warn")}>
                      {e.message}
                    </div>
                  ))}
                </div>
              )}
              {r.mcp.log.length > 0 && (
                <div className="mb-2 rounded-md border border-brand/30 bg-brand-soft/40 p-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase text-brand">Studio MCP</div>
                  {r.mcp.log.slice(-20).map((l, i) => (
                    <div key={i} className="whitespace-pre-wrap">{l}</div>
                  ))}
                </div>
              )}
              {r.mcp.available && (
                <div className="mb-2 rounded-md border border-line bg-panel p-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase text-muted">Luau console (runs in Studio via MCP)</div>
                  <textarea data-testid="luau-console" className="term-input h-16 w-full rounded border border-line bg-term p-1" value={luau} onChange={(e) => setLuau(e.target.value)} spellCheck={false} />
                  <div className="mt-1 flex gap-1.5">
                    <Button size="xs" variant="primary" data-testid="luau-run-edit" disabled={!r.mcp.connected} onClick={() => void r.runLuau(luau, "Edit")}>Run (Edit)</Button>
                    <Button size="xs" variant="outline" data-testid="luau-run-server" disabled={!r.mcp.connected} onClick={() => void r.runLuau(luau, "Server")}>Run (Server)</Button>
                  </div>
                </div>
              )}
              {r.logs.raw.length === 0 ? <div className="text-term-muted">Studio output appears here while a place is open (log file tail or MCP play-test). Press ▶ Play in Studio.</div> : r.logs.raw.slice(-300).map((l, i) => <div key={i} className="whitespace-pre-wrap text-term-muted">{l}</div>)}
            </>
          )}
          {tab === "qa" && (
            <>
              <div className="mb-2 text-term-muted">GENERATE → TEST → OBSERVE → CRITIQUE → FIX → TEST · max {project.meta.qa.maxIterations} iterations · auto-fix {project.meta.qa.autoFix ? "on" : "off"} · vision {project.meta.qa.useVision ? "on" : "off"}</div>
              {r.qa.log.map((l, i) => (
                <div key={i} className="whitespace-pre-wrap">
                  {l}
                </div>
              ))}
              {r.qa.screenshots.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.qa.screenshots.map((s) => (
                    <span key={s} className="rounded bg-panel px-2 py-1 text-[10px]">
                      {s.split(/[\\/]/).pop()}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Status({ ok, label, detail, warn }: { ok: boolean; label: string; detail: string; warn?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className={cn("dot mt-1.5", ok ? "dot-ok" : warn ? "dot-warn" : "dot-err")} />
      <div className="min-w-0 flex-1">
        <div className={cn("font-medium", !ok && "text-muted")}>{label}</div>
        <div className="truncate text-[11px] text-faint" title={detail}>
          {detail}
        </div>
      </div>
    </div>
  );
}
