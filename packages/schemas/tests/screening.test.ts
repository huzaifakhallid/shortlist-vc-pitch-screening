import { describe, expect, it } from "vitest";
import {
  screeningOutputSchema,
  type MandateResult,
  type ScreeningOutput,
} from "../src/screening";

const cite = [{ page: 1, snippet: "Seed round of $1.5M" }];

function mandate(outcome: MandateResult["outcome"]): MandateResult {
  const status = outcome === "inside" ? "pass" : "fail";
  return {
    outcome,
    checks: [
      { rule: "stage", status, reason: "stage" },
      { rule: "sector", status: "pass", reason: "sector" },
      { rule: "country", status: "pass", reason: "country" },
      { rule: "roundSize", status: "pass", reason: "round size" },
      { rule: "exclusions", status: "pass", reason: "exclusions" },
    ],
  };
}

function output(change: Partial<ScreeningOutput> = {}): ScreeningOutput {
  return {
    facts: {
      problem: [{ statement: "Shops reconcile by hand", citations: cite }],
      solution: [],
      market: [],
      traction: [],
      team: [],
      ask: [],
      deckProfile: {
        stage: { value: "seed", citations: cite },
        sector: null,
        country: null,
        roundSizeUsd: null,
      },
    },
    profile: {
      stage: "seed",
      sector: "fintech",
      country: "PK",
      roundSizeUsd: 1_500_000,
    },
    mismatches: [],
    hiddenSpans: [],
    mandate: mandate("inside"),
    scores: {
      criteria: [
        {
          key: "team",
          reasoning: "Relevant experience",
          score: 4,
          confidence: "high",
          citations: cite,
        },
      ],
    },
    totalScore: 80,
    ...change,
  };
}

describe("screeningOutputSchema", () => {
  it("accepts scored output inside the mandate and unscored output outside it", () => {
    expect(screeningOutputSchema.safeParse(output()).success).toBe(true);
    expect(
      screeningOutputSchema.safeParse(
        output({
          mandate: mandate("outside"),
          scores: null,
          totalScore: null,
        }),
      ).success,
    ).toBe(true);
  });

  it("refuses a deal inside the mandate without scores", () => {
    expect(
      screeningOutputSchema.safeParse(
        output({ scores: null, totalScore: null }),
      ).success,
    ).toBe(false);
  });

  it("refuses scores on a deal outside or undetermined", () => {
    for (const outcome of ["outside", "undetermined"] as const) {
      expect(
        screeningOutputSchema.safeParse(output({ mandate: mandate(outcome) }))
          .success,
      ).toBe(false);
    }
  });

  it("refuses scores without a total, and a total without scores", () => {
    expect(
      screeningOutputSchema.safeParse(output({ totalScore: null })).success,
    ).toBe(false);
    expect(
      screeningOutputSchema.safeParse(
        output({ mandate: mandate("outside"), scores: null }),
      ).success,
    ).toBe(false);
  });

  it("refuses a total outside 20-100", () => {
    for (const totalScore of [19.8, 100.2]) {
      expect(
        screeningOutputSchema.safeParse(output({ totalScore })).success,
      ).toBe(false);
    }
  });
});
