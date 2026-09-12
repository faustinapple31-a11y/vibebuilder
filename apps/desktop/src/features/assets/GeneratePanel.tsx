import { Box, Image as ImageIcon, Music, Sparkles, Volume2 } from "lucide-react";
import { useState } from "react";
import { AiProviderError } from "@worldforge/ai-providers";
import { Button, Label, Select, Textarea } from "@/components/ui";
import { elevenLabs, geminiImages, meshy, saveGeneratedAsset, type GenKind } from "@/lib/aiProviders";
import { fs } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useProjects } from "@/stores/projectStore";
import { useRoblox } from "@/stores/robloxStore";
import { useSettings } from "@/stores/settingsStore";
import { useWorld } from "@/stores/worldStore";

interface Result {
  kind: GenKind;
  path?: string;
  dataUrl?: string;
  text: string;
}

/**
 * AI asset generation: images (Gemini), meshes (Meshy or Roblox Studio's own generator via MCP),
 * sound effects & music (ElevenLabs). Keys live in the OS keyring; requests go through the Rust proxy.
 */
export function GeneratePanel() {
  const project = useProjects((s) => s.current)!;
  const keys = useSettings((s) => s.keys);
  const style = useWorld((s) => s.style);
  const mcp = useRoblox((s) => s.mcp);
  const [kind, setKind] = useState<GenKind>("image");
  const [meshProvider, setMeshProvider] = useState<"meshy" | "studio">("studio");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const styleHint = style ? ` Art direction: ${style.geometry.replace(/_/g, " ")}, palette ${style.palette.primary} ${style.palette.accent} ${style.palette.foliage}, ${style.name} Roblox game.` : "";

  const run = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    setResult(null);
    setStatus("Generating…");
    try {
      if (kind === "image") {
        const file = await geminiImages.generateImage({ prompt: prompt + styleHint, aspectRatio: "1:1" });
        const saved = await saveGeneratedAsset(project.path, project.row.id, "image", prompt, file, "gemini");
        setResult({ kind, path: saved.path, dataUrl: `data:${file.mimeType};base64,${file.data}`, text: `Saved to ${saved.path}` });
      } else if (kind === "sound" || kind === "music") {
        const file = kind === "sound" ? await elevenLabs.generateSound({ prompt, durationSeconds: 4 }) : await elevenLabs.generateMusic({ prompt: prompt + styleHint, durationSeconds: 45 });
        const saved = await saveGeneratedAsset(project.path, project.row.id, kind, prompt, file, "elevenlabs");
        setResult({ kind, path: saved.path, dataUrl: `data:${file.mimeType};base64,${file.data}`, text: `Saved to ${saved.path}` });
      } else if (kind === "mesh" && meshProvider === "studio") {
        const r = useRoblox.getState();
        if (!(await r.connectMcp())) throw new Error("Roblox Studio MCP is not available — open the place in Studio with the MCP server enabled.");
        await r.refreshStudios();
        setStatus("Roblox Studio is generating the mesh (this can take a minute)…");
        const text = await useRoblox.getState().generateMeshInStudio(prompt + styleHint);
        setResult({ kind, text });
      } else {
        const job = await meshy.startMesh({ prompt: prompt + styleHint, artStyle: "stylized" });
        let glb: string | undefined;
        for (let i = 0; i < 120; i++) {
          await new Promise((r) => setTimeout(r, 5000));
          const st = await meshy.pollMesh(job.jobId);
          setStatus(`Meshy: ${st.status} ${st.progress ?? 0}%`);
          if (st.status === "done") {
            glb = st.glbUrl;
            break;
          }
          if (st.status === "failed") throw new Error(st.error ?? "Meshy generation failed");
        }
        if (!glb) throw new Error("Meshy timed out");
        const file = await meshy.downloadMesh(glb);
        const saved = await saveGeneratedAsset(project.path, project.row.id, "mesh", prompt, file, "meshy");
        setResult({ kind, path: saved.path, text: `GLB saved to ${saved.path} — import it in Studio (Avatar/3D Importer) or drag it into the Asset Manager.` });
      }
      setStatus(null);
    } catch (e) {
      setStatus(e instanceof AiProviderError ? `${e.provider} error ${e.status}: ${e.body.slice(0, 200)}` : ((e as Error).message ?? String(e)));
    } finally {
      setBusy(false);
    }
  };

  const keyOk = kind === "image" ? keys.gemini : kind === "mesh" ? (meshProvider === "meshy" ? keys.meshy : mcp.available) : keys.elevenlabs;
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles size={14} className="text-brand" /> Generate with AI
      </div>
      <div className="flex gap-1">
        {(
          [
            ["image", <ImageIcon size={12} key="i" />, "Image"],
            ["mesh", <Box size={12} key="m" />, "3D"],
            ["sound", <Volume2 size={12} key="s" />, "SFX"],
            ["music", <Music size={12} key="u" />, "Music"],
          ] as const
        ).map(([k, icon, label]) => (
          <button key={k} onClick={() => setKind(k)} className={cn("flex items-center gap-1 rounded-md border px-2 py-1", kind === k ? "border-brand bg-brand-soft text-brand" : "border-line hover:bg-panel-2")}>
            {icon} {label}
          </button>
        ))}
      </div>
      {kind === "mesh" && (
        <Select value={meshProvider} onChange={(e) => setMeshProvider(e.target.value as "meshy" | "studio")} className="w-full">
          <option value="studio">Roblox Studio generator (MCP, free with your Roblox account)</option>
          <option value="meshy">Meshy API (GLB file)</option>
        </Select>
      )}
      <Textarea rows={3} placeholder={kind === "image" ? "A glowing mushroom icon, flat stylized, transparent background" : kind === "mesh" ? "A twisted ancient tree stump with glowing roots" : kind === "sound" ? "Soft mushroom pickup pop with a magical sparkle" : "Mysterious ambient forest music, soft pads, slow tempo"} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="brand" loading={busy} disabled={!prompt.trim() || !keyOk} onClick={() => void run()}>
          Generate
        </Button>
        {!keyOk && <span className="text-warn">{kind === "mesh" && meshProvider === "studio" ? "Studio MCP not available" : `Add the ${kind === "image" ? "Gemini" : kind === "mesh" ? "Meshy" : "ElevenLabs"} key in Settings`}</span>}
      </div>
      {status && <div className="rounded-md bg-panel-2 p-2">{status}</div>}
      {result && (
        <div className="space-y-1 rounded-md border border-line p-2">
          {result.dataUrl && result.kind === "image" && <img src={result.dataUrl} alt="" className="max-h-48 rounded-md" />}
          {result.dataUrl && (result.kind === "sound" || result.kind === "music") && <audio controls src={result.dataUrl} className="w-full" />}
          <div className="break-all text-[11px] text-muted">{result.text}</div>
          {result.path && (
            <Button size="xs" variant="ghost" onClick={() => void fs.exists(result.path!).then((ok) => setStatus(ok ? "File present on disk" : "File missing"))}>
              Verify file
            </Button>
          )}
        </div>
      )}
      <div className="text-[11px] text-faint">
        <Label>Providers</Label>
        Image: Gemini · 3D: Roblox Studio (MCP) or Meshy · Audio: ElevenLabs. Add or swap providers in packages/ai-providers.
      </div>
    </div>
  );
}
