import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Image as ImageIcon, Lock, LockOpen, RefreshCw, ScanEye, Sparkles, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { GENRES, STYLE_PRESET_LIST, StyleBibleSchema, getStylePreset, hexToRgb, rgbToHex, type StylePresetId } from "@worldforge/core";
import { useGame } from "@/stores/gameStore";
import { interpretModification, interpretPrompt, PROVIDER_META, type AgentProviderId } from "@worldforge/agents";
import type { GenLayer } from "@worldforge/world-gen";
import { Button, Label, Progress, Select, Slider, Switch } from "@/components/ui";
import { fs, path } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useAgents } from "@/stores/agentStore";
import { useProjects } from "@/stores/projectStore";
import { useSettings } from "@/stores/settingsStore";
import { useWorld } from "@/stores/worldStore";
import { WorldViewer } from "@/features/viewer/WorldViewer";

const LAYER_BUTTONS: { layer: GenLayer; label: string }[] = [
  { layer: "terrain", label: "Terrain" },
  { layer: "vegetation", label: "Vegetation" },
  { layer: "buildings", label: "Buildings" },
  { layer: "props", label: "Props" },
  { layer: "landmarks", label: "Landmarks" },
  { layer: "water", label: "Water" },
  { layer: "roads", label: "Roads" },
  { layer: "lighting", label: "Lighting" },
];

