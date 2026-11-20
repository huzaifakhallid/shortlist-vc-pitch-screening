import Link from "next/link";
import {
  DEAL_TABS,
  dealsHref,
  type DealFilters,
  type DealListResult,
} from "@/lib/deals/list";
import { cn } from "@/lib/utils";

// ui-design-system Tabs (underline): Shortlisted, All, Needs review,
// Outside focus, each with its count.
export function DealTabs({
  filters,
  counts,
}: {
  filters: DealFilters;
  counts: DealListResult["tabCounts"];
}) {
  return (
    <nav
      aria-label="Deal views"
      className="mb-1 flex gap-6 overflow-x-auto border-b"
    >
      {DEAL_TABS.map((tab) => {
        const active = tab.key === filters.tab;
        return (
          <Link
            key={tab.key}
            href={dealsHref({ ...filters, tab: tab.key })}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 rounded-xs border-b-2 py-2 font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-brand text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            <span className="tabular ml-1 font-normal text-faint-foreground">
              {counts[tab.key]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
