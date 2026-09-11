# WorldForge AI — Architecture

> "L'utilisateur décrit son jeu en langage naturel. Les agents IA construisent progressivement le jeu Roblox."

WorldForge AI est une application desktop (Tauri 2 + React + TypeScript + Rust) qui transforme une idée
en un projet Roblox réel : WorldSpec → monde procédural → projet roblox-ts → Rojo → Roblox Studio → Open Cloud.

Ce document décrit l'architecture globale. Les sous-systèmes ont chacun leur document :

| Document | Sujet |
|---|---|
| [WORLD_GENERATION.md](WORLD_GENERATION.md) | WorldSpec, StyleBible, pipeline procédural, prefabs, landmarks |
| [AGENT_SYSTEM.md](AGENT_SYSTEM.md) | IAgentProvider, providers officiels, orchestrateur, swarm, runtime local |
| [ROBLOX_PIPELINE.md](ROBLOX_PIPELINE.md) | Projet généré, roblox-ts, Rojo, Studio, Open Cloud, publication |
| [QUALITY_SYSTEM.md](QUALITY_SYSTEM.md) | Validation, QA loop, Visual Quality Critic, performance |

---

## 1. Principes

1. **Aucune fausse fonctionnalité.** Chaque bouton déclenche une opération réelle. Quand une intégration
   externe n'est pas disponible (agent non installé, pas de clé Open Cloud), l'UI l'indique et propose
   l'installation/configuration — jamais une simulation.
2. **Représentation intermédiaire avant génération.** L'IA ne produit jamais directement des milliers
   d'objets. Elle produit une `WorldSpec` (JSON validé par schéma Zod). Le générateur procédural déterministe
   transforme la WorldSpec en `WorldBake` (terrain + placements + prefabs), qui est ensuite exporté vers Roblox.
3. **TypeScript partout.** Le projet Roblox généré est un projet roblox-ts. Les agents et l'utilisateur éditent
   des fichiers `.ts`. La compilation TS → Luau est faite par `rbxtsc`, la synchro par Rojo.
4. **Déterminisme.** `seed + WorldSpec + StyleBible` ⇒ toujours le même `WorldBake`. Cela rend possibles
   la régénération partielle, les locks, le versioning et la comparaison.
5. **Offline-first.** Aucun serveur propriétaire. Les projets sont des dossiers locaux + une base SQLite locale.
   Les credentials restent dans le secure storage de l'OS (Windows Credential Manager / Keychain).
6. **Modularité.** Monorepo npm workspaces. Chaque package a une responsabilité unique et est testable en Node
   sans Tauri.

---

## 2. Topologie du monorepo

```
vibebuilder/
├── apps/
│   └── desktop/                 # Application Tauri 2 (React + Rust)
│       ├── src/                 # Frontend React/TS
│       │   ├── app/             # Shell, routing, layout (sidebar, header, agent panel)
│       │   ├── components/ui/   # Primitives UI (shadcn-like, Tailwind)
│       │   ├── features/        # Écrans : home, projects, worlds, assets, workshop, agents, roblox, settings, onboarding
│       │   ├── stores/          # Zustand stores (projects, agents, world, roblox, settings, onboarding)
│       │   ├── services/        # Pont Tauri : fs, process, db, secrets, tools, studio, opencloud
│       │   └── viewer/          # World Viewer Three.js / React Three Fiber
│       └── src-tauri/           # Backend Rust
│           └── src/commands/    # tools.rs, process.rs, secrets.rs, studio.rs, opencloud.rs, capture.rs, fs.rs
├── packages/
│   ├── core/                    # @worldforge/core — schémas Zod (WorldSpec, StyleBible, GameSpec, Project), PartList, RNG, ids
│   ├── world-gen/               # @worldforge/world-gen — générateur procédural (heightmap, biomes, rivières, routes, landmarks, placement, bake)
│   ├── prefabs/                 # @worldforge/prefabs — constructeurs procéduraux de PartList (arbres, rochers, maisons, ruines, props)
│   ├── quality/                 # @worldforge/quality — critic (règles), scoring, propositions de corrections, budgets perf
│   ├── roblox-export/           # @worldforge/roblox-export — WorldBake → fichiers projet roblox-ts + Rojo, writer .rbxmx, encodeurs
│   ├── roblox-cloud/            # @worldforge/roblox-cloud — client Open Cloud (fetch injectable)
│   └── agents/                  # @worldforge/agents — IAgentProvider, providers, orchestrateur, rôles, prompts, interpréteur local
├── templates/
│   └── roblox-ts-project/       # Template du projet Roblox généré (package.json, tsconfig, default.project.json, src/…)
├── scripts/
│   └── demo-moonlit.ts          # Démo "Moonlit Forest Village" en ligne de commande
└── *.md                         # Docs d'architecture
```

