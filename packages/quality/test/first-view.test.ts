import { describe, expect, it } from "vitest";
import { getStylePreset, type WorldSpec } from "@worldforge/core";
import { generateWorld } from "@worldforge/world-gen";
import { interpretPrompt } from "@worldforge/agents";
import { critiqueBake, measureFirstView } from "@worldforge/quality";

/**
 * The first frame from the spawn. On 4 Nov 2026 a World agent placed the spawn inside a walled village
 * (cameraComposition.spawnPosition) and the player faced a rampart; another map opened on a tree trunk.
 * The critic scored both 100/100.
 */
describe("first view from the spawn", () => {
  const { spec: base } = interpretPrompt("un village médiéval avec une église et des remparts");
  const style = getStylePreset(base.stylePreset);
  const focal = base.landmarks.find((l) => l.role === "focal")!;
  const site = base.settlements[0]!;
  // the agent's wish: spawn in the middle of the village, facing the focal landmark
  const insideVillage: WorldSpec = { ...base, cameraComposition: { ...base.cameraComposition, spawnPosition: site.position ?? [0.5, 0.55], spawnFacing: focal.id } };

  it("moves a spawn wished inside the village to a point that sees its target", () => {
    const bake = generateWorld(insideVillage, style);
    const view = measureFirstView(bake);
    expect(view.openness, view.blockers.join(",")).toBeGreaterThanOrEqual(0.6);
    expect(critiqueBake(bake, insideVillage, style).problems.map((p) => p.id)).not.toContain("first_view_blocked");
  });

  it("keeps the axis of the first view free of trees", () => {
    const bake = generateWorld(base, style);
    const [sx, , sz] = bake.spawn.position;
    const [lx, , lz] = bake.spawn.lookAt;
    const heading = Math.atan2(lz - sz, lx - sx);
    const reach = Math.min(220, Math.hypot(lx - sx, lz - sz) * 0.9);
    const inAxis = bake.placements.filter((p) => {
      if (p.category !== "vegetation" || p.id.startsWith("detail_")) return false;
      const d = Math.hypot(p.position[0] - sx, p.position[2] - sz);
      const a = Math.atan2(p.position[2] - sz, p.position[0] - sx) - heading;
      const v = bake.prefabs[p.prefab]?.[p.variant];
      return d > 42 && d < reach && Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.25 && (v?.bounds.max[1] ?? 0) * p.scale > 8;
    });
    expect(inAxis.map((p) => p.prefab)).toEqual([]);
  });

  it("counts the dressing around the player, not a share of the map", () => {
    const bake = generateWorld(base, style);
    expect(measureFirstView(bake).dressing).toBeGreaterThanOrEqual(15);
    expect(critiqueBake(bake, base, style).problems.map((p) => p.id)).not.toContain("foreground_empty");
    const [sx, , sz] = bake.spawn.position;
    // a bare clearing in the middle of a full map: the share of foreground objects barely moves
    bake.placements = bake.placements.filter((p) => Math.hypot(p.position[0] - sx, p.position[2] - sz) >= 45);
    expect(measureFirstView(bake).dressing).toBe(0);
    expect(critiqueBake(bake, base, style).problems.map((p) => p.id)).toContain("foreground_empty");
  });

  it("dresses the spawn of a world where nothing grows with the style's props", () => {
    const { spec } = interpretPrompt("ville cyberpunk néon la nuit");
    const city = getStylePreset(spec.stylePreset);
    expect(measureFirstView(generateWorld(spec, city)).dressing).toBeGreaterThanOrEqual(15);
  });

  it("keeps landmarks readable however thick an agent asks the fog to be", () => {
    const { spec } = interpretPrompt("une map d'horreur");
    const thick: WorldSpec = { ...spec, lighting: { ...spec.lighting, mood: "eerie" }, atmosphere: { ...spec.atmosphere, fogDensity: 0.95 } };
    const horror = getStylePreset(thick.stylePreset);
    const bake = generateWorld(thick, horror);
    expect(bake.lighting.fogEnd).toBeGreaterThanOrEqual(160);
    expect(critiqueBake(bake, thick, horror).problems.map((p) => p.id)).not.toContain("fog_too_thick");
  });

  it("is flagged by the critic when something stands right in front of the camera", () => {
    const bake = generateWorld(base, style);
    const [sx, sy, sz] = bake.spawn.position;
    const [lx, , lz] = bake.spawn.lookAt;
    const heading = Math.atan2(lz - sz, lx - sx);
    const tree = bake.placements.find((p) => p.prefab === "round_tree" || p.prefab === "pine_tree")!;
    // a wall of three big trees 20 studs ahead, as in the blocked render
    for (const off of [-0.25, 0, 0.25]) bake.placements.push({ ...tree, id: `blocker_${off}`, position: [sx + Math.cos(heading + off) * 20, sy, sz + Math.sin(heading + off) * 20], scale: 3 });
    const view = measureFirstView(bake);
    expect(view.openness).toBeLessThan(0.6);
    expect(critiqueBake(bake, base, style).problems.map((p) => p.id)).toContain("first_view_blocked");
  });
});

