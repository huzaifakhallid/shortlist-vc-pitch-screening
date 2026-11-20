import { describe, expect, it } from "vitest";
import {
  dealFiltersSchema,
  dealsHref,
  filterDeals,
  scoreTone,
  type DealFilters,
} from "@/lib/deals/list";
import { demoDealViews } from "./deal-fixtures";

function filters(input: Record<string, string | string[]> = {}): DealFilters {
  return dealFiltersSchema.parse(input);
}

function names(input: Record<string, string | string[]> = {}): string[] {
  return filterDeals(demoDealViews(), filters(input)).deals.map(
    (d) => d.companyName,
  );
}

describe("dealFiltersSchema", () => {
  it("defaults to the Shortlisted tab with nothing selected", () => {
    expect(filters()).toEqual({
      tab: "shortlisted",
      q: "",
      stage: [],
      sector: [],
      country: [],
      score: [],
      flag: [],
    });
  });

  it("takes repeated parameters as lists", () => {
    expect(
      filters({ sector: ["fintech", "climate"], score: "70" }),
    ).toMatchObject({ sector: ["fintech", "climate"], score: ["70"] });
  });

  it("refuses unknown tabs, score bands and flags", () => {
    for (const input of [
      { tab: "pinned" },
      { score: "90" },
      { flag: "spam" },
    ]) {
      expect(dealFiltersSchema.safeParse(input).success).toBe(false);
    }
  });
});

describe("filterDeals", () => {
  it("ranks the shortlist by score, highest first", () => {
    expect(names()).toEqual(["Paylane", "Kilnworks", "Driftcode", "Tallyfold"]);
  });

  it("lists every deal under All, scored first, then newest", () => {
    expect(names({ tab: "all" })).toEqual([
      "Paylane",
      "Kilnworks",
      "Driftcode",
      "Tallyfold",
      "Quillstack",
      "Coinmint",
      "Brightpour",
      "Gridleaf",
      "Harborline",
    ]);
  });

  it("splits needs review and outside focus by stage", () => {
    expect(names({ tab: "review" })).toEqual(["Gridleaf"]);
    expect(names({ tab: "outside" })).toEqual(["Coinmint", "Harborline"]);
  });

  it("filters by sidebar values: any within a group, every group", () => {
    expect(names({ sector: ["fintech", "climate"], country: "PK" })).toEqual([
      "Paylane",
    ]);
    expect(names({ score: "50" })).toEqual(["Tallyfold"]);
    expect(names({ tab: "all", score: ["70", "0"] })).toEqual([
      "Paylane",
      "Kilnworks",
      "Driftcode",
    ]);
  });

  it("filters by flags", () => {
    expect(names({ flag: "hidden" })).toEqual(["Tallyfold"]);
    expect(names({ flag: "mismatch" })).toEqual(["Driftcode"]);
    expect(names({ flag: ["hidden", "mismatch"] })).toEqual([
      "Driftcode",
      "Tallyfold",
    ]);
  });

  it("searches names, one-liners, founders and domains", () => {
    expect(names({ tab: "all", q: "WhatsApp" })).toEqual(["Tallyfold"]);
    expect(names({ tab: "all", q: "sara malik" })).toEqual(["Gridleaf"]);
    expect(names({ tab: "all", q: "quillstack.example" })).toEqual([
      "Quillstack",
    ]);
    expect(names({ q: "no such company" })).toEqual([]);
  });

  it("counts tabs with the filters applied and facets within the tab", () => {
    const result = filterDeals(demoDealViews(), filters({ sector: "fintech" }));

    expect(result.tabCounts).toEqual({
      shortlisted: 2,
      all: 3,
      review: 0,
      outside: 1,
    });
    expect(result.facets.sector).toEqual([
      { value: "fintech", count: 2 },
      { value: "climate", count: 1 },
      { value: "devtools", count: 1 },
    ]);
    expect(result.bandCounts).toEqual({ "70": 3, "50": 1, "0": 0 });
    expect(result.flagCounts).toEqual({ hidden: 1, mismatch: 1 });
  });

  it("keeps a selected value listed when nothing in the tab has it", () => {
    const result = filterDeals(demoDealViews(), filters({ country: "GB" }));

    expect(result.deals).toEqual([]);
    expect(result.facets.country).toContainEqual({ value: "GB", count: 0 });
  });
});

describe("filter limits", () => {
  it("refuses long searches, long values and too many values", () => {
    expect(dealFiltersSchema.safeParse({ q: "x".repeat(201) }).success).toBe(
      false,
    );
    expect(
      dealFiltersSchema.safeParse({ sector: "x".repeat(65) }).success,
    ).toBe(false);
    expect(
      dealFiltersSchema.safeParse({
        country: Array.from({ length: 21 }, (_, i) => `C${String(i)}`),
      }).success,
    ).toBe(false);
  });

  it("never lists a selected value that no deal in the workspace has", () => {
    const result = filterDeals(
      demoDealViews(),
      filters({ sector: "<b>made-up</b>" }),
    );

    expect(result.facets.sector.map((o) => o.value)).not.toContain(
      "<b>made-up</b>",
    );
  });
});

describe("scoreTone", () => {
  it("colours scores by band", () => {
    expect(scoreTone(88)).toBe("bg-success-soft text-success");
    expect(scoreTone(70)).toBe("bg-success-soft text-success");
    expect(scoreTone(69.8)).toBe("bg-warning-soft text-warning");
    expect(scoreTone(20)).toBe("bg-danger-soft text-danger");
    expect(() => scoreTone(-1)).toThrow("outside 0-100");
  });
});

describe("dealsHref", () => {
  it("writes only what differs from the default list", () => {
    expect(dealsHref(filters())).toBe("/deals");
    expect(
      dealsHref({ ...filters(), tab: "all", sector: ["fintech", "climate"] }),
    ).toBe("/deals?tab=all&sector=fintech&sector=climate");
    expect(dealsHref({ q: "pay & co" })).toBe("/deals?q=pay+%26+co");
  });
});
