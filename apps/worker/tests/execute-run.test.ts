import {
  ProviderError,
  type AgentDefinition,
  type LlmClient,
} from "@shortlist/agents-shared";
import {
  AGENT_RUN_QUEUE,
  dispatchEvents,
  type AgentRunJob,
} from "@shortlist/coordinator";
import {
  insertEvent,
  listSteps,
  withTransaction,
  type AgentRun,
} from "@shortlist/db";
import { claimUnprocessedEventsAcrossWorkspaces } from "@shortlist/db/coordinator";
import type { EventType, ShortlistEvent } from "@shortlist/schemas";
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
import { z } from "zod";
import { startTestBoss } from "../../../packages/coordinator/tests/boss";
import {
  createTestDeal,
  createTestWorkspace,
  listTestRuns,
  saveTestConfig,
} from "../../../packages/db/tests/helpers";
import {
  executeRun,
  handleAgentRunJobs,
  type RunDeps,
} from "../src/execute-run";

let boss: PgBoss;
beforeAll(async () => {
  boss = await startTestBoss();
});
beforeEach(async () => {
  await boss.deleteAllJobs(AGENT_RUN_QUEUE);
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await boss.stop();
});

type TestAgent = AgentDefinition<{ eventId: string }, { score: number }>;

// A test-only agent under a real key (agent_run.agent is an enum of the
// seven); the worker's own registry stays empty. Two steps, then one event.
function testAgent(options: {
  listensTo: EventType;
  score: () => Promise<number>;
  emits: ShortlistEvent;
}) {
  const calls = { read: 0, score: 0 };
  const agent: TestAgent = {
    key: "screening",
    listensTo: [options.listensTo],
    promptVersion: "test.v1",
    model: "test-model",
    needs: (deal) => ({ eventId: deal.trigger.id }),
    run: async (_input, ctx) => {
      const read = await ctx.runStep(
        "read",
        z.strictObject({ pages: z.number() }),
        () => {
          calls.read += 1;
          return Promise.resolve({ pages: 3 });
        },
      );
      const score = await ctx.runStep("score", z.number(), () => {
        calls.score += 1;
        return options.score();
      });
      return { score: score + read.pages };
    },
    outputSchema: z.strictObject({ score: z.number() }),
    emits: () => [options.emits],
  };
  return { agent, calls };
}

const llm: LlmClient = {
  structured: () =>
    Promise.reject(new Error("The test agent makes no model call")),
  usage: () => ({ tokensIn: 0, tokensOut: 0, costMicros: 0 }),
};

function depsFor(agent: TestAgent) {
  const logs: string[] = [];
  const deps: RunDeps = {
    registry: [agent],
    llmForRun: () => llm,
    log: (message) => logs.push(message),
  };
  return { deps, logs };
}

const screened: ShortlistEvent = { type: "deal.screened", payload: {} };
const firstAttempt = { retryCount: 0, retryLimit: 3 };

// Inserts `trigger` in a new workspace and dispatches it to `deps`' agent.
async function dispatchedRun(
  deps: RunDeps,
  trigger: "deal.received" | "email.received" = "deal.received",
) {
  const t = await createTestWorkspace("kestrel");
  await saveTestConfig(t);
  const dealId =
    trigger === "deal.received" ? await createTestDeal(t.workspace.id) : null;
  await withTransaction((tx) =>
    insertEvent(tx, t.workspace.id, { type: trigger, dealId, payload: {} }),
  );
  await dispatchEvents(boss, deps.registry);
  const [run] = await listTestRuns(t.workspace.id);
  if (run === undefined) {
    throw new Error("Expected the dispatch to create a run");
  }
  const job: AgentRunJob = { workspaceId: t.workspace.id, runId: run.id };
  return { dealId, run, job };
}

async function reload(run: AgentRun): Promise<AgentRun> {
  const found = (await listTestRuns(run.workspaceId)).find(
    (r) => r.id === run.id,
  );
  if (found === undefined) {
    throw new Error(`Run ${run.id} disappeared`);
  }
  return found;
}

function unprocessedEvents() {
  return withTransaction((tx) =>
    claimUnprocessedEventsAcrossWorkspaces(tx, 10),
  );
}

async function stepRows(run: AgentRun) {
  const steps = await listSteps(run.workspaceId, run.id);
  return steps.map((s) => [s.step, s.status, s.output]);
}

