import { base64ToF32, type MeshData,
  serializeBake,
  slugify,
  type ProjectMeta,
  type StyleBible,
  type WorldBake,
  type WorldSpec,
} from "@worldforge/core";
import { TEMPLATE_FILES } from "./template-files.generated";

export interface ProjectFile {
  /** Path relative to the project root, POSIX separators. */
  path: string;
  content: string;
}

export interface ScaffoldOptions {
  projectName: string;
  projectId: string;
  stylePreset: string;
  createdAt?: string;
}

/**
 * Files for a brand-new project (roblox-ts + Rojo template + worldforge.json).
 * Pure function: callers write the files (Tauri fs / Node fs).
 */
/** Prefixes of the WorldForge-owned runtime (safe to overwrite on every build; agents edit the other folders). */
export const RUNTIME_TEMPLATE_PREFIXES = ["src/shared/world/", "src/world/"];

/**
 * Bumped whenever the gameplay framework of the template changes shape (new systems, remotes, generated
 * data modules). Projects scaffolded with an older version get the framework files re-applied once
 * (`templateUpgradeFiles`), with backups of any file that diverged.
 *   2 — shop / monetization / NPCs / animations / audio systems (Game + Toolbox tabs).
 *   3 — universal genre systems (combat, enemies, checkpoints/obby, tycoon, simulator, rounds/teams,
 *       racing/vehicles, tower defense, farming/mining/pets/housing, modes) + zone markers with meta.
 *   4 — environment: weather particle layer (client), clouds / terrain colors from the bake, opening
 *       doors (ProximityPrompt), settlement dressing zones (walls, docks, graveyard), project skills.
 *   5 — terrain v5: procedural meshes (client MeshRender + shared meshFactory), custom textures
 *       (shared/textures.ts + world/Materials.ts), terrain voxel ops, building snap on the voxel surface.
 *   6 — uploaded texture sets become MaterialVariants at build time (assets/materials + MaterialService
 *       overrides in the Rojo project; world/Materials.ts only re-asserts the overrides), mesh tree crowns.
 */
export const TEMPLATE_VERSION = 6;

/** Framework files re-applied on a template upgrade (agents may edit them afterwards). */
export const FRAMEWORK_TEMPLATE_FILES = [
  "src/server/main.server.ts",
  "src/client/main.client.ts",
  "src/shared/net.ts",
  "src/shared/anim/keyframes.ts",
  "src/shared/zones.ts",
  "src/systems/Combat.ts",
  "src/systems/Enemies.ts",
  "src/systems/Checkpoints.ts",
  "src/systems/Progression.ts",
  "src/systems/Tycoon.ts",
  "src/systems/Simulator.ts",
  "src/systems/Rounds.ts",
  "src/systems/Racing.ts",
  "src/systems/TowerDefense.ts",
  "src/systems/Economy.ts",
  "src/systems/Modes.ts",
  "src/systems/Doors.ts",
  "src/client/Weather.ts",
  "src/client/MeshRender.ts",
  "src/systems/PlayerData.ts",
  "src/systems/Survival.ts",
  "src/systems/Collectibles.ts",
  "src/systems/Shop.ts",
  "src/systems/Npcs.ts",
  "src/systems/Audio.ts",
  "src/ui/Hud.ts",
  "src/ui/ShopUi.ts",
];

/** The engine runtime files of the template (world builder, decode, prefab factory, effects) for an existing project. */
export function runtimeTemplateFiles(opts: ScaffoldOptions): ProjectFile[] {
  return scaffoldProjectFiles(opts).filter((f) => RUNTIME_TEMPLATE_PREFIXES.some((p) => f.path.startsWith(p)));
}

/**
 * Files to (re)write when a project's templateVersion is older than TEMPLATE_VERSION: the framework
 * files above plus every template file the project does not have yet (`existing` = current project
 * paths). Generated data modules (config/catalog/animations/audio/npcs) are produced from the GameSpec
 * and never touched here.
 */
