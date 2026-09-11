import { create } from "zustand";
import {
  StyleBibleSchema,
  WorldSpecSchema,
  deserializeBake,
  getStylePreset,
  nextVersion,
  slugify,
  type QAReport,
  type StyleBible,
  type WorldBake,
  type WorldBakeJSON,
  type WorldLocks,
  type WorldSpec,
} from "@worldforge/core";
import type { GenLayer } from "@worldforge/world-gen";
import { exportWorldFiles } from "@worldforge/roblox-export";
import { applyFixes } from "@worldforge/quality";
import { versionsRepo, type WorldVersionRow } from "@/lib/db";
import { readJsonFile } from "@/lib/files";
import { fs, path } from "@/lib/tauri";
import { generateInWorker } from "@/lib/worldGen";
import { useProjects } from "./projectStore";

export type ViewerCamera = "orbit" | "fly" | "top" | "first-person";
export type ViewerLayer = "terrain" | "water" | "buildings" | "vegetation" | "props" | "landmarks" | "paths" | "lighting";

interface WorldState {
  spec: WorldSpec | null;
  style: StyleBible | null;
  bake: WorldBake | null;
  report: QAReport | null;
  versions: WorldVersionRow[];
  generating: boolean;
  progress: { stage: string; p: number };
  error: string | null;
  dirty: boolean;
  // viewer
  camera: ViewerCamera;
  layers: Record<ViewerLayer, boolean>;
  wireframe: boolean;
  biomeColors: boolean;
  selectedPlacementId: string | null;
  // actions
  loadForProject: () => Promise<void>;
  setSpec: (spec: WorldSpec, opts?: { dirty?: boolean }) => void;
  patchSpec: (patch: Partial<WorldSpec>) => void;
  setStyle: (style: StyleBible) => void;
  setLocks: (locks: Partial<WorldLocks>) => void;
  generate: (opts?: { layers?: GenLayer[]; newSeed?: boolean; label?: string; specOverride?: WorldSpec }) => Promise<WorldBake | null>;
  applyReportFixes: () => Promise<void>;
  restoreVersion: (id: string) => Promise<void>;
  deleteVersion: (id: string) => Promise<void>;
  setCamera: (c: ViewerCamera) => void;
  toggleLayer: (l: ViewerLayer) => void;
  setWireframe: (v: boolean) => void;
  setBiomeColors: (v: boolean) => void;
  select: (id: string | null) => void;
  lockPlacement: (id: string, locked: boolean) => void;
  keepArea: (center: [number, number], radius: number) => number;
  reset: () => void;
}

const defaultLayers: Record<ViewerLayer, boolean> = { terrain: true, water: true, buildings: true, vegetation: true, props: true, landmarks: true, paths: true, lighting: true };

async function loadBakeFromProject(projectPath: string): Promise<WorldBake | null> {
  const json = await readJsonFile<WorldBakeJSON>(path.join(projectPath, "assets", "world", "WorldBake.json"));
  if (!json || !json.terrain) return null;
  try {
    return deserializeBake(json);
  } catch {
    return null;
  }
}

