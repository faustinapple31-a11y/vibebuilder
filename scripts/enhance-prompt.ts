/**
 * Prints the hidden brief the agents would receive for a request.
 *   npx tsx scripts/enhance-prompt.ts "fait moi un village" [--model haiku|sonnet] [--local]
 * Without --local it calls Claude Code with your account; --local shows the offline fallback.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createProviders, enhancePrompt, type EnhancerModel, type FileIO } from "@worldforge/agents";
import { createNodeProcessRunner } from "@worldforge/agents/node";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const request = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--model");
if (!request) {
  console.error('usage: npx tsx scripts/enhance-prompt.ts "<request>" [--model haiku|sonnet] [--local]');
  process.exit(1);
}

const files: FileIO = {
  readText: async (p) => readFileSync(p, "utf8"),
  writeText: async (p, c) => {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, c, "utf8");
  },
  exists: async (p) => existsSync(p),
  mkdirp: async (p) => void mkdirSync(p, { recursive: true }),
  join: (...parts) => join(...parts),
};
const providers = createProviders({ runner: createNodeProcessRunner(), files, homeDir: homedir() });
const provider = args.includes("--local") ? undefined : providers.get("claude-code");

void enhancePrompt(request, { provider, cwd: tmpdir(), model: flag("--model") as EnhancerModel | undefined }).then((result) => {
  console.log(`source: ${result.source}${result.model ? ` (${result.model})` : ""}, ${result.durationMs} ms${result.reason ? `\nreason: ${result.reason}` : ""}\n`);
  console.log(result.brief ?? "(no brief: the request goes to the agents as it is)");
});
