import type { ProcessRunner, SpawnSpec } from "@worldforge/agents";
import { proc } from "./tauri";

/**
 * ProcessRunner backed by the Rust `spawn_process` command + `process-output` / `process-exit` events.
 * One global listener dispatches to per-process subscribers.
 */
const outputSubs = new Map<string, Set<(s: "stdout" | "stderr", l: string) => void>>();
const exitSubs = new Map<string, Set<(code: number) => void>>();
let installed = false;

async function ensureListeners(): Promise<void> {
  if (installed) return;
  installed = true;
  await proc.onOutput((e) => {
    for (const cb of outputSubs.get(e.id) ?? []) cb(e.stream, e.line);
  });
  await proc.onExit((e) => {
    for (const cb of exitSubs.get(e.id) ?? []) cb(e.code);
  });
}

export function createTauriProcessRunner(): ProcessRunner {
  return {
    async spawn(spec: SpawnSpec) {
      await ensureListeners();
      return proc.spawn({ id: spec.id, program: spec.program, args: spec.args, cwd: spec.cwd, env: spec.env, stdin: spec.stdin, keep_stdin: spec.keepStdin, strip_env: spec.stripEnv });
    },
    onOutput(id, cb) {
      let set = outputSubs.get(id);
      if (!set) outputSubs.set(id, (set = new Set()));
      set.add(cb);
      void ensureListeners();
      return () => {
        set!.delete(cb);
        if (set!.size === 0) outputSubs.delete(id);
      };
    },
    onExit(id, cb) {
      let set = exitSubs.get(id);
      if (!set) exitSubs.set(id, (set = new Set()));
      set.add(cb);
      void ensureListeners();
      return () => {
        set!.delete(cb);
        if (set!.size === 0) exitSubs.delete(id);
      };
    },
    async kill(id) {
      await proc.kill(id);
    },
    async writeStdin(id, data) {
      await proc.writeStdin(id, data);
    },
    async closeStdin(id) {
      await proc.closeStdin(id);
    },
    async resolve(program) {
      return proc.resolve(program);
    },
    async runCapture(program, args, cwd, timeoutSecs) {
      return proc.run(program, args, cwd, timeoutSecs);
    },
  };
}
