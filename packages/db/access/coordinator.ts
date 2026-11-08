import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Tx } from "../client";
import { event } from "../schema";
import { toStoredEvent, type StoredEvent } from "./event";

// Coordinator-only functions, exported as "@shortlist/db/coordinator" and
// banned from apps/web by ESLint.

// The one cross-workspace read: the coordinator polls every workspace's events.
// Rows stay locked until `tx` ends, so concurrent coordinators skip them.
// "no key update" lets agent_run rows reference a claimed event meanwhile.
export async function claimUnprocessedEventsAcrossWorkspaces(
  tx: Tx,
  limit: number,
): Promise<StoredEvent[]> {
  const rows = await tx
    .select()
    .from(event)
    .where(isNull(event.processedAt))
    .orderBy(asc(event.seq))
    .limit(limit)
    .for("no key update", { skipLocked: true });
  return rows.map(toStoredEvent);
}

// Set once, in the transaction that claimed the event.
export async function markEventProcessed(
  tx: Tx,
  workspaceId: string,
  eventId: string,
): Promise<void> {
  const updated = await tx
    .update(event)
    .set({ processedAt: sql`now()` })
    .where(
      and(
        eq(event.id, eventId),
        eq(event.workspaceId, workspaceId),
        isNull(event.processedAt),
      ),
    )
    .returning({ id: event.id });
  if (updated.length === 1) {
    return;
  }
  const [existing] = await tx
    .select({ id: event.id })
    .from(event)
    .where(and(eq(event.id, eventId), eq(event.workspaceId, workspaceId)));
  if (existing === undefined) {
    throw new Error(`Event ${eventId} not found in workspace ${workspaceId}`);
  }
  throw new Error(`Event ${eventId} was already processed`);
}
