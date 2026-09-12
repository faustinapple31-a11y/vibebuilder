import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Box, Image as ImageIcon, Library, Music, PersonStanding, Search, ShoppingBag, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Input, Label } from "@/components/ui";
import { fs } from "@/lib/tauri";
import { insertAssetLuau, listLibrary, removeFromLibrary, searchCreatorStore, type LibraryAsset, type StoreAsset, type ToolboxCategory } from "@/lib/toolbox";
import { cn } from "@/lib/utils";
import { useAgents } from "@/stores/agentStore";
import { useGame } from "@/stores/gameStore";
import { useRoblox } from "@/stores/robloxStore";
import { useWorld } from "@/stores/worldStore";
import { AudioRow } from "@/features/game/GameView";

const CATEGORIES: { id: ToolboxCategory; label: string; icon: React.ReactNode }[] = [
  { id: "models", label: "Models", icon: <Box size={13} /> },
  { id: "meshes", label: "Meshes", icon: <Box size={13} /> },
  { id: "decals", label: "Images & icons", icon: <ImageIcon size={13} /> },
  { id: "audio", label: "Audio", icon: <Music size={13} /> },
  { id: "animations", label: "Animations", icon: <PersonStanding size={13} /> },
];

const SUGGESTIONS: Record<ToolboxCategory, string[]> = {
  models: ["treasure chest", "market stall", "lantern", "fantasy sword", "campfire", "wooden bridge"],
  meshes: ["crystal", "mushroom", "rock", "tree stump", "barrel"],
  decals: ["coin icon", "gem icon", "chest icon", "potion icon", "ticket icon", "gift box icon"],
  audio: ["forest ambience", "medieval music", "coin pickup", "magic sparkle", "night crickets", "victory jingle"],
  animations: ["dance", "wave", "sword swing", "idle", "sit", "cheer"],
};

/**
 * Shared toolbox: search the Roblox Creator Store (millions of public models, meshes, images, sounds,
 * animations) and browse the app-wide library (generated / imported files, shared by all projects).
 * Assets go straight into the game: insert in Studio, place as a hero mesh, use as shop icon, music,
 * zone ambience, SFX or NPC/emote animation.
 */
