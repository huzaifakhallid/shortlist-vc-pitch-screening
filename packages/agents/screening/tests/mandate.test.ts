import type { WorkspaceConfig } from "@shortlist/schemas";
import { describe, expect, it } from "vitest";
import { mandateResultSchema, type DealProfile } from "../schema";
import { checkMandate } from "../steps/mandate";

// The §13 example filters. A fresh copy per call.
function filters(): WorkspaceConfig["filters"] {
  return {
    stages: ["pre-seed", "seed"],
    sectors: ["fintech", "climate", "devtools"],
    countries: ["PK", "AE", "SA"],
    roundSizeUsd: { min: 250000, max: 3000000 },
    excludedSectors: ["crypto-token", "gambling"],
  };
}

function profile(overrides: Partial<DealProfile> = {}): DealProfile {
  return {
    stage: "seed",
    sector: "fintech",
    country: "PK",
    roundSizeUsd: 1000000,
    ...overrides,
  };
}

function statusOf(
  result: ReturnType<typeof checkMandate>,
  rule: string,
): string | undefined {
  return result.checks.find((check) => check.rule === rule)?.status;
}

describe("checkMandate", () => {
  it("passes every rule for a deal inside the mandate", () => {
    const result = checkMandate(profile(), filters());
    expect(result.outcome).toBe("inside");
    expect(result.checks.map((c) => [c.rule, c.status])).toEqual([
      ["stage", "pass"],
      ["sector", "pass"],
      ["country", "pass"],
      ["roundSize", "pass"],
      ["exclusions", "pass"],
    ]);
    // The result is a valid step output.
    expect(mandateResultSchema.parse(result)).toEqual(result);
  });

  it.each([
    ["stage", { stage: "series-b" }],
    ["sector", { sector: "biotech" }],
    ["country", { country: "US" }],
  ] as const)("fails %s outside the fund's list, naming it", (rule, change) => {
    const result = checkMandate(profile(change), filters());
    expect(result.outcome).toBe("outside");
    expect(statusOf(result, rule)).toBe("fail");
    const check = result.checks.find((c) => c.rule === rule);
    expect(check?.reason).toContain("is not in the fund's");
    expect(result.checks.filter((c) => c.status === "fail")).toHaveLength(1);
  });

  it("treats other as a known value that fails the filter", () => {
    const result = checkMandate(
      profile({ stage: "other", sector: "other" }),
      filters(),
    );
    expect(result.outcome).toBe("outside");
    expect(statusOf(result, "stage")).toBe("fail");
    expect(statusOf(result, "sector")).toBe("fail");
    expect(statusOf(result, "exclusions")).toBe("pass");
  });

  it("matches list values ignoring case and surrounding whitespace", () => {
    const result = checkMandate(
      profile({ stage: " Seed ", sector: "FinTech" }),
      filters(),
    );
    expect(result.outcome).toBe("inside");
  });

  it("checks the round size range inclusively", () => {
    expect(
      checkMandate(profile({ roundSizeUsd: 250000 }), filters()).outcome,
    ).toBe("inside");
    expect(
      checkMandate(profile({ roundSizeUsd: 3000000 }), filters()).outcome,
    ).toBe("inside");

    const below = checkMandate(profile({ roundSizeUsd: 249999 }), filters());
    expect(below.outcome).toBe("outside");
    expect(below.checks[3]).toEqual({
      rule: "roundSize",
      status: "fail",
      reason: "Round size $249,999 is below the fund's minimum of $250,000",
    });

    const above = checkMandate(profile({ roundSizeUsd: 3000001 }), filters());
    expect(above.outcome).toBe("outside");
    expect(above.checks[3].reason).toBe(
      "Round size $3,000,001 is above the fund's maximum of $3,000,000",
    );
  });

  it("fails an excluded sector, even when it is also in the sector list", () => {
    const config = filters();
    config.sectors.push("gambling");
    const result = checkMandate(profile({ sector: "Gambling" }), config);
    expect(result.outcome).toBe("outside");
    expect(statusOf(result, "sector")).toBe("pass");
    expect(statusOf(result, "exclusions")).toBe("fail");
  });

  it.each([
    ["stage", { stage: null }],
    ["country", { country: null }],
    ["roundSize", { roundSizeUsd: null }],
  ] as const)(
    "gives needs-review, never a decline, when %s is unknown",
    (rule, change) => {
      const result = checkMandate(profile(change), filters());
      expect(result.outcome).toBe("undetermined");
      expect(statusOf(result, rule)).toBe("unknown");
      expect(result.checks.some((c) => c.status === "fail")).toBe(false);
    },
  );

  it("marks both sector and exclusions unknown when the sector is unknown", () => {
    const result = checkMandate(profile({ sector: null }), filters());
    expect(result.outcome).toBe("undetermined");
    expect(statusOf(result, "sector")).toBe("unknown");
    expect(statusOf(result, "exclusions")).toBe("unknown");
  });

  it("declines on a known failing field even when another is unknown", () => {
    const result = checkMandate(
      profile({ country: "US", roundSizeUsd: null }),
      filters(),
    );
    expect(result.outcome).toBe("outside");
    expect(statusOf(result, "country")).toBe("fail");
    expect(statusOf(result, "roundSize")).toBe("unknown");
  });

  it("treats an empty list as no filter, even for an unknown value", () => {
    const config = filters();
    config.stages = [];
    config.sectors = [];
    config.countries = [];
    config.excludedSectors = [];
    const result = checkMandate(
      profile({ stage: null, sector: null, country: null }),
      config,
    );
    expect(result.outcome).toBe("inside");
    expect(result.checks.find((c) => c.rule === "stage")?.reason).toBe(
      "The fund has no stage filter",
    );
    expect(result.checks.find((c) => c.rule === "exclusions")?.reason).toBe(
      "The fund excludes no sectors",
    );
  });
});
