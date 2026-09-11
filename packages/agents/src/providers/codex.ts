import type { ProcessRunner } from "../runner";
import type { AgentEvent, AgentSession, PromptOptions } from "../types";
import { BaseCliProvider, tryJson, type SpawnPlan } from "./base";

export const CODEX_MODELS = [
  { id: "", label: "Default (account setting)" },
  { id: "gpt-5-codex", label: "GPT-5 Codex" },
  { id: "gpt-5", label: "GPT-5" },
  { id: "o3", label: "o3" },
];
export const CODEX_EFFORTS = ["low", "medium", "high", "xhigh"];

/**
 * OpenAI Codex CLI provider — `codex exec --json`.
 * Prompt is piped on stdin ("-"). Events are NDJSON; several schema generations are handled.
 */
export class CodexProvider extends BaseCliProvider {
  private lastAssistantText = "";
  constructor(runner: ProcessRunner, homeDir: string, fileExists: (p: string) => Promise<boolean>) {
    super(
      runner,
      {
        id: "codex",
        name: "Codex",
        binary: "codex",
        versionArgs: ["--version"],
        authMarkers: [".codex/auth.json", ".codex/config.toml"],
        authCommand: "codex login",
        capabilities: {
          streaming: true,
          jsonOutput: true,
          vision: true,
          fileEdit: true,
          shell: true,
          mcp: true,
          headless: true,
          resumable: false,
          models: CODEX_MODELS,
          efforts: CODEX_EFFORTS,
          customModel: true,
        },
      },
      homeDir,
      fileExists,
    );
  }

  protected plan(session: AgentSession, prompt: string, opts: PromptOptions): SpawnPlan {
    const o = session.options;
    const args = ["exec", "--json", "--skip-git-repo-check"];
    if (o.model) args.push("-m", o.model);
    if (o.effort) args.push("-c", `model_reasoning_effort="${o.effort}"`);
    const mode = o.permissionMode ?? "acceptEdits";
    if (mode === "bypass") args.push("--dangerously-bypass-approvals-and-sandbox");
    else if (mode === "acceptEdits") args.push("--full-auto");
    else args.push("--sandbox", "read-only");
    args.push("-C", o.cwd);
    if (opts.images) for (const img of opts.images) args.push("-i", img);
    if (o.extraArgs) args.push(...o.extraArgs);
    args.push("-");
    const text = o.systemPrompt ? `${o.systemPrompt}\n\n---\n\n${prompt}` : prompt;
    this.lastAssistantText = "";
    return { args, stdin: text };
  }

  protected parseLine(line: string, stream: "stdout" | "stderr"): AgentEvent[] {
    const json = tryJson(line) as Record<string, unknown> | undefined;
    if (!json) {
      if (line.trim()) return [{ type: stream === "stderr" ? "status" : "text", text: line.trim() }];
      return [];
    }
    const events: AgentEvent[] = [];
    // New schema: {"type":"item.completed","item":{"type":"agent_message","text":...}} / thread.started / turn.completed
    const type = json.type as string | undefined;
    if (type === "thread.started" && json.thread_id) events.push({ type: "session", nativeSessionId: String(json.thread_id) });
    const item = json.item as Record<string, unknown> | undefined;
    if (item && (type === "item.completed" || type === "item.started")) {
      const it = item.type as string;
      if (it === "agent_message" && typeof item.text === "string" && type === "item.completed") {
        this.lastAssistantText = item.text;
        events.push({ type: "text", text: item.text });
      } else if (it === "reasoning" && typeof item.text === "string" && type === "item.completed") events.push({ type: "thinking", text: item.text });
      else if (it === "command_execution" && type === "item.started") events.push({ type: "tool_use", name: "shell", input: { command: item.command } });
      else if (it === "command_execution" && type === "item.completed") events.push({ type: "tool_result", output: String(item.aggregated_output ?? "").slice(0, 2000), isError: item.exit_code !== 0 && item.exit_code !== undefined });
      else if (it === "file_change" && type === "item.completed") events.push({ type: "tool_use", name: "file_change", input: { changes: item.changes } });
      else if (it === "mcp_tool_call") events.push({ type: "tool_use", name: String(item.tool ?? "mcp"), input: item.arguments });
    }
    if (type === "turn.completed") {
      const usage = json.usage as Record<string, number> | undefined;
      if (usage) events.push({ type: "usage", usage: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, cacheReadTokens: usage.cached_input_tokens } });
      events.push({ type: "done", result: this.lastAssistantText || undefined, exitCode: 0 });
    }
    if (type === "turn.failed" || type === "error") events.push({ type: "error", message: String((json.error as { message?: string })?.message ?? json.message ?? "Codex error") });
    // Legacy schema: {"id":..,"msg":{"type":"agent_message","message":...}}
    const msg = json.msg as Record<string, unknown> | undefined;
    if (msg) {
      const mt = msg.type as string;
      if (mt === "agent_message" && typeof msg.message === "string") {
        this.lastAssistantText = msg.message;
        events.push({ type: "text", text: msg.message });
      } else if (mt === "agent_reasoning" && typeof msg.text === "string") events.push({ type: "thinking", text: msg.text });
      else if (mt === "exec_command_begin") events.push({ type: "tool_use", name: "shell", input: { command: Array.isArray(msg.command) ? (msg.command as string[]).join(" ") : msg.command } });
      else if (mt === "exec_command_end") events.push({ type: "tool_result", output: String(msg.stdout ?? msg.aggregated_output ?? "").slice(0, 2000), isError: (msg.exit_code as number) !== 0 });
      else if (mt === "patch_apply_begin") events.push({ type: "tool_use", name: "apply_patch", input: { files: Object.keys((msg.changes as Record<string, unknown>) ?? {}) } });
      else if (mt === "task_complete") events.push({ type: "done", result: (msg.last_agent_message as string) ?? this.lastAssistantText, exitCode: 0 });
      else if (mt === "error") events.push({ type: "error", message: String(msg.message ?? "Codex error") });
      else if (mt === "token_count") {
        const u = (msg.info as { total_token_usage?: Record<string, number> })?.total_token_usage ?? (msg as Record<string, number>);
        events.push({ type: "usage", usage: { inputTokens: u?.input_tokens, outputTokens: u?.output_tokens } });
      }
    }
    return events;
  }

  protected finalize(_session: AgentSession, code: number): AgentEvent[] {
    return code === 0 && this.lastAssistantText ? [{ type: "done", result: this.lastAssistantText, exitCode: 0 }] : [];
  }
}
