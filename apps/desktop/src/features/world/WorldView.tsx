import { Bug, Camera, Eye, EyeOff, History, Lock, LockOpen, MapPin, RefreshCw, RotateCcw, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";
import type { GenLayer } from "@worldforge/world-gen";
import { Button, IconButton, Label, Pill, Progress, Tip } from "@/components/ui";
import { cn, timeAgo } from "@/lib/utils";
import { useWorld, type ViewerCamera, type ViewerLayer } from "@/stores/worldStore";
import { WorldViewer } from "@/features/viewer/WorldViewer";

const CAMERAS: { id: ViewerCamera; label: string }[] = [
  { id: "orbit", label: "Orbit" },
  { id: "fly", label: "Fly" },
  { id: "top", label: "Top" },
  { id: "first-person", label: "First person" },
];
const LAYERS: ViewerLayer[] = ["terrain", "water", "buildings", "vegetation", "props", "landmarks", "paths", "lighting"];
const REGEN: { layer: GenLayer; label: string }[] = [
  { layer: "terrain", label: "Terrain" },
  { layer: "water", label: "Water" },
  { layer: "roads", label: "Roads" },
  { layer: "landmarks", label: "Landmarks" },
  { layer: "buildings", label: "Buildings" },
  { layer: "vegetation", label: "Vegetation" },
  { layer: "props", label: "Props" },
  { layer: "lighting", label: "Lighting" },
];

export function WorldView() {
  const w = useWorld();
  const [side, setSide] = useState<"inspector" | "versions" | "report" | "spec">("inspector");
  const selected = w.selectedPlacementId && w.bake ? w.bake.placements.find((p) => p.id === w.selectedPlacementId) : null;
  return (
    <div className="grid h-full grid-cols-[1fr_340px] gap-3 p-3">
      <div className="panel relative flex min-h-0 flex-col overflow-hidden">
        <div className="flex h-9 items-center gap-1 border-b border-line px-2">
          <Camera size={14} className="text-muted" />
          {CAMERAS.map((c) => (
            <button key={c.id} onClick={() => w.setCamera(c.id)} className={cn("rounded-md px-2 py-1 text-xs hover:bg-line/60", w.camera === c.id && "bg-ink text-white")}>
              {c.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-line" />
          {LAYERS.map((l) => (
            <Tip key={l} content={`Toggle ${l}`}>
              <button onClick={() => w.toggleLayer(l)} className={cn("flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] capitalize hover:bg-line/60", w.layers[l] ? "text-ink" : "text-faint")}>
                {w.layers[l] ? <Eye size={11} /> : <EyeOff size={11} />} {l}
              </button>
            </Tip>
          ))}
          <span className="mx-1 h-5 w-px bg-line" />
          <button onClick={() => w.setWireframe(!w.wireframe)} className={cn("rounded-md px-2 py-1 text-[11px] hover:bg-line/60", w.wireframe && "bg-line")}>
            wireframe
          </button>
          <button onClick={() => w.setBiomeColors(!w.biomeColors)} className={cn("rounded-md px-2 py-1 text-[11px] hover:bg-line/60", w.biomeColors && "bg-line")}>
            biome colors
          </button>
          <div className="ml-auto flex items-center gap-2">
            {w.generating && (
              <span className="flex items-center gap-2 text-xs text-brand">
                <span className="dot dot-busy" /> {w.progress.stage} <Progress value={w.progress.p} className="w-24" />
              </span>
            )}
            <Button size="sm" variant="brand" icon={<Wand2 size={13} />} loading={w.generating} disabled={!w.spec} onClick={() => void w.generate({ label: "regenerate all" })}>
              Regenerate
            </Button>
          </div>
        </div>
        <div className="relative min-h-0 flex-1 bg-[#dfe6ef]">
          <WorldViewer />
          {w.camera === "first-person" && <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-ink/70 px-2 py-1 text-[11px] text-white">Click to look around · WASD to walk · Shift to run · Esc to release</div>}
          {w.error && <div className="absolute bottom-3 left-3 rounded-md bg-err-soft px-3 py-2 text-xs text-err">{w.error}</div>}
        </div>
      </div>

      <aside className="panel flex min-h-0 flex-col overflow-hidden">
        <div className="flex h-9 items-center gap-1 border-b border-line px-2">
          {(["inspector", "versions", "report", "spec"] as const).map((t) => (
            <button key={t} onClick={() => setSide(t)} className={cn("rounded-md px-2 py-1 text-xs capitalize hover:bg-line/60", side === t && "bg-ink text-white")}>
              {t}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          {side === "inspector" && (
            <div className="space-y-4">
              <div>
                <Label>Regenerate a layer</Label>
                <div className="mt-1 grid grid-cols-2 gap-1">
                  {REGEN.map((r) => {
                    const locked = w.spec?.locks[r.layer as keyof typeof w.spec.locks];
                    return (
                      <div key={r.layer} className="flex items-center gap-1">
                        <Button size="xs" variant="outline" className="flex-1 justify-start" icon={<RefreshCw size={10} />} disabled={!w.bake || w.generating || !!locked} onClick={() => void w.generate({ layers: [r.layer], newSeed: true })}>
                          {r.label}
                        </Button>
                        <Tip content={locked ? "Unlock" : "Lock (kept on regeneration)"}>
                          <IconButton onClick={() => w.setLocks({ [r.layer]: !locked })} className={cn(locked && "text-brand")}>
                            {locked ? <Lock size={12} /> : <LockOpen size={12} />}
                          </IconButton>
                        </Tip>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>Selected object</Label>
                {selected ? (
                  <div className="mt-1 space-y-1.5 text-xs">
                    <div className="font-medium">{selected.prefab} · variant {selected.variant}</div>
                    <div className="text-muted">
                      {selected.category} · {selected.layer} · {selected.biome ?? "–"} · scale {selected.scale.toFixed(2)}
                    </div>
                    <div className="font-mono text-[11px] text-muted">
                      {selected.position.map((v) => v.toFixed(1)).join(", ")}
                    </div>
                    <div className="flex gap-1.5 pt-1">
                      <Button size="xs" variant={selected.locked ? "brand" : "outline"} icon={selected.locked ? <Lock size={10} /> : <LockOpen size={10} />} onClick={() => w.lockPlacement(selected.id, !selected.locked)}>
                        {selected.locked ? "Locked" : "Lock this asset"}
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        icon={<MapPin size={10} />}
                        onClick={() => {
                          const n = w.keepArea([selected.position[0], selected.position[2]], 40);
                          alert(`Kept ${n} objects within 40 studs.`);
                        }}
                      >
                        Keep this area
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-muted">Click an object in the viewer.</div>
                )}
              </div>
              {w.bake && (
                <div>
                  <Label>Stats</Label>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    {Object.entries(w.bake.stats.counts)
                      .filter(([, n]) => n > 0)
                      .map(([k, n]) => (
                        <div key={k} className="flex justify-between">
                          <span className="capitalize text-muted">{k}</span>
                          <span className="font-mono">{n}</span>
                        </div>
                      ))}
                    <div className="flex justify-between">
                      <span className="text-muted">parts ≈</span>
                      <span className="font-mono">{w.bake.stats.partsEstimate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">height σ</span>
                      <span className="font-mono">{w.bake.stats.heightStd.toFixed(1)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">generated in</span>
                      <span className="font-mono">{w.bake.stats.generationMs} ms</span>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 text-xs">
                    {w.bake.landmarks.map((l) => (
                      <div key={l.id} className="flex items-center justify-between">
                        <span>
                          {l.id} <span className="text-faint">({l.role})</span>
                        </span>
                        <span className={cn("text-[11px]", l.viewCorridors.some((c) => c.visible) ? "text-ok" : "text-warn")}>{l.viewCorridors.filter((c) => c.visible).length}/{l.viewCorridors.length} views</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {side === "versions" && (
            <div className="space-y-1.5">
              {w.versions.length === 0 && <div className="text-xs text-muted">No versions yet.</div>}
              {w.versions.map((v, i) => (
                <div key={v.id} className={cn("rounded-lg border border-line p-2 text-xs", i === 0 && "border-brand/40 bg-brand-soft/40")}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {v.version} {i === 0 && <span className="text-[10px] text-brand">current</span>}
                    </span>
                    <span className="text-[11px] text-muted">{timeAgo(v.created_at)}</span>
                  </div>
                  <div className="text-muted">
                    {v.label} · score {v.score ?? "–"}
                  </div>
                  <div className="mt-1 flex gap-1">
                    <Button size="xs" variant="outline" icon={<RotateCcw size={10} />} disabled={w.generating} onClick={() => void w.restoreVersion(v.id)}>
                      Restore
                    </Button>
                    <Button size="xs" variant="ghost" icon={<Trash2 size={10} />} onClick={() => void w.deleteVersion(v.id)} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {side === "report" && <ReportPanel />}
          {side === "spec" && <SpecEditor />}
        </div>
      </aside>
    </div>
  );
}

function ReportPanel() {
  const report = useWorld((s) => s.report);
  const apply = useWorld((s) => s.applyReportFixes);
  const generating = useWorld((s) => s.generating);
  if (!report) return <div className="text-xs text-muted">Generate a world to get a quality report.</div>;
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="text-3xl font-bold text-ink">{report.score}</div>
        <div className="pb-1 text-xs text-muted">/100 world score · {report.source}</div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {Object.entries(report.scores).map(([k, v]) => (
          <div key={k} className="rounded-md border border-line p-1.5 text-center">
            <div className={cn("text-sm font-semibold", v >= 8 ? "text-ok" : v >= 6 ? "text-warn" : "text-err")}>{v}</div>
            <div className="text-[10px] text-muted">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</div>
          </div>
        ))}
      </div>
      <div>
        <Label>Problems</Label>
        {report.problems.length === 0 ? (
          <div className="mt-1 text-xs text-ok">No problems detected.</div>
        ) : (
          <ul className="mt-1 space-y-1">
            {report.problems.map((p) => (
              <li key={p.id} className="flex items-start gap-1.5 text-xs">
                <Bug size={12} className={cn("mt-0.5 flex-none", p.severity === "high" || p.severity === "critical" ? "text-err" : p.severity === "medium" ? "text-warn" : "text-muted")} />
                <span>{p.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {report.fixes.length > 0 && (
        <Button size="sm" variant="brand" icon={<Wand2 size={12} />} loading={generating} onClick={() => void apply()}>
          Apply {report.fixes.length} automatic fix(es)
        </Button>
      )}
    </div>
  );
}

function SpecEditor() {
  const spec = useWorld((s) => s.spec);
  const setSpec = useWorld((s) => s.setSpec);
  const generate = useWorld((s) => s.generate);
  const [text, setText] = useState(() => (spec ? JSON.stringify(spec, null, 2) : ""));
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex h-full flex-col gap-2">
      <Label hint="worlds/main/world.spec.json">WorldSpec</Label>
      <textarea className="term min-h-0 flex-1 resize-none rounded-md border border-line p-2 text-[11px] outline-none" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      {err && <div className="text-xs text-err">{err}</div>}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="brand"
          icon={<History size={12} />}
          onClick={async () => {
            try {
              const { WorldSpecSchema } = await import("@worldforge/core");
              const parsed = WorldSpecSchema.parse(JSON.parse(text));
              setErr(null);
              setSpec(parsed);
              await generate({ label: "manual spec edit" });
            } catch (e) {
              setErr((e as Error).message.slice(0, 400));
            }
          }}
        >
          Apply & regenerate
        </Button>
        <Pill>{spec?.seed !== undefined ? `seed ${spec.seed}` : ""}</Pill>
      </div>
    </div>
  );
}
