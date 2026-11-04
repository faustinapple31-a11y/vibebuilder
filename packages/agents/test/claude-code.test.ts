import { describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { ClaudeCodeProvider, roleSystemPrompt, type AgentSession, type PromptOptions } from "@worldforge/agents";
import { createNodeProcessRunner } from "@worldforge/agents/node";

type Planner = { plan: (s: AgentSession, p: string, o: PromptOptions) => { args: string[]; stdin?: string } };
const provider = new ClaudeCodeProvider(createNodeProcessRunner(), tmpdir(), async () => false) as unknown as Planner;
const session = (systemPrompt: string, nativeSessionId?: string) => ({ id: "s", provider: "claude-code", createdAt: "", turns: 0, nativeSessionId, options: { cwd: tmpdir(), systemPrompt } }) as AgentSession;

describe("claude code command line", () => {
  it("stays under Windows' 32 767-character limit with the world role prompt", () => {
    const world = roleSystemPrompt("world");
    expect(world.length).toBeGreaterThan(32_767); // the reason this test exists
    const plan = provider.plan(session(world), "build a village", {});
    expect(plan.args.join(" ").length).toBeLessThan(32_767);
    expect(plan.args).not.toContain("--append-system-prompt");
    expect(plan.stdin).toContain(world);
    expect(plan.stdin!.endsWith("build a village")).toBe(true);
  });

  it("sends a long system prompt once per native session", () => {
    const plan = provider.plan(session(roleSystemPrompt("world"), "native-1"), "now add a river", {});
    expect(plan.args).toEqual(expect.arrayContaining(["--resume", "native-1"]));
    expect(plan.stdin).toBe("now add a river");
    expect(provider.plan(session(roleSystemPrompt("world"), "native-1"), "fresh", { resume: false }).stdin).toContain("<system_instructions>");
  });

  it("keeps short system prompts as an argument", () => {
    const plan = provider.plan(session("Be brief."), "hi", {});
    expect(plan.args).toEqual(expect.arrayContaining(["--append-system-prompt", "Be brief."]));
    expect(plan.stdin).toBe("hi");
  });
});
