import type { DealView } from "@shortlist/db";
import { Banner } from "@/components/banner";
import { CitationChip, ShowPageButton } from "@/components/deck/citation-chip";
import { formatUsd, timeAgo } from "@/lib/format";
import { FactsSection } from "./facts-section";
import { MandateSection } from "./mandate-section";
import { ScoresSection } from "./scores-section";

function Note({ children }: { children: string }) {
  return <p className="py-12 text-center text-muted-foreground">{children}</p>;
}

// The Deal page's Screening tab: the latest Screening run's result, or why
// there is none yet.
export function ScreeningPanel({ deal, now }: { deal: DealView; now: Date }) {
  const run = deal.screeningRun;
  if (run === null) {
    return (
      <Note>
        {deal.hasDeck
          ? "Waiting for Screening to start on this deck."
          : "This pitch arrived without a deck, so it hasn't been screened. Ask the founder for their deck."}
      </Note>
    );
  }
  if (run.status === "QUEUED" || run.status === "RUNNING") {
    return (
      <Note>
        Screening is reading this deck. Results appear here when it finishes.
      </Note>
    );
  }
  if (run.status === "FAILED" || run.output === null) {
    return (
      <div className="mt-4 space-y-2">
        <Banner>
          Screening couldn&apos;t finish this deck, so it has no scores yet.
        </Banner>
        {run.error !== null && (
          <p className="text-xs whitespace-pre-wrap text-faint-foreground">
            {run.error}
          </p>
        )}
      </div>
    );
  }

  const { output } = run;
  const citable = deal.hasDeck;
  const versions = [
    `config v${String(run.config.version)}`,
    run.promptVersion === null ? null : `prompt ${run.promptVersion}`,
    run.model,
    `screened ${timeAgo(run.finishedAt ?? run.createdAt, now)}`,
  ].filter((part) => part !== null);

  return (
    <div>
      <p className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-sm bg-muted px-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          AI draft
        </span>
        <span className="text-xs text-faint-foreground">
          {versions.join(" · ")}
        </span>
      </p>

      {(output.hiddenSpans.length > 0 || output.mismatches.length > 0) && (
        <div className="mt-4 space-y-2">
          {output.hiddenSpans.map((span) => (
            <Banner
              key={`${String(span.page)}-${span.snippet}`}
              action={citable ? <ShowPageButton page={span.page} /> : undefined}
            >
              <p className="font-medium">
                Hidden text on page {span.page}: the deck has text a reader
                can&apos;t see. Shortlist didn&apos;t use it for scoring.
              </p>
              <p className="mt-1 text-xs">&ldquo;{span.snippet}&rdquo;</p>
            </Banner>
          ))}
          {output.mismatches.map((mismatch) => (
            <Banner key={mismatch.field}>
              Numbers don&apos;t match: the form says a{" "}
              {formatUsd(mismatch.formValue)} round; the deck says{" "}
              {formatUsd(mismatch.deckValue)}.
              {mismatch.citations.map((citation) => (
                <CitationChip
                  key={`${String(citation.page)}-${citation.snippet}`}
                  citation={citation}
                  interactive={citable}
                />
              ))}
            </Banner>
          ))}
        </div>
      )}

      <MandateSection mandate={output.mandate} />
      {output.scores !== null && output.totalScore !== null && (
        <ScoresSection
          scores={output.scores}
          totalScore={output.totalScore}
          rubric={run.config.config.rubric}
          citable={citable}
        />
      )}
      <FactsSection facts={output.facts} citable={citable} />
    </div>
  );
}
