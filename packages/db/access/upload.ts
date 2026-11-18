import type { PitchForm } from "@shortlist/schemas";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, single, withTransaction } from "../client";
import { pendingUpload } from "../schema";
import { insertEvent, type StoredEvent } from "./event";

export type PendingUpload = {
  objectKey: string;
  sizeBytes: number;
  confirmed: boolean;
  // Measured against the database clock when the row was read.
  expired: boolean;
};

// Written when a deck upload is presigned. Expires `expiresInSeconds` from
// now on the database clock.
export async function createPendingUpload(
  workspaceId: string,
  input: { objectKey: string; sizeBytes: number; expiresInSeconds: number },
): Promise<void> {
  await db()
    .insert(pendingUpload)
    .values({
      workspaceId,
      objectKey: input.objectKey,
      sizeBytes: input.sizeBytes,
      expiresAt: sql`now() + make_interval(secs => ${input.expiresInSeconds})`,
    });
}

export async function getPendingUpload(
  workspaceId: string,
  objectKey: string,
): Promise<PendingUpload | null> {
  const [row] = await db()
    .select({
      objectKey: pendingUpload.objectKey,
      sizeBytes: pendingUpload.sizeBytes,
      confirmedAt: pendingUpload.confirmedAt,
      expired: sql<boolean>`${pendingUpload.expiresAt} <= now()`,
    })
    .from(pendingUpload)
    .where(
      and(
        eq(pendingUpload.workspaceId, workspaceId),
        eq(pendingUpload.objectKey, objectKey),
      ),
    );
  if (row === undefined) {
    return null;
  }
  return {
    objectKey: row.objectKey,
    sizeBytes: row.sizeBytes,
    confirmed: row.confirmedAt !== null,
    expired: row.expired,
  };
}

// After a rejected upload's object is deleted. A confirmed upload belongs to
// a submission and is never deleted here.
export async function deletePendingUpload(
  workspaceId: string,
  objectKey: string,
): Promise<void> {
  await db()
    .delete(pendingUpload)
    .where(
      and(
        eq(pendingUpload.workspaceId, workspaceId),
        eq(pendingUpload.objectKey, objectKey),
        isNull(pendingUpload.confirmedAt),
      ),
    );
}

// The upload was confirmed or expired between the caller's read and this
// write. Its message is safe to show the founder.
export class UploadNotConfirmableError extends Error {
  constructor() {
    super("Your deck upload expired or was already used. Upload it again.");
    this.name = "UploadNotConfirmableError";
  }
}

// A pitch from the public form (§7.1, §8.1): confirms the verified upload
// (once, before it expires) and writes form.submitted in one transaction.
// Intake creates the company, deal and submission from the event.
export function submitPitchForm(
  workspaceId: string,
  input: { objectKey: string; etag: string; form: PitchForm },
): Promise<StoredEvent> {
  return withTransaction(async (tx) => {
    const confirmed = await tx
      .update(pendingUpload)
      .set({ etag: input.etag, confirmedAt: sql`now()` })
      .where(
        and(
          eq(pendingUpload.workspaceId, workspaceId),
          eq(pendingUpload.objectKey, input.objectKey),
          isNull(pendingUpload.confirmedAt),
          gt(pendingUpload.expiresAt, sql`now()`),
        ),
      )
      .returning({ sizeBytes: pendingUpload.sizeBytes });
    if (confirmed.length === 0) {
      throw new UploadNotConfirmableError();
    }
    const { sizeBytes } = single(confirmed, "pending upload");
    return insertEvent(tx, workspaceId, {
      type: "form.submitted",
      dealId: null,
      payload: {
        form: input.form,
        deck: { objectKey: input.objectKey, etag: input.etag, sizeBytes },
      },
    });
  });
}
