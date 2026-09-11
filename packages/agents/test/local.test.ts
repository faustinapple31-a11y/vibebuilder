import { describe, expect, it } from "vitest";
import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getStylePreset } from "@worldforge/core";
import { generateWorld } from "@worldforge/world-gen";
import { interpretPrompt, interpretModification, Orchestrator, planNewGame, createProviders, type FileIO } from "@worldforge/agents";
import { createNodeProcessRunner } from "@worldforge/agents/node";

const nodeFiles: FileIO = {
  readText: async (p) => readFileSync(p, "utf8"),
  writeText: async (p, c) => {
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, c, "utf8");
  },
  exists: async (p) => existsSync(p),
  mkdirp: async (p) => void mkdirSync(p, { recursive: true }),
  join: (...parts) => join(...parts),
};

describe("local interpreter", () => {
  it("compiles a French brief into a bakeable WorldSpec", () => {
    const r = interpretPrompt("Crée-moi un jeu de survie dans une forêt mystérieuse avec un petit village abandonné, des champignons géants, des chemins en pierre, une rivière, des ruines et une ambiance brumeuse.");
    expect(r.spec.stylePreset).toBe("stylized_mystical");
    expect(r.spec.rivers.length).toBe(1);
    expect(r.spec.settlements[0]?.type).toBe("abandoned_village");
    expect(r.spec.landmarks.some((l) => l.role === "focal")).toBe(true);
    expect(r.spec.vegetation.species).toContain("giant_mushroom");
    expect(r.game.genre).toBe("survival");
    const bake = generateWorld(r.spec, getStylePreset(r.spec.stylePreset));
    expect(bake.placements.length).toBeGreaterThan(500);
  });
  it("handles English + other presets", () => {
    const r = interpretPrompt("Make a cyberpunk city racing game with neon streets at night");
    expect(r.spec.stylePreset).toBe("cyberpunk");
    expect(r.game.genre).toBe("racing");
    const d = interpretPrompt("A cute cartoon meadow with a lake, a windmill and a small hamlet of 4 houses");
    expect(d.spec.stylePreset).toBe("cartoon");
    expect(d.spec.lakes.length).toBe(1);
    expect(d.spec.settlements[0]?.buildings).toBe(4);
  });
  it("applies modifications without destroying the village", () => {
    const r = interpretPrompt("Un village dans une forêt");
    const m1 = interpretModification(r.spec, "Plus médiéval");
    expect(m1.spec.stylePreset).toBe("medieval");
    expect(m1.spec.settlements.length).toBe(1);
    const m2 = interpretModification(m1.spec, "Ajoute une rivière derrière le village");
    expect(m2.spec.rivers.length).toBe(1);
    expect(m2.regenerate).toContain("water");
    expect(m2.spec.settlements.length).toBe(1);
    const m3 = interpretModification(m2.spec, "moins d'arbres et plus de brume");
    expect(m3.spec.vegetation.density).toBeLessThan(m2.spec.vegetation.density);
    expect(m3.spec.atmosphere.fogDensity).toBeGreaterThan(m2.spec.atmosphere.fogDensity);
  });
});

describe("orchestrator with the local provider", () => {
  it("runs design → world → gameplay and writes the files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wf-orch-"));
    mkdirSync(join(dir, "src", "shared"), { recursive: true });
    const providers = createProviders({ runner: createNodeProcessRunner(), files: nodeFiles, homeDir: tmpdir() });
    const local = providers.get("local-rules")!;
    const events: string[] = [];
    const orch = new Orchestrator({
      files: nodeFiles,
      projectDir: dir,
      projectName: "Test",
      acquireSession: async (task) => ({ provider: local, session: await local.startSession({ cwd: dir, role: task.role }) }),
      onEvent: (e) => events.push(e.type === "task" ? `${e.task.role}:${e.task.status}` : e.type),
      bakeCheck: async (spec) => void generateWorld(spec, getStylePreset(spec.stylePreset)),
    });
    const plan = await orch.run(planNewGame("Crée un jeu Roblox dans une forêt mystérieuse avec un village abandonné.", ["design", "world", "gameplay"]), { concurrency: 2 });
    expect(plan.tasks.every((t) => t.status === "done")).toBe(true);
    expect(existsSync(join(dir, "design", "game.spec.json"))).toBe(true);
    expect(existsSync(join(dir, "worlds", "main", "world.spec.json"))).toBe(true);
    expect(readFileSync(join(dir, "src", "shared", "config.ts"), "utf8")).toContain("GameConfig");
    expect(events).toContain("world:done");
  });
});
