import { createProviders, type AgentProviderId, type IAgentProvider } from "@worldforge/agents";
import { tauriFiles } from "./files";
import { createTauriProcessRunner } from "./runner";

let providers: Map<AgentProviderId, IAgentProvider> | null = null;
let homeDir = "";

export function initProviders(home: string): Map<AgentProviderId, IAgentProvider> {
  homeDir = home;
  providers = createProviders({ runner: createTauriProcessRunner(), files: tauriFiles, homeDir });
  return providers;
}

export function getProviders(): Map<AgentProviderId, IAgentProvider> {
  if (!providers) providers = createProviders({ runner: createTauriProcessRunner(), files: tauriFiles, homeDir });
  return providers;
}

export function getProvider(id: AgentProviderId): IAgentProvider {
  const p = getProviders().get(id);
  if (!p) throw new Error(`unknown provider ${id}`);
  return p;
}
