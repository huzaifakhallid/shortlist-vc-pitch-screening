import { eventSchema, type ShortlistEvent } from "@shortlist/schemas";
import { z } from "zod";
import { single, type Tx } from "../client";
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

// Takes the caller's transaction: an event is always written together with
// the change that caused it (§8.1).
export async function insertEvent(
  tx: Tx,
  workspaceId: string,
  input: ShortlistEvent & { dealId: string | null },
): Promise<StoredEvent> {
  const rows = await tx
    .insert(event)
    .values({
      workspaceId,
      dealId: input.dealId,
      type: input.type,
      payload: input.payload,
    })
    .returning();
  return toStoredEvent(single(rows, `event "${input.type}"`));
}
