import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt } from "./columns";
import { workspace } from "./workspace";

// Fixed-window request counters for the public form (§15.5): one row per
// workspace, bucket (e.g. "submit:ip:203.0.113.7") and window start (DB
// clock). Old windows are for the sweeper.
export const rateLimitWindow = pgTable(
  "rate_limit_window",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    bucket: text("bucket").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    hits: integer("hits").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.bucket, t.windowStart] }),
    check("rate_limit_window_hits_positive", sql`${t.hits} > 0`),
  ],
);
