import { describe, expect, it } from "vitest";
import { markEventProcessed } from "../access/coordinator";
import {
  createRun,
  getActiveConfig,
  insertEvent,
  insertStep,
  listSteps,
  startRun,
  withTransaction,
} from "../index";
import { createTestDeal, createTestWorkspace, saveTestConfig } from "./helpers";

async function twoWorkspaces() {
  const a = await createTestWorkspace("alpha");
  const b = await createTestWorkspace("beta");
  const configA = await saveTestConfig(a);
  const eventA = await withTransaction((tx) =>
    insertEvent(tx, a.workspace.id, {
      type: "email.received",
      dealId: null,
      payload: {},
    }),
  );
  const { run: runA } = await withTransaction((tx) =>
    createRun(tx, a.workspace.id, {
      agent: "intake",
      triggerEventId: eventA.id,
      configVersionId: configA.id,
    }),
  );
  return { a: a.workspace.id, b: b.workspace.id, configA, eventA, runA };
}

// Workspace B must never read or change workspace A's rows.
describe("tenancy", () => {
  it("keeps configs apart", async () => {
    const { b } = await twoWorkspaces();
    await expect(getActiveConfig(b)).rejects.toThrow(
      `Workspace ${b} has no active config version`,
    );
  });

  it("keeps events apart", async () => {
    const { b, eventA } = await twoWorkspaces();
    await expect(
      withTransaction((tx) => markEventProcessed(tx, b, eventA.id)),
    ).rejects.toThrow(`Event ${eventA.id} not found in workspace ${b}`);
    await expect(
      withTransaction((tx) =>
        createRun(tx, b, {
          agent: "intake",
          triggerEventId: eventA.id,
          configVersionId: "00000000-0000-0000-0000-000000000000",
        }),
      ),
    ).rejects.toThrow(`Trigger event ${eventA.id} not found in workspace ${b}`);
  });

  it("keeps runs and steps apart", async () => {
    const { a, b, runA } = await twoWorkspaces();
    await startRun(a, runA.id, {
      promptVersion: null,
      model: null,
      inputHash: "h",
    });
    await insertStep(a, runA.id, {
      step: "parse",
      status: "SUCCEEDED",
      output: {},
    });

    await expect(
      startRun(b, runA.id, {
        promptVersion: null,
        model: null,
        inputHash: "h",
      }),
    ).rejects.toThrow(`Run ${runA.id} not found in workspace ${b}`);
    await expect(
      insertStep(b, runA.id, { step: "x", status: "FAILED", output: null }),
    ).rejects.toThrow(`Run ${runA.id} not found in workspace ${b}`);
    expect(await listSteps(b, runA.id)).toEqual([]);
    expect(await listSteps(a, runA.id)).toHaveLength(1);
  });

  it("rejects cross-workspace references in the database", async () => {
    const { a, b, configA } = await twoWorkspaces();
    const dealB = await createTestDeal(b);
    await expect(
      withTransaction((tx) =>
        insertEvent(tx, a, {
          type: "deal.received",
          dealId: dealB,
          payload: {},
        }),
      ),
    ).rejects.toMatchObject({ cause: { constraint: "event_deal_fk" } });

    const eventB = await withTransaction((tx) =>
      insertEvent(tx, b, { type: "deal.received", dealId: dealB, payload: {} }),
    );
    await expect(
      withTransaction((tx) =>
        createRun(tx, b, {
          agent: "screening",
          triggerEventId: eventB.id,
          configVersionId: configA.id,
        }),
      ),
    ).rejects.toMatchObject({
      cause: { constraint: "agent_run_config_version_fk" },
    });
  });
});
