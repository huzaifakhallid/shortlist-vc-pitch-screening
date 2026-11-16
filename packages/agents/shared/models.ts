// Gemini model IDs and their prices (§14.4, §19). Model IDs live here only.
//
// Source: Google's model list and pricing pages
// (https://aistudio.google.com/docs/models, https://aistudio.google.com/docs/pricing),
// read 2026-11-16. Both models are listed as stable.

// Reads one slide image per call.
export const PAGE_READING_MODEL = "gemini-3.5-flash-lite";
// Facts, rubric scoring and memos.
export const SCORING_MODEL = "gemini-3.8-flash";

export type ModelId = typeof PAGE_READING_MODEL | typeof SCORING_MODEL;

// Paid-tier Standard list price in micro-dollars per million tokens. Cost is
// always computed at this price, free-tier key included, so the figures show
// what a client pays (§19). Input covers text and images; output includes
// thinking tokens. Neither model has a long-context price tier.
type Price = { inputMicrosPerMillion: number; outputMicrosPerMillion: number };

export const MODEL_PRICES: Readonly<Record<ModelId, Price>> = {
  // $0.30 in, $2.50 out.
  [PAGE_READING_MODEL]: {
    inputMicrosPerMillion: 300_000,
    outputMicrosPerMillion: 2_500_000,
  },
  // $1.50 in, $7.50 out: the list price from 2027-01-01. Google charges
  // $0.75 / $3.75 until 2026-12-31; the later price is what a client pays.
  [SCORING_MODEL]: {
    inputMicrosPerMillion: 1_500_000,
    outputMicrosPerMillion: 7_500_000,
  },
};

// One call's cost in micro-dollars, rounded up so spend is never under-counted.
export function costMicros(
  model: ModelId,
  tokensIn: number,
  tokensOut: number,
): number {
  const price = MODEL_PRICES[model];
  return Math.ceil(
    (tokensIn * price.inputMicrosPerMillion +
      tokensOut * price.outputMicrosPerMillion) /
      1_000_000,
  );
}
