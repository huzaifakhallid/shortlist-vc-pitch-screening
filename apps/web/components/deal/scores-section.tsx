import type { RubricScores, WorkspaceConfig } from "@shortlist/schemas";
import { CitationChip } from "@/components/deck/citation-chip";
import { SectionHeading } from "./section-heading";

// §7.2 step 6: each rubric criterion's score with its reasoning and the
// deck pages it cites. Labels and weights come from the config version the
// run used.
export function ScoresSection({
  scores,
  totalScore,
  rubric,
  citable,
}: {
  scores: RubricScores;
  totalScore: number;
  rubric: WorkspaceConfig["rubric"];
  citable: boolean;
}) {
  return (
    <section aria-labelledby="scores-heading">
      <SectionHeading
        id="scores-heading"
        aside={
          <span className="tabular text-sm font-semibold">
            {Math.round(totalScore)} / 100
          </span>
        }
      >
        Scores
      </SectionHeading>
      <ul>
        {scores.criteria.map((criterion) => {
          const rule = rubric.find((c) => c.key === criterion.key);
          if (rule === undefined) {
            throw new Error(
              `Criterion "${criterion.key}" is not in the rubric of the run's config`,
            );
          }
          return (
            <li
              key={criterion.key}
              className="flex flex-wrap gap-x-3 gap-y-1 border-b py-3 last:border-b-0"
            >
              <span className="w-32 shrink-0 font-semibold">{rule.label}</span>
              <span className="tabular w-12 shrink-0 font-semibold">
                {criterion.score} / 5
              </span>
              <div className="min-w-0 flex-1 basis-64">
                <p className="text-muted-foreground">
                  {criterion.reasoning}
                  {criterion.citations.map((citation) => (
                    <CitationChip
                      key={`${String(citation.page)}-${citation.snippet}`}
                      citation={citation}
                      interactive={citable}
                    />
                  ))}
                </p>
                <p className="mt-0.5 text-xs text-faint-foreground">
                  Weight {rule.weight}% · {criterion.confidence} confidence
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
