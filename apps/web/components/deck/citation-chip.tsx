"use client";

import type { Citation } from "@shortlist/schemas";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDeck } from "./deck-context";

// ui-design-system CitationChip: "p.7". Jumps the deck viewer to the page
// and highlights the quote. Without a deck to show it is plain text.
export function CitationChip({
  citation,
  interactive,
}: {
  citation: Citation;
  interactive: boolean;
}) {
  const label = `p.${String(citation.page)}`;
  const base =
    "tabular ml-1 inline-flex rounded border px-1.5 align-baseline text-xs font-medium";
  if (!interactive) {
    return (
      <span
        className={cn(base, "text-muted-foreground")}
        title={citation.snippet}
      >
        {label}
      </span>
    );
  }
  return <InteractiveChip citation={citation} label={label} base={base} />;
}

// Opens a page without quoting anything on it (a hidden-text flag points at
// a page, but its text isn't a quote the AI used).
export function ShowPageButton({ page }: { page: number }) {
  const { showPage, viewerRef } = useDeck();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        showPage(page);
        viewerRef.current?.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
      }}
    >
      View page {page}
    </Button>
  );
}

function InteractiveChip({
  citation,
  label,
  base,
}: {
  citation: Citation;
  label: string;
  base: string;
}) {
  const { selected, jump } = useDeck();
  const active =
    selected !== null &&
    selected.page === citation.page &&
    selected.snippet === citation.snippet;
  return (
    <button
      type="button"
      onClick={() => {
        jump(citation);
      }}
      aria-pressed={active}
      aria-label={`Show page ${String(citation.page)}: "${citation.snippet}"`}
      title={citation.snippet}
      className={cn(
        base,
        "cursor-pointer bg-background text-primary outline-none hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-ring",
        active && "border-brand/40 bg-brand-soft",
      )}
    >
      {label}
    </button>
  );
}
