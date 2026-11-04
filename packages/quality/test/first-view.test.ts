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
