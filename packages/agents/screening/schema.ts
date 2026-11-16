import type { WorkspaceConfig } from "@shortlist/schemas";
import { z } from "zod";

// Screening's inputs and outputs (§7.2). Model outputs here don't use
// .default() (llm-call skill): a missing field is invalid, never filled in.

const nonEmpty = z.string().min(1);

// The company's country (where it operates), never a founder's nationality.
const countryCode = z
  .string()
  .regex(/^[A-Z]{2}$/, "Country must be an ISO 3166-1 alpha-2 code");

const roundSizeUsd = z.int().min(0);

// Deck pages are numbered from 1, in the order the renderer writes them.
export const pageNumberSchema = z.int().min(1);

// A quote from a deck page that supports a claim (§7.2 steps 4, 6). The
// snippet rules (on the page, at least 12 characters) are in
// steps/citations.ts.
export const citationSchema = z.strictObject({
  page: pageNumberSchema,
  snippet: nonEmpty,
});
export type Citation = z.infer<typeof citationSchema>;

const citations = z.array(citationSchema).min(1);

// One statement the deck makes, with the quotes that show it. The scorer
// reads facts only and cites these citations (§14.3).
const factSchema = z.strictObject({
  statement: nonEmpty,
  citations,
});

// A profile value as the deck states it, with its citations. Null when the
// deck doesn't state it.
function deckValue<T extends z.ZodType>(value: T) {
  return z.strictObject({ value, citations }).nullable();
}

// A deck stage or sector the fund's lists don't name.
export const OTHER = "other";

// The fund's values plus "other", the enum the model picks from. An empty
// fund list (no filter, §13) gives an enum of "other" alone: the mandate
// check passes that field anyway.
function vocabulary(values: readonly string[]) {
  return z.enum([...new Set([...values, OTHER])]);
}

// §7.2 step 4: the page extractions merged into facts, each with citations,
// plus the profile values the deck states. A topic the deck doesn't cover is
// an empty list. Stage and sector come from the fund's own vocabulary, so the
// mandate check compares like with like: stage from the fund's stages,
// sector from its sectors and excluded sectors, "other" for anything else.
export function dealFactsSchemaFor(filters: WorkspaceConfig["filters"]) {
  return z.strictObject({
    problem: z.array(factSchema),
    solution: z.array(factSchema),
    market: z.array(factSchema),
    traction: z.array(factSchema),
    // Professional facts only: experience, roles, track record. Never
    // demographic attributes (age, gender, ethnicity, nationality, religion,
    // appearance, family) (§14.3).
    team: z.array(factSchema),
    ask: z.array(factSchema),
    deckProfile: z.strictObject({
      stage: deckValue(vocabulary(filters.stages)),
      sector: deckValue(
        vocabulary([...filters.sectors, ...filters.excludedSectors]),
      ),
      country: deckValue(countryCode),
      roundSizeUsd: deckValue(roundSizeUsd),
    }),
  });
}
export type DealFacts = z.infer<ReturnType<typeof dealFactsSchemaFor>>;

// §7.2 step 4: the deal profile the mandate check reads. Form values where
// the founder gave them, deck values otherwise. Null when neither states it:
// the mandate check then gives NEEDS_REVIEW for that field, never a decline.
// "other" is a known value.
export const dealProfileSchema = z.strictObject({
  stage: nonEmpty.nullable(),
  sector: nonEmpty.nullable(),
  country: countryCode.nullable(),
  roundSizeUsd: roundSizeUsd.nullable(),
});
export type DealProfile = z.infer<typeof dealProfileSchema>;

// §7.2 step 5. Each rule passes, fails, or can't be decided because its
// profile field is unknown.
export const mandateRuleSchema = z.enum([
  "stage",
  "sector",
  "country",
  "roundSize",
  "exclusions",
]);
export type MandateRule = z.infer<typeof mandateRuleSchema>;

function mandateCheck<R extends MandateRule>(rule: R) {
  return z.strictObject({
    rule: z.literal(rule),
    status: z.enum(["pass", "fail", "unknown"]),
    reason: nonEmpty,
  });
}
export type MandateCheck<R extends MandateRule = MandateRule> = z.infer<
  ReturnType<typeof mandateCheck<R>>
>;

// inside → rubric scoring; outside → OUT_OF_MANDATE; undetermined →
// NEEDS_REVIEW. One check per rule, in this fixed order.
export const mandateResultSchema = z.strictObject({
  outcome: z.enum(["inside", "outside", "undetermined"]),
  checks: z.tuple([
    mandateCheck("stage"),
    mandateCheck("sector"),
    mandateCheck("country"),
    mandateCheck("roundSize"),
    mandateCheck("exclusions"),
  ]),
});
export type MandateResult = z.infer<typeof mandateResultSchema>;

// One rubric criterion, scored. Reasoning comes before the score (§14.3).
export const criterionScoreSchema = z.strictObject({
  key: nonEmpty,
  reasoning: nonEmpty,
  score: z.int().min(1).max(5),
  confidence: z.enum(["low", "medium", "high"]),
  citations,
});
export type CriterionScore = z.infer<typeof criterionScoreSchema>;

export const rubricScoresSchema = z.strictObject({
  criteria: z.array(criterionScoreSchema).min(1),
});
export type RubricScores = z.infer<typeof rubricScoresSchema>;
