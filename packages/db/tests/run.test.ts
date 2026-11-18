import { describe, expect, it } from "vitest";
import {
  createRun,
  finishRun,
  insertEvent,
  insertStep,
  listSteps,
  startRun,
  withTransaction,
} from "../index";
import { createTestDeal, createTestWorkspace, saveTestConfig } from "./helpers";

async function queuedRun() {
  const t = await createTestWorkspace("kestrel");
  const config = await saveTestConfig(t);
  const dealId = await createTestDeal(t.workspace.id);
  const trigger = await withTransaction((tx) =>
    insertEvent(tx, t.workspace.id, {
      type: "deal.received",
      dealId,
      payload: {},
    }),
  );
  const input = {
    agent: "screening" as const,
    triggerEventId: trigger.id,
    configVersionId: config.id,
  };
  const { run } = await withTransaction((tx) =>
    createRun(tx, t.workspace.id, input),
  );
  return { workspaceId: t.workspace.id, dealId, input, run };
}

const usage = { latencyMs: 900 };
const noUsage = { tokensIn: 0, tokensOut: 0, costMicros: 0 };
const started = { promptVersion: "v1", model: "gemini-test", inputHash: "abc" };

describe("agent runs", () => {
  it("creates one run per (agent, trigger event)", async () => {
    const { workspaceId, dealId, input, run } = await queuedRun();
    expect(run).toMatchObject({ status: "QUEUED", dealId, workspaceId });

    const again = await withTransaction((tx) =>
      createRun(tx, workspaceId, input),
    );
    expect(again).toEqual({ run, created: false });

    const other = await withTransaction((tx) =>
      createRun(tx, workspaceId, { ...input, agent: "research" }),
    );
    expect(other.created).toBe(true);
    expect(other.run.id).not.toBe(run.id);
  });

  it("starts, resumes and finishes a run once", async () => {
    const { workspaceId, run } = await queuedRun();
    const first = await startRun(workspaceId, run.id, started);
    const resumed = await startRun(workspaceId, run.id, started);
    expect(resumed.status).toBe("RUNNING");
    expect(resumed.startedAt).toEqual(first.startedAt);

    const finished = await withTransaction((tx) =>
      finishRun(tx, workspaceId, run.id, {
        status: "SUCCEEDED",
        output: { score: 72 },
        ...usage,
      }),
    );
    expect(finished).toMatchObject({
      status: "SUCCEEDED",
      output: { score: 72 },
      error: null,
      ...usage,
      ...noUsage,
    });
    expect(finished.finishedAt).toBeInstanceOf(Date);

    await expect(
      withTransaction((tx) =>
        finishRun(tx, workspaceId, run.id, {
          status: "FAILED",
          error: "late",
          ...usage,
        }),
      ),
    ).rejects.toThrow(`Cannot finish run ${run.id}: it is SUCCEEDED`);
    await expect(startRun(workspaceId, run.id, started)).rejects.toThrow(
      `Cannot start run ${run.id}: it is SUCCEEDED`,
    );
  });

  it("refuses to resume with a different prompt version", async () => {
    const { workspaceId, run } = await queuedRun();
    await startRun(workspaceId, run.id, started);
    await expect(
      startRun(workspaceId, run.id, { ...started, promptVersion: "v2" }),
    ).rejects.toThrow(
      `Cannot resume run ${run.id} with a different promptVersion: started with "v1", got "v2"`,
    );
  });

  it("refuses to record a received deal on a run that has one", async () => {
    const { workspaceId, dealId, run } = await queuedRun();
    await startRun(workspaceId, run.id, started);
    const other = await createTestDeal(workspaceId);

    await expect(
      withTransaction((tx) =>
        finishRun(tx, workspaceId, run.id, {
          status: "SUCCEEDED",
          output: {},
          ...usage,
          receivedDealId: other,
        }),
      ),
    ).rejects.toThrow(
      `Cannot record deal ${other} on run ${run.id}: it already has deal ${dealId}`,
    );
  });

  it("fails, but never succeeds, a run that never started", async () => {
    const { workspaceId, run } = await queuedRun();
    await expect(
      withTransaction((tx) =>
        finishRun(tx, workspaceId, run.id, {
          status: "SUCCEEDED",
          output: {},
          ...usage,
        }),
      ),
    ).rejects.toThrow(`Cannot finish run ${run.id}: it is QUEUED`);

    const failed = await withTransaction((tx) =>
      finishRun(tx, workspaceId, run.id, {
        status: "FAILED",
        error: "early",
        ...usage,
      }),
    );
    expect(failed).toMatchObject({
      status: "FAILED",
      error: "early",
      startedAt: null,
    });
    expect(failed.finishedAt).toBeInstanceOf(Date);
  });

  it("adds steps only while the run is running", async () => {
    const { workspaceId, run } = await queuedRun();
    const step = {
      step: "render",
      status: "SUCCEEDED" as const,
      output: {},
      usage: noUsage,
    };
    await expect(insertStep(workspaceId, run.id, step)).rejects.toThrow(
      `Cannot add a step to run ${run.id}: it is QUEUED`,
    );
    await startRun(workspaceId, run.id, started);
    await insertStep(workspaceId, run.id, step);
    await withTransaction((tx) =>
      finishRun(tx, workspaceId, run.id, {
        status: "SUCCEEDED",
        output: {},
        ...usage,
      }),
    );
    await expect(insertStep(workspaceId, run.id, step)).rejects.toThrow(
      `Cannot add a step to run ${run.id}: it is SUCCEEDED`,
    );
  });

  it("lists a run's steps in insertion order", async () => {
    const { workspaceId, run } = await queuedRun();
    await startRun(workspaceId, run.id, started);
    await insertStep(workspaceId, run.id, {
      step: "render",
      status: "SUCCEEDED",
      output: { pages: 12 },
      usage: noUsage,
    });
    await insertStep(workspaceId, run.id, {
      step: "facts",
      status: "FAILED",
      output: null,
      usage: noUsage,
    });

    const steps = await listSteps(workspaceId, run.id);
    expect(steps.map((s) => [s.step, s.status, s.output])).toEqual([
      ["render", "SUCCEEDED", { pages: 12 }],
      ["facts", "FAILED", null],
    ]);
  });

  it("totals every step attempt's usage on the run, FAILED ones included", async () => {
    const { workspaceId, run } = await queuedRun();
    await startRun(workspaceId, run.id, started);
    const attempts = [
      { status: "SUCCEEDED" as const, tokensIn: 1200, costMicros: 450 },
      { status: "FAILED" as const, tokensIn: 800, costMicros: 300 },
      { status: "SUCCEEDED" as const, tokensIn: 810, costMicros: 305 },
    ];
    for (const [i, a] of attempts.entries()) {
      await insertStep(workspaceId, run.id, {
        step: i === 0 ? "read" : "score",
        status: a.status,
        output: null,
        usage: {
          tokensIn: a.tokensIn,
          tokensOut: 100,
          costMicros: a.costMicros,
        },
      });
    }

    const finished = await withTransaction((tx) =>
      finishRun(tx, workspaceId, run.id, {
        status: "SUCCEEDED",
        output: {},
        ...usage,
      }),
    );
    expect(finished).toMatchObject({
      tokensIn: 2810,
      tokensOut: 300,
      costMicros: 1055,
    });
  });
});
