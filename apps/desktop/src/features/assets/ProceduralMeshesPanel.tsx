import { Boxes, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { uniqueMeshes, type MeshAssetManifest } from "@worldforge/roblox-export";
import { Button } from "@/components/ui";
import { loadMeshManifest, resolveMeshIds, uploadProjectMeshes } from "@/lib/proceduralMeshes";
import { opencloud } from "@/lib/tauri";
import { useProjects } from "@/stores/projectStore";
import { cloudClient, useRoblox } from "@/stores/robloxStore";
import { useWorld } from "@/stores/worldStore";

/**
 * The bake's procedural meshes (rocks, cliffs, tree crowns — a handful of shared shapes) published as real
 * Roblox mesh assets: ASCII FBX → Open Cloud "Model" asset → MeshId resolved in Studio. Once published the
 * runtime spawns them with CreateMeshPartAsync(rbxassetid) instead of client-side EditableMeshes (no mesh
 * budget, normal replication), and the world export stamps the ids into WorldBake.json.
 */
export function ProceduralMeshesPanel() {
  const project = useProjects((s) => s.current);
  const bake = useWorld((s) => s.bake);
  const [manifest, setManifest] = useState<MeshAssetManifest | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    if (!project) return;
    void loadMeshManifest(project.path).then(setManifest).catch(() => setManifest(null));
    void opencloud.hasKey().then(setHasKey).catch(() => setHasKey(false));
  }, [project?.path, bake]);

  const meshes = bake ? uniqueMeshes(bake) : [];
  const published = meshes.filter((m) => (manifest?.entries[m.hash]?.meshId ?? 0) > 0).length;
  const uploaded = meshes.filter((m) => (manifest?.entries[m.hash]?.modelAssetId ?? 0) > 0).length;

  const publish = async () => {
    if (!project || !bake) return;
    const creator = { userId: project.meta.roblox.creatorUserId, groupId: project.meta.roblox.creatorGroupId };
    if (!creator.userId && !creator.groupId) {
      setBusy("set the creator user id (or group id) of your Open Cloud key in the Roblox tab first");
      return;
    }
    setBusy("publishing…");
    try {
      const next = await uploadProjectMeshes(
        project.path,
        bake,
        async (filePath, name) => {
          const op = await cloudClient.createAsset({ filePath, fileName: filePath.split(/[\\/]/).pop() ?? "mesh.fbx", assetType: "Model", displayName: name, description: "WorldForge procedural mesh", creator });
          const id = op.assetId ?? (await cloudClient.waitForAsset(op.operationId));
          return Number(id);
        },
        setBusy,
      );
      const roblox = useRoblox.getState();
      if (roblox.mcp.studios.length > 0) await resolveMeshIds(project.path, next, (code, dm) => roblox.runLuau(code, dm), setBusy);
      setManifest({ ...next });
      const pending = Object.values(next.entries).filter((e) => e.modelAssetId > 0 && e.meshId === 0).length;
      if (pending > 0) setBusy(`uploaded — connect Studio (Roblox tab) and click Publish again to resolve ${pending} mesh ids`);
      else {
        // re-export the world so WorldBake.json carries the ids
        await useWorld.getState().reexport();
        setBusy(null);
      }
    } catch (e) {
      setBusy(`publish failed: ${(e as Error).message ?? e}`);
    }
  };

  if (meshes.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
          <Boxes size={12} /> Procedural meshes
        </div>
        <span className="text-[10px] text-faint">
          {meshes.length} meshes · {uploaded} uploaded · {published} in place
        </span>
      </div>
      <p className="text-[11px] text-muted">Rocks, cliffs and tree crowns share {meshes.length} procedural shapes. Published as Roblox mesh assets they replicate like any mesh (no per-client rebuild, no mesh budget); otherwise clients rebuild them from the bake.</p>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" icon={<Upload size={12} />} loading={busy?.startsWith("publishing") || busy?.startsWith("uploading") || busy?.startsWith("resolving") || false} disabled={!hasKey || !bake} title={hasKey ? "Upload the meshes as Roblox Model assets (Open Cloud) and resolve their MeshIds in Studio" : "Add an Open Cloud key in Settings to publish"} onClick={() => void publish()}>
          Publish meshes to Roblox
        </Button>
        <span className="self-center text-[10px] text-faint">{meshes.map((m) => `${m.key}${(manifest?.entries[m.hash]?.meshId ?? 0) > 0 ? " ✓" : ""}`).join(" · ")}</span>
      </div>
      {busy && <div className="rounded-md bg-panel-2 p-2 text-[11px]">{busy}</div>}
    </div>
  );
}
