# WorldForge AI — Architecture

> « L'utilisateur décrit son jeu en langage naturel. Les agents IA construisent progressivement le jeu Roblox. »

WorldForge AI est une application desktop (Tauri 2 · React 19 · TypeScript · Rust) qui transforme une phrase
en un projet Roblox réel :

```
prompt → WorldSpec + StyleBible + GameSpec → WorldBake → projet roblox-ts → Rojo → Studio → Open Cloud
```

Ce document est la **carte du code** : ce que fait chaque partie, ce qu'elle a le droit de savoir des autres,
et les invariants qui tiennent l'ensemble. Les sous-systèmes ont chacun leur document :

| Document | Sujet |
|---|---|
| [WORLD_GENERATION.md](WORLD_GENERATION.md) | WorldSpec, StyleBible, pipeline procédural, prefabs, landmarks, composition |
| [TAXONOMY.md](TAXONOMY.md) | 34 styles × 28 genres, kits, librairies d'UI, détection dans le prompt |
| [AGENT_SYSTEM.md](AGENT_SYSTEM.md) | IAgentProvider, providers CLI, rôles, orchestrateur, swarm, interpréteur local |
| [ROBLOX_PIPELINE.md](ROBLOX_PIPELINE.md) | Projet généré, roblox-ts, Rojo, Studio, MCP, Open Cloud |
| [QUALITY_SYSTEM.md](QUALITY_SYSTEM.md) | Validation, critic visuel, boucle QA, budgets de performance |

---

## 1. Les cinq principes

1. **Aucune fausse fonctionnalité.** Chaque bouton déclenche une opération réelle. Quand une intégration
   externe est indisponible (agent non installé, pas de clé Open Cloud), l'UI le dit et propose de
   l'installer ou de la configurer — jamais une simulation. Quand une intégration est impossible, on écrit
   une abstraction propre **et** une implémentation locale qui marche (l'interpréteur local en est
   l'exemple : il produit une WorldSpec sans aucun agent installé).
2. **Une représentation intermédiaire avant toute géométrie.** Une IA ne produit jamais directement des
   milliers d'objets : elle produit un **document JSON validé par un schéma Zod** (WorldSpec, StyleBible,
   GameSpec). Un générateur déterministe fait le reste. Les schémas sont le contrat : on les étend
   *avant* le générateur, les prefabs, le template et les agents.
3. **Déterminisme.** `seed + WorldSpec + StyleBible` ⇒ toujours le même `WorldBake`. C'est ce qui rend
   possibles la régénération partielle, les locks, le versioning et la comparaison avant/après. Toute
   aléa passe par `Rng` (xoshiro128\*\*) et une graine dérivée par étape (`deriveSeed(seed, "vegetation")`).
4. **TypeScript partout.** Le jeu généré est un projet roblox-ts ; agents et humains éditent du `.ts`.
   Personne n'écrit de Luau à la main : `rbxtsc` compile, Rojo synchronise.
5. **Offline-first, sans serveur propriétaire.** Les projets sont des dossiers locaux plus une base SQLite
   locale. Les secrets restent dans le trousseau de l'OS et ne traversent jamais le webview.

---

## 2. Topologie

```
vibebuilder/
├── apps/desktop/                 application Tauri (React + Rust)
├── packages/                     9 packages TypeScript purs, testables en Node
├── templates/roblox-ts-project/  le projet dont part chaque jeu généré
├── scripts/                      outils en ligne de commande (sync, démo, audit, previews)
├── docs/                         ce document et les cinq documents de sous-système
├── .claude/skills/               procédures pour un agent qui travaille *sur* WorldForge
├── README.md                     ce que fait l'application, comment la lancer
└── CLAUDE.md                     les commandes et les règles, pour un agent dans ce dépôt
```

