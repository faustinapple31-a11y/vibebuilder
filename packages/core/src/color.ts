export type RGB = [number, number, number]; // 0..1
export type HSL = [number, number, number]; // h 0..360, s 0..1, l 0..1

export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [1, 0, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex(rgb: RGB): string {
  const c = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

export function rgbToHsl([r, g, b]: RGB): HSL {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  return [h * 60, s, l];
}

export function hslToRgb([h, s, l]: HSL): RGB {
  const hh = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(hh + 1 / 3), f(hh), f(hh - 1 / 3)];
}

export function mixHex(a: string, b: string, t: number): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  return rgbToHex([ra[0] + (rb[0] - ra[0]) * t, ra[1] + (rb[1] - ra[1]) * t, ra[2] + (rb[2] - ra[2]) * t]);
}

/** Jitter hue/saturation/lightness of a hex color. Amounts: hue in degrees, s/l in 0..1 units. */
export function jitterHex(hex: string, dh: number, ds: number, dl: number): string {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(
    hslToRgb([h + dh, Math.max(0, Math.min(1, s + ds)), Math.max(0.02, Math.min(0.98, l + dl))]),
  );
}

export function lightenHex(hex: string, amount: number): string {
  return jitterHex(hex, 0, 0, amount);
}

export function desaturateHex(hex: string, amount: number): string {
  return jitterHex(hex, 0, -amount, 0);
}

export function colorDistance(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  return Math.hypot(ra[0] - rb[0], ra[1] - rb[1], ra[2] - rb[2]);
}

/** Roblox Color3 representation used in exports (0..255 ints). */
export function hexToColor3(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
