# WorldForge AI — Roblox Pipeline

`TypeScript (roblox-ts) → Luau (rbxtsc) → Rojo (build/serve) → Roblox Studio → Open Cloud (publish)`

Packages : `@worldforge/roblox-export`, `@worldforge/roblox-cloud`, template `templates/roblox-ts-project`,
commandes Rust `studio.rs`, `opencloud.rs`, `process.rs`.

---

## 1. Projet généré

```
<project>/
├── package.json            # devDependencies: roblox-ts, @rbxts/types, @rbxts/compiler-types, typescript
├── tsconfig.json           # roblox-ts preset (jsx off, noLib, typeRoots @rbxts, outDir out, rootDir src)
├── default.project.json    # Rojo tree (voir §2)
├── worldforge.json         # métadonnées WorldForge
├── src/
│   ├── server/main.server.ts            # bootstrap serveur (systèmes + world)
│   ├── client/main.client.ts            # bootstrap client (UI, atmosphère locale)
│   ├── shared/
│   │   ├── config.ts                    # constantes gameplay
│   │   ├── catalog.ts                   # shop (coins) + game passes / dev products (générés du GameSpec)
│   │   ├── animations.ts                # ids d'animations + AnimSpec custom
│   │   ├── audio.ts                     # musique, ambiances par zone, SFX
│   │   ├── npcs.ts                      # roster PNJ (nom, rôle, zone, dialogues)
│   │   ├── anim/keyframes.ts            # AnimSpec → KeyframeSequence (KeyframeSequenceProvider)
│   │   ├── net.ts                       # remotes typés (ShopState, ShopBuy, ShopPromptRobux, NpcTalk, PlaySfx…)
│   │   └── world/
│   │       ├── types.ts                 # types WorldBake côté Roblox
│   │       ├── decode.ts                # base64 + buffer decode
│   │       └── prefabFactory.ts         # PartList → Model
│   ├── world/
│   │   ├── WorldBuilder.ts              # terrain (WriteVoxels), placements, lighting, spawn
│   │   ├── TerrainBuilder.ts
│   │   └── Streaming.ts                 # LOD/cull, StreamingEnabled
│   ├── systems/                         # PlayerData (owned/inventory/multipliers/buffs), Shop, Npcs, Audio, Survival, Collectibles…
│   └── ui/                              # kits.generated.ts (16 librairies), kit.ts (thème, Window, boutons,
│                                        # icônes, ornements), Hud, ShopUi, Inventory,
│                                        # Quests, Crafting, Leaderboard, Teams, RoundStatus, Settings, Minimap, Menu
├── assets/
│   ├── world/WorldBake.json             # → ReplicatedStorage.WorldAssets.WorldBake (ModuleScript via Rojo)
│   └── models/*.rbxmx                   # prefabs individuels (asset browser)
├── worlds/main/world.spec.json
└── out/                                 # Luau compilé
```

## 2. Rojo `default.project.json`

```json
{
  "name": "<project>",
  "tree": {
    "$className": "DataModel",
    "ReplicatedStorage": {
      "rbxts_include": { "$path": "include", "node_modules": { "$className": "Folder", "@rbxts": { "$path": "node_modules/@rbxts" } } },
      "Shared": { "$path": "out/shared" },
      "WorldAssets": { "$path": "assets/world" }
    },
    "ServerScriptService": { "Server": { "$path": "out/server" }, "World": { "$path": "out/world" }, "Systems": { "$path": "out/systems" } },
    "StarterPlayer": { "StarterPlayerScripts": { "Client": { "$path": "out/client" }, "UI": { "$path": "out/ui" } } },
    "Workspace": { "$properties": { "StreamingEnabled": true, "StreamingMinRadius": 128, "StreamingTargetRadius": 768 } },
    "Lighting": { "$properties": { ... } },
    "SoundService": { "$properties": { "RespectFilteringEnabled": true } }
  }
}
```

Rojo transforme `assets/world/WorldBake.json` en ModuleScript retournant la table. Les tableaux volumineux
(heights, materials, placements) sont encodés en base64 pour rester compacts et éviter les limites de
constantes Luau ; ils sont décodés avec la librairie `buffer` de Luau.

