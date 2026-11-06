import {
  agentKeySchema,
  dealStageSchema,
  documentKindSchema,
  eventTypeSchema,
  integrationKindSchema,
  integrationStatusSchema,
  outboundMessageKindSchema,
  outboundMessageStatusSchema,
  roleSchema,
  runStatusSchema,
  stageChangeSourceSchema,
  submissionChannelSchema,
} from "@shortlist/schemas";
import { pgEnum } from "drizzle-orm/pg-core";

// Every list is defined once in @shortlist/schemas; these derive from it.
export const dealStage = pgEnum("deal_stage", dealStageSchema.enum);
export const runStatus = pgEnum("run_status", runStatusSchema.enum);
export const role = pgEnum("role", roleSchema.enum);
export const agentKey = pgEnum("agent_key", agentKeySchema.enum);
export const eventType = pgEnum("event_type", eventTypeSchema.enum);
export const integrationKind = pgEnum(
  "integration_kind",
  integrationKindSchema.enum,
);
export const integrationStatus = pgEnum(
  "integration_status",
  integrationStatusSchema.enum,
);
export const submissionChannel = pgEnum(
  "submission_channel",
  submissionChannelSchema.enum,
);
export const documentKind = pgEnum("document_kind", documentKindSchema.enum);
export const outboundMessageKind = pgEnum(
  "outbound_message_kind",
  outboundMessageKindSchema.enum,
);
export const outboundMessageStatus = pgEnum(
  "outbound_message_status",
  outboundMessageStatusSchema.enum,
);
export const stageChangeSource = pgEnum(
  "stage_change_source",
  stageChangeSourceSchema.enum,
);
