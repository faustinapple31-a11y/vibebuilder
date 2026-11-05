import { describe, expect, it } from "vitest";
import {
  blenderJobScript,
  blenderScriptProblem,
  briefAsPlainPrompt,
  buildBlenderPrompt,
  buildLocalModelBrief,
  buildModelBriefPrompt,
  parseBlenderScript,
  parseModelBrief,
  parseReferences,
  sanitizeSvg,
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

describe("the hidden reference drawings", () => {
  const svg = '<svg viewBox="0 0 768 768"><rect width="10" height="10" fill="#123456"/></svg>';

  it("reads the three views and drops what could run in the webview", () => {
    const answer = `<reference view="front">${svg}</reference><reference view="side"><svg><script>x()</script></svg></reference><reference view="three_quarter">${svg}</reference>`;
    expect(parseReferences(answer).map((r) => r.view)).toEqual(["front", "three_quarter"]);
    expect(sanitizeSvg('<svg onload="x()"></svg>')).toBeNull();
    expect(sanitizeSvg('<svg><image href="http://x/y.png"/></svg>')).toBeNull();
  });

  it("reach the modelling agent as images when there are some, as drawings otherwise", () => {
    expect(buildBlenderPrompt("OBJECT: x", {}, [{ view: "front", svg }])).toContain(svg);
    const withImages = buildBlenderPrompt("OBJECT: x", {}, [{ view: "front", svg }], ["front.png"]);
    expect(withImages).not.toContain(svg);
    expect(withImages).toContain("reference images");
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
