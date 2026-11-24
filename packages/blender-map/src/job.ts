import type { BlenderPlan, PlanFiles } from "./plan";

/**
 * Drives Blender through a whole world: kit in parallel processes, then one process per region, then the manifest. Every
 * step leaves its result on disk and its status in `state.json`, so a crash, a closed window or a failed region starts
 * again where it stopped, and one region can be built again alone.
 */
export interface JobFiles {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  mkdirp(path: string): Promise<void>;
  join(...parts: string[]): string;
}

export interface JobRunner {
  spawn(spec: { id: string; program: string; args: string[]; cwd?: string }): Promise<number>;
  onOutput(id: string, cb: (stream: "stdout" | "stderr", line: string) => void): () => void;
  onExit(id: string, cb: (code: number) => void): () => void;
  kill(id: string): Promise<void>;
}

export type StepStatus = "waiting" | "running" | "done" | "failed";

export interface StepState {
  id: string;
  kind: "textures" | "kit" | "region" | "manifest";
  label: string;
  status: StepStatus;
  /** 0..1 inside the step. */
  progress: number;
  /** terrain, roads, placements, checks, export... */
  phase?: string;
  error?: string;
  seconds?: number;
  attempts: number;
  /** What the step was built from: a change starts it again. */
  hash: string;
  stats?: Record<string, number>;
}

export interface JobState {
  version: 1;
  plan: string;
  steps: StepState[];
  startedAt: string;
  finishedAt?: string;
  status: "running" | "done" | "failed" | "stopped";
  /** Why the world is not finished although every step ran. */
  blocking: string[];
}

export interface JobOptions {
  blender: string;
  /** Folder that holds the python builders. */
  python: string;
  out: string;
  /** Pieces shared between worlds. */
  cache: string;
  parallelKit?: number;
  parallelRegions?: number;
  retries?: number;
  /** Render a picture of each region. */
  previews?: boolean;
  onState?: (state: JobState, line?: string) => void;
  signal?: AbortSignal;
  /** Build only these regions again. */
  only?: string[];
}

export interface QaProblem {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  region?: string;
  piece?: string;
  position?: number[];
}

export interface BlenderManifest {
  version: 2;
  id: string;
  name: string;
  size: [number, number];
  regionSize: number;
  kit: Record<string, { key: string; lods: ({ file: string; tris: number; bytes: number; meshes: { name: string; material: string; tris: number }[] } | null)[]; collision: string; fallback: boolean; size: number[]; problems: QaProblem[] }>;
  regions: Record<string, { rect: number[]; files: { kind: string; file: string; tris: number; bytes: number; meshes: { name: string; material: string; tris: number }[] }[]; layout: string; depends: string[]; hash: string; instances: number; tris: number; qa: { status: "ok" | "warnings" | "failed"; problems: QaProblem[] } }>;
  materials: Record<string, { maps?: Record<string, string>; tile?: number; doubleSided: boolean }>;
  totals: { tris: number; instances: number; pieces: number; fallback: number; bytes: number; regions: number };
  qa: { status: "ok" | "warnings" | "failed"; problems: QaProblem[] };
}

/** Small stable hash (FNV-1a, 64 bits in two halves). */
export function hashText(s: string): string {
  let a = 2166136261;
  let b = 0x9747b28c;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 13);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

export async function writePlan(files: JobFiles, out: string, world: PlanFiles): Promise<void> {
  await files.mkdirp(files.join(out, "plan"));
  await files.writeText(files.join(out, "plan.json"), JSON.stringify(world.plan));
  for (const r of world.regions) await files.writeText(files.join(out, "plan", `${r.id}.json`), JSON.stringify(r));
}

async function readJson<T>(files: JobFiles, path: string): Promise<T | null> {
  try {
    return (await files.exists(path)) ? (JSON.parse(await files.readText(path)) as T) : null;
  } catch {
    return null;
  }
}

/** Runs one Blender script; its `WF {json}` lines are its progress, `WFERR` its own explanation of a failure. */
function runBlender(runner: JobRunner, o: JobOptions, id: string, script: string, args: string[], onLine: (line: string, data?: { phase?: string; progress?: number; stats?: Record<string, number> }) => void): Promise<{ code: number; tail: string[] }> {
  return new Promise((resolve) => {
    const tail: string[] = [];
    let done = false;
    const finish = (code: number) => {
      if (done) return;
      done = true;
      offOut();
      offExit();
      o.signal?.removeEventListener("abort", stop);
      resolve({ code, tail });
    };
    const stop = () => void runner.kill(id);
    const offOut = runner.onOutput(id, (_s, line) => {
      if (/WFERR|Error|Traceback|File ".*\.py"/.test(line)) {
        tail.push(line);
        if (tail.length > 30) tail.shift();
      }
      if (line.startsWith("WF {")) {
        try {
          onLine(line, JSON.parse(line.slice(3)) as { phase?: string; progress?: number });
          return;
        } catch {
          /* a cut line is only text */
        }
      }
      onLine(line);
    });
    const offExit = runner.onExit(id, finish);
    o.signal?.addEventListener("abort", stop);
    runner.spawn({ id, program: o.blender, args: ["-b", "--factory-startup", "--disable-autoexec", "--python-exit-code", "1", "--python", `${o.python}/${script}`, "--", ...args], cwd: o.out }).catch((e: Error) => {
      tail.push(`Blender could not be started: ${e.message}`);
      finish(-1);
    });
  });
}