**Conventions de nommage.** Les modules sont en `kebab-case` (`kit-props.ts`, `game-files.ts`,
`ui-kit-files.ts`) ; les composants React en `PascalCase` (`WorldViewer.tsx`) ; les fichiers générés
portent `.generated.ts` et ne s'éditent jamais à la main. Un fichier de données volumineux se découpe
selon un champ du modèle, pas par ordre alphabétique : les 34 styles vivent dans
`styles-fantasy.ts` / `styles-modern.ts` / `styles-nature.ts` selon leur `group`, de sorte qu'un nouveau
style a un emplacement évident.

### Graphe de dépendances des packages

```
                         ┌───────────┐
                         │   core    │  schémas Zod · PartList · RNG · taxonomie · bake
                         └─────┬─────┘
          ┌──────────┬─────────┼──────────┬───────────┬────────────┐
          ▼          ▼         ▼          ▼           ▼            ▼
      prefabs    textures  roblox-  roblox-cloud  ai-providers   (app)
          │                 export        (aucune dépendance interne)
          ▼                    ▲
      world-gen ───────────────┤
          │                    │
          ▼                    │
       quality                 │
          │                    │
          └──────► agents ─────┘
```

Règles qui tiennent ce graphe :

- **`core` ne dépend de rien** d'autre que `zod`. Tout ce qui est partagé par deux packages y remonte.
- **Aucun package ne dépend de Tauri.** Ils tournent dans le webview, en Node (tests, scripts, CI) et
  sont lisibles par un agent qui ouvre le repo. Les E/S et le réseau sont **injectés** (`AiTransport`,
  `CloudTransport`) plutôt qu'importés.
- **Le sens des flèches n'est jamais inversé.** `world-gen` ne connaît pas l'exporteur ; `quality`
  observe un bake mais ne le fabrique pas ; `agents` orchestre et ne contient aucune géométrie.

| Package | Responsabilité | Points d'entrée |
|---|---|---|
| `@worldforge/core` | Les contrats : `WorldSpecSchema`, `StyleBibleSchema`, `GameSpecSchema`, les manifestes et le projet ; le format d'asset `PartList` (`Part`, `PrefabVariant`, `MeshData`) ; `WorldBake` + (dé)sérialisation base64 ; la taxonomie (styles, genres, kits, librairies d'UI, chaînes localisées) ; `Rng`, maths, couleurs, ids | `WorldSpecSchema`, `PartListBuilder` types, `serializeBake`, `STYLE_FAMILIES`, `GENRES`, `UI_KITS` |
| `@worldforge/prefabs` | Constructeurs procéduraux de `PartList` : végétation, rochers, architecture (avec intérieurs), props par kit, landmarks, habillage, ponts d'île ; la bibliothèque de meshes procéduraux ; le registre qui associe un id à un constructeur, un nombre de variantes, un budget de parts et des **tags** que le générateur interprète | `PREFAB_DEFINITIONS`, `buildPrefabLibrary`, `PartListBuilder`, `buildMeshLibrary` |
| `@worldforge/world-gen` | Le générateur déterministe : un `GenContext` (grilles + structures) traversé par des étapes pures. Bruit, grilles, A\*, budgets | `generateWorld`, `regenerateLayers`, `requiredPrefabs`, `GEN_LAYERS` |
| `@worldforge/quality` | Le critic : métriques sur un `WorldBake` → scores /10 par axe, problèmes, correctifs applicables (`spec_patch`, `regenerate`) ; lecture des diagnostics `rbxtsc` et des logs Studio ; contrôles avant publication | `critiqueBake`, `applyFixes`, `parseRbxtscOutput`, `validateBakeForPublish` |
| `@worldforge/roblox-export` | `WorldBake` → fichiers d'un projet roblox-ts : scaffolding depuis le template embarqué, `WorldBake.json`, `default.project.json` Rojo, `.rbxmx`, fichiers de jeu générés depuis la GameSpec, librairies d'UI générées, export `.obj` des meshes | `scaffoldProjectFiles`, `exportWorldFiles`, `buildGameFiles`, `TEMPLATE_FILES` |
| `@worldforge/roblox-cloud` | Client Open Cloud (publication de place, Assets API, passes et produits) avec **transport injecté** | `OpenCloudClient`, `fetchTransport` |
| `@worldforge/agents` | `IAgentProvider` et les providers CLI officiels (Claude Code, Codex, OpenCode, Gemini CLI, Antigravity) ; rôles, prompts, orchestrateur ; client MCP + pont Studio ; **interpréteur local** prompt → WorldSpec sans IA | `streamProcess`, `planNewGame`, `interpretPrompt`, `StudioMcp` |
| `@worldforge/ai-providers` | Génération d'assets (image, mesh, audio) derrière une interface commune, transport injecté | `GeminiImageProvider`, `MeshyMeshProvider`, `ElevenLabsProvider` |
| `@worldforge/textures` | Textures tuilables procédurales (14 programmes), encodeur PNG sans dépendance, manifeste, MaterialVariants | `generateTextureSet`, `encodePng`, `buildMaterialModelFiles` |

