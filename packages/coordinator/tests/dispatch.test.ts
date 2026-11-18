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
  recordTestSpend,
  rollTestDayOver,
  saveTestConfig,
  type TestWorkspace,
} from "../../db/tests/helpers";
import { dispatchEvents } from "../dispatch";
import {
  AGENT_RUN_DEAD_LETTER_QUEUE,
  AGENT_RUN_QUEUE,
  agentRunJobSchema,
  createAgentRunQueue,
} from "../queue";
import { fullRegistry } from "./agents";
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

// Every agent registered. With configFor's settings, deal.received goes to
// Screening, Comms and Pipeline (Research waits for Screening, §8.2).
const registry = fullRegistry();

// A workspace with a $0.001 cap that has spent it today.
async function overCap(): Promise<TestWorkspace> {
  const t = await createTestWorkspace("kestrel");
  const config = configFor(t.partner.id);
  config.dailySpendCapMicros = 1_000;
  const saved = await saveConfigVersion(t.workspace.id, config, t.partner.id);
  await recordTestSpend(t.workspace.id, saved.id, 1_000);
  return t;
}

const nothing = { events: 0, runs: 0, failed: 0, deferred: 0 };

describe("dispatchEvents", () => {
  it("creates a run and its job per enabled listening agent", async () => {
    const t = await createTestWorkspace("kestrel");
    const config = await saveTestConfig(t);
    const event = await dealReceived(t);

    expect(await dispatchEvents(boss, registry)).toEqual({
      events: 1,
      runs: 3,
      failed: 0,
      deferred: 0,
    });

    const runs = await listTestRuns(t.workspace.id);
    expect(runs.map((run) => run.agent).sort()).toEqual([
      "comms",
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
      // The agent's timeout, and the dead-letter queue for its last failure.
      expect(job).toMatchObject({
        expireInSeconds: 60,
        deadLetter: AGENT_RUN_DEAD_LETTER_QUEUE,
      });
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
      runs: 2,
      failed: 0,
      deferred: 0,
    });
    expect(
      (await listTestRuns(t.workspace.id)).map((r) => r.agent).sort(),
    ).toEqual(["comms", "screening"]);
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

    // Research takes deal.received while Screening is off (§8.2); no Memo.
    expect(await dispatchEvents(boss, registry)).toMatchObject({ runs: 3 });
    expect(
      (await listTestRuns(t.workspace.id)).map((r) => r.agent).sort(),
    ).toEqual(["comms", "pipeline", "research"]);
  });

  it("dispatches each event once", async () => {
    const t = await createTestWorkspace("kestrel");
    await saveTestConfig(t);
    await dealReceived(t);

    await dispatchEvents(boss, registry);
    expect(await dispatchEvents(boss, registry)).toEqual(nothing);
    expect(await listTestRuns(t.workspace.id)).toHaveLength(3);
    expect(await boss.findJobs(AGENT_RUN_QUEUE)).toHaveLength(3);
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
      runs: 3,
      failed: 1,
      deferred: 0,
    });
    expect(await listTestRuns(t.workspace.id)).toHaveLength(3);
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
        deferred: 0,
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
        deferred: 0,
      });
    } finally {
      await createAgentRunQueue(boss);
    }
    expect(await listTestRuns(t.workspace.id)).toEqual([]);
    expect((await getTestEventRow(event.id)).dispatchAttempts).toBe(1);
    // Still unprocessed, so the next tick takes it.
    expect(await dispatchEvents(boss, registry)).toEqual({
      events: 1,
      runs: 3,
      failed: 0,
      deferred: 0,
    });
  });

  it("defers an event over the daily spend cap to the next UTC day, without counting an attempt (§15.5)", async () => {
    const t = await overCap();
    const event = await dealReceived(t);

    expect(await dispatchEvents(boss, registry)).toEqual({
      events: 1,
      runs: 0,
      failed: 0,
      deferred: 1,
    });
    // Only the run that recorded the spend.
    expect((await listTestRuns(t.workspace.id)).map((r) => r.agent)).toEqual([
      "intake",
    ]);
    expect(await boss.findJobs(AGENT_RUN_QUEUE)).toEqual([]);
    const row = await getTestEventRow(event.id);
    expect(row).toMatchObject({
      processedAt: null,
      dispatchAttempts: 0,
      dispatchError: `Workspace ${t.workspace.id} reached its daily AI spend cap: 1000 of 1000 micro-dollars spent today (UTC)`,
    });
    // A UTC midnight after the event. The deferral's now() is later than
    // createdAt and may fall on the next UTC day, so allow up to two days.
    const deferredUntil = row.deferredUntil?.getTime() ?? Number.NaN;
    expect(deferredUntil % 86_400_000).toBe(0);
    expect(deferredUntil).toBeGreaterThan(row.createdAt.getTime());
    expect(deferredUntil - row.createdAt.getTime()).toBeLessThanOrEqual(
      2 * 86_400_000,
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(
        `ALERT spend cap reached: workspace ${t.workspace.id}`,
      ),
    );

    // Not claimed again before midnight, however many ticks run.
    for (let i = 0; i < MAX_DISPATCH_ATTEMPTS + 1; i += 1) {
      expect(await dispatchEvents(boss, registry)).toEqual(nothing);
    }
    expect((await getTestEventRow(event.id)).dispatchAttempts).toBe(0);
  });

  it("keeps an event's earlier failed attempts when the cap defers it", async () => {
    // No active config yet: the first dispatch fails.
    const t = await createTestWorkspace("kestrel");
    const event = await dealReceived(t);
    expect(await dispatchEvents(boss, registry)).toMatchObject({ failed: 1 });

    const config = configFor(t.partner.id);
    config.dailySpendCapMicros = 1_000;
    const saved = await saveConfigVersion(t.workspace.id, config, t.partner.id);
    await recordTestSpend(t.workspace.id, saved.id, 1_000);
    expect(await dispatchEvents(boss, registry)).toMatchObject({ deferred: 1 });
    expect((await getTestEventRow(event.id)).dispatchAttempts).toBe(1);
  });

  it("dispatches deferred events in order once the UTC day rolls over", async () => {
    const t = await overCap();
    const events = [
      await dealReceived(t),
      await dealReceived(t),
      await dealReceived(t),
    ];
    expect(await dispatchEvents(boss, registry)).toEqual({
      events: 3,
      runs: 0,
      failed: 0,
      deferred: 3,
    });

    await rollTestDayOver(t.workspace.id);
    const send = vi.spyOn(boss, "send");
    expect(await dispatchEvents(boss, registry)).toEqual({
      events: 3,
      runs: 9,
      failed: 0,
      deferred: 0,
    });
    const runs = await listTestRuns(t.workspace.id);
    const triggerOf = new Map(runs.map((r) => [r.id, r.triggerEventId]));
    const sentFor = send.mock.calls.map(([, data]) =>
      triggerOf.get(agentRunJobSchema.parse(data).runId),
    );
    // Three runs per event, events in order.
    expect(sentFor).toEqual(events.flatMap((e) => [e.id, e.id, e.id]));
    for (const e of events) {
      expect((await getTestEventRow(e.id)).processedAt).toBeInstanceOf(Date);
    }
  });

  it("defers only the over-cap workspace's events", async () => {
    const capped = await overCap();
    const deferredEvent = await dealReceived(capped);
    const t = await createTestWorkspace("other");
    await saveTestConfig(t);
    const event = await dealReceived(t);

    expect(await dispatchEvents(boss, registry)).toEqual({
      events: 2,
      runs: 3,
      failed: 0,
      deferred: 1,
    });
    expect((await getTestEventRow(event.id)).processedAt).toBeInstanceOf(Date);
    expect(await getTestEventRow(deferredEvent.id)).toMatchObject({
      processedAt: null,
      dispatchAttempts: 0,
    });
    // A later event in the other workspace isn't held up by the deferred one.
    await dealReceived(t);
    expect(await dispatchEvents(boss, registry)).toEqual({
      events: 1,
      runs: 3,
      failed: 0,
      deferred: 0,
    });
  });

  it("queues runs while the workspace is under its cap, counting only its own spend", async () => {
    const other = await createTestWorkspace("other");
    const otherConfig = await saveTestConfig(other);
    await recordTestSpend(other.workspace.id, otherConfig.id, 10_000_000);
    const t = await createTestWorkspace("kestrel");
    const config = configFor(t.partner.id);
    config.dailySpendCapMicros = 1_000;
    const saved = await saveConfigVersion(t.workspace.id, config, t.partner.id);
    await recordTestSpend(t.workspace.id, saved.id, 999);
    await dealReceived(t);

    expect(await dispatchEvents(boss, registry)).toEqual({
      events: 1,
      runs: 3,
      failed: 0,
      deferred: 0,
    });
  });

  it("processes an event no enabled agent takes, even over the cap", async () => {
    const t = await createTestWorkspace("kestrel");
    const config = configFor(t.partner.id);
    config.dailySpendCapMicros = 1_000;
    for (const key of [
      "screening",
      "research",
      "memo",
      "comms",
      "pipeline",
    ] as const) {
      config.agents[key].enabled = false;
    }
    const saved = await saveConfigVersion(t.workspace.id, config, t.partner.id);
    await recordTestSpend(t.workspace.id, saved.id, 5_000);
    const event = await dealReceived(t);

    expect(await dispatchEvents(boss, [])).toEqual({
      events: 1,
      runs: 0,
      failed: 0,
      deferred: 0,
    });
    expect((await getTestEventRow(event.id)).processedAt).toBeInstanceOf(Date);
  });

  it("fails the dispatch visibly when an enabled agent isn't registered", async () => {
    const t = await createTestWorkspace("kestrel");
    await saveTestConfig(t);
    const event = await dealReceived(t);

    expect(await dispatchEvents(boss, fullRegistry("comms"))).toEqual({
      events: 1,
      runs: 0,
      failed: 1,
      deferred: 0,
    });
    // None of the event's runs commit, and it stays unprocessed.
    expect(await listTestRuns(t.workspace.id)).toEqual([]);
    expect(await getTestEventRow(event.id)).toMatchObject({
      processedAt: null,
      dispatchAttempts: 1,
      dispatchError: `Agent "comms" is enabled and takes deal.received, but this worker doesn't register it`,
    });
  });
});
