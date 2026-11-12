import type { Role } from "@shortlist/schemas";
import { listUserMemberships } from "@shortlist/db";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { auth } from "@/auth";
import { soleMembership } from "@/lib/workspace-membership";

// Who is signed in and where. workspaceId and role come only from here, never
// from a request body or query (§15.1, §17).
export type SessionContext = {
  userId: string;
  name: string | null;
  email: string;
  workspaceId: string;
  workspaceName: string;
  role: Role;
};

// Reads the database session. Signed-out visitors go to the sign-in page.
// Reads cookies, so callers must sit inside a <Suspense> boundary
// (cacheComponents, docs/progress.md). Cached per request.
export const requireSession = cache(async (): Promise<SessionContext> => {
  // Request time only: Auth.js generates random values (its CSRF token) while
  // reading the session, which partial prefetching would otherwise prerender.
  await connection();
  const session = await auth();
  const user = session?.user;
  if (user?.id === undefined) {
    redirect("/signin");
  }
  if (typeof user.email !== "string") {
    throw new Error(`User ${user.id} has no email address`);
  }
  const membership = soleMembership(
    user.id,
    await listUserMemberships(user.id),
  );
  return {
    userId: user.id,
    name: user.name ?? null,
    email: user.email,
    workspaceId: membership.workspaceId,
    workspaceName: membership.workspaceName,
    role: membership.role,
  };
});
