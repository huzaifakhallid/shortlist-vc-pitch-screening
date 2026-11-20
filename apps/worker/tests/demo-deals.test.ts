import { citationIssues } from "@shortlist/agents-screening/steps/citations";
import { findHiddenSpans } from "@shortlist/agents-screening/steps/hidden-text";
import { checkMandate } from "@shortlist/agents-screening/steps/mandate";
import { totalScore } from "@shortlist/agents-screening/steps/score";
import { screeningOutputSchema } from "@shortlist/schemas";
import { describe, expect, it } from "vitest";
import { DEMO_DEALS } from "@shortlist/db/demo-deals";
import { DEMO_DECKS, visibleText } from "@shortlist/db/demo-decks";
import { kestrelConfig } from "@shortlist/db/kestrel-config";

// The seeded Screening results must be results Screening could have
// written: each one is checked with Screening's own rules against the
// demo fund's config and the synthetic deck it cites. (The bundled PDFs are
// checked against their ETags in apps/web/tests/synthetic-decks.test.ts.)

const config = kestrelConfig({
  fintechAndDevtools: "00000000-0000-4000-8000-000000000001",
  climate: "00000000-0000-4000-8000-000000000002",
});

const screened = DEMO_DEALS.flatMap((deal) => {
  const result = deal.screening;
  if (result?.status !== "SUCCEEDED" || deal.deck === null) {
    return [];
  }
  return [{ deal, deck: DEMO_DECKS[deal.deck], output: result.output }];
});

describe("seeded Screening results", () => {
  it.each(screened)(
    "$deal.company follows Screening's rules",
    ({ deck, output, deal }) => {
      expect(screeningOutputSchema.safeParse(output).success).toBe(true);

      const pages = deck.pages.map(visibleText);
      const { facts } = output;
      const topics = [
        "problem",
        "solution",
        "market",
        "traction",
        "team",
        "ask",
      ] as const;
      for (const topic of topics) {
        expect(citationIssues(facts[topic], pages, [topic])).toEqual([]);
      }
      const profileValues = Object.values(facts.deckProfile).filter(
        (value) => value !== null,
      );
      expect(citationIssues(profileValues, pages, ["deckProfile"])).toEqual([]);
      expect(citationIssues(output.mismatches, pages, ["mismatches"])).toEqual(
        [],
      );

      expect(output.mandate).toEqual(
        checkMandate(output.profile, config.filters),
      );
      if (output.scores !== null) {
        expect(
          citationIssues(output.scores.criteria, pages, ["criteria"]),
        ).toEqual([]);
        expect(output.totalScore).toBe(
          totalScore(config.rubric, output.scores.criteria),
        );
      }

      // The profile takes the form's values where the founder gave them.
      expect(output.profile.roundSizeUsd).toBe(
        deal.form?.roundSizeUsd ??
          facts.deckProfile.roundSizeUsd?.value ??
          null,
      );

      // The hidden text in the bundled PDF is what the check would find.
      const found = deck.pages.flatMap((page, i) =>
        page.hidden === undefined
          ? []
          : findHiddenSpans(
              `${visibleText(page)}\n${page.hidden}`,
              pages[i] ?? "",
            ).map((span) => ({ page: i + 1, ...span })),
      );
      expect(output.hiddenSpans).toEqual(found);
    },
  );

  it("covers the stages the dashboard shows", () => {
    expect(new Set(screened.map((s) => s.output.mandate.outcome))).toEqual(
      new Set(["inside", "outside", "undetermined"]),
    );
  });
});
