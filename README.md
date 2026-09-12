# WorldForge AI

> Décris ton jeu en langage naturel. Les agents IA construisent progressivement un vrai jeu Roblox.

WorldForge AI est une application desktop (Tauri 2 · React · TypeScript · Rust) qui transforme une idée en un
projet Roblox réel : **WorldSpec → génération procédurale → projet roblox-ts → Rojo → Roblox Studio → Open Cloud**.

Aucune fonctionnalité simulée : chaque bouton déclenche une opération réelle (génération, compilation `rbxtsc`,
`rojo build`, ouverture de Studio, synchronisation MCP, publication Open Cloud). Les agents IA sont les CLIs
officiels installés sur la machine (Claude Code, Codex, OpenCode, Gemini CLI, Antigravity), avec **tes** comptes.

## Ce que fait l'application aujourd'hui

| Écran | Fonctionnalité réelle |
|---|---|
| **Home** | Projets (SQLite local), onboarding : détection OS/RAM/Docker/WSL, Node, Git, roblox-ts, Rojo, Roblox Studio, agents ; bouton *Install missing* (npm / release GitHub Rojo) |
| **Swarm** | Panneaux d'agents (nombre libre, modèle + effort + rôle + permissions par agent), composer "décris ton idée", orchestrateur multi-rôles (design → world → assets → gameplay → UI → audio → intégration), validation par schéma + retry, régénération automatique du monde quand un agent modifie la WorldSpec |
| **AI Workshop** | Prompt → WorldSpec (interpréteur local instantané ou agent IA), image de référence → StyleBible (palette locale + agent vision), presets de style, sliders (terrain, végétation, bâtiments, props, fog, lighting, couleur, densité, échelle, randomness), GENERATE / REGENERATE par couche, locks |
| **World** | Viewer 3D Three.js (orbit / fly / top / first-person), calques, wireframe, couleurs de biomes, sélection + lock / keep area, versions (restore), rapport du Visual Quality Critic + auto-fix, éditeur de WorldSpec |
| **Assets** | Registre de prefabs procéduraux (50 prefabs, ~280 variantes par monde), preview 3D, favoris, placement dans le monde, export `.rbxmx`, **Hero 3D models** (texte ou image → mesh texturé PBR haute qualité, GLB + FBX, publié comme asset Roblox, placé dans le monde), génération IA (Gemini image, Roblox Studio 3D via MCP, ElevenLabs SFX/musique) |
| **Roblox** | Build (`npm install` → `rbxtsc` → `rojo build`), erreurs TS parsées, Open in Studio, `rojo serve` + plugin, **bridge MCP Studio** (deploy scripts + bake du monde dans la place, play-test automatisé, console, screenshot, console Luau), Open Cloud (universe/place, publish/save version, dashboards), validation avant publication, **QA loop** (build → test → observe → critique → fix) |
| **Settings** | Providers (défaut, modèle, effort), mode de permission, runtime, clés dans le secure storage OS, QA loop |

## Démarrage

```bash
npm install
npm run dev            # Tauri dev (Vite + cargo). Première compilation Rust : plusieurs minutes.
npm test               # vitest (générateur, interpréteur, orchestrateur, codec)
npm run demo:build     # démo "Moonlit Forest Village" en CLI : génère + compile + rojo build → demo-output/…/build/*.rbxl
```

Prérequis : Node 20+, Rust (cargo), Roblox Studio, et sur Windows le Windows SDK (`rc.exe`) pour compiler Tauri.
Rojo et roblox-ts peuvent être installés depuis l'onboarding de l'app.

### Roblox Studio + MCP

Dans Studio : *Assistant → … → Manage MCP Servers → Enable Studio as MCP server*. L'app détecte `StudioMCP.exe`,
s'y connecte (stdio, JSON-RPC) et peut alors : synchroniser les scripts compilés, pousser le WorldBake, construire le
monde dans la place (terrain voxel + prefabs), lancer un play-test, lire la console, capturer l'écran — la base de la
QA loop et du critic visuel.

### Modèles 3D haute qualité (Hero models)

