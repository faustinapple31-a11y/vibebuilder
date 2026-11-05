# WorldForge AI — Agent System

L'application ne réimplémente aucun modèle. Elle orchestre les outils d'agents **officiels** installés sur la
machine de l'utilisateur, avec **ses** comptes. Aucune credential n'est stockée par WorldForge : chaque CLI
gère sa propre authentification (`claude login`, `codex login`, `opencode auth login`, `gemini`).

Package : `@worldforge/agents` (TypeScript pur, process spawning injecté).

---

## 1. Abstraction `IAgentProvider`

```ts
interface IAgentProvider {
  readonly id: AgentProviderId;            // 'claude-code' | 'codex' | 'opencode' | 'gemini-cli' | 'antigravity' | 'local-rules'
  readonly name: string;
  readonly status: AgentStatus;            // 'unknown' | 'not-installed' | 'installed' | 'authenticated' | 'busy' | 'error'
  detect(): Promise<AgentDetection>;       // binaire trouvé ? version ? auth probable ?
  authenticate(): Promise<AuthResult>;     // lance le flux officiel (terminal ou URL)
  startSession(opts: SessionOptions): Promise<AgentSession>;
  sendPrompt(session: AgentSession, prompt: string, opts?: PromptOptions): AsyncIterable<AgentEvent>;
  streamOutput(session: AgentSession): AsyncIterable<AgentEvent>;
  stop(session: AgentSession): Promise<void>;
  getUsage(session: AgentSession): Promise<AgentUsage>;
  getCapabilities(): AgentCapabilities;    // { streaming, json, vision, fileEdit, shell, mcp, headless }
}
```

`AgentEvent` : `{ type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'error' | 'usage' | 'done' | 'raw', ... }`.

Les providers ne dépendent pas de Tauri : ils reçoivent un `ProcessRunner` (`spawn/kill/write`) dont il existe
deux implémentations : `TauriProcessRunner` (commande Rust `spawn_process` + événements) et `NodeProcessRunner`
(`child_process`, pour les scripts et tests).

---

## 2. Providers

