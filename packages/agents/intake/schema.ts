import {
  intakeMatchSchema,
  pitchFormSchema,
  submittedDeckSchema,
} from "@shortlist/schemas";
import { z } from "zod";

// Intake's inputs and outputs (§7.1). The form channel only: the email
// channel (extraction prompt, Postmark hook) is a later slice.

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
// Intake creates a new company and deal. The match (intakeMatchSchema) is
// what the narrow path carries out and records as the "dedupe" step.
export const dedupeDecisionSchema = z.strictObject({
  companyDomain: companyDomainSchema,
  match: intakeMatchSchema,
});
export type DedupeDecision = z.infer<typeof dedupeDecisionSchema>;

// Intake's output for a form pitch: the form as entered, its normalised
// company domain and founder email, and the verified deck. The narrow path
// (receivePitch) creates or links the deal from it.
export const normalisedPitchSchema = z.strictObject({
  channel: z.literal("form"),
  companyDomain: companyDomainSchema,
  founderEmail: z.string().min(1),
  form: pitchFormSchema,
  deck: submittedDeckSchema,
});
export type NormalisedPitch = z.infer<typeof normalisedPitchSchema>;
