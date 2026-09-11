import type { ProcessRunner } from "../runner";
import type { AgentEvent, AgentSession, PromptOptions } from "../types";
import { BaseCliProvider, tryJson, type SpawnPlan } from "./base";

export const OPENCODE_MODELS = [
  { id: "", label: "Default (opencode config)" },
  { id: "anthropic/claude-sonnet-5", label: "Anthropic · Sonnet 5" },
  { id: "anthropic/claude-opus-5", label: "Anthropic · Opus 5" },
  { id: "openai/gpt-5", label: "OpenAI · GPT-5" },
  { id: "google/gemini-2.5-pro", label: "Google · Gemini 2.5 Pro" },
];

/**
 * OpenCode provider — `opencode run --format json`.
 * The message is passed as an argument; long prompts are written to a task file in the project.
 */
export class OpenCodeProvider extends BaseCliProvider {
  private lastText = "";
  constructor(runner: ProcessRunner, homeDir: string, fileExists: (p: string) => Promise<boolean>) {
    super(
      runner,
      {
        id: "opencode",
        name: "OpenCode",
        binary: "opencode",
        versionArgs: ["--version"],
        authMarkers: [".local/share/opencode/auth.json", ".config/opencode/opencode.json", ".config/opencode"],
        authCommand: "opencode auth login",
        capabilities: {
          streaming: true,
          jsonOutput: true,
          vision: false,
          fileEdit: true,
          shell: true,
          mcp: true,
          headless: true,
          resumable: true,
          models: OPENCODE_MODELS,
          customModel: true,
        },
      },
      homeDir,
      fileExists,
    );
  }

  protected plan(session: AgentSession, prompt: string, opts: PromptOptions): SpawnPlan {
    const o = session.options;
    const args = ["run", "--format", "json"];
    if (o.model) args.push("-m", o.model);
    if (opts.resume !== false && session.nativeSessionId) args.push("-s", session.nativeSessionId);
    if (o.extraArgs) args.push(...o.extraArgs);
    const text = o.systemPrompt ? `${o.systemPrompt}\n\n---\n\n${prompt}` : prompt;
    this.lastText = "";
    args.push(text);
    return { args };
  }

  protected parseLine(line: string, stream: "stdout" | "stderr"): AgentEvent[] {
    const json = tryJson(line) as Record<string, unknown> | undefined;
    if (!json) {
      if (line.trim()) return [{ type: stream === "stderr" ? "status" : "text", text: line.trim() }];
      return [];
    }
    const events: AgentEvent[] = [];
    const type = String(json.type ?? "");
    const sessionId = (json.sessionID ?? json.session_id ?? (json.info as { sessionID?: string })?.sessionID) as string | undefined;
    if (sessionId) events.push({ type: "session", nativeSessionId: sessionId });
    const part = (json.part ?? json) as Record<string, unknown>;
    const ptype = String(part.type ?? type);
    if (ptype === "text" && typeof part.text === "string") {
      this.lastText += part.text;
      events.push({ type: "text", text: part.text, partial: true });
    } else if (ptype === "reasoning" && typeof part.text === "string") events.push({ type: "thinking", text: part.text });
    else if (ptype === "tool" || ptype === "tool-invocation" || ptype === "tool_use") {
      const state = part.state as Record<string, unknown> | undefined;
      const name = String(part.tool ?? part.name ?? "tool");
      if (!state || state.status === "running" || state.status === "pending") events.push({ type: "tool_use", name, input: state?.input ?? part.input });
      if (state && state.status === "completed") events.push({ type: "tool_result", output: String(state.output ?? "").slice(0, 2000) });
      if (state && state.status === "error") events.push({ type: "tool_result", output: String(state.error ?? ""), isError: true });
    } else if (ptype === "step-finish" || type === "step_finish") {
      const tokens = part.tokens as Record<string, number> | undefined;
      if (tokens) events.push({ type: "usage", usage: { inputTokens: tokens.input, outputTokens: tokens.output, costUsd: part.cost as number | undefined } });
    } else if (type === "error") events.push({ type: "error", message: String((json.error as { message?: string })?.message ?? json.message ?? "OpenCode error") });
    return events;
  }

  protected finalize(_session: AgentSession, code: number): AgentEvent[] {
    return code === 0 ? [{ type: "done", result: this.lastText || undefined, exitCode: 0 }] : [];
  }
}