---

## 3. Les contrats de données

Quatre documents, chacun avec un schéma Zod dans `packages/core/src/schemas/`, un cycle de vie et un
propriétaire clair.

| Document | Écrit par | Lu par | Vit dans |
|---|---|---|---|
| **WorldSpec** | l'interpréteur local ou le rôle *world* | le générateur, le critic, le viewer | `worlds/<w>/world.spec.json` |
| **StyleBible** | la taxonomie (style → bible), le rôle *vision* depuis une image | le générateur, les prefabs, l'éclairage, l'UI | `worlds/<w>/style.bible.json` |
| **GameSpec** | le rôle *design* | l'exporteur (`buildGameFiles`), les systèmes du template | `design/game.spec.json` |
| **WorldBake** | le générateur (jamais un humain, jamais une IA) | le viewer, l'exporteur, le critic, le runtime | `assets/world/WorldBake.json` |

Le WorldBake est le seul artefact **entièrement dérivé** : il se régénère, ne se corrige pas. Quand le critic
veut changer quelque chose, il propose un patch sur la **spec**, pas sur le bake — c'est ce qui garde la boucle
qualité réversible et rejouable.

```
WorldSpec ──┐
            ├─► generateWorld(seed) ─► WorldBake ─► exportWorldFiles ─► projet
StyleBible ─┘        ▲                    │
                     │                    ▼
                     └──── spec_patch ── critiqueBake
```

### Le format d'asset : PartList

Un prefab n'est ni un fichier ni un asset Roblox : c'est une **liste de parts** décrites en données
(`shape`, `position`, `rotation`, `size`, `color`, `material`, `lod`, `collide`, plus lumière, effet,
billboard ou mesh procédural). Le même document est rendu par trois consommateurs :

- le **runtime Roblox** (`src/world/WorldBuilder.ts`) qui instancie des `Part` / `MeshPart`,
- le **viewer R3F** de l'app, qui en fait des `InstancedMesh`,
- l'**exporteur**, qui écrit du `.rbxmx` et du `.obj`.

Un prefab est **connecté par construction** : `PartListBuilder` expose des primitives (`segment`, `beam`,
`chain`, `gableRoof`…) qui posent des parts *entre deux points*, si bien qu'aucune inclinaison ou variation
aléatoire ne peut désolidariser un modèle. Un test le vérifie pour chaque prefab dans chacun des 34 styles.

---

## 4. Le générateur de monde

`generateWorld(spec, style, options)` construit un `GenContext` — des grilles (`heights`, `moisture`,
`water`, `materials`, `biomes`, `roadDistance`, `waterDistance`) et des structures (`sites`, `landmarks`,
`paths`, `zones`, `placements`, `occupants`, `spawn`) — puis le fait traverser des étapes qui n'ont le droit
que de lire ce que les précédentes ont écrit.

```
terrain ─ eau ─ biomes ─ sites ─ landmarks ─ spawn ─ routes ─ bâtiments ─ habillage ─ layout ─
relief ─ végétation ─ props ─ détail ─ éclairage ─ [snap] ─ [sol en parts] ─ budgets ─ WorldBake
```