describe("agent runs end to end", () => {
  it("runs a dispatched job: steps, output and event", async () => {
    const { agent, calls } = testAgent({
      listensTo: "deal.received",
      score: () => Promise.resolve(7),
      emits: screened,
    });
    const { deps } = depsFor(agent);
    const { run, dealId } = await dispatchedRun(deps);

    const jobs = await boss.fetch(AGENT_RUN_QUEUE, { includeMetadata: true });
    expect(jobs.map((job) => job.id)).toEqual([run.id]);
    await handleAgentRunJobs(jobs, deps);

    const finished = await reload(run);
    expect(finished).toMatchObject({
      status: "SUCCEEDED",
      output: { score: 10 },
      error: null,
      promptVersion: "test.v1",
      model: "test-model",
      tokensIn: 0,
      tokensOut: 0,
      costMicros: 0,
    });
    expect(finished.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(finished.finishedAt).toBeInstanceOf(Date);
    expect(await stepRows(run)).toEqual([
      ["read", "SUCCEEDED", { pages: 3 }],
      ["score", "SUCCEEDED", 7],
    ]);
    expect(calls).toEqual({ read: 1, score: 1 });
    expect(await unprocessedEvents()).toMatchObject([
      { type: "deal.screened", dealId, workspaceId: run.workspaceId },
    ]);
  });

  it("fails the run at once on any other error, with a FAILED step", async () => {
    const { agent, calls } = testAgent({
      listensTo: "deal.received",
      score: () => Promise.reject(new Error("Rubric has no anchors")),
      emits: screened,
    });
    const { deps, logs } = depsFor(agent);
    const { run, job } = await dispatchedRun(deps);

    await executeRun(job, firstAttempt, deps);

    expect(await reload(run)).toMatchObject({
      status: "FAILED",
      error: "Rubric has no anchors",
      output: null,
    });
    expect(await stepRows(run)).toEqual([
      ["read", "SUCCEEDED", { pages: 3 }],
      ["score", "FAILED", { error: "Rubric has no anchors" }],
    ]);
    expect(calls).toEqual({ read: 1, score: 1 });
    expect(await unprocessedEvents()).toEqual([]);
    expect(logs).toContain(
      `Run ${run.id} (screening) failed: Rubric has no anchors`,
    );
  });

  it("retries a provider error, resuming at the failed step (§11.2)", async () => {
    let attempts = 0;
    const { agent, calls } = testAgent({
      listensTo: "deal.received",
      score: () => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new ProviderError("429 from the model"))
          : Promise.resolve(7);
      },
      emits: screened,
    });
    const { deps } = depsFor(agent);
    const { run, job } = await dispatchedRun(deps);

    await expect(executeRun(job, firstAttempt, deps)).rejects.toThrow(
      "429 from the model",
    );
    expect(await reload(run)).toMatchObject({ status: "RUNNING", error: null });

    await executeRun(job, { retryCount: 1, retryLimit: 3 }, deps);

    expect(await reload(run)).toMatchObject({
      status: "SUCCEEDED",
      output: { score: 10 },
    });
    expect(await stepRows(run)).toEqual([
      ["read", "SUCCEEDED", { pages: 3 }],
      ["score", "FAILED", { error: "429 from the model" }],
      ["score", "SUCCEEDED", 7],
    ]);
    // The finished step did not run again.
    expect(calls).toEqual({ read: 1, score: 2 });
  });

  it("fails the run when the last retry hits a provider error", async () => {
    const { agent } = testAgent({
      listensTo: "deal.received",
      score: () => Promise.reject(new ProviderError("503 from the model")),
      emits: screened,
    });
    const { deps } = depsFor(agent);
    const { run, job } = await dispatchedRun(deps);

    await executeRun(job, { retryCount: 3, retryLimit: 3 }, deps);

    expect(await reload(run)).toMatchObject({
      status: "FAILED",
      error: "503 from the model",
    });
  });

  it("commits the output event and SUCCEEDED together, or neither", async () => {
    // An Intake-style run has no deal, and deal.received needs one, so the
    // event insert fails and takes SUCCEEDED with it.
    const { agent } = testAgent({
      listensTo: "email.received",
      score: () => Promise.resolve(7),
      emits: { type: "deal.received", payload: {} },
    });
    const { deps } = depsFor(agent);
    const { run, job } = await dispatchedRun(deps, "email.received");
    const stderr = vi.spyOn(console, "error").mockReturnValue(undefined);

    await executeRun(job, firstAttempt, deps);

    const failed = await reload(run);
    expect(failed.status).toBe("FAILED");
    expect(failed.output).toBeNull();
    // A database error is stored as a reference; the full error, with its
    // SQL, goes to stderr only.
    expect(failed.error).toMatch(/^Internal error \(ref [0-9a-f-]{36}\)$/);
    expect(stderr).toHaveBeenCalledWith(
      `${String(failed.error)}:`,
      expect.anything(),
    );
    expect(await unprocessedEvents()).toEqual([]);
  });

  it("records a failure before the run starts", async () => {
    const { agent } = testAgent({
      listensTo: "deal.received",
      score: () => Promise.resolve(7),
      emits: screened,
    });
    const { deps } = depsFor(agent);
    const { run, job } = await dispatchedRun(deps);

    // A worker that doesn't register the run's agent.
    await executeRun(job, firstAttempt, { ...deps, registry: [] });

    expect(await reload(run)).toMatchObject({
      status: "FAILED",
      startedAt: null,
      error: `Run ${run.id} is for agent "screening", which this worker doesn't register`,
    });
    expect(await stepRows(run)).toEqual([]);
  });

  it("does nothing for a job delivered again after its run finished", async () => {
    const { agent, calls } = testAgent({
      listensTo: "deal.received",
      score: () => Promise.resolve(7),
      emits: screened,
    });
    const { deps, logs } = depsFor(agent);
    const { run, job } = await dispatchedRun(deps);
    await executeRun(job, firstAttempt, deps);

    await executeRun(job, { retryCount: 1, retryLimit: 3 }, deps);

    expect(calls).toEqual({ read: 1, score: 1 });
    expect(logs).toContain(`Run ${run.id} is already SUCCEEDED; nothing to do`);
  });
});
