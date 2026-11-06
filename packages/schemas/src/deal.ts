import { z } from "zod";

// How a pitch arrived (§7.1, §8.2): the hosted form, the intake address, the
// public API, or a manual upload in the dashboard.
export const submissionChannelSchema = z.enum([
  "form",
  "email",
  "api",
  "upload",
]);
export type SubmissionChannel = z.infer<typeof submissionChannelSchema>;

// §12 document.kind.
export const documentKindSchema = z.enum([
  "deck",
  "financials",
  "cap_table",
  "other",
]);
export type DocumentKind = z.infer<typeof documentKindSchema>;

// The five founder messages in §7.5.
export const outboundMessageKindSchema = z.enum([
  "acknowledgement",
  "mandate_decline",
  "pass",
  "info_request",
  "advance",
]);
export type OutboundMessageKind = z.infer<typeof outboundMessageKindSchema>;

// The approval states in §11.4.
export const outboundMessageStatusSchema = z.enum([
  "DRAFTED",
  "EDITED",
  "APPROVED",
  "DISCARDED",
  "SENT",
]);
export type OutboundMessageStatus = z.infer<typeof outboundMessageStatusSchema>;
