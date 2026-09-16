import { Image as ImageIcon, RefreshCw, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import type { TextureManifest } from "@worldforge/textures";
import { Button } from "@/components/ui";
import { generateProjectTextures, loadTextureManifest, resolveTextureImageIds, textureManifestPreviews, uploadProjectTextures, type GeneratedTexturePreview } from "@/lib/textures";
import { opencloud } from "@/lib/tauri";
import { useProjects } from "@/stores/projectStore";
import { cloudClient, useRoblox } from "@/stores/robloxStore";
import { useWorld } from "@/stores/worldStore";

/**
 * Custom PBR textures for the project's style: generated locally (seamless colour / normal / roughness
 * maps per material), previewed here, uploaded to Roblox as images when an Open Cloud key exists. Uploaded
 * sets become MaterialVariants built into the place by Rojo (terrain + parts); the viewer uses the PNGs.
 */
export function TexturesPanel() {
  const project = useProjects((s) => s.current);
  const style = useWorld((s) => s.style);
  const spec = useWorld((s) => s.spec);
  const [manifest, setManifest] = useState<TextureManifest | null>(null);
  const [previews, setPreviews] = useState<GeneratedTexturePreview[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [showNormal, setShowNormal] = useState(false);

  useEffect(() => {
    if (!project) return;
    let live = true;
    void loadTextureManifest(project.path).then(async (m) => {
      if (!live) return;
      setManifest(m);
      setPreviews(m ? await textureManifestPreviews(project.path, m) : []);
    });
    void opencloud.hasKey().then(setHasKey).catch(() => setHasKey(false));
    return () => {
      live = false;
    };
  }, [project?.path]);

  const generate = async () => {
    if (!project || !style) return;
    setBusy("generating…");
    try {
      const res = await generateProjectTextures(project.path, style, spec?.seed ?? 1337, { size: 512, onProgress: (d, t, id) => setBusy(`generating ${id} (${d}/${t})`) });
      setManifest(res.manifest);
      setPreviews(res.previews);
      await useWorld.getState().setTextures(res.manifest);
      setBusy(null);
    } catch (e) {
      setBusy(`failed: ${(e as Error).message ?? e}`);
    }
  };

  const upload = async () => {
    if (!project || !manifest) return;
    const creator = { userId: project.meta.roblox.creatorUserId, groupId: project.meta.roblox.creatorGroupId };
    if (!creator.userId && !creator.groupId) {
      setBusy("set the creator user id (or group id) of your Open Cloud key in the Roblox tab first");
      return;
    }
    setBusy("uploading…");
    try {
      let next = await uploadProjectTextures(
        project.path,
        manifest,
        async (filePath, name) => {
          const op = await cloudClient.createAsset({ filePath, fileName: filePath.split(/[\\/]/).pop() ?? "texture.png", assetType: "Decal", displayName: name, creator });
          const id = op.assetId ?? (await cloudClient.waitForAsset(op.operationId));
          return Number(id);
        },
        setBusy,
      );
      // MaterialVariants need the image ids behind the decals: Studio resolves them (connect it and upload again otherwise)
      const roblox = useRoblox.getState();
      if (roblox.mcp.studios.length > 0) next = await resolveTextureImageIds(project.path, next, (code, dm) => roblox.runLuau(code, dm), setBusy);
      else if (next.entries.some((e) => e.assetIds.color && !(e.imageIds?.color ?? 0))) setBusy("uploaded — connect Studio (Roblox tab) and click Upload again to resolve the image ids");
      setManifest(next);
      await useWorld.getState().setTextures(next);
      setBusy(null);
    } catch (e) {
      setBusy(`upload failed: ${(e as Error).message ?? e}`);
    }
  };

  const uploaded = manifest ? manifest.entries.filter((e) => e.assetIds.color > 0).length : 0;
  const resolved = manifest ? manifest.entries.filter((e) => (e.imageIds?.color ?? 0) > 0).length : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
          <ImageIcon size={12} /> Custom textures
        </div>
        {manifest && (
          <span className="text-[10px] text-faint">
            {manifest.entries.length} sets · {manifest.size}px · {uploaded} uploaded · {resolved} in place
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted">Seamless colour / normal / roughness maps generated from the style palette (grass, ground, rock, sand, snow, cobblestone, planks, brick, metal, ice…). Uploaded sets are built into the place as MaterialVariants (terrain + parts); until then Roblox's base materials, tinted by the palette, stay in place.</p>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="brand" icon={<RefreshCw size={12} />} loading={busy?.startsWith("generating") ?? false} disabled={!project || !style} onClick={() => void generate()}>
          {manifest ? "Regenerate" : "Generate"}
        </Button>
        <Button size="sm" variant="outline" icon={<Upload size={12} />} loading={busy?.startsWith("uploading") ?? false} disabled={!manifest || !hasKey} title={hasKey ? "Upload the PNGs as Roblox image assets (Open Cloud)" : "Add an Open Cloud key in Settings to upload"} onClick={() => void upload()}>
          Upload to Roblox
        </Button>
        {previews.length > 0 && (
          <button className="text-[11px] text-muted underline" onClick={() => setShowNormal(!showNormal)}>
            {showNormal ? "colour maps" : "normal maps"}
          </button>
        )}
      </div>
      {busy && <div className="rounded-md bg-panel-2 p-2 text-[11px]">{busy}</div>}
      {previews.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {previews.map((p) => {
            const entry = manifest?.entries.find((e) => e.id === p.id);
            return (
              <div key={p.id} className="space-y-0.5" title={`${p.id} → ${entry?.baseMaterial} · ${entry?.studsPerTile} studs/tile${entry?.assetIds.color ? ` · asset ${entry.assetIds.color}` : ""}`}>
                <img src={showNormal ? p.normal : p.color} alt={p.id} className="aspect-square w-full rounded-md border border-line object-cover" style={{ imageRendering: "auto" }} />
                <div className="truncate text-center text-[10px] text-muted">
                  {p.id}
                  {entry?.assetIds.color ? " ✓" : ""}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
