import type { DealSummary } from "@shortlist/db";
import type { DealStage } from "@shortlist/schemas";
import { z } from "zod";

// The Deals list (§18): tabs by stage group, a search box and sidebar filters
// by stage, sector, country, score and flags, all in the URL so a filtered
// list can be shared. Plain functions over the workspace's deals.

export const STAGE_LABEL: Record<DealStage, string> = {
  RECEIVED: "New",
  NEEDS_REVIEW: "Needs review",
  OUT_OF_MANDATE: "Outside focus",
  SCREENED: "Screened",
  FIRST_CALL: "First call",
  DILIGENCE: "Diligence",
  IC: "IC",
  INVESTED: "Invested",
  PASSED: "Passed",
};

export const DEAL_TABS = [
  { key: "shortlisted", label: "Shortlisted" },
  { key: "all", label: "All" },
  { key: "review", label: "Needs review" },
  { key: "outside", label: "Outside focus" },
] as const;
export type DealTab = (typeof DEAL_TABS)[number]["key"];

// Shortlisted: inside the fund's focus and scored, still in play.
const SHORTLISTED: ReadonlySet<DealStage> = new Set<DealStage>([
  "SCREENED",
  "FIRST_CALL",
  "DILIGENCE",
  "IC",
]);

function inTab(deal: DealSummary, tab: DealTab): boolean {
  switch (tab) {
    case "shortlisted":
      return SHORTLISTED.has(deal.stage);
    case "all":
      return true;
    case "review":
      return deal.stage === "NEEDS_REVIEW";
    case "outside":
      return deal.stage === "OUT_OF_MANDATE";
  }
}

export const SCORE_BANDS = [
  {
    key: "70",
    label: "70 and above",
    min: 70,
    below: Infinity,
    tone: "bg-success-soft text-success",
  },
  {
    key: "50",
    label: "50 to 69",
    min: 50,
    below: 70,
    tone: "bg-warning-soft text-warning",
  },
  {
    key: "0",
    label: "Below 50",
    min: 0,
    below: 50,
    tone: "bg-danger-soft text-danger",
  },
] as const;
export type ScoreBand = (typeof SCORE_BANDS)[number]["key"];

export const FLAGS = [
  { key: "hidden", label: "Hidden text" },
  { key: "mismatch", label: "Numbers don't match" },
] as const;
export type Flag = (typeof FLAGS)[number]["key"];

export function hasFlag(deal: DealSummary, flag: Flag): boolean {
  switch (flag) {
    case "hidden":
      return deal.flags?.hiddenText === true;
    case "mismatch":
      return deal.flags?.mismatch === true;
  }
}

// A repeated query parameter arrives as an array, a single one as a string.
// At most 20 values of at most 64 characters each per parameter.
const value = z.string().max(64);
const list = z
  .union([value, z.array(value).max(20)])
  .optional()
  .transform((value) =>
    value === undefined ? [] : typeof value === "string" ? [value] : value,
  );

const tabKeys = DEAL_TABS.map((t) => t.key) as [DealTab, ...DealTab[]];
const bandKeys = SCORE_BANDS.map((b) => b.key) as [ScoreBand, ...ScoreBand[]];
const flagKeys = FLAGS.map((f) => f.key) as [Flag, ...Flag[]];

// The list's URL parameters. No tab means Shortlisted, the list's default
// view (mockup). Unknown tab, score or flag values make the link invalid.
export const dealFiltersSchema = z.object({
  tab: z
    .enum(tabKeys)
    .optional()
    .transform((tab) => tab ?? "shortlisted"),
  q: z
    .string()
    .max(200)
    .optional()
    .transform((q) => (q ?? "").trim()),
  stage: list,
  sector: list,
  country: list,
  score: list.pipe(z.array(z.enum(bandKeys))),
  flag: list.pipe(z.array(z.enum(flagKeys))),
});
export type DealFilters = z.infer<typeof dealFiltersSchema>;

export type FacetKey = "stage" | "sector" | "country";

function facetValue(deal: DealSummary, facet: FacetKey): string | null {
  return deal.profile?.[facet] ?? null;
}

function matchesSearch(deal: DealSummary, q: string): boolean {
  if (q === "") {
    return true;
  }
  const needle = q.toLowerCase();
  return [
    deal.companyName,
    deal.oneLiner,
    deal.founderName,
    deal.founderEmail,
    deal.domain,
  ].some((field) => field?.toLowerCase().includes(needle) === true);
}

function inRange(score: number, range: (typeof SCORE_BANDS)[number]): boolean {
  return score >= range.min && score < range.below;
}

const BAND_BY_KEY = Object.fromEntries(
  SCORE_BANDS.map((band) => [band.key, band]),
) as Record<ScoreBand, (typeof SCORE_BANDS)[number]>;