export function templateUpgradeFiles(opts: ScaffoldOptions, existing: Set<string>): ProjectFile[] {
  return scaffoldProjectFiles(opts).filter((f) => {
    if (f.path === "worldforge.json" || f.path.endsWith(".gitkeep")) return false;
    if (RUNTIME_TEMPLATE_PREFIXES.some((p) => f.path.startsWith(p))) return false;
    if (FRAMEWORK_TEMPLATE_FILES.includes(f.path)) return true;
    // agent skills shipped with the project are framework docs: always refreshed
    if (f.path.startsWith(".claude/skills/worldforge-") || f.path === ".claude/skills/roblox-ts-pitfalls/SKILL.md") return true;
    if ((f.path.startsWith(".claude/") || f.path === "CLAUDE.md") && !existing.has(f.path)) return true;
    return f.path.startsWith("src/") && !existing.has(f.path);
  });
}

export function scaffoldProjectFiles(opts: ScaffoldOptions): ProjectFile[] {
  const slug = slugify(opts.projectName);
  const now = opts.createdAt ?? new Date().toISOString();
  const files: ProjectFile[] = [];
  for (const [path, raw] of Object.entries(TEMPLATE_FILES)) {
    files.push({ path, content: raw.replaceAll("__PROJECT_SLUG__", slug).replaceAll("__PROJECT_NAME__", opts.projectName.replaceAll('"', '\\"')) });
  }
  const meta: ProjectMeta = {
    id: opts.projectId,
    name: opts.projectName,
    version: "0.1.0",
    createdAt: now,
    updatedAt: now,
    stylePreset: opts.stylePreset as ProjectMeta["stylePreset"],
    currentWorld: "main",
    worldVersion: "v0.0",
    templateVersion: TEMPLATE_VERSION,
    locks: { terrain: false, water: false, roads: false, landmarks: false, buildings: false, vegetation: false, props: false, lighting: false },
    roblox: {},
    agents: { defaultProvider: "claude-code", roleProviders: {}, permissionMode: "acceptEdits", runtime: "host" },
    qa: { maxIterations: 3, autoFix: true, useVision: true, stopOnScore: 85 },
  };
  files.push({ path: "worldforge.json", content: JSON.stringify(meta, null, 2) + "\n" });
  files.push({ path: "assets/world/.gitkeep", content: "" });
  files.push({ path: "assets/materials/.gitkeep", content: "" });
  files.push({ path: "assets/models/.gitkeep", content: "" });
  files.push({ path: "design/.gitkeep", content: "" });
  return files;
}

export interface ExportWorldOptions {
  bake: WorldBake;
  spec: WorldSpec;
  style: StyleBible;
  projectSlug: string;
  /** MaterialService `<Material>Name` overrides of the uploaded texture sets (see @worldforge/textures materialOverrides). */
  materialOverrides?: Record<string, string>;
}

/**
 * Files that change whenever the world is (re)generated:
 * - assets/world/WorldBake.json (→ ModuleScript via Rojo)
 * - worlds/<id>/world.spec.json, style.bible.json
 * - default.project.json with Lighting/Workspace properties matching the bake
 */
export function exportWorldFiles(opts: ExportWorldOptions): ProjectFile[] {
  const { bake, spec, style } = opts;
  const json = serializeBake(bake);
  const files: ProjectFile[] = [];
  files.push({ path: "assets/world/WorldBake.json", content: JSON.stringify(json) });
  files.push({ path: `worlds/${spec.id}/world.spec.json`, content: JSON.stringify(spec, null, 2) + "\n" });
  files.push({ path: `worlds/${spec.id}/style.bible.json`, content: JSON.stringify(style, null, 2) + "\n" });
  files.push({ path: "default.project.json", content: JSON.stringify(buildRojoProject(opts.projectSlug, bake, opts.materialOverrides), null, 2) + "\n" });
  // procedural meshes as .obj (Studio import / Open Cloud upload → MeshPart asset ids)
  for (const variants of Object.values(bake.prefabs)) {
    for (const v of variants) {
      if (!v.meshes) continue;
      for (const [key, data] of Object.entries(v.meshes)) {
        files.push({ path: `assets/meshes/${v.id.replace(/[^a-z0-9_]+/gi, "_")}_${key}.obj`, content: meshToObj(data, `${v.id}/${key}`) });
      }
    }
  }
  return files;
}