export async function runBlenderWorld(files: JobFiles, runner: JobRunner, plan: BlenderPlan, options: JobOptions): Promise<{ state: JobState; manifest: BlenderManifest | null }> {
  const o = { parallelKit: 3, parallelRegions: 2, retries: 1, ...options };
  const at = (...p: string[]) => files.join(o.out, ...p);
  const planHash = hashText(JSON.stringify({ kit: plan.kit.map((k) => k.key), seed: plan.seed, style: plan.style, size: plan.size, arch: plan.architecture }));
  await files.mkdirp(o.out);
  await files.mkdirp(at("regions"));
  const old = await readJson<JobState>(files, at("state.json"));
  const steps: StepState[] = [];
  const step = (id: string, kind: StepState["kind"], label: string, hash: string): void => {
    const before = old?.steps.find((s) => s.id === id);
    const same = before?.status === "done" && before.hash === hash && !(o.only && kind === "region" && o.only.includes(id));
    steps.push(same ? { ...before!, label } : { id, kind, label, status: "waiting", progress: 0, attempts: 0, hash });
  };
  step("textures", "textures", "Material library", "textures");
  const parts = Math.max(1, Math.min(o.parallelKit * 2, Math.ceil(plan.kit.length / 30)));
  for (let k = 0; k < parts; k++) step(`kit_${k}`, "kit", `Models ${k + 1}/${parts}`, `${planHash}-${k}/${parts}`);
  for (const r of plan.regions) step(r.id, "region", `Region ${r.id}`, hashText(`${planHash}${(await files.exists(at("plan", `${r.id}.json`))) ? await files.readText(at("plan", `${r.id}.json`)) : ""}`));
  step("manifest", "manifest", "Manifest and checks", "");
  const state: JobState = { version: 1, plan: planHash, steps, startedAt: new Date().toISOString(), status: "running", blocking: [] };
  let saving: Promise<void> = Promise.resolve();
  const save = (line?: string): void => {
    o.onState?.(state, line);
    saving = saving.then(() => files.writeText(at("state.json"), JSON.stringify(state, null, 1))).catch(() => {});
  };
  save();
  let seq = 0;
  const run = async (s: StepState, script: string, args: string[]): Promise<boolean> => {
    if (s.status === "done") return true;
    for (let attempt = 0; attempt <= o.retries; attempt++) {
      if (o.signal?.aborted) {
        s.status = "waiting";
        return false;
      }
      s.status = "running";
      s.attempts++;
      s.progress = 0;
      delete s.error;
      const t0 = Date.now();
      save();
      const { code, tail } = await runBlender(runner, o, `wf-${s.id}-${++seq}`, script, args, (line, data) => {
        if (data) {
          if (data.phase) s.phase = data.phase;
          if (typeof data.progress === "number") s.progress = data.progress;
          if (data.stats) s.stats = { ...s.stats, ...data.stats };
          save(line);
        }
      });
      s.seconds = Math.round((Date.now() - t0) / 100) / 10;
      if (code === 0) {
        s.status = "done";
        s.progress = 1;
        save();
        return true;
      }
      s.status = "failed";
      s.error = `${s.phase ? `${s.phase}: ` : ""}${tail.slice(-6).join(" | ") || `Blender stopped (code ${code})`}`;
      save();
    }
    return false;
  };
  const pool = async (list: StepState[], n: number, job: (s: StepState) => Promise<boolean>): Promise<boolean> => {
    let ok = true;
    const queue = [...list];
    await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
      for (let s = queue.shift(); s; s = queue.shift()) if (!(await job(s))) ok = false;
    }));
    return ok;
  };
  const by = (k: StepState["kind"]) => steps.filter((s) => s.kind === k);
  const planFile = at("plan.json");
  const textures = files.join(o.cache, "textures");
  let ok = await run(by("textures")[0]!, "make_textures.py", [textures]);
  if (ok) ok = await pool(by("kit"), o.parallelKit, (s) => run(s, "build_kit.py", [planFile, o.out, "--part", s.id.slice(4), "--of", String(parts), "--cache", o.cache, "--textures", textures]));
  // a region whose neighbours failed is still worth building: regions only share the plan
  if (ok) ok = await pool(by("region"), o.parallelRegions, (s) => run(s, "build_region.py", [planFile, at("plan", `${s.id}.json`), o.out, "--cache", o.cache, "--textures", textures, ...(o.previews ? ["--preview"] : [])]));
  let manifest: BlenderManifest | null = null;
  const last = steps[steps.length - 1]!;
  if (ok) {
    last.status = "running";
    save();
    manifest = await buildManifest(files, plan, o.out);
    await files.writeText(at("manifest.json"), JSON.stringify(manifest));
    last.status = "done";
    last.progress = 1;
    state.blocking = manifest.qa.problems.filter((p) => p.severity === "critical").map((p) => p.message);
  }
  state.status = o.signal?.aborted ? "stopped" : ok && state.blocking.length === 0 ? "done" : "failed";
  state.finishedAt = new Date().toISOString();
  save();
  await saving;
  return { state, manifest };
}