| Provider | Commande headless | Format de sortie | Notes |
|---|---|---|---|
| Claude Code | `claude -p "<prompt>" --output-format stream-json --verbose [--allowedTools …] [--permission-mode …] [--resume <id>]` | NDJSON (`system`, `assistant`, `user`, `result`) | Vision via Read d'images, MCP, sessions résumables |
| Codex | `codex exec "<prompt>" --json [--sandbox workspace-write] [-C <cwd>]` | NDJSON d'événements | `codex login` pour l'auth |
| OpenCode | `opencode run "<prompt>" --format json` | NDJSON | `opencode auth login` |
| Gemini CLI | `gemini -p "<prompt>" --output-format json` | JSON | headless Google ; auth via `gemini` |
| Antigravity | `antigravity <project>` (ouvre l'IDE) | — | pas de mode headless connu : le provider ouvre le projet avec un fichier `AGENT_TASK.md` prérempli |
| Local rules | in-process | — | interpréteur déterministe Prompt → WorldSpec/GameSpec (fonctionne sans IA, sert de draft aux agents) |

Détection : recherche dans le PATH + emplacements connus (`%APPDATA%/npm`, `~/.local/bin`, `~/.cargo/bin`), `--version`.
Authentification : on ne lit jamais les tokens ; on détecte seulement la présence des fichiers de config
(ex. `~/.claude.json`, `~/.codex/auth.json`) pour afficher un statut "probablement authentifié".

---

## 3. Rôles (swarm)

Chaque rôle a : un prompt système, des fichiers d'entrée, des fichiers de sortie attendus, un validateur.

| Rôle | Entrées | Sorties | Validation |
|---|---|---|---|
| **Design** | prompt utilisateur, `design/game.spec.json` (si existant) | `design/game.spec.json` | Zod `GameSpec` |
| **World** | prompt, GameSpec, StyleBible, docs WorldSpec | `worlds/main/world.spec.json` | Zod `WorldSpec` + génération test (bake sans erreur) |
| **Asset** | GameSpec, WorldSpec, registre d'assets | `design/asset.manifest.json` | Zod `AssetManifest` ; ids existants ou générables |
| **Gameplay** | GameSpec, arborescence `src/` | `src/systems/**/*.ts`, `src/server/**/*.ts`, `src/shared/**/*.ts` | `rbxtsc` sans erreur |
| **UI** | GameSpec, StyleBible | `src/ui/**/*.ts`, `src/client/**/*.ts` | `rbxtsc` |
| **Audio** | GameSpec, WorldSpec | `design/audio.manifest.json` + `assets/audio/*` (providers) | Zod `AudioManifest` |
| **QA** | logs Studio, screenshots, critic report | `qa/report.json` + corrections | Zod `QAReport` |
| **Integration** | tout | cohérence, `README` du projet, build final | build + validations |

Chaque rôle écrit dans son périmètre. L'orchestrateur assemble.

---

### 3b. Catalogue de la taxonomie dans les prompts

Les rôles *design* et *world* reçoivent le catalogue complet des styles (kits, biomes, landmarks) et
des genres (systèmes, layout, caméra) — `STYLE_CATALOG` / `GENRE_CATALOG` dans `roles.ts` — pour que
les JSON produits utilisent uniquement des ids valides ; l'interpréteur local (`interpretPrompt`)
suit exactement les mêmes tables, ce qui garantit qu'un prompt sans agent donne un monde cohérent.

### 3c. Skills Claude Code

Chaque projet généré embarque ses skills dans `.claude/skills/` (chargées automatiquement par Claude Code
dans le dossier du projet, ré-appliquées à chaque mise à niveau du template) : `worldforge-world`
(édition WorldSpec / StyleBible, features île & côte, murs, météo), `worldforge-gameplay` (systèmes,
remotes, zones, PlayerData), `worldforge-ui`, `worldforge-assets` (catalogue, passes / produits, audio,
animations, toolbox), `worldforge-qa` (checklists de play-test par genre, `qa/report.json`),
`worldforge-publish` (build, Open Cloud, checklist de sortie) et `roblox-ts-pitfalls`. Un `CLAUDE.md`
de projet les référence. Les prompts des rôles pointent vers la skill de leur périmètre et vers les
skills utilisateur (`~/.claude/skills`) quand elles existent : `roblox-best-practices`, `roblox-opsec`,
`roblox-game`, `ui-ux-pro-max`, `design`. L'outil `Skill` est autorisé pour tous les rôles ; l'onglet
Réglages liste les skills projet + utilisateur détectées. Le dépôt WorldForge lui-même a ses skills de
développement (`.claude/skills/` : add-style, add-genre, add-prefab, map-quality, studio-verify, release).

## 4. Orchestrateur

```
Prompt utilisateur
  → Plan (DAG de tâches par rôle, dépendances explicites)
  → Exécution concurrente (limite configurable) avec le provider choisi par tâche
  → Validation de chaque sortie ; en cas d'échec : re-prompt avec l'erreur (max N tentatives)
  → Génération du monde (déterministe, hors IA)
  → Build (rbxtsc + Rojo)
  → QA loop (voir QUALITY_SYSTEM.md)
```

Plan standard "nouveau jeu" :

```
design ─┬─► world ──► (bake) ──┐
        ├─► asset ─────────────┤
        ├─► gameplay ──────────┼─► integration ─► build ─► qa
        ├─► ui ────────────────┤
        └─► audio ─────────────┘
```

Plan "modification" (ex. "Plus médiéval", "Ajoute une rivière derrière le village") : l'orchestrateur
classifie l'intention (rules + agent), cible le rôle concerné (World → patch de WorldSpec avec locks pour ne
pas détruire l'existant), régénère partiellement, rebuild.

L'activité est streamée dans le panneau Agents : provider, rôle, état (`● Building gameplay`), dernier message,
outils utilisés, usage.

---

### 4b. Prompt enhancer (brief caché)

Une demande courte (« fait moi un village ») donne une map pauvre, parce que l'agent n'a rien à quoi se
raccrocher. Avant de lancer les agents, `enhancePrompt` (`prompt-enhancer.ts`) fait réécrire la demande par un
petit modèle (Haiku par défaut, Sonnet en option, Réglages → Agents) en un brief structuré. Il s'appuie sur
`prompt-library.ts` : règles de prompting, direction artistique de map, exemples et prompts de référence.

- **L'utilisateur ne voit jamais le brief.** Les panneaux, l'historique et les runs gardent ses mots ; le journal
  d'activité dit seulement qui a écrit le brief.
- **Le brief s'ajoute à la demande, il ne la remplace pas** (`Plan.brief` → `RoleContext.brief`, ou
  `composeBriefedRequest` pour `send`). La demande reste la référence si les deux divergent, et `interpretPrompt`
  comme `local-rules` continuent de lire la demande d'origine.
