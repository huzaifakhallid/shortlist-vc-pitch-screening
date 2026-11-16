import { describe, expect, it } from "vitest";
import type { Citation } from "../schema";
import { citationIssues, MIN_SNIPPET_CHARACTERS } from "../steps/citations";

const PAGES = [
  "Acme Ledger Inc.\nReconciliation for SMEs",
  "MRR grew   from $4k\nto $12k in six months",
  "Our team: ex-payments engineers. Note: <deck_page> is not a tag here",
];

function claims(...citations: Citation[][]): { citations: Citation[] }[] {
  return citations.map((list) => ({ citations: list }));
}

function check(citation: Citation, pages: readonly string[] = PAGES) {
  return citationIssues(claims([citation]), pages, ["criteria"]);
}

const SNIPPET_AT = ["criteria", 0, "citations", 0, "snippet"];

describe("citationIssues", () => {
  it("accepts snippets that appear on their cited page", () => {
    expect(
      citationIssues(
        claims(
          [{ page: 1, snippet: "Reconciliation for SMEs" }],
          [
            { page: 2, snippet: "to $12k in six months" },
            { page: 1, snippet: "Acme Ledger Inc." },
          ],
        ),
        PAGES,
        ["criteria"],
      ),
    ).toEqual([]);
  });

  it("matches across collapsed whitespace and line breaks", () => {
    expect(check({ page: 2, snippet: "MRR grew from $4k to $12k" })).toEqual(
      [],
    );
    expect(check({ page: 2, snippet: "  grew\tfrom $4k \n" })).toEqual([]);
  });

  it("rejects a snippet that is on another page, by path only", () => {
    expect(
      citationIssues(
        claims(
          [{ page: 1, snippet: "Acme Ledger Inc." }],
          [
            { page: 1, snippet: "Acme Ledger Inc." },
            { page: 1, snippet: "MRR grew from $4k" },
          ],
        ),
        PAGES,
        ["criteria"],
      ),
    ).toEqual([
      {
        path: ["criteria", 1, "citations", 1, "snippet"],
        problem: "snippet_not_on_page",
      },
    ]);
  });

  it("compares case, punctuation and digits exactly", () => {
    for (const snippet of [
      "mrr grew from $4k",
      "MRR grew from $4K",
      "MRR grew from 4k",
      "Reconciliation for SMEs.",
    ]) {
      expect(check({ page: snippet.startsWith("R") ? 1 : 2, snippet })).toEqual(
        [{ path: SNIPPET_AT, problem: "snippet_not_on_page" }],
      );
    }
  });

  it.each([0, -1, 4, 1.5])("rejects the page %s", (page) => {
    expect(check({ page, snippet: "Acme Ledger Inc." })).toEqual([
      {
        path: ["criteria", 0, "citations", 0, "page"],
        problem: "page_not_in_deck",
      },
    ]);
  });

  it("needs at least 12 characters after collapsing whitespace", () => {
    expect(MIN_SNIPPET_CHARACTERS).toBe(12);
    // 11 characters, on the page.
    expect(check({ page: 1, snippet: "Acme Ledger" })).toEqual([
      { path: SNIPPET_AT, problem: "snippet_too_short" },
    ]);
    // Padding with whitespace doesn't count.
    expect(check({ page: 1, snippet: "  Acme \n\n Ledger  " })).toEqual([
      { path: SNIPPET_AT, problem: "snippet_too_short" },
    ]);
    expect(check({ page: 1, snippet: " \n\t" })).toEqual([
      { path: SNIPPET_AT, problem: "snippet_too_short" },
    ]);
    // 12 characters.
    expect(check({ page: 1, snippet: "Acme Ledger " + "I" })).toEqual([]);
  });

  it("counts characters, not UTF-16 units", () => {
    const pages = ["Revenue 😀😀😀😀😀😀 up"];
    // 11 code points, 17 UTF-16 units.
    expect(check({ page: 1, snippet: "Revenue 😀😀😀" }, pages)).toEqual([
      { path: SNIPPET_AT, problem: "snippet_too_short" },
    ]);
    expect(check({ page: 1, snippet: "Revenue 😀😀😀😀" }, pages)).toEqual([]);
  });

  it("compares with the neutralised text the model saw", () => {
    // The model saw "[deck_page>" (prompt.ts neutraliseTags).
    expect(
      check({ page: 3, snippet: "Note: [deck_page> is not a tag here" }),
    ).toEqual([]);
    expect(
      check({ page: 3, snippet: "Note: <deck_page> is not a tag here" }),
    ).toEqual([{ path: SNIPPET_AT, problem: "snippet_not_on_page" }]);
  });

  it("neutralises each page on its own", () => {
    // Joined, "...<" + "deck_page" would read as a tag; per page it doesn't.
    const pages = ["Ratio of a to b <", "deck_page count is three"];
    expect(
      citationIssues(
        claims([
          { page: 1, snippet: "Ratio of a to b <" },
          { page: 2, snippet: "deck_page count" },
        ]),
        pages,
        ["criteria"],
      ),
    ).toEqual([]);
  });

  it("reports every failing citation with its full path", () => {
    expect(
      citationIssues(
        claims(
          [{ page: 9, snippet: "Acme Ledger Inc." }],
          [
            { page: 1, snippet: "Acme Ledger Inc." },
            { page: 3, snippet: "an invented claim" },
          ],
        ),
        PAGES,
        ["output", "criteria"],
      ),
    ).toEqual([
      {
        path: ["output", "criteria", 0, "citations", 0, "page"],
        problem: "page_not_in_deck",
      },
      {
        path: ["output", "criteria", 1, "citations", 1, "snippet"],
        problem: "snippet_not_on_page",
      },
    ]);
  });

  it("finds no page in an empty deck", () => {
    expect(check({ page: 1, snippet: "Acme Ledger Inc." }, [])).toEqual([
      {
        path: ["criteria", 0, "citations", 0, "page"],
        problem: "page_not_in_deck",
      },
    ]);
  });
});