## 3. Build

```
npm install (première fois)        → node_modules/@rbxts/*
rbxtsc                             → out/**/*.luau (erreurs TS parsées → panneau Logs + QA)
rojo build -o build/<project>.rbxl → place binaire
```

Statuts affichés : `● Build successful` / `● Build failed (N erreurs)`.

## 4. Roblox Studio

- Détection : `%LOCALAPPDATA%\Roblox\Versions\version-*\RobloxStudioBeta.exe` (Windows),
  `/Applications/RobloxStudio.app` (macOS), + registre `roblox-studio:` protocol.
- `OPEN IN STUDIO` : ouvre `build/<project>.rbxl` avec l'exécutable Studio.
- `SYNC PROJECT` : `rojo serve` (port 34872 par défaut) + installation du plugin Rojo (`rojo plugin install`)
  dans `%LOCALAPPDATA%\Roblox\Plugins`. L'utilisateur clique "Connect" dans le plugin Rojo ; statut affiché
  `● Project synced` quand un client est connecté (poll de `http://localhost:34872/api/rojo`).
- `RUN` : Studio doit être en Play. Sans MCP, l'app ouvre la place et guide ; avec le **Roblox Studio MCP**
  (serveur officiel `rbx-studio-mcp` + plugin), l'app peut exécuter `run_code` pour démarrer/arrêter le test,
  déclencher le bake terrain en mode édition et lire l'output.
- Logs : `%LOCALAPPDATA%\Roblox\logs\*_Studio_*.log` — tail en temps réel, extraction des erreurs Luau
  (`stack traces`, `Infinite yield`, `attempt to index nil`, …) → QA.

## 5. Terrain runtime

**Calibration (mesurée dans Studio par raycast).** Le terrain lisse de Roblox affiche sa surface une demi-voxel
(2 studs) *au-dessus* de `voxelBottom + occupancy × 4`. `TerrainBuilder` décale donc les hauteurs de
`SURFACE_BIAS = 2` avant la voxelisation et échantillonne la heightmap au centre de chaque voxel (moyenne des
4 cellules) : la surface rendue correspond à la heightmap à ±0,05 stud sur le plat. Sur les pentes raides le
lissage peut encore dévier : `WorldBuilder` fait un raycast terrain (eau ignorée) au pivot de chaque modèle et
applique l'écart mesuré entre la surface rendue et la heightmap, ce qui conserve l'intention du générateur
(enfoncement, inclinaison, contact de la base) par rapport au sol *réel*. Avant ces corrections les modèles
s'enfonçaient de 2 à 6 studs. Les prefabs `floating` (nénuphars) restent au niveau de l'eau.

**Stabilité Studio.** Un bake de ~40 000 parts avec `Lighting.Technology = Future` et 800 PointLights a fait
tomber le pilote GPU (`DXGI_ERROR_DEVICE_HUNG`, Studio se ferme). Par défaut : `ShadowMap` (option `technology`
du bake), lumières réservées aux éléments qui comptent (~400), historique d'annulation désactivé pendant le bake.
Studio est lancé détaché du job de l'app (un redémarrage de l'app ne le ferme plus).

`WorldBuilder` (serveur) au démarrage :
1. Décode `heights`/`materials`/`water`.
2. `Terrain:FillBlock` pour le socle (sous `minHeight`).
3. Pour chaque chunk 16×16 cellules : construit `materials[x][y][z]` et `occupancy[x][y][z]` sur la bande
   `[minH, maxH]` (matériau de surface sur 2 voxels, roche en dessous) puis `Terrain:WriteVoxels(region, 4, …)`.
   Occupancy fractionnaire sur le voxel de surface pour des pentes douces.
4. Eau : voxels `Water` jusqu'au niveau d'eau des cellules concernées.
5. `task.wait()` entre chunks (≈ 256 chunks pour 1024×1024, ~2-4 s).
6. Publie l'attribut `Workspace:SetAttribute("WorldReady", true)`.