- **Quand il tourne** : `runSwarm` (nouveau jeu, monde seul) et `send(..., { enhance: true })` (mode World only,
  atelier). Jamais sur une modification (« plus médiéval »), ni au-delà de 1 200 caractères, ni sur le chat d'un panneau.
- **Quel agent** : seuls Claude Code et Codex, car ils reçoivent le prompt sur stdin (le prompt de ~10 000 caractères
  dépasse la limite de `cmd.exe`). L'appel Claude Code se fait sans outils, ni MCP, ni skills.
- **Si le modèle échoue** (timeout de 45 s, pas de compte, réponse sans `<brief>` complet) : `buildLocalBrief` produit un
  brief depuis l'interpréteur local. Le lancement n'est jamais bloqué.
- **Pour lire un brief** : `npx tsx scripts/enhance-prompt.ts "<demande>" [--model sonnet] [--local]`.

Le brief ne décrit que ce qu'un WorldSpec peut exprimer. Il améliore les choix de l'agent (style, focal, composition,
ambiance), pas la qualité des prefabs. `BLENDER_STUD_MAP_PROMPT` y sert de référence de niveau d'exigence, car les
agents n'ont ni Blender, ni rendu, ni export GLB.

### 4c. Base de connaissances

`packages/agents/src/knowledge/` : environ 60 fiches sur le prompting et la création de maps, avec leurs sources
(docs Anthropic, OpenAI, Google, Roblox ; articles de recherche ; conférences GDC, Level Design Book, 80.lv…).
Chaque fiche porte un résumé, des règles applicables, des mots-clés FR/EN, sa fiabilité et son public :

- `enhancer` : injectée dans le prompt du brief (`knowledgeForPrompt("enhancer", demande)`) ;
- `world` : injectée dans le prompt du rôle Monde et dans `composeBriefedRequest` (`worldKnowledgeSection`). Les
  fiches `recipes.ts` traduisent une idée de brief en champs du WorldSpec (bosquets → `vegetation.clustering`,
  église dans le village → `preferredZone "village"`, première vue → `cameraComposition`…) ;
- `human` : consultable seulement dans l'onglet **Knowledge** de l'app.

Les fiches `core` sont toujours envoyées ; les autres sont choisies par mots-clés (5 au plus). La base est livrée
avec l'app, sous forme de données versionnées et testées : elle ne passe pas par SQLite. Un test vérifie que chaque
valeur citée dans une recette existe dans le schéma. Pour ajouter une fiche, voir les exemples des fichiers
`prompting.ts`, `mapping.ts` et `recipes.ts`, puis lancer `npx vitest run packages/agents`.

