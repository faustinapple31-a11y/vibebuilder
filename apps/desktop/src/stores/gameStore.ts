import { create } from "zustand";
import { GameSpecSchema, pickUiKit, type GameSpec, type ShopItem } from "@worldforge/core";
import { buildConfigTs } from "@worldforge/agents";
import { buildGameFiles, defaultGameContent } from "@worldforge/roblox-export";
import { readJsonFile, writeJsonFile } from "@/lib/files";
import { fs, path } from "@/lib/tauri";
import { useProjects } from "./projectStore";
import { cloudClient, useRoblox } from "./robloxStore";

/**
 * GameSpec editor state: shop items, monetization (game passes / developer products published through
 * Open Cloud), animations, audio and NPCs. Every save rewrites design/game.spec.json and the generated
 * data modules (src/shared/config.ts, catalog.ts, animations.ts, audio.ts, npcs.ts) of the project.
 */
interface GameState {
  game: GameSpec | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  publishLog: string[];
  load: () => Promise<void>;
  update: (patch: Partial<GameSpec> | ((g: GameSpec) => GameSpec)) => Promise<void>;
  // shop
  upsertShopItem: (item: ShopItem) => Promise<void>;
  removeShopItem: (id: string) => Promise<void>;
  // monetization
  upsertPass: (pass: GameSpec["monetization"]["gamepasses"][number]) => Promise<void>;
  upsertProduct: (product: GameSpec["monetization"]["developerProducts"][number]) => Promise<void>;
  removeMonetization: (kind: "gamepass" | "product", id: string) => Promise<void>;
  /** Creates missing passes / products on Roblox (Open Cloud) and stores their ids. */
  publishMonetization: () => Promise<void>;
  /** Spawns an R15 rig in Studio and plays the animation (catalog id or custom spec id). */
  previewAnimationInStudio: (animationIdOrSpecId: string) => Promise<string>;
}

async function regenerate(projectPath: string, game: GameSpec): Promise<void> {
  await writeJsonFile(path.join(projectPath, "design", "game.spec.json"), game);
  await fs.writeText(path.join(projectPath, "src", "shared", "config.ts"), buildConfigTs(game));
  await fs.writeFiles(projectPath, buildGameFiles(game).map((f) => [f.path, f.content]));
}

