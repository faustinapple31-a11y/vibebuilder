import { create } from "zustand";
import { ProjectMetaSchema, newId, nowIso, slugify, type ProjectMeta, type StylePresetId } from "@worldforge/core";
import { scaffoldProjectFiles } from "@worldforge/roblox-export";
import { projectsRepo, settingsRepo, type ProjectRow } from "@/lib/db";
import { readJsonFile, writeJsonFile } from "@/lib/files";
import { fs, path } from "@/lib/tauri";
import { useSettings } from "./settingsStore";

export interface CurrentProject {
  row: ProjectRow;
  meta: ProjectMeta;
  path: string;
}

interface ProjectState {
  projects: ProjectRow[];
  current: CurrentProject | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (input: { name: string; stylePreset: StylePresetId; folder?: string }) => Promise<CurrentProject>;
  open: (id: string) => Promise<CurrentProject | null>;
  importFolder: (folder: string) => Promise<CurrentProject | null>;
  close: () => void;
  remove: (id: string, deleteFiles: boolean) => Promise<void>;
  updateMeta: (patch: Partial<ProjectMeta>) => Promise<void>;
  touch: (patch?: Parameters<typeof projectsRepo.touch>[1]) => Promise<void>;
  reopenLast: () => Promise<void>;
}

export const useProjects = create<ProjectState>((set, get) => ({
  projects: [],
  current: null,
  loading: false,
  error: null,

  async refresh() {
    set({ loading: true });
    try {
      const projects = await projectsRepo.list();
      set({ projects, error: null });
    } catch (e) {
      set({ error: (e as Error).message ?? String(e) });
    } finally {
      set({ loading: false });
    }
  },

  async create({ name, stylePreset, folder }) {
    const paths = useSettings.getState().paths;
    if (!paths) throw new Error("app paths not ready");
    const slug = slugify(name);
    let dir = folder ?? path.join(paths.projects_dir, slug);
    let n = 2;
    while (await fs.exists(dir)) dir = path.join(paths.projects_dir, `${slug}-${n++}`);
    const id = newId("prj");
    const files = scaffoldProjectFiles({ projectName: name, projectId: id, stylePreset });
    await fs.mkdirp(dir);
    await fs.writeFiles(dir, files.map((f) => [f.path, f.content]));
    await projectsRepo.insert({ id, name, path: dir, stylePreset });
    await get().refresh();
    const cur = await get().open(id);
    if (!cur) throw new Error("project could not be opened after creation");
    return cur;
  },

  async open(id) {
    const row = await projectsRepo.get(id);
    if (!row) return null;
    const metaRaw = await readJsonFile<unknown>(path.join(row.path, "worldforge.json"));
    const parsed = ProjectMetaSchema.safeParse(metaRaw ?? {});
    const meta: ProjectMeta = parsed.success
      ? parsed.data
      : ProjectMetaSchema.parse({ id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at, stylePreset: row.style_preset });
    const current = { row, meta, path: row.path };
    set({ current });
    await projectsRepo.touch(id);
    await settingsRepo.set("lastProjectId", id);
    return current;
  },

  async importFolder(folder) {
    const existing = await projectsRepo.byPath(folder);
    if (existing) return get().open(existing.id);
    const metaRaw = await readJsonFile<unknown>(path.join(folder, "worldforge.json"));
    const parsed = ProjectMetaSchema.safeParse(metaRaw ?? {});
    const name = parsed.success ? parsed.data.name : path.basename(folder);
    const id = parsed.success ? parsed.data.id : newId("prj");
    if (!parsed.success) {
      const meta = ProjectMetaSchema.parse({ id, name, createdAt: nowIso(), updatedAt: nowIso() });
      await writeJsonFile(path.join(folder, "worldforge.json"), meta);
    }
    await projectsRepo.insert({ id, name, path: folder, stylePreset: parsed.success ? parsed.data.stylePreset : "stylized_mystical" });
    await get().refresh();
    return get().open(id);
  },

  close() {
    set({ current: null });
    void settingsRepo.set("lastProjectId", null);
  },
  async reopenLast() {
    const id = await settingsRepo.get<string | null>("lastProjectId", null);
    if (id) await get().open(id);
  },

  async remove(id, deleteFiles) {
    const row = await projectsRepo.get(id);
    await projectsRepo.remove(id);
    if (deleteFiles && row) await fs.remove(row.path).catch(() => {});
    if (get().current?.row.id === id) set({ current: null });
    await get().refresh();
  },

  async updateMeta(patch) {
    const cur = get().current;
    if (!cur) return;
    const meta: ProjectMeta = { ...cur.meta, ...patch, updatedAt: nowIso() };
    await writeJsonFile(path.join(cur.path, "worldforge.json"), meta);
    set({ current: { ...cur, meta } });
    await projectsRepo.touch(cur.row.id, { name: meta.name, style_preset: meta.stylePreset, roblox_universe_id: meta.roblox.universeId ?? null, roblox_place_id: meta.roblox.placeId ?? null });
  },

  async touch(patch = {}) {
    const cur = get().current;
    if (!cur) return;
    await projectsRepo.touch(cur.row.id, patch);
    const row = await projectsRepo.get(cur.row.id);
    if (row) set({ current: { ...cur, row } });
    await get().refresh();
  },
}));
