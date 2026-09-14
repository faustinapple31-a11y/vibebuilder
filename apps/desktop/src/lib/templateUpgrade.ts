import type { ProjectMeta } from "@worldforge/core";
import { TEMPLATE_VERSION, scaffoldProjectFiles, templateUpgradeFiles } from "@worldforge/roblox-export";
import { fs, path } from "./tauri";

/**
 * One-time framework upgrade for projects scaffolded with an older template (TEMPLATE_VERSION):
 * rewrites the WorldForge framework files (shop / NPC / audio systems, HUD, bootstraps, remotes) and
 * adds the ones the project lacks. Files that diverged from the template are backed up first under
 * `.wf-backup/<timestamp>/`. Runs at project open (before agents touch anything) and as a safety
 * net before compiling. Returns a log; empty when nothing was needed.
 */
export async function upgradeProjectTemplate(project: { path: string; row: { name: string; id: string }; meta: ProjectMeta }): Promise<string[]> {
  const scaffold = { projectName: project.row.name, projectId: project.row.id, stylePreset: project.meta.stylePreset };
  if ((project.meta.templateVersion ?? 1) >= TEMPLATE_VERSION) {
    // same framework version but the agent skills are missing (project upgraded before they shipped): add them only
    if (await fs.exists(path.join(project.path, ".claude", "skills", "worldforge-world", "SKILL.md"))) return [];
    const docs = scaffoldProjectFiles(scaffold).filter((f) => f.path.startsWith(".claude/") || f.path === "CLAUDE.md");
    const present = new Set<string>();
    for (const f of docs) if (await fs.exists(path.join(project.path, f.path))) present.add(f.path);
    const toWrite = docs.filter((f) => !present.has(f.path) || f.path.startsWith(".claude/skills/worldforge-"));
    if (toWrite.length === 0) return [];
    await fs.writeFiles(project.path, toWrite.map((f) => [f.path, f.content]));
    return [`agent skills added (${toWrite.length} files)`];
  }
  const srcDir = path.join(project.path, "src");
  const existing = new Set((await fs.exists(srcDir)) ? (await fs.walk(srcDir, 5000)).map((p) => `src/${p}`) : []);
  const files = templateUpgradeFiles(scaffold, existing);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const log: string[] = [];
  for (const f of files) {
    if (!existing.has(f.path)) continue;
    const current = await fs.readText(path.join(project.path, f.path)).catch(() => "");
    if (current && current !== f.content) {
      await fs.writeText(path.join(project.path, ".wf-backup", stamp, f.path), current);
      log.push(`backup ${f.path} → .wf-backup/${stamp}/`);
    }
  }
  await fs.writeFiles(project.path, files.map((f) => [f.path, f.content]));
  log.push(`template upgraded to v${TEMPLATE_VERSION} (${files.length} files)`);
  return log;
}
