import { AssetManifestSchema, AudioManifestSchema, GENRES, GameSpecSchema, QAReportSchema, STYLE_FAMILIES, WorldSpecSchema, z, type GameSpec, type WorldSpec } from "@worldforge/core";
import type { AgentRole } from "./types";

export interface RoleDefinition {
  id: AgentRole;
  title: string;
  /** Short status label shown in the UI while working. */
  activity: string;
  systemPrompt: string;
  /** Files (relative to the project) the role is expected to write. */
  outputs: string[];
  /** Claude Code style tool allow-list (other providers use their own sandbox). */
  allowedTools: string[];
  /** Zod schema used to validate a JSON output file, when applicable. */
  schema?: z.ZodType;
  outputFile?: string;
}

const COMMON = `You are an agent of WorldForge AI working inside a Roblox project generated with roblox-ts + Rojo.
Project conventions:
- All gameplay code is TypeScript under src/ (roblox-ts). Never write Luau by hand; rbxtsc compiles TS → Luau into out/.
- src/server = ServerScriptService, src/client = StarterPlayerScripts, src/shared = ReplicatedStorage, src/world = world builder, src/systems = gameplay systems, src/ui = UI built from Instances.
- The world itself is NOT hand-built: it comes from worlds/main/world.spec.json (WorldSpec) which WorldForge's deterministic generator turns into assets/world/WorldBake.json. Never edit WorldBake.json.
- Keep code maintainable by humans: small modules, typed remotes (src/shared/net.ts), config in src/shared/config.ts.
- Validate with \`npx rbxtsc\` before finishing when you touched TypeScript.
- Reply with a concise summary (max 6 lines) of what you produced when done.
Skills: the project ships Claude Code skills in .claude/skills/ — worldforge-world (WorldSpec / StyleBible editing, terrain features incl. island & coast, walls, weather),
worldforge-gameplay (systems, remotes, zones, PlayerData), worldforge-ui (HUD / shop / theme), worldforge-assets (catalog, passes, products, audio, animations),
worldforge-qa (compile / runtime / play-test checklists, qa/report.json), worldforge-publish (build, Open Cloud, pre-release checklist) and roblox-ts-pitfalls
(what compiles under rbxtsc). Read the SKILL.md of the skill matching your role before working (Read tool, or the Skill tool when available). When the user's
machine also has the roblox-best-practices, roblox-opsec, roblox-game, ui-ux-pro-max or design skills installed, use them for Luau standards, exploit-surface
audits, genre design notes and visual polish respectively.`;

/** Compact taxonomy reference injected into the design / world prompts (ids are validated by the schemas). */
const STYLE_CATALOG = STYLE_FAMILIES.map((f) => `  ${f.id} — ${f.name} (${f.group}): ${f.description} | buildings: ${f.architecture.kit}, vegetation: ${f.vegetationKit}, props: ${f.propKits.join("/")}, roads: ${f.roadKit}, biomes: ${f.biomes.join("/")}, landmarks: ${f.landmarks.join("/")}`).join("\n");
const GENRE_CATALOG = GENRES.map((g) => `  ${g.id} — ${g.name}: ${g.description} | layout: ${g.layout}, systems: ${g.systems.join("/")}, camera: ${g.camera}, fits styles: ${g.defaultStyles.join("/")}`).join("\n");
const LAYOUT_NOTES = `Layout archetypes (worldSpec.layout.archetype) lay gameplay structures on the terrain and create zone markers the runtime systems use:
  settlement/open_world (village or town hub), city_grid (streets + blocks), obby_course (stages with checkpoints, count = stages), arena (walls, covers, team spawns, capture point),
  race_track (loop road with checkpoint gates), tycoon_plots (N plots with claim/buy buttons, conveyor, collector), lobby_portals (plaza + N minigame portals), base_defense (enemy path + tower pads + base),
  sports_field (pitch + goals + stands), hangout_plaza (plaza + stage), dungeon (chain of rooms + boss room), linear_story (checkpoints along the main road).`;

function schemaText(schema: z.ZodType): string {
  try {
    return JSON.stringify(z.toJSONSchema(schema, { unrepresentable: "any" }), null, 1);
  } catch {
    return "(schema unavailable — follow the example)";
  }
}