/**
 * Found on 5 Nov 2026 by looking at renders of maps the critic scored 100/100: the focal landmark stood
 * about 500 studs from the spawn on nearly every map, a castle filled 6° of the view, and on an arena map
 * it stood on the fighting floor, 46 studs in front of the player.
 */
describe("the focal landmark in the first view", () => {
  it("stands tall enough to read from the spawn, with or without a settlement", () => {
    for (const prompt of ["un château médiéval sur une colline", "une map d'horreur"]) {
      const { spec } = interpretPrompt(prompt);
      const style = getStylePreset(spec.stylePreset);
      const bake = generateWorld(spec, style);
      expect(measureFirstView(bake).focalAngle, prompt).toBeGreaterThanOrEqual(11);
      expect(critiqueBake(bake, spec, style).problems.map((p) => p.id), prompt).not.toContain("focal_too_small");
    }
  });

  it("is flagged by the critic when it shrinks to a speck", () => {
    const { spec } = interpretPrompt("un château médiéval sur une colline");
    const style = getStylePreset(spec.stylePreset);
    const bake = generateWorld(spec, style);
    const castle = bake.placements.find((p) => p.prefab === "castle")!;
    const [sx, , sz] = bake.spawn.position;
    const k = 520 / Math.hypot(castle.position[0] - sx, castle.position[2] - sz);
    castle.position = [sx + (castle.position[0] - sx) * k, castle.position[1], sz + (castle.position[2] - sz) * k];
    bake.spawn.lookAt = castle.position;
    expect(critiqueBake(bake, spec, style).problems.map((p) => p.id)).toContain("focal_too_small");
  });

  it("stays inside the fog range on a foggy map, where size alone proves nothing", () => {
    for (const prompt of ["une map d'horreur", "manoir hanté dans un marais"]) {
      const { spec } = interpretPrompt(prompt);
      const style = getStylePreset(spec.stylePreset);
      const bake = generateWorld(spec, style);
      expect(measureFirstView(bake).focalFog, prompt).toBeLessThanOrEqual(0.85);
      bake.lighting.fogEnd = 60;
      expect(critiqueBake(bake, spec, style).problems.map((p) => p.id), prompt).toContain("focal_in_fog");
    }
  });

  it("turns the castle gate toward the spawn", () => {
    const { spec } = interpretPrompt("un château médiéval sur une colline");
    const bake = generateWorld(spec, getStylePreset(spec.stylePreset));
    const castle = bake.placements.find((p) => p.prefab === "castle")!;
    // prefab front is -Z: rotating by θ sends it to (-sin θ, -cos θ)
    const front = [-Math.sin(castle.rotationY), -Math.cos(castle.rotationY)];
    const dx = bake.spawn.position[0] - castle.position[0];
    const dz = bake.spawn.position[2] - castle.position[2];
    expect((front[0]! * dx + front[1]! * dz) / Math.hypot(dx, dz)).toBeGreaterThan(0.99);
  });

  it("builds what was asked for: a manor is not a castle, a chalet stands in the snow", () => {
    const { spec: haunted } = interpretPrompt("manoir hanté dans un marais");
    expect(haunted.landmarks[0]?.type).toBe("manor");
    const { spec: mountain } = interpretPrompt("montagne enneigée avec un chalet");
    expect(mountain.landmarks[0]?.type).toBe("chalet");
    expect(mountain.stylePreset).toBe("winter");
    const bake = generateWorld(mountain, getStylePreset(mountain.stylePreset));
    expect(measureFirstView(bake).focalAngle).toBeGreaterThanOrEqual(8);
  });

  it("surrounds a city with a skyline instead of an empty lot", () => {
    const { spec } = interpretPrompt("ville cyberpunk néon la nuit");
    const style = getStylePreset(spec.stylePreset);
    const bake = generateWorld(spec, style);
    const ids = critiqueBake(bake, spec, style).problems.map((p) => p.id);
    expect(ids).not.toContain("background_empty");
    expect(ids).not.toContain("focal_in_fog");
    expect(measureFirstView(bake).openness).toBeGreaterThanOrEqual(0.6);
  });

  it("keeps landmarks off the fighting floor of an arena", () => {
    const { spec } = interpretPrompt("arène de combat dans un volcan");
    const style = getStylePreset(spec.stylePreset);
    const bake = generateWorld(spec, style);
    const [sx, , sz] = bake.spawn.position;
    for (const p of bake.placements) {
      if (p.category === "landmark" && !p.id.startsWith("layout_")) expect(Math.hypot(p.position[0] - sx, p.position[2] - sz), p.id).toBeGreaterThan(100);
    }
    expect(measureFirstView(bake).openness).toBe(1);
  });

  it("leaves a jungle its floor when the map runs over the parts budget", () => {
    const { spec } = interpretPrompt("une jungle");
    const bake = generateWorld(spec, getStylePreset(spec.stylePreset));
    expect(bake.placements.filter((p) => p.id.startsWith("ug_")).length).toBeGreaterThan(400);
    expect(bake.placements.filter((p) => p.category === "rock").length).toBeGreaterThan(40);
  });
});