L'ordre est un contrat : les routes ont besoin des landmarks, l'habillage a besoin des routes, la végétation
a besoin de tout ce qui occupe le sol. Chaque étape publie ses **occupants** pour que les suivantes s'en
écartent. Le détail (`pipeline/detail.ts`) passe en dernier parce qu'il habille ce que les autres ont laissé.

Deux invariants transversaux, tous deux gardés par un test :

- **rien ne pend dans le vide.** Tout placement dispersé passe par `settleOnGround`, qui mesure chaque
  cellule du heightmap que touche son disque de base — un anneau d'échantillons passe à côté de la cellule
  située une terrasse plus bas — puis s'écarte du vide ou renonce.
- **le sol dessiné est le sol mesuré.** En mode « parts » le terrain est bâti en dalles quantifiées ;
  `snapHeightsToLevels` remet le heightmap sur ces niveaux juste avant l'ancrage, sans quoi tout ce que les
  étapes tardives ont nivelé se retrouve à une demi-marche du sol réel.

Le mode de sol (`terrain.groundMode`) décide de la nature du monde : `parts` (par défaut) construit des
terrasses en blocs avec falaises, escaliers et éboulis ; `voxels` écrit un vrai terrain Roblox au runtime.
Les deux produisent le même `WorldBake` — seule la façon de le bâtir change.

**Régénération partielle.** `regenerateLayers(spec, style, previous, layers)` rejoue certaines couches et
hérite des autres. Ce qu'une étape reconstruit systématiquement (ponts, escaliers, éboulis, sol en parts,
passe de détail) est marqué `isGroundwork` et jamais hérité : sans cela une régénération laisse deux copies.

---

## 5. L'application desktop

### Frontend (`apps/desktop/src`)

| Zone | Contenu |
|---|---|
| `app/Workspace.tsx` | le shell : navigation, en-tête (projet, statut Studio / build / publication), panneau d'agents |
| `features/` | `home` (projets, onboarding), `swarm` (agents), `workshop` (prompt → monde), `world`, `viewer` (R3F), `assets` (textures, meshes, hero meshes), `game` (GameSpec, UI, monétisation), `roblox` (build, Studio, publication), `toolbox`, `settings` |
| `stores/` | Zustand : `projectStore`, `worldStore` (spec, bake, locks, versions), `agentStore`, `gameStore`, `robloxStore`, `settingsStore` |
| `lib/` | le pont vers Tauri (`tauri.ts`, `files.ts`, `db.ts`), le lancement d'agents (`runner.ts`, `agents.ts`), la génération (`worldGen.ts` + `worldWorker.ts`), les assets (`textures.ts`, `meshAssets.ts`, `proceduralMeshes.ts`), la mise à niveau de template |

La génération tourne dans un **Web Worker** (`worldWorker.ts`) : un monde de 30 000 placements prend
plusieurs secondes et l'UI doit rester vivante, avec une barre de progression alimentée par le
`onProgress` du générateur.

### Backend Rust (`apps/desktop/src-tauri/src/commands/`)

| Module | Rôle |
|---|---|
| `tools` | détection (OS, RAM, virtualisation, Studio, Node, Git, rbxtsc, Rojo, Docker, WSL, agents) et installation guidée |
| `process` | processus longs avec stdout/stderr streamés par événements, stdin, kill, liste |
| `fs` | lecture/écriture texte et binaire (base64), parcours, copie — bornées aux dossiers de l'app et du projet |
| `secrets` | trousseau de l'OS (`keyring`) : `secret_set/get/exists/delete`, plus `.env` local et configuration d'environnement |
| `opencloud` / `ai` | **proxys HTTP authentifiés** : la clé est lue côté Rust et attachée à la requête ; le webview ne la voit jamais |
| `studio` | localisation de Studio, ouverture d'une place, installation du plugin Rojo, lecture des logs |
| `capture` | capture de la fenêtre Studio en PNG (QA visuelle) |
| `public` | téléchargements sortants contrôlés |

