import { newId, nowIso } from "@worldforge/core";
import type { ProcessRunner } from "../runner";
import type { AgentCapabilities, AgentDetection, AgentEvent, AgentSession, AgentStatus, AgentUsage, AuthResult, FileIO, IAgentProvider, PromptOptions, SessionOptions } from "../types";

/**
 * Antigravity (Google's agentic IDE) has no headless CLI. This provider is honest about it:
 * it writes the task to `<project>/AGENT_TASK.md`, opens the project in Antigravity and reports
 * "external" status. Use the Gemini CLI provider for headless Google models.
 */
export class AntigravityProvider implements IAgentProvider {
  readonly id = "antigravity" as const;
  readonly name = "Antigravity";
  status: AgentStatus = "unknown";
  private sessions = new Map<string, AgentSession>();

  constructor(
    private runner: ProcessRunner,
    private files: FileIO,
  ) {}

  async detect(): Promise<AgentDetection> {
    const path = await this.runner.resolve("antigravity");
    this.status = path ? "external" : "not-installed";
    return { installed: !!path, path: path ?? undefined, probablyAuthenticated: !!path, authHint: "Sign in inside the Antigravity IDE" };
  }

  async authenticate(): Promise<AuthResult> {
    return { ok: false, message: "Authentication happens inside the Antigravity IDE." };
  }

  async startSession(opts: SessionOptions): Promise<AgentSession> {
    const s: AgentSession = { id: newId("ses"), provider: this.id, options: opts, createdAt: nowIso(), turns: 0 };
    this.sessions.set(s.id, s);
    return s;
  }

  async *sendPrompt(session: AgentSession, prompt: string, _opts?: PromptOptions): AsyncIterable<AgentEvent> {
    const taskPath = this.files.join(session.options.cwd, "AGENT_TASK.md");
    const body = `# WorldForge task for Antigravity\n\n_Generated ${nowIso()}_\n\n${session.options.systemPrompt ? session.options.systemPrompt + "\n\n---\n\n" : ""}${prompt}\n`;
    await this.files.writeText(taskPath, body);
    yield { type: "status", text: `Task written to AGENT_TASK.md — opening the project in Antigravity…` };
    try {
      await this.runner.spawn({ id: `antigravity_${session.id}_${session.turns++}`, program: "antigravity", args: [session.options.cwd] });
      yield { type: "text", text: "Antigravity opened the project. Paste or reference AGENT_TASK.md in the Antigravity agent panel; WorldForge will pick up the files it writes (world.spec.json, src/**)." };
    } catch (e) {
      yield { type: "error", message: `Could not launch Antigravity: ${(e as Error).message}` };
    }
    yield { type: "done", exitCode: 0 };
  }

  async *streamOutput(): AsyncIterable<AgentEvent> {}
  async stop(): Promise<void> {}
  async getUsage(): Promise<AgentUsage> {
    return {};
  }
  getCapabilities(): AgentCapabilities {
    return { streaming: false, jsonOutput: false, vision: true, fileEdit: true, shell: true, mcp: true, headless: false, resumable: false, models: [{ id: "", label: "Chosen in the IDE" }], customModel: false };
  }
}
