import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { validPitchForm } from "../../schemas/tests/pitch.fixture";
import { db } from "../client";
import {
  createPendingUpload,
  deletePendingUpload,
  getEvent,
  getPendingUpload,
  submitPitchForm,
  UploadNotConfirmableError,
} from "../index";
import { event, pendingUpload } from "../schema";
import { createTestWorkspace } from "./helpers";

const keyFor = (workspaceId: string) =>
  `workspaces/${workspaceId}/decks/00000000-0000-4000-8000-000000000001.pdf`;

async function expireUpload(objectKey: string): Promise<void> {
  await db()
    .update(pendingUpload)
    .set({ expiresAt: sql`now() - interval '1 second'` })
    .where(eq(pendingUpload.objectKey, objectKey));
}

async function pendingIn(workspaceId: string, sizeBytes = 10): Promise<string> {
  const key = keyFor(workspaceId);
  await createPendingUpload(workspaceId, {
    objectKey: key,
    sizeBytes,
    expiresInSeconds: 600,
  });
  return key;
}

describe("pending uploads", () => {
  it("stores the presigned size with an expiry on the database clock", async () => {
    const { workspace } = await createTestWorkspace("alpha");
    const key = await pendingIn(workspace.id, 2048);

    expect(await getPendingUpload(workspace.id, key)).toEqual({
      objectKey: key,
      sizeBytes: 2048,
      confirmed: false,
      expired: false,
    });
    const [row] = await db()
      .select({
        seconds: sql<number>`extract(epoch from ${pendingUpload.expiresAt} - now())::int`,
      })
      .from(pendingUpload);
    expect(row?.seconds).toBeGreaterThan(590);
    expect(row?.seconds).toBeLessThanOrEqual(600);

    await expireUpload(key);
    expect((await getPendingUpload(workspace.id, key))?.expired).toBe(true);
  });

  it("is invisible to another workspace", async () => {
    const a = await createTestWorkspace("alpha");
    const b = await createTestWorkspace("beta");
    const key = await pendingIn(a.workspace.id);

    expect(await getPendingUpload(b.workspace.id, key)).toBeNull();
    await deletePendingUpload(b.workspace.id, key);
    expect(await getPendingUpload(a.workspace.id, key)).not.toBeNull();
    await expect(
      submitPitchForm(b.workspace.id, {
        objectKey: key,
        etag: '"e"',
        form: validPitchForm(),
      }),
    ).rejects.toThrow(UploadNotConfirmableError);
  });

  it("deletes an unconfirmed upload", async () => {
    const { workspace } = await createTestWorkspace("alpha");
    const key = await pendingIn(workspace.id);
    await deletePendingUpload(workspace.id, key);
    expect(await getPendingUpload(workspace.id, key)).toBeNull();
  });
});

describe("submitPitchForm", () => {
  it("confirms the upload and writes form.submitted with the stored size and ETag", async () => {
    const { workspace } = await createTestWorkspace("alpha");
    const key = await pendingIn(workspace.id, 4096);

    const stored = await submitPitchForm(workspace.id, {
      objectKey: key,
      etag: '"etag-1"',
      form: validPitchForm(),
    });

    expect(await getEvent(workspace.id, stored.id)).toMatchObject({
      type: "form.submitted",
      dealId: null,
      payload: {
        form: validPitchForm(),
        deck: { objectKey: key, etag: '"etag-1"', sizeBytes: 4096 },
      },
    });
    expect((await getPendingUpload(workspace.id, key))?.confirmed).toBe(true);
    // A confirmed upload belongs to its submission.
    await deletePendingUpload(workspace.id, key);
    expect(await getPendingUpload(workspace.id, key)).not.toBeNull();
  });

  it("refuses a second confirmation, and writes no second event", async () => {
    const { workspace } = await createTestWorkspace("alpha");
    const key = await pendingIn(workspace.id);
    const input = { objectKey: key, etag: '"e"', form: validPitchForm() };
    await submitPitchForm(workspace.id, input);

    await expect(submitPitchForm(workspace.id, input)).rejects.toThrow(
      UploadNotConfirmableError,
    );
    expect(await db().select().from(event)).toHaveLength(1);
  });

  it("refuses an expired upload and leaves it unconfirmed", async () => {
    const { workspace } = await createTestWorkspace("alpha");
    const key = await pendingIn(workspace.id);
    await expireUpload(key);

    await expect(
      submitPitchForm(workspace.id, {
        objectKey: key,
        etag: '"e"',
        form: validPitchForm(),
      }),
    ).rejects.toThrow(UploadNotConfirmableError);
    expect(await getPendingUpload(workspace.id, key)).toMatchObject({
      confirmed: false,
      expired: true,
    });
    expect(await db().select().from(event)).toHaveLength(0);
  });

  it("rolls the confirmation back when the event is invalid", async () => {
    const { workspace } = await createTestWorkspace("alpha");
    const key = await pendingIn(workspace.id);

    await expect(
      submitPitchForm(workspace.id, {
        objectKey: key,
        etag: "",
        form: validPitchForm(),
      }),
    ).rejects.toThrow(/invalid payload/);
    expect((await getPendingUpload(workspace.id, key))?.confirmed).toBe(false);
  });
});
