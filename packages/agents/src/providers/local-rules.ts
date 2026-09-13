import { GENRE_INDEX, GameSpecSchema, WorldSpecSchema, newId, nowIso, type GameSpec, type WorldSpec } from "@worldforge/core";
import { buildGameFiles } from "@worldforge/roblox-export";
import { interpretGame, interpretModification, interpretPrompt } from "../local/interpreter";
import type { AgentCapabilities, AgentDetection, AgentEvent, AgentSession, AgentStatus, AgentUsage, AuthResult, FileIO, IAgentProvider, PromptOptions, SessionOptions } from "../types";

/**
 * Local rule-based provider. Deterministic, offline, instant. It is not an AI: it compiles the
 * brief into WorldSpec/GameSpec files with the keyword interpreter and applies GameSpec values to
 * src/shared/config.ts. Roles that need real code generation report that an AI agent is required.
 */
export class LocalRulesProvider implements IAgentProvider {
  readonly id = "local-rules" as const;
  readonly name = "Local rules (no AI)";
  status: AgentStatus = "authenticated";
  private sessions = new Map<string, AgentSession>();

  constructor(private files: FileIO) {}

  async detect(): Promise<AgentDetection> {
    return { installed: true, probablyAuthenticated: true, authHint: "" };
  }
  async authenticate(): Promise<AuthResult> {
    return { ok: true, message: "No authentication needed." };
  }
  async startSession(opts: SessionOptions): Promise<AgentSession> {
    const s: AgentSession = { id: newId("ses"), provider: this.id, options: opts, createdAt: nowIso(), turns: 0 };
    this.sessions.set(s.id, s);
    return s;
  }

  async *sendPrompt(session: AgentSession, prompt: string, _opts?: PromptOptions): AsyncIterable<AgentEvent> {
    session.turns++;
    const role = session.options.role ?? "chat";
    const cwd = session.options.cwd;
    const specPath = this.files.join(cwd, "worlds", "main", "world.spec.json");
    const gamePath = this.files.join(cwd, "design", "game.spec.json");
    const userPrompt = extractUserRequest(prompt);
    try {
      if (role === "world" || role === "chat") {
        const existing = (await this.files.exists(specPath)) ? safeParse(WorldSpecSchema, await this.files.readText(specPath)) : null;
        if (existing && isModification(userPrompt)) {
          const mod = interpretModification(existing, userPrompt);
          await this.files.writeText(specPath, JSON.stringify(mod.spec, null, 2));
          yield { type: "tool_use", name: "interpret_modification", input: { prompt: userPrompt } };
          yield { type: "text", text: `Applied: ${mod.summary.join("; ") || "no changes"}. Layers to regenerate: ${mod.regenerate.join(", ")}${mod.newSeed ? " (new seed)" : ""}.` };
          yield { type: "done", result: JSON.stringify({ regenerate: mod.regenerate, newSeed: mod.newSeed, summary: mod.summary }), exitCode: 0 };
          return;
        }
        const interp = interpretPrompt(userPrompt);
        yield { type: "tool_use", name: "interpret_prompt", input: { prompt: userPrompt, detected: interp.detected } };
        await this.files.writeText(specPath, JSON.stringify(interp.spec, null, 2));
        yield { type: "text", text: `WorldSpec "${interp.spec.name}": ${interp.spec.biomes.map((b) => b.id).join("/")} biomes, ${interp.spec.landmarks.length} landmarks (${interp.spec.landmarks.map((l) => l.type).join(", ")}), ${interp.spec.settlements.length} settlement(s), ${interp.spec.rivers.length} river(s), style ${interp.spec.stylePreset}, ${interp.spec.lighting.mood} mood.` };
        if (role === "chat" && !(await this.files.exists(gamePath))) {
          await this.files.writeText(gamePath, JSON.stringify(interp.game, null, 2));
        }
        yield { type: "done", result: `WorldSpec written to worlds/main/world.spec.json`, exitCode: 0 };
        return;
      }
      if (role === "design") {
        const spec = (await this.files.exists(specPath)) ? safeParse(WorldSpecSchema, await this.files.readText(specPath)) : interpretPrompt(userPrompt).spec;
        const game = interpretGame(userPrompt, spec ?? interpretPrompt(userPrompt).spec);
        await this.files.writeText(gamePath, JSON.stringify(game, null, 2));
        yield { type: "tool_use", name: "interpret_game", input: { genre: game.genre, systems: game.systems.map((s) => s.id) } };
        yield { type: "text", text: `GameSpec "${game.title}": genre ${game.genre}, systems ${game.systems.map((s) => s.id).join(", ")}, ${game.quests.length} quest(s), UI ${game.ui.screens.join("/")}.` };
        yield { type: "done", result: "GameSpec written to design/game.spec.json", exitCode: 0 };
        return;
      }
      if (role === "gameplay" || role === "integration") {
        const game = (await this.files.exists(gamePath)) ? safeParse(GameSpecSchema, await this.files.readText(gamePath)) : null;
        if (game) {
          const configPath = this.files.join(cwd, "src", "shared", "config.ts");
          await this.files.writeText(configPath, buildConfigTs(game));
          for (const f of buildGameFiles(game)) await this.files.writeText(this.files.join(cwd, ...f.path.split("/")), f.content);
          yield { type: "tool_use", name: "write_config", input: { files: ["src/shared/config.ts", ...buildGameFiles(game).map((f) => f.path)] } };
          yield { type: "text", text: `Applied GameSpec to src/shared/config.ts (currency "${game.currencies[0]?.name ?? "Coins"}", survival ${game.systems.some((s) => s.id === "survival_stats") ? "on" : "off"}, collectibles ${game.systems.some((s) => s.id === "collectibles") ? "on" : "off"}). New systems beyond the templates (${game.systems.map((s) => s.id).filter((id) => !["player_data", "currency", "collectibles", "survival_stats", "leaderboards"].includes(id)).join(", ") || "none"}) require an AI agent (Claude Code, Codex, OpenCode or Gemini CLI).` };
        } else yield { type: "text", text: "No design/game.spec.json found; run the Design role first." };
        yield { type: "done", result: "config applied", exitCode: 0 };
        return;
      }
      yield { type: "text", text: `The local rule-based provider cannot perform the "${role}" role. Install and select an AI agent (Claude Code, Codex, OpenCode or Gemini CLI) for this task.` };
      yield { type: "done", exitCode: 0 };
    } catch (e) {
      yield { type: "error", message: (e as Error).message };
      yield { type: "done", exitCode: 1 };
    }
  }

