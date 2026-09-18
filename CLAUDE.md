# WorldForge AI — repository guide

Tauri 2 + React desktop app and TypeScript monorepo that turns a natural-language prompt into a complete
Roblox game (WorldSpec → procedural world → roblox-ts project → Rojo → Studio via MCP → Open Cloud).

```
packages/core          schemas (WorldSpec, StyleBible, GameSpec), taxonomy (34 styles × 28 genres), bake types, presets
packages/prefabs       PartList prefab builders (vegetation, rocks, buildings with interiors, props per kit, landmarks, dressing)
packages/world-gen     deterministic generator: terrain → water → biomes → sites → landmarks → spawn → roads → buildings → dressing → layout → vegetation → props → lighting → optimize
packages/quality       metrics critic (scores + spec_patch fixes)
packages/roblox-export template scaffolding, WorldBake export, Rojo project, generated game files
packages/roblox-cloud  Open Cloud client (publish, assets, passes/products)
packages/agents        roles, orchestrator, CLI providers (Claude Code, Codex, Gemini…), local rule-based interpreter
packages/ai-providers  image / mesh / audio providers
apps/desktop           Tauri app (React 19, Zustand, R3F viewer, Studio MCP bridge)
templates/roblox-ts-project   the project every generated game starts from (synced into roblox-export by scripts/sync-template.ts)
```

## Commands

- `npx tsc -b tsconfig.json` — typecheck everything (must be clean before a commit).
- `npx vitest run` — tests (taxonomy, layouts, generator, connectivity of every prefab in every style, exporter).
- `npx tsx scripts/sync-template.ts` — after **any** change under `templates/` (regenerates
  `packages/roblox-export/src/template-files.generated.ts`; triggers a full Vite reload of the dev app).
- `npx tsx scripts/preview-ui-kits.ts [--kit <id>]` — renders the UI kit libraries as a mock screen sheet
  (`demo-output/ui-kits.html`) to review a look without Studio.
- `npx tsx scripts/preview-map.ts "<prompt>" [--panel --width N --out dir]` — renders a generated world
  to PNGs (spawn / landmark / village / wide) with a small software rasterizer, plus an `index.html` sheet:
  how a map change actually *looks*, without Studio.
- `npx tsx scripts/audit-maps.ts ["<prompt>"]` — generates a 12-prompt panel and prints critic scores, the
  composition split, relief, vegetation, parts and the geometry defects the critic cannot see (footprints
  left hanging over an edge). Run it before and after any generator change.
- `npx tsx scripts/demo-prompt.ts "<prompt>" [--build --open --size N --out dir]` — prompt → full project in `demo-output/`.
- `npm run dev` — sync template + `tauri dev` (see `.claude/skills/studio-verify` to drive the app and Studio headlessly).

## Rules

- Credentials are local (OS keychain via the app). Never hardcode, commit, log or send API keys / tokens.
- No proprietary code, assets, logos or copied content (VibeStarter or others). Procedural or CC0 only.
- Every feature must be real (no mocks); when an external integration is impossible, add a clean abstraction + a working local implementation.
- Schemas are the contract: extend `packages/core/src/schemas/*` and the taxonomy first, then generator / prefabs / template / interpreter / agents / docs.
- Prefabs are connected by construction (`PartListBuilder`); the connectivity test guards every prefab for all 34 styles.
- The template must compile with roblox-ts (`npx rbxtsc` in a generated project) — see `templates/roblox-ts-project/.claude/skills/roblox-ts-pitfalls`.
- Bash tool note (Windows): heredocs de-escape `\n` / `\t` / `\\` and fail on long scripts — write patch scripts with the Write tool and run them with `python`.

## Skills (`.claude/skills/`)

`add-style`, `add-genre`, `add-prefab`, `add-ui-kit`, `map-quality`, `studio-verify`, `release`. Generated projects carry
their own skills (`templates/roblox-ts-project/.claude/skills/`): `worldforge-world`, `worldforge-gameplay`,
`worldforge-ui`, `worldforge-assets`, `worldforge-qa`, `worldforge-publish`, `roblox-ts-pitfalls`.

Docs: `README.md`, `ARCHITECTURE.md`, `WORLD_GENERATION.md`, `TAXONOMY.md`, `AGENT_SYSTEM.md`,
`ROBLOX_PIPELINE.md`, `QUALITY_SYSTEM.md`.
