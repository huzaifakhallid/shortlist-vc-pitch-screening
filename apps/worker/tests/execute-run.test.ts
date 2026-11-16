import {
  ProviderError,
  SCORING_MODEL,
  systemPrompt,
  type AgentContext,
  type AgentDefinition,
  type LlmClient,
  type StructuredRequest,
} from "@shortlist/agents-shared";
import {
  AGENT_RUN_DEAD_LETTER_QUEUE,
  AGENT_RUN_QUEUE,
  dispatchEvents,
  type AgentRunJob,
} from "@shortlist/coordinator";
import {
  insertEvent,
  listSteps,
  saveConfigVersion,
  withTransaction,
  type AgentRun,
} from "@shortlist/db";
import { claimUnprocessedEventsAcrossWorkspaces } from "@shortlist/db/coordinator";
import type {
  EventType,
  GeminiKeyTier,
  ShortlistEvent,
} from "@shortlist/schemas";
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
  configFor,
  createTestDeal,
  createTestWorkspace,
  listTestRuns,
  recordTestSpend,
} from "../../../packages/db/tests/helpers";
import {
  executeRun,
  handleAgentRunJobs,
  handleDeadLetterJobs,
  type RunDeps,
} from "../src/execute-run";

let boss: PgBoss;
beforeAll(async () => {
  boss = await startTestBoss();
});
beforeEach(async () => {
  await boss.deleteAllJobs(AGENT_RUN_QUEUE);
  await boss.deleteAllJobs(AGENT_RUN_DEAD_LETTER_QUEUE);
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
  score: (ctx: AgentContext) => Promise<number>;
  emits: ShortlistEvent;
}) {
  const calls = { read: 0, score: 0 };
  const agent: TestAgent = {
    key: "screening",
    listensTo: [options.listensTo],
    promptVersion: "test.v1",
    model: "test-model",
    timeoutSeconds: 60,
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
        return options.score(ctx);
      });
      return { score: score + read.pages };
    },
    outputSchema: z.strictObject({ score: z.number() }),
    emits: () => [options.emits],
  };
  return { agent, calls };
}

// A model client per attempt whose every call spends 100 tokens in, 10 out
// and 50 micros, then returns 4. `signals` collects each attempt's signal;
// `calls` counts the calls that reached the client.
function stubLlm() {
  const signals: AbortSignal[] = [];
  const calls = { count: 0 };
  const llmForRun = (signal: AbortSignal): LlmClient => {
    signals.push(signal);
    const usage = { tokensIn: 0, tokensOut: 0, costMicros: 0 };
    return {
      structured: <T>(request: StructuredRequest<T>) => {
        calls.count += 1;
        usage.tokensIn += 100;
        usage.tokensOut += 10;
        usage.costMicros += 50;
        return Promise.resolve(request.schema.parse(4));
      },
      usage: () => ({ ...usage }),
    };
  };
  return { llmForRun, signals, calls };
}

function depsFor(agent: TestAgent, keyTier: GeminiKeyTier = "paid") {
  const logs: string[] = [];
  const llm = stubLlm();
  const deps: RunDeps = {
    registry: [agent],
    llmForRun: llm.llmForRun,
    keyTier,
    log: (message) => logs.push(message),
  };
  return { deps, logs, signals: llm.signals, modelCalls: llm.calls };
}

// One model call through ctx.llm.
function callModel(ctx: AgentContext): Promise<number> {
  return ctx.llm.structured({
    model: SCORING_MODEL,
    promptVersion: "score.v1",
    system: systemPrompt(new URL("./prompts/", import.meta.url), "score.v1.md"),
    input: [],
    schema: z.number(),
  });
}

function attempt(retryCount: number, signal = new AbortController().signal) {
  return { retryCount, retryLimit: 3, signal };
}

const screened: ShortlistEvent = { type: "deal.screened", payload: {} };
const firstAttempt = attempt(0);

