import type { ProcessRunner } from "./runner";
import { AntigravityProvider } from "./providers/antigravity";
import { ClaudeCodeProvider } from "./providers/claude-code";
import { CodexProvider } from "./providers/codex";
import { GeminiCliProvider } from "./providers/gemini";
import { LocalRulesProvider } from "./providers/local-rules";
import { OpenCodeProvider } from "./providers/opencode";
import type { AgentProviderId, FileIO, IAgentProvider } from "./types";

export interface ProviderRegistryDeps {
  runner: ProcessRunner;
  files: FileIO;
  homeDir: string;
}

export const PROVIDER_ORDER: AgentProviderId[] = ["claude-code", "codex", "opencode", "gemini-cli", "antigravity", "local-rules"];

export const PROVIDER_META: Record<AgentProviderId, { name: string; short: string; color: string; installHint: string }> = {
  "claude-code": { name: "Claude Code", short: "Claude", color: "#d97706", installHint: "npm install -g @anthropic-ai/claude-code" },
  codex: { name: "Codex", short: "Codex", color: "#16a34a", installHint: "npm install -g @openai/codex" },
  opencode: { name: "OpenCode", short: "OpenCode", color: "#525252", installHint: "npm install -g opencode-ai" },
  "gemini-cli": { name: "Gemini CLI", short: "Gemini", color: "#2563eb", installHint: "npm install -g @google/gemini-cli" },
  antigravity: { name: "Antigravity", short: "Antigravity", color: "#2563eb", installHint: "Install the Antigravity IDE" },
  "local-rules": { name: "Local rules", short: "Local", color: "#7c3aed", installHint: "" },
};

/** Create one instance of every provider. */
export function createProviders(deps: ProviderRegistryDeps): Map<AgentProviderId, IAgentProvider> {
  const exists = (p: string) => deps.files.exists(p);
  const map = new Map<AgentProviderId, IAgentProvider>();
  map.set("claude-code", new ClaudeCodeProvider(deps.runner, deps.homeDir, exists));
  map.set("codex", new CodexProvider(deps.runner, deps.homeDir, exists));
  map.set("opencode", new OpenCodeProvider(deps.runner, deps.homeDir, exists));
  map.set("gemini-cli", new GeminiCliProvider(deps.runner, deps.homeDir, exists));
  map.set("antigravity", new AntigravityProvider(deps.runner, deps.files));
  map.set("local-rules", new LocalRulesProvider(deps.files));
  return map;
}
