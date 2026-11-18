import { z } from "zod";

// Intake's dedupe decision for a pitch (§7.1). Decided by Intake's rules
// (packages/agents/intake/steps/dedupe.ts), carried out by its narrow path
// (packages/db receivePitch) and recorded as the run's "dedupe" step.
export const intakeMatchSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("new") }),
  z.strictObject({
    kind: z.literal("resubmission"),
    dealId: z.uuid(),
    // "open_claim": the founder email already has an open possible
    // duplicate of this company's deal; the pitch joins that held deal.
    matchedBy: z.enum(["domain", "email", "open_claim"]),
    // The deal is a possible duplicate waiting for a partner (§7.1).
    held: z.boolean(),
  }),
  z.strictObject({ kind: z.literal("possible_duplicate"), dealId: z.uuid() }),
]);
export type IntakeMatch = z.infer<typeof intakeMatchSchema>;

// The fund's own email identity (§7.1): the domains of its intake address
// and of its members' emails, and its members' exact addresses, lowercased.
export type FundEmails = {
  domains: ReadonlySet<string>;
  addresses: ReadonlySet<string>;
};
