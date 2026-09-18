import { clamp, lerp, lightenHex, mixHex, type RobloxLightingSettings, type TerrainMaterial, type WeatherKind } from "@worldforge/core";
import type { GenContext } from "../context";

/** Roblox default terrain material colors (Terrain:GetMaterialColor), the base the palette tints. */
const ROBLOX_TERRAIN_DEFAULTS: Record<Exclude<TerrainMaterial, "Air" | "Water">, string> = {
  Grass: "#6a7f3f",
  LeafyGrass: "#737b3c",
  Ground: "#66584e",
  Mud: "#3a2e24",
  Rock: "#666666",
  Slate: "#3f5c66",
  Sand: "#8f8f5e",
  Snow: "#c3d5e1",
  Cobblestone: "#84805e",
  Basalt: "#1e1e1e",
  Limestone: "#cebfa1",
  Sandstone: "#88643c",
  Ice: "#81a3c0",
  Asphalt: "#737373",
  Pavement: "#94908d",
  CrackedLava: "#c8401a",
  Glacier: "#a9c9e0",
  Salt: "#e6e2d8",
  Concrete: "#9a9892",
  Brick: "#8a5a48",
  WoodPlanks: "#8a6a44",
};

/** Palette-driven terrain colors: each material blends toward the closest palette entry by `tint`. */
function terrainColors(ctx: GenContext): Partial<Record<TerrainMaterial, string>> {
  const p = ctx.style.palette;
  const tint = ctx.style.environment.terrainTint;
  const d = ROBLOX_TERRAIN_DEFAULTS;
  const mix = (base: string, target: string, k = tint) => mixHex(base, target, clamp(k, 0, 1));
  const grass = mix(d.Grass, p.foliageAlt);
  return {
    Grass: grass,
    LeafyGrass: mix(d.LeafyGrass, p.foliage),
    Ground: mix(d.Ground, p.ground),
    Mud: mix(d.Mud, mixHex(p.ground, "#000000", 0.35)),
    Rock: mix(d.Rock, p.stone),
    Slate: mix(d.Slate, mixHex(p.stone, "#000000", 0.2)),
    Basalt: mix(d.Basalt, mixHex(p.stone, "#000000", 0.6), tint * 0.6),
    Sand: mix(d.Sand, lightenHex(mixHex(p.ground, "#e8d8a8", 0.6), 0.1), tint * 0.8),
    Sandstone: mix(d.Sandstone, mixHex(p.ground, p.stone, 0.4), tint * 0.7),
    Limestone: mix(d.Limestone, lightenHex(p.stone, 0.25), tint * 0.7),
    Cobblestone: mix(d.Cobblestone, p.stone, tint * 0.8),
    Pavement: mix(d.Pavement, lightenHex(p.stone, 0.15), tint * 0.5),
    Asphalt: mix(d.Asphalt, "#2e2e33", tint * 0.5),
    Snow: mix(d.Snow, mixHex("#f2f6fb", p.sky, 0.12), tint * 0.5),
    Ice: mix(d.Ice, mixHex("#a8d0ea", p.water, 0.3), tint * 0.5),
    // the rest of the material list: a material with no entry here paints a green slab in parts mode
    // (`colors[mat] ?? "#6a7f3f"`), so every one of them carries a colour whether a biome uses it today
    // or not — a green lava field is not a bug anyone should have to find twice
    CrackedLava: mix(d.CrackedLava, mixHex("#ff6a20", p.glow, 0.4), tint * 0.4),
    Glacier: mix(d.Glacier, mixHex("#bfe0f2", p.water, 0.25), tint * 0.5),
    Salt: mix(d.Salt, lightenHex(p.ground, 0.45), tint * 0.5),
    Concrete: mix(d.Concrete, lightenHex(p.stone, 0.1), tint * 0.5),
    Brick: mix(d.Brick, mixHex(p.wood, "#9a4a38", 0.5), tint * 0.6),
    WoodPlanks: mix(d.WoodPlanks, p.wood, tint * 0.8),
  };
}