export const useGame = create<GameState>((set, get) => ({
  game: null,
  loading: false,
  saving: false,
  error: null,
  publishLog: [],

  async load() {
    const cur = useProjects.getState().current;
    if (!cur) return set({ game: null });
    set({ loading: true, error: null });
    try {
      const raw = await readJsonFile<unknown>(path.join(cur.path, "design", "game.spec.json"));
      const parsed = raw ? GameSpecSchema.safeParse(raw) : null;
      // projects saved before the UI kit libraries existed: pick the one their style / genre implies
      const hadKit = typeof (raw as { ui?: { kit?: unknown } } | null)?.ui?.kit === "string";
      let game: GameSpec;
      if (parsed?.success) {
        game = parsed.data;
        // older specs without shop content get the starter set (never overwrite user data)
        if (game.shop.items.length === 0 && game.monetization.gamepasses.length === 0) {
          const d = defaultGameContent();
          game = { ...game, shop: d.shop, monetization: d.monetization, animations: game.animations.emotes.length ? game.animations : d.animations, npcs: game.npcs.length ? game.npcs : d.npcs };
          await regenerate(cur.path, game);
        }
        if (!hadKit) {
          game = { ...game, ui: { ...game.ui, kit: pickUiKit(game.description, game.ui.style, game.genre) } };
          await regenerate(cur.path, game);
        }
      } else {
        game = GameSpecSchema.parse({ title: cur.row.name, ...defaultGameContent() });
        await regenerate(cur.path, game);
      }
      set({ game, loading: false });
    } catch (e) {
      set({ loading: false, error: (e as Error).message ?? String(e) });
    }
  },

  async update(patch) {
    const cur = useProjects.getState().current;
    const game = get().game;
    if (!cur || !game) return;
    const next = GameSpecSchema.parse(typeof patch === "function" ? patch(game) : { ...game, ...patch });
    set({ game: next, saving: true });
    try {
      await regenerate(cur.path, next);
    } catch (e) {
      set({ error: (e as Error).message ?? String(e) });
    } finally {
      set({ saving: false });
    }
  },

  async upsertShopItem(item) {
    await get().update((g) => {
      const items = g.shop.items.some((i) => i.id === item.id) ? g.shop.items.map((i) => (i.id === item.id ? item : i)) : [...g.shop.items, item];
      return { ...g, shop: { ...g.shop, items } };
    });
  },
  async removeShopItem(id) {
    await get().update((g) => ({ ...g, shop: { ...g.shop, items: g.shop.items.filter((i) => i.id !== id) } }));
  },
  async upsertPass(pass) {
    await get().update((g) => {
      const list = g.monetization.gamepasses.some((p) => p.id === pass.id) ? g.monetization.gamepasses.map((p) => (p.id === pass.id ? pass : p)) : [...g.monetization.gamepasses, pass];
      return { ...g, monetization: { ...g.monetization, gamepasses: list } };
    });
  },
  async upsertProduct(product) {
    await get().update((g) => {
      const list = g.monetization.developerProducts.some((p) => p.id === product.id) ? g.monetization.developerProducts.map((p) => (p.id === product.id ? product : p)) : [...g.monetization.developerProducts, product];
      return { ...g, monetization: { ...g.monetization, developerProducts: list } };
    });
  },
  async removeMonetization(kind, id) {
    await get().update((g) => ({
      ...g,
      monetization: kind === "gamepass" ? { ...g.monetization, gamepasses: g.monetization.gamepasses.filter((p) => p.id !== id) } : { ...g.monetization, developerProducts: g.monetization.developerProducts.filter((p) => p.id !== id) },
    }));
  },

  async publishMonetization() {
    const cur = useProjects.getState().current;
    const game = get().game;
    if (!cur || !game) return;
    const universeId = cur.meta.roblox.universeId;
    const log = (m: string) => set((s) => ({ publishLog: [...s.publishLog.slice(-50), m] }));
    if (!universeId) {
      log("Set the universe id in the Roblox tab first (Open Cloud key with universe scopes).");
      return;
    }
    let next = game;
    for (const pass of game.monetization.gamepasses) {
      if (pass.robloxId) continue;
      try {
        log(`creating game pass "${pass.name}" (${pass.priceRobux} R$)…`);
        const created = await cloudClient.createGamePass(universeId, { name: pass.name, description: pass.description, priceRobux: pass.priceRobux });
        next = { ...next, monetization: { ...next.monetization, gamepasses: next.monetization.gamepasses.map((p) => (p.id === pass.id ? { ...p, robloxId: created.id } : p)) } };
        log(`game pass "${pass.name}" → id ${created.id}`);
      } catch (e) {
        log(`game pass "${pass.name}" failed: ${(e as Error).message}`);
      }
    }
    for (const product of game.monetization.developerProducts) {
      if (product.robloxId) continue;
      try {
        log(`creating developer product "${product.name}" (${product.priceRobux} R$)…`);
        const created = await cloudClient.createDeveloperProduct(universeId, { name: product.name, description: product.description, priceInRobux: product.priceRobux });
        const id = Number(created.productId ?? created.id);
        next = { ...next, monetization: { ...next.monetization, developerProducts: next.monetization.developerProducts.map((p) => (p.id === product.id ? { ...p, robloxId: id } : p)) } };
        log(`developer product "${product.name}" → id ${id}`);
      } catch (e) {
        log(`developer product "${product.name}" failed: ${(e as Error).message}`);
      }
    }
    await get().update(next);
    log("catalog regenerated (src/shared/catalog.ts) — rebuild & deploy to use the new ids in-game");
  },

  async previewAnimationInStudio(animationIdOrSpecId) {
    if (!get().game) await get().load();
    const game = get().game;
    const custom = game?.animations.custom.find((c) => c.id === animationIdOrSpecId);
    const specJson = custom ? JSON.stringify(custom) : "nil";
    const animId = custom ? "" : animationIdOrSpecId;
    const code = `local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local KSP = game:GetService("KeyframeSequenceProvider")
local folder = workspace:FindFirstChild("WorldForgePreview") or Instance.new("Folder")
folder.Name = "WorldForgePreview"; folder.Parent = workspace
local old = folder:FindFirstChild("AnimRig"); if old then old:Destroy() end
local desc = Instance.new("HumanoidDescription")
local rig = Players:CreateHumanoidModelFromDescription(desc, Enum.HumanoidRigType.R15)
rig.Name = "AnimRig"
for _, d in ipairs(rig:GetDescendants()) do if d:IsA("BasePart") then d.Anchored = false end end
local cam = workspace.CurrentCamera
local pos = cam.CFrame.Position + cam.CFrame.LookVector * 14
local ray = workspace:Raycast(pos + Vector3.new(0, 100, 0), Vector3.new(0, -400, 0))
local ground = ray and ray.Position or pos
rig:PivotTo(CFrame.lookAt(ground + Vector3.new(0, 3.2, 0), Vector3.new(cam.CFrame.Position.X, ground.Y + 3.2, cam.CFrame.Position.Z)))
rig.Parent = folder
local humanoid = rig:FindFirstChildOfClass("Humanoid")
local animator = humanoid:FindFirstChildOfClass("Animator") or Instance.new("Animator", humanoid)
local anim = Instance.new("Animation")
local specJson = ${JSON.stringify(specJson)}
if specJson ~= "nil" then
  local spec = HttpService:JSONDecode(specJson)
  local seq = Instance.new("KeyframeSequence")
  seq.Loop = spec.loop
  local parentOf = { LowerTorso = "HumanoidRootPart", UpperTorso = "LowerTorso", Head = "UpperTorso", LeftUpperArm = "UpperTorso", LeftLowerArm = "LeftUpperArm", LeftHand = "LeftLowerArm", RightUpperArm = "UpperTorso", RightLowerArm = "RightUpperArm", RightHand = "RightLowerArm", LeftUpperLeg = "LowerTorso", LeftLowerLeg = "LeftUpperLeg", LeftFoot = "LeftLowerLeg", RightUpperLeg = "LowerTorso", RightLowerLeg = "RightUpperLeg", RightFoot = "RightLowerLeg" }
  local jointPart = { Root = "LowerTorso", Waist = "UpperTorso", Neck = "Head", LeftShoulder = "LeftUpperArm", LeftElbow = "LeftLowerArm", LeftWrist = "LeftHand", RightShoulder = "RightUpperArm", RightElbow = "RightLowerArm", RightWrist = "RightHand", LeftHip = "LeftUpperLeg", LeftKnee = "LeftLowerLeg", LeftAnkle = "LeftFoot", RightHip = "RightUpperLeg", RightKnee = "RightLowerLeg", RightAnkle = "RightFoot" }
  for _, kf in ipairs(spec.keyframes) do
    local frame = Instance.new("Keyframe"); frame.Time = kf.t * spec.durationSeconds
    local poses = {}
    local function make(part)
      if poses[part] then return poses[part] end
      local p = Instance.new("Pose"); p.Name = part; p.EasingStyle = Enum.PoseEasingStyle.Cubic; p.EasingDirection = Enum.PoseEasingDirection.InOut
      poses[part] = p
      if parentOf[part] then p.Parent = make(parentOf[part]) end
      return p
    end
    local root = make("HumanoidRootPart")
    for part in pairs(parentOf) do make(part) end
    for joint, deg in pairs(kf.joints) do
      local part = jointPart[joint] or joint
      make(part).CFrame = CFrame.fromEulerAnglesXYZ(math.rad(deg[1]), math.rad(deg[2]), math.rad(deg[3]))
    end
    root.Parent = frame; frame.Parent = seq
  end
  anim.AnimationId = KSP:RegisterKeyframeSequence(seq)
else
  anim.AnimationId = ${JSON.stringify(animId)}
end
local track = animator:LoadAnimation(anim)
track.Looped = true
track:Play()
-- in Edit mode the Animator does not tick by itself: step it from the plugin context for 30 s
local RunService = game:GetService("RunService")
if not RunService:IsRunning() then
  task.spawn(function()
    local t0 = os.clock()
    while os.clock() - t0 < 30 and rig.Parent do
      local dt = RunService.Heartbeat:Wait()
      local ok = pcall(function() animator:StepAnimations(dt) end)
      if not ok then break end
    end
  end)
end
return string.format("rig spawned at %s, playing %s for 30 s (%.1fs clip)", tostring(ground), anim.AnimationId, track.Length)`;
    return useRoblox.getState().runLuau(code, "Edit");
  },
}));
