import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { GENRE_INDEX, LANDMARK_TYPES, LAYOUT_ARCHETYPES, SETTLEMENT_TYPES, STYLE_FAMILY_INDEX, WorldSpecSchema } from "@worldforge/core";
import {
  BLENDER_STUD_MAP_PROMPT,
  BRIEF_EXAMPLES,
  BRIEF_MOODS,
  CREATIVE_ANGLES,
  pickCreativeAngle,
  repairBriefIds,
  ClaudeCodeProvider,
  LocalRulesProvider,
  Orchestrator,
  buildEnhancerPrompt,
  buildLocalBrief,
  buildRolePrompt,
  composeBriefedRequest,
  createProviders,
  enhancePrompt,
  interpretPrompt,
  parseBrief,
  pickEnhancerProvider,
  planWorldOnly,
  shouldEnhance,
  type AgentEvent,
  type AgentSession,
  type FileIO,
  type IAgentProvider,
  type PromptOptions,
  type SessionOptions,
} from "@worldforge/agents";
import { createNodeProcessRunner } from "@worldforge/agents/node";

const BRIEF = BRIEF_EXAMPLES[0]!.brief;

/** Provider that answers with fixed events and records how it was called. */
function fakeProvider(answer: (signal?: AbortSignal) => AsyncIterable<AgentEvent>) {
  const calls: { prompt: string; options?: PromptOptions; session: SessionOptions }[] = [];
  const provider = {
    id: "claude-code",
    startSession: async (options: SessionOptions) => ({ id: "s", provider: "claude-code", options, createdAt: "", turns: 0 }) as AgentSession,
    sendPrompt(session: AgentSession, prompt: string, options?: PromptOptions) {
      calls.push({ prompt, options, session: session.options });
      return answer(options?.signal);
    },
  } as unknown as IAgentProvider;
  return { provider, calls };
}

const replying = (result: string) =>
  fakeProvider(async function* () {
    yield { type: "done", result, exitCode: 0 };
  });

const hanging = () =>
  fakeProvider(async function* (signal) {
    await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve()));
    yield { type: "done", exitCode: 1 };
  });

