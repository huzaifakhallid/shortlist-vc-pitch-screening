import Link from "next/link";
import {
  activeFilterCount,
  dealsHref,
  FLAGS,
  SCORE_BANDS,
  type DealFilters as Filters,
  type DealListResult,
} from "@/lib/deals/list";
import { countryName, labelOf } from "@/lib/format";
import { FilterOption } from "./filter-option";

type Group = "stage" | "sector" | "country" | "score" | "flag";

function toggled(filters: Filters, group: Group, value: string): string {
  const current: readonly string[] = filters[group];
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  return dealsHref({ ...filters, [group]: next });
}

function Heading({ children }: { children: string }) {
  return (
    <h3 className="mb-1 text-xs font-semibold tracking-wide text-faint-foreground uppercase">
      {children}
    </h3>
  );
}

// The Deals sidebar (ui-design-system: plain, no box): stage, sector,
// country, score and flags (§18). Values come from the deals in the current
// tab and search, with their counts.
export function DealFilters({
  filters,
  result,
}: {
  filters: Filters;
  result: DealListResult;
}) {
  const facets = [
    { group: "stage", title: "Funding stage", label: labelOf },
    { group: "sector", title: "Sector", label: labelOf },
    { group: "country", title: "Country", label: countryName },
  ] as const;

  return (
    <div>
      {facets.map(({ group, title, label }) => (
        <section key={group} aria-label={title} className="mt-5 first:mt-0">
          <Heading>{title}</Heading>
          {result.facets[group].length === 0 ? (
            <p className="py-1 text-xs text-faint-foreground">None yet</p>
          ) : (
            result.facets[group].map((option) => (
              <FilterOption
                key={option.value}
                label={label(option.value)}
                count={option.count}
                checked={filters[group].includes(option.value)}
                href={toggled(filters, group, option.value)}
              />
            ))
          )}
        </section>
      ))}
      <section aria-label="Score" className="mt-5">
        <Heading>Score</Heading>
        {SCORE_BANDS.map((band) => (
          <FilterOption
            key={band.key}
            label={band.label}
            count={result.bandCounts[band.key]}
            checked={filters.score.includes(band.key)}
            href={toggled(filters, "score", band.key)}
          />
        ))}
      </section>
      <section aria-label="Flags" className="mt-5">
        <Heading>Flags</Heading>
        {FLAGS.map((flag) => (
          <FilterOption
            key={flag.key}
            label={flag.label}
            count={result.flagCounts[flag.key]}
            checked={filters.flag.includes(flag.key)}
            href={toggled(filters, "flag", flag.key)}
          />
        ))}
      </section>
      {activeFilterCount(filters) > 0 && (
        <Link
          href={dealsHref({ tab: filters.tab, q: filters.q })}
          className="mt-5 inline-block rounded-xs text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Clear filters
        </Link>
      )}
    </div>
  );
}
