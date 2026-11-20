import type { DealFacts } from "@shortlist/schemas";
import { CitationChip } from "@/components/deck/citation-chip";
import { SectionHeading } from "./section-heading";

const TOPICS = [
  { key: "problem", label: "Problem" },
  { key: "solution", label: "Solution" },
  { key: "market", label: "Market" },
  { key: "traction", label: "Traction" },
  { key: "team", label: "Team" },
  { key: "ask", label: "Ask" },
] as const;

// §7.2 step 4: what the deck states, topic by topic, each statement with
// the pages it quotes. The scores read only these.
export function FactsSection({
  facts,
  citable,
}: {
  facts: DealFacts;
  citable: boolean;
}) {
  return (
    <section aria-labelledby="facts-heading">
      <SectionHeading id="facts-heading">From the deck</SectionHeading>
      {TOPICS.map((topic) => (
        <div key={topic.key} className="mt-4 first-of-type:mt-0">
          <h3 className="font-semibold">{topic.label}</h3>
          {facts[topic.key].length === 0 ? (
            <p className="mt-1 text-muted-foreground">Not in the deck.</p>
          ) : (
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {facts[topic.key].map((fact) => (
                <li key={fact.statement}>
                  {fact.statement}
                  {fact.citations.map((citation) => (
                    <CitationChip
                      key={`${String(citation.page)}-${citation.snippet}`}
                      citation={citation}
                      interactive={citable}
                    />
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