describe("prompt enhancer", () => {
  it("rewrites a short request with the model, on the small model and without tools", async () => {
    const { provider, calls } = replying(`<brief>\n${BRIEF}\n</brief>`);
    const r = await enhancePrompt("fait moi un village", { provider, cwd: tmpdir() });
    expect(r).toMatchObject({ source: "model", model: "haiku", brief: BRIEF, request: "fait moi un village" });
    expect(calls[0]!.session.model).toBe("haiku");
    expect(calls[0]!.session.extraArgs).toContain("--tools=");
    expect(calls[0]!.options?.resume).toBe(false);
  });

  it("uses the model chosen in the settings", async () => {
    const { provider, calls } = replying(`<brief>${BRIEF}</brief>`);
    await enhancePrompt("un château", { provider, cwd: tmpdir(), model: "sonnet" });
    expect(calls[0]!.session.model).toBe("sonnet");
  });

  it("falls back to a local brief when the model fails, times out or answers badly", async () => {
    const bad = await enhancePrompt("un village", { provider: replying("Failed to authenticate: OAuth session expired").provider, cwd: tmpdir() });
    expect(bad.source).toBe("local");
    expect(bad.brief).toContain("INTENT: un village");
    expect(bad.reason).toContain("OAuth session expired");

    const cutOff = await enhancePrompt("un village", { provider: replying(`<brief>${BRIEF}`).provider, cwd: tmpdir() });
    expect(cutOff.source).toBe("local");
    expect(cutOff.reason).not.toContain("INTENT");

    const broken = fakeProvider(async function* () {
      yield { type: "done", exitCode: 0 };
      throw new Error("spawn failed");
    });
    expect((await enhancePrompt("un village", { provider: broken.provider, cwd: tmpdir() })).source).toBe("local");

    const late = await enhancePrompt("un village", { provider: hanging().provider, cwd: tmpdir(), timeoutMs: 10 });
    expect(late.source).toBe("local");

    const none = await enhancePrompt("un village", { cwd: tmpdir() });
    expect(none.source).toBe("local");
  });

  it("stops without a brief when the user cancels", async () => {
    const controller = new AbortController();
    const running = enhancePrompt("un village", { provider: hanging().provider, cwd: tmpdir(), signal: controller.signal });
    controller.abort();
    const r = await running;
    expect(r.source).toBe("cancelled");
    expect(r.brief).toBeUndefined();
  });

  it("leaves modifications and long requests alone", async () => {
    expect(shouldEnhance("fait moi un village")).toBe(true);
    expect(shouldEnhance("make me a village")).toBe(true);
    expect(shouldEnhance("plus médiéval")).toBe(false);
    expect(shouldEnhance("ajoute une rivière derrière le village")).toBe(false);
    expect(shouldEnhance("x".repeat(1201))).toBe(false);
    const { provider, calls } = replying("");
    expect((await enhancePrompt("moins d'arbres", { provider, cwd: tmpdir() })).source).toBe("skipped");
    expect(calls).toHaveLength(0);
  });

  it("only accepts complete briefs", () => {
    expect(parseBrief(`Here it is:\n<brief>${BRIEF}</brief>`)).toBe(BRIEF);
    expect(parseBrief(BRIEF)).toBeNull();
    expect(parseBrief(`<brief>${BRIEF}`)).toBeNull();
    expect(parseBrief("<brief>INTENT: x FOCAL: y</brief>")).toBeNull();
    expect(parseBrief(`<brief>${BRIEF.replace("FOCAL:", "CENTRE:")}</brief>`)).toBeNull();
  });

  it("picks the default agent when it can write briefs, otherwise a logged-in one", () => {
    const on = { installed: true, probablyAuthenticated: true, authHint: "" };
    const off = { installed: true, probablyAuthenticated: false, authHint: "" };
    expect(pickEnhancerProvider("codex", { codex: on, "claude-code": on })).toBe("codex");
    expect(pickEnhancerProvider("gemini-cli", { "gemini-cli": on, "claude-code": on })).toBe("claude-code");
    expect(pickEnhancerProvider("claude-code", { "claude-code": off, codex: on })).toBe("codex");
    expect(pickEnhancerProvider("claude-code", { "claude-code": off })).toBeNull();
  });

  it("passes the claude flags that keep the call tool-free", () => {
    const provider = new ClaudeCodeProvider(createNodeProcessRunner(), tmpdir(), async () => false) as unknown as { plan: (s: AgentSession, p: string, o: PromptOptions) => { args: string[]; stdin?: string } };
    const session = { id: "s", provider: "claude-code", createdAt: "", turns: 0, options: { cwd: tmpdir(), model: "haiku", extraArgs: ["--tools="] } } as AgentSession;
    const plan = provider.plan(session, "long prompt", { resume: false });
    expect(plan.args).toEqual(expect.arrayContaining(["--model", "haiku", "--tools="]));
    expect(plan.stdin).toBe("long prompt");
  });
});

