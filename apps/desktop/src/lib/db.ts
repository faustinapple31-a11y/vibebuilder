import Database from "@tauri-apps/plugin-sql";
import { newId, nowIso } from "@worldforge/core";

/** Local SQLite registry (projects, world versions, prompt history, agent/build runs). */
let dbPromise: Promise<Database> | null = null;

export function db(): Promise<Database> {
  if (!dbPromise) dbPromise = Database.load("sqlite:worldforge.db");
  return dbPromise;
}

export interface ProjectRow {
  id: string;
  name: string;
  path: string;
  thumbnail: string | null;
  style_preset: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_build_at: string | null;
  last_build_status: string | null;
  last_publish_at: string | null;
  roblox_universe_id: number | null;
  roblox_place_id: number | null;
  settings: string;
}

export interface WorldVersionRow {
  id: string;
  project_id: string;
  world_id: string;
  version: string;
  parent_version_id: string | null;
  label: string | null;
  spec: string;
  style: string | null;
  stats: string | null;
  score: number | null;
  created_at: string;
}

export interface PromptRow {
  id: string;
  project_id: string;
  role: string;
  provider: string;
  prompt: string;
  response_summary: string | null;
  created_at: string;
}

export interface AgentRunRow {
  id: string;
  project_id: string | null;
  provider: string;
  role: string;
  model: string | null;
  status: string;
  prompt: string | null;
  started_at: string;
  ended_at: string | null;
  usage: string | null;
  log_path: string | null;
  summary: string | null;
}

export interface BuildRunRow {
  id: string;
  project_id: string;
  kind: string;
  status: string;
  report: string | null;
  started_at: string;
  ended_at: string | null;
}

export const projectsRepo = {
  async list(): Promise<ProjectRow[]> {
    return (await db()).select<ProjectRow[]>("SELECT * FROM projects ORDER BY updated_at DESC");
  },
  async get(id: string): Promise<ProjectRow | null> {
    const rows = await (await db()).select<ProjectRow[]>("SELECT * FROM projects WHERE id = $1", [id]);
    return rows[0] ?? null;
  },
  async byPath(path: string): Promise<ProjectRow | null> {
    const rows = await (await db()).select<ProjectRow[]>("SELECT * FROM projects WHERE path = $1", [path]);
    return rows[0] ?? null;
  },
  async insert(p: { id: string; name: string; path: string; stylePreset: string }): Promise<void> {
    const now = nowIso();
    await (await db()).execute("INSERT INTO projects (id, name, path, style_preset, status, created_at, updated_at, settings) VALUES ($1, $2, $3, $4, 'draft', $5, $5, '{}')", [p.id, p.name, p.path, p.stylePreset, now]);
  },
  async touch(id: string, patch: Partial<Pick<ProjectRow, "status" | "thumbnail" | "last_build_at" | "last_build_status" | "last_publish_at" | "roblox_universe_id" | "roblox_place_id" | "name" | "style_preset">> = {}): Promise<void> {
    const sets: string[] = ["updated_at = $1"];
    const args: unknown[] = [nowIso()];
    let i = 2;
    for (const [k, v] of Object.entries(patch)) {
      sets.push(`${k} = $${i++}`);
      args.push(v);
    }
    args.push(id);
    await (await db()).execute(`UPDATE projects SET ${sets.join(", ")} WHERE id = $${i}`, args);
  },
  async remove(id: string): Promise<void> {
    await (await db()).execute("DELETE FROM projects WHERE id = $1", [id]);
  },
};