interface RegionReport {
  files: BlenderManifest["regions"][string]["files"];
  instances: number;
  tris: number;
  problems: QaProblem[];
  /** Heights along each border, every two studs: what the neighbour must have too. */
  seams: { west: number[]; east: number[]; north: number[]; south: number[] };
  hash: string;
  materials: string[];
}

/** Puts the regions together: global totals, seams compared, one verdict. */
export async function buildManifest(files: JobFiles, plan: BlenderPlan, out: string): Promise<BlenderManifest> {
  const problems: QaProblem[] = [];
  const kit: BlenderManifest["kit"] = {};
  let bytes = 0;
  let fallback = 0;
  const materials = new Set<string>();
  for (const e of plan.kit) {
    const meta = await readJson<BlenderManifest["kit"][string]>(files, files.join(out, "kit", `${e.key}.json`));
    if (!meta) {
      problems.push({ id: "missing_piece", severity: "critical", message: `${e.key} was not built`, piece: e.key });
      continue;
    }
    kit[e.key] = meta;
    if (meta.fallback) fallback++;
    for (const l of meta.lods) if (l) {
      bytes += l.bytes;
      for (const m of l.meshes) materials.add(m.material);
    }
    problems.push(...meta.problems);
  }
  const regions: BlenderManifest["regions"] = {};
  const reports = new Map<string, RegionReport>();
  let tris = 0;
  let instances = 0;
  for (const r of plan.regions) {
    const rep = await readJson<RegionReport>(files, files.join(out, "regions", r.id, "report.json"));
    if (!rep) {
      problems.push({ id: "missing_region", severity: "critical", message: `region ${r.id} was not built`, region: r.id });
      continue;
    }
    reports.set(r.id, rep);
    for (const f of rep.files) {
      bytes += f.bytes;
      for (const m of f.meshes) materials.add(m.material);
    }
    tris += rep.tris;
    instances += rep.instances;
    regions[r.id] = { rect: r.rect, files: rep.files, layout: `regions/${r.id}/layout.json`, depends: r.neighbours, hash: rep.hash, instances: rep.instances, tris: rep.tris, qa: { status: verdict(rep.problems), problems: rep.problems } };
    problems.push(...rep.problems.filter((p) => p.severity === "critical" || p.severity === "high"));
  }
  // two regions must hold the same heights along the border they share
  for (const r of plan.regions) {
    for (const [side, back, dx, dz] of [["east", "west", 1, 0], ["south", "north", 0, 1]] as const) {
      const next = plan.regions.find((q) => q.cx === r.cx + dx && q.cz === r.cz + dz);
      const a = reports.get(r.id)?.seams[side];
      const b = next && reports.get(next.id)?.seams[back];
      if (!a || !b) continue;
      let worst = Math.abs(a.length - b.length) > 0 ? 99 : 0;
      for (let i = 0; i < Math.min(a.length, b.length); i++) worst = Math.max(worst, Math.abs(a[i]! - b[i]!));
      if (worst > 0.05) problems.push({ id: "open_seam", severity: worst > 0.5 ? "critical" : "high", message: `the ground of ${r.id} and ${next!.id} differs by ${worst.toFixed(2)} studs along their border`, region: r.id });
    }
  }
  const tex = (await readJson<Record<string, { maps: Record<string, string>; tile: number; doubleSided: boolean }>>(files, files.join(out, "materials.json"))) ?? {};
  return {
    version: 2,
    id: plan.id,
    name: plan.name,
    size: plan.size,
    regionSize: plan.regionSize,
    kit,
    regions,
    materials: Object.fromEntries([...materials].sort().map((m) => [m, tex[m] ?? { doubleSided: m === "Leaf" || m === "Fabric" }])),
    totals: { tris, instances, pieces: Object.keys(kit).length, fallback, bytes, regions: Object.keys(regions).length },
    qa: { status: verdict(problems), problems },
  };
}

function verdict(problems: QaProblem[]): "ok" | "warnings" | "failed" {
  return problems.some((p) => p.severity === "critical") ? "failed" : problems.some((p) => p.severity === "high" || p.severity === "medium") ? "warnings" : "ok";
}
