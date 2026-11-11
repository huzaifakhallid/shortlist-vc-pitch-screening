import { randomBytes } from "node:crypto";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, single } from "../client";
import { account, session, user, verificationToken } from "../schema";

// Sign-in rows belong to a user, not a workspace, so nothing here is scoped
// by workspaceId. Workspace access is decided from memberships afterwards.

// The Auth.js adapter over this package's tables (§12).
export function authAdapter(): ReturnType<typeof DrizzleAdapter> {
  return DrizzleAdapter(db(), {
    usersTable: user,
    accountsTable: account,
    sessionsTable: session,
    verificationTokensTable: verificationToken,
  });
}

// A database session, the same kind Auth.js creates after a magic link. The
// one-click demo logins use it; the caller sets the session cookie.
export async function createSession(
  userId: string,
  expires: Date,
): Promise<{ sessionToken: string; expires: Date }> {
  const rows = await db()
    .insert(session)
    .values({
      sessionToken: randomBytes(32).toString("base64url"),
      userId,
      expires,
    })
    .returning({
      sessionToken: session.sessionToken,
      expires: session.expires,
    });
  return single(rows, `session for user ${userId}`);
}
