import { and, asc, eq, isNull, lt, sql } from "drizzle-orm";
import { fromDrizzle, type Db as JobDb } from "pg-boss";
import { single, type Tx } from "../client";
import { event } from "../schema";
import { toStoredEvent, type StoredEvent } from "./event";

// The coordinator reads the active config and the day's spend inside its
// claiming transaction.
export { selectActiveConfig } from "./config";
export { selectSpendTodayMicros } from "./spend";

// Coordinator-only functions, exported as "@shortlist/db/coordinator" and
// banned from apps/web by ESLint.

// An event whose dispatch failed this often is no longer claimed; its
// dispatch_error says why.
export const MAX_DISPATCH_ATTEMPTS = 3;

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
    .where(
      and(
        isNull(event.processedAt),
        lt(event.dispatchAttempts, MAX_DISPATCH_ATTEMPTS),
      ),
    )
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

// In the claiming transaction, after the event's own dispatch was rolled back.
export async function recordDispatchFailure(
  tx: Tx,
  workspaceId: string,
  eventId: string,
  error: string,
): Promise<{ attempts: number }> {
  const rows = await tx
    .update(event)
    .set({
      dispatchAttempts: sql`${event.dispatchAttempts} + 1`,
      dispatchError: error,
    })
    .where(
      and(
        eq(event.id, eventId),
        eq(event.workspaceId, workspaceId),
        isNull(event.processedAt),
      ),
    )
    .returning({ attempts: event.dispatchAttempts });
  return single(rows, `unprocessed event ${eventId}`);
}

// Runs pg-boss statements in `tx`, for `boss.send(…, { db: jobQueueDb(tx) })`:
// a run and its job commit together.
export function jobQueueDb(tx: Tx): JobDb {
  return fromDrizzle(tx, sql);
}
