import type { WorkspaceConfig } from "@shortlist/schemas";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type PgColumn,
} from "drizzle-orm/pg-core";
import { createdAt } from "./columns";
import { agentKey, integrationKind, integrationStatus, role } from "./enums";

export const workspace = pgTable("workspace", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  intakeAddress: text("intake_address").notNull().unique(),
  createdAt: createdAt(),
});

// Matches the user table the Auth.js Drizzle adapter expects (its other
// tables are in auth.ts).
export const user = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", {
    withTimezone: true,
    mode: "date",
  }),
  image: text("image"),
  createdAt: createdAt(),
});

export const membership = pgTable(
  "membership",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    role: role("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("membership_user_id_idx").on(t.userId),
  ],
);

// A user reference on a workspace-owned row must be a member of that
// workspace: (workspace_id, user col) -> membership. Null user cols are skipped.
export function memberRef(
  name: string,
  workspaceId: PgColumn,
  userId: PgColumn,
) {
  return foreignKey({
    name,
    columns: [workspaceId, userId],
    foreignColumns: [membership.workspaceId, membership.userId],
  });
}

export const apiKey = pgTable(
  "api_key",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    scopes: text("scopes").array().notNull(),
    createdBy: uuid("created_by").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("api_key_workspace_id_idx").on(t.workspaceId),
    memberRef("api_key_created_by_fk", t.workspaceId, t.createdBy),
  ],
);

export const configVersion = pgTable(
  "config_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    version: integer("version").notNull(),
    config: jsonb("config").$type<WorkspaceConfig>().notNull(),
    isActive: boolean("is_active").notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    memberRef("config_version_created_by_fk", t.workspaceId, t.createdBy),
    unique("config_version_workspace_id_id_key").on(t.workspaceId, t.id),
    unique("config_version_workspace_id_version_key").on(
      t.workspaceId,
      t.version,
    ),
    uniqueIndex("config_version_one_active_idx")
      .on(t.workspaceId)
      .where(sql`${t.isActive}`),
  ],
);

export const integration = pgTable(
  "integration",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    kind: integrationKind("kind").notNull(),
    // AES-256-GCM ciphertext (§15.1); the key lives outside the database.
    credentials: text("credentials").notNull(),
    status: integrationStatus("status").notNull(),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [
    unique("integration_workspace_id_kind_key").on(t.workspaceId, t.kind),
  ],
);

// Append-only. The actor is either a person or an agent, never both.
export const auditEvent = pgTable(
  "audit_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    actorUserId: uuid("actor_user_id"),
    actorAgent: agentKey("actor_agent"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: createdAt(),
  },
  (t) => [
    memberRef("audit_event_actor_user_fk", t.workspaceId, t.actorUserId),
    index("audit_event_workspace_id_created_at_idx").on(
      t.workspaceId,
      t.createdAt,
    ),
    check(
      "audit_event_one_actor",
      sql`(${t.actorUserId} is null) <> (${t.actorAgent} is null)`,
    ),
  ],
);