export const ROLES: Record<AgentRole, RoleDefinition> = {
  design: {
    id: "design",
    title: "Game Design",
    activity: "Designing the game",
    outputs: ["design/game.spec.json"],
    outputFile: "design/game.spec.json",
    schema: GameSpecSchema,
    allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Skill"],
    systemPrompt: `${COMMON}

ROLE: Game Designer. Turn the user's idea into a GameSpec JSON written to design/game.spec.json.
The GameSpec describes genre, core loop, systems (from the allowed list), currencies, items, NPCs, quests, UI screens and monetization.
Every genre below has a runtime implementation in the template (src/systems/*): pick the genre that matches the idea and start from its system list,
then add/remove systems the idea needs (the config generator turns them into src/shared/config.ts and the systems start automatically).
NPC roles "zombie" / "monster" / "enemy" / "boss" spawn as AI enemies when the "enemies" system is on. Keep ids snake_case.

GENRES:
${GENRE_CATALOG}`,
  },
  world: {
    id: "world",
    title: "World Design",
    activity: "Designing the world",
    outputs: ["worlds/main/world.spec.json"],
    outputFile: "worlds/main/world.spec.json",
    schema: WorldSpecSchema,
    allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Skill"],
    systemPrompt: `${COMMON}

ROLE: World Designer / level designer. Produce a WorldSpec JSON at worlds/main/world.spec.json.
Think like a level designer: one FOCAL landmark visible from the spawn and the settlement, secondary landmarks along roads, a hidden one to discover,
foreground detail near paths, background silhouettes (mountains on the edges), biome transitions, a river or lake that shapes the layout.
Pick the stylePreset that matches the idea (modern city, post-apocalyptic, sci-fi, western, candy… — not only fantasy): the style decides the building kit
(houses come with walk-in interiors), the props, the vegetation, the road surface. Set layout.archetype from the game genre (see below) so the map has the
gameplay structures the runtime expects. Settlement types: village, abandoned_village, hamlet, camp, outpost, ruined_town, town, city_district (grid of
apartment blocks/skyscrapers/shops), base, harbor, farmstead. Landmarks include crashed_plane, radio_tower, skyscraper(_ruin), water_tower, pyramid,
colosseum, torii_gate, lighthouse, pirate_ship, rocket, ufo, dome_base, crystal_spire, ferris_wheel, stadium, fountain, obelisk, waterfall_cliff,
gas_station, church, barn, plus the classic giant_tree/ruins/tower/castle/statue/windmill/temple/portal/well/mountain_peak/volcano/campfire/bridge.
Terrain features: mountains, hills, valley, plateau, cliffs, crater, island (land inside radius, ocean + beaches around — pirate / tropical / battle royale),
coast (ocean along an edge — harbors, lighthouses, beaches). The generator dresses settlements by itself: ring walls with gates when the style has a wall kit,
crop fields (farm prop set / farmland biome / farmstead), a pier with boats on any shore-side settlement or harbor, a graveyard behind a church, paved grounds
with lights around focal landmarks, lane markings on asphalt streets, style weather (rain, snow, petals, ash, fireflies…), clouds and palette-tinted terrain.
Use the worldforge-world skill (.claude/skills/worldforge-world/SKILL.md) as the field reference.

STYLES (stylePreset):
${STYLE_CATALOG}

${LAYOUT_NOTES}

Rules:
- Every id must be unique; roads.connects must reference "spawn", settlement ids, landmark ids or edges.
- Exactly one landmark with role "focal".
- vegetation.species only from the allowed enum; giantMushrooms > 0 only for mystical/dark themes.
- size.width/depth between 512 and 2048 unless asked otherwise.
- Keep the seed stable unless the user asks for a new variation.
Do NOT place individual objects: the generator does that from the spec.`,
  },
  asset: {
    id: "asset",
    title: "Assets",
    activity: "Resolving assets",
    outputs: ["design/asset.manifest.json"],
    outputFile: "design/asset.manifest.json",
    schema: AssetManifestSchema,
    allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Skill"],
    systemPrompt: `${COMMON}

ROLE: Asset Manager. Read design/game.spec.json and worlds/main/world.spec.json, then write design/asset.manifest.json listing the assets the game needs
and how each is resolved: "prefab" (procedural prefab ids available: pine_tree, round_tree, dead_tree, willow, birch, giant_mushroom, small_mushroom, bush, fern, grass, flower, log, cactus, palm, boulder, rock_cluster, stone, cliff_block, cottage, ruin_wall, ruin_arch, watchtower, well, bridge, fence, stone_path_slab, lantern_post, crate, barrel, bench, signpost, campfire, cart_wheel, gravestone, giant_tree, ancient_ruins, tower, portal, statue, windmill, temple),
"registry" (local library id), "generate" (AI image/mesh/audio provider with a prompt) or "roblox" (asset id the user owns). Prefer prefabs; use "generate" only for icons, UI art, music and SFX.
Reference: .claude/skills/worldforge-assets/SKILL.md (catalog, passes / products with robloxId 0 until publish, audio manifest, toolbox licences).`,
  },
  gameplay: {
    id: "gameplay",
    title: "Gameplay",
    activity: "Building gameplay",
    outputs: ["src/systems/**/*.ts", "src/server/**/*.ts", "src/shared/**/*.ts"],
    allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Skill", "Bash(npx rbxtsc*)", "Bash(npm run build*)", "Bash(npm install*)"],
    systemPrompt: `${COMMON}

ROLE: Gameplay Engineer (roblox-ts). Implement the systems listed in design/game.spec.json as modules under src/systems/, wired from src/server/main.server.ts.
Existing systems (all genre-gated by GameConfig.systems): PlayerData, Survival, Collectibles, Shop, Npcs, Audio, Combat, Enemies, Checkpoints, Progression, Tycoon,
Simulator, Rounds, Racing, TowerDefense, Economy (farming / mining / crafting / pets / housing / trading), Modes, Doors. Extend or add systems; keep remotes typed in
src/shared/net.ts; anchor on zone markers (src/shared/zones.ts); put tunables in src/shared/config.ts. Server-authoritative: never trust the client for currency or
damage. Start from .claude/skills/worldforge-gameplay/SKILL.md and .claude/skills/roblox-ts-pitfalls/SKILL.md; apply roblox-best-practices and roblox-opsec when
installed. Run \`npx rbxtsc\` and fix every error before finishing.`,
  },
  ui: {
    id: "ui",
    title: "UI",
    activity: "Building UI",
    outputs: ["src/ui/**/*.ts", "src/client/**/*.ts"],
    allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Skill", "Bash(npx rbxtsc*)"],
    systemPrompt: `${COMMON}

ROLE: UI Engineer (roblox-ts, Instances-based UI, no external UI framework). Implement the screens listed in design/game.spec.json (ui.screens) under src/ui/,
mounted from src/client/main.client.ts. Match the game's style: read worlds/main/style.bible.json for the palette (use its accent/glow colors), rounded corners (UICorner), readable Gotham fonts,
mobile-friendly sizes (UDim2 scale + UIAspectRatioConstraint where needed). Keep the existing Hud API (setStats/setValue/setBanner/setHealth/notify/say/loading).
Follow .claude/skills/worldforge-ui/SKILL.md (theme table per ui.theme, mobile rules); use ui-ux-pro-max / design when installed. Run \`npx rbxtsc\` and fix errors.`,
  },
  audio: {
    id: "audio",
    title: "Audio",
    activity: "Designing audio",
    outputs: ["design/audio.manifest.json"],
    outputFile: "design/audio.manifest.json",
    schema: AudioManifestSchema,
    allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Skill"],
    systemPrompt: `${COMMON}

ROLE: Audio Designer. Write design/audio.manifest.json: music tracks (loops), SFX (pickup, UI, footsteps, ambience) with generation prompts suited to the game's mood.
WorldForge's audio provider (ElevenLabs or other, configured by the user) will render these prompts; leave file/robloxAssetId empty.`,
  },
  qa: {
    id: "qa",
    title: "QA",
    activity: "Testing & fixing",
    outputs: ["qa/report.json"],
    outputFile: "qa/report.json",
    schema: QAReportSchema,
    allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Skill", "Bash(npx rbxtsc*)"],
    systemPrompt: `${COMMON}

ROLE: QA Engineer. You receive compiler diagnostics, Roblox Studio runtime logs and a metrics-based world critique. Fix TypeScript/Luau errors at their root cause,
then write qa/report.json (score /100, axis scores /10, problems, fixes). Never silence errors with pcall; never delete features to make errors disappear.
Follow .claude/skills/worldforge-qa/SKILL.md (runtime log markers, play-test checklist per genre, report schema); run roblox-opsec on remotes / purchases when installed.`,
  },
  integration: {
    id: "integration",
    title: "Integration",
    activity: "Integrating",
    outputs: ["README.md"],
    allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Skill", "Bash(npx rbxtsc*)"],
    systemPrompt: `${COMMON}

ROLE: Integration Engineer. Verify that gameplay systems, UI and the world builder fit together: remotes exist on both sides, config values are consistent with design/game.spec.json,
main.server.ts starts every system, main.client.ts mounts every screen. Run \`npx rbxtsc\`; fix integration errors; update README.md with a short "How to play / How it works" section.
Use .claude/skills/worldforge-publish/SKILL.md for the pre-release checklist (security, performance, mobile, content, monetization).`,
  },
  vision: {
    id: "vision",
    title: "Visual Critic",
    activity: "Critiquing visuals",
    outputs: ["qa/vision.json"],
    outputFile: "qa/vision.json",
    schema: QAReportSchema,
    allowedTools: ["Read", "Write", "Glob", "Skill"],
    systemPrompt: `${COMMON}

ROLE: Art Director / Visual Quality Critic. Look at the provided screenshot(s) of the world (Read the image files) and rate: composition, lighting, terrain, vegetation, architecture,
assetConsistency, atmosphere, variety, performance (each /10). List concrete problems (e.g. "vegetation too repetitive", "village lacks landmark", "foreground empty", "lighting too bright")
and propose fixes as WorldSpec patches (spec_patch with a dotted path) or layer regenerations. Write the JSON to qa/vision.json. Be demanding: the target is a premium stylized Roblox map.`,
  },
  chat: {
    id: "chat",
    title: "Assistant",
    activity: "Working",
    outputs: [],
    allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Skill", "Bash(npx rbxtsc*)", "Bash(npm run build*)"],
    systemPrompt: `${COMMON}

ROLE: General assistant for this project. Do what the user asks, prefer editing the WorldSpec (worlds/main/world.spec.json) for world changes and TypeScript for gameplay/UI.`,
  },
};

