import { GameSpecSchema, WorldSpecSchema, newId, nowIso, type GameSpec, type WorldSpec } from "@worldforge/core";
import { interpretPrompt } from "./local/interpreter";
import { buildRolePrompt, ROLES, validateRoleOutput, type RoleContext } from "./roles";
import type { AgentEvent, AgentProviderId, AgentRole, AgentSession, FileIO, IAgentProvider } from "./types";

export type TaskStatus = "pending" | "running" | "validating" | "done" | "failed" | "skipped" | "cancelled";

export interface TaskState {
  id: string;
  role: AgentRole;
  title: string;
  dependsOn: string[];
  status: TaskStatus;
  attempts: number;
  maxAttempts: number;
  error?: string;
  result?: string;
  startedAt?: string;
  endedAt?: string;
  sessionId?: string;
  providerId?: AgentProviderId;
  /** Extra context injected into the prompt (diagnostics, critique…). */
  context?: Partial<RoleContext>;
}

export interface Plan {
  id: string;
  kind: "new-game" | "world-only" | "modify" | "qa" | "custom";
  userPrompt: string;
  tasks: TaskState[];
  createdAt: string;
}

export type OrchestratorEvent =
  | { type: "plan"; plan: Plan; status: "started" | "done" | "failed" | "cancelled" }
  | { type: "task"; task: TaskState }
  | { type: "agent"; taskId: string; event: AgentEvent }
  | { type: "log"; level: "info" | "warn" | "error"; message: string };

export interface OrchestratorDeps {
  files: FileIO;
  projectDir: string;
  projectName: string;
  /** Provide (or create) a session for the task. The UI binds sessions to agent panes. */
  acquireSession: (task: TaskState) => Promise<{ provider: IAgentProvider; session: AgentSession }>;
  releaseSession?: (task: TaskState, session: AgentSession) => void;
  onEvent: (e: OrchestratorEvent) => void;
  history?: () => Promise<{ prompt: string; summary?: string }[]>;
  /** Optional check after the world task: throws with a message when the spec cannot be baked. */
  bakeCheck?: (spec: WorldSpec) => Promise<void>;
}

const mk = (role: AgentRole, title: string, dependsOn: string[] = [], maxAttempts = 2): TaskState => ({ id: role, role, title, dependsOn, status: "pending", attempts: 0, maxAttempts });

export function planNewGame(userPrompt: string, roles: AgentRole[] = ["design", "world", "asset", "gameplay", "ui", "audio", "integration"]): Plan {
  const want = new Set(roles);
  const tasks: TaskState[] = [];
  if (want.has("design")) tasks.push(mk("design", "Game design"));
  if (want.has("world")) tasks.push(mk("world", "World design", want.has("design") ? ["design"] : []));
  if (want.has("asset")) tasks.push(mk("asset", "Assets", ["design", "world"].filter((r) => want.has(r as AgentRole))));
  if (want.has("gameplay")) tasks.push(mk("gameplay", "Gameplay systems", want.has("design") ? ["design"] : []));
  if (want.has("ui")) tasks.push(mk("ui", "User interface", want.has("design") ? ["design"] : []));
  if (want.has("audio")) tasks.push(mk("audio", "Audio", want.has("design") ? ["design"] : []));
  if (want.has("integration")) tasks.push(mk("integration", "Integration", ["gameplay", "ui", "world"].filter((r) => want.has(r as AgentRole))));
  return { id: newId("plan"), kind: "new-game", userPrompt, tasks, createdAt: nowIso() };
}

export function planWorldOnly(userPrompt: string): Plan {
  return { id: newId("plan"), kind: "world-only", userPrompt, tasks: [mk("world", "World design")], createdAt: nowIso() };
}

export function planModify(userPrompt: string, roles: AgentRole[]): Plan {
  const tasks = roles.map((r) => mk(r, ROLES[r].title));
  return { id: newId("plan"), kind: "modify", userPrompt, tasks, createdAt: nowIso() };
}

export function planQA(userPrompt: string, diagnostics: string, critique?: string, screenshots?: string[]): Plan {
  const tasks: TaskState[] = [];
  if (screenshots && screenshots.length) tasks.push({ ...mk("vision", "Visual critique"), context: { screenshots, critique } });
  tasks.push({ ...mk("qa", "Fix & report", screenshots?.length ? ["vision"] : []), context: { diagnostics, critique } });
  return { id: newId("plan"), kind: "qa", userPrompt, tasks, createdAt: nowIso() };
}

/**
 * Executes a plan: dependency-ordered, concurrent, validated, with retries that feed the
 * validation errors back to the agent. Providers are real CLIs; the local provider is the fallback.
 */
export class Orchestrator {
  private cancelled = false;
  private abort = new AbortController();

  constructor(private deps: OrchestratorDeps) {}

  cancel(): void {
    this.cancelled = true;
    this.abort.abort();
  }

  async run(plan: Plan, options: { concurrency?: number } = {}): Promise<Plan> {
    const concurrency = Math.max(1, options.concurrency ?? 2);
    this.deps.onEvent({ type: "plan", plan, status: "started" });
    const running = new Map<string, Promise<void>>();
    const byId = new Map(plan.tasks.map((t) => [t.id, t]));
    const ready = () => plan.tasks.filter((t) => t.status === "pending" && t.dependsOn.every((d) => byId.get(d)?.status === "done" || byId.get(d)?.status === "skipped" || !byId.has(d)));
    const blocked = () => plan.tasks.filter((t) => t.status === "pending" && t.dependsOn.some((d) => byId.get(d)?.status === "failed" || byId.get(d)?.status === "cancelled"));
    for (;;) {
      if (this.cancelled) {
        for (const t of plan.tasks) if (t.status === "pending") (t.status = "cancelled"), this.deps.onEvent({ type: "task", task: t });
        break;
      }
      for (const t of blocked()) {
        t.status = "skipped";
        t.error = "dependency failed";
        this.deps.onEvent({ type: "task", task: t });
      }
      const candidates = ready();
      while (candidates.length && running.size < concurrency) {
        const t = candidates.shift()!;
        const p = this.runTask(plan, t).finally(() => running.delete(t.id));
        running.set(t.id, p);
      }
      if (running.size === 0) {
        if (ready().length === 0) break;
        continue;
      }
      await Promise.race(running.values());
    }
    const failed = plan.tasks.some((t) => t.status === "failed");
    this.deps.onEvent({ type: "plan", plan, status: this.cancelled ? "cancelled" : failed ? "failed" : "done" });
    return plan;
  }