// Inserts `trigger` in a new workspace and dispatches it to `deps`' agent.
// The workspace isn't synthetic unless asked, and its config's daily spend
// cap is 5,000,000 micros unless given.
async function dispatchedRun(
  deps: RunDeps,
  trigger: "deal.received" | "email.received" = "deal.received",
  workspace: { synthetic?: boolean; dailySpendCapMicros?: number } = {},
) {
  const t = await createTestWorkspace("kestrel", {
    synthetic: workspace.synthetic ?? false,
  });
  const config = configFor(t.partner.id);
  if (workspace.dailySpendCapMicros !== undefined) {
    config.dailySpendCapMicros = workspace.dailySpendCapMicros;
  }
  await saveConfigVersion(t.workspace.id, config, t.partner.id);
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
    // fetch() leaves out the signal that work() gives each job.
    const signal = new AbortController().signal;
    await handleAgentRunJobs(
      jobs.map((job) => ({ ...job, signal })),
      deps,
    );

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

    await executeRun(job, attempt(1), deps);

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

    await executeRun(job, attempt(3), deps);

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

    await executeRun(job, attempt(1), deps);

    expect(calls).toEqual({ read: 1, score: 1 });
    expect(logs).toContain(`Run ${run.id} is already SUCCEEDED; nothing to do`);
  });
});

describe("model usage", () => {
  it("records each step attempt's usage and totals it on the run", async () => {
    let attempts = 0;
    const { agent } = testAgent({
      listensTo: "deal.received",
      score: async (ctx) => {
        attempts += 1;
        const score = await callModel(ctx);
        if (attempts === 1) {
          // Spent on the call above, then the second call hit a 429.
          throw new ProviderError("429 from the model");
        }
        return score + (await callModel(ctx));
      },
      emits: screened,
    });
    const { deps } = depsFor(agent);
    const { run, job } = await dispatchedRun(deps);

    await expect(executeRun(job, firstAttempt, deps)).rejects.toThrow(
      ProviderError,
    );
    await executeRun(job, attempt(1), deps);

    const steps = await listSteps(run.workspaceId, run.id);
    expect(
      steps.map((s) => [s.step, s.status, s.tokensIn, s.costMicros]),
    ).toEqual([
      ["read", "SUCCEEDED", 0, 0],
      ["score", "FAILED", 100, 50],
      ["score", "SUCCEEDED", 200, 100],
    ]);
    expect(await reload(run)).toMatchObject({
      status: "SUCCEEDED",
      output: { score: 11 },
      tokensIn: 300,
      tokensOut: 30,
      costMicros: 150,
    });
  });

  it("fails the run on a model call outside a step", async () => {
    const { agent } = testAgent({
      listensTo: "deal.received",
      score: () => Promise.resolve(7),
      emits: screened,
    });
    const outside: TestAgent = {
      ...agent,
      run: async (_input, ctx) => ({ score: await callModel(ctx) }),
    };
    const { deps } = depsFor(outside);
    const { run, job } = await dispatchedRun(deps);

    await executeRun(job, firstAttempt, deps);

    expect(await reload(run)).toMatchObject({
      status: "FAILED",
      error: `Model call for score.v1 outside a step in run ${run.id}; call ctx.llm inside ctx.runStep`,
    });
  });
});