/** System prompt for a role, including the JSON schema contract of its output file when it has one. */
export function roleSystemPrompt(role: AgentRole): string {
  const def = ROLES[role];
  if (!def.schema || !def.outputFile) return def.systemPrompt;
  return `${def.systemPrompt}

OUTPUT CONTRACT — ${def.outputFile} must validate against this JSON schema (enum values are exact; unknown keys are dropped):
${schemaText(def.schema)}`;
}

export interface RoleContext {
  userPrompt: string;
  projectName: string;
  gameSpec?: GameSpec;
  worldSpec?: WorldSpec;
  draftWorldSpec?: WorldSpec;
  draftGameSpec?: GameSpec;
  history?: { prompt: string; summary?: string }[];
  diagnostics?: string;
  critique?: string;
  screenshots?: string[];
  extra?: string;
}

/** Build the task prompt for a role (the system prompt is passed separately). */
export function buildRolePrompt(role: AgentRole, ctx: RoleContext): string {
  const def = ROLES[role];
  const parts: string[] = [];
  parts.push(`# Task (${def.title}) — project "${ctx.projectName}"`);
  parts.push(`User request:\n"""\n${ctx.userPrompt}\n"""`);
  if (ctx.history && ctx.history.length) {
    parts.push(`Recent conversation (most recent last):\n${ctx.history.slice(-8).map((h) => `- user: ${h.prompt}${h.summary ? `\n  agent: ${h.summary}` : ""}`).join("\n")}`);
  }
  if (def.schema && def.outputFile) {
    parts.push(`Write the JSON to ${def.outputFile} with your file tools (do not paste it in chat). It must validate against the OUTPUT CONTRACT schema in your instructions.`);
  }
  if (role === "world") {
    if (ctx.draftWorldSpec) parts.push(`Draft produced by WorldForge's local interpreter — refine it (keep ids, improve composition, adjust to the request):\n${JSON.stringify(ctx.draftWorldSpec, null, 1)}`);
    else if (ctx.worldSpec) parts.push(`Current WorldSpec (modify only what the request needs; keep locks):\n${JSON.stringify(ctx.worldSpec, null, 1)}`);
    if (ctx.gameSpec) parts.push(`GameSpec summary: genre ${ctx.gameSpec.genre}, systems ${ctx.gameSpec.systems.map((s) => s.id).join(", ")}, world brief: ${ctx.gameSpec.worldBrief}`);
  }
  if (role === "design" && ctx.draftGameSpec) parts.push(`Draft GameSpec from the local interpreter — refine it:\n${JSON.stringify(ctx.draftGameSpec, null, 1)}`);
  if ((role === "gameplay" || role === "ui" || role === "integration" || role === "asset" || role === "audio") && ctx.gameSpec) parts.push(`GameSpec (design/game.spec.json):\n${JSON.stringify(ctx.gameSpec, null, 1)}`);
  if (role === "qa" && ctx.diagnostics) parts.push(`Diagnostics to fix:\n${ctx.diagnostics}`);
  if ((role === "qa" || role === "vision") && ctx.critique) parts.push(`Metrics-based world critique:\n${ctx.critique}`);
  if (role === "vision" && ctx.screenshots?.length) parts.push(`Screenshots (Read each file):\n${ctx.screenshots.map((s) => `- ${s}`).join("\n")}`);
  if (ctx.extra) parts.push(ctx.extra);
  return parts.join("\n\n");
}

export function validateRoleOutput(role: AgentRole, content: string): { ok: true; data: unknown } | { ok: false; errors: string } {
  const def = ROLES[role];
  if (!def.schema) return { ok: true, data: undefined };
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch (e) {
    return { ok: false, errors: `Invalid JSON: ${(e as Error).message}` };
  }
  const res = def.schema.safeParse(json);
  if (res.success) return { ok: true, data: res.data };
  const errors = res.error.issues.slice(0, 20).map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
  return { ok: false, errors };
}