const WEATHER_COLORS: Record<WeatherKind, string> = {
  none: "#ffffff",
  rain: "#b8c8e0",
  snow: "#f4f8ff",
  ash: "#5a5550",
  dust: "#c8b48a",
  petals: "#ffb7c9",
  spores: "#b48cff",
  fireflies: "#ffe680",
  embers: "#ff8c3a",
  bubbles: "#cfe9ff",
  leaves: "#c9853a",
  sandstorm: "#d9b76a",
};

/** Weather: the style's default, overridden by the mood (storm → rain / snow, eerie → spores), off for `none`. */
function weatherFor(ctx: GenContext): RobloxLightingSettings["weather"] {
  const env = ctx.style.environment;
  const mood = ctx.spec.lighting.mood;
  const cold = ctx.style.kits.vegetation === "arctic" || env.snowLine <= 0.4;
  let kind: WeatherKind = env.weather;
  let intensity = env.weatherIntensity;
  if (mood === "stormy") {
    kind = cold ? "snow" : "rain";
    intensity = Math.max(intensity, 0.75);
  } else if (mood === "eerie" && kind === "none") {
    kind = "spores";
    intensity = 0.3;
  }
  const night = ctx.spec.lighting.timeOfDay < 5.5 || ctx.spec.lighting.timeOfDay > 19;
  if (night && kind === "none" && (ctx.style.kits.vegetation === "temperate" || ctx.style.kits.vegetation === "mushroom" || ctx.style.kits.vegetation === "jungle")) {
    kind = "fireflies";
    intensity = 0.35;
  }
  const color = kind === "spores" ? mixHex(WEATHER_COLORS.spores, ctx.style.palette.glow, 0.6) : kind === "petals" ? mixHex(WEATHER_COLORS.petals, ctx.style.palette.accent, 0.35) : WEATHER_COLORS[kind];
  return { kind, intensity: clamp(intensity, 0, 1), color };
}

/**
 * Stage: lighting & atmosphere → Roblox Lighting settings (also consumed by the viewer).
 * The StyleBible gives the base; the WorldSpec mood/time/fog modulate it.
 */