describe("expired attempts", () => {
  it("passes the attempt's signal to the model client and the agent", async () => {
    const seen: AbortSignal[] = [];
    const { agent } = testAgent({
      listensTo: "deal.received",
      score: (ctx) => {
        seen.push(ctx.signal);
        return Promise.resolve(7);
      },
      emits: screened,
    });
    const { deps, signals } = depsFor(agent);
    const { job } = await dispatchedRun(deps);
    const controller = new AbortController();

    await executeRun(job, attempt(0, controller.signal), deps);

    expect(signals).toEqual([controller.signal]);
    expect(seen).toEqual([controller.signal]);
  });

  it("leaves the run to pg-boss once the attempt is aborted", async () => {
    const controller = new AbortController();
    const { agent, calls } = testAgent({
      listensTo: "deal.received",
      score: () => {
        controller.abort(new Error("handler execution exceeded 60s"));
        return Promise.reject(new Error("Model call stopped"));
      },
      emits: screened,
    });
    const { deps } = depsFor(agent);
    const { run, job } = await dispatchedRun(deps);

    // Not a provider error, but the attempt was aborted: rethrown, and the
    // run isn't failed, so pg-boss's retry (or the dead-letter handler) can
    // finish it.
    await expect(
      executeRun(job, attempt(3, controller.signal), deps),
    ).rejects.toThrow("Model call stopped");
    expect(await reload(run)).toMatchObject({ status: "RUNNING", error: null });
    expect(await stepRows(run)).toEqual([
      ["read", "SUCCEEDED", { pages: 3 }],
      ["score", "FAILED", { error: "Model call stopped" }],
    ]);
    expect(calls).toEqual({ read: 1, score: 1 });
  });

  it("dead-letters an expired last attempt and fails its run", async () => {
    const { agent } = testAgent({
      listensTo: "deal.received",
      // Hangs until the attempt is aborted, as an agent stuck in a model
      // call would.
      score: (ctx) =>
        new Promise((_resolve, reject) => {
          ctx.signal.addEventListener("abort", () => {
            reject(new Error("Model call stopped"));
          });
        }),
      emits: screened,
    });
    const { deps, logs } = depsFor(agent);
    const { run, job } = await dispatchedRun(deps);
    // The run's job, on its last attempt, expiring after 1 second.
    await boss.deleteAllJobs(AGENT_RUN_QUEUE);
    await boss.send(AGENT_RUN_QUEUE, job, {
      id: run.id,
      retryLimit: 0,
      expireInSeconds: 1,
    });

    const options = {
      includeMetadata: true,
      pollingIntervalSeconds: 0.5,
    } as const;
    const runWorker = await boss.work(AGENT_RUN_QUEUE, options, (jobs) =>
      handleAgentRunJobs(jobs, deps),
    );
    const deadLetterWorker = await boss.work(
      AGENT_RUN_DEAD_LETTER_QUEUE,
      options,
      (jobs) => handleDeadLetterJobs(jobs, deps),
    );
    try {
      await vi.waitFor(
        async () => {
          expect((await reload(run)).status).toBe("FAILED");
        },
        { timeout: 10_000, interval: 200 },
      );
    } finally {
      await boss.offWork(AGENT_RUN_QUEUE, { id: runWorker });
      await boss.offWork(AGENT_RUN_DEAD_LETTER_QUEUE, { id: deadLetterWorker });
    }

    const error = `Run ${run.id} stopped: its job failed its last attempt (it timed out, or the worker stopped or couldn't record the run)`;
    const failed = await reload(run);
    expect(failed).toMatchObject({ status: "FAILED", error });
    expect(failed.latencyMs).toBeGreaterThanOrEqual(1000);
    expect(await stepRows(run)).toEqual([
      ["read", "SUCCEEDED", { pages: 3 }],
      ["score", "FAILED", { error: "Model call stopped" }],
    ]);
    expect(logs).toContain(`Run ${run.id} (screening) failed: ${error}`);
  });

  it("fails a dead-lettered run that never started", async () => {
    const { agent } = testAgent({
      listensTo: "deal.received",
      score: () => Promise.resolve(7),
      emits: screened,
    });
    const { deps } = depsFor(agent);
    const { run, job } = await dispatchedRun(deps);
    await boss.send(AGENT_RUN_DEAD_LETTER_QUEUE, job);
    const jobs = await boss.fetch(AGENT_RUN_DEAD_LETTER_QUEUE, {
      includeMetadata: true,
    });

    await handleDeadLetterJobs(jobs, deps);

    expect(await reload(run)).toMatchObject({
      status: "FAILED",
      startedAt: null,
      latencyMs: null,
    });
  });
});

