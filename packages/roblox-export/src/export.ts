import {
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

/** The engine runtime files of the template (world builder, decode, prefab factory, effects) for an existing project. */
export function runtimeTemplateFiles(opts: ScaffoldOptions): ProjectFile[] {
  return scaffoldProjectFiles(opts).filter((f) => RUNTIME_TEMPLATE_PREFIXES.some((p) => f.path.startsWith(p)));
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
    locks: { terrain: false, water: false, roads: false, landmarks: false, buildings: false, vegetation: false, props: false, lighting: false },
    roblox: {},
    agents: { defaultProvider: "claude-code", roleProviders: {}, permissionMode: "acceptEdits", runtime: "host" },
    qa: { maxIterations: 3, autoFix: true, useVision: true, stopOnScore: 85 },
  };
  files.push({ path: "worldforge.json", content: JSON.stringify(meta, null, 2) + "\n" });
  files.push({ path: "assets/world/.gitkeep", content: "" });
  files.push({ path: "assets/models/.gitkeep", content: "" });
  files.push({ path: "design/.gitkeep", content: "" });
  return files;
}

export interface ExportWorldOptions {
  bake: WorldBake;
  spec: WorldSpec;
  style: StyleBible;
  projectSlug: string;
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
  files.push({ path: "default.project.json", content: JSON.stringify(buildRojoProject(opts.projectSlug, bake), null, 2) + "\n" });
  return files;
}

export function buildRojoProject(slug: string, bake: WorldBake): Record<string, unknown> {
  const base = JSON.parse(TEMPLATE_FILES["default.project.json"]!.replaceAll("__PROJECT_SLUG__", slug)) as { name: string; tree: Record<string, unknown> };
  const L = bake.lighting;
  const rgb = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const worldSize = Math.max(bake.terrain.width, bake.terrain.depth) * bake.terrain.cellSize;
  base.tree["Lighting"] = {
    $className: "Lighting",
    $properties: {
      Technology: "Future",
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
      StreamingMinRadius: 128,
      StreamingTargetRadius: Math.round(Math.min(2048, Math.max(512, worldSize * 0.9))),
    },
  };
  return base;
}
