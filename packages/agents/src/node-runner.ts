import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, isAbsolute, join } from "node:path";
import type { ProcessRunner } from "./runner";

/** Node implementation (scripts, tests, CLI). */
export function createNodeProcessRunner(): ProcessRunner {
  const children = new Map<string, ChildProcess>();
  const outputListeners = new Map<string, Set<(s: "stdout" | "stderr", l: string) => void>>();
  const exitListeners = new Map<string, Set<(code: number) => void>>();
  const resolveProgram = (program: string): string | null => {
    if (isAbsolute(program) && existsSync(program)) return program;
    const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
    const dirs = (process.env.PATH ?? "").split(delimiter);
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    dirs.push(join(process.env.LOCALAPPDATA ?? "", "WorldForge", "tools", "rojo"), join(process.env.APPDATA ?? "", "npm"), join(home, ".rokit", "bin"), join(home, ".cargo", "bin"), join(home, ".local", "bin"));
    for (const d of dirs)
      for (const e of exts) {
        const c = join(d, program + e);
        if (existsSync(c)) return c;
      }
    return null;
  };
  return {
    async spawn(spec) {
      const program = resolveProgram(spec.program);
      if (!program) throw new Error(`program not found: ${spec.program}`);
      const env = { ...process.env, ...(spec.env ?? {}) };
      for (const k of spec.stripEnv ?? []) delete env[k];
      const isCmd = /\.(cmd|bat)$/i.test(program);
      const child = spawn(program, spec.args, { cwd: spec.cwd, env, stdio: ["pipe", "pipe", "pipe"], shell: isCmd, windowsHide: true });
      children.set(spec.id, child);
      const emitLines = (stream: "stdout" | "stderr", chunkSrc: NodeJS.ReadableStream | null) => {
        if (!chunkSrc) return;
        let buf = "";
        chunkSrc.on("data", (d: Buffer) => {
          buf += d.toString("utf8");
          let idx: number;
          while ((idx = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, idx).replace(/\r$/, "");
            buf = buf.slice(idx + 1);
            for (const cb of outputListeners.get(spec.id) ?? []) cb(stream, line);
          }
        });
        chunkSrc.on("end", () => {
          if (buf.length) for (const cb of outputListeners.get(spec.id) ?? []) cb(stream, buf);
        });
      };
      emitLines("stdout", child.stdout);
      emitLines("stderr", child.stderr);
      child.on("close", (code) => {
        setTimeout(() => {
          for (const cb of exitListeners.get(spec.id) ?? []) cb(code ?? -1);
          children.delete(spec.id);
        }, 50);
      });
      if (spec.stdin !== undefined) child.stdin?.write(spec.stdin);
      if (!spec.keepStdin) child.stdin?.end();
      return child.pid ?? 0;
    },
    onOutput(id, cb) {
      let set = outputListeners.get(id);
      if (!set) outputListeners.set(id, (set = new Set()));
      set.add(cb);
      return () => set!.delete(cb);
    },
    onExit(id, cb) {
      let set = exitListeners.get(id);
      if (!set) exitListeners.set(id, (set = new Set()));
      set.add(cb);
      return () => set!.delete(cb);
    },
    async kill(id) {
      const c = children.get(id);
      if (!c) return;
      if (process.platform === "win32" && c.pid) spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { windowsHide: true });
      else c.kill("SIGTERM");
    },
    async writeStdin(id, data) {
      children.get(id)?.stdin?.write(data);
    },
    async closeStdin(id) {
      children.get(id)?.stdin?.end();
    },
    async resolve(program) {
      return resolveProgram(program);
    },
    async runCapture(program, args, cwd, timeoutSecs = 120) {
      const resolved = resolveProgram(program);
      if (!resolved) return { code: -1, stdout: "", stderr: `program not found: ${program}` };
      const isCmd = /\.(cmd|bat)$/i.test(resolved);
      const res = spawnSync(resolved, args, { cwd, encoding: "utf8", timeout: timeoutSecs * 1000, shell: isCmd, windowsHide: true });
      return { code: res.status ?? -1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
    },
  };
}
