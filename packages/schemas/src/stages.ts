import { z } from "zod";

// Two separate lists (§12.1): where a deal is, and what happened to one run.
export const dealStageSchema = z.enum([
  "RECEIVED",
  "NEEDS_REVIEW",
  "OUT_OF_MANDATE",
  "SCREENED",
  "FIRST_CALL",
  "DILIGENCE",
  "IC",
  "INVESTED",
  "PASSED",
]);
export type DealStage = z.infer<typeof dealStageSchema>;

export const runStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;
