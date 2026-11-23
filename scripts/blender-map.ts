/**
 * Makes a map in Blender: the generator lays it out, Blender models and renders everything that is seen.
 *   npx tsx scripts/blender-map.ts "village médiéval dans une forêt avec un château" [--out demo-output/bmap] [--views spawn,village] [--samples 48]
 *   npx tsx scripts/blender-map.ts --spec <project>/worlds/main/world.spec.json
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { interpretPrompt } from "../packages/agents/src/local/interpreter";
import { STYLE_FAMILY_INDEX, StyleBibleSchema, TERRAIN_MATERIALS, WorldSpecSchema, styleFamilyToBible } from "../packages/core/src";
import { critiqueBake } from "../packages/quality/src";
import { generateWorld } from "../packages/world-gen/src";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const prompt = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")) ?? "village médiéval dans une forêt avec un château";
const out = resolve(flag("--out", "demo-output/bmap"));
mkdirSync(out, { recursive: true });

const specFile = flag("--spec", "");
const spec = specFile ? WorldSpecSchema.parse(JSON.parse(readFileSync(specFile, "utf8"))) : interpretPrompt(prompt).spec;
spec.terrain.groundMode = "voxels"; // a smooth surface: Blender sculpts it, no stepped slabs
const style = StyleBibleSchema.parse(styleFamilyToBible(STYLE_FAMILY_INDEX[spec.stylePreset] ?? STYLE_FAMILY_INDEX.stylized_mystical!));
const bake = generateWorld(spec, style);
const report = critiqueBake(bake, spec, style);

const t = bake.terrain;
const skip = new Set(["ground_block", "road_strip", "road_stripe"]);
const wet = Array.from(t.water).some((w) => !Number.isNaN(w));
const [vx, , vz] = bake.spawn.position;
const heading = Math.atan2(bake.spawn.lookAt[2] - vz, bake.spawn.lookAt[0] - vx);
const reach = Math.hypot(bake.spawn.lookAt[0] - vx, bake.spawn.lookAt[2] - vz);
const placements = bake.placements.filter((p) => {
  if (skip.has(p.prefab) || p.prefab === "stone_path_slab") return false;
  if (!wet && (p.prefab === "anchor" || p.prefab === "dock_post")) return false;
  // boulders and bushes between the player and the focal: the generator only clears trees
  if (p.category === "rock" || p.category === "vegetation") {
    const d = Math.hypot(p.position[0] - vx, p.position[2] - vz);
    const a = Math.atan2(p.position[2] - vz, p.position[0] - vx) - heading;
    const top = (bake.prefabs[p.prefab]?.[p.variant]?.bounds.max[1] ?? 0) * p.scale;
    if (top > 4 && d > 20 && d < reach * 0.95 && Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.16) return false;
  }
  return true;
});
const used = new Set(placements.map((p) => p.prefab));
const prefabs = Object.fromEntries(
  Object.entries(bake.prefabs)
    .filter(([id]) => used.has(id))
    .map(([id, vs]) => [id, vs.map((v) => ({ min: v.bounds.min, max: v.bounds.max, sink: v.sinkDepth, parts: v.parts.map((p) => ({ shape: p.shape, position: p.position, size: p.size, rotation: p.rotation, color: p.color, material: p.material, transparency: p.transparency ?? 0 })) }))]),
);
const focal = bake.landmarks.find((l) => l.role === "focal");
const village = bake.zones.find((z) => z.kind === "settlement");
const road = village && bake.paths.find((p) => p.kind === "road" && p.points.some((q) => Math.hypot(q[0] - village.center[0], q[1] - village.center[1]) < village.radius));
let street: [number, number][] | undefined;
if (village && road) {
  const pts = road.points.filter((q) => Math.hypot(q[0] - village.center[0], q[1] - village.center[1]) < village.radius * 1.1);
  if (pts.length > 4) street = [pts[0]! as [number, number], pts[Math.floor(pts.length * 0.75)]! as [number, number]];
}
const scene = {
  prompt,
  style: spec.stylePreset,
  architecture: style.architecture.style,
  seed: bake.meta.seed,
  palette: style.palette,
  materialNames: TERRAIN_MATERIALS,
  terrain: { width: t.width, depth: t.depth, cellSize: t.cellSize, origin: t.origin, heights: Array.from(t.heights, (h) => Math.round(h * 100) / 100), materials: Array.from(t.materials as ArrayLike<number>), water: Array.from(t.water, (w) => (Number.isNaN(w) ? null : w)) },
  paths: bake.paths.map((p) => ({ points: p.points, width: p.width })),
  flat: [
    [bake.spawn.position[0], bake.spawn.position[2], 30],
    ...bake.zones.filter((z) => z.kind === "settlement" || z.kind === "landmark").map((z) => [z.center[0], z.center[1], z.kind === "landmark" ? Math.min(z.radius, 40) : z.radius * 0.8]),
  ],
  prefabs,
  placements: placements.map((p) => ({ id: p.id, prefab: p.prefab, variant: p.variant, category: p.category, position: p.position, rotationY: p.rotationY, scale: p.scale, up: p.up, zone: p.zone, block: p.category === "vegetation" || p.prefab === "stone" ? 0 : (bake.prefabs[p.prefab]?.[p.variant]?.footprintRadius ?? 1) * p.scale })),
  spawn: bake.spawn,
  focal: focal?.position,
  village: village && { center: village.center, radius: village.radius, street },
  lighting: bake.lighting,
};
const sceneFile = join(out, "scene.json");
writeFileSync(sceneFile, JSON.stringify(scene));
console.log(`layout ${report.score}/100, ${placements.length} placements, style ${spec.stylePreset}`);

const blender = ["5.3", "5.2", "5.1", "5.0", "4.5"].map((v) => `C:/Program Files/Blender Foundation/Blender ${v}/blender.exe`).find(existsSync);
if (!blender) throw new Error("Blender not found");
const r = spawnSync(blender, ["-b", "--factory-startup", "--disable-autoexec", "--python-exit-code", "1", "--python", resolve("packages/blender-map/python/build_map.py"), "--", sceneFile, out, "--views", flag("--views", "spawn,landmark,village,wide"), "--samples", flag("--samples", "48"), ...(args.includes("--export") ? ["--export"] : []), ...(args.includes("--sheet") ? ["--sheet", flag("--sheet", "plain")] : [])], { encoding: "utf8", maxBuffer: 1 << 28 });
const lines = `${r.stdout}\n${r.stderr}`.split("\n");
console.log(lines.filter((l) => /^WF |Error|Traceback|File ".*wf_|File ".*build_map/.test(l)).slice(-40).join("\n"));
process.exit(r.status ?? 1);
