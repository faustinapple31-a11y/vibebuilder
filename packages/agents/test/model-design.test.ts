import { describe, expect, it } from "vitest";
import {
  blenderJobScript,
  blenderScriptProblem,
  briefAsPlainPrompt,
  buildConceptPrompt,
  buildLocalModelBrief,
  buildModelBriefPrompt,
  parseBlenderScript,
  parseModelBrief,
  DESIGN_MODEL,
  modelBudget,
} from "@worldforge/agents";

const job = { glb: "a.glb", fbx: "a.fbx", preview: "a.png", report: "a.json", textures: "t", heightStuds: 8, maxTriangles: 20000, name: "coffre", texture: 512 };

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

  it("takes the client's images when there are some", () => {
    expect(buildConceptPrompt("OBJECT: x", {}, ["ref.png"])).toContain("references from the client");
    expect(buildConceptPrompt("OBJECT: x", {})).not.toContain("references from the client");
  });

  it("cannot have its wrapper shadowed by an agent's helper", () => {
    const python = blenderJobScript("def _finish(a):\n    pass\ndef build():\n    pass", job);
    expect(python).toContain("def _wf_finish()");
    expect(python).toContain("_wf_finish()");
  });
});

describe("a model made for a Roblox game", () => {
  it("costs what its use allows, not the hard limit", () => {
    expect(modelBudget("landmark")).toEqual({ maxTriangles: 20000, texture: 1024 });
    expect(modelBudget("prop").maxTriangles).toBeLessThan(10000);
    expect(modelBudget("vegetation").texture).toBe(512);
  });

  it("is designed for the avatar, the camera and the phone", () => {
    const prompt = buildConceptPrompt("OBJECT: x", { category: "landmark" });
    expect(prompt).toContain("5-stud avatar");
    expect(prompt).toContain("about 100 studs away");
    expect(prompt).toContain("doors at least 8 studs tall");
  });

  it("arrives named, baked larger than it ships", () => {
    const python = blenderJobScript("def build():\n    pass", job);
    expect(python).toContain('lo.name = "coffre"');
    expect(python).toContain('new("albedo", 1024, 1024');
    expect(python).toContain("img.scale(512, 512)");
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
    expect(python).toContain("_WF_HEIGHT = 8");
    expect(python).toContain("20000 * 0.95");
    expect(python).toContain('bpy.ops.object.bake(type="NORMAL"');
    // gold baked with metal on comes out black
    expect(python.indexOf('b.inputs["Metallic"].default_value = 0.0')).toBeLessThan(python.indexOf('bpy.ops.object.bake(type="DIFFUSE")'));
    expect(python).toContain('bpy.ops.object.bake(type="EMIT")');
    expect(python).toContain("def build():");
  });
});
