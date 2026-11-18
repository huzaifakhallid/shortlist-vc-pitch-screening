import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt } from "./columns";
import { workspace } from "./workspace";

// A presigned deck upload (§15.3). Presigning writes the row; submitting the
// form confirms it once, with the ETag the verification returned, in the
// transaction that writes form.submitted. The stored size is the one the
// upload was signed for: confirming never takes a size from the request.
// Expired unconfirmed rows and their objects are for the sweeper.
export const pendingUpload = pgTable(
  "pending_upload",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    objectKey: text("object_key").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Both set once, when the form is submitted.
    etag: text("etag"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("pending_upload_object_key_key").on(t.objectKey),
    index("pending_upload_workspace_id_expires_at_idx").on(
      t.workspaceId,
      t.expiresAt,
    ),
    check("pending_upload_size_positive", sql`${t.sizeBytes} > 0`),
    check(
      "pending_upload_confirmed_with_etag",
      sql`(${t.etag} is null) = (${t.confirmedAt} is null)`,
    ),
  ],
);
