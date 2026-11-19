import { dealFactsShape, type WorkspaceConfig } from "@shortlist/schemas";
import { z } from "zod";

// Screening's stored outputs live in @shortlist/schemas (src/screening.ts):
// the database layer parses them and the dashboard renders them. What only
// the model call needs stays here.
export {
  citationSchema,
  criterionScoreSchema,
  dealFactsSchema,
  dealProfileSchema,
  hiddenSpanSchema,
  mandateResultSchema,
  mandateRuleSchema,
  pageNumberSchema,
  profileMismatchSchema,
  rubricScoresSchema,
  screeningOutputSchema,
  type Citation,
  type CriterionScore,
  type DealFacts,
  type DealProfile,
  type MandateCheck,
  type MandateResult,
  type MandateRule,
  type ProfileMismatch,
  type RubricScores,
  type ScreeningOutput,
} from "@shortlist/schemas";

// A deck stage or sector the fund's lists don't name.
export const OTHER = "other";

// The fund's values plus "other", the enum the model picks from. An empty
// fund list (no filter, §13) gives an enum of "other" alone: the mandate
// check passes that field anyway.
function vocabulary(values: readonly string[]) {
  return z.enum([...new Set([...values, OTHER])]);
}

// §7.2 step 4, the facts call's schema. Stage and sector come from the
// fund's own vocabulary, so the mandate check compares like with like: stage
// from the fund's stages, sector from its sectors and excluded sectors,
// "other" for anything else.
export function dealFactsSchemaFor(filters: WorkspaceConfig["filters"]) {
  return dealFactsShape(
    vocabulary(filters.stages),
    vocabulary([...filters.sectors, ...filters.excludedSectors]),
  );
}
