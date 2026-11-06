import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { blenderJobScript, blenderScriptProblem, modelGateProblems, withReviewRenders, type BlenderReport } from "@worldforge/agents";

/**
 * The gates measured by a real Blender on hand-made models. Runs only with WF_BPY_PYTHON, a Python that can
 * `import bpy` (pip install bpy==5.2.3; on a headless Linux also libegl1 and EGL_PLATFORM=surfaceless).
 */
const python = process.env.WF_BPY_PYTHON;
const fixtures = join(__dirname, "fixtures/models");

function run(name: string): BlenderReport {
  const code = readFileSync(join(fixtures, `${name}.py`), "utf8");
  expect(blenderScriptProblem(code)).toBeNull();
  const dir = mkdtempSync(join(tmpdir(), `wf-gates-${name}-`)).replace(/\\/g, "/");
  const job = withReviewRenders({ glb: `${dir}/m.glb`, fbx: `${dir}/m.fbx`, preview: `${dir}/p.png`, report: `${dir}/r.json`, palette: `${dir}/pal.png`, heightStuds: 8, maxTriangles: 20000 }, dir);
  writeFileSync(`${dir}/job.py`, blenderJobScript(code, job));
  execFileSync(python!, ["-c", "import sys; f=sys.argv[1]; exec(compile(open(f).read(), f, 'exec'))", `${dir}/job.py`], { stdio: "ignore", timeout: 240_000, env: { EGL_PLATFORM: "surfaceless", ...process.env } });
  return JSON.parse(readFileSync(`${dir}/r.json`, "utf8")) as BlenderReport;
}

const gates = (r: BlenderReport) => modelGateProblems(r, { heightStuds: 8, maxTriangles: 20000 }).map((p) => p.gate);

describe.skipIf(!python)("the mesh gates in Blender", () => {
  it("pass a clean chest and export it", () => {
    const r = run("chest");
    expect(r.ok).toBe(true);
    expect(r.size?.[2]).toBeCloseTo(8);
    expect(gates(r)).toEqual([]);
    expect(r.gates?.silhouetteFill?.length).toBe(3);
  }, 300_000);

  it("find the gem floating above the lid, at the front and the top", () => {
    const r = run("floating");
    expect(gates(r)).toEqual(["floating"]);
    const at = r.gates!.floatingAt!;
    expect(at[1]).toBeGreaterThan(0); // Roblox front is +Y
    expect(at[2]).toBeGreaterThan(6);
  }, 300_000);

  it("find the lantern head off its post", () => {
    const r = run("lopsided");
    expect(gates(r)).toEqual(["symmetry"]);
    expect(r.gates!.offCentreBy).toBeCloseTo(0.45, 1);
  }, 300_000);
});
