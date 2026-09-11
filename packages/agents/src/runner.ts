/**
 * Process spawning abstraction so providers work in the Tauri webview (Rust commands + events)
 * and in Node (child_process) without changes.
 */
export interface SpawnSpec {
  id: string;
  program: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  stdin?: string;
  keepStdin?: boolean;
  stripEnv?: string[];
}

export interface CaptureResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ProcessRunner {
  spawn(spec: SpawnSpec): Promise<number>;
  onOutput(id: string, cb: (stream: "stdout" | "stderr", line: string) => void): () => void;
  onExit(id: string, cb: (code: number) => void): () => void;
  kill(id: string): Promise<void>;
  writeStdin(id: string, data: string): Promise<void>;
  closeStdin(id: string): Promise<void>;
  resolve(program: string): Promise<string | null>;
  runCapture(program: string, args: string[], cwd?: string, timeoutSecs?: number): Promise<CaptureResult>;
}

/** Collect a process' lines into an async iterator (used by providers to stream events). */
export function streamProcess(runner: ProcessRunner, spec: SpawnSpec, signal?: AbortSignal): AsyncIterable<{ kind: "line"; stream: "stdout" | "stderr"; line: string } | { kind: "exit"; code: number }> {
  return {
    [Symbol.asyncIterator]() {
      const queue: ({ kind: "line"; stream: "stdout" | "stderr"; line: string } | { kind: "exit"; code: number })[] = [];
      let notify: (() => void) | null = null;
      let done = false;
      let started = false;
      let unsubOut = () => {};
      let unsubExit = () => {};
      const push = (item: (typeof queue)[number]) => {
        queue.push(item);
        notify?.();
      };
      const start = async () => {
        started = true;
        unsubOut = runner.onOutput(spec.id, (stream, line) => push({ kind: "line", stream, line }));
        unsubExit = runner.onExit(spec.id, (code) => {
          push({ kind: "exit", code });
          done = true;
          unsubOut();
          unsubExit();
        });
        try {
          await runner.spawn(spec);
        } catch (e) {
          push({ kind: "line", stream: "stderr", line: `spawn failed: ${(e as Error).message ?? e}` });
          push({ kind: "exit", code: -1 });
          done = true;
        }
        signal?.addEventListener("abort", () => {
          void runner.kill(spec.id);
        });
      };
      return {
        async next() {
          if (!started) await start();
          for (;;) {
            if (queue.length > 0) {
              const item = queue.shift()!;
              if (item.kind === "exit") return { value: item, done: false };
              return { value: item, done: false };
            }
            if (done) return { value: undefined as never, done: true };
            await new Promise<void>((r) => (notify = r));
            notify = null;
          }
        },
        async return() {
          if (!done) await runner.kill(spec.id);
          unsubOut();
          unsubExit();
          return { value: undefined as never, done: true };
        },
      };
    },
  };
}

