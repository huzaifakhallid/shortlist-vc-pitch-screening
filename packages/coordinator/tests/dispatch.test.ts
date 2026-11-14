import { insertEvent, saveConfigVersion, withTransaction } from "@shortlist/db";
import { MAX_DISPATCH_ATTEMPTS } from "@shortlist/db/coordinator";
import type { PgBoss } from "pg-boss";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  configFor,
  createTestDeal,
  createTestWorkspace,
  getTestEventRow,
  listTestRuns,
  saveTestConfig,
  type TestWorkspace,
} from "../../db/tests/helpers";
import { dispatchEvents } from "../dispatch";
import { AGENT_RUN_QUEUE, createAgentRunQueue } from "../queue";
import { listener } from "./agents";
import { startTestBoss } from "./boss";

let boss: PgBoss;
beforeAll(async () => {
  boss = await startTestBoss();
});
beforeEach(async () => {
  await boss.deleteAllJobs(AGENT_RUN_QUEUE);
  // Failed dispatches are logged to stderr; keep the test output readable.
  vi.spyOn(console, "error").mockReturnValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await boss.stop();
});

async function dealReceived(t: TestWorkspace) {
  const dealId = await createTestDeal(t.workspace.id);
  return withTransaction((tx) =>
    insertEvent(tx, t.workspace.id, {
      type: "deal.received",
      dealId,
      payload: {},
    }),
  );
}

const registry = [
  listener("screening", ["deal.received"]),
  listener("pipeline", ["deal.received"]),
];

const nothing = { events: 0, runs: 0, failed: 0 };

describe("dispatchEvents", () => {
  it("creates a run and its job per enabled listening agent", async () => {
    const t = await createTestWorkspace("kestrel");
    const config = await saveTestConfig(t);
    const event = await dealReceived(t);

    expect(await dispatchEvents(boss, registry)).toEqual({
      events: 1,
      runs: 2,
      failed: 0,
    });

    const runs = await listTestRuns(t.workspace.id);
    expect(runs.map((run) => run.agent).sort()).toEqual([
      "pipeline",
      "screening",
    ]);
    for (const run of runs) {
      expect(run).toMatchObject({
        status: "QUEUED",
        triggerEventId: event.id,
        configVersionId: config.id,
        dealId: event.dealId,
      });
      const [job] = await boss.findJobs(AGENT_RUN_QUEUE, { id: run.id });
      expect(job?.data).toEqual({ workspaceId: t.workspace.id, runId: run.id });
    }
  });

  it("creates no run for a disabled agent, and still processes the event", async () => {
    const t = await createTestWorkspace("kestrel");
    const config = configFor(t.partner.id);
    config.agents.pipeline.enabled = false;
    await saveConfigVersion(t.workspace.id, config, t.partner.id);
    await dealReceived(t);

    expect(await dispatchEvents(boss, registry)).toEqual({
      events: 1,
      runs: 1,
      failed: 0,
    });
    expect((await listTestRuns(t.workspace.id)).map((r) => r.agent)).toEqual([
      "screening",
    ]);
    expect(await dispatchEvents(boss, registry)).toEqual(nothing);
  });

  it("creates no run for an agent whose dependency is off (§8.3)", async () => {
    const t = await createTestWorkspace("kestrel");
    // Memo needs Screening, so with Screening off the only valid config
    // has Memo off too.
    const config = configFor(t.partner.id);
    config.agents.screening.enabled = false;
    config.agents.diligence.enabled = false;
    await expect(
      saveConfigVersion(t.workspace.id, config, t.partner.id),
    ).rejects.toThrow("Memo needs Screening to be enabled");
    config.agents.memo.enabled = false;
    await saveConfigVersion(t.workspace.id, config, t.partner.id);
    await dealReceived(t);

    const memoOnReceived = [listener("memo", ["deal.received"])];
    expect(await dispatchEvents(boss, memoOnReceived)).toEqual({
      events: 1,
      runs: 0,
      failed: 0,
    });
    expect(await listTestRuns(t.workspace.id)).toEqual([]);
  });

  it("dispatches each event once", async () => {
    const t = await createTestWorkspace("kestrel");
    await saveTestConfig(t);
    await dealReceived(t);

    await dispatchEvents(boss, registry);
    expect(await dispatchEvents(boss, registry)).toEqual(nothing);
    expect(await listTestRuns(t.workspace.id)).toHaveLength(2);
    expect(await boss.findJobs(AGENT_RUN_QUEUE)).toHaveLength(2);
  });

  it("rolls back a failing event alone and records why", async () => {
    // No active config in "broken": its event can't be dispatched.
    const broken = await createTestWorkspace("broken");
    const bad = await dealReceived(broken);
    const t = await createTestWorkspace("kestrel");
    await saveTestConfig(t);
    const good = await dealReceived(t);

    expect(await dispatchEvents(boss, registry)).toEqual({
      events: 2,
      runs: 2,
      failed: 1,
    });
    expect(await listTestRuns(t.workspace.id)).toHaveLength(2);
    expect(await getTestEventRow(good.id)).toMatchObject({
      dispatchAttempts: 0,
      dispatchError: null,
    });
    expect(await getTestEventRow(bad.id)).toMatchObject({
      processedAt: null,
      dispatchAttempts: 1,
      dispatchError: `Workspace ${broken.workspace.id} has no active config version`,
    });
  });

  it(`stops claiming an event after ${String(MAX_DISPATCH_ATTEMPTS)} failed dispatches`, async () => {
    const broken = await createTestWorkspace("broken");
    const bad = await dealReceived(broken);

    for (let i = 0; i < MAX_DISPATCH_ATTEMPTS; i += 1) {
      expect(await dispatchEvents(boss, registry)).toEqual({
        events: 1,
        runs: 0,
        failed: 1,
      });
    }
    expect(await dispatchEvents(boss, registry)).toEqual(nothing);
    expect(await getTestEventRow(bad.id)).toMatchObject({
      processedAt: null,
      dispatchAttempts: MAX_DISPATCH_ATTEMPTS,
      dispatchError: `Workspace ${broken.workspace.id} has no active config version`,
    });
  });

  it("commits none of an event's runs when enqueueing fails", async () => {
    const t = await createTestWorkspace("kestrel");
    await saveTestConfig(t);
    const event = await dealReceived(t);

    await boss.deleteQueue(AGENT_RUN_QUEUE);
    try {
      expect(await dispatchEvents(boss, registry)).toEqual({
        events: 1,
        runs: 0,
        failed: 1,
      });
    } finally {
      await createAgentRunQueue(boss);
    }
    expect(await listTestRuns(t.workspace.id)).toEqual([]);
    expect((await getTestEventRow(event.id)).dispatchAttempts).toBe(1);
    // Still unprocessed, so the next tick takes it.
    expect(await dispatchEvents(boss, registry)).toEqual({
      events: 1,
      runs: 2,
      failed: 0,
    });
  });
});
