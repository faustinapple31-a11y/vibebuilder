import { describe, expect, it } from "vitest";
import {
  blenderConceptScript,
  blenderJobScript,
  blenderScriptProblem,
  briefAsPlainPrompt,
  buildBlenderPrompt,
  buildConceptPrompt,
  buildLocalModelBrief,
  buildModelBriefPrompt,
  parseBlenderScript,
  parseModelBrief,
  DESIGN_MODEL,
} from "@worldforge/agents";

const job = { glb: "a.glb", fbx: "a.fbx", preview: "a.png", report: "a.json", palette: "p.png", heightStuds: 8, maxTriangles: 20000 };

describe("the hidden model brief", () => {
  it("keeps the request and the world's palette in what the small model receives", () => {
    const prompt = buildModelBriefPrompt("une épée", { palette: ["#112233"], heightStuds: 6 });
    expect(prompt).toContain("Request: une épée");
    expect(prompt).toContain("#112233");
    expect(prompt).toContain("6 studs");
  });

  it("refuses a cut-off brief and keeps a complete one", () => {
    expect(parseModelBrief("<brief>OBJECT: a sword")).toBeNull();
    expect(parseModelBrief("<brief>OBJECT: a sword\nPALETTE: #111111</brief>")).toContain("sword");
  });

  it("falls back to the craft rules, and fits Meshy's 600 characters", () => {
    expect(buildLocalModelBrief("une épée")).toContain("une épée");
    const plain = briefAsPlainPrompt(`OBJECT: ${"A long sentence about a sword. ".repeat(40)}`);
    expect(plain.length).toBeLessThanOrEqual(580);
    expect(plain.startsWith("OBJECT")).toBe(false);
  });
});

describe("the hidden 3D design", () => {
  it("runs on Opus 5.5, in 3D, with no triangle budget", () => {
    expect(DESIGN_MODEL).toBe("claude-opus-5-5");
    const prompt = buildConceptPrompt("OBJECT: x", {});
    expect(prompt).toContain("no triangle budget");
    expect(prompt).not.toContain("under 15000 triangles");
  });

  it("is rendered from every side, and exports nothing", () => {
    const python = blenderConceptScript("def build():\n    pass", { front: "f.png", right: "r.png", back: "b.png", three_quarter: "q.png" }, "d.json");
    for (const view of ["f.png", "r.png", "b.png", "q.png"]) expect(python).toContain(view);
    expect(python).not.toContain("export_scene");
  });

  it("reaches the modelling agent as images, and the budget applies there", () => {
    const prompt = buildBlenderPrompt("OBJECT: x", {}, ["front.png"]);
    expect(prompt).toContain("renders of the approved 3D design");
    expect(prompt).toContain("under 15000 triangles");
    expect(buildBlenderPrompt("OBJECT: x", {})).not.toContain("approved 3D design");
  });

  it("cannot have its wrapper shadowed by an agent's helper", () => {
    const python = blenderJobScript("def _finish(a):\n    pass\ndef build():\n    pass", job);
    expect(python).toContain("def _wf_finish()");
    expect(python).toContain("_wf_finish()");
  });
});

describe("the Blender script", () => {
  it("is read from the answer, with or without a code fence", () => {
    expect(parseBlenderScript("<script>def build():\n    pass</script>")).toContain("def build");
    expect(parseBlenderScript("<script>\n```python\ndef build():\n    pass\n```\n</script>")).toBe("def build():\n    pass");
    expect(parseBlenderScript("I cannot do that")).toBeNull();
  });

  it("refuses what a modelling script never needs: it runs on the client's machine", () => {
    expect(blenderScriptProblem("import bpy, math\ndef build():\n    pass")).toBeNull();
    for (const bad of ["import os", "import subprocess", "from urllib import request", "open('x')", "exec('x')", "__import__('os')", "bpy.ops.wm.save_mainfile()", "bpy.ops.export_scene.fbx()", "bpy.app.handlers", "x.save()"]) {
      expect(blenderScriptProblem(`def build():\n    ${bad}`), bad).not.toBeNull();
    }
    expect(blenderScriptProblem("x = 1")).toBe("the script must define build()");
  });

  it("is wrapped with the exports, the height and the triangle budget", () => {
    const python = blenderJobScript("def build():\n    pass", job);
    expect(python).toContain("export_scene.gltf");
    expect(python).toContain("export_scene.fbx");
    expect(python).toContain("s = 8 / span");
    expect(python).toContain("tris > 20000");
    expect(python).toContain("def build():");
  });
});
