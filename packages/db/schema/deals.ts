import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type PgColumn,
} from "drizzle-orm/pg-core";
import { createdAt, seq } from "./columns";
import {
  dealStage,
  documentKind,
  integrationKind,
  stageChangeSource,
  submissionChannel,
} from "./enums";
import { memberRef, workspace } from "./workspace";

// Every workspace-owned row carries workspace_id and references other
// workspace-owned rows by (workspace_id, id), so it can never point at another
// workspace's row.
const workspaceId = () =>
  uuid("workspace_id")
    .notNull()
    .references(() => workspace.id);

export const company = pgTable(
  "company",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    name: text("name").notNull(),
    // Null when the pitch states no usable company domain (no website, or a
    // shared host, §7.1). NULLs are distinct under the unique key below.
    domainNormalized: text("domain_normalized"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("company_workspace_id_id_key").on(t.workspaceId, t.id),
    unique("company_workspace_id_domain_normalized_key").on(
      t.workspaceId,
      t.domainNormalized,
    ),
  ],
);

export const deal = pgTable(
  "deal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    companyId: uuid("company_id").notNull(),
    stage: dealStage("stage").notNull(),
    // Written by Screening; its Zod schema arrives with that agent (milestone 2).
    profile: jsonb("profile"),
    // Weighted rubric score, 0-100. Null until Screening has scored the deal.
    totalScore: numeric("total_score", {
      precision: 5,
      scale: 2,
      mode: "number",
    }),
    // Null until Screening's hidden-text check has run.
    integrityFlag: boolean("integrity_flag"),
    assignedPartnerId: uuid("assigned_partner_id"),
    // Set by Intake on a possible duplicate (§7.1): the existing deal whose
    // company domain this pitch states, without the founder email that would
    // link it. A partner confirms or rejects the link; until then the pitch
    // is its own deal in NEEDS_REVIEW.
    possibleDuplicateOfDealId: uuid("possible_duplicate_of_deal_id"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("deal_workspace_id_id_key").on(t.workspaceId, t.id),
    foreignKey({
      name: "deal_possible_duplicate_of_fk",
      columns: [t.workspaceId, t.possibleDuplicateOfDealId],
      foreignColumns: [t.workspaceId, t.id],
    }),
    foreignKey({
      name: "deal_company_fk",
      columns: [t.workspaceId, t.companyId],
      foreignColumns: [company.workspaceId, company.id],
    }),
    memberRef("deal_assigned_partner_fk", t.workspaceId, t.assignedPartnerId),
    index("deal_workspace_id_stage_idx").on(t.workspaceId, t.stage),
    index("deal_company_id_idx").on(t.companyId),
    index("deal_assigned_partner_id_idx").on(t.assignedPartnerId),
  ],
);

// (workspace_id, deal_id) -> deal, for every per-deal table.
export function dealRef(
  name: string,
  t: { workspaceId: PgColumn; dealId: PgColumn },
) {
  return foreignKey({
    name,
    columns: [t.workspaceId, t.dealId],
    foreignColumns: [deal.workspaceId, deal.id],
  });
}

export const submission = pgTable(
  "submission",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Insertion order: the deal's first submission holds its founder contact
    // (§7.1), and created_at can tie.
    seq: seq(),
    workspaceId: workspaceId(),
    dealId: uuid("deal_id").notNull(),
    channel: submissionChannel("channel").notNull(),
    // Form fields as submitted; validated by the form's schema at the boundary.
    formData: jsonb("form_data"),
    founderEmail: text("founder_email").notNull(),
    // Null when the pitch had no deck attached (§7.1 "Needs deck").
    deckObjectKey: text("deck_object_key"),
    // The verified upload's ETag (§15.3): the worker reads exactly this
    // object. Set exactly when deck_object_key is.
    deckEtag: text("deck_etag"),
    deckSha256: text("deck_sha256"),
    rawEmailKey: text("raw_email_key"),
    createdAt: createdAt(),
  },
  (t) => [
    dealRef("submission_deal_fk", t),
    index("submission_deal_id_idx").on(t.dealId),
    check(
      "submission_deck_with_etag",
      sql`(${t.deckObjectKey} is null) = (${t.deckEtag} is null)`,
    ),
    index("submission_workspace_id_founder_email_idx").on(
      t.workspaceId,
      t.founderEmail,
    ),
  ],
);

export const document = pgTable(
  "document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    dealId: uuid("deal_id").notNull(),
    kind: documentKind("kind").notNull(),
    objectKey: text("object_key").notNull(),
    // Null when the founder uploaded it through their private link.
    uploadedBy: uuid("uploaded_by"),
    createdAt: createdAt(),
  },
  (t) => [
    dealRef("document_deal_fk", t),
    memberRef("document_uploaded_by_fk", t.workspaceId, t.uploadedBy),
    index("document_deal_id_idx").on(t.dealId),
  ],
);

export const note = pgTable(
  "note",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    dealId: uuid("deal_id").notNull(),
    userId: uuid("user_id").notNull(),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    dealRef("note_deal_fk", t),
    memberRef("note_user_fk", t.workspaceId, t.userId),
    index("note_deal_id_idx").on(t.dealId),
  ],
);

// Append-only.
export const scoreOverride = pgTable(
  "score_override",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    dealId: uuid("deal_id").notNull(),
    criterionKey: text("criterion_key").notNull(),
    aiScore: integer("ai_score").notNull(),
    newScore: integer("new_score").notNull(),
    reason: text("reason").notNull(),
    userId: uuid("user_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    dealRef("score_override_deal_fk", t),
    memberRef("score_override_user_fk", t.workspaceId, t.userId),
    index("score_override_deal_id_idx").on(t.dealId),
  ],
);

// Append-only.
export const stageTransition = pgTable(
  "stage_transition",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    dealId: uuid("deal_id").notNull(),
    from: dealStage("from").notNull(),
    to: dealStage("to").notNull(),
    userId: uuid("user_id").notNull(),
    source: stageChangeSource("source").notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [
    dealRef("stage_transition_deal_fk", t),
    memberRef("stage_transition_user_fk", t.workspaceId, t.userId),
    index("stage_transition_deal_id_idx").on(t.dealId),
  ],
);

export const externalLink = pgTable(
  "external_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: workspaceId(),
    dealId: uuid("deal_id").notNull(),
    provider: integrationKind("provider").notNull(),
    externalId: text("external_id").notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    dealRef("external_link_deal_fk", t),
    unique("external_link_deal_id_provider_key").on(t.dealId, t.provider),
  ],
);
