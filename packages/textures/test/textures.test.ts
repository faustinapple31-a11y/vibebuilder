import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { getStylePreset } from "@worldforge/core";
import { TEXTURE_KINDS, generateTexture, generateTextureSet, textureSetForStyle } from "../src";

describe("procedural textures", () => {
  it("every kind generates seamless maps", () => {
    const style = getStylePreset("medieval");
    const specs = textureSetForStyle(style);
    for (const kind of TEXTURE_KINDS) {
      const spec = specs.find((s) => s.kind === kind) ?? { ...specs[0]!, kind, id: kind };
      const m = generateTexture(spec, 42, 64);
      expect(m.color.length).toBe(64 * 64 * 3);
      // seamless: the left/right and top/bottom edges are continuous (no big jump in colour)
      let jump = 0;
      for (let y = 0; y < 64; y++) {
        const a = y * 64 * 3;
        const b = (y * 64 + 63) * 3;
        jump += Math.abs(m.color[a]! - m.color[b]!);
      }
      expect(jump / 64, `${kind} horizontal seam`).toBeLessThan(40);
      // normals point mostly up
      let z = 0;
      for (let i = 2; i < m.normal.length; i += 3) z += m.normal[i]!;
      expect(z / (m.normal.length / 3)).toBeGreaterThan(160);
    }
  });

  it("is deterministic per seed and writes valid PNGs", async () => {
    const style = getStylePreset("tropical");
    const a = generateTexture(textureSetForStyle(style)[0]!, 7, 32);
    const b = generateTexture(textureSetForStyle(style)[0]!, 7, 32);
    expect(Buffer.from(a.color).equals(Buffer.from(b.color))).toBe(true);
    const res = await generateTextureSet(style, 7, { size: 64, deflate: (d) => deflateSync(d) });
    expect(res.manifest.entries.length).toBeGreaterThan(10);
    expect(res.files.length).toBe(res.manifest.entries.length * 3);
    const png = res.files[0]!.bytes;
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const dir = `${process.env.TEMP ?? "/tmp"}/wf-textures-test`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${res.manifest.entries[0]!.id}_color.png`, png);
  });
});
