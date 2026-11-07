import type { Role } from "@shortlist/schemas";
import { and, eq } from "drizzle-orm";
import { db, single, type Executor } from "../client";
import { membership } from "../schema";

export type Membership = typeof membership.$inferSelect;

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
