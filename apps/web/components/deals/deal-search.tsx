import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { DealFilters } from "@/lib/deals/list";

// A plain GET form: searching keeps the current tab and filters.
export function DealSearch({ filters }: { filters: DealFilters }) {
  return (
    <form
      action="/deals"
      method="get"
      role="search"
      className="relative w-full sm:w-72"
    >
      <label htmlFor="deal-search" className="sr-only">
        Search companies or founders
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint-foreground"
      />
      <Input
        id="deal-search"
        type="search"
        name="q"
        defaultValue={filters.q}
        placeholder="Search companies or founders"
        className="pl-8"
      />
      {filters.tab !== "shortlisted" && (
        <input type="hidden" name="tab" value={filters.tab} />
      )}
      {(["stage", "sector", "country", "score", "flag"] as const).flatMap(
        (key) =>
          filters[key].map((value) => (
            <input
              key={`${key}-${value}`}
              type="hidden"
              name={key}
              value={value}
            />
          )),
      )}
    </form>
  );
}