export function computeLighting(ctx: GenContext): RobloxLightingSettings {
  const { spec, style } = ctx;
  const L = style.lighting;
  const F = style.fog;
  const mood = spec.lighting.mood;
  const night = spec.lighting.timeOfDay < 5.5 || spec.lighting.timeOfDay > 19;
  const moodMul: Record<string, { bright: number; sat: number; fog: number; ambientShift: string }> = {
    bright: { bright: 1.5, sat: 0.1, fog: 0.6, ambientShift: "#ffffff" },
    soft: { bright: 1.0, sat: 0, fog: 1.0, ambientShift: "#eef2ff" },
    golden: { bright: 1.2, sat: 0.15, fog: 0.9, ambientShift: "#ffd9a0" },
    overcast: { bright: 0.8, sat: -0.15, fog: 1.3, ambientShift: "#c9d0da" },
    moonlit: { bright: 0.85, sat: -0.08, fog: 1.1, ambientShift: "#8fa0d0" },
    dusk: { bright: 0.75, sat: 0.05, fog: 1.1, ambientShift: "#e0a080" },
    dawn: { bright: 0.85, sat: 0.05, fog: 1.2, ambientShift: "#ffc8b0" },
    eerie: { bright: 0.5, sat: -0.3, fog: 1.5, ambientShift: "#8ab0a0" },
    stormy: { bright: 0.6, sat: -0.25, fog: 1.4, ambientShift: "#8a90a8" },
  };
  const m = moodMul[mood] ?? moodMul.soft!;
  const env = style.environment;
  const space = style.id === "space_station" || style.kits.vegetation === "none" && style.kits.biomes.includes("moon");
  const underwater = style.id === "underwater";
  const cloudCover = mood === "stormy" ? Math.max(env.cloudCover, 0.9) : mood === "overcast" ? Math.max(env.cloudCover, 0.75) : mood === "bright" ? Math.min(env.cloudCover, 0.3) : env.cloudCover;
  const brightness = clamp(L.brightness * m.bright * (0.4 + spec.lighting.brightness * 1.2), 0.1, 6);
  const fogMul = m.fog * (0.4 + spec.atmosphere.fogDensity * 1.6);
  const fogColor = mixHex(F.color, spec.atmosphere.fogColor, 0.5);
  const ambient = mixHex(L.ambient, m.ambientShift, 0.2);
  const outdoor = mixHex(L.outdoorAmbient, m.ambientShift, 0.25);
  return {
    clockTime: spec.lighting.timeOfDay,
    brightness: night ? Math.max(brightness, 1.6) : brightness,
    // Night scenes must stay readable: Roblox ambient terms carry the moonlight look, not darkness.
    ambient: night ? mixHex(ambient, "#9aa6d2", 0.5) : ambient,
    outdoorAmbient: night ? mixHex(outdoor, "#aab6e0", 0.55) : outdoor,
    colorShiftTop: mixHex(L.sunColor, m.ambientShift, 0.3),
    colorShiftBottom: mixHex(fogColor, "#000000", 0.4),
    exposureCompensation: L.exposure + (night ? 1.45 : 0),
    globalShadows: spec.lighting.shadows,
    shadowSoftness: L.shadowSoftness,
    fogStart: F.start / fogMul,
    fogEnd: clamp(F.end / fogMul, 120, 5000),
    fogColor,
    atmosphere: {
      density: clamp(F.atmosphereDensity * lerp(0.6, 1.4, spec.atmosphere.fogDensity), 0, 0.38),
      offset: clamp(0.15 + spec.atmosphere.haze * 0.5, 0, 1),
      color: fogColor,
      decay: mixHex(fogColor, spec.atmosphere.skyTint, 0.5),
      glare: F.glare,
      haze: clamp(F.haze * lerp(0.5, 1.6, spec.atmosphere.haze), 0, 10),
    },
    colorCorrection: {
      saturation: clamp(L.colorCorrection.saturation + m.sat, -1, 1),
      contrast: L.colorCorrection.contrast,
      tintColor: L.colorCorrection.tint,
      brightness: night ? 0.04 : 0,
    },
    bloom: { intensity: night ? 0.5 : 0.25, size: 24, threshold: night ? 0.85 : 1.2 },
    sunRays: { intensity: mood === "golden" || mood === "dawn" ? 0.18 : night ? 0.02 : 0.06, spread: 0.6 },
    sky: { sunAngularSize: 18, moonAngularSize: night ? 15 : 11, starCount: night ? 3000 : 1500, celestialBodies: !space },
    technology: "ShadowMap",
    terrain: {
      waterColor: mixHex(style.palette.water, night ? "#1a2a44" : "#3c7fa8", night ? 0.45 : 0.3),
      waterTransparency: night ? 0.55 : 0.45,
      waterReflectance: night ? 0.75 : 0.6,
      waterWaveSize: 0.12,
      waterWaveSpeed: 7,
    },
    terrainColors: terrainColors(ctx),
    terrainDecoration: env.grassDecoration && !underwater,
    clouds: {
      enabled: !space && !underwater && cloudCover > 0.02,
      cover: clamp(cloudCover, 0, 1),
      density: clamp(0.25 + cloudCover * 0.5 + (mood === "stormy" ? 0.2 : 0), 0, 1),
      color: mood === "stormy" || mood === "eerie" ? "#8a8f9a" : mood === "overcast" ? "#c4c8d0" : mood === "golden" || mood === "dusk" ? "#ffd8b0" : mood === "dawn" ? "#ffc9c0" : night ? "#8a94b8" : "#ffffff",
    },
    weather: weatherFor(ctx),
  };
}