describe("enhancer knowledge", () => {
  const field = (brief: string, name: string) => new RegExp(`${name}: ([a-z_]+)`).exec(brief)?.[1];

  it("teaches ids the schemas accept", () => {
    for (const { id, brief } of BRIEF_EXAMPLES) {
      expect(GENRE_INDEX[field(brief, "GENRE")!], id).toBeDefined();
      expect(STYLE_FAMILY_INDEX[field(brief, "STYLE")!], id).toBeDefined();
      expect(LAYOUT_ARCHETYPES, id).toContain(field(brief, "LAYOUT"));
      expect(LANDMARK_TYPES, id).toContain(field(brief, "FOCAL"));
      expect(SETTLEMENT_TYPES, id).toContain(field(brief, "SETTLEMENTS"));
      expect(parseBrief(`<brief>${brief}</brief>`), id).toBe(brief);
    }
  });

  it("offers moods the WorldSpec accepts", () => {
    const { spec } = interpretPrompt("un village");
    for (const mood of BRIEF_MOODS) expect(WorldSpecSchema.safeParse({ ...spec, lighting: { ...spec.lighting, mood } }).success, mood).toBe(true);
    for (const { brief } of BRIEF_EXAMPLES) expect(BRIEF_MOODS).toContain(field(brief, "MOOD"));
  });

  it("gives the model the request, the examples and the stored reference prompt", () => {
    const prompt = buildEnhancerPrompt("fait moi un village");
    expect(prompt).toContain("<user_request>\nfait moi un village\n</user_request>");
    expect(prompt).toContain(BLENDER_STUD_MAP_PROMPT);
    for (const e of BRIEF_EXAMPLES) expect(prompt).toContain(e.brief);
    expect(prompt.lastIndexOf("<user_request>")).toBeGreaterThan(prompt.indexOf("</examples>"));
    expect(prompt).not.toContain("<creative_angle>");
  });

  it("never shows an example whose request a player would type as is", () => {
    // a model copies an example whose request matches the player's word for word: every village came out identical
    for (const common of ["fait moi un village", "un village", "une ville", "une île", "une map"]) expect(BRIEF_EXAMPLES.map((e) => e.request)).not.toContain(common);
  });

  it("varies the brief with a creative angle the request can overrule", async () => {
    expect(buildEnhancerPrompt("un village", CREATIVE_ANGLES[0])).toContain(`consider this angle: ${CREATIVE_ANGLES[0]}`);
    expect(pickCreativeAngle(() => 0.999)).toBe(CREATIVE_ANGLES[CREATIVE_ANGLES.length - 1]);
    const { provider, calls } = replying(`<brief>${BRIEF}</brief>`);
    await enhancePrompt("un village", { provider, cwd: tmpdir() });
    expect(calls[0]!.prompt).toContain("<creative_angle>");
  });

  it("replaces the ids a model invents and keeps the valid ones", async () => {
    const invented = BRIEF.replace("MOOD: dawn", "MOOD: dark").replace("STYLE: feudal_japan", "STYLE: zen_garden");
    const fixed = repairBriefIds(invented, "un coin tranquille");
    expect(BRIEF_MOODS).toContain(field(fixed, "MOOD"));
    expect(STYLE_FAMILY_INDEX[field(fixed, "STYLE")!]).toBeDefined();
    expect(field(fixed, "GENRE")).toBe("hangout");
    expect(field(fixed, "LAYOUT")).toBe("hangout_plaza");
    expect(repairBriefIds(BRIEF, "un coin tranquille")).toBe(BRIEF);
    const r = await enhancePrompt("un coin tranquille", { provider: replying(`<brief>${invented}</brief>`).provider, cwd: tmpdir() });
    expect(r.brief).not.toContain("MOOD: dark");
  });

  it("builds a local brief that passes the same check as a model brief", () => {
    for (const request of ["fait moi un village", "une île pirate", "a neon city race", "xyz"]) expect(parseBrief(`<brief>${buildLocalBrief(request)}</brief>`), request).not.toBeNull();
  });
});

describe("the brief reaches the agents, not the user's words", () => {
  const ctx = { userPrompt: "fait moi un village", brief: BRIEF, projectName: "Test" };

  it("sits next to the request in role prompts", () => {
    const prompt = buildRolePrompt("world", ctx);
    expect(prompt).toContain(`User request:\n"""\nfait moi un village\n"""`);
    expect(prompt).toContain(BRIEF);
    expect(prompt).toContain("the request wins");
    expect(buildRolePrompt("world", { ...ctx, brief: undefined })).not.toContain("Creative brief");
    expect(buildRolePrompt("qa", ctx)).not.toContain(BRIEF);
  });

  it("travels from the plan to every attempt of the task", async () => {
    const plan = planWorldOnly("fait moi un village");
    plan.brief = BRIEF;
    const { provider, calls } = fakeProvider(async function* () {
      yield { type: "done", result: "ok", exitCode: 0 };
    });
    const files: FileIO = { readText: async () => "", writeText: async () => {}, exists: async () => false, mkdirp: async () => {}, join: (...p) => p.join("/") };
    const orchestrator = new Orchestrator({
      files,
      projectDir: tmpdir(),
      projectName: "Test",
      acquireSession: async () => ({ provider, session: await provider.startSession({ cwd: tmpdir() }) }),
      onEvent: () => {},
    });
    await orchestrator.run(plan);
    expect(calls.length).toBe(2); // the output file is missing, so the task retries
    for (const call of calls) expect(call.prompt).toContain(BRIEF);
    expect(plan.userPrompt).toBe("fait moi un village");
  });

  it("does not change what the local interpreter reads", async () => {
    const written: Record<string, string> = {};
    const files: FileIO = { readText: async (p) => written[p] ?? "", writeText: async (p, c) => void (written[p] = c), exists: async (p) => p in written, mkdirp: async () => {}, join: (...p) => p.join("/") };
    const local = createProviders({ runner: createNodeProcessRunner(), files, homeDir: tmpdir() }).get("local-rules") as LocalRulesProvider;
    const session = await local.startSession({ cwd: "project", role: "world" });
    const events: AgentEvent[] = [];
    for await (const ev of local.sendPrompt(session, composeBriefedRequest("un désert au coucher du soleil", BRIEF))) events.push(ev);
    const used = events.find((e): e is Extract<AgentEvent, { type: "tool_use" }> => e.type === "tool_use");
    expect((used?.input as { prompt: string }).prompt).toBe("un désert au coucher du soleil");
  });
});