  private async runTask(plan: Plan, task: TaskState): Promise<void> {
    task.status = "running";
    task.startedAt = nowIso();
    this.deps.onEvent({ type: "task", task });
    let feedback = "";
    while (task.attempts < task.maxAttempts && !this.cancelled) {
      task.attempts++;
      let acquired: { provider: IAgentProvider; session: AgentSession };
      try {
        acquired = await this.deps.acquireSession(task);
      } catch (e) {
        task.status = "failed";
        task.error = `no agent available: ${(e as Error).message}`;
        task.endedAt = nowIso();
        this.deps.onEvent({ type: "task", task });
        return;
      }
      const { provider, session } = acquired;
      task.sessionId = session.id;
      task.providerId = provider.id;
      session.options.role = task.role;
      session.options.systemPrompt = ROLES[task.role].systemPrompt;
      if (!session.options.allowedTools) session.options.allowedTools = ROLES[task.role].allowedTools;
      const ctx = await this.buildContext(plan, task);
      let prompt = buildRolePrompt(task.role, ctx);
      if (feedback) prompt += `\n\nYour previous output was rejected:\n${feedback}\nFix the file and try again.`;
      this.deps.onEvent({ type: "task", task });
      let result: string | undefined;
      let exitCode = 0;
      let errorMsg: string | undefined;
      try {
        for await (const ev of provider.sendPrompt(session, prompt, { signal: this.abort.signal, images: ctx.screenshots })) {
          this.deps.onEvent({ type: "agent", taskId: task.id, event: ev });
          if (ev.type === "done") {
            result = ev.result;
            exitCode = ev.exitCode;
          }
          if (ev.type === "error") errorMsg = ev.message;
        }
      } catch (e) {
        errorMsg = (e as Error).message;
        exitCode = -1;
      } finally {
        this.deps.releaseSession?.(task, session);
      }
      if (this.cancelled) {
        task.status = "cancelled";
        break;
      }
      if (exitCode !== 0 && !result) {
        feedback = errorMsg ?? `agent exited with code ${exitCode}`;
        this.deps.onEvent({ type: "log", level: "warn", message: `${task.role}: ${feedback}` });
        continue;
      }
      task.status = "validating";
      this.deps.onEvent({ type: "task", task });
      const validation = await this.validate(task);
      if (validation.ok) {
        task.status = "done";
        task.result = result;
        task.endedAt = nowIso();
        this.deps.onEvent({ type: "task", task });
        return;
      }
      feedback = validation.errors;
      this.deps.onEvent({ type: "log", level: "warn", message: `${task.role} output invalid: ${validation.errors.slice(0, 400)}` });
      task.status = "running";
    }
    if (task.status !== "cancelled") {
      task.status = "failed";
      task.error = feedback || "max attempts reached";
    }
    task.endedAt = nowIso();
    this.deps.onEvent({ type: "task", task });
  }

  private async readJson<T>(rel: string, schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }): Promise<T | undefined> {
    const path = this.deps.files.join(this.deps.projectDir, rel);
    if (!(await this.deps.files.exists(path))) return undefined;
    try {
      const r = schema.safeParse(JSON.parse(await this.deps.files.readText(path)));
      return r.success ? (r.data as T) : undefined;
    } catch {
      return undefined;
    }
  }

  private async buildContext(plan: Plan, task: TaskState): Promise<RoleContext> {
    const gameSpec = await this.readJson<GameSpec>("design/game.spec.json", GameSpecSchema);
    const worldSpec = await this.readJson<WorldSpec>("worlds/main/world.spec.json", WorldSpecSchema);
    const history = this.deps.history ? await this.deps.history() : [];
    const ctx: RoleContext = { userPrompt: plan.userPrompt, projectName: this.deps.projectName, gameSpec, worldSpec, history, ...(task.context ?? {}) };
    if (plan.kind === "new-game" || plan.kind === "world-only") {
      const draft = interpretPrompt(plan.userPrompt);
      if (task.role === "world" && !worldSpec) ctx.draftWorldSpec = draft.spec;
      if (task.role === "design" && !gameSpec) ctx.draftGameSpec = draft.game;
    }
    return ctx;
  }

  private async validate(task: TaskState): Promise<{ ok: true } | { ok: false; errors: string }> {
    const def = ROLES[task.role];
    if (def.outputFile) {
      const path = this.deps.files.join(this.deps.projectDir, def.outputFile);
      if (!(await this.deps.files.exists(path))) return { ok: false, errors: `${def.outputFile} was not written.` };
      const content = await this.deps.files.readText(path);
      const v = validateRoleOutput(task.role, content);
      if (!v.ok) return v;
      if (task.role === "world" && this.deps.bakeCheck) {
        try {
          await this.deps.bakeCheck(v.data as WorldSpec);
        } catch (e) {
          return { ok: false, errors: `The WorldSpec cannot be generated: ${(e as Error).message}` };
        }
      }
    }
    return { ok: true };
  }
}
