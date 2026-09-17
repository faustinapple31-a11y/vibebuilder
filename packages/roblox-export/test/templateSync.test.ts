import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TEMPLATE_FILES } from "../src/template-files.generated";

/**
 * The embedded template must be byte-identical to `templates/roblox-ts-project/**` (line endings
 * aside): the exporter ships these strings to every generated project, so a stale — or worse, a
 * hand-patched — entry breaks `rbxtsc` for real users. Run `npx tsx scripts/sync-template.ts`.
 */
const templateDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "templates", "roblox-ts-project");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "out" || entry === "build") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const lf = (s: string) => s.replace(/\r\n/g, "\n");

describe("embedded roblox-ts template", () => {
  const onDisk = walk(templateDir).map((f) => relative(templateDir, f).replace(/\\/g, "/"));

  it("embeds exactly the files of templates/roblox-ts-project", () => {
    expect(Object.keys(TEMPLATE_FILES).sort()).toEqual([...onDisk].sort());
  });

  it("embeds each file's content unchanged", () => {
    for (const rel of onDisk) {
      const expected = lf(readFileSync(join(templateDir, rel), "utf8"));
      expect(lf(TEMPLATE_FILES[rel] ?? ""), rel).toBe(expected);
    }
  });

  it("carries no raw carriage return (a CRLF checkout must not change what projects receive)", () => {
    for (const [rel, content] of Object.entries(TEMPLATE_FILES)) {
      expect(content.includes("\r"), `${rel} contains a raw CR`).toBe(false);
    }
  });

  it("scaffolds a project whose sources are the template's, verbatim", () => {
    // regression: a line-ending rewrite of the generated module once turned an escaped newline in
    // `Array.join` into a real newline inside the string literal, which made every scaffolded
    // project fail to compile. The content check above is what catches it; this states the intent.
    const progression = TEMPLATE_FILES["src/systems/Progression.ts"]!;
    expect(progression.includes(String.raw`join("\n")`)).toBe(true);
    expect(progression.split("\n").some((l) => l.trimEnd().endsWith('join("'))).toBe(false);
  });
});