Tous les packages sont du TypeScript pur, sans dépendance à Tauri, pour être utilisables :
- dans le webview (génération dans l'app),
- en Node (CLI, tests Vitest, scripts de démo),
- par les agents (ils lisent les schémas et docs dans le repo).

---

## 3. Vue d'ensemble des flux

```
                       ┌──────────────────────────────────────────────────────────────┐
                       │                        Desktop App (Tauri)                    │
                       │                                                              │
  Prompt utilisateur ──► Agent Orchestrator ──► Rôles (design/world/asset/gameplay/ui/audio/qa) │
                       │        │                       │                             │
                       │        │  écrit / valide       ▼                             │
                       │        │             worlds/<w>/world.spec.json (WorldSpec)  │
                       │        │                       │                             │
                       │        │                       ▼                             │
                       │        │             World Generator (déterministe)          │
                       │        │                       │                             │
                       │        │                       ▼                             │
                       │        │             WorldBake (terrain, prefabs, placements)│
                       │        │                  │             │                    │
                       │        │                  ▼             ▼                    │
                       │        │       World Viewer (3D)   Roblox Export             │
                       │        │                                │                    │
                       │        │                                ▼                    │
                       │        │       project/assets/world/WorldBake.json           │
                       │        │       project/src/**/*.ts (roblox-ts)               │
                       │        │                                │                    │
                       │        ▼                                ▼                    │
                       │   QA loop ◄────── logs/screens ◄── rbxtsc → Rojo build/serve → Studio
                       │        │                                                     │
                       │        ▼                                                     │
                       │   Open Cloud publish (place version) ◄── .rbxl               │
                       └──────────────────────────────────────────────────────────────┘
```

---

## 4. Modèle de données

### Base SQLite locale (`<app-data>/worldforge.db`)

| Table | Rôle |
|---|---|
| `projects` | id, name, path, thumbnail, created_at, updated_at, last_build_at, last_publish_at, roblox_universe_id, roblox_place_id, settings(json) |
| `world_versions` | id, project_id, world_id, version (v0.1…), parent_version_id, spec(json), stats(json), score, created_at, label |
| `prompt_history` | id, project_id, role, provider, prompt, response_summary, created_at |
| `agent_runs` | id, project_id, provider, role, status, started_at, ended_at, usage(json), log_path |
| `build_runs` | id, project_id, kind(build/test/publish), status, report(json), started_at, ended_at |
| `assets` | registre local (id, name, category, subcategory, style, biome, rarity, bbox, tags, source, license, thumbnail, file_path) |
| `settings` | key/value (non secret) |

Les secrets (clés Open Cloud, clés providers image/mesh/audio) sont dans le secure storage OS via le crate `keyring`.

### Projet sur disque

```
<project>/
├── worldforge.json              # métadonnées du projet WorldForge (id, style, world courant, locks)
├── package.json                 # roblox-ts + @rbxts/types
├── tsconfig.json
├── default.project.json         # Rojo
├── src/
│   ├── client/                  # StarterPlayerScripts (roblox-ts)
│   ├── server/                  # ServerScriptService
│   ├── shared/                  # ReplicatedStorage
│   ├── world/                   # WorldBuilder, décodeurs, LOD, streaming
│   ├── systems/                 # gameplay (currency, inventory, survival, quests…)
│   └── ui/                      # UI Roblox (HUD, inventory, shop…)
├── assets/
│   ├── world/WorldBake.json     # bake courant (→ ModuleScript via Rojo)
│   ├── models/                  # .rbxmx des prefabs (asset browser / insertion Studio)
│   └── audio/, images/          # sorties des providers IA
├── worlds/
│   └── main/
│       ├── world.spec.json      # WorldSpec (source de vérité)
│       ├── style.bible.json     # StyleBible
│       └── versions/            # snapshots v0.1.json, v0.2.json…
├── design/
│   ├── game.spec.json           # GameSpec (Design Agent)
│   └── asset.manifest.json      # AssetManifest (Asset Agent)
└── out/                         # Luau compilé par rbxtsc (ignoré par git)
```

---

## 5. Backend Rust (Tauri)

Commandes exposées (`invoke`) :

| Module | Commandes |
|---|---|
| `tools` | `detect_tools` (OS, RAM, virtualisation, Studio, Node, Git, rbxtsc, Rojo, Docker, WSL, agents), `install_tool` (Rojo via release GitHub, roblox-ts via npm) |
| `process` | `spawn_process` (stream stdout/stderr par événements `process://<id>`), `write_stdin`, `kill_process`, `run_command` (one-shot) |
| `secrets` | `secret_set`, `secret_get`, `secret_delete`, `secret_exists` (keyring OS) |
| `studio` | `find_studio`, `open_place_in_studio`, `install_rojo_plugin`, `read_studio_log`, `list_studio_logs` |
| `opencloud` | `oc_request` (proxy HTTP authentifié, clé lue depuis keyring, jamais exposée au webview) |
| `capture` | `capture_window` (screenshot fenêtre Studio → PNG) |
| `fs` | `read_text`, `write_text`, `list_dir`, `exists`, `mkdirp`, `remove`, `copy_dir`, `app_paths` |

Plugins Tauri : `shell` (open URL), `dialog`, `sql` (SQLite + migrations), `opener`.

Sécurité : les processus agents sont lancés avec `cwd = projet`, environnement filtré, et un `permissionMode`
par provider ; les clés API ne transitent jamais par le frontend (proxy Open Cloud côté Rust).

---

## 6. Frontend

- **Layout** : sidebar gauche (Home, Projects, Worlds, Assets, Visual Workshop, Agents, Roblox, Settings),
  header (nom projet, statut Roblox/Studio/Build, bouton Publish), zone centrale, panneau Agent à droite
  (chat + activité des agents).
- **Stores Zustand** : `projectStore`, `worldStore` (spec, bake, locks, versions), `agentStore` (providers,
  sessions, activité), `robloxStore` (studio, rojo serve, build, publish), `settingsStore`, `onboardingStore`.
- **World Viewer** (R3F) : terrain (mesh depuis heightmap), eau, InstancedMesh par variante de prefab,
  calques (Terrain/Water/Buildings/Vegetation/Props/NPCs/Lighting), caméras (orbit, fly, top, first-person),
  sélection, wireframe, couleurs de biomes, preview lighting/fog.
- **Visual Workshop** : prompt + image de référence + preset de style + sliders (terrain, végétation,
  bâtiments, props, fog, lighting, couleur, densité, échelle, randomness) + boutons GENERATE / REGENERATE
  (total ou par couche) + locks.

---

## 7. Risques techniques identifiés

| Risque | Mitigation |
|---|---|
| Terrain Roblox non exprimable via Rojo (voxels) | Terrain construit au runtime par `Terrain:WriteVoxels` à partir d'un heightmap encodé (base64) ; option "Bake to place" via MCP/`run_code` |
| Trop d'Instances (perf) | Budgets par catégorie, LOD/culling, StreamingEnabled, prefabs partagés clonés, pas d'objets < seuil visuel |
| Limites Luau sur tables constantes | Données encodées en strings base64 + décodage `buffer` côté Luau |
| Agents CLI absents / non authentifiés | Détection + auth guidée ; interpréteur local règle-based pour Prompt→WorldSpec afin que la génération de monde fonctionne sans agent |
| Antigravity sans CLI headless | Provider "ouvre le projet dans Antigravity" + Gemini CLI comme provider headless Google |
| Open Cloud : endpoints en évolution | Client isolé (`@worldforge/roblox-cloud`), versions d'API centralisées |
| Screenshot Studio (QA visuelle) | Capture de fenêtre native (crate `xcap`) ; le critic fonctionne aussi sans image via métriques du bake |
| Windows sans WSL | Runtime `host` isolé par dossier + permissions agents ; runtime `docker` réel si Docker présent |

---

## 8. Phases

1. **Fondations** : monorepo, core schémas, Tauri shell, DB, détection outils, onboarding.
2. **Project Manager** : création/ouverture de projets, scaffolding roblox-ts + Rojo, build.
3. **Agent Orchestrator** : providers Claude Code / Codex / OpenCode / Gemini CLI, sessions streamées, rôles, swarm.
4. **WorldSpec + World Generator** : pipeline complet, prefabs, bake, viewer 3D.
5. **Roblox Export + Studio** : WorldBuilder runtime, Rojo build/serve, ouverture Studio, logs.
6. **Quality** : critic, QA loop, corrections automatiques.
7. **Open Cloud** : auth, publication, produits.
8. **Génération IA (image/mesh/audio)** : providers configurables.
9. **Polish UI** + démo "Moonlit Forest Village".
