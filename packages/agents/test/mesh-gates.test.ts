import { describe, expect, it } from "vitest";
import { blenderJobScript, buildReviewPrompt, gateScore, inAgentAxes, modelGateProblems, withReviewRenders, type BlenderReport, type MeshGates } from "@worldforge/agents";

const clean: MeshGates = { islands: 6, floatingParts: 0, floatingShare: 0, symmetry: 0.97, support: 0.6, dustParts: 0, dustShare: 0, topShare: 0.3, rawTriangles: 4000, silhouetteFill: [0.6, 0.5, 0.55] };
const report = (gates: Partial<MeshGates>, extra: Partial<BlenderReport> = {}): BlenderReport => ({ ok: true, triangles: 4000, size: [6, 4, 8], openEdges: 0, gates: { ...clean, ...gates }, ...extra });
const ctx = { heightStuds: 8, maxTriangles: 20000 };
const gatesOf = (r: BlenderReport, c: { heightStuds: number; maxTriangles: number; category?: string } = ctx) => modelGateProblems(r, c).map((p) => p.gate);

describe("the mesh gates", () => {
  it("pass a clean model", () => {
    expect(modelGateProblems(report({}), ctx)).toEqual([]);
    expect(modelGateProblems({ ok: false, error: "x" }, ctx)).toEqual([]);
  });

  it("send a floating piece back as a fact, located in the agent's own axes", () => {
    const problems = modelGateProblems(report({ floatingParts: 1, floatingShare: 0.05, floatingAt: [2, -4, 6] }), ctx);
    expect(problems[0]).toMatchObject({ gate: "floating", severity: "high" });
    // Roblox front is +Y, the agent's front is -Y: x and y flip, all in model heights
    expect(problems[0]!.text).toContain("(-0.25, 0.5, 0.75)");
    expect(inAgentAxes([2, -4, 6], 8)).toEqual([-0.25, 0.5, 0.75]);
    // a few stray triangles are not worth a round trip
    expect(gatesOf(report({ floatingParts: 1, floatingShare: 0.001 }))).toEqual([]);
  });

  it("flag an almost symmetric model, not a deliberately asymmetric one", () => {
    expect(gatesOf(report({ symmetry: 0.75 }))).toEqual(["symmetry"]);
    expect(gatesOf(report({ symmetry: 0.3 }))).toEqual([]);
  });

  it("name a centred piece that sits off its centre, as measured on a lopsided lantern in Blender", () => {
    // Blender 5.2 on a street lantern whose head is 0.45 stud off its post: symmetry 0.72, one piece off
    const problems = modelGateProblems(report({ symmetry: 0.72, offCentre: 1, offCentreAt: [0.18, 0, 0.3], offCentreBy: 0.46 }), ctx);
    expect(problems).toHaveLength(1);
    expect(problems[0]!.text).toContain("0.46 studs off");
  });

  it("want a base on the ground, except for plants", () => {
    expect(gatesOf(report({ support: 0.02 }))).toEqual(["support"]);
    expect(gatesOf(report({ support: 0.02 }), { ...ctx, category: "vegetation" })).toEqual([]);
  });

  it("count dust, holes, the budget and an empty silhouette", () => {
    expect(gatesOf(report({ dustShare: 0.3, dustParts: 80 }))).toEqual(["dust"]);
    expect(gatesOf(report({}, { openEdges: 12 }))).toEqual(["open"]);
    expect(gatesOf(report({ rawTriangles: 90000 }))).toEqual(["budget"]);
    expect(gatesOf(report({ silhouetteFill: [0.05, 0.08, 0.1] }))).toEqual(["silhouette"]);
  });

  it("rank one serious defect above any number of small ones", () => {
    const floating = modelGateProblems(report({ floatingParts: 1, floatingShare: 0.1 }), ctx);
    const many = modelGateProblems(report({ symmetry: 0.7, dustShare: 0.3, support: 0.01 }, { openEdges: 500 }), ctx);
    expect(gateScore(floating)).toBeGreaterThan(gateScore(many));
    expect(gateScore(modelGateProblems(report({}, { openEdges: 3 }), ctx))).toBe(0);
  });
});

describe("the review", () => {
  const job = withReviewRenders({ glb: "w/a.glb", fbx: "w/a.fbx", preview: "w/p.png", report: "w/r.json", palette: "w/pal.png", heightStuds: 8, maxTriangles: 20000 }, "w");

  it("renders the finished model from the design's sides and as 64 px silhouettes", () => {
    expect(job.views).toMatchObject({ front: "w/final_front.png", three_quarter: "w/final_three_quarter.png" });
    expect(job.silhouette).toBe("w/silhouette.png");
    const python = blenderJobScript("def build():\n    pass", job);
    expect(python).toContain("w/final_back.png");
    expect(python).toContain("gates[\"silhouetteFill\"] = _wf_silhouettes(");
    expect(python).toContain("gates = _wf_gates(me, 8)");
    // without them the script renders only the preview
    expect(blenderJobScript("def build():\n    pass", { ...job, views: {}, silhouette: undefined })).not.toContain("gates[\"silhouetteFill\"]");
  });

  it("puts the measured defects before the opinions", () => {
    const problems = modelGateProblems(report({ floatingParts: 2, floatingShare: 0.1 }), ctx);
    const prompt = buildReviewPrompt("BRIEF", "def build():\n    pass", problems, true, job);
    expect(prompt).toContain("[high] 2 pieces float");
    expect(prompt).toContain("silhouette.png");
    expect(prompt).toContain("final_front.png");
    expect(prompt.indexOf("Measured by the build")).toBeLessThan(prompt.indexOf("strict art director"));
  });
});
