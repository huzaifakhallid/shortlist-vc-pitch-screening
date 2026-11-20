import { listDeals, type DealSummary } from "@shortlist/db";
import type { Metadata } from "next";
import Link from "next/link";
import { Banner } from "@/components/banner";
import { DealFilters } from "@/components/deals/deal-filters";
import { DealListKeys } from "@/components/deals/deal-list-keys";
import { DealRow } from "@/components/deals/deal-row";
import { DealSearch } from "@/components/deals/deal-search";
import { DealTabs } from "@/components/deals/deal-tabs";
import { FiltersSheet } from "@/components/deals/filters-sheet";
import { EmptyState } from "@/components/empty-state";
import { authorize } from "@/lib/authorize";
import {
  activeFilterCount,
  dealFiltersSchema,
  dealsHref,
  filterDeals,
  type DealFilters as Filters,
} from "@/lib/deals/list";
import { requireSession } from "@/lib/session";
import { DealsHeader } from "./deals-header";

export const metadata: Metadata = { title: "Deals · Shortlist" };

const WEEK_MS = 7 * 24 * 3_600_000;

function subtitle(all: readonly DealSummary[], now: Date): string {
  const thisWeek = all.filter(
    (d) => now.getTime() - d.receivedAt.getTime() < WEEK_MS,
  ).length;
  const result = filterDeals(all, dealFiltersSchema.parse({}));
  const pitches = thisWeek === 1 ? "pitch" : "pitches";
  return `${String(thisWeek)} ${pitches} this week · ${String(result.tabCounts.shortlisted)} shortlisted · ${String(result.tabCounts.outside)} outside your focus`;
}

const TAB_EMPTY: Record<Filters["tab"], string> = {
  shortlisted:
    "Nothing shortlisted yet. Screened pitches inside your focus appear here.",
  all: "No pitches yet.",
  review: "Nothing needs review right now.",
  outside: "No pitches outside your focus.",
};

// The Deals list (§18): directory-style rows, tabs, search and sidebar
// filters, from the session's workspace. loading.tsx is the Suspense
// boundary for the session read.
export default async function DealsPage({ searchParams }: PageProps<"/deals">) {
  const session = await requireSession();
  authorize(session, "deal.view");

  const parsed = dealFiltersSchema.safeParse(await searchParams);
  if (!parsed.success) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <DealsHeader />
        <Banner
          action={
            <Link
              href="/deals"
              className="rounded-xs font-medium underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Clear filters
            </Link>
          }
        >
          This link has filters Shortlist doesn&apos;t recognise.
        </Banner>
      </div>
    );
  }
  const filters = parsed.data;
  const all = await listDeals(session.workspaceId);
  const now = new Date();

  if (all.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <DealsHeader />
        <section aria-label="Deals" className="border-t">
          <EmptyState>
            No pitches yet. Share your pitch form or forward your deal inbox.
          </EmptyState>
        </section>
      </div>
    );
  }

  const result = filterDeals(all, filters);
  const filtered = activeFilterCount(filters) > 0 || filters.q !== "";
  const sidebar = <DealFilters filters={filters} result={result} />;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <DealsHeader
        subtitle={subtitle(all, now)}
        actions={<DealSearch filters={filters} />}
      />
      <div className="flex gap-10">
        <aside aria-label="Filters" className="hidden w-60 shrink-0 md:block">
          {sidebar}
        </aside>
        <div className="min-w-0 flex-1">
          <div className="mb-3 md:hidden">
            <FiltersSheet active={activeFilterCount(filters)}>
              {sidebar}
            </FiltersSheet>
          </div>
          <DealTabs filters={filters} counts={result.tabCounts} />
          {result.deals.length === 0 ? (
            <div className="grid place-items-center gap-3 py-16 text-center">
              <p className="max-w-sm text-muted-foreground">
                {filtered
                  ? "No deals match this search and these filters."
                  : TAB_EMPTY[filters.tab]}
              </p>
              {filtered && (
                <Link
                  href={dealsHref({ tab: filters.tab })}
                  className="rounded-xs text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Clear search and filters
                </Link>
              )}
            </div>
          ) : (
            <DealListKeys>
              <ul aria-label="Deals">
                {result.deals.map((deal) => (
                  <DealRow key={deal.id} deal={deal} now={now} />
                ))}
              </ul>
              <p className="mt-4 hidden text-xs text-faint-foreground md:block">
                Press j and k to move between deals, Enter to open one.
              </p>
            </DealListKeys>
          )}
        </div>
      </div>
    </div>
  );
}