export const useWorld = create<WorldState>((set, get) => ({
  spec: null,
  style: null,
  bake: null,
  report: null,
  versions: [],
  generating: false,
  progress: { stage: "", p: 0 },
  error: null,
  dirty: false,
  camera: "orbit",
  layers: defaultLayers,
  wireframe: false,
  biomeColors: false,
  selectedPlacementId: null,

  async loadForProject() {
    const cur = useProjects.getState().current;
    if (!cur) return get().reset();
    const worldId = cur.meta.currentWorld ?? "main";
    const specRaw = await readJsonFile<unknown>(path.join(cur.path, "worlds", worldId, "world.spec.json"));
    const styleRaw = await readJsonFile<unknown>(path.join(cur.path, "worlds", worldId, "style.bible.json"));
    const specParsed = specRaw ? WorldSpecSchema.safeParse(specRaw) : null;
    const spec = specParsed?.success ? specParsed.data : null;
    const styleParsed = styleRaw ? StyleBibleSchema.safeParse(styleRaw) : null;
    const style = styleParsed?.success ? styleParsed.data : spec ? getStylePreset(spec.stylePreset) : getStylePreset(cur.meta.stylePreset);
    const bake = await loadBakeFromProject(cur.path);
    const report = await readJsonFile<QAReport>(path.join(cur.path, "qa", "report.json"));
    const versions = await versionsRepo.list(cur.row.id, worldId);
    set({ spec, style, bake, report, versions, error: null, dirty: false, selectedPlacementId: null });
  },

  setSpec(spec, opts = {}) {
    set({ spec, dirty: opts.dirty ?? true });
  },
  patchSpec(patch) {
    const spec = get().spec;
    if (!spec) return;
    set({ spec: WorldSpecSchema.parse({ ...spec, ...patch }), dirty: true });
  },
  setStyle(style) {
    set({ style, dirty: true });
  },
  setLocks(locks) {
    const spec = get().spec;
    if (!spec) return;
    set({ spec: { ...spec, locks: { ...spec.locks, ...locks } } });
  },

  async generate(opts = {}) {
    const cur = useProjects.getState().current;
    const spec = opts.specOverride ?? get().spec;
    if (!cur || !spec) return null;
    const style = get().style ?? getStylePreset(spec.stylePreset);
    const previous = get().bake ?? undefined;
    set({ generating: true, error: null, progress: { stage: "starting", p: 0 } });
    try {
      // keep locked placements when regenerating
      const version = nextVersion(cur.meta.worldVersion);
      const seedOverride = opts.newSeed ? (spec.seed + 1 + Math.floor(Math.random() * 1000)) % 4294967295 : undefined;
      const specToUse = seedOverride !== undefined && !opts.layers ? { ...spec, seed: seedOverride } : spec;
      const { bake, report } = await generateInWorker(
        specToUse,
        style,
        { previous: opts.layers ? previous : undefined, regenerate: opts.layers, seedOverride: opts.layers ? seedOverride : undefined, version },
        (stage, p) => set({ progress: { stage, p } }),
      );
      // persist to the project
      const slug = slugify(cur.meta.name);
      const files = exportWorldFiles({ bake, spec: specToUse, style, projectSlug: slug });
      await fs.writeFiles(cur.path, files.map((f) => [f.path, f.content]));
      await fs.writeText(path.join(cur.path, "qa", "report.json"), JSON.stringify(report, null, 2));
      // version
      const parent = get().versions[0]?.id ?? null;
      await versionsRepo.insert({ projectId: cur.row.id, worldId: specToUse.id, version, parentVersionId: parent, label: opts.label ?? (opts.layers ? `regenerate ${opts.layers.join("+")}` : "generate"), spec: specToUse, style, stats: bake.stats, score: report.score });
      await useProjects.getState().updateMeta({ worldVersion: version, currentWorld: specToUse.id, stylePreset: specToUse.stylePreset });
      await useProjects.getState().touch({ status: "generated" });
      const versions = await versionsRepo.list(cur.row.id, specToUse.id);
      set({ bake, report, spec: specToUse, style, versions, generating: false, dirty: false, progress: { stage: "done", p: 1 } });
      return bake;
    } catch (e) {
      set({ generating: false, error: (e as Error).message ?? String(e) });
      return null;
    }
  },

  async applyReportFixes() {
    const { spec, report } = get();
    if (!spec || !report || report.fixes.length === 0) return;
    const res = applyFixes(spec, report.fixes);
    set({ spec: res.spec });
    await get().generate({ layers: res.regenerate.length ? res.regenerate : undefined, newSeed: res.newSeed, label: "auto-fix" });
  },

  async restoreVersion(id) {
    const v = get().versions.find((x) => x.id === id);
    if (!v) return;
    const spec = WorldSpecSchema.parse(JSON.parse(v.spec));
    const style = v.style ? StyleBibleSchema.parse(JSON.parse(v.style)) : getStylePreset(spec.stylePreset);
    set({ spec, style });
    await get().generate({ label: `restore ${v.version}` });
  },

  async deleteVersion(id) {
    await versionsRepo.remove(id);
    set({ versions: get().versions.filter((v) => v.id !== id) });
  },

  setCamera: (camera) => set({ camera }),
  toggleLayer: (l) => set((s) => ({ layers: { ...s.layers, [l]: !s.layers[l] } })),
  setWireframe: (wireframe) => set({ wireframe }),
  setBiomeColors: (biomeColors) => set({ biomeColors }),
  select: (selectedPlacementId) => set({ selectedPlacementId }),

  lockPlacement(id, locked) {
    const bake = get().bake;
    if (!bake) return;
    const placements = bake.placements.map((p) => (p.id === id ? { ...p, locked } : p));
    set({ bake: { ...bake, placements } });
  },
  keepArea(center, radius) {
    const bake = get().bake;
    if (!bake) return 0;
    let n = 0;
    const placements = bake.placements.map((p) => {
      if (Math.hypot(p.position[0] - center[0], p.position[2] - center[1]) <= radius) {
        n++;
        return { ...p, locked: true };
      }
      return p;
    });
    set({ bake: { ...bake, placements, zones: [...bake.zones, { id: `keep_${bake.zones.length}`, kind: "keep", polygon: [], center, radius }] } });
    return n;
  },

  reset() {
    set({ spec: null, style: null, bake: null, report: null, versions: [], error: null, dirty: false, selectedPlacementId: null });
  },
}));