Le domaine `game-design` (`game-design.ts`) va au rôle Design (`designKnowledgeSection`) : boucle, première session,
objectifs, monétisation saine, social, et la table `QUEST_EVENTS` des objectifs que le runtime déclenche vraiment.
`reviewGameDesign` (`game-review.ts`) vérifie chaque GameSpec : l'orchestrateur renvoie une fois au rôle Design tout
défaut « high » (quête impossible, texte pressant, pas d'objectifs), puis laisse passer pour ne pas bloquer le plan.
Tout nouveau type d'objectif doit être déclenché dans `templates/` **et** ajouté à `QUEST_EVENTS`.

Premier effet mesuré (« fait moi un village », Sonnet, un essai) : avec les recettes, l'agent règle enfin la
végétation en bosquets, les champs, la caméra du spawn et la palette, avec ou sans brief.

## 5. Mémoire de prompts

Toutes les requêtes et réponses (résumé) sont stockées en SQLite (`prompt_history`) et injectées dans le
contexte du rôle (les 10 dernières) pour la continuité conversationnelle ("Plus médiéval" s'applique au
village créé juste avant). Les sessions Claude Code sont résumables (`--resume`) pour conserver le contexte natif.

---

## 6. Runtime local & sécurité

- **Host runtime** (défaut) : le CLI est lancé avec `cwd = <projet>`, environnement filtré (pas de variables
  sensibles WorldForge), et un mode de permission par provider :
  - Claude Code : `--permission-mode acceptEdits` par défaut, `--allowedTools "Read,Edit,Write,Glob,Grep,Bash(npm run build),Bash(rbxtsc*),Bash(rojo build*)"` ; le mode `bypassPermissions` est **opt-in** explicite.
  - Codex : `--sandbox workspace-write` ; OpenCode : agent `build` avec permissions de l'outil.
- **Docker runtime** (si Docker détecté) : `docker run --rm -v <projet>:/workspace -w /workspace <image> <cli> …`
  avec montage en lecture seule des configs d'auth de l'utilisateur (`~/.claude`, `~/.codex`) — configurable.
- **WSL2** : détecté ; si présent, option d'exécuter les CLIs dans WSL.
- Les actions à risque (suppression massive, commandes shell arbitraires, publication) demandent confirmation
  dans l'UI lorsque le mode strict est activé.

---

## 7. Format d'échange avec les agents

Pour les rôles produisant des données structurées, le prompt contient :
1. le schéma JSON (généré depuis Zod),
2. un exemple valide,
3. la consigne d'écrire le fichier cible (pas de JSON dans le chat),
4. les contraintes (budgets, taille, style).

L'orchestrateur relit le fichier, valide, et renvoie les erreurs Zod formatées si besoin.

## 4d. Modèles 3D : brief caché, design 3D caché, Blender

`createModel` (`packages/agents/src/model-design.ts`) enchaîne : Haiku réécrit la demande en brief, Opus 5.5
construit le modèle en 3D dans Blender, sans budget de triangles et à pleine réflexion, puis `blender-job.ts`
cuit ce design sur un maillage de jeu sous la limite Roblox et exporte GLB et FBX. La qualité passe avant le
temps : compter environ 30 minutes par modèle, ne pas baisser l'effort d'Opus.

Les modèles ne sont jamais faits dans Roblox Studio. Le script vient d'un modèle et tourne chez le client :
`blenderScriptProblem` refuse imports et appels dangereux, et Blender tourne avec `--factory-startup` et
`--disable-autoexec`. C'est un filtre, pas un bac à sable.

Essai : `npx tsx scripts/design-model.ts "un coffre de pirate" --height 6` (au moins deux appels Claude).

Crédit : plusieurs règles de modélisation et de composition sont reformulées d'après « fwjelaa vault »
(CC BY 4.0, https://creativecommons.org/licenses/by/4.0/). Les packs `make-map`, `make-anim` et `make-model`,
le kit UI et la méthode VFX sont © fwjelaa : ils ne sont pas repris dans ce dépôt.
