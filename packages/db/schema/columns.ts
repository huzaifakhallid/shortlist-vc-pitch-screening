import { bigint, timestamp } from "drizzle-orm/pg-core";

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// Insertion order, for append-only logs: created_at can tie within a transaction.
export const seq = () =>
  bigint("seq", { mode: "number" }).notNull().generatedAlwaysAsIdentity();