function inBand(score: number | null, band: ScoreBand): boolean {
  return score !== null && inRange(score, BAND_BY_KEY[band]);
}

// The ScorePill colour of a score (0-100), from its band.
export function scoreTone(score: number): string {
  const band = SCORE_BANDS.find((b) => inRange(score, b));
  if (band === undefined) {
    throw new Error(`Score ${String(score)} is outside 0-100`);
  }
  return band.tone;
}

// The sidebar's filters: any selected value within a group, every group.
function matchesSidebar(deal: DealSummary, filters: DealFilters): boolean {
  const facets: FacetKey[] = ["stage", "sector", "country"];
  for (const facet of facets) {
    const selected = filters[facet];
    if (selected.length > 0) {
      const value = facetValue(deal, facet);
      if (value === null || !selected.includes(value)) {
        return false;
      }
    }
  }
  if (
    filters.score.length > 0 &&
    !filters.score.some((band) => inBand(deal.totalScore, band))
  ) {
    return false;
  }
  if (
    filters.flag.length > 0 &&
    !filters.flag.some((flag) => hasFlag(deal, flag))
  ) {
    return false;
  }
  return true;
}

// Highest score first; unscored deals after scored ones; then newest.
function byRank(a: DealSummary, b: DealSummary): number {
  if (a.totalScore !== b.totalScore) {
    if (a.totalScore === null) {
      return 1;
    }
    if (b.totalScore === null) {
      return -1;
    }
    return b.totalScore - a.totalScore;
  }
  return b.receivedAt.getTime() - a.receivedAt.getTime();
}

export type FacetOption = { value: string; count: number };

export type DealListResult = {
  deals: DealSummary[];
  // Deals per tab, with the search and sidebar filters applied.
  tabCounts: Record<DealTab, number>;
  // The values present in the current tab and search, with their counts:
  // what the sidebar offers.
  facets: Record<FacetKey, FacetOption[]>;
  bandCounts: Record<ScoreBand, number>;
  flagCounts: Record<Flag, number>;
};

function countBy<K extends string>(
  keys: readonly K[],
  deals: readonly DealSummary[],
  test: (deal: DealSummary, key: K) => boolean,
): Record<K, number> {
  return Object.fromEntries(
    keys.map((key) => [key, deals.filter((d) => test(d, key)).length]),
  ) as Record<K, number>;
}

function facetOptions(
  all: readonly DealSummary[],
  deals: readonly DealSummary[],
  facet: FacetKey,
  selected: readonly string[],
): FacetOption[] {
  const inWorkspace = new Set(all.map((deal) => facetValue(deal, facet)));
  const counts = new Map<string, number>();
  for (const deal of deals) {
    const value = facetValue(deal, facet);
    if (value !== null) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  // A selected value of the workspace stays listed (with 0) so it can be
  // cleared. Values only the URL names are never listed.
  for (const value of selected) {
    if (!counts.has(value) && inWorkspace.has(value)) {
      counts.set(value, 0);
    }
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .toSorted((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function filterDeals(
  all: readonly DealSummary[],
  filters: DealFilters,
): DealListResult {
  const searched = all.filter((d) => matchesSearch(d, filters.q));
  const inCurrentTab = searched.filter((d) => inTab(d, filters.tab));
  const sidebarFiltered = searched.filter((d) => matchesSidebar(d, filters));
  return {
    deals: sidebarFiltered
      .filter((d) => inTab(d, filters.tab))
      .toSorted(byRank),
    tabCounts: countBy(tabKeys, sidebarFiltered, inTab),
    facets: {
      stage: facetOptions(all, inCurrentTab, "stage", filters.stage),
      sector: facetOptions(all, inCurrentTab, "sector", filters.sector),
      country: facetOptions(all, inCurrentTab, "country", filters.country),
    },
    bandCounts: countBy(bandKeys, inCurrentTab, (d, band) =>
      inBand(d.totalScore, band),
    ),
    flagCounts: countBy(flagKeys, inCurrentTab, hasFlag),
  };
}

export function activeFilterCount(filters: DealFilters): number {
  return (
    filters.stage.length +
    filters.sector.length +
    filters.country.length +
    filters.score.length +
    filters.flag.length
  );
}

// The list's URL with these filters, for links (tabs, clearing).
export function dealsHref(filters: Partial<DealFilters>): string {
  const params = new URLSearchParams();
  if (filters.tab !== undefined && filters.tab !== "shortlisted") {
    params.set("tab", filters.tab);
  }
  if (filters.q !== undefined && filters.q !== "") {
    params.set("q", filters.q);
  }
  for (const key of ["stage", "sector", "country", "score", "flag"] as const) {
    for (const value of filters[key] ?? []) {
      params.append(key, value);
    }
  }
  const query = params.toString();
  return query === "" ? "/deals" : `/deals?${query}`;
}