export function VisualWorkshop() {
  const w = useWorld();
  const project = useProjects((s) => s.current)!;
  const providers = useSettings((s) => s.providers);
  const defaults = useSettings((s) => s.defaults);
  const addPane = useAgents((s) => s.addPane);
  const send = useAgents((s) => s.send);
  const setTab = useAgents((s) => s.setTab);
  const [prompt, setPrompt] = useState(w.spec?.notes?.split("\n")[0] ?? "");
  const [useAgent, setUseAgent] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const agentAvailable = (["claude-code", "codex", "gemini-cli", "opencode"] as AgentProviderId[]).filter((p) => providers[p]?.installed);
  const spec = w.spec;
  const style = w.style ?? (spec ? getStylePreset(spec.stylePreset) : getStylePreset("stylized_mystical"));

  const controls = useMemo(
    () => [
      { id: "terrain", label: "Terrain relief", value: spec?.terrain.relief ?? 0.55, set: (v: number) => spec && w.setSpec({ ...spec, terrain: { ...spec.terrain, relief: v } }) },
      { id: "vegetation", label: "Vegetation", value: spec?.vegetation.density ?? 0.6, set: (v: number) => spec && w.setSpec({ ...spec, vegetation: { ...spec.vegetation, density: v } }) },
      { id: "buildings", label: "Buildings", value: Math.min(1, (spec?.settlements[0]?.buildings ?? 0) / 20), set: (v: number) => spec && spec.settlements[0] && w.setSpec({ ...spec, settlements: spec.settlements.map((s, i) => (i === 0 ? { ...s, buildings: Math.max(1, Math.round(v * 20)) } : s)) }) },
      { id: "props", label: "Props", value: spec?.props.density ?? 0.5, set: (v: number) => spec && w.setSpec({ ...spec, props: { ...spec.props, density: v } }) },
      { id: "fog", label: "Fog", value: spec?.atmosphere.fogDensity ?? 0.3, set: (v: number) => spec && w.setSpec({ ...spec, atmosphere: { ...spec.atmosphere, fogDensity: v, haze: v } }) },
      { id: "lighting", label: "Lighting", value: spec?.lighting.brightness ?? 0.7, set: (v: number) => spec && w.setSpec({ ...spec, lighting: { ...spec.lighting, brightness: v } }) },
      { id: "color", label: "Color saturation", value: (style.lighting.colorCorrection.saturation + 1) / 2, set: (v: number) => w.setStyle({ ...style, lighting: { ...style.lighting, colorCorrection: { ...style.lighting.colorCorrection, saturation: v * 2 - 1 } } }) },
      { id: "density", label: "Clustering", value: spec?.vegetation.clustering ?? 0.5, set: (v: number) => spec && w.setSpec({ ...spec, vegetation: { ...spec.vegetation, clustering: v } }) },
      { id: "scale", label: "Scale", value: (style.tree.scale[1] - 1) / 2, set: (v: number) => w.setStyle({ ...style, tree: { ...style.tree, scale: [Math.max(0.5, 1 + v * 2 - 0.8), 1 + v * 2] } }) },
      { id: "randomness", label: "Randomness", value: style.randomness, set: (v: number) => w.setStyle({ ...style, randomness: v }) },
    ],
    [spec, style, w],
  );

  const compile = async () => {
    if (!prompt.trim()) return;
    setMessage(null);
    if (useAgent && agentAvailable.length) {
      const pane = useAgents.getState().panes.find((p) => p.role === "world" && p.status !== "running") ?? addPane(agentAvailable.includes(defaults.provider) ? defaults.provider : agentAvailable[0]!, "world");
      useAgents.getState().updatePane(pane.id, { role: "world", title: "World design" });
      setTab("swarm");
      await send(pane.id, prompt.trim());
      return;
    }
    if (spec && /^(plus|moins|ajoute|enl[eè]ve|supprime|change|modifie|rends|more|less|fewer|add|remove|make|regen)/i.test(prompt.trim())) {
      const mod = interpretModification(spec, prompt.trim());
      w.setSpec(mod.spec);
      setMessage(`Applied: ${mod.summary.join("; ")}`);
      await w.generate({ layers: mod.regenerate, newSeed: mod.newSeed, label: prompt.trim().slice(0, 40) });
      return;
    }
    const interp = interpretPrompt(prompt.trim());
    const next = { ...interp.spec, name: spec?.name ?? project.meta.name, id: spec?.id ?? "main" };
    w.setSpec(next);
    w.setStyle(getStylePreset(next.stylePreset));
    setMessage(`Interpreted: ${interp.detected.join(", ") || "default forest"} → ${next.landmarks.length} landmarks, ${next.settlements.length} settlement(s), layout ${next.layout.archetype}`);
    // the GameSpec (genre, systems, quests, shop…) follows the prompt too → Game tab + generated data modules
    await useGame.getState().load();
    if (useGame.getState().game) await useGame.getState().update((g) => ({ ...interp.game, title: g.title, shop: g.shop.items.length ? g.shop : interp.game.shop, monetization: g.monetization }));
    await w.generate({ label: prompt.trim().slice(0, 40), specOverride: next });
  };

  /** Genre chips: switch the gameplay layout archetype and the GameSpec genre/systems. */
  const setGenre = async (genreId: string) => {
    const genre = GENRES.find((g) => g.id === genreId);
    if (!genre || !spec) return;
    const next = { ...spec, layout: { ...spec.layout, archetype: genre.layout }, gameplayHints: [genre.id, ...spec.gameplayHints.filter((h) => !GENRES.some((g) => g.id === h))] };
    w.setSpec(next);
    await useGame.getState().load();
    const game = useGame.getState().game;
    if (game) {
      const systems = genre.systems.map((id) => game.systems.find((s) => s.id === id) ?? { id: id as never, description: id, params: {} });
      await useGame.getState().update({ genre: genre.id as never, systems, ui: { ...game.ui, screens: genre.screens as never } });
    }
    setMessage(`Genre ${genre.name}: layout ${genre.layout}, ${genre.systems.length} systems — regenerate to lay out the map`);
  };
  const currentGenre = spec?.gameplayHints.find((h) => GENRES.some((g) => g.id === h)) ?? useGame.getState().game?.genre;

  const pickReference = async () => {
    const file = await openDialog({ multiple: false, filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }] });
    if (typeof file !== "string") return;
    const dest = path.join(project.path, "design", "references", path.basename(file));
    await fs.copyFile(file, dest);
    setReference(dest);
  };

  const analyzeReference = async () => {
    if (!reference) return;
    setAnalyzing(true);
    setMessage(null);
    try {
      // local palette extraction (always available)
      const b64 = await fs.readBinaryBase64(reference);
      const ext = reference.split(".").pop()?.toLowerCase() ?? "png";
      const palette = await extractPalette(`data:image/${ext === "jpg" ? "jpeg" : ext};base64,${b64}`);
      const bright = palette.reduce((a, c) => a + hexToRgb(c).reduce((x, y) => x + y, 0) / 3, 0) / palette.length;
      const nextStyle = StyleBibleSchema.parse({
        ...style,
        palette: { ...style.palette, foliage: palette[0], foliageAlt: palette[1], ground: palette[2], stone: palette[3], accent: palette[4], mushroom: palette[4], sky: palette[5] },
        lighting: { ...style.lighting, brightness: bright > 0.55 ? 2.2 : bright > 0.35 ? 1.4 : 0.9 },
        fog: { ...style.fog, atmosphereDensity: bright < 0.4 ? 0.5 : 0.3 },
      });
      w.setStyle(nextStyle);
      await fs.writeText(path.join(project.path, "worlds", spec?.id ?? "main", "style.bible.json"), JSON.stringify(nextStyle, null, 2));
      setMessage(`Palette extracted (${palette.join(", ")}) → StyleBible updated${useAgent && agentAvailable.length ? "; sending to the vision agent for full analysis" : ""}`);
      // full analysis with a vision-capable agent when requested
      const visionProvider = (["claude-code", "gemini-cli", "codex"] as AgentProviderId[]).find((p) => providers[p]?.installed);
      if (useAgent && visionProvider) {
        const pane = addPane(visionProvider, "vision");
        setTab("swarm");
        await send(
          pane.id,
          `Analyze the reference image at ${reference} (use your image reading tool). Produce a StyleBible JSON (schema: worlds/${spec?.id ?? "main"}/style.bible.json already contains a valid example — keep its keys) capturing palette (hex colors), geometry style, tree style, mushroom colors, architecture style, lighting (ambient/sun colors, brightness), fog (color, density) and vegetation density. Write it to worlds/${spec?.id ?? "main"}/style.bible.json, then summarize the art direction in 4 lines.`,
        );
      }
    } catch (e) {
      setMessage(`Analysis failed: ${(e as Error).message ?? e}`);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="grid h-full grid-cols-[380px_1fr] gap-3 p-3">
      <aside className="panel flex min-h-0 flex-col overflow-auto p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Sparkles size={15} className="text-brand" /> Visual Workshop
        </div>
        <Label>Prompt</Label>
        <textarea className="mt-1 w-full resize-none rounded-lg border border-line bg-panel-2 px-2.5 py-2 text-[13px] outline-none focus:border-brand" rows={3} placeholder="Créer une forêt fantastique avec village abandonné…" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <label className="flex items-center gap-2 text-muted">
            <Switch checked={useAgent} onChange={setUseAgent} disabled={agentAvailable.length === 0} />
            {agentAvailable.length ? `Use AI agent (${PROVIDER_META[agentAvailable.includes(defaults.provider) ? defaults.provider : agentAvailable[0]!].name})` : "No AI agent installed — instant rule-based interpreter"}
          </label>
        </div>
        <div className="mt-3">
          <Label>Reference image</Label>
          <div className="mt-1 flex items-center gap-2">
            <Button size="sm" variant="outline" icon={<ImageIcon size={12} />} onClick={() => void pickReference()}>
              {reference ? path.basename(reference) : "Upload"}
            </Button>
            <Button size="sm" variant="secondary" icon={<ScanEye size={12} />} disabled={!reference} loading={analyzing} onClick={() => void analyzeReference()}>
              Analyze image
            </Button>
          </div>
        </div>
        <div className="mt-3">
          <Label hint={`${STYLE_PRESET_LIST.length} styles`}>Style</Label>
          {(["fantasy", "historical", "modern", "future", "apocalyptic", "nature", "themed"] as const).map((group) => (
            <div key={group} className="mt-1 flex flex-wrap items-center gap-1">
              <span className="w-16 text-[10px] uppercase tracking-wide text-faint">{group}</span>
              {STYLE_PRESET_LIST.filter((p) => p.group === group).map((p) => (
                <button
                  key={p.id}
                  title={p.description}
                  onClick={() => {
                    const preset = getStylePreset(p.id as StylePresetId);
                    w.setStyle(preset);
                    if (spec) w.setSpec({ ...spec, stylePreset: p.id as StylePresetId });
                  }}
                  className={cn("rounded-full border px-2 py-0.5 text-[11px]", spec?.stylePreset === p.id ? "border-brand bg-brand-soft text-brand" : "border-line hover:bg-panel-2")}
                >
                  {p.name}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-3">
          <Label hint={`${GENRES.length} genres`}>Genre</Label>
          <div className="mt-1 flex flex-wrap gap-1">
            {GENRES.map((g) => (
              <button key={g.id} title={`${g.description} · layout ${g.layout}`} onClick={() => void setGenre(g.id)} className={cn("rounded-full border px-2 py-0.5 text-[11px]", currentGenre === g.id ? "border-brand bg-brand-soft text-brand" : "border-line hover:bg-panel-2")}>
                {g.name}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 space-y-2">
          <Label>Controls</Label>
          {controls.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-xs">
              <span className="w-28 text-muted">{c.label}</span>
              <Slider value={c.value} onChange={c.set} disabled={!spec} className="flex-1" />
              <span className="w-8 text-right font-mono text-[11px] text-faint">{Math.round(c.value * 100)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <Label>Locks</Label>
          <div className="mt-1 flex flex-wrap gap-1">
            {(["terrain", "buildings", "landmarks", "vegetation", "lighting", "props", "water", "roads"] as const).map((l) => {
              const locked = spec?.locks[l];
              return (
                <button key={l} disabled={!spec} onClick={() => w.setLocks({ [l]: !locked })} className={cn("flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] capitalize", locked ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:bg-panel-2")}>
                  {locked ? <Lock size={10} /> : <LockOpen size={10} />} {l}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Button className="w-full" variant="brand" size="lg" icon={<Wand2 size={15} />} loading={w.generating} disabled={!prompt.trim() && !spec} onClick={() => (prompt.trim() ? void compile() : void w.generate({ label: "workshop" }))}>
            {prompt.trim() ? "GENERATE WORLD" : "REGENERATE"}
          </Button>
          <div className="grid grid-cols-2 gap-1">
            <Button size="sm" variant="outline" icon={<RefreshCw size={11} />} disabled={!w.bake || w.generating} onClick={() => void w.generate({ label: "regenerate (new seed)", newSeed: true })}>
              Regenerate all
            </Button>
            {LAYER_BUTTONS.map((b) => (
              <Button key={b.layer} size="sm" variant="outline" icon={<RefreshCw size={11} />} disabled={!w.bake || w.generating || !!spec?.locks[b.layer as keyof typeof spec.locks]} onClick={() => void w.generate({ layers: [b.layer], newSeed: true })}>
                {b.label}
              </Button>
            ))}
          </div>
          {w.dirty && !w.generating && <div className="text-[11px] text-warn">Settings changed — regenerate to apply.</div>}
          {message && <div className="rounded-md bg-panel-2 p-2 text-[11px] text-ink-2">{message}</div>}
          {w.generating && (
            <div className="text-xs text-brand">
              {w.progress.stage} <Progress value={w.progress.p} className="mt-1" />
            </div>
          )}
        </div>
      </aside>
      <div className="panel relative min-h-0 overflow-hidden bg-[#dfe6ef]">
        <WorldViewer />
        {w.report && (
          <div className="absolute right-3 top-3 rounded-lg border border-line bg-panel/90 px-3 py-2 text-xs shadow">
            <div className="text-lg font-bold">{w.report.score}</div>
            <div className="text-[10px] text-muted">world score</div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Dominant palette via coarse quantization on a downscaled canvas (offline fallback for image analysis). */
async function extractPalette(dataUrl: string): Promise<string[]> {
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("cannot decode image"));
    img.src = dataUrl;
  });
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0, 64, 64);
  const data = ctx.getImageData(0, 0, 64, 64).data;
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const key = `${r >> 5}_${g >> 5}_${b >> 5}`;
    const bk = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    bk.r += r;
    bk.g += g;
    bk.b += b;
    bk.n++;
    buckets.set(key, bk);
  }
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, 6);
  while (sorted.length < 6) sorted.push(sorted[sorted.length - 1] ?? { r: 100, g: 100, b: 100, n: 1 });
  return sorted.map((bk) => rgbToHex([bk.r / bk.n / 255, bk.g / bk.n / 255, bk.b / bk.n / 255]));
}