export function ToolboxView() {
  const [category, setCategory] = useState<ToolboxCategory>("models");
  const [query, setQuery] = useState("treasure chest");
  const [results, setResults] = useState<StoreAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryAsset[]>([]);
  const [tab, setTab] = useState<"store" | "library">("store");
  const runLuau = useRoblox((s) => s.runLuau);
  const mcp = useRoblox((s) => s.mcp);
  const game = useGame((s) => s.game);
  const loadGame = useGame((s) => s.load);
  const updateGame = useGame((s) => s.update);
  const upsertShopItem = useGame((s) => s.upsertShopItem);
  const setTabWs = useAgents((s) => s.setTab);
  const meshAssets = useWorld((s) => s.meshAssets);

  const refreshLibrary = async () => setLibrary(await listLibrary());
  useEffect(() => {
    void refreshLibrary();
    void loadGame();
  }, [loadGame]);

  const search = async (more = false) => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await searchCreatorStore(category, query, { cursor: more ? cursor : undefined });
      setResults(more ? [...results, ...res.items] : res.items);
      setTotal(res.total);
      setCursor(res.nextCursor);
    } catch (e) {
      setStatus((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const insert = async (a: StoreAsset) => {
    setStatus(`Inserting ${a.name} in Studio…`);
    setStatus(await runLuau(insertAssetLuau(a.id, a.name, a.category), "Edit"));
  };
  const useAs = async (a: StoreAsset, what: "icon" | "music" | "zone" | "sfx" | "emote" | "idle") => {
    if (!game) return;
    const id = `rbxassetid://${a.id}`;
    if (what === "icon") {
      const item = game.shop.items[0];
      if (!item) return setStatus("Add a shop item first (Game → Interfaces & shop)");
      await upsertShopItem({ ...item, iconAssetId: a.id });
      setStatus(`Icon of "${item.name}" set to ${a.name} (${a.id}) — change the target item in the Game tab`);
    } else if (what === "music") {
      await updateGame({ audio: { ...game.audio, ambientMusic: id } });
      setStatus(`Ambient music: ${a.name}`);
    } else if (what === "zone") {
      await updateGame({ audio: { ...game.audio, zoneAmbience: [...game.audio.zoneAmbience, { zone: "village", soundId: id, volume: 0.5 }] } });
      setStatus(`Zone ambience (village): ${a.name}`);
    } else if (what === "sfx") {
      await updateGame({ audio: { ...game.audio, sfx: { ...game.audio.sfx, collect: id } } });
      setStatus(`Collect SFX: ${a.name}`);
    } else if (what === "emote") {
      await updateGame({ animations: { ...game.animations, emotes: [...game.animations.emotes, { id: `store_${a.id}`, name: a.name, animationId: id }] } });
      setStatus(`Emote added: ${a.name}`);
    } else if (what === "idle") {
      await updateGame({ animations: { ...game.animations, npcIdle: id } });
      setStatus(`NPC idle: ${a.name}`);
    }
  };
  const importFile = async () => {
    const file = await openDialog({ multiple: false, filters: [{ name: "Asset", extensions: ["png", "jpg", "jpeg", "webp", "mp3", "ogg", "wav", "glb", "fbx", "rbxmx", "rbxm"] }] });
    if (!file) return;
    const p = typeof file === "string" ? file : (file as { path: string }).path;
    const ext = p.split(".").pop()?.toLowerCase() ?? "";
    const cat: LibraryAsset["category"] = ["png", "jpg", "jpeg", "webp"].includes(ext) ? "image" : ["mp3", "ogg", "wav"].includes(ext) ? "audio" : ["glb", "fbx"].includes(ext) ? "mesh" : "model";
    const { importToLibrary } = await import("@/lib/toolbox");
    await importToLibrary(p, cat);
    await refreshLibrary();
    setTab("library");
  };

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="panel flex items-center gap-2 p-2">
        <Library size={16} className="text-brand" />
        <div className="text-sm font-semibold">Shared toolbox</div>
        <div className="ml-2 flex rounded-md border border-line p-0.5">
          <button onClick={() => setTab("store")} className={cn("rounded px-2 py-1 text-xs", tab === "store" && "bg-brand-soft text-brand")}>
            Creator Store
          </button>
          <button onClick={() => setTab("library")} className={cn("rounded px-2 py-1 text-xs", tab === "library" && "bg-brand-soft text-brand")}>
            My library ({library.length + meshAssets.length})
          </button>
        </div>
        <span className="ml-auto text-[11px] text-faint">{mcp.available ? "Studio connected: insert works" : "Connect Studio (Roblox tab) to insert assets"}</span>
        <Button size="sm" variant="outline" icon={<Upload size={12} />} onClick={() => void importFile()}>
          Import file
        </Button>
        <Button size="sm" variant="ghost" icon={<Sparkles size={12} />} onClick={() => setTabWs("assets")}>
          Generate with AI
        </Button>
      </div>

      {tab === "store" && (
        <div className="panel flex min-h-0 flex-1 flex-col gap-2 p-3">
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-line p-0.5">
              {CATEGORIES.map((c) => (
                <button key={c.id} onClick={() => setCategory(c.id)} className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs", category === c.id && "bg-brand-soft text-brand")}>
                  {c.icon} {c.label}
                </button>
              ))}
            </div>
            <div className="relative flex-1">
              <Search size={12} className="absolute left-2 top-2.5 text-faint" />
              <Input className="pl-6" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void search()} placeholder="Search the Roblox Creator Store…" />
            </div>
            <Button size="sm" variant="brand" loading={busy} onClick={() => void search()}>
              Search
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {SUGGESTIONS[category].map((s) => (
              <button key={s} onClick={() => { setQuery(s); setTimeout(() => void search(), 0); }} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted hover:bg-panel-2">
                {s}
              </button>
            ))}
            {total > 0 && <span className="ml-auto text-[11px] text-faint">{total.toLocaleString()} results</span>}
          </div>
          {status && <div className="rounded-md bg-panel-2 p-2 text-[11px]">{status}</div>}
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="grid grid-cols-4 gap-2 xl:grid-cols-6">
              {results.map((a) => (
                <div key={a.id} className="flex flex-col overflow-hidden rounded-md border border-line bg-panel">
                  <div className="flex h-28 items-center justify-center bg-panel-2">{a.thumbnail ? <img src={a.thumbnail} alt="" className="h-full w-full object-cover" /> : <Box size={20} className="text-faint" />}</div>
                  <div className="flex flex-1 flex-col gap-1 p-1.5">
                    <div className="truncate text-xs font-medium" title={a.description}>
                      {a.name}
                    </div>
                    <div className="text-[10px] text-faint">
                      {a.creator}
                      {a.verified ? " ✓" : ""} · 👍 {a.upVotes}
                      {a.duration ? ` · ${Math.round(a.duration)}s` : ""}
                      {a.triangles ? ` · ${a.triangles.toLocaleString()} tris` : ""}
                    </div>
                    <div className="mt-auto flex flex-wrap gap-1">
                      {(category === "models" || category === "meshes" || category === "audio") && (
                        <Button size="xs" variant="outline" disabled={!mcp.available} onClick={() => void insert(a)}>
                          Insert in Studio
                        </Button>
                      )}
                      {category === "decals" && (
                        <Button size="xs" variant="outline" icon={<ShoppingBag size={10} />} onClick={() => void useAs(a, "icon")}>
                          Shop icon
                        </Button>
                      )}
                      {category === "audio" && (
                        <>
                          <Button size="xs" variant="ghost" onClick={() => void useAs(a, "music")}>
                            music
                          </Button>
                          <Button size="xs" variant="ghost" onClick={() => void useAs(a, "zone")}>
                            zone
                          </Button>
                          <Button size="xs" variant="ghost" onClick={() => void useAs(a, "sfx")}>
                            sfx
                          </Button>
                        </>
                      )}
                      {category === "animations" && (
                        <>
                          <Button size="xs" variant="ghost" onClick={() => void useAs(a, "emote")}>
                            emote
                          </Button>
                          <Button size="xs" variant="ghost" onClick={() => void useAs(a, "idle")}>
                            NPC idle
                          </Button>
                        </>
                      )}
                      <span className="ml-auto font-mono text-[10px] text-faint">{a.id}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {cursor && results.length > 0 && (
              <div className="p-2 text-center">
                <Button size="sm" variant="outline" loading={busy} onClick={() => void search(true)}>
                  Load more
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "library" && (
        <div className="panel min-h-0 flex-1 overflow-auto p-3">
          <LibraryPanel library={library} onChange={refreshLibrary} />
        </div>
      )}
    </div>
  );
}

function LibraryPanel({ library, onChange }: { library: LibraryAsset[]; onChange: () => Promise<void> }) {
  const meshAssets = useWorld((s) => s.meshAssets);
  const setTabWs = useAgents((s) => s.setTab);
  const images = library.filter((a) => a.category === "image");
  const audio = library.filter((a) => a.category === "audio");
  const others = library.filter((a) => a.category === "mesh" || a.category === "model");
  return (
    <div className="space-y-4 text-xs">
      <div>
        <Label>Images & icons ({images.length})</Label>
        <div className="grid grid-cols-6 gap-2 xl:grid-cols-8">
          {images.map((a) => (
            <LibraryImage key={a.id} asset={a} onRemove={() => void removeFromLibrary(a).then(onChange)} />
          ))}
          {images.length === 0 && <div className="col-span-full text-[11px] text-faint">Generate icons in Assets → Generate with AI (Gemini) or import PNGs; upload them as decals from the Game tab to use as shop icons.</div>}
        </div>
      </div>
      <div>
        <Label>Music & sounds ({audio.length})</Label>
        <div className="space-y-1.5">
          {audio.map((a) => (
            <AudioRow key={a.id} asset={a} busy={false} canUpload={false} onUpload={() => setTabWs("game")} />
          ))}
          {audio.length === 0 && <div className="text-[11px] text-faint">No audio yet — Generate SFX/music (ElevenLabs) or import files; wire them in Game → Music & sounds.</div>}
        </div>
      </div>
      <div>
        <Label>3D models ({meshAssets.length + others.length})</Label>
        <div className="flex flex-wrap gap-2">
          {meshAssets.map((m) => (
            <button key={m.id} onClick={() => setTabWs("assets")} className="rounded-md border border-line px-2 py-1.5 text-left hover:bg-panel-2">
              <div className="font-medium">{m.name}</div>
              <div className="text-[10px] text-faint">
                {m.provider} · {m.triangles?.toLocaleString() ?? "?"} tris{m.robloxAssetId ? ` · asset ${m.robloxAssetId}` : ""}
              </div>
            </button>
          ))}
          {others.map((a) => (
            <div key={a.id} className="rounded-md border border-line px-2 py-1.5">
              <div className="font-medium">{a.name}</div>
              <div className="text-[10px] text-faint">{a.subcategory}</div>
            </div>
          ))}
          {meshAssets.length + others.length === 0 && <div className="text-[11px] text-faint">Hero 3D models live in Assets → Hero 3D models (generate, import GLB, publish to Roblox).</div>}
        </div>
      </div>
    </div>
  );
}

function LibraryImage({ asset, onRemove }: { asset: LibraryAsset; onRemove: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fs.readBinaryBase64(asset.filePath)
      .then((b64) => alive && setSrc(`data:image/${asset.subcategory === "jpg" ? "jpeg" : asset.subcategory || "png"};base64,${b64}`))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [asset.filePath, asset.subcategory]);
  return (
    <div className="group relative overflow-hidden rounded-md border border-line bg-panel-2">
      <div className="flex h-20 items-center justify-center">{src ? <img src={src} alt="" className="h-full w-full object-contain" /> : <ImageIcon size={16} className="text-faint" />}</div>
      <div className="truncate px-1 py-0.5 text-[10px]" title={asset.name}>
        {asset.name}
      </div>
      <button onClick={onRemove} className="absolute right-1 top-1 hidden rounded bg-panel/90 p-0.5 text-err group-hover:block">
        <Trash2 size={11} />
      </button>
    </div>
  );
}
