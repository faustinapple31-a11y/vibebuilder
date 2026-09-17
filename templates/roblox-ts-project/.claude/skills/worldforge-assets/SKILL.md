---
name: worldforge-assets
description: "Manage the content of a WorldForge project: shop catalog (coin items, gamepasses, developer products) in design/game.spec.json → src/shared/catalog.ts, NPCs and quests, keyframe animations (src/shared/animations.ts), audio manifest (design/audio.manifest.json → src/shared/audio.ts), asset manifest (design/asset.manifest.json), hero meshes from the shared toolbox (assets/models), Roblox asset ids. Use when asked to add items, passes, products, sounds, music, animations, NPC dialogue, quests, or to import / reference 3D models and audio."
---

# WorldForge — assets & content

Content is data first: edit `design/*.json`, then the generated TypeScript modules under `src/shared/`
are rebuilt by WorldForge (`catalog.ts`, `animations.ts`, `audio.ts`, `npcs.ts`, `quests.ts`, `recipes.ts`).
Editing the TS directly is fine for a quick fix, but a regeneration overwrites it — mirror the change in the
JSON.

## Shop, gamepasses, developer products (`design/game.spec.json` → `shop`, `monetization`)

- Coin items: `{ id, name, description, section, price, consumable, effect }` with `effect.type` ∈
  `multiplier` (stat × value), `buff` (durationSeconds), `grant_coins`, `grant_item`, `cosmetic`.
- Gamepasses (`kind: "gamepass"`, permanent) and developer products (`kind: "product"`, consumable) carry
  `priceRobux` and `robloxId`. `robloxId: 0` means "not created yet": WorldForge creates the pass / product
  on Roblox at publish time and writes the id back — never invent ids. The server prompts through
  `MarketplaceService` (`ShopPromptRobux`) and grants in `ProcessReceipt` / `UserOwnsGamePassAsync`
  (`src/systems/Shop.ts`); keep every grant server-side and idempotent (receipt ids).
- Balance: a first purchase ≈ 49–99 R$ that is *convenient* (2× coins, extra pet slot), a VIP pass ≈ 199–399 R$,
  never pay-to-win in competitive genres (battle / racing) — cosmetics only there.
- Sections show in `ShopUi` in catalog order; keep 3–6 items per section.

## NPCs, quests, recipes

- `npcs[]`: `{ id, name, role (merchant|quest_giver|guard|villager|enemy|companion|zombie|monster|boss|animal|shopkeeper|trainer), zone, dialogue[] }`.
  Runtime: `src/systems/Npcs.ts` spawns them at the zone marker with a ProximityPrompt → `NpcTalk`.
- `quests[]`: `{ id, title, giver, objectives[{ type: collect|reach|talk|defeat|survive|build|escape|win_rounds|score|craft|deliver, target, count }], rewards }`;
  systems call `Progression.progressQuest(player, type, target, n)`.
- `recipes` (crafting): inputs → output item; crafting stations are zone-anchored.

## Animations (`design/game.spec.json` → `animations`, `src/shared/anim/keyframes.ts`)

Procedural keyframe clips (no uploaded animation ids needed): `{ id, name, loop, priority, keyframes:
[{ t: 0..1, joints: { RightShoulder: [x,y,z] deg, … } }] }`. Played by the runtime on R15 rigs
(`AnimationController` fallback → `Motor6D` tweening). Use for attacks, emotes, NPC idles, vehicle seats.
Uploaded animations (emotes: `{ id, name, animationId }`) only load when the publishing account owns them.

## Audio (`design/audio.manifest.json` → `src/shared/audio.ts`)

`music[]` (loops per zone / phase), `sfx[]` (collect, purchase, hit, ui_click, checkpoint…), `ambience[]`
(zone-anchored). Each entry has a text `prompt`; the audio provider configured in the WorldForge app
(ElevenLabs or another) renders it and fills `file` / `robloxAssetId` — leave those empty. Runtime
(`src/systems/Audio.ts`) crossfades ambience by zone and plays sfx through `PlaySfx(key)`.
Audio assets must be uploaded by the publishing account (Roblox audio privacy) — WorldForge does this at publish.

## 3D models, toolbox, hero meshes

- The world is procedural (PartList prefabs). Extra models go in `assets/models/` (`.rbxmx`, `.obj`,
  `.glb`) and are declared in `design/asset.manifest.json` → `required[]` with a resolution:
  `prefab` (procedural id), `registry` (WorldForge shared toolbox id — 45 000+ CC0 / Roblox-free assets),
  `generate` (image / mesh / audio provider prompt), `roblox` (asset id owned by the account).
- Never copy proprietary assets, logos or names. Toolbox entries carry a `license`; keep CC0 / own assets.
- Hero meshes replace a prefab's placeholder PartList at runtime when the asset loads; keep the placeholder
  so the map still works offline.

## Custom textures (`design/textures.manifest.json` → `src/shared/textures.ts`)

WorldForge generates a seamless PBR texture set from the style palette (Assets → Custom textures):
colour / normal / roughness PNGs under `assets/textures/<style>/` for grass, leafy grass, ground, mud,
rock, slate, sand, snow, cobblestone, wood planks, brick, metal, ice (+ lava). Uploading them (Open Cloud,
image assets) fills `assetIds`; `src/world/Materials.ts` then creates a `MaterialVariant` per entry
(+ `TerrainDetail` faces) and overrides the base material for terrain and parts. Ids at 0 → the base
material with the palette tint stays. Regenerating keeps the ids of a same-style set. To restyle a
material by hand, edit the manifest entry (`studsPerTile`) or replace the PNG and re-upload.

## Procedural meshes

Rocks / cliffs are triangle meshes shipped in the bake (`PrefabVariant.meshes`, parts of shape `mesh`)
and exported as `assets/meshes/<key>_<hash>.obj` / `.fbx`. Without upload the server builds them with
EditableMesh (`shared/world/meshFactory.ts`) and every client rebuilds + `ApplyMesh`es them
(`client/MeshRender.ts`) — keep distinct meshes ≤ 6 (client memory budget); variety comes from scale /
rotation / colour. Once published from the WorldForge app (Assets → Procedural meshes: FBX → Open Cloud
Model → MeshId resolved in Studio, `design/meshes.manifest.json`), `MeshData.assetId` is set and the
server spawns real mesh assets (`CreateMeshPartAsync(rbxassetid)`), replicated like any MeshPart.

## Checklist

1. JSON validates against the GameSpec / manifest schemas (WorldForge shows errors in the Design panel).
2. `npx rbxtsc` after any `src/shared/*` change.
3. Every purchasable has an effect the player can feel and a matching `Notify` / SFX.
4. Mention every `robloxId: 0` left for WorldForge to create at publish.