  async *streamOutput(): AsyncIterable<AgentEvent> {}
  async stop(): Promise<void> {}
  async getUsage(): Promise<AgentUsage> {
    return {};
  }
  getCapabilities(): AgentCapabilities {
    return { streaming: true, jsonOutput: true, vision: false, fileEdit: true, shell: false, mcp: false, headless: true, resumable: false, models: [{ id: "rules", label: "Rule-based interpreter" }], customModel: false };
  }
}

function safeParse<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, text: string): T | null {
  try {
    const r = schema.safeParse(JSON.parse(text));
    return r.success ? (r.data as T) : null;
  } catch {
    return null;
  }
}

/** The orchestrator wraps the user's request in a task prompt; recover the raw request. */
function extractUserRequest(prompt: string): string {
  const m = /User request:\s*"""\s*([\s\S]*?)\s*"""/.exec(prompt);
  return m ? m[1]!.trim() : prompt.trim();
}

function isModification(prompt: string): boolean {
  const t = prompt.toLowerCase();
  return /^(plus|moins|ajoute|ajouter|enleve|enlève|supprime|remplace|change|modifie|rends|met|more|less|fewer|add|remove|replace|make it|change|regenerate|régénère|regenere|reroll)\b/.test(t) || /\b(plus|moins)\s+(de|d')/.test(t);
}

/** Render src/shared/config.ts from a GameSpec (keeps the template's shape). */
export function buildConfigTs(game: GameSpec): string {
  const currency = game.currencies[0] ?? { id: "coins", name: "Coins", startingAmount: 0 };
  const survival = game.systems.find((s) => s.id === "survival_stats");
  const collectibles = game.systems.find((s) => s.id === "collectibles");
  const num = (v: unknown, d: number) => (typeof v === "number" ? v : d);
  const p = (system: string, key: string): unknown => game.systems.find((s) => s.id === system)?.params[key];
  const genre = GENRE_INDEX[game.genre];
  const systemIds = [...new Set(game.systems.map((s) => s.id))];
  const enemyNpc = game.npcs.find((n) => n.role === "zombie" || n.role === "monster" || n.role === "enemy" || n.role === "boss");
  const enemyKind = enemyNpc?.role ?? "enemy";
  const enemyName = enemyNpc?.name ?? (enemyKind === "zombie" ? "Walker" : enemyKind === "monster" ? "The Stalker" : "Raider");
  const leaderstats = systemIds.includes("obby") || systemIds.includes("checkpoints") ? ["Stage"] : systemIds.includes("rounds") || systemIds.includes("racing") || systemIds.includes("tower_defense") ? ["Wins"] : systemIds.includes("combat") ? ["Kills"] : systemIds.includes("progression") ? ["Level"] : systemIds.includes("simulator_loop") ? ["Rebirths"] : [];
  return `/** Gameplay constants — generated from design/game.spec.json by WorldForge (editable). */
export const GameConfig = {
\tname: ${JSON.stringify(game.title)},
\tcurrency: { id: ${JSON.stringify(currency.id)}, name: ${JSON.stringify(currency.name)}, starting: ${currency.startingAmount} },
\tsurvival: {
\t\tenabled: ${survival ? "true" : "false"},
\t\thungerMax: ${num(survival?.params.hungerMax, 100)},
\t\thungerDrainPerSecond: ${num(survival?.params.drainPerSecond, 0.35)},
\t\tstarvationDamagePerSecond: ${num(survival?.params.damagePerSecond, 2)},
\t\tfoodRestore: ${num(survival?.params.foodRestore, 30)},
\t},
\tcollectibles: {
\t\tenabled: ${collectibles ? "true" : "false"},
\t\t/** Prefab names (attribute "Prefab") that can be collected. */
\t\tprefabs: ${JSON.stringify(typeof collectibles?.params.prefabs === "string" ? String(collectibles.params.prefabs).split(",").map((s) => s.trim()) : ["small_mushroom"])},
\t\trewardCoins: ${num(collectibles?.params.reward, 5)},
\t\trespawnSeconds: ${num(collectibles?.params.respawnSeconds, 90)},
\t\tpromptText: ${JSON.stringify(typeof collectibles?.params.promptText === "string" ? collectibles.params.promptText : "Pick up")},
\t},
\tdataStore: { name: ${JSON.stringify(`WF_${game.title.replace(/[^A-Za-z0-9]/g, "")}_v1`)}, autosaveSeconds: 120 },
\t/** Genre + enabled gameplay systems (ids from the WorldForge taxonomy); systems start only when listed. */
\tgenre: ${JSON.stringify(game.genre)} as string,
\tsystems: ${JSON.stringify(systemIds)} as string[],
\t/** Extra leaderstats mirrored from Profile.stats. */
\tleaderstats: ${JSON.stringify(leaderstats)} as string[],
\tcamera: ${JSON.stringify(genre?.camera ?? "third_person")} as "third_person" | "first_person" | "top_down" | "free",
\tlayout: ${JSON.stringify(genre?.layout ?? "settlement")} as string,
\tcombat: { maxHealth: ${num(p("combat", "maxHealth"), 100)}, meleeDamage: ${num(p("combat", "damage"), 25)}, meleeCooldown: 0.6, respawnSeconds: 4, killReward: ${num(p("combat", "killReward"), 25)} },
\tenemies: { kind: ${JSON.stringify(enemyKind)} as string, name: ${JSON.stringify(enemyName)}, count: ${num(p("enemies", "count"), 8)}, health: ${num(p("enemies", "health"), 80)}, damage: ${num(p("enemies", "damage"), 12)}, speed: ${num(p("enemies", "speed"), 14)}, chaseRange: ${num(p("enemies", "chaseRange"), 60)}, respawnSeconds: 25, reward: ${num(p("enemies", "reward"), 15)} },
\trounds: { intermissionSeconds: ${num(p("rounds", "intermission"), 15)}, roundSeconds: ${num(p("rounds", "length"), 120)}, minPlayers: ${num(p("rounds", "minPlayers"), 1)}, teams: ["a", "b"] as string[], winReward: ${num(p("rounds", "winReward"), 100)} },
\tobby: { stageReward: ${num(p("obby", "stageReward"), 10)}, finishReward: ${num(p("obby", "finishReward"), 250)} },
\ttycoon: { claimCost: 0, buttonCosts: [50, 150, 400, 1000] as number[], dropValue: ${num(p("tycoon", "dropValue"), 3)}, dropInterval: 2, baseIncome: 1 },
\tsimulator: { clickValue: ${num(p("simulator_loop", "clickValue"), 1)}, backpackSize: ${num(p("simulator_loop", "backpackSize"), 50)}, sellMultiplier: 1, rebirthCost: ${num(p("simulator_loop", "rebirthCost"), 5000)}, upgradeCosts: [100, 300, 900, 2700] as number[] },
\tracing: { laps: ${num(p("racing", "laps"), 3)}, checkpointReward: 5, lapReward: 60 },
\ttowerDefense: { waves: ${num(p("tower_defense", "waves"), 10)}, baseHp: ${num(p("tower_defense", "baseHp"), 100)}, enemiesPerWave: ${num(p("tower_defense", "enemiesPerWave"), 6)}, towerCost: ${num(p("tower_defense", "towerCost"), 100)}, towerDamage: 20, towerRange: 30, towerRate: 1 },
\tfarming: { growSeconds: ${num(p("farming", "growSeconds"), 45)}, seedCost: 10, cropValue: ${num(p("farming", "cropValue"), 30)}, plots: ${num(p("farming", "plots"), 6)} },
\tmining: { nodes: ${num(p("mining", "nodes"), 24)}, hitsPerNode: 4, respawnSeconds: 40, oreValue: ${num(p("mining", "oreValue"), 12)} },
\tpets: { eggCost: ${num(p("pets", "eggCost"), 250)}, followDistance: 6, multipliers: [1.1, 1.25, 1.5, 2] as number[] },
\tprogression: { xpPerLevel: ${num(p("progression", "xpPerLevel"), 100)}, xpPerAction: 5 },
\tdayNight: { dayLengthSeconds: ${num(p("day_night", "dayLengthSeconds"), 600)}, startHour: ${num(p("day_night", "startHour"), 12)}, nightEnemyMultiplier: 1.5 },
\tsports: { matchSeconds: 180, goalReward: 20 },
\tpuzzle: { rooms: 4 },
} as const;
`;
}

export type { WorldSpec };
