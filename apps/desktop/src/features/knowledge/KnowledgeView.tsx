import { openUrl } from "@tauri-apps/plugin-opener";
import { BookOpen, ExternalLink, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { KNOWLEDGE, KNOWLEDGE_TOPICS, searchKnowledge, type KnowledgeEntry } from "@worldforge/agents";
import { Empty, Input, Pill } from "@/components/ui";
import { cn } from "@/lib/utils";

const DOMAINS: { id: KnowledgeEntry["domain"] | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mapping", label: "Mapping" },
  { id: "prompting", label: "Prompting" },
];

const RELIABILITY: Record<KnowledgeEntry["reliability"], { label: string; dot: "ok" | "warn" | "busy" | "idle" }> = {
  official: { label: "Official docs", dot: "ok" },
  research: { label: "Research", dot: "ok" },
  practitioner: { label: "Practitioners", dot: "warn" },
  worldforge: { label: "Learned on WorldForge", dot: "busy" },
};

const AUDIENCE: Record<KnowledgeEntry["audience"][number], string> = { enhancer: "Brief writer", world: "World agent", human: "Reference" };

/** Browse the knowledge base the agents draw from: principles, WorldSpec recipes and their sources. */
export function KnowledgeView() {
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState<(typeof DOMAINS)[number]["id"]>("all");
  const [topic, setTopic] = useState<string | null>(null);
  const entries = useMemo(() => searchKnowledge({ text: query, domain: domain === "all" ? undefined : domain, topic: topic ?? undefined }), [query, domain, topic]);
  const topics = useMemo(() => KNOWLEDGE_TOPICS.filter((t) => domain === "all" || KNOWLEDGE.some((e) => e.topic === t && e.domain === domain)), [domain]);
  const sourceCount = useMemo(() => new Set(KNOWLEDGE.flatMap((e) => e.sources.map((s) => s.url))).size, []);

  return (
    <div className="grid h-full grid-cols-[240px_1fr] gap-3 p-3">
      <aside className="panel flex min-h-0 flex-col gap-3 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen size={15} className="text-brand" /> Knowledge
        </div>
        <p className="text-xs text-muted">
          {KNOWLEDGE.length} entries and {sourceCount} sources on prompting and map making. Entries marked “Brief writer” or “World agent” are sent to the agents with every matching request.
        </p>
        <div className="flex overflow-hidden rounded-md border border-line text-xs">
          {DOMAINS.map((d) => (
            <button
              key={d.id}
              onClick={() => {
                setDomain(d.id);
                setTopic(null);
              }}
              className={cn("flex-1 px-2 py-1", domain === d.id ? "bg-ink text-white" : "bg-panel text-ink-2 hover:bg-panel-2")}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex min-h-0 flex-wrap content-start gap-1 overflow-auto">
          {topics.map((t) => (
            <button key={t} onClick={() => setTopic(topic === t ? null : t)} className={cn("rounded-full border px-2 py-0.5 text-[11px]", topic === t ? "border-brand bg-brand-soft text-ink" : "border-line text-ink-2 hover:bg-panel-2")}>
              {t}
            </button>
          ))}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col gap-3">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-2.5 text-faint" />
          <Input className="pl-8" placeholder="Search: village, horreur, fog, few-shot, roblox lighting…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
          {entries.length === 0 ? (
            <Empty title="Nothing matches" icon={<BookOpen size={26} />}>
              Try another word, in French or English.
            </Empty>
          ) : (
            entries.map((e) => <EntryCard key={e.id} entry={e} />)
          )}
        </div>
      </section>
    </div>
  );
}

function EntryCard({ entry }: { entry: KnowledgeEntry }) {
  const reliability = RELIABILITY[entry.reliability];
  return (
    <article className="panel space-y-2 p-3">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{entry.title}</h3>
        <span className="text-[11px] text-muted">
          {entry.domain} · {entry.topic}
        </span>
        <span className="ml-auto flex flex-wrap gap-1">
          <Pill dot={reliability.dot}>{reliability.label}</Pill>
          {entry.audience
            .filter((a) => a !== "human")
            .map((a) => (
              <Pill key={a}>{AUDIENCE[a]}</Pill>
            ))}
        </span>
      </header>
      <p className="text-[13px] text-ink-2">{entry.summary}</p>
      <ul className="list-disc space-y-0.5 pl-5 text-[13px]">
        {entry.rules.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {entry.sources.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2">
          {entry.sources.map((s) => (
            <button key={s.url} onClick={() => void openUrl(s.url)} className="flex items-center gap-1 text-[11px] text-brand hover:underline" title={s.url}>
              <ExternalLink size={10} /> {s.title}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
