import { newId, nowIso } from "@worldforge/core";
import { streamProcess, type ProcessRunner, type SpawnSpec } from "../runner";
import type { AgentCapabilities, AgentDetection, AgentEvent, AgentProviderId, AgentSession, AgentStatus, AgentUsage, AuthResult, IAgentProvider, PromptOptions, SessionOptions } from "../types";

export interface CliProviderConfig {
  id: AgentProviderId;
  name: string;
  binary: string;
  versionArgs: string[];
  /** Files whose presence suggests the CLI is authenticated (relative to home). Never read. */
  authMarkers: string[];
  authCommand: string;
  capabilities: AgentCapabilities;
}

export interface SpawnPlan {
  args: string[];
  stdin?: string;
  env?: Record<string, string>;
}

/**
 * Shared machinery for CLI-based providers: detection, sessions, spawning with streaming,
 * and per-provider line parsing.
 */
export abstract class BaseCliProvider implements IAgentProvider {
  readonly id: AgentProviderId;
  readonly name: string;
  status: AgentStatus = "unknown";
  protected sessions = new Map<string, AgentSession>();
  protected usage = new Map<string, AgentUsage>();
  protected lastDetection?: AgentDetection;

  constructor(
    protected runner: ProcessRunner,
    protected config: CliProviderConfig,
    protected homeDir: string,
    protected fileExists: (path: string) => Promise<boolean>,
  ) {
    this.id = config.id;
    this.name = config.name;
  }

  async detect(): Promise<AgentDetection> {
    const path = await this.runner.resolve(this.config.binary);
    if (!path) {
      this.status = "not-installed";
      this.lastDetection = { installed: false, probablyAuthenticated: false, authHint: this.config.authCommand };
      return this.lastDetection;
    }
    let version: string | undefined;
    try {
      const res = await this.runner.runCapture(this.config.binary, this.config.versionArgs, undefined, 30);
      version = (res.stdout || res.stderr).split(/\r?\n/).find((l) => l.trim())?.trim().slice(0, 80);
    } catch {
      version = undefined;
    }
    let probablyAuthenticated = false;
    for (const marker of this.config.authMarkers) {
      const full = marker.startsWith("/") || /^[A-Za-z]:/.test(marker) ? marker : `${this.homeDir}/${marker}`;
      if (await this.fileExists(full)) {
        probablyAuthenticated = true;
        break;
      }
    }
    this.status = probablyAuthenticated ? "authenticated" : "installed";
    this.lastDetection = { installed: true, path, version, probablyAuthenticated, authHint: this.config.authCommand };
    return this.lastDetection;
  }

  async authenticate(): Promise<AuthResult> {
    return { ok: false, message: `Run the official login flow in a terminal: ${this.config.authCommand}`, command: this.config.authCommand };
  }

  async startSession(opts: SessionOptions): Promise<AgentSession> {
    const session: AgentSession = { id: newId("ses"), provider: this.id, options: opts, createdAt: nowIso(), turns: 0 };
    this.sessions.set(session.id, session);
    return session;
  }

  protected abstract plan(session: AgentSession, prompt: string, opts: PromptOptions): SpawnPlan;
  protected abstract parseLine(line: string, stream: "stdout" | "stderr", session: AgentSession): AgentEvent[];
  /** Called on exit to produce a final result text when the CLI does not emit one. */
  protected finalize(_session: AgentSession, _code: number): AgentEvent[] {
    return [];
  }

  async *sendPrompt(session: AgentSession, prompt: string, opts: PromptOptions = {}): AsyncIterable<AgentEvent> {
    const plan = this.plan(session, prompt, opts);
    const processId = `${this.id}_${session.id}_${session.turns}`;
    session.processId = processId;
    session.turns++;
    this.status = "busy";
    const spec: SpawnSpec = {
      id: processId,
      program: this.config.binary,
      args: plan.args,
      cwd: session.options.cwd,
      env: { ...(session.options.env ?? {}), ...(plan.env ?? {}) },
      stdin: plan.stdin,
      stripEnv: ["WORLDFORGE_SECRETS"],
    };
    let exitCode = 0;
    let resultText: string | undefined;
    try {
      for await (const item of streamProcess(this.runner, spec, opts.signal)) {
        if (item.kind === "exit") {
          exitCode = item.code;
          break;
        }
        yield { type: "raw", line: item.line, stream: item.stream };
        let events: AgentEvent[];
        try {
          events = this.parseLine(item.line, item.stream, session);
        } catch (e) {
          events = [{ type: "error", message: `parse error: ${(e as Error).message}` }];
        }
        for (const ev of events) {
          if (ev.type === "session") session.nativeSessionId = ev.nativeSessionId;
          if (ev.type === "usage") this.usage.set(session.id, { ...(this.usage.get(session.id) ?? {}), ...ev.usage });
          if (ev.type === "done") {
            resultText = ev.result;
            continue; // emitted once at the end
          }
          yield ev;
        }
      }
    } finally {
      session.processId = undefined;
      this.status = this.lastDetection?.probablyAuthenticated ? "authenticated" : "installed";
    }
    for (const ev of this.finalize(session, exitCode)) {
      if (ev.type === "done") resultText = resultText ?? ev.result;
      else yield ev;
    }
    yield { type: "done", result: resultText, exitCode, nativeSessionId: session.nativeSessionId };
  }

  async *streamOutput(_session: AgentSession): AsyncIterable<AgentEvent> {
    // Output is streamed by sendPrompt; nothing buffered separately.
  }

  async stop(session: AgentSession): Promise<void> {
    if (session.processId) await this.runner.kill(session.processId);
  }

  async getUsage(session: AgentSession): Promise<AgentUsage> {
    return this.usage.get(session.id) ?? {};
  }

  getCapabilities(): AgentCapabilities {
    return this.config.capabilities;
  }
}

/** Safe JSON parse for NDJSON streams. */
export function tryJson(line: string): unknown | undefined {
  const t = line.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

export function summarizeToolInput(input: unknown): string {
  if (input === null || input === undefined) return "";
  if (typeof input !== "object") return String(input).slice(0, 120);
  const obj = input as Record<string, unknown>;
  const keys = ["file_path", "path", "command", "pattern", "query", "url", "description", "prompt"];
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string") return `${k}: ${v.slice(0, 100)}`;
  }
  const s = JSON.stringify(obj);
  return s.length > 120 ? s.slice(0, 117) + "…" : s;
}
