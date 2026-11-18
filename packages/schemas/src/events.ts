import { z } from "zod";
import { pitchFormSchema, submittedDeckSchema } from "./pitch";
import { dealStageSchema } from "./stages";

// The §8.2 event table. A payload has fields only where the design states its
// content; every other payload is an empty strict object.
export const eventTypeSchema = z.enum([
  "email.received",
  "form.submitted",
  "deal.received",
  "deal.screened",
  "deal.out_of_mandate",
  "deal.needs_review",
  "research.completed",
  "memo.completed",
  "deal.stage_changed",
  "document.uploaded",
]);
export type EventType = z.infer<typeof eventTypeSchema>;

const emptyPayload = z.strictObject({});

// Where a person moved a deal (§12 stage_transition.source).
export const stageChangeSourceSchema = z.enum(["dashboard", "slack"]);
export type StageChangeSource = z.infer<typeof stageChangeSourceSchema>;

export const stageChangedPayloadSchema = z.strictObject({
  from: dealStageSchema,
  to: dealStageSchema,
  source: stageChangeSourceSchema,
});

// A pitch from the public form (§7.1): what the founder entered and the
// verified deck. No deal exists yet; Intake creates it from this payload.
// Every form.* field is untrusted founder text: it reaches a model only as
// untrusted content inside prompt.ts's delimiters, never as an instruction.
export const formSubmittedPayloadSchema = z.strictObject({
  form: pitchFormSchema,
  deck: submittedDeckSchema,
});

export const eventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("email.received"), payload: emptyPayload }),
  z.strictObject({
    type: z.literal("form.submitted"),
    payload: formSubmittedPayloadSchema,
  }),
  z.strictObject({ type: z.literal("deal.received"), payload: emptyPayload }),
  z.strictObject({ type: z.literal("deal.screened"), payload: emptyPayload }),
  z.strictObject({
    type: z.literal("deal.out_of_mandate"),
    payload: emptyPayload,
  }),
  z.strictObject({
    type: z.literal("deal.needs_review"),
    payload: emptyPayload,
  }),
  z.strictObject({
    type: z.literal("research.completed"),
    payload: emptyPayload,
  }),
  z.strictObject({ type: z.literal("memo.completed"), payload: emptyPayload }),
  z.strictObject({
    type: z.literal("deal.stage_changed"),
    payload: stageChangedPayloadSchema,
  }),
  z.strictObject({
    type: z.literal("document.uploaded"),
    payload: emptyPayload,
  }),
]);
export type ShortlistEvent = z.infer<typeof eventSchema>;
