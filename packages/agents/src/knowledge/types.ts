/** One entry of WorldForge's built-in knowledge base (prompting + map making). */
export interface KnowledgeEntry {
  id: string;
  domain: "prompting" | "mapping";
  /** Short grouping label shown in the app (composition, lighting, terrain, structure…). */
  topic: string;
  title: string;
  /** One or two sentences, in our own words. */
  summary: string;
  /** Actionable lines; these are what reaches the models. */
  rules: string[];
  /** Words (FR + EN, no accents needed) that make the entry relevant to a request. */
  tags: string[];
  sources: { title: string; url: string }[];
  /** official = vendor docs · research = paper · practitioner = talks, articles, forums · worldforge = learned on this project. */
  reliability: "official" | "research" | "practitioner" | "worldforge";
  /** Who receives the rules: the brief writer, the World agent, or only the humans browsing the app. */
  audience: ("enhancer" | "world" | "human")[];
  /** Always injected for its audience, whatever the request. */
  core?: boolean;
}
