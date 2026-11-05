import type { GameSpec } from "@worldforge/core";

/**
 * What the generated game's runtime really reports to its quests (templates/.../systems, `progressQuest`).
 * A quest outside this table can never be completed, and a player notices that in the first minutes.
 */
export const QUEST_EVENTS: Record<string, { targets: RegExp; systems: string[]; note: string }> = {
  collect: { targets: /./, systems: ["collectibles", "simulator_loop", "farming", "mining", "pets"], note: 'target "any" or a prefab or item id' },
  reach: { targets: /^(obby_stage_\d+|story_checkpoint_\d+|race_start)$/, systems: ["checkpoints", "obby", "racing", "story", "parkour"], note: "target obby_stage_N, story_checkpoint_N or race_start (one lap)" },
  talk: { targets: /./, systems: ["npcs"], note: 'target "any" or an NPC id' },
  defeat: { targets: /^(any|player|enemy)$/, systems: ["combat", "enemies"], note: 'target "any", "player" or "enemy"' },
  survive: { targets: /^(wave|any)$/, systems: ["tower_defense"], note: 'target "wave"' },
  build: { targets: /^(any|tycoon_plot|dropper|house|block)$/, systems: ["tycoon", "housing", "building"], note: "target tycoon_plot, dropper, house or block" },
  escape: { targets: /^(any|door_\d+)$/, systems: ["horror", "puzzle"], note: 'target "any" or door_N' },
  win_rounds: { targets: /^any$/, systems: ["rounds"], note: 'target "any"' },
  craft: { targets: /./, systems: ["crafting"], note: 'target "any" or a recipe output' },
};

export interface DesignProblem {
  id: string;
  severity: "high" | "medium";
  message: string;
}

const PROGRESSION = ["progression", "currency", "shop", "simulator_loop", "tycoon", "pets", "crafting", "checkpoints", "obby"];
const SOCIAL = ["leaderboards", "trading", "teams", "matchmaking", "rounds", "capture_points", "minigames", "housing"];
/** Roblox's monetization guidance: no false scarcity or countdown wording, no pressure on a young audience. */
const PUSHY = /\b(get it now|buy now|hurry|last chance|only today|today only|limited time|one[- ]time offer|on sale|act now|don.?t miss)\b/i;
const SHOUTING = /\b(?!VIP\b)[A-Z]{4,}\b/;

/** Deterministic review of a GameSpec against what makes a Roblox game keep its players. */
export function reviewGameDesign(game: GameSpec): DesignProblem[] {
  const problems: DesignProblem[] = [];
  const add = (id: string, severity: DesignProblem["severity"], message: string) => problems.push({ id, severity, message });
  const systems = new Set<string>(game.systems.map((s) => s.id));
  const has = (ids: string[]) => ids.some((id) => systems.has(id));

  if (game.coreLoop.length < 3) add("core_loop_thin", "high", "coreLoop needs at least 3 steps: the constant activity, the most repeated action, what makes progress.");
  if (!has(PROGRESSION)) add("no_progression", "high", "no progression system: without one the game becomes repetitive. Add progression, a currency with a shop, or an equivalent.");
  if (!systems.has("quests")) add("goals_not_tracked", "high", 'add the "quests" system: without it no goal is tracked or shown.');
  else if (!game.ui.screens.includes("quests")) add("goals_not_shown", "medium", 'add the "quests" UI screen so goals are visible.');
  if (game.quests.length < 3) add("goals_missing", "high", "give at least 3 quests: a short goal for the first minute, a mid goal for the session, a long goal to come back for.");

  for (const q of game.quests) {
    const event = QUEST_EVENTS[q.objective.type];
    if (!event) add("quest_impossible", "high", `quest "${q.id}": the runtime never reports "${q.objective.type}". Use one of: ${Object.keys(QUEST_EVENTS).join(", ")}.`);
    else if (!event.targets.test(q.objective.target)) add("quest_impossible", "high", `quest "${q.id}": "${q.objective.type}" cannot target "${q.objective.target}" (${event.note}).`);
    else if (!has(event.systems)) add("quest_impossible", "high", `quest "${q.id}": "${q.objective.type}" needs one of these systems: ${event.systems.join(", ")}.`);
    else if (/^(tycoon_plot|dropper)$/.test(q.objective.target) && !systems.has("tycoon")) add("quest_impossible", "high", `quest "${q.id}": "${q.objective.target}" needs the tycoon system.`);
  }
  const first = game.quests[0];
  if (first && first.objective.count > 10) add("first_goal_too_long", "medium", `the first quest asks for ${first.objective.count}: the first goal must be reachable within a minute.`);
  if (first && first.reward.amount <= 0 && !first.reward.item) add("first_goal_no_reward", "medium", "the first quest must pay: early progress is what keeps a new player.");

  if (game.currencies.length > 0 && !game.currencies.some((c) => c.startingAmount > 0)) add("no_starter_currency", "medium", "give some starting currency so the first purchase comes early.");
  if (!has(SOCIAL)) add("no_social", "medium", "no social system: playing together counts for discovery and long-term retention. Add leaderboards, trading, teams or similar.");

  const copy = [
    ...game.shop.items.flatMap((i) => [i.name, i.description]),
    ...game.shop.bundles.flatMap((b) => [b.name, b.description]),
    game.shop.featured?.headline ?? "",
    game.shop.featured?.note ?? "",
    ...game.monetization.gamepasses.flatMap((p) => [p.name, p.description]),
    ...game.monetization.developerProducts.flatMap((p) => [p.name, p.description]),
    ...game.npcs.flatMap((n) => n.dialogue),
  ];
  const pushy = copy.find((text) => PUSHY.test(text) || SHOUTING.test(text));
  if (pushy) add("pushy_copy", "high", `pressure wording, not allowed for a young audience: "${pushy}". Describe what the item does, calmly.`);
  return problems;
}