Alternative "Bake to place" : exécuter le builder en mode édition via MCP puis sauvegarder ; les voxels
sont alors persistés dans la place et le script runtime se désactive (`WorldBake.prebaked = true`).

## 6. Open Cloud

Client `@worldforge/roblox-cloud` (fetch injectable). Dans l'app, les requêtes passent par la commande
Rust `oc_request` qui lit la clé dans le keyring et ajoute `x-api-key` — la clé n'est jamais envoyée au webview.

| Opération | Endpoint |
|---|---|
| Infos univers | `GET https://apis.roblox.com/cloud/v2/universes/{universeId}` |
| Infos place | `GET https://apis.roblox.com/cloud/v2/universes/{universeId}/places/{placeId}` |
| Publier une version | `POST https://apis.roblox.com/universes/v1/{universeId}/places/{placeId}/versions?versionType=Published` (body = `.rbxl`, `Content-Type: application/octet-stream`) |
| Sauvegarder (non publié) | idem avec `versionType=Saved` |
| Developer products | `GET/POST/PATCH https://apis.roblox.com/developer-products/v1/universes/{universeId}/developerproducts…` |
| Game passes | `GET https://apis.roblox.com/game-passes/v1/…` (création : Creator Dashboard ; l'app ouvre le lien) |
| Datastores (debug) | `https://apis.roblox.com/cloud/v2/universes/{u}/data-stores` |
| Upload d'un asset (Hero 3D) | `POST https://apis.roblox.com/assets/v1/assets` (multipart : `request` JSON `{assetType:"Model", creationContext:{creator:{userId|groupId}}}` + `fileContent` .fbx) puis `GET /assets/v1/operations/{id}` jusqu'à `done` → `assetId` |

Permissions requises sur la clé : `universe-places:write`, `universe.place:write`, `universe:read`,
`universe.developer-product:*` selon les fonctions utilisées.

## 7. Publication

```
BUILD → VALIDATE → PREVIEW → TEST → PUBLISH
```

`VALIDATE` produit un rapport :
- ✓ World : WorldSpec valide, bake présent, budgets respectés
- ✓ Scripts : `rbxtsc` OK, pas de `TODO_AGENT` restant, pas de `print` de debug massif
- ✓ Assets : références du manifest résolues, fichiers présents, tailles
- ✓ UI : modules UI compilent, pas de ScreenGui sans ResetOnSpawn défini
- ✓ Audio : ids/assets audio présents (ou manifest vide)
- ✓ Build : `.rbxl` produit, taille < limite
- ✓ Roblox connection : clé Open Cloud présente, universe/place accessibles

Puis `PUBLISH` envoie le `.rbxl` et affiche `versionNumber` retourné.

### Hero 3D models dans la place

Un prefab peut porter `source: { kind: "roblox_asset", assetId, glbPath, nativeSize }`. Au bake, `prefabFactory`
tente `InsertService:LoadAsset(assetId)` (pcall) : le modèle chargé est ancré, mis à l'échelle pour que sa hauteur
corresponde aux `bounds` du prefab, pivoté au centre-bas puis mis en cache comme les autres prefabs. En cas d'échec
(asset non publié, place non associée à un créateur, hors ligne) les parts placeholder du PartList sont utilisées.
Sur un serveur live, l'asset doit appartenir au créateur de l'expérience (c'est le cas : il est uploadé avec sa clé).

### Shop, game passes, developer products

`systems/Shop.ts` valide chaque achat côté serveur (`ShopBuy` RemoteFunction) : prix en coins, item non consommable
déjà possédé → refus, effets appliqués sur le profil (`multipliers`, `buffs` à durée, `inventory`, coins) et
répliqués au client (`ShopState`). Les items Robux passent par `MarketplaceService.PromptGamePassPurchase` /
`PromptProductPurchase` ; `ProcessReceipt` est idempotent (`PurchaseId` mémorisé dans le profil) et
`UserOwnsGamePassAsync` est re-synchronisé à la connexion. `ui/ShopUi.ts` dessine la fenêtre (bannière
*featured*, packs, sections, tiers "Owned", consommables "You have: N", cartes R$) ; touche **B** ou bouton HUD.

Le `GameSpec` porte aussi des **packs** (`shop.bundles`) et une **bannière featured** (`shop.featured`) :
`ShopCatalog.bundles` / `.featured` dans `shared/catalog.ts`, achat via l'id `bundle:<id>` (`systems/Shop.ts`
accorde les items du pack et le marque possédé une seule fois, prix barré et sticker de remise calculés depuis
les prix unitaires).

### Librairies UI (`src/ui/kits.generated.ts` + `src/ui/kit.ts`)

Chaque projet embarque les **16 librairies UI** de la taxonomie (voir TAXONOMY.md) dans
`src/ui/kits.generated.ts` — généré depuis `packages/core/src/taxonomy/ui-kits.ts` par
`scripts/sync-template.ts`. `GameConfig.ui.kit` en sélectionne une ; `src/ui/kit.ts` construit le `theme`
à partir de ses jetons et applique son langage de forme partout :

- couleurs : `paper` / `paperDark` / `ink` / `inkSoft` / `text` / `textDark`, dégradés `primary`, `gold`,
  `danger`, `info`, pastilles `pill`, tuiles `tile` ;
- formes : `radius`, `strokeThickness`, `gradients`, `shadowOffset`, `bevel`, `textOutline`,
  `panelTransparency` — un kit plat (pixel, militaire, HUD holo) n'a ni dégradé, ni biseau, ni ombre ;
- polices Roblox (`font`, `fontBody`) ;
- **ornement** dessiné par `ornament()` sur les panneaux assez grands : `rivets` (boulons),
  `scanlines` (lignes CRT), `brackets` (équerres de HUD), `filigree` (losanges dorés), `stripes` (bande
  de danger), `glow` (halo néon), `grain` (grain sale), `notch` (entaille gravée) ;
- **retour des boutons** : `squash`, `pulse`, `slide`, `flicker`, `none`.

Primitives : `panel`, `button`, `text`, `body`, `badge`, `strike`, `pill`, `progressBar`, `toggle`,
`slider`, `card`, `sectionHeader`, `gradient`, `shadow`, `tooltip`, `Window`, plus les icônes dessinées
(monnaie, Robux, potion, trèfle, dé, nourriture, éclair, couronne, `resourceIcon` pour un item
quelconque). Tout est en parts d'UI Roblox (Frame / UIStroke / UIGradient) : **aucun asset à uploader**,
et l'accent de la famille de style (`GameConfig.ui.accentColor`) colore les stickers promo.

Le prompt choisit la librairie (« je veux une UI retro » → `pixel_retro`, « interface néon cyberpunk » →
`neon_cyber`) ; sinon le style du monde décide. Dans l'app : onglet *Game → UI library & screens*
(sélecteur avec aperçu des couleurs, accent, et les écrans à monter).

`kit.Window` est la coquille commune de tous les écrans (fond assombri, panneau mis à l'échelle sur petit
écran, titre, pastille de monnaie, croix rouge, corps défilant) : `ShopUi` et tous les écrans ci-dessous
s'appuient dessus, donc ils s'ouvrent, se ferment et se redimensionnent de la même façon.

### Écrans (`GameSpec.ui.screens` → `GameConfig.ui.screens`)

Le client (`src/client/main.client.ts`) ne monte que les écrans listés par le genre ; chacun reçoit un
bouton HUD (seul accès sur mobile, empilés au-dessus du bouton Shop sur deux colonnes) et un raccourci
clavier. Un test (`packages/roblox-export/test/uiScreens.test.ts`) garantit que tout écran déclaré par un
genre est implémenté et monté.

| écran | fichier | source de données | touche |
|---|---|---|---|
| `hud`, `loading` | `ui/Hud.ts` | StatsChanged, HudValue, RoundState, WorldProgress | — |
| `shop`, `gamepass_shop` | `ui/ShopUi.ts` | `ShopCatalog` + ShopState | **B** |
| `inventory` | `ui/Inventory.ts` | ProfileState (`inventory`, `owned`) + ShopState (consommables, buffs) | **I** |
| `quests` | `ui/Quests.ts` | `QuestConfig` + ProfileState (`quests`) | **J** |
| `crafting` | `ui/Crafting.ts` | `RecipeConfig` + ProfileState (`inventory`), action `craft` | **C** |
| `leaderboard` | `ui/Leaderboard.ts` | `leaderstats` répliqués par Roblox | **L** |
| `teams` | `ui/Teams.ts` | attribut `Team` des joueurs + `RoundState.scores` | **T** |
| `round_status` | `ui/RoundStatus.ts` | RoundState (phase, compte à rebours, scores) | — |
| `settings` | `ui/Settings.ts` | ProfileState (`setting_*`), action `set_setting` | **O** |
| `minimap` | `ui/Minimap.ts` | WorldBake (hauteurs / eau / matériaux, landmarks, zones) | — |
| `menu` | `ui/Menu.ts` | les autres écrans activés | **M** |

`Remotes.ProfileState` (`ProfileStateMsg`) réplique le profil à chaque changement (`PlayerData.replicate`) :
coins, inventaire, items possédés, stats persistées et progression des quêtes (fournie par `Progression`
via `PlayerData.registerQuestProvider`) — c'est ce que lisent l'inventaire, les quêtes, le craft et les
réglages. Les réglages (volume musique / SFX, minimap, secousse caméra) sont appliqués côté client et
persistés dans le profil (`setting_<clé>`, 0…100) par l'action `set_setting`, donc ils reviennent à la
reconnexion. La minimap est dessinée à partir du bake que le client possède déjà (grille de frames
colorées par matériau et profondeur d'eau, points pour les landmarks / zones / spawn, flèche du joueur
orientée par la caméra) — aucun asset image.

### PNJ, animations, audio

`systems/Npcs.ts` crée des rigs R15 (`Players:CreateHumanoidModelFromDescription`) sur les marqueurs de zone
(`World/Zones`, un Part invisible par zone du bake), joue idle/walk/greet (ids du catalogue Roblox ou
`registerAnimSpec` pour les keyframes custom) et propose un ProximityPrompt *Talk* (`NpcTalk` → bulle HUD).
`systems/Audio.ts` : musique dans `SoundService`, ambiance par zone (crossfade sur le marqueur le plus proche),
SFX déclenchés par le serveur (`PlaySfx`). Sans asset id, les sons Roblox intégrés `rbxasset://sounds/*` servent
de défaut ; l'onglet Game uploade des fichiers audio via l'Assets API (`Audio`) et l'onglet Toolbox prend des sons
libres du Creator Store.

### Systèmes par genre

`GameConfig.systems` (généré depuis le GameSpec) active les modules de `src/systems/` : `Combat`
(armes, dégâts serveur, PvP selon le genre), `Enemies` (rigs R15 IA, pathfinding, chasse, respawn),
`Checkpoints` (obby / story / course, KillBrick), `Progression` (XP, jour-nuit, quêtes,
leaderboards), `Tycoon`, `Simulator` (backpack / vente / upgrades / rebirth), `Rounds` (lobby →
intermission → round → vainqueur, équipes, point de capture), `Racing` (véhicules physiques + portiques
+ tours), `TowerDefense` (vagues sur le chemin généré, tours sur pads), `Economy` (farming, mining,
crafting, pets, housing & jobs, trading), `Modes` (sport, puzzle, parkour, story, sandbox,
abilities, rhythm, minigames). Les ancres viennent des zones `World/Zones` (`shared/zones.ts`) écrites
par le générateur avec leurs attributs. Le HUD affiche un panneau de valeurs génériques (`HudValue`),
une bannière de round (`RoundState`) et une barre de vie ; raccourcis : V véhicule, P œuf, Q/F
capacités, Shift sprint, R rebirth, double saut (parkour), clic pour construire (sandbox).

### Environnement : météo, nuages, couleurs de terrain, portes

`WorldBuilder.applyLighting` applique en plus du Lighting : `Terrain:SetMaterialColor` pour chaque
matériau (couleurs de la palette du style), `Clouds` (couverture / densité / couleur), `Sky.CelestialBodiesShown`
(faux dans l'espace) et publie la météo en attributs de `Lighting` (`WeatherKind`, `WeatherIntensity`,
`WeatherColor`). `src/client/Weather.ts` rend la couche de particules autour de la caméra (textures
moteur `rbxasset://` uniquement) et réagit aux changements d'attributs (un système d'orage peut les
modifier à chaud). `src/systems/Doors.ts` pose un ProximityPrompt sur chaque part `Door` du monde et
la fait pivoter autour de sa charnière (fermeture automatique après 10 s). Template **v4**.

