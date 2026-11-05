import { describe, expect, it } from "vitest";
import { GENRES, GameSpecSchema, type GameSpec } from "@worldforge/core";
import { Orchestrator, QUEST_EVENTS, buildRolePrompt, interpretPrompt, planNewGame, reviewGameDesign, type FileIO, type IAgentProvider } from "@worldforge/agents";

const village = () => interpretPrompt("un village").game;
const ids = (game: GameSpec) => reviewGameDesign(game).map((p) => p.id);

describe("game design review", () => {
  it("passes what the local interpreter generates, in every genre", () => {
    for (const genre of GENRES) {
      const { game } = interpretPrompt(`un jeu ${genre.name} ${genre.keywords?.[0] ?? genre.id}`);
      const blocking = reviewGameDesign(game).filter((p) => p.severity === "high");
      expect(blocking.map((p) => p.message), `${genre.id} → ${game.genre}`).toEqual([]);
    }
  });

  it("gives every game short, mid and long goals and something to start with", () => {
    for (const prompt of ["un obby", "un tycoon de restaurant", "une arène de combat", "une course de voitures", "un village", "un tower defense"]) {
      const { game } = interpretPrompt(prompt);
      expect(game.quests.length, prompt).toBeGreaterThanOrEqual(3);
      expect(game.systems.map((s) => s.id), prompt).toContain("quests");
      expect(game.ui.screens, prompt).toContain("quests");
      expect(game.currencies[0]!.startingAmount, prompt).toBeGreaterThan(0);
      const counts = game.quests.filter((q) => q.objective.type === game.quests[0]!.objective.type && q.objective.target === game.quests[0]!.objective.target).map((q) => q.objective.count);
      expect(counts, prompt).toEqual([...counts].sort((a, b) => a - b));
    }
  });

  it("flags quests the runtime can never complete", () => {
    const game = village();
    const never = { ...game, quests: [...game.quests, { id: "x", title: "x", description: "", objective: { type: "score" as const, target: "any", count: 1 }, reward: { amount: 1 } }] };
    expect(ids(never)).toContain("quest_impossible");
    const wrongTarget = { ...game, quests: [...game.quests, { id: "y", title: "y", description: "", objective: { type: "reach" as const, target: "dungeon_boss", count: 1 }, reward: { amount: 1 } }] };
    expect(ids(wrongTarget)).toContain("quest_impossible");
    const noSystem = { ...game, quests: [...game.quests, { id: "z", title: "z", description: "", objective: { type: "win_rounds" as const, target: "any", count: 1 }, reward: { amount: 1 } }] };
    expect(ids(noSystem)).toContain("quest_impossible");
  });

  it("flags thin designs", () => {
    const game = village();
    expect(ids({ ...game, coreLoop: ["Walk"] })).toContain("core_loop_thin");
    expect(ids({ ...game, quests: game.quests.slice(0, 1) })).toContain("goals_missing");
    expect(ids({ ...game, systems: game.systems.filter((s) => s.id !== "quests") })).toContain("goals_not_tracked");
    expect(ids({ ...game, currencies: game.currencies.map((c) => ({ ...c, startingAmount: 0 })) })).toContain("no_starter_currency");
  });

  it("flags pressure wording, and the default shop has none", () => {
    const game = village();
    expect(ids(game)).not.toContain("pushy_copy");
    for (const description of ["One-time offer: start strong", "GET IT NOW", "Hurry, last chance", "Permanently DOUBLE your coins"]) {
      const item = { ...game.shop.items[0]!, description };
      expect(ids({ ...game, shop: { ...game.shop, items: [item] } }), description).toContain("pushy_copy");
    }
    expect(ids({ ...game, monetization: { ...game.monetization, gamepasses: [{ ...game.monetization.gamepasses[0]!, name: "VIP", description: "A golden lantern." }] } })).not.toContain("pushy_copy");
  });

  it("tells the Design agent what the runtime reports", () => {
    const prompt = buildRolePrompt("design", { userPrompt: "un village", projectName: "T" });
    for (const type of Object.keys(QUEST_EVENTS)) expect(prompt).toContain(type);
    expect(prompt).toContain("Never use the score or deliver objectives");
    expect(buildRolePrompt("world", { userPrompt: "un village", projectName: "T" })).not.toContain("Game design rules");
  });

  it("sends a flawed design back once, then lets the plan go on", async () => {
    const written: Record<string, string> = {};
    const flawed = JSON.stringify(GameSpecSchema.parse({ title: "Flawed", genre: "adventure" }));
    const files: FileIO = { readText: async (p) => written[p] ?? "", writeText: async (p, c) => void (written[p] = c), exists: async (p) => p in written, mkdirp: async () => {}, join: (...p) => p.join("/") };
    const prompts: string[] = [];
    const provider = {
      id: "claude-code",
      startSession: async (options: unknown) => ({ id: "s", provider: "claude-code", options, createdAt: "", turns: 0 }),
      async *sendPrompt(_session: unknown, prompt: string) {
        prompts.push(prompt);
        written["project/design/game.spec.json"] = flawed;
        yield { type: "done" as const, result: "ok", exitCode: 0 };
      },
    } as unknown as IAgentProvider;
    const orchestrator = new Orchestrator({ files, projectDir: "project", projectName: "T", acquireSession: async () => ({ provider, session: await provider.startSession({ cwd: "project" }) }), onEvent: () => {} });
    const plan = await orchestrator.run(planNewGame("un village", ["design"]));
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Your previous output was rejected");
    expect(plan.tasks[0]!.status).toBe("done");
  });
});
