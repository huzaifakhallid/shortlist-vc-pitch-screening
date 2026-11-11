import type { Role } from "@shortlist/schemas";
import { and, eq } from "drizzle-orm";
import { db, single, type Executor } from "../client";
import { membership, workspace } from "../schema";

export type Membership = typeof membership.$inferSelect;

// A user's place in one workspace, as the session needs it.
export type UserMembership = {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  role: Role;
};

export async function createMembership(
  workspaceId: string,
  input: { userId: string; role: Role },
): Promise<Membership> {
  const rows = await db()
    .insert(membership)
    .values({ workspaceId, ...input })
    .returning();
  return single(rows, `membership for user ${input.userId}`);
}

// Members with the partner role: the valid routing targets (§13 stage 2).
export function listPartnerIds(workspaceId: string): Promise<string[]> {
  return selectPartnerIds(db(), workspaceId);
}

// Not exported from the package: for reads inside an access-layer transaction.
export async function selectPartnerIds(
  q: Executor,
  workspaceId: string,
): Promise<string[]> {
  const rows = await q
    .select({ userId: membership.userId })
    .from(membership)
    .where(
      and(
        eq(membership.workspaceId, workspaceId),
        eq(membership.role, "partner"),
      ),
    );
  return rows.map((row) => row.userId);
}

export async function getMembership(
  workspaceId: string,
  userId: string,
): Promise<Membership | null> {
  const [row] = await db()
    .select()
    .from(membership)
    .where(
      and(
        eq(membership.workspaceId, workspaceId),
        eq(membership.userId, userId),
      ),
    );
  return row ?? null;
}

// Every workspace a user belongs to. Not scoped by workspaceId: this is how a
// signed-in user's workspace is found in the first place (§15.1).
export function listUserMemberships(userId: string): Promise<UserMembership[]> {
  return db()
    .select({
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      workspaceName: workspace.name,
      role: membership.role,
    })
    .from(membership)
    .innerJoin(workspace, eq(workspace.id, membership.workspaceId))
    .where(eq(membership.userId, userId))
    .orderBy(workspace.slug);
}