describe("Gemini key tier (§14.4)", () => {
  it("refuses a run in a workspace that isn't synthetic on a free key", async () => {
    const { agent, calls } = testAgent({
      listensTo: "deal.received",
      score: (ctx) => callModel(ctx),
      emits: screened,
    });
    const { deps, logs, modelCalls } = depsFor(agent, "free");
    const { run, job } = await dispatchedRun(deps);

    await executeRun(job, firstAttempt, deps);

    const error = `Run refused: this worker's Gemini key is free tier (GEMINI_KEY_TIER=free), which runs synthetic workspaces only, and workspace ${run.workspaceId} isn't synthetic`;
    expect(await reload(run)).toMatchObject({
      status: "FAILED",
      startedAt: null,
      error,
    });
    expect(await stepRows(run)).toEqual([]);
    expect(calls).toEqual({ read: 0, score: 0 });
    expect(modelCalls.count).toBe(0);
    expect(logs).toContain(`Run ${run.id} (screening) failed: ${error}`);
  });

  it("runs a synthetic workspace on a free key", async () => {
    const { agent } = testAgent({
      listensTo: "deal.received",
      score: (ctx) => callModel(ctx),
      emits: screened,
    });
    const { deps, modelCalls } = depsFor(agent, "free");
    const { run, job } = await dispatchedRun(deps, "deal.received", {
      synthetic: true,
    });

    await executeRun(job, firstAttempt, deps);

    expect(await reload(run)).toMatchObject({
      status: "SUCCEEDED",
      output: { score: 7 },
    });
    expect(modelCalls.count).toBe(1);
  });

  it("runs a workspace that isn't synthetic on a paid key", async () => {
    const { agent } = testAgent({
      listensTo: "deal.received",
      score: (ctx) => callModel(ctx),
      emits: screened,
    });
    const { deps } = depsFor(agent, "paid");
    const { run, job } = await dispatchedRun(deps);

    await executeRun(job, firstAttempt, deps);

    expect((await reload(run)).status).toBe("SUCCEEDED");
  });
});

describe("daily spend cap (§15.5)", () => {
  it("fails the run, without calling the model, once today's spend reached the cap", async () => {
    const { agent, calls } = testAgent({
      listensTo: "deal.received",
      score: (ctx) => callModel(ctx),
      emits: screened,
    });
    const { deps, logs, modelCalls } = depsFor(agent);
    const { run, job } = await dispatchedRun(deps, "deal.received", {
      dailySpendCapMicros: 1_000,
    });
    // Spent by other runs today, after this one was queued.
    await recordTestSpend(run.workspaceId, run.configVersionId, 1_000);

    await executeRun(job, firstAttempt, deps);

    const error = `Workspace ${run.workspaceId} reached its daily AI spend cap: 1000 of 1000 micro-dollars spent today (UTC)`;
    expect(await reload(run)).toMatchObject({
      status: "FAILED",
      error,
      output: null,
      costMicros: 0,
    });
    expect(await stepRows(run)).toEqual([
      ["read", "SUCCEEDED", { pages: 3 }],
      ["score", "FAILED", { error }],
    ]);
    expect(calls).toEqual({ read: 1, score: 1 });
    expect(modelCalls.count).toBe(0);
    expect(logs).toContain(`Run ${run.id} (screening) failed: ${error}`);
  });

  it("counts the running step's unsaved spend before each model call", async () => {
    // Each call costs 50: with a cap of 100 the first two calls go through
    // and the third is refused, though nothing is saved yet.
    const { agent } = testAgent({
      listensTo: "deal.received",
      score: async (ctx) =>
        (await callModel(ctx)) +
        (await callModel(ctx)) +
        (await callModel(ctx)),
      emits: screened,
    });
    const { deps, modelCalls } = depsFor(agent);
    const { run, job } = await dispatchedRun(deps, "deal.received", {
      dailySpendCapMicros: 100,
    });

    await executeRun(job, firstAttempt, deps);

    expect(modelCalls.count).toBe(2);
    const failed = await reload(run);
    expect(failed).toMatchObject({ status: "FAILED", costMicros: 100 });
    expect(failed.error).toBe(
      `Workspace ${run.workspaceId} reached its daily AI spend cap: 100 of 100 micro-dollars spent today (UTC)`,
    );
  });

  it("runs while today's spend is under the cap", async () => {
    const { agent } = testAgent({
      listensTo: "deal.received",
      score: (ctx) => callModel(ctx),
      emits: screened,
    });
    const { deps, modelCalls } = depsFor(agent);
    const { run, job } = await dispatchedRun(deps, "deal.received", {
      dailySpendCapMicros: 1_000,
    });
    await recordTestSpend(run.workspaceId, run.configVersionId, 949);

    await executeRun(job, firstAttempt, deps);

    expect(await reload(run)).toMatchObject({
      status: "SUCCEEDED",
      costMicros: 50,
    });
    expect(modelCalls.count).toBe(1);
  });
});
