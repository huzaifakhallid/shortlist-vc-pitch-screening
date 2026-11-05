import { z } from "zod";
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

export const stageChangedPayloadSchema = z.strictObject({
  from: dealStageSchema,
  to: dealStageSchema,
  source: z.enum(["dashboard", "slack"]),
});

export const eventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("email.received"), payload: emptyPayload }),
  z.strictObject({ type: z.literal("form.submitted"), payload: emptyPayload }),
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
