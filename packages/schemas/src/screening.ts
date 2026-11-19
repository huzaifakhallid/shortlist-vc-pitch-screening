import { z } from "zod";

// Screening's inputs and outputs (§7.2). They live here, not in the agent's
// folder, because the database layer parses Screening's stored output (the
// run output, deal.profile) on read and the dashboard renders it. Model
// outputs here don't use .default() (llm-call skill): a missing field is
// invalid, never filled in.

const nonEmpty = z.string().min(1);

// The company's country (where it operates), never a founder's nationality.
const countryCode = z
  .string()
  .regex(/^[A-Z]{2}$/, "Country must be an ISO 3166-1 alpha-2 code");

const roundSizeUsd = z.int().min(0);

// Deck pages are numbered from 1, in the order the renderer writes them.
export const pageNumberSchema = z.int().min(1);

// A quote from a deck page that supports a claim (§7.2 steps 4, 6). The
// snippet rules (on the page, at least 12 characters) are in Screening's
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

// §7.2 step 4: the page extractions merged into facts, each with citations,
// plus the profile values the deck states. A topic the deck doesn't cover is
// an empty list. `stage` and `sector` are the schemas of those two profile
// values: Screening's model output limits them to the fund's vocabulary
// (dealFactsSchemaFor in the agent's schema.ts).
export function dealFactsShape<
  Stage extends z.ZodType<string>,
  Sector extends z.ZodType<string>,
>(stage: Stage, sector: Sector) {
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
      stage: deckValue(stage),
      sector: deckValue(sector),
      country: deckValue(countryCode),
      roundSizeUsd: deckValue(roundSizeUsd),
    }),
  });
}

// Facts as stored in a finished run's output. The fund's lists can change
// after the run, so a stored stage or sector is read as any non-empty value.
export const dealFactsSchema = dealFactsShape(nonEmpty, nonEmpty);
export type DealFacts = z.infer<typeof dealFactsSchema>;

// §7.2 step 4: the deal profile the mandate check reads. Form values where
// the founder gave them, deck values otherwise. Null when neither states it:
// the mandate check then gives NEEDS_REVIEW for that field, never a decline.
// "other" is a known value. Stored on deal.profile.
export const dealProfileSchema = z.strictObject({
  stage: nonEmpty.nullable(),
  sector: nonEmpty.nullable(),
  country: countryCode.nullable(),
  roundSizeUsd: roundSizeUsd.nullable(),
});
export type DealProfile = z.infer<typeof dealProfileSchema>;

// §7.2 step 4: a form value the deck contradicts by more than 25%. The form
// states only one number, the round size.
export const profileMismatchSchema = z.strictObject({
  field: z.literal("roundSizeUsd"),
  formValue: roundSizeUsd,
  deckValue: roundSizeUsd,
  citations,
});
export type ProfileMismatch = z.infer<typeof profileMismatchSchema>;

// §7.2 step 3: text in the PDF's text layer that isn't visible on the page.
// The snippet is the text layer's, shown to the team; the scorer never sees
// it.
export const hiddenSpanSchema = z.strictObject({
  page: pageNumberSchema,
  snippet: nonEmpty,
  words: z.int().min(1),
});

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

// A finished Screening run's output (agent_run.output, §7.2, §12): what the
// dashboard shows. The deal row carries its summary (stage, profile,
// total_score, integrity_flag). Page extractions stay in the run's steps.
// Scores and total exist exactly when the deal is inside the mandate:
// rubric scoring runs only then (§7.2 step 5).
export const screeningOutputSchema = z
  .strictObject({
    facts: dealFactsSchema,
    profile: dealProfileSchema,
    mismatches: z.array(profileMismatchSchema),
    hiddenSpans: z.array(hiddenSpanSchema),
    mandate: mandateResultSchema,
    scores: rubricScoresSchema.nullable(),
    // §7.2 step 8: between 20 (every score 1) and 100 (every score 5).
    totalScore: z.number().min(20).max(100).nullable(),
  })
  .refine(
    (output) =>
      (output.mandate.outcome === "inside") === (output.scores !== null) &&
      (output.scores === null) === (output.totalScore === null),
    {
      message:
        "Scores and total score are present exactly when the deal is inside the mandate",
      path: ["scores"],
    },
  );
export type ScreeningOutput = z.infer<typeof screeningOutputSchema>;
