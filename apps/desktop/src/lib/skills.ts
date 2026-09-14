import { fs, path } from "@/lib/tauri";

/** A Claude Code skill (`<dir>/<name>/SKILL.md` with YAML frontmatter `name` / `description`). */
export interface SkillInfo {
  name: string;
  description: string;
  path: string;
  scope: "project" | "user";
}

function frontmatter(md: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  const out: Record<string, string> = {};
  if (!m) return out;
  let key = "";
  for (const raw of m[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(raw);
    if (kv) {
      key = kv[1]!;
      out[key] = kv[2]!.replace(/^['"]|['"]$/g, "").replace(/^>-?\s*$/, "");
    } else if (key && /^\s+\S/.test(raw)) {
      out[key] = `${out[key] ?? ""} ${raw.trim()}`.trim();
    }
  }
  return out;
}

/** Skills found under `<root>/.claude/skills` (project) or `~/.claude/skills` (user). Missing folders → []. */
export async function listSkills(root: string, scope: SkillInfo["scope"]): Promise<SkillInfo[]> {
  const dir = path.join(root, ".claude", "skills");
  if (!(await fs.exists(dir).catch(() => false))) return [];
  const entries = await fs.listDir(dir).catch(() => []);
  const out: SkillInfo[] = [];
  for (const e of entries) {
    if (!e.is_dir) continue;
    const file = path.join(e.path, "SKILL.md");
    if (!(await fs.exists(file).catch(() => false))) continue;
    const md = await fs.readText(file).catch(() => "");
    const fm = frontmatter(md);
    out.push({ name: fm.name || e.name, description: (fm.description ?? "").replace(/\s+/g, " ").trim(), path: file, scope });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
