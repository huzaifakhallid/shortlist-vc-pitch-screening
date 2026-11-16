import type { WorkspaceConfig } from "@shortlist/schemas";
import type { CriterionScore } from "../schema";

type Rubric = WorkspaceConfig["rubric"];

// §7.2 step 8: total = Σ (score_i / 5) × weight_i, weights summing to 100,
// so the total is between 20 (every score 1) and 100 (every score 5).
//
// The rubric (weights, unique keys) is validated by the config schema at
// save time (§13) and each score's 1–5 range by criterionScoreSchema. This
// checks what neither can: the scores match the rubric, with every rubric
// criterion scored exactly once and no other criterion scored. Errors name
// rubric keys and positions (the fund's config), never model text.
//
// Computed as the integer Σ score_i × weight_i divided once by 5, so the
// result is the nearest double to an exact multiple of 0.2 (fits
// deal.total_score, numeric(5,2)).
export function totalScore(
  rubric: Rubric,
  criteria: readonly Pick<CriterionScore, "key" | "score">[],
): number {
  const scores = new Map<string, number>();
  criteria.forEach((criterion, index) => {
    if (!rubric.some((c) => c.key === criterion.key)) {
      throw new Error(
        `criteria[${String(index)}] scores a criterion that isn't in the rubric`,
      );
    }
    if (scores.has(criterion.key)) {
      throw new Error(
        `criteria[${String(index)}] scores rubric criterion "${criterion.key}" a second time`,
      );
    }
    scores.set(criterion.key, criterion.score);
  });

  let weighted = 0;
  for (const criterion of rubric) {
    const score = scores.get(criterion.key);
    if (score === undefined) {
      throw new Error(`Rubric criterion "${criterion.key}" has no score`);
    }
    weighted += score * criterion.weight;
  }
  return weighted / 5;
}
