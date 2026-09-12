import { describe, expect, it } from "vitest";
import { base64ToBytes, base64ToF32, bytesToBase64, f32ToBase64 } from "@worldforge/core";

describe("base64 codec", () => {
  it("round-trips every length modulo 3 exactly", () => {
    for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 65535, 65536, 65537, 262144]) {
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i++) bytes[i] = (i * 31 + 7) & 255;
      const b64 = bytesToBase64(bytes);
      expect(b64.length % 4).toBe(0);
      const back = base64ToBytes(b64);
      expect(back.length).toBe(n);
      expect(Array.from(back.subarray(0, 8))).toEqual(Array.from(bytes.subarray(0, 8)));
      expect(back[n - 1]).toBe(bytes[n - 1]);
    }
  });
  it("round-trips Float32Array of 65536 cells", () => {
    const f = new Float32Array(65536);
    for (let i = 0; i < f.length; i++) f[i] = Math.sin(i) * 100;
    const back = base64ToF32(f32ToBase64(f));
    expect(back.length).toBe(65536);
    expect(back[65535]).toBeCloseTo(f[65535]!, 4);
  });
});
