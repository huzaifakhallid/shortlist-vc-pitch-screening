import { neutraliseTags } from "@shortlist/agents-shared";
import type { Citation } from "../schema";

// §7.2 step 7: each citation's snippet must appear on the page it cites.
// Runs on the facts' citations (step 4) and on the rubric scores' citations
// (step 6), which the scorer takes from the facts.
//
// "Page text" is the page's visible text from page reading (§7.2 step 2),
// never the PDF text layer: a claim the deck doesn't visibly make can't be
// cited (§15.2). The facts call reads that text through untrustedText, which
// neutralises tag-like "<" to "[" (prompt.ts), so snippets are compared with
// neutraliseTags(page text), page by page. The facts step must therefore
// send each page in its own block: neutralising pages joined together can
// differ where one page's end and the next page's start read as a tag.
//
// "Appears" means: after replacing every run of whitespace (JavaScript \s:
// spaces, tabs, line breaks, no-break and other Unicode spaces) with one
// space and trimming both ends, the snippet has at least
// MIN_SNIPPET_CHARACTERS characters (code points) and is a substring of the
// page text. Nothing else is normalised: case, punctuation, quotes, digits
// and zero-width characters must match exactly.

// Shorter quotes ("$4k", "Team") appear on too many pages to show anything.
export const MIN_SNIPPET_CHARACTERS = 12;

export type CitationProblem =
  "page_not_in_deck" | "snippet_too_short" | "snippet_not_on_page";

// Where a citation fails, by path (e.g. ["criteria", 2, "citations", 0,
// "snippet"]) and problem, never by its content: these become Zod
// refinement issues for the corrective retry (llm-call skill).
export type CitationIssue = {
  path: (string | number)[];
  problem: CitationProblem;
};

// Checks every citation of every claim. `pageTexts[n - 1]` is page n's
// visible text as page reading returned it (before neutralising). `path` is
// where the claims sit in the model output, e.g. ["criteria"].
export function citationIssues(
  claims: readonly { citations: readonly Citation[] }[],
  pageTexts: readonly string[],
  path: readonly (string | number)[],
): CitationIssue[] {
  const pages = pageTexts.map((text) =>
    collapseWhitespace(neutraliseTags(text)),
  );
  const issues: CitationIssue[] = [];
  claims.forEach((claim, claimIndex) => {
    claim.citations.forEach((citation, citationIndex) => {
      const at = [...path, claimIndex, "citations", citationIndex];
      // Undefined for 0, negative, fractional or past-the-end page numbers.
      const page = pages[citation.page - 1];
      if (page === undefined) {
        issues.push({ path: [...at, "page"], problem: "page_not_in_deck" });
        return;
      }
      const snippet = collapseWhitespace(citation.snippet);
      // Counted in code points, so an emoji or a non-Latin letter is one
      // character whatever its UTF-16 length.
      if (Array.from(snippet).length < MIN_SNIPPET_CHARACTERS) {
        issues.push({
          path: [...at, "snippet"],
          problem: "snippet_too_short",
        });
        return;
      }
      if (!page.includes(snippet)) {
        issues.push({
          path: [...at, "snippet"],
          problem: "snippet_not_on_page",
        });
      }
    });
  });
  return issues;
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}
