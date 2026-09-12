import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { CloudUpload, Coins, Crown, ExternalLink, Music, PersonStanding, Play, Plus, ShoppingBag, Trash2, Upload, Volume2, Wand2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AnimSpec, GameSpec, ShopEffect, ShopItem } from "@worldforge/core";
import { creatorDashboardUrls } from "@worldforge/roblox-cloud";
import { Button, Input, Label, Select, Slider, Switch, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import { openUrl } from "@tauri-apps/plugin-opener";
import { fs } from "@/lib/tauri";
import { listLibrary, setLibraryRobloxId, type LibraryAsset } from "@/lib/toolbox";
import { useGame } from "@/stores/gameStore";
import { useProjects } from "@/stores/projectStore";
import { cloudClient, useRoblox } from "@/stores/robloxStore";
import { useSettings } from "@/stores/settingsStore";

type Section = "shop" | "monetization" | "animations" | "audio";

/**
 * Game tab: everything the generated experience sells, plays and sounds like.
 * Shop items (in-game currency), game passes & developer products (published on Roblox through Open
 * Cloud), NPC/emote animations (catalog + procedural), music & sounds (library, upload, wiring).
 * Every change rewrites design/game.spec.json and the generated data modules of the project.
 */
export function GameView() {
  const game = useGame((s) => s.game);
  const load = useGame((s) => s.load);
  const error = useGame((s) => s.error);
  const [section, setSection] = useState<Section>("shop");
  useEffect(() => {
    void load();
  }, [load]);
  if (!game) return <div className="p-6 text-sm text-muted">{error ?? "Loading game spec…"}</div>;
  const nav: { id: Section; label: string; icon: React.ReactNode; count: number }[] = [
    { id: "shop", label: "Interfaces & shop", icon: <ShoppingBag size={14} />, count: game.shop.items.length },
    { id: "monetization", label: "Gamepasses & products", icon: <Crown size={14} />, count: game.monetization.gamepasses.length + game.monetization.developerProducts.length },
    { id: "animations", label: "Animations", icon: <PersonStanding size={14} />, count: game.animations.emotes.length + game.animations.custom.length },
    { id: "audio", label: "Music & sounds", icon: <Music size={14} />, count: (game.audio.ambientMusic ? 1 : 0) + game.audio.zoneAmbience.length },
  ];
  return (
    <div className="grid h-full grid-cols-[220px_1fr] gap-3 p-3">
      <aside className="panel flex flex-col gap-1 p-2">
        {nav.map((n) => (
          <button key={n.id} onClick={() => setSection(n.id)} className={cn("flex items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-panel-2", section === n.id && "bg-brand-soft text-brand")}>
            {n.icon}
            <span className="flex-1 font-medium">{n.label}</span>
            <span className="rounded-full bg-panel-2 px-1.5 text-[10px] text-muted">{n.count}</span>
          </button>
        ))}
        <div className="mt-auto rounded-md bg-panel-2 p-2 text-[11px] text-faint">
          {game.title} · {game.genre} · saved to design/game.spec.json → src/shared/config.ts, catalog.ts, animations.ts, audio.ts, npcs.ts
        </div>
      </aside>
      <div className="panel min-h-0 overflow-auto p-4">
        {section === "shop" && <ShopEditor game={game} />}
        {section === "monetization" && <MonetizationPanel game={game} />}
        {section === "animations" && <AnimationsPanel game={game} />}
        {section === "audio" && <AudioPanel game={game} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- shop
const EFFECT_TYPES: ShopEffect["type"][] = ["multiplier", "buff", "grant_coins", "grant_item", "cosmetic"];

function ShopEditor({ game }: { game: GameSpec }) {
  const upsert = useGame((s) => s.upsertShopItem);
  const remove = useGame((s) => s.removeShopItem);
  const update = useGame((s) => s.update);
  const [editing, setEditing] = useState<ShopItem | null>(null);
  const newItem = (): ShopItem => ({ id: `item_${Date.now().toString(36)}`, name: "New item", description: "", section: game.shop.sections[0]?.id ?? "upgrades", price: 100, consumable: false, effect: { type: "multiplier", stat: "coins", value: 2, durationSeconds: 0 } });
  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center gap-2">
        <ShoppingBag size={16} className="text-brand" />
        <div className="text-sm font-semibold">In-game shop</div>
        <Input className="ml-4 w-48" value={game.shop.title} onChange={(e) => void update({ shop: { ...game.shop, title: e.target.value } })} />
        <Button size="sm" variant="brand" icon={<Plus size={12} />} className="ml-auto" onClick={() => setEditing(newItem())}>
          Add item
        </Button>
      </div>
      <div className="text-[11px] text-faint">The shop window (HUD button / key B) is generated from this list: upgrade cards, potion rows with "You have: N", and the Robux section from Monetization. Purchases are validated server-side; effects are multipliers, timed buffs, coin grants or cosmetics.</div>
      {game.shop.sections.map((sec) => (
        <div key={sec.id}>
          <Label>{sec.title}</Label>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
            {game.shop.items
              .filter((i) => i.section === sec.id)
              .map((i) => (
                <button key={i.id} onClick={() => setEditing(i)} className="flex flex-col gap-1 rounded-md border border-line p-2 text-left hover:bg-panel-2" style={{ borderLeftColor: i.color ?? "#b48cff", borderLeftWidth: 4 }}>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{i.name}</span>
                    <span className="ml-auto rounded-full bg-panel-2 px-2 py-0.5 text-[10px]">{i.consumable ? "consumable" : "upgrade"}</span>
                  </div>
                  <div className="line-clamp-2 text-[11px] text-muted">{i.description}</div>
                  <div className="text-[11px]">
                    <span className="font-mono">{i.price}</span> {game.currencies[0]?.name ?? "coins"} · {describeEffect(i.effect)}
                  </div>
                </button>
              ))}
          </div>
        </div>
      ))}
      {editing && (
        <div className="space-y-2 rounded-md border border-brand/40 bg-brand-soft/30 p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Name</Label>
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <Label>Section</Label>
              <Select value={editing.section} onChange={(e) => setEditing({ ...editing, section: e.target.value })}>
                {game.shop.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea rows={2} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div>
              <Label>Price ({game.currencies[0]?.name ?? "coins"})</Label>
              <Input type="number" value={editing.price} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Effect</Label>
              <Select value={editing.effect.type} onChange={(e) => setEditing({ ...editing, effect: { ...editing.effect, type: e.target.value as ShopEffect["type"] } })}>
                {EFFECT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Stat / item</Label>
              <Input value={editing.effect.stat ?? ""} placeholder="coins · food · luck · speed" onChange={(e) => setEditing({ ...editing, effect: { ...editing.effect, stat: e.target.value || undefined } })} />
            </div>
            <div>
              <Label>Value</Label>
              <Input type="number" value={editing.effect.value} onChange={(e) => setEditing({ ...editing, effect: { ...editing.effect, value: Number(e.target.value) } })} />
            </div>
          </div>
          <div className="grid grid-cols-4 items-end gap-2">
            <div>
              <Label>Duration (s, buffs)</Label>
              <Input type="number" value={editing.effect.durationSeconds} onChange={(e) => setEditing({ ...editing, effect: { ...editing.effect, durationSeconds: Number(e.target.value) } })} />
            </div>
            <div>
              <Label>Card colour</Label>
              <Input value={editing.color ?? ""} placeholder="#8a3fbf" onChange={(e) => setEditing({ ...editing, color: /^#[0-9a-fA-F]{6}$/.test(e.target.value) ? e.target.value : undefined })} />
            </div>
            <div>
              <Label>Icon (decal asset id)</Label>
              <Input value={editing.iconAssetId ?? ""} placeholder="from the Toolbox" onChange={(e) => setEditing({ ...editing, iconAssetId: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
            <label className="flex items-center gap-2 pb-2 text-[11px]">
              <Switch checked={editing.consumable} onChange={(v) => setEditing({ ...editing, consumable: v })} /> consumable
            </label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="brand" onClick={() => void upsert(editing).then(() => setEditing(null))}>
              Save item
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            {game.shop.items.some((i) => i.id === editing.id) && (
              <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} className="ml-auto text-err" onClick={() => void remove(editing.id).then(() => setEditing(null))}>
                Delete
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function describeEffect(e: ShopEffect): string {
  switch (e.type) {
    case "multiplier":
      return `×${e.value} ${e.stat ?? "coins"}`;
    case "buff":
      return `×${e.value} ${e.stat ?? "luck"} for ${Math.round(e.durationSeconds / 60)} min`;
    case "grant_coins":
      return `+${e.value} coins`;
    case "grant_item":
      return `+${e.value} ${e.item ?? "item"}`;
    default:
      return "cosmetic";
  }
}

// ---------------------------------------------------------------- monetization
function MonetizationPanel({ game }: { game: GameSpec }) {
  const project = useProjects((s) => s.current)!;
  const keys = useSettings((s) => s.keys);
  const upsertPass = useGame((s) => s.upsertPass);
  const upsertProduct = useGame((s) => s.upsertProduct);
  const remove = useGame((s) => s.removeMonetization);
  const publish = useGame((s) => s.publishMonetization);
  const log = useGame((s) => s.publishLog);
  const [busy, setBusy] = useState(false);
  const universeId = project.meta.roblox.universeId;
  const pending = game.monetization.gamepasses.filter((p) => !p.robloxId).length + game.monetization.developerProducts.filter((p) => !p.robloxId).length;
  const row = (kind: "gamepass" | "product", item: { id: string; name: string; description: string; priceRobux: number; robloxId?: number }) => (
    <div key={`${kind}_${item.id}`} className="flex items-center gap-2 rounded-md border border-line p-2">
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-md", kind === "gamepass" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>{kind === "gamepass" ? <Crown size={14} /> : <Coins size={14} />}</span>
      <div className="min-w-0 flex-1">
        <Input value={item.name} className="mb-1" onChange={(e) => void (kind === "gamepass" ? upsertPass({ ...(item as GameSpec["monetization"]["gamepasses"][number]), name: e.target.value }) : upsertProduct({ ...(item as GameSpec["monetization"]["developerProducts"][number]), name: e.target.value }))} />
        <div className="text-[10px] uppercase tracking-wide text-faint">
          {kind === "gamepass" ? "gamepass" : "dev product"} · {item.robloxId ? `Roblox id ${item.robloxId}` : "not created on Roblox yet"}
        </div>
      </div>
      <div className="flex items-center gap-1 rounded-full border border-line px-2 py-1 font-mono">
        <span className="text-[10px]">R$</span>
        <input className="w-14 bg-transparent text-right outline-none" type="number" value={item.priceRobux} onChange={(e) => void (kind === "gamepass" ? upsertPass({ ...(item as GameSpec["monetization"]["gamepasses"][number]), priceRobux: Number(e.target.value) }) : upsertProduct({ ...(item as GameSpec["monetization"]["developerProducts"][number]), priceRobux: Number(e.target.value) }))} />
      </div>
      <Button size="xs" variant="ghost" icon={<Trash2 size={11} />} onClick={() => void remove(kind, item.id)} />
    </div>
  );
  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center gap-2">
        <Crown size={16} className="text-brand" />
        <div className="text-sm font-semibold">Gamepasses & developer products</div>
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="outline" icon={<Plus size={12} />} onClick={() => void upsertPass({ id: `pass_${Date.now().toString(36)}`, name: "New pass", description: "", priceRobux: 99 })}>
            Gamepass
          </Button>
          <Button size="sm" variant="outline" icon={<Plus size={12} />} onClick={() => void upsertProduct({ id: `product_${Date.now().toString(36)}`, name: "New product", description: "", priceRobux: 49 })}>
            Dev product
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        {game.monetization.gamepasses.map((p) => row("gamepass", p))}
        {game.monetization.developerProducts.map((p) => row("product", p))}
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-panel-2 p-2">
        <Button size="sm" variant="brand" icon={<CloudUpload size={12} />} loading={busy} disabled={!keys.openCloud || !universeId || pending === 0} onClick={() => void (async () => { setBusy(true); try { await publish(); } finally { setBusy(false); } })()}>
          Create on Roblox ({pending} pending)
        </Button>
        <Button size="sm" variant="ghost" icon={<ExternalLink size={11} />} onClick={() => void openUrl(universeId ? creatorDashboardUrls(universeId).passes : "https://create.roblox.com/dashboard/creations")}>
          Creator Dashboard
        </Button>
        <span className="text-[11px] text-faint">{!keys.openCloud ? "Open Cloud key missing (Settings / .env)" : !universeId ? "universe id missing (Roblox tab)" : "Passes: game-passes API · Products: developer-products API. Ids are written into src/shared/catalog.ts; purchases run through MarketplaceService + ProcessReceipt."}</span>
      </div>
      {log.length > 0 && <pre className="max-h-40 overflow-auto rounded-md bg-panel-2 p-2 text-[11px]">{log.join("\n")}</pre>}
    </div>
  );
}

// ---------------------------------------------------------------- animations
const CATALOG_ANIMS: { name: string; id: string; kind: "idle" | "walk" | "emote" }[] = [
  { name: "Idle (default)", id: "rbxassetid://507766666", kind: "idle" },
  { name: "Idle 2 (look around)", id: "rbxassetid://507766951", kind: "idle" },
  { name: "Walk", id: "rbxassetid://507777826", kind: "walk" },
  { name: "Run", id: "rbxassetid://507767714", kind: "walk" },
  { name: "Wave", id: "rbxassetid://507770239", kind: "emote" },
  { name: "Point", id: "rbxassetid://507770453", kind: "emote" },
  { name: "Cheer", id: "rbxassetid://507770677", kind: "emote" },
  { name: "Laugh", id: "rbxassetid://507770818", kind: "emote" },
  { name: "Dance 1", id: "rbxassetid://507771019", kind: "emote" },
  { name: "Dance 2", id: "rbxassetid://507776043", kind: "emote" },
  { name: "Dance 3", id: "rbxassetid://507777268", kind: "emote" },
  { name: "Sit", id: "rbxassetid://2506281703", kind: "emote" },
];

const ANIM_PRESETS: AnimSpec[] = [
  { id: "sword_swing", name: "Sword swing", loop: false, priority: "Action", durationSeconds: 0.9, keyframes: [{ t: 0, joints: { RightShoulder: [0, 0, 20] } }, { t: 0.3, joints: { RightShoulder: [-40, 0, 160], Waist: [0, -25, 0] } }, { t: 0.55, joints: { RightShoulder: [60, 0, 40], Waist: [0, 30, 0] } }, { t: 1, joints: { RightShoulder: [0, 0, 20], Waist: [0, 0, 0] } }] },
  { id: "bow", name: "Bow", loop: false, priority: "Action", durationSeconds: 1.8, keyframes: [{ t: 0, joints: { Waist: [0, 0, 0] } }, { t: 0.4, joints: { Waist: [45, 0, 0], Neck: [15, 0, 0], LeftShoulder: [0, 0, -20], RightShoulder: [0, 0, 20] } }, { t: 0.7, joints: { Waist: [45, 0, 0], Neck: [15, 0, 0] } }, { t: 1, joints: { Waist: [0, 0, 0], Neck: [0, 0, 0] } }] },
  { id: "idle_bob", name: "Idle bob (loop)", loop: true, priority: "Idle", durationSeconds: 2.4, keyframes: [{ t: 0, joints: { Waist: [0, 0, 0], LeftShoulder: [0, 0, -4], RightShoulder: [0, 0, 4] } }, { t: 0.5, joints: { Waist: [3, 0, 0], LeftShoulder: [0, 0, -8], RightShoulder: [0, 0, 8], Neck: [-3, 0, 0] } }, { t: 1, joints: { Waist: [0, 0, 0], LeftShoulder: [0, 0, -4], RightShoulder: [0, 0, 4], Neck: [0, 0, 0] } }] },
  { id: "victory", name: "Victory pose", loop: false, priority: "Action", durationSeconds: 1.4, keyframes: [{ t: 0, joints: {} }, { t: 0.35, joints: { LeftShoulder: [0, 0, -170], RightShoulder: [0, 0, 170], Neck: [-15, 0, 0] } }, { t: 0.8, joints: { LeftShoulder: [0, 0, -170], RightShoulder: [0, 0, 170], Neck: [-15, 0, 0] } }, { t: 1, joints: { LeftShoulder: [0, 0, 0], RightShoulder: [0, 0, 0], Neck: [0, 0, 0] } }] },
];

function AnimationsPanel({ game }: { game: GameSpec }) {
  const update = useGame((s) => s.update);
  const preview = useGame((s) => s.previewAnimationInStudio);
  const mcp = useRoblox((s) => s.mcp);
  const [status, setStatus] = useState<string | null>(null);
  const a = game.animations;
  const play = async (id: string) => {
    setStatus("Spawning a rig in Studio…");
    try {
      setStatus(await preview(id));
    } catch (e) {
      setStatus((e as Error).message ?? String(e));
    }
  };
  const setEmote = (id: string, on: boolean) => {
    const cat = CATALOG_ANIMS.find((c) => c.id === id)!;
    const emotes = on ? [...a.emotes, { id: cat.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"), name: cat.name, animationId: cat.id }] : a.emotes.filter((e) => e.animationId !== id);
    void update({ animations: { ...a, emotes } });
  };
  const addPreset = (p: AnimSpec) => {
    if (a.custom.some((c) => c.id === p.id)) return;
    void update({ animations: { ...a, custom: [...a.custom, p] } });
  };
  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center gap-2">
        <PersonStanding size={16} className="text-brand" />
        <div className="text-sm font-semibold">Animations</div>
        <span className="ml-auto text-[11px] text-faint">{mcp.available ? "Preview spawns an R15 rig in Studio and plays the clip" : "Studio MCP not connected — previews unavailable"}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(["npcIdle", "npcWalk", "greet"] as const).map((slot) => (
          <div key={slot}>
            <Label>{slot === "npcIdle" ? "NPC idle" : slot === "npcWalk" ? "NPC walk" : "NPC greet (on Talk)"}</Label>
            <div className="flex gap-1">
              <Select value={a[slot]} onChange={(e) => void update({ animations: { ...a, [slot]: e.target.value } })} className="flex-1">
                {CATALOG_ANIMS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Button size="xs" variant="outline" icon={<Play size={11} />} disabled={!mcp.available} onClick={() => void play(a[slot])} />
            </div>
          </div>
        ))}
      </div>
      <div>
        <Label>Player emotes (Roblox catalog, free)</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {CATALOG_ANIMS.filter((c) => c.kind === "emote").map((c) => {
            const on = a.emotes.some((e) => e.animationId === c.id);
            return (
              <div key={c.id} className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5", on ? "border-brand bg-brand-soft" : "border-line")}>
                <Switch checked={on} onChange={(v) => setEmote(c.id, v)} />
                <span className="flex-1">{c.name}</span>
                <Button size="xs" variant="ghost" icon={<Play size={11} />} disabled={!mcp.available} onClick={() => void play(c.id)} />
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <Label hint="built at runtime from keyframes (KeyframeSequence)">Procedural animations</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {a.custom.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-md border border-line px-2 py-1.5">
              <span className="flex-1">
                {c.name} <span className="text-faint">· {c.keyframes.length} keyframes · {c.durationSeconds}s{c.loop ? " · loop" : ""}</span>
              </span>
              <Button size="xs" variant="ghost" icon={<Play size={11} />} disabled={!mcp.available} onClick={() => void play(c.id)} />
              <Button size="xs" variant="ghost" icon={<Trash2 size={11} />} onClick={() => void update({ animations: { ...a, custom: a.custom.filter((x) => x.id !== c.id) } })} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ANIM_PRESETS.map((p) => (
            <Button key={p.id} size="xs" variant="outline" icon={<Plus size={11} />} disabled={a.custom.some((c) => c.id === p.id)} onClick={() => addPreset(p)}>
              {p.name}
            </Button>
          ))}
        </div>
        <div className="mt-1 text-[11px] text-faint">Agents can add more in design/game.spec.json → animations.custom (joint Euler angles per keyframe on an R15 rig). Creator Store animations (Toolbox) can be used as ids too.</div>
      </div>
      {status && <div className="rounded-md bg-panel-2 p-2 text-[11px]">{status}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- audio
function AudioPanel({ game }: { game: GameSpec }) {
  const project = useProjects((s) => s.current)!;
  const keys = useSettings((s) => s.keys);
  const update = useGame((s) => s.update);
  const [library, setLibrary] = useState<LibraryAsset[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [zone, setZone] = useState("village");
  const a = game.audio;
  const refresh = async () => setLibrary(await listLibrary("audio"));
  useEffect(() => {
    void refresh();
  }, []);
  const creator = { userId: project.meta.roblox.creatorUserId, groupId: project.meta.roblox.creatorGroupId };

  const upload = async (asset: LibraryAsset) => {
    setBusy(asset.id);
    try {
      const op = await cloudClient.createAsset({ filePath: asset.filePath, fileName: asset.filePath.split(/[\\/]/).pop() ?? "sound.mp3", assetType: "Audio", displayName: asset.name, creator });
      const id = Number(op.assetId ?? (await cloudClient.waitForAsset(op.operationId)));
      await setLibraryRobloxId(asset, id);
      await refresh();
      setStatus(`${asset.name} → Roblox audio asset ${id}`);
    } catch (e) {
      setStatus((e as Error).message ?? String(e));
    } finally {
      setBusy(null);
    }
  };
  const importFile = async () => {
    const file = await openDialog({ multiple: false, filters: [{ name: "Audio", extensions: ["mp3", "ogg", "wav"] }] });
    if (!file) return;
    const p = typeof file === "string" ? file : (file as { path: string }).path;
    const { importToLibrary } = await import("@/lib/toolbox");
    await importToLibrary(p, "audio", undefined, ["music"]);
    await refresh();
  };
  const synthPack = async () => {
    setBusy("synth");
    try {
      const { synthesizeStarterPack } = await import("@/lib/localAudio");
      const made = await synthesizeStarterPack((label) => setStatus(`synthesizing ${label}…`));
      await refresh();
      setStatus(`${made.length} clips synthesized locally (8 SFX, 4 ambience loops, 2 music loops) — upload the ones you like to Roblox, then wire them below`);
    } catch (e) {
      setStatus((e as Error).message ?? String(e));
    } finally {
      setBusy(null);
    }
  };
  const idOf = (asset: LibraryAsset) => (asset.robloxAssetId ? `rbxassetid://${asset.robloxAssetId}` : null);
  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center gap-2">
        <Music size={16} className="text-brand" />
        <div className="text-sm font-semibold">Music & sounds</div>
        <Button size="sm" variant="outline" icon={<Wand2 size={12} />} className="ml-auto" loading={busy === "synth"} onClick={() => void synthPack()}>
          Synthesize starter pack
        </Button>
        <Button size="sm" variant="outline" icon={<Upload size={12} />} onClick={() => void importFile()}>
          Import audio
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Ambient music (rbxassetid://…)</Label>
          <Input value={a.ambientMusic ?? ""} placeholder="pick from the library or the Toolbox" onChange={(e) => void update({ audio: { ...a, ambientMusic: e.target.value || undefined } })} />
        </div>
        <div>
          <Label hint={`${Math.round(a.musicVolume * 100)}%`}>Music volume</Label>
          <Slider value={a.musicVolume} onChange={(v) => void update({ audio: { ...a, musicVolume: v } })} min={0} max={1} step={0.05} />
        </div>
      </div>
      <div>
        <Label>Sound effects</Label>
        <div className="grid grid-cols-2 gap-2">
          {(["collect", "purchase", "error", "notify"] as const).map((k) => (
            <div key={k} className="flex items-center gap-2">
              <span className="w-16 text-muted">{k}</span>
              <Input value={a.sfx[k] ?? ""} placeholder="built-in rbxasset://sounds/…" onChange={(e) => void update({ audio: { ...a, sfx: { ...a.sfx, [k]: e.target.value || undefined } } })} />
            </div>
          ))}
        </div>
      </div>
      <div>
        <Label>Zone ambience</Label>
        <div className="space-y-1">
          {a.zoneAmbience.map((z, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border border-line p-1.5">
              <span className="w-24 font-medium">{z.zone}</span>
              <span className="flex-1 truncate font-mono text-[11px]">{z.soundId}</span>
              <span className="text-faint">vol {z.volume}</span>
              <Button size="xs" variant="ghost" icon={<Trash2 size={11} />} onClick={() => void update({ audio: { ...a, zoneAmbience: a.zoneAmbience.filter((_, j) => j !== i) } })} />
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Label>Library (generated & imported)</Label>
          <span className="ml-auto text-[11px] text-faint">zone for "use as ambience":</span>
          <Input className="w-28" value={zone} onChange={(e) => setZone(e.target.value)} />
        </div>
        {library.length === 0 && <div className="text-[11px] text-faint">Empty — click <b>Synthesize starter pack</b> (offline procedural SFX, ambience and music loops), generate with AI in Assets (ElevenLabs), or import files. Upload to Roblox needs the Open Cloud key + creator id.</div>}
        <div className="space-y-1.5">
          {library.map((asset) => (
            <AudioRow key={asset.id} asset={asset} busy={busy === asset.id} canUpload={keys.openCloud && !!(creator.userId || creator.groupId)} onUpload={() => void upload(asset)} onUseMusic={idOf(asset) ? () => void update({ audio: { ...a, ambientMusic: idOf(asset)! } }) : undefined} onUseZone={idOf(asset) ? () => void update({ audio: { ...a, zoneAmbience: [...a.zoneAmbience, { zone, soundId: idOf(asset)!, volume: 0.5 }] } }) : undefined} onUseSfx={idOf(asset) ? (k) => void update({ audio: { ...a, sfx: { ...a.sfx, [k]: idOf(asset)! } } }) : undefined} />
          ))}
        </div>
      </div>
      {status && <div className="rounded-md bg-panel-2 p-2 text-[11px]">{status}</div>}
    </div>
  );
}

/** Audio row with a waveform (Web Audio decode → bars), play/pause, upload and wiring actions. */
export function AudioRow({ asset, busy, canUpload, onUpload, onUseMusic, onUseZone, onUseSfx }: { asset: LibraryAsset; busy: boolean; canUpload: boolean; onUpload: () => void; onUseMusic?: () => void; onUseZone?: () => void; onUseSfx?: (k: "collect" | "purchase" | "error" | "notify") => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [src, setSrc] = useState<string | null>(null);
  const mime = useMemo(() => (asset.filePath.endsWith(".ogg") ? "audio/ogg" : asset.filePath.endsWith(".wav") ? "audio/wav" : "audio/mpeg"), [asset.filePath]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const b64 = await fs.readBinaryBase64(asset.filePath);
        if (!alive) return;
        setSrc(`data:${mime};base64,${b64}`);
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const ctx = new AudioContext();
        const buf = await ctx.decodeAudioData(bytes.buffer.slice(0));
        if (!alive) return;
        setDuration(buf.duration);
        drawWave(canvas.current, buf);
        void ctx.close();
      } catch {
        /* undecodable: keep the row without a waveform */
      }
    })();
    return () => {
      alive = false;
    };
  }, [asset.filePath, mime]);
  const toggle = () => {
    if (!src) return;
    if (!audio.current) {
      audio.current = new Audio(src);
      audio.current.ontimeupdate = () => setTime(audio.current?.currentTime ?? 0);
      audio.current.onended = () => setPlaying(false);
    }
    if (playing) {
      audio.current.pause();
      setPlaying(false);
    } else {
      void audio.current.play();
      setPlaying(true);
    }
  };
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return (
    <div className="flex items-center gap-2 rounded-md border border-line p-2">
      <button onClick={toggle} className="flex h-8 w-8 items-center justify-center rounded-full bg-err text-white" title={playing ? "Pause" : "Play"}>
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{asset.name}</span>
          <span className="text-[10px] text-faint">{asset.source}</span>
          {asset.robloxAssetId && <span className="rounded-full bg-ok-soft px-1.5 text-[10px] text-ok">rbxassetid://{asset.robloxAssetId}</span>}
        </div>
        <canvas ref={canvas} width={480} height={28} className="mt-1 h-7 w-full" />
      </div>
      <span className="font-mono text-[10px] text-muted">
        {fmt(time)} / {fmt(duration)}
      </span>
      <div className="flex flex-col gap-1">
        <Button size="xs" variant="outline" icon={<CloudUpload size={11} />} loading={busy} disabled={!canUpload} onClick={onUpload}>
          {asset.robloxAssetId ? "Re-upload" : "Upload to Roblox"}
        </Button>
        <div className="flex gap-1">
          <Button size="xs" variant="ghost" disabled={!onUseMusic} onClick={onUseMusic}>
            music
          </Button>
          <Button size="xs" variant="ghost" disabled={!onUseZone} onClick={onUseZone}>
            zone
          </Button>
          <Button size="xs" variant="ghost" disabled={!onUseSfx} onClick={() => onUseSfx?.("collect")}>
            sfx
          </Button>
        </div>
      </div>
      <Volume2 size={12} className="text-faint" />
    </div>
  );
}

function drawWave(canvas: HTMLCanvasElement | null, buf: AudioBuffer): void {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const data = buf.getChannelData(0);
  const bars = 120;
  const step = Math.max(1, Math.floor(data.length / bars));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#e8735a";
  for (let i = 0; i < bars; i++) {
    let peak = 0;
    for (let j = 0; j < step; j++) peak = Math.max(peak, Math.abs(data[i * step + j] ?? 0));
    const h = Math.max(2, peak * canvas.height);
    const x = (i / bars) * canvas.width;
    ctx.fillRect(x, (canvas.height - h) / 2, canvas.width / bars - 1.5, h);
  }
}

