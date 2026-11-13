import { eventSchema, type ShortlistEvent } from "@shortlist/schemas";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, single, type Tx } from "../client";
import { event } from "../schema";

export type StoredEvent = ShortlistEvent & {
  id: string;
  workspaceId: string;
  dealId: string | null;
  createdAt: Date;
};

// Not exported from the package: shared with ./coordinator.
export function toStoredEvent(row: typeof event.$inferSelect): StoredEvent {
  const parsed = eventSchema.safeParse({
    type: row.type,
    payload: row.payload,
  });
  if (!parsed.success) {
    throw new Error(
      `Event ${row.id} has an invalid payload: ${z.prettifyError(parsed.error)}`,
    );
  }
  return {
    ...parsed.data,
    id: row.id,
    workspaceId: row.workspaceId,
    dealId: row.dealId,
    createdAt: row.createdAt,
  };
}

export async function getEvent(
  workspaceId: string,
  eventId: string,
): Promise<StoredEvent> {
  const [row] = await db()
    .select()
    .from(event)
    .where(and(eq(event.id, eventId), eq(event.workspaceId, workspaceId)));
  if (row === undefined) {
    throw new Error(`Event ${eventId} not found in workspace ${workspaceId}`);
  }
  return toStoredEvent(row);
}

// Takes the caller's transaction: an event is always written together with
// the change that caused it (§8.1). The payload is validated before it is
// stored: agent output reaches here at runtime.
export async function insertEvent(
  tx: Tx,
  workspaceId: string,
  input: ShortlistEvent & { dealId: string | null },
): Promise<StoredEvent> {
  const parsed = eventSchema.safeParse({
    type: input.type,
    payload: input.payload,
  });
  if (!parsed.success) {
    throw new Error(
      `Event "${input.type}" has an invalid payload: ${z.prettifyError(parsed.error)}`,
    );
  }
  const rows = await tx
    .insert(event)
    .values({
      workspaceId,
      dealId: input.dealId,
      type: parsed.data.type,
      payload: parsed.data.payload,
    })
    .returning();
  return toStoredEvent(single(rows, `event "${input.type}"`));
}
