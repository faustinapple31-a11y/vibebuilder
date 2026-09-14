---
name: release
description: "Finish a WorldForge change safely: sync the roblox-ts template into the exporter, bump TEMPLATE_VERSION when the framework changed, typecheck the monorepo, run the test suite, build a demo project from a prompt and compile it with rbxtsc, update the docs (README, WORLD_GENERATION, TAXONOMY, AGENT_SYSTEM, ROBLOX_PIPELINE, QUALITY_SYSTEM), update memory notes, and commit with the project's conventions. Use before committing, when asked to 'finish', 'ship', 'commit', 'release' or 'clean up' a piece of work."
---

# Release checklist

1. **Template** — anything under `templates/roblox-ts-project/` changed?
   `npx tsx scripts/sync-template.ts` (regenerates `packages/roblox-export/src/template-files.generated.ts`).
   New framework file → add it to `FRAMEWORK_TEMPLATE_FILES`; framework shape changed (new system, remote,
   config block, skill) → bump `TEMPLATE_VERSION` + the changelog comment in `packages/roblox-export/src/export.ts`
   (existing projects are upgraded when opened: `apps/desktop/src/lib/templateUpgrade.ts`).
2. **Typecheck** — `npx tsc -b tsconfig.json` (clean).
3. **Tests** — `npx vitest run` (72+ tests: taxonomy, layouts × styles, generator determinism / partial
   regeneration, prefab connectivity for all 34 styles, exporter / template upgrade / game files).
4. **Generated project compiles** — `npx tsx scripts/demo-prompt.ts "<prompt exercising the change>" --build --out demo-output/<name>`
   (runs `npm install`, `npx rbxtsc`, `rojo build`); fix template errors with the `roblox-ts-pitfalls` rules.
   `--open` opens the `.rbxl` in Studio for a look (`studio-verify` skill for a scripted check).
5. **Docs** — `README.md` (features / lists), `WORLD_GENERATION.md` (pipeline), `TAXONOMY.md` (styles, kits,
   genres, layouts, systems), `AGENT_SYSTEM.md` (roles, prompts, skills), `ROBLOX_PIPELINE.md` (template,
   systems, Studio, Open Cloud), `QUALITY_SYSTEM.md` (critic). Keep them factual; update the tables you touched.
6. **Memory** — `~/.claude/projects/<project>/memory/worldforge-project-state.md` for durable facts (commit,
   what exists, how to run); `tooling-gotchas.md` / `studio-mcp-workflow.md` for new pitfalls.
7. **Commit** — one commit per coherent change, imperative summary line, body listing the user-visible
   effects; end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Never commit `demo-output/`,
   build artefacts, `.env`, keys or `tsconfig.tsbuildinfo`.
8. **Dev app** — if `tauri dev` is running, a template sync or an `export.ts` change forces a full Vite reload:
   re-open the project before driving it over CDP.
