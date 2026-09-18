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
