/**
 * Agent abstraction. WorldForge never re-implements models: it drives the official CLIs
 * (Claude Code, Codex, OpenCode, Gemini CLI) with the user's own accounts.
 */
export type AgentProviderId = "claude-code" | "codex" | "opencode" | "gemini-cli" | "antigravity" | "local-rules";

export type AgentStatus = "unknown" | "not-installed" | "installed" | "authenticated" | "busy" | "error" | "external";

export type AgentRole = "design" | "world" | "asset" | "gameplay" | "ui" | "audio" | "qa" | "integration" | "vision" | "chat";

export type PermissionMode = "safe" | "acceptEdits" | "bypass";

export interface AgentDetection {
  installed: boolean;
  path?: string;
  version?: string;
  /** Best-effort: config file present → probably authenticated. Never reads tokens. */
  probablyAuthenticated: boolean;
  authHint: string;
}

export interface AuthResult {
  ok: boolean;
  message: string;
  /** Command the user should run in a terminal when the flow cannot be automated. */
  command?: string;
}

export interface ModelOption {
  id: string;
  label: string;
  description?: string;
}

export interface AgentCapabilities {
  streaming: boolean;
  jsonOutput: boolean;
  vision: boolean;
  fileEdit: boolean;
  shell: boolean;
  mcp: boolean;
  headless: boolean;
  resumable: boolean;
  models: ModelOption[];
  efforts?: string[];
  /** Whether `model` accepts free-form ids beyond the suggestions. */
  customModel: boolean;
}

export interface SessionOptions {
  /** Working directory = the Roblox project. */
  cwd: string;
  model?: string;
  effort?: string;
  permissionMode?: PermissionMode;
  role?: AgentRole;
  /** Additional system prompt (role instructions). */
  systemPrompt?: string;
  /** Provider-specific extra CLI args. */
  extraArgs?: string[];
  /** Environment overrides. */
  env?: Record<string, string>;
  /** Tools allowed (Claude Code syntax). */
  allowedTools?: string[];
  /** Max budget in USD (when supported). */
  maxBudgetUsd?: number;
}

export interface AgentSession {
  id: string;
  provider: AgentProviderId;
  options: SessionOptions;
  /** Provider-native session id (Claude Code) for resume. */
  nativeSessionId?: string;
  createdAt: string;
  turns: number;
  /** Id of the currently running process, if any. */
  processId?: string;
}

export interface PromptOptions {
  /** Resume the native session when the provider supports it (default true). */
  resume?: boolean;
  /** JSON schema for structured output (when supported). */
  jsonSchema?: Record<string, unknown>;
  /** Image paths to include (vision-capable providers read them via tools). */
  images?: string[];
  signal?: AbortSignal;
}

export type AgentEvent =
  | { type: "session"; nativeSessionId: string; model?: string; raw?: unknown }
  | { type: "text"; text: string; partial?: boolean }
  | { type: "thinking"; text: string }
  | { type: "tool_use"; name: string; input: unknown; id?: string }
  | { type: "tool_result"; toolUseId?: string; output: string; isError?: boolean }
  | { type: "status"; text: string }
  | { type: "usage"; usage: AgentUsage }
  | { type: "error"; message: string }
  | { type: "done"; result?: string; exitCode: number; nativeSessionId?: string }
  | { type: "raw"; line: string; stream: "stdout" | "stderr" };

export interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  costUsd?: number;
  durationMs?: number;
  turns?: number;
}

export interface IAgentProvider {
  readonly id: AgentProviderId;
  readonly name: string;
  status: AgentStatus;
  detect(): Promise<AgentDetection>;
  authenticate(): Promise<AuthResult>;
  startSession(opts: SessionOptions): Promise<AgentSession>;
  sendPrompt(session: AgentSession, prompt: string, opts?: PromptOptions): AsyncIterable<AgentEvent>;
  streamOutput(session: AgentSession): AsyncIterable<AgentEvent>;
  stop(session: AgentSession): Promise<void>;
  getUsage(session: AgentSession): Promise<AgentUsage>;
  getCapabilities(): AgentCapabilities;
}

/** Minimal file access the orchestrator needs (Tauri fs or Node fs). */
export interface FileIO {
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdirp(path: string): Promise<void>;
  join(...parts: string[]): string;
}
