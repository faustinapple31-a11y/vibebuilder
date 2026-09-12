import type { ProcessRunner } from "../runner";
import type { AgentEvent, AgentSession, PermissionMode, PromptOptions } from "../types";
import { BaseCliProvider, summarizeToolInput, tryJson, type SpawnPlan } from "./base";

export const CLAUDE_MODELS = [
  { id: "opus", label: "Opus 5", description: "claude-opus-5 — default, included in Claude plans" },
  { id: "fable", label: "Fable 5.1 (usage credits)", description: "claude-fable-5-1 — most capable; needs usage credits at claude.ai/settings/usage" },
  { id: "sonnet", label: "Sonnet 5", description: "claude-sonnet-5 — fast & capable" },
  { id: "haiku", label: "Haiku 4.5", description: "claude-haiku-4-5 — fastest" },
];
export const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"];

const PERMISSION_FLAG: Record<PermissionMode, string> = { safe: "manual", acceptEdits: "acceptEdits", bypass: "bypassPermissions" };

/**
 * Claude Code provider — `claude -p --output-format stream-json`.
 * Streams NDJSON events (system/assistant/user/result) and supports session resume.
 */
export class ClaudeCodeProvider extends BaseCliProvider {
  constructor(runner: ProcessRunner, homeDir: string, fileExists: (p: string) => Promise<boolean>) {
    super(
      runner,
      {
        id: "claude-code",
        name: "Claude Code",
        binary: "claude",
        versionArgs: ["--version"],
        authMarkers: [".claude.json", ".claude/.credentials.json", ".claude"],
        authCommand: "claude login",
        capabilities: {
          streaming: true,
          jsonOutput: true,
          vision: true,
          fileEdit: true,
          shell: true,
          mcp: true,
          headless: true,
          resumable: true,
          models: CLAUDE_MODELS,
          efforts: CLAUDE_EFFORTS,
          customModel: true,
        },
      },
      homeDir,
      fileExists,
    );
  }

  protected plan(session: AgentSession, prompt: string, opts: PromptOptions): SpawnPlan {
    const o = session.options;
    const args = ["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages"];
    if (o.model) args.push("--model", o.model);
    if (o.effort) args.push("--effort", o.effort);
    args.push("--permission-mode", PERMISSION_FLAG[o.permissionMode ?? "acceptEdits"]);
    if ((o.permissionMode ?? "acceptEdits") === "bypass") args.push("--dangerously-skip-permissions");
    if (o.allowedTools && o.allowedTools.length) args.push("--allowedTools", ...o.allowedTools);
    if (o.systemPrompt) args.push("--append-system-prompt", o.systemPrompt);
    if (o.maxBudgetUsd) args.push("--max-budget-usd", String(o.maxBudgetUsd));
    if (opts.jsonSchema) args.push("--json-schema", JSON.stringify(opts.jsonSchema));
    if (opts.resume !== false && session.nativeSessionId) args.push("--resume", session.nativeSessionId);
    if (o.extraArgs) args.push(...o.extraArgs);
    let text = prompt;
    if (opts.images && opts.images.length) text += `\n\nImages to analyze (use the Read tool on each path):\n${opts.images.map((p) => `- ${p}`).join("\n")}`;
    return { args, stdin: text };
  }

  protected parseLine(line: string, stream: "stdout" | "stderr"): AgentEvent[] {
    const json = tryJson(line) as Record<string, unknown> | undefined;
    if (!json) {
      if (stream === "stderr" && line.trim()) return [{ type: "status", text: line.trim() }];
      return [];
    }
    const type = json.type as string;
    const events: AgentEvent[] = [];
    if (type === "system" && json.subtype === "init") {
      events.push({ type: "session", nativeSessionId: String(json.session_id ?? ""), model: json.model as string | undefined, raw: json });
      return events;
    }
    if (type === "stream_event") {
      const ev = json.event as Record<string, unknown> | undefined;
      const delta = ev?.delta as Record<string, unknown> | undefined;
      if (ev?.type === "content_block_delta" && delta?.type === "text_delta" && typeof delta.text === "string") {
        events.push({ type: "text", text: delta.text, partial: true });
      } else if (ev?.type === "content_block_delta" && delta?.type === "thinking_delta" && typeof delta.thinking === "string") {
        events.push({ type: "thinking", text: delta.thinking });
      }
      return events;
    }
    if (type === "assistant") {
      const msg = json.message as { content?: unknown[] } | undefined;
      for (const block of msg?.content ?? []) {
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") events.push({ type: "text", text: b.text });
        else if (b.type === "tool_use") events.push({ type: "tool_use", name: String(b.name), input: b.input, id: b.id as string | undefined });
        else if (b.type === "thinking" && typeof b.thinking === "string") events.push({ type: "thinking", text: b.thinking });
      }
      return events;
    }
    if (type === "user") {
      const msg = json.message as { content?: unknown[] } | undefined;
      for (const block of msg?.content ?? []) {
        const b = block as Record<string, unknown>;
        if (b.type === "tool_result") {
          const content = b.content;
          const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => (typeof (c as { text?: string }).text === "string" ? (c as { text: string }).text : "")).join("\n") : "";
          events.push({ type: "tool_result", toolUseId: b.tool_use_id as string | undefined, output: text.slice(0, 2000), isError: b.is_error === true });
        }
      }
      return events;
    }
    if (type === "result") {
      const usage = json.usage as Record<string, number> | undefined;
      events.push({
        type: "usage",
        usage: {
          inputTokens: usage?.input_tokens,
          outputTokens: usage?.output_tokens,
          cacheReadTokens: usage?.cache_read_input_tokens,
          costUsd: json.total_cost_usd as number | undefined,
          durationMs: json.duration_ms as number | undefined,
          turns: json.num_turns as number | undefined,
        },
      });
      if (json.session_id) events.push({ type: "session", nativeSessionId: String(json.session_id) });
      if (json.is_error) events.push({ type: "error", message: String(json.result ?? json.error ?? "Claude Code returned an error") });
      events.push({ type: "done", result: typeof json.result === "string" ? json.result : json.structured_output ? JSON.stringify(json.structured_output) : undefined, exitCode: 0 });
      return events;
    }
    return events;
  }
}

export { summarizeToolInput };