La frontière est nette : **tout ce qui touche à un secret, à un processus ou au disque hors projet est en
Rust**. Le frontend ne fait que demander.

### Données locales

- SQLite (`worldforge.db`, plugin `tauri-plugin-sql`) : `projects`, `world_versions`, `prompt_history`,
  `agent_runs`, `build_runs`.
- Secrets : trousseau de l'OS, jamais la base, jamais le projet.
- Tout le reste vit **dans le dossier du projet**, en fichiers lisibles — un projet WorldForge reste
  utilisable sans WorldForge.

---

## 6. Le projet généré

```
<project>/
├── worldforge.json           métadonnées WorldForge (style, monde courant, locks)
├── default.project.json      Rojo
├── src/
│   ├── server/ client/       bootstrap serveur et client
│   ├── shared/               config, remotes typés, zones, catalogue, quêtes, recettes, décodeurs
│   ├── world/                WorldBuilder (terrain, prefabs, éclairage, zones, spawn)
│   ├── systems/              18 systèmes serveur (PlayerData, Survival, Combat, Economy, Tycoon, Rounds…)
│   └── ui/                   kit + 26 librairies générées + 11 écrans (HUD, boutique, inventaire, minimap…)
├── assets/world/WorldBake.json
├── worlds/main/{world.spec,style.bible}.json
├── design/game.spec.json
└── .claude/skills/           7 procédures pour l'agent qui travaillera *dans* ce jeu
```

Deux règles structurent le runtime :

- **serveur autoritaire** : monnaie, dégâts, achats et progression vivent dans `src/systems/*` ; un
  LocalScript ne peut que *demander*, via les remotes typés de `src/shared/net.ts` ;
- **tout ce qui est généré est marqué comme tel** : `config.ts`, `catalog.ts`, `kits.generated.ts`…
  viennent de la GameSpec et de la taxonomie, et une régénération les réécrit.

Le template vit dans `templates/roblox-ts-project/` et est **embarqué** dans l'exporteur par
`scripts/sync-template.ts` (fichier `template-files.generated.ts`, retours à la ligne normalisés en LF).
Un test compare chaque fichier embarqué à celui du disque : le template et l'exporteur ne peuvent pas diverger.

---

## 7. Les agents

Un agent est un **CLI officiel déjà installé sur la machine**, lancé avec le compte de l'utilisateur, dans
le dossier du projet : Claude Code, Codex, OpenCode, Gemini CLI, Antigravity. `IAgentProvider` normalise le
lancement, le streaming, les modèles, les niveaux d'effort et les permissions ; l'orchestrateur enchaîne des
**rôles** (design → world → asset → gameplay → ui → audio → qa → integration, plus vision et chat) dont
chacun a un prompt, un schéma de sortie attendu et une politique de retry.

Aucun agent n'est requis pour que l'application fonctionne : `LocalRulesProvider` et `interpretPrompt`
transforment une phrase en WorldSpec par règles (détection du style, du genre, des features de terrain, des
landmarks, des peuplements), instantanément et hors ligne. C'est le chemin par défaut, et le filet quand un
agent renvoie un JSON invalide.

Le pont **MCP** (`packages/agents/src/mcp/`) parle à Roblox Studio : exécution de Luau dans les modèles de
données Edit / Server / Client, lecture de l'arbre, déploiement — c'est ce qui rend la boucle QA capable de
vérifier dans le vrai moteur.

---

## 8. Outils en ligne de commande

Tout ce qui juge le produit doit être exécutable sans l'interface.

