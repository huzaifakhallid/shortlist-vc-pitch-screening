import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt } from "./columns";
import { user } from "./workspace";

// The tables the Auth.js Drizzle adapter needs (§12). Property names are the
// adapter's; column names follow this schema's snake_case. Deleting a user
// removes their sign-in rows with them, as the adapter expects.

export const account = pgTable(
  "account",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index("account_user_id_idx").on(t.userId),
  ],
);

export const session = pgTable(
  "session",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expires: timestamp("expires", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

// Holds a hash of each magic-link token, never the token itself.
export const verificationToken = pgTable(
  "verification_token",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);