### Terrain v5 : voxels 3D, meshes, textures

`TerrainBuilder.applyTerrainOps` applique les opérations 3D du bake (grottes, surplombs, arches, lave) ;
`shared/world/meshFactory.ts` construit les meshes procéduraux (EditableMesh `FixedSize` →
`AssetService:CreateMeshPartAsync`, repli sur une primitive quand l'API manque) et publie leurs données
dans `ReplicatedStorage.WorldAssets.Meshes` ; `client/MeshRender.ts` reconstruit chaque mesh sur le
client et l'applique aux `MeshPart` marqués `WfMesh` (`ApplyMesh`) — au plus ~6 meshes distincts par
monde (budget mémoire client). Les `MaterialVariant` des textures uploadées sont construits par Rojo
(`assets/materials/*.model.json`, overrides `<Material>Name` de `MaterialService` dans le projet Rojo) ;
`world/Materials.ts` ne fait que ré-affirmer les overrides (`SetBaseMaterialOverride`) au démarrage.

## 8. Bridge MCP Studio (implémenté)

Roblox Studio embarque un serveur MCP (`StudioMCP.exe`, transport stdio). L'app le détecte à côté de l'exécutable
Studio, s'y connecte (`packages/agents/src/mcp/client.ts`, `studio.ts`) et expose dans l'onglet Roblox :

| Action | Outils MCP utilisés | Effet |
|---|---|---|
| Sync scripts | `execute_luau` | `out/**/*.luau` → Sources des Script/LocalScript/ModuleScript (arborescence de `default.project.json`), sans plugin Rojo |
| Push bake | `execute_luau` | `assets/world/WorldBake.json` envoyé par chunks de 150 000 caractères dans `ReplicatedStorage.WorldAssets.WorldBakeJson` (StringValues) ; le runtime `loadBake()` le lit en priorité |
| Bake world | `execute_luau` | `WorldBuilder.buildWorld` en mode édition : terrain voxel + ~3 700 modèles ; `Workspace.WorldPrebaked = true` |
| Play-test | `start_stop_play`, `get_console_output` | 20 s de jeu, console parsée en diagnostics |
| Screenshot | `execute_luau` (caméra) + `screen_capture` | PNG dans `qa/screens/` pour le critic visuel |
| Luau console | `execute_luau` | snippets utilisateur (Edit/Server) |
| Insert asset (Toolbox) | `execute_luau` | `game:GetObjects("rbxassetid://id")` posé au sol devant la caméra dans `workspace.Toolbox` (audio → `Sound` dans SoundService) |
| Preview animation (Game) | `execute_luau` | rig R15 dans `workspace.WorldForgePreview`, KeyframeSequence construit à partir de l'AnimSpec, track jouée |
| Génération 3D | `generate_mesh` | mesh IA de Roblox inséré dans la place (MeshProvider "studio") |

Un seul client MCP peut être connecté à la fois ; les processus orphelins sont nettoyés au démarrage de l'app.

`require()` met les ModuleScripts en cache par *instance* dans la VM d'édition : le sync remplace donc chaque
Script/ModuleScript par une nouvelle instance (enfants déplacés) au lieu de réécrire `Source`, sinon un bake
suivant utiliserait encore l'ancien runtime. À chaque `compile`, l'app resynchronise aussi les fichiers runtime du
template (`src/shared/world/**`, `src/world/**`) dans le projet ; les dossiers gameplay/UI édités par les agents ne
sont jamais touchés.