| Script | Rôle |
|---|---|
| `scripts/sync-template.ts` | régénère les librairies d'UI et réembarque le template dans l'exporteur — **après toute modification sous `templates/`** |
| `scripts/demo-prompt.ts "<prompt>"` | prompt → projet complet dans `demo-output/`, avec genre, style, layout et score détectés |
| `scripts/demo-moonlit.ts` | la scène de référence « Moonlit Forest Village », branchée sur `npm run demo` |
| `scripts/audit-maps.ts` | panel de 12 prompts : score du critic, répartition des plans, relief, végétation, parts, plaintes groupées **et** les défauts géométriques que le critic ne voit pas |
| `scripts/preview-map.ts` | rend un monde en PNG depuis quatre caméras (rasteriseur logiciel : z-buffer, géométrie réelle des prefabs, couleurs et brouillard du bake) |
| `scripts/preview-ui-kits.ts` | planche de contact des 26 librairies d'UI |

Les deux derniers existent pour la même raison : **un score ne montre pas un désert vert, une lanterne noire
ou une rangée de props identiques.** Une modification du générateur ou d'une librairie d'UI se juge sur des
chiffres *et* sur une image.

---

## 9. Tests

18 fichiers, 122 cas, tous en Node sans Tauri ni Roblox.

| Nature | Ce qui est gardé |
|---|---|
| Contrats | taxonomie complète (chaque style × genre résout un kit, une bible, une librairie d'UI), aller-retour de sérialisation d'un bake, primitives PartList |
| Construction | **connectivité de chaque prefab dans les 34 styles** — aucune part détachée |
| Génération | bake déterministe et complet, régénération partielle sans doublon d'id, ancrage au sol, passe de détail, **les 15 archétypes de layout** (un test refuse qu'un archétype du schéma n'ait pas de cas) |
| Sortie | fichiers de jeu depuis une GameSpec, écrans d'UI, mise à niveau de template, **synchronisation template ↔ exporteur** |
| Qualité | le critic ne se plaint ni d'une forêt complète ni d'un monde stérile, et se plaint encore d'une forêt à qui on a demandé des arbres |
| Intégrations | Open Cloud et providers d'assets avec transport simulé |

La règle : **un défaut trouvé à la main devient un test.** Les invariants du générateur (rien ne pend,
le heightmap est sur les niveaux, aucun id dupliqué) sont nés de bugs réels.

---

## 10. Sécurité et limites

| Sujet | Position |
|---|---|
| Clés API, jetons Open Cloud | trousseau de l'OS, proxy Rust ; jamais dans le repo, les logs, la base ou le webview |
| Contenu | procédural ou CC0 uniquement ; aucun code, asset ou logo propriétaire |
| Processus agents | `cwd` = le projet, environnement filtré, `permissionMode` par agent |
| Nombre d'Instances | budgets par catégorie et plafond de parts, LOD, prefabs partagés clonés ; au-delà de ~45 k parts Studio devient pénible |
| Tables constantes Luau | données encodées en base64, décodées avec `buffer` côté Luau |
| EditableMesh côté client | budget de 6 à 8 ; les meshes par variante sont interdits tant que les assets ne sont pas publiés |
| Terrain voxel non exprimable en Rojo | écrit au runtime depuis le heightmap encodé |
| Endpoints Open Cloud mouvants | isolés dans un seul package, versions centralisées |

---

## 11. Ajouter quelque chose

Le repo décrit ses propres procédures dans `.claude/skills/` — un agent (ou un humain) lit la skill avant de
toucher au code :

| Skill | Quand |
|---|---|
| `add-style` | un nouveau look (palette, kits, éclairage, mots-clés) |
| `add-genre` | un nouveau type de jeu (systèmes, archétype de layout, écrans, monétisation) |
| `add-prefab` | un prop, un bâtiment, un landmark, un kit de murs |
| `add-ui-kit` | une librairie d'interface |
| `map-quality` | améliorer ou déboguer la génération de map |
| `studio-verify` | vérifier dans le vrai Studio, en headless |
| `release` | finir proprement : sync, typecheck, tests, projet de démo compilé, docs, commit |

Le fil commun : **on part du schéma**, puis le générateur, les prefabs, le template, l'interpréteur, les
agents, les docs — dans cet ordre, parce que c'est le sens des dépendances.
