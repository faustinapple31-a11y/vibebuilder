import type { ProcessRunner } from "../runner";
import type { AgentEvent, AgentSession, PromptOptions } from "../types";
import { BaseCliProvider, tryJson, type SpawnPlan } from "./base";

export const GEMINI_MODELS = [
  { id: "", label: "Default" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
];

/**
 * Gemini CLI provider — `gemini -p "<prompt>" --output-format stream-json`.
 * Also the headless path for Google models (Antigravity itself has no headless mode).
 */
export class GeminiCliProvider extends BaseCliProvider {
  private lastText = "";
  constructor(runner: ProcessRunner, homeDir: string, fileExists: (p: string) => Promise<boolean>) {
    super(
      runner,
      {
        id: "gemini-cli",
        name: "Gemini CLI",
        binary: "gemini",
        versionArgs: ["--version"],
        authMarkers: [".gemini/oauth_creds.json", ".gemini/settings.json", ".gemini"],
        authCommand: "gemini (then choose Login with Google)",
        capabilities: {
          streaming: true,
          jsonOutput: true,
          vision: true,
          fileEdit: true,
          shell: true,
          mcp: true,
          headless: true,
          resumable: false,
          models: GEMINI_MODELS,
          customModel: true,
        },
      },
      homeDir,
      fileExists,
    );
  }

  protected plan(session: AgentSession, prompt: string, opts: PromptOptions): SpawnPlan {
    const o = session.options;
    const args = ["--output-format", "stream-json"];
    if (o.model) args.push("-m", o.model);
    const mode = o.permissionMode ?? "acceptEdits";
    if (mode === "bypass") args.push("--yolo");
    else if (mode === "acceptEdits") args.push("--approval-mode", "auto_edit");
    if (o.extraArgs) args.push(...o.extraArgs);
    let text = o.systemPrompt ? `${o.systemPrompt}\n\n---\n\n${prompt}` : prompt;
    if (opts.images && opts.images.length) text += `\n\nImages to analyze:\n${opts.images.map((p) => `@${p}`).join("\n")}`;
    args.push("-p", text);
    this.lastText = "";
    return { args };
  }

  protected parseLine(line: string, stream: "stdout" | "stderr"): AgentEvent[] {
    const json = tryJson(line) as Record<string, unknown> | undefined;
    if (!json) {
      if (!line.trim()) return [];
      if (stream === "stdout") {
        this.lastText += line + "\n";
        return [{ type: "text", text: line }];
      }
      return [{ type: "status", text: line.trim() }];
    }
    const events: AgentEvent[] = [];
    const type = String(json.type ?? "");
    if (type === "init" && json.session_id) events.push({ type: "session", nativeSessionId: String(json.session_id) });
    if (type === "message" && json.role === "assistant" && typeof json.content === "string") {
      this.lastText += json.content;
      events.push({ type: "text", text: json.content, partial: json.delta === true });
    }
    if (type === "tool_use") events.push({ type: "tool_use", name: String(json.tool_name ?? json.name ?? "tool"), input: json.parameters ?? json.input });
    if (type === "tool_result") events.push({ type: "tool_result", output: String(json.output ?? "").slice(0, 2000), isError: json.status === "error" });
    if (type === "error") events.push({ type: "error", message: String(json.message ?? "Gemini error") });
    if (type === "result") {
      const stats = json.stats as Record<string, number> | undefined;
      if (stats) events.push({ type: "usage", usage: { inputTokens: stats.input_tokens, outputTokens: stats.output_tokens, durationMs: stats.duration_ms } });
      events.push({ type: "done", result: this.lastText || undefined, exitCode: 0 });
    }
    // single-json mode: {"response": "...", "stats": {...}}
    if (typeof json.response === "string") {
      this.lastText = json.response;
      events.push({ type: "text", text: json.response }, { type: "done", result: json.response, exitCode: 0 });
    }
    return events;
  }

  protected finalize(_session: AgentSession, code: number): AgentEvent[] {
    return code === 0 ? [{ type: "done", result: this.lastText || undefined, exitCode: 0 }] : [];
  }
}
