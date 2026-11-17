import { z } from "zod";

// Intake's inputs and outputs (§7.1). Only the dedupe step exists so far;
// the agent itself (definition, prompts, email extraction) is a later slice.

// What the dedupe query found for a pitch (`findDuplicateCandidates`): facts
// only, the rules in steps/dedupe.ts decide.
export type { DuplicateCandidates } from "@shortlist/db";

// The pitch's company domain, or why it has none (§7.1).
export const companyDomainSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("domain"), domain: z.string().min(1) }),
  z.strictObject({
    kind: z.literal("none"),
    reason: z.enum(["no_website", "shared_host"]),
  }),
]);
export type CompanyDomain = z.infer<typeof companyDomainSchema>;

// §7.1 "Duplicates": a resubmission links the pitch to an existing deal; a
// possible duplicate waits for a partner to confirm the link; otherwise
// Intake creates a new company and deal.
export const dedupeDecisionSchema = z.strictObject({
  companyDomain: companyDomainSchema,
  match: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("new") }),
    z.strictObject({
      kind: z.literal("resubmission"),
      dealId: z.uuid(),
      matchedBy: z.enum(["domain", "email"]),
    }),
    z.strictObject({ kind: z.literal("possible_duplicate"), dealId: z.uuid() }),
  ]),
});
export type DedupeDecision = z.infer<typeof dedupeDecisionSchema>;