Onglet *Assets → Hero 3D models* : un prompt (ou une image de référence) → Meshy génère la géométrie puis les
textures PBR (étapes preview → refine, image-to-3D), remaillage au polycount choisi → GLB (viewer) + FBX + vignette
dans `assets/models/` → *Publish to Roblox* envoie le FBX à l'**Assets API** Open Cloud (asset `Model`, scopes
`asset:read` + `asset:write`, creator id renseigné dans l'onglet Roblox) → l'asset id est mémorisé → *Place in world*
insère le modèle comme n'importe quel prefab (placement verrouillé, incliné sur le terrain, conservé à la
régénération). Dans le jeu, `WorldBuilder` fait `InsertService:LoadAsset(id)`, redimensionne le modèle à la hauteur
choisie et le pose au sol ; sans asset id (ou hors ligne) un placeholder gris prend sa place. *Insert in Studio*
pose le modèle devant la caméra via MCP. `Import GLB` (+ `.fbx` à côté) enregistre un modèle venu d'un autre outil.
Clés : Meshy dans *Settings → Keys* ; le modèle est aussi visible dans le viewer 3D avec ses textures.

### Open Cloud

Créer une clé API sur create.roblox.com (scopes `universe-places:write`, `universe:read`, et `asset:read` /
`asset:write` pour les Hero models), la coller dans
*Settings → Keys* (Credential Manager / Keychain), renseigner universe id + place id dans l'onglet Roblox, puis
*Validate* et *Publish*.

## Architecture

Voir [ARCHITECTURE.md](ARCHITECTURE.md), [WORLD_GENERATION.md](WORLD_GENERATION.md), [AGENT_SYSTEM.md](AGENT_SYSTEM.md),
[ROBLOX_PIPELINE.md](ROBLOX_PIPELINE.md), [QUALITY_SYSTEM.md](QUALITY_SYSTEM.md).

```
packages/core           schémas Zod (WorldSpec, StyleBible, GameSpec…), PartList, bake, RNG, presets
packages/prefabs        géométrie procédurale low-poly (arbres, champignons géants, rochers, cottages, ruines, props, landmarks)
packages/world-gen      pipeline procédural (terrain → érosion → biomes → rivières → sites → landmarks → routes → bâtiments → végétation → props → lighting → budgets)
packages/quality        Visual Quality Critic, fixes automatiques, parsing rbxtsc / logs Studio, validation publication
packages/roblox-export  template roblox-ts + Rojo, export WorldBake, writer .rbxmx
packages/roblox-cloud   client Open Cloud
packages/agents         IAgentProvider, providers CLI, interpréteur local, rôles, orchestrateur, client MCP + bridge Studio
packages/ai-providers   ImageProvider / MeshProvider / AudioProvider (Gemini, Meshy, ElevenLabs)
apps/desktop            Tauri 2 : Rust (process, keyring, fs, Studio, proxies HTTP, capture) + React (stores Zustand, viewer R3F, écrans)
templates/roblox-ts-project   projet Roblox généré (WorldBuilder runtime, systèmes, HUD)
```

## Démo : Moonlit Forest Village

`npm run demo:build` génère une forêt mystérieuse 1024×1024 (terrain vallonné, rivière, village abandonné, chemins en
pierre, champignons géants, ruines, brume, lune) puis compile et construit la place. Dans l'app : *New project →
Moonlit Forest Village* génère la même scène en ~1 s, l'affiche en 3D, et *Roblox → Open in Studio → Deploy to
Studio* la construit dans Roblox Studio.

## Sécurité

Les clés (Open Cloud, Gemini, Meshy, ElevenLabs) sont dans le secure storage de l'OS et ne transitent jamais par
l'interface : les requêtes sont signées par le backend Rust (`oc_request`, `ai_request`) avec allow-list d'hôtes.
Alternative fichier : copier `.env.example` en `.env` (racine du dépôt, à côté de l'exécutable ou
`%APPDATA%\WorldForge\.env`) et y mettre `ROBLOX_OPEN_CLOUD_API_KEY=…` (+ `ROBLOX_CREATOR_USER_ID`,
`ROBLOX_UNIVERSE_ID`, `ROBLOX_PLACE_ID`, et les clés IA optionnelles). Le fichier est git-ignoré, lu uniquement
par le backend Rust, jamais loggé ; le secure storage garde la priorité s'il contient aussi la clé.
Les agents sont lancés avec `cwd = projet`, environnement filtré et mode de permission configurable ; les credentials
des agents restent gérés par leurs CLIs officiels.
