import { describe, expect, it } from "vitest";
import { FRAMEWORK_TEMPLATE_FILES, RUNTIME_TEMPLATE_PREFIXES, TEMPLATE_VERSION, scaffoldProjectFiles, templateUpgradeFiles } from "../src";

describe("template upgrade (older projects receive the gameplay framework)", () => {
  const opts = { projectName: "Old Project", projectId: "prj_old", stylePreset: "stylized_mystical" };
  const all = scaffoldProjectFiles(opts);

  it("scaffolds new projects at the current template version with every framework file", () => {
    const meta = JSON.parse(all.find((f) => f.path === "worldforge.json")!.content) as { templateVersion: number };
    expect(meta.templateVersion).toBe(TEMPLATE_VERSION);
    for (const p of FRAMEWORK_TEMPLATE_FILES) expect(all.some((f) => f.path === p), p).toBe(true);
  });

  it("re-applies framework files and adds missing ones, never runtime/generated/meta files", () => {
    // a v1 project: has the old systems but none of the shop/NPC/audio files
    const existing = new Set(["src/server/main.server.ts", "src/client/main.client.ts", "src/shared/config.ts", "src/shared/net.ts", "src/systems/PlayerData.ts", "src/ui/Hud.ts", "src/world/WorldBuilder.ts"]);
    const files = templateUpgradeFiles(opts, existing);
    const paths = files.map((f) => f.path);
    expect(paths).toContain("src/systems/Shop.ts");
    expect(paths).toContain("src/ui/ShopUi.ts");
    expect(paths).toContain("src/shared/anim/keyframes.ts");
    expect(paths).toContain("src/server/main.server.ts"); // framework file present in the project → rewritten
    expect(paths).not.toContain("worldforge.json");
    expect(paths).not.toContain("src/shared/config.ts"); // generated from the GameSpec, exists → untouched
    for (const p of paths) expect(RUNTIME_TEMPLATE_PREFIXES.some((r) => p.startsWith(r)), p).toBe(false);
  });
});
