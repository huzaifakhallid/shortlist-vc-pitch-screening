import type { WorkspaceConfig } from "@shortlist/schemas";
import { describe, expect, it } from "vitest";
import { dealFactsSchemaFor, mandateResultSchema, OTHER } from "../schema";

function filters(): WorkspaceConfig["filters"] {
  return {
    stages: ["pre-seed", "seed"],
    sectors: ["fintech", "climate"],
    countries: ["PK"],
    roundSizeUsd: { min: 250000, max: 3000000 },
    excludedSectors: ["gambling", "fintech"],
  };
}

const cite = [{ page: 2, snippet: "Seed round of $1.5M" }];

function facts(stage: string | null, sector: string | null) {
  return {
    problem: [{ statement: "SMEs reconcile by hand", citations: cite }],
    solution: [],
    market: [],
    traction: [],
    team: [],
    ask: [],
    deckProfile: {
      stage: stage === null ? null : { value: stage, citations: cite },
      sector: sector === null ? null : { value: sector, citations: cite },
      country: null,
      roundSizeUsd: { value: 1500000, citations: cite },
    },
  };
}

function enumValues(
  schema: ReturnType<typeof dealFactsSchemaFor>,
  field: "stage" | "sector",
): readonly string[] {
  return schema.shape.deckProfile.shape[field].unwrap().shape.value.options;
}

describe("dealFactsSchemaFor", () => {
  it("limits stage and sector to the fund's vocabulary plus other", () => {
    const schema = dealFactsSchemaFor(filters());
    expect(enumValues(schema, "stage")).toEqual(["pre-seed", "seed", OTHER]);
    // Sectors and excluded sectors, each once.
    expect(enumValues(schema, "sector")).toEqual([
      "fintech",
      "climate",
      "gambling",
      OTHER,
    ]);
    expect(schema.safeParse(facts("seed", "gambling")).success).toBe(true);
    expect(schema.safeParse(facts(OTHER, OTHER)).success).toBe(true);
    expect(schema.safeParse(facts(null, null)).success).toBe(true);
    expect(schema.safeParse(facts("series-a", "fintech")).success).toBe(false);
    expect(schema.safeParse(facts("seed", "biotech")).success).toBe(false);
  });

  it("gives only other for an empty fund list", () => {
    const config = filters();
    config.stages = [];
    config.sectors = [];
    config.excludedSectors = [];
    const schema = dealFactsSchemaFor(config);
    expect(enumValues(schema, "stage")).toEqual([OTHER]);
    expect(enumValues(schema, "sector")).toEqual([OTHER]);
  });

  it("requires at least one citation per fact and profile value", () => {
    const schema = dealFactsSchemaFor(filters());
    const noFactCitation = facts("seed", "fintech");
    noFactCitation.problem = [{ statement: "SMEs", citations: [] }];
    expect(schema.safeParse(noFactCitation).success).toBe(false);

    const noValueCitation = facts("seed", "fintech");
    noValueCitation.deckProfile.stage = { value: "seed", citations: [] };
    expect(schema.safeParse(noValueCitation).success).toBe(false);
  });
});

describe("mandateResultSchema", () => {
  const check = (rule: string) => ({ rule, status: "pass", reason: "ok" });
  const order = ["stage", "sector", "country", "roundSize", "exclusions"];

  it("takes one check per rule in the fixed order", () => {
    expect(
      mandateResultSchema.safeParse({
        outcome: "inside",
        checks: order.map(check),
      }).success,
    ).toBe(true);
  });

  it("rejects reordered, repeated or missing checks", () => {
    for (const rules of [
      ["sector", "stage", "country", "roundSize", "exclusions"],
      ["stage", "stage", "country", "roundSize", "exclusions"],
      ["stage", "sector", "country", "roundSize"],
    ]) {
      expect(
        mandateResultSchema.safeParse({
          outcome: "inside",
          checks: rules.map(check),
        }).success,
      ).toBe(false);
    }
  });
});
