import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Box, CloudUpload, Image as ImageIcon, MapPin, Sparkles, Trash2, Upload, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Input, Label, Select, Slider, Switch, Textarea } from "@/components/ui";
import { deleteMeshAsset, generateMeshAsset, importGlbAsset, updateMeshAsset, type MeshAssetRecord } from "@/lib/meshAssets";
import { fs, path } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useProjects } from "@/stores/projectStore";
import { useRoblox } from "@/stores/robloxStore";
import { useSettings } from "@/stores/settingsStore";
import { useWorld } from "@/stores/worldStore";

type Quality = "preview" | "refined";
type ArtStyle = "stylized" | "realistic" | "sculpture";
type Category = MeshAssetRecord["category"];

/**
 * High-quality 3D models ("hero meshes"): text or reference image → textured PBR mesh (Meshy),
 * saved as GLB/FBX/thumbnail, published to Roblox as a Model asset (Open Cloud) and placed in the
 * world like any prefab. Roblox Studio's own generator stays available in the Generate panel.
 */
export function HeroMeshPanel({ selected, onSelect }: { selected: MeshAssetRecord | null; onSelect: (r: MeshAssetRecord | null) => void }) {
  const project = useProjects((s) => s.current)!;
  const keys = useSettings((s) => s.keys);
  const style = useWorld((s) => s.style);
  const assets = useWorld((s) => s.meshAssets);
  const refresh = useWorld((s) => s.refreshMeshAssets);
  const place = useWorld((s) => s.placeMeshAsset);
  const bake = useWorld((s) => s.bake);
  const publish = useRoblox((s) => s.publishMeshAsset);
  const insertInStudio = useRoblox((s) => s.insertMeshAssetInStudio);
  const mcp = useRoblox((s) => s.mcp);
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [quality, setQuality] = useState<Quality>("refined");
  const [artStyle, setArtStyle] = useState<ArtStyle>("stylized");
  const [category, setCategory] = useState<Category>("landmark");
  const [polycount, setPolycount] = useState(15000);
  const [height, setHeight] = useState(14);
  const [image, setImage] = useState<{ data: string; mimeType: string; name: string } | null>(null);
  const [publishAfter, setPublishAfter] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const styleHint = style ? ` Art direction: ${style.name}, ${style.geometry.replace(/_/g, " ")}, palette ${style.palette.primary} ${style.palette.accent}. Game-ready asset, clean silhouette, no base plate.` : "";

  const pickImage = async () => {
    const file = await openDialog({ multiple: false, filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp"] }] });
    if (!file) return;
    const p = typeof file === "string" ? file : (file as { path: string }).path;
    const data = await fs.readBinaryBase64(p);
    const ext = p.split(".").pop()?.toLowerCase();
    setImage({ data, mimeType: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg", name: p.split(/[\\/]/).pop() ?? "image" });
  };

  const run = async () => {
    if (!prompt.trim() && !image) return;
    setBusy(true);
    setProgress(0);
    setStatus("Starting generation…");
    try {
      const record = await generateMeshAsset(project.path, {
        prompt: (prompt.trim() || name || "hero model") + (image ? "" : styleHint),
        quality,
        artStyle,
        targetPolycount: polycount,
        topology: "triangle",
        image: image ? { data: image.data, mimeType: image.mimeType } : undefined,
        name: name.trim() || undefined,
        heightStuds: height,
        category,
        onProgress: (m, p) => {
          setStatus(m);
          setProgress(p);
        },
      });
      await refresh();
      onSelect(record);
      if (publishAfter && keys.openCloud && record.fbx) {
        try {
          await publish(record, (m) => setStatus(m));
          const updated = (await refresh()).find((r) => r.id === record.id) ?? record;
          onSelect(updated);
          setStatus(`Ready: ${updated.name} · ${updated.triangles ?? "?"} tris · Roblox asset ${updated.robloxAssetId}`);
        } catch (e) {
          setStatus(`Generated (not published): ${(e as Error).message}`);
        }
      } else {
        setStatus(`Ready: ${record.name} · ${record.triangles ?? "?"} tris${record.fbx ? "" : " (no FBX)"}`);
      }
    } catch (e) {
      setStatus((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const importFile = async () => {
    const file = await openDialog({ multiple: false, filters: [{ name: "3D model", extensions: ["glb"] }] });
    if (!file) return;
    const p = typeof file === "string" ? file : (file as { path: string }).path;
    setBusy(true);
    try {
      const glb = await fs.readBinaryBase64(p);
      const fbxPath = p.replace(/\.glb$/i, ".fbx");
      const fbx = (await fs.exists(fbxPath)) ? await fs.readBinaryBase64(fbxPath) : undefined;
      const record = await importGlbAsset(project.path, glb, p.split(/[\\/]/).pop()?.replace(/\.glb$/i, "") ?? "model", { fbxBase64: fbx, heightStuds: height, category });
      await refresh();
      onSelect(record);
      setStatus(`Imported ${record.name}${fbx ? " (+ FBX for Roblox)" : " — add a .fbx next to it to publish on Roblox"}`);
    } catch (e) {
      setStatus((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const doPublish = async (r: MeshAssetRecord) => {
    setBusy(true);
    try {
      await publish(r, (m) => setStatus(m));
      const updated = (await refresh()).find((x) => x.id === r.id) ?? r;
      onSelect(updated);
    } catch (e) {
      setStatus((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const doInsert = async (r: MeshAssetRecord) => {
    setBusy(true);
    try {
      setStatus(await insertInStudio(r));
    } catch (e) {
      setStatus((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const setAssetHeight = async (r: MeshAssetRecord, h: number) => {
    const updated = { ...r, heightStuds: h };
    await updateMeshAsset(project.path, updated);
    await refresh();
    onSelect(updated);
  };

  const remove = async (r: MeshAssetRecord) => {
    await deleteMeshAsset(project.path, r);
    await refresh();
    onSelect(null);
  };

  const providerOk = !!keys.meshy;
  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Wand2 size={14} className="text-brand" /> Hero 3D models (super quality)
      </div>
      <div className="text-[11px] text-faint">Text or reference image → textured PBR mesh (Meshy) → GLB for the viewer + FBX published as a Roblox Model asset → placed in the world and spawned in-game with InsertService.</div>

      <Textarea rows={2} placeholder="An ancient moss-covered stone golem statue holding a glowing lantern, fantasy, game asset" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <Select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          <option value="landmark">landmark</option>
          <option value="building">building</option>
          <option value="prop">prop</option>
          <option value="vegetation">vegetation</option>
          <option value="rock">rock</option>
        </Select>
        <Select value={quality} onChange={(e) => setQuality(e.target.value as Quality)}>
          <option value="refined">Refined · PBR textures (best)</option>
          <option value="preview">Preview · geometry only (fast)</option>
        </Select>
        <Select value={artStyle} onChange={(e) => setArtStyle(e.target.value as ArtStyle)}>
          <option value="stylized">stylized / cartoon</option>
          <option value="realistic">realistic</option>
          <option value="sculpture">sculpture</option>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label hint={`${polycount.toLocaleString()} tris`}>Polycount</Label>
          <Slider value={polycount} onChange={setPolycount} min={2000} max={60000} step={1000} />
        </div>
        <div>
          <Label hint={`${height} studs`}>Height in world</Label>
          <Slider value={height} onChange={setHeight} min={2} max={80} step={1} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="xs" variant="outline" icon={<ImageIcon size={11} />} onClick={() => void pickImage()}>
          {image ? image.name : "Reference image (image → 3D)"}
        </Button>
        {image && (
          <Button size="xs" variant="ghost" onClick={() => setImage(null)}>
            clear
          </Button>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-[11px] text-muted">
          <Switch checked={publishAfter} onChange={setPublishAfter} disabled={!keys.openCloud} /> publish to Roblox
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="brand" loading={busy} disabled={(!prompt.trim() && !image) || !providerOk} icon={<Sparkles size={12} />} onClick={() => void run()}>
          Generate 3D model
        </Button>
        <Button size="sm" variant="outline" disabled={busy} icon={<Upload size={12} />} onClick={() => void importFile()}>
          Import GLB
        </Button>
        {!providerOk && <span className="text-warn">Add the Meshy key in Settings</span>}
      </div>
      {busy && progress > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
          <div className="h-full bg-brand transition-all" style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      )}
      {status && <div className="rounded-md bg-panel-2 p-2 text-[11px]">{status}</div>}

      <div>
        <Label>Library ({assets.length})</Label>
        {assets.length === 0 && <div className="text-[11px] text-faint">No hero model yet. Generate one above or import a GLB (+ FBX for Roblox).</div>}
        <div className="grid grid-cols-3 gap-1.5">
          {assets.map((r) => (
            <HeroThumb key={r.id} record={r} projectPath={project.path} active={selected?.id === r.id} onClick={() => onSelect(selected?.id === r.id ? null : r)} />
          ))}
        </div>
      </div>

      {selected && (
        <div className="space-y-2 rounded-md border border-line p-2">
          <div className="text-sm font-semibold">{selected.name}</div>
          <div className="text-[11px] text-muted">
            {selected.provider} · {selected.quality} · {selected.triangles?.toLocaleString() ?? "?"} tris · {selected.category} · {selected.robloxAssetId ? `Roblox asset ${selected.robloxAssetId}` : "not published"}
          </div>
          <div>
            <Label hint={`${selected.heightStuds} studs`}>Height in world</Label>
            <Slider value={selected.heightStuds} onChange={(v) => void setAssetHeight(selected, v)} min={2} max={120} step={1} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="xs" variant="brand" icon={<MapPin size={11} />} disabled={!bake} onClick={() => place(selected)}>
              Place in world
            </Button>
            <Button size="xs" variant="outline" icon={<CloudUpload size={11} />} loading={busy} disabled={!keys.openCloud || !selected.fbx} onClick={() => void doPublish(selected)}>
              {selected.robloxAssetId ? "Re-publish" : "Publish to Roblox"}
            </Button>
            <Button size="xs" variant="outline" icon={<Box size={11} />} loading={busy} disabled={!selected.robloxAssetId || !mcp.available} onClick={() => void doInsert(selected)}>
              Insert in Studio
            </Button>
            <Button size="xs" variant="ghost" icon={<Trash2 size={11} />} className="ml-auto text-err" onClick={() => void remove(selected)}>
              Delete
            </Button>
          </div>
          <div className="text-[11px] text-faint">
            {selected.robloxAssetId ? "Placed instances spawn the real Roblox model at runtime (InsertService:LoadAsset); the viewer shows the GLB." : "Without a Roblox asset id the game shows a placeholder box: publish first (Open Cloud key + creator id in the Roblox tab)."}
          </div>
        </div>
      )}
    </div>
  );
}

function HeroThumb({ record, projectPath, active, onClick }: { record: MeshAssetRecord; projectPath: string; active: boolean; onClick: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!record.thumbnail) return;
    fs.readBinaryBase64(path.join(projectPath, record.thumbnail))
      .then((b64) => alive && setSrc(`data:image/png;base64,${b64}`))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [record.thumbnail, projectPath]);
  return (
    <button onClick={onClick} className={cn("flex flex-col items-stretch overflow-hidden rounded-md border text-left", active ? "border-brand bg-brand-soft" : "border-line hover:bg-panel-2")} title={record.prompt}>
      <div className="flex h-16 items-center justify-center bg-panel-2">{src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <Box size={18} className="text-faint" />}</div>
      <div className="truncate px-1.5 py-1 text-[10px]">
        {record.name}
        {record.robloxAssetId ? " ✓" : ""}
      </div>
    </button>
  );
}