export const versionsRepo = {
  async list(projectId: string, worldId = "main"): Promise<WorldVersionRow[]> {
    return (await db()).select<WorldVersionRow[]>("SELECT * FROM world_versions WHERE project_id = $1 AND world_id = $2 ORDER BY created_at DESC", [projectId, worldId]);
  },
  async insert(v: { projectId: string; worldId: string; version: string; parentVersionId: string | null; label: string | null; spec: unknown; style: unknown; stats: unknown; score: number | null }): Promise<WorldVersionRow> {
    const row: WorldVersionRow = {
      id: newId("wv"),
      project_id: v.projectId,
      world_id: v.worldId,
      version: v.version,
      parent_version_id: v.parentVersionId,
      label: v.label,
      spec: JSON.stringify(v.spec),
      style: JSON.stringify(v.style),
      stats: JSON.stringify(v.stats),
      score: v.score,
      created_at: nowIso(),
    };
    await (await db()).execute("INSERT INTO world_versions (id, project_id, world_id, version, parent_version_id, label, spec, style, stats, score, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [row.id, row.project_id, row.world_id, row.version, row.parent_version_id, row.label, row.spec, row.style, row.stats, row.score, row.created_at]);
    return row;
  },
  async remove(id: string): Promise<void> {
    await (await db()).execute("DELETE FROM world_versions WHERE id = $1", [id]);
  },
};

export const historyRepo = {
  async list(projectId: string, limit = 50): Promise<PromptRow[]> {
    return (await db()).select<PromptRow[]>("SELECT * FROM prompt_history WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2", [projectId, limit]);
  },
  async add(projectId: string, role: string, provider: string, prompt: string): Promise<string> {
    const id = newId("ph");
    await (await db()).execute("INSERT INTO prompt_history (id, project_id, role, provider, prompt, created_at) VALUES ($1,$2,$3,$4,$5,$6)", [id, projectId, role, provider, prompt, nowIso()]);
    return id;
  },
  async setSummary(id: string, summary: string): Promise<void> {
    await (await db()).execute("UPDATE prompt_history SET response_summary = $1 WHERE id = $2", [summary.slice(0, 2000), id]);
  },
};

export const runsRepo = {
  async startAgent(r: { projectId: string | null; provider: string; role: string; model: string | null; prompt: string }): Promise<string> {
    const id = newId("run");
    await (await db()).execute("INSERT INTO agent_runs (id, project_id, provider, role, model, status, prompt, started_at) VALUES ($1,$2,$3,$4,$5,'running',$6,$7)", [id, r.projectId, r.provider, r.role, r.model, r.prompt.slice(0, 4000), nowIso()]);
    return id;
  },
  async endAgent(id: string, status: string, usage: unknown, summary: string | null): Promise<void> {
    await (await db()).execute("UPDATE agent_runs SET status = $1, ended_at = $2, usage = $3, summary = $4 WHERE id = $5", [status, nowIso(), JSON.stringify(usage ?? {}), summary?.slice(0, 2000) ?? null, id]);
  },
  async startBuild(projectId: string, kind: string): Promise<string> {
    const id = newId("bld");
    await (await db()).execute("INSERT INTO build_runs (id, project_id, kind, status, started_at) VALUES ($1,$2,$3,'running',$4)", [id, projectId, kind, nowIso()]);
    return id;
  },
  async endBuild(id: string, status: string, report: unknown): Promise<void> {
    await (await db()).execute("UPDATE build_runs SET status = $1, ended_at = $2, report = $3 WHERE id = $4", [status, nowIso(), JSON.stringify(report ?? {}), id]);
  },
  async listBuilds(projectId: string, limit = 20): Promise<BuildRunRow[]> {
    return (await db()).select<BuildRunRow[]>("SELECT * FROM build_runs WHERE project_id = $1 ORDER BY started_at DESC LIMIT $2", [projectId, limit]);
  },
  async listAgentRuns(projectId: string, limit = 50): Promise<AgentRunRow[]> {
    return (await db()).select<AgentRunRow[]>("SELECT * FROM agent_runs WHERE project_id = $1 ORDER BY started_at DESC LIMIT $2", [projectId, limit]);
  },
};

export const settingsRepo = {
  async get<T>(key: string, fallback: T): Promise<T> {
    const rows = await (await db()).select<{ value: string }[]>("SELECT value FROM settings WHERE key = $1", [key]);
    if (!rows[0]) return fallback;
    try {
      return JSON.parse(rows[0].value) as T;
    } catch {
      return fallback;
    }
  },
  async set(key: string, value: unknown): Promise<void> {
    await (await db()).execute("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, JSON.stringify(value)]);
  },
};
