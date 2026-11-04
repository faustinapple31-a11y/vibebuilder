import { describe, expect, it } from "vitest";
import { BIOME_IDS, PROP_SETS, SETTLEMENT_TYPES, VEGETATION_SPECIES, ZONE_HINTS } from "@worldforge/core";
import { KNOWLEDGE, buildEnhancerPrompt, buildRolePrompt, composeBriefedRequest, knowledgeForPrompt, searchKnowledge, worldKnowledgeSection } from "@worldforge/agents";

describe("knowledge base", () => {
  it("has unique ids, real links and sources for every outside claim", () => {
    expect(new Set(KNOWLEDGE.map((e) => e.id)).size).toBe(KNOWLEDGE.length);
    for (const e of KNOWLEDGE) {
      expect(e.rules.length, e.id).toBeGreaterThan(0);
      expect(e.audience.length, e.id).toBeGreaterThan(0);
      for (const s of e.sources) expect(s.url, e.id).toMatch(/^https:\/\/[^\s]+$/);
      if (e.reliability !== "worldforge") expect(e.sources.length, e.id).toBeGreaterThan(0);
    }
    expect(KNOWLEDGE.filter((e) => e.domain === "prompting").length).toBeGreaterThan(15);
    expect(KNOWLEDGE.filter((e) => e.domain === "mapping").length).toBeGreaterThan(30);
  });

  it("only names WorldSpec values that exist in its recipes", () => {
    const known = new Set<string>([...ZONE_HINTS, ...BIOME_IDS, ...VEGETATION_SPECIES, ...PROP_SETS, ...SETTLEMENT_TYPES, "spawn", "edge", "hidden", "focal", "secondary", "sparse", "medium", "dense", "none"]);
    for (const e of KNOWLEDGE.filter((k) => k.audience.includes("world")))
      for (const rule of e.rules) for (const [, value] of rule.matchAll(/"([a-z_]+)"/g)) expect(known, `${e.id}: "${value}"`).toContain(value);
  });

  it("finds entries by French or English words", () => {
    expect(searchKnowledge({ text: "une map d'horreur" })[0]?.id).toBe("m_mood_horror");
    expect(searchKnowledge({ text: "une île de pirates" }).map((e) => e.id)).toContain("m_mood_coast");
    expect(searchKnowledge({ text: "fait moi un village", audience: "world" }).map((e) => e.id)).toContain("r_landmark_in_settlement");
    expect(searchKnowledge({ domain: "prompting" }).every((e) => e.domain === "prompting")).toBe(true);
    expect(searchKnowledge({ text: "zzzz" })).toHaveLength(0);
  });

  it("always gives each audience its core entries, then the relevant ones", () => {
    const core = KNOWLEDGE.filter((e) => e.core && e.audience.includes("world"));
    const text = knowledgeForPrompt("world", "une ferme avec des animaux");
    for (const e of core) expect(text).toContain(e.title);
    expect(text).toContain("Fields, farms and orchards");
    expect(knowledgeForPrompt("enhancer", "une map d'horreur")).toContain("Horror maps");
  });

  it("reaches the brief writer and the World agent", () => {
    expect(buildEnhancerPrompt("une map d'horreur")).toContain("Horror maps");
    const world = buildRolePrompt("world", { userPrompt: "fait moi un village", projectName: "T" });
    expect(world).toContain("WorldSpec recipes");
    expect(buildRolePrompt("gameplay", { userPrompt: "fait moi un village", projectName: "T" })).not.toContain("WorldSpec recipes");
    expect(composeBriefedRequest("fait moi un village", "INTENT: x")).toContain(worldKnowledgeSection("fait moi un village\nINTENT: x"));
  });
});
