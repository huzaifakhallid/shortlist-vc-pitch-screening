import { describe, expect, it } from "vitest";
import {
  claimUnprocessedEventsAcrossWorkspaces,
  markEventProcessed,
} from "../access/coordinator";
import { insertEvent, withTransaction } from "../index";
import { createTestDeal, createTestWorkspace } from "./helpers";

describe("events", () => {
  it("claims unprocessed events oldest first, across workspaces", async () => {
    const a = await createTestWorkspace("alpha");
    const b = await createTestWorkspace("beta");
    const dealId = await createTestDeal(b.workspace.id);
    const first = await withTransaction((tx) =>
      insertEvent(tx, a.workspace.id, {
        type: "form.submitted",
        dealId: null,
        payload: {},
      }),
    );
    const second = await withTransaction((tx) =>
      insertEvent(tx, b.workspace.id, {
        type: "deal.stage_changed",
        dealId,
        payload: { from: "SCREENED", to: "FIRST_CALL", source: "dashboard" },
      }),
    );

    const claimed = await withTransaction((tx) =>
      claimUnprocessedEventsAcrossWorkspaces(tx, 10),
    );
    expect(claimed).toEqual([first, second]);
    expect(claimed[1]).toMatchObject({
      workspaceId: b.workspace.id,
      dealId,
      payload: { from: "SCREENED", to: "FIRST_CALL", source: "dashboard" },
    });
  });

  it("skips events another transaction has claimed", async () => {
    const a = await createTestWorkspace("alpha");
    await withTransaction((tx) =>
      insertEvent(tx, a.workspace.id, {
        type: "email.received",
        dealId: null,
        payload: {},
      }),
    );

    await withTransaction(async (tx) => {
      const mine = await claimUnprocessedEventsAcrossWorkspaces(tx, 10);
      expect(mine).toHaveLength(1);
      const other = await withTransaction((tx2) =>
        claimUnprocessedEventsAcrossWorkspaces(tx2, 10),
      );
      expect(other).toEqual([]);
    });
  });

  it("requires a deal exactly for events that happen after one exists", async () => {
    const a = await createTestWorkspace("alpha");
    const dealId = await createTestDeal(a.workspace.id);
    await expect(
      withTransaction((tx) =>
        insertEvent(tx, a.workspace.id, {
          type: "email.received",
          dealId,
          payload: {},
        }),
      ),
    ).rejects.toMatchObject({
      cause: { constraint: "event_deal_id_matches_type" },
    });
    await expect(
      withTransaction((tx) =>
        insertEvent(tx, a.workspace.id, {
          type: "deal.received",
          dealId: null,
          payload: {},
        }),
      ),
    ).rejects.toMatchObject({
      cause: { constraint: "event_deal_id_matches_type" },
    });
  });

  it("marks an event processed exactly once", async () => {
    const a = await createTestWorkspace("alpha");
    const created = await withTransaction((tx) =>
      insertEvent(tx, a.workspace.id, {
        type: "email.received",
        dealId: null,
        payload: {},
      }),
    );

    await withTransaction(async (tx) => {
      const [claimed] = await claimUnprocessedEventsAcrossWorkspaces(tx, 10);
      expect(claimed?.id).toBe(created.id);
      await markEventProcessed(tx, a.workspace.id, created.id);
    });

    await expect(
      withTransaction((tx) => claimUnprocessedEventsAcrossWorkspaces(tx, 10)),
    ).resolves.toEqual([]);
    await expect(
      withTransaction((tx) =>
        markEventProcessed(tx, a.workspace.id, created.id),
      ),
    ).rejects.toThrow(`Event ${created.id} was already processed`);
  });

  it("refuses an invalid payload before writing it", async () => {
    const a = await createTestWorkspace("alpha");
    const dealId = await createTestDeal(a.workspace.id);
    // What agent output typed loosely at runtime could produce.
    const loose = JSON.parse('{ "from": "SCREENED" }') as {
      from: "SCREENED";
      to: "IC";
      source: "slack";
    };
    await expect(
      withTransaction((tx) =>
        insertEvent(tx, a.workspace.id, {
          type: "deal.stage_changed",
          dealId,
          payload: loose,
        }),
      ),
    ).rejects.toThrow('Event "deal.stage_changed" has an invalid payload');
    await expect(
      withTransaction((tx) => claimUnprocessedEventsAcrossWorkspaces(tx, 10)),
    ).resolves.toEqual([]);
  });
});
