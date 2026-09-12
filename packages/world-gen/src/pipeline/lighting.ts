import { clamp, lerp, lightenHex, mixHex, type RobloxLightingSettings } from "@worldforge/core";
import type { GenContext } from "../context";

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
    sky: { sunAngularSize: 18, moonAngularSize: night ? 15 : 11, starCount: night ? 3000 : 1500 },
    technology: "ShadowMap",
    terrain: {
      waterColor: mixHex(style.palette.water, night ? "#1a2a44" : "#3c7fa8", night ? 0.45 : 0.3),
      waterTransparency: night ? 0.55 : 0.45,
      waterReflectance: night ? 0.75 : 0.6,
      waterWaveSize: 0.12,
      waterWaveSpeed: 7,
    },
  };
  void lightenHex;
}