/** Wavefront OBJ (flat-shaded triangle soup, Y up, studs). */
export function meshToObj(data: MeshData, name: string): string {
  const tris = base64ToF32(data.trianglesB64);
  const lines: string[] = [`# WorldForge procedural mesh ${name}`, `o ${name.replace(/[^a-z0-9_]+/gi, "_")}`];
  for (let i = 0; i < tris.length; i += 3) lines.push(`v ${tris[i]!.toFixed(4)} ${tris[i + 1]!.toFixed(4)} ${tris[i + 2]!.toFixed(4)}`);
  const n = tris.length / 9;
  for (let t = 0; t < n; t++) lines.push(`f ${t * 3 + 1} ${t * 3 + 2} ${t * 3 + 3}`);
  return lines.join("\n") + "\n";
}

export function buildRojoProject(slug: string, bake: WorldBake, materialOverrides: Record<string, string> = {}): Record<string, unknown> {
  const base = JSON.parse(TEMPLATE_FILES["default.project.json"]!.replaceAll("__PROJECT_SLUG__", slug)) as { name: string; tree: Record<string, unknown> };
  // custom textures: MaterialVariants live in assets/materials (Rojo model files), overrides are service properties
  base.tree["MaterialService"] = { $className: "MaterialService", $path: "assets/materials", $properties: materialOverrides };
  const L = bake.lighting;
  const rgb = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const worldSize = Math.max(bake.terrain.width, bake.terrain.depth) * bake.terrain.cellSize;
  base.tree["Lighting"] = {
    $className: "Lighting",
    $properties: {
      Technology: L.technology ?? "ShadowMap",
      ClockTime: L.clockTime,
      Brightness: L.brightness,
      Ambient: rgb(L.ambient),
      OutdoorAmbient: rgb(L.outdoorAmbient),
      ColorShift_Top: rgb(L.colorShiftTop),
      ColorShift_Bottom: rgb(L.colorShiftBottom),
      ExposureCompensation: L.exposureCompensation,
      GlobalShadows: L.globalShadows,
      ShadowSoftness: L.shadowSoftness,
      FogStart: L.fogStart,
      FogEnd: L.fogEnd,
      FogColor: rgb(L.fogColor),
      EnvironmentDiffuseScale: 0.6,
      EnvironmentSpecularScale: 0.4,
    },
    WorldForgeAtmosphere: {
      $className: "Atmosphere",
      $properties: { Density: L.atmosphere.density, Offset: L.atmosphere.offset, Color: rgb(L.atmosphere.color), Decay: rgb(L.atmosphere.decay), Glare: L.atmosphere.glare, Haze: L.atmosphere.haze },
    },
    WorldForgeColorCorrection: {
      $className: "ColorCorrectionEffect",
      $properties: { Saturation: L.colorCorrection.saturation, Contrast: L.colorCorrection.contrast, TintColor: rgb(L.colorCorrection.tintColor), Brightness: L.colorCorrection.brightness },
    },
    WorldForgeBloom: { $className: "BloomEffect", $properties: { Intensity: L.bloom.intensity, Size: L.bloom.size, Threshold: L.bloom.threshold } },
    WorldForgeSunRays: { $className: "SunRaysEffect", $properties: { Intensity: L.sunRays.intensity, Spread: L.sunRays.spread } },
    WorldForgeSky: { $className: "Sky", $properties: { SunAngularSize: L.sky.sunAngularSize, MoonAngularSize: L.sky.moonAngularSize, StarCount: L.sky.starCount } },
  };
  base.tree["Workspace"] = {
    $className: "Workspace",
    $properties: {
      FilteringEnabled: true,
      StreamingEnabled: true,
      Terrain: undefined,
      StreamingMinRadius: 128,
      StreamingTargetRadius: Math.round(Math.min(2048, Math.max(512, worldSize * 0.9))),
    },
  };
  return base;
}
