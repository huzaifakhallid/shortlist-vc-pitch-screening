import type { ShortlistEvent } from "@shortlist/schemas";
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type PgColumn,
} from "drizzle-orm/pg-core";
import { createdAt } from "./columns";
import { dealRef } from "./deals";
import {
  agentKey,
  eventType,
  outboundMessageKind,
  outboundMessageStatus,
  runStatus,
} from "./enums";
import { configVersion, memberRef, workspace } from "./workspace";

// Insertion order, for append-only logs: created_at can tie within a transaction.
const seq = () =>
  bigint("seq", { mode: "number" }).notNull().generatedAlwaysAsIdentity();

// Append-only, except the coordinator's fields: processed_at, set once, the
// dispatch failure record and the spend-cap deferral.
export const event = pgTable(
  "event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seq: seq(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    // Null exactly for email.received and form.submitted: no deal exists yet (§8.2).
    dealId: uuid("deal_id"),
    type: eventType("type").notNull(),
    payload: jsonb("payload").$type<ShortlistEvent["payload"]>().notNull(),
    createdAt: createdAt(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    // Failed dispatches and the latest one's error. The coordinator stops
    // claiming the event after MAX_DISPATCH_ATTEMPTS.
    dispatchAttempts: integer("dispatch_attempts").notNull().default(0),
    dispatchError: text("dispatch_error"),
    // Set when the workspace's daily spend cap stopped the dispatch: the
    // coordinator doesn't claim the event again until then, the next 00:00
    // UTC (§15.5).
    deferredUntil: timestamp("deferred_until", { withTimezone: true }),
  },
  (t) => [
    unique("event_workspace_id_id_key").on(t.workspaceId, t.id),
    dealRef("event_deal_fk", t),
    check(
      "event_deal_id_matches_type",
      sql`(${t.type} in ('email.received', 'form.submitted')) = (${t.dealId} is null)`,
    ),
    index("event_workspace_id_deal_id_idx").on(t.workspaceId, t.dealId),
    index("event_unprocessed_idx")
      .on(t.seq)
      .where(sql`${t.processedAt} is null`),
  ],
);

// Append-only, except the start and finish fields, each set once (§11.2).
export const agentRun = pgTable(
  "agent_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    // Null for an Intake run: it starts before its deal exists.
    dealId: uuid("deal_id"),
    agent: agentKey("agent").notNull(),
    triggerEventId: uuid("trigger_event_id").notNull(),
    configVersionId: uuid("config_version_id").notNull(),
    // Set by startRun. Null model/prompt for an agent that makes no model call.
    promptVersion: text("prompt_version"),
    model: text("model"),
    inputHash: text("input_hash"),
    status: runStatus("status").notNull(),
    // Parsed with the agent's outputSchema on read.
    output: jsonb("output"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costMicros: bigint("cost_micros", { mode: "number" }),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    unique("agent_run_workspace_id_id_key").on(t.workspaceId, t.id),
    dealRef("agent_run_deal_fk", t),
    foreignKey({
      name: "agent_run_trigger_event_fk",
      columns: [t.workspaceId, t.triggerEventId],
      foreignColumns: [event.workspaceId, event.id],
    }),
    foreignKey({
      name: "agent_run_config_version_fk",
      columns: [t.workspaceId, t.configVersionId],
      foreignColumns: [configVersion.workspaceId, configVersion.id],
    }),
    unique("agent_run_agent_trigger_event_id_key").on(
      t.agent,
      t.triggerEventId,
    ),
    index("agent_run_workspace_id_deal_id_idx").on(t.workspaceId, t.dealId),
    index("agent_run_trigger_event_id_idx").on(t.triggerEventId),
    index("agent_run_config_version_id_idx").on(t.configVersionId),
  ],
);

// (workspace_id, run_id) -> agent_run, for every per-run table.
function runRef(name: string, t: { workspaceId: PgColumn; runId: PgColumn }) {
  return foreignKey({
    name,
    columns: [t.workspaceId, t.runId],
    foreignColumns: [agentRun.workspaceId, agentRun.id],
  });
}

// Append-only. A retried step is a new row; the latest row for a step wins.
export const runStep = pgTable(
  "run_step",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seq: seq(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    runId: uuid("run_id").notNull(),
    step: text("step").notNull(),
    output: jsonb("output"),
    status: runStatus("status").notNull(),
    // Model usage of this step's attempt, FAILED ones included, so spend on
    // an attempt that hit a provider error isn't lost. The run's totals are
    // their sum (finishRun).
    tokensIn: integer("tokens_in").notNull(),
    tokensOut: integer("tokens_out").notNull(),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    runRef("run_step_run_fk", t),
    index("run_step_run_id_seq_idx").on(t.runId, t.seq),
    // The daily spend cap sums a workspace's step costs since UTC midnight.
    index("run_step_workspace_id_created_at_idx").on(
      t.workspaceId,
      t.createdAt,
    ),
  ],
);

export const outboundMessage = pgTable(
  "outbound_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    runId: uuid("run_id").notNull(),
    dealId: uuid("deal_id").notNull(),
    kind: outboundMessageKind("kind").notNull(),
    draft: text("draft").notNull(),
    finalText: text("final_text"),
    status: outboundMessageStatus("status").notNull(),
    decidedBy: uuid("decided_by"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    runRef("outbound_message_run_fk", t),
    dealRef("outbound_message_deal_fk", t),
    memberRef("outbound_message_decided_by_fk", t.workspaceId, t.decidedBy),
    index("outbound_message_run_id_idx").on(t.runId),
    index("outbound_message_deal_id_status_idx").on(t.dealId, t.status),
  ],
);
