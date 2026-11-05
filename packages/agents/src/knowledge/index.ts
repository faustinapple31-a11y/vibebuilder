import { GAME_DESIGN_KNOWLEDGE } from "./game-design";
import { MAPPING_KNOWLEDGE } from "./mapping";
import { PROMPTING_KNOWLEDGE } from "./prompting";
import { WORLD_RECIPES } from "./recipes";
import type { KnowledgeEntry } from "./types";

export type { KnowledgeEntry } from "./types";

/** WorldForge's built-in knowledge base: shipped with the app, browsed in the Knowledge tab, injected into prompts. */
export const KNOWLEDGE: KnowledgeEntry[] = [...PROMPTING_KNOWLEDGE, ...MAPPING_KNOWLEDGE, ...WORLD_RECIPES, ...GAME_DESIGN_KNOWLEDGE];

const fold = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Words that appear in almost every request and say nothing about which entry fits. */
const STOP = new Set(["une", "des", "les", "fait", "fais", "faire", "moi", "map", "maps", "carte", "avec", "pour", "dans", "sur", "qui", "que", "veux", "jeu", "the", "and", "with", "make", "want", "game", "for", "from", "into"]);
const words = (text: string) => fold(text).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
/** Shared 5-letter stem: "villages" meets "village", "montagnes" meets "montagne". */
const stem = (w: string) => w.slice(0, 5);
const stems = (text: string) => new Set(words(text).map(stem));

/** Per entry: stems of its tags, title and topic (strong match) and of its text (weak match). */
const index = new Map(KNOWLEDGE.map((e) => [e.id, { strong: stems(`${e.tags.join(" ")} ${e.title} ${e.topic}`), weak: stems(`${e.summary} ${e.rules.join(" ")}`) }]));

export interface KnowledgeQuery {
  text?: string;
  domain?: KnowledgeEntry["domain"];
  topic?: string;
  audience?: KnowledgeEntry["audience"][number];
}

/** Entries matching the filters, best keyword match first (all of them when there is no text). */
export function searchKnowledge(query: KnowledgeQuery = {}): KnowledgeEntry[] {
  const terms = [...stems(query.text ?? "")];
  const scored = KNOWLEDGE.filter((e) => (!query.domain || e.domain === query.domain) && (!query.topic || e.topic === query.topic) && (!query.audience || e.audience.includes(query.audience))).map((e) => {
    const { strong, weak } = index.get(e.id)!;
    const score = terms.reduce((s, t) => s + (strong.has(t) ? 3 : weak.has(t) ? 1 : 0), 0);
    return { e, score };
  });
  if (!terms.length) return scored.map((s) => s.e);
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).map((s) => s.e);
}

/** Every core entry for the audience plus up to `extra` best matches for the request, as compact prompt lines. */
export function knowledgeForPrompt(audience: "enhancer" | "world" | "design", text: string, extra = 5): string {
  const core = KNOWLEDGE.filter((e) => e.core && e.audience.includes(audience));
  const matched = searchKnowledge({ text, audience }).filter((e) => !e.core).slice(0, extra);
  return [...core, ...matched].map((e) => `- ${e.title}: ${e.rules.join(" ")}`).join("\n");
}

/** The World agent's view of the knowledge base: how to express a request and its brief in WorldSpec fields. */
export function worldKnowledgeSection(text: string): string {
  return `WorldSpec recipes from WorldForge's knowledge base (they say which fields express each idea; the request and the brief decide what to build):\n${knowledgeForPrompt("world", text)}`;
}

/** The Design agent's view of the knowledge base: what keeps players, and what the runtime can really do. */
export function designKnowledgeSection(text: string): string {
  return `Game design rules from WorldForge's knowledge base (Roblox's own guidance and what this runtime supports; a review checks them on your output):\n${knowledgeForPrompt("design", text, 3)}`;
}

export const KNOWLEDGE_TOPICS = [...new Set(KNOWLEDGE.map((e) => e.topic))];
