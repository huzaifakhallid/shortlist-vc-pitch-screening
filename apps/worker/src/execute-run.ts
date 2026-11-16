import { createHash } from "node:crypto";
import {
  assertUnderSpendCap,
  describeIssues,
  ProviderError,
  sanitiseError,
  type AgentContext,
  type AgentRegistry,
  type AnyAgentDefinition,
  type DealSnapshot,
  type LlmClient,
  type LlmUsage,
} from "@shortlist/agents-shared";
import { agentRunJobSchema, type AgentRunJob } from "@shortlist/coordinator";
import {
  finishRun,
  getConfigVersion,
  getEvent,
  getRun,
  getSpendTodayMicros,
  getWorkspace,
  insertEvent,
  insertStep,
  listSteps,
  startRun,
  withTransaction,
  type RunStep,
} from "@shortlist/db";
import type { GeminiKeyTier } from "@shortlist/schemas";
import type { JobWithMetadata } from "pg-boss";
import { z } from "zod";
import { assertKeyTierAllows } from "./key-tier";

export type RunDeps = {
  registry: AgentRegistry;
  // A fresh client per attempt, bound to the attempt's abort signal.
  llmForRun: (signal: AbortSignal) => LlmClient;
  // The Gemini key's tier (env GEMINI_KEY_TIER): "free" runs synthetic
  // workspaces only (§14.4).
  keyTier: GeminiKeyTier;
  log: (message: string) => void;
};

// The job's attempt as pg-boss reports it: retryCount is 0 on the first.
// The signal is aborted when the job expires or the worker stops.
export type Attempt = {
  retryCount: number;
  retryLimit: number;
  signal: AbortSignal;
};

// Executes one agent run (§11.2). A ProviderError with retries left is
// rethrown so pg-boss retries the job; the run stays RUNNING and the retry
// resumes at its first unfinished step. So is any error once the attempt is
// aborted: pg-boss has already failed the job, and retries it or hands it to
// the dead-letter handler. Any other error, or the last attempt's, finishes
// the run FAILED (from QUEUED if it never started) with the sanitised error.
// If recording that fails too, the job fails. A free-tier key refuses a
// workspace that isn't synthetic before the run starts, and every model call
// is refused once the workspace reached its daily spend cap (§15.5).
export async function executeRun(
  job: AgentRunJob,
  attempt: Attempt,
  deps: RunDeps,
): Promise<void> {
  const { workspaceId, runId } = job;
  const run = await getRun(workspaceId, runId);
  if (run.status === "SUCCEEDED" || run.status === "FAILED") {
    // The job was delivered again after the run had finished.
    deps.log(`Run ${runId} is already ${run.status}; nothing to do`);
    return;
  }

  // Latency counts from the run's start; before that, from this attempt's.
  // Tokens and cost are the totals of the run's steps (finishRun).
  let startedAt = Date.now();
  const latencyMs = () => Date.now() - startedAt;

  try {
    assertKeyTierAllows(deps.keyTier, await getWorkspace(workspaceId));
    const agent = deps.registry.find((a) => a.key === run.agent);
    if (agent === undefined) {
      throw new Error(
        `Run ${runId} is for agent "${run.agent}", which this worker doesn't register`,
      );
    }
    const snapshot: DealSnapshot = {
      workspaceId,
      dealId: run.dealId,
      trigger: await getEvent(workspaceId, run.triggerEventId),
    };
    const { config } = await getConfigVersion(workspaceId, run.configVersionId);
    const started = await startRun(workspaceId, runId, {
      promptVersion: agent.promptVersion,
      model: agent.model,
      inputHash: hashSnapshot(snapshot),
    });
    if (started.startedAt === null) {
      throw new Error(`Run ${runId} is RUNNING without a start time`);
    }
    startedAt = started.startedAt.getTime();
    const steps = await stepRunner(
      workspaceId,
      runId,
      deps.llmForRun(attempt.signal),
      attempt.signal,
      config.dailySpendCapMicros,
    );
    const ctx: AgentContext = {
      workspaceId,
      config,
      runStep: steps.runStep,
      llm: steps.llm,
      signal: attempt.signal,
      log: (message) => {
        deps.log(`[${agent.key} ${runId}] ${message}`);
      },
    };

    const output = parseOutput(
      agent,
      await agent.run(agent.needs(snapshot), ctx),
    );
    attempt.signal.throwIfAborted();
    const events = agent.emits(output);
    await withTransaction(async (tx) => {
      await finishRun(tx, workspaceId, runId, {
        status: "SUCCEEDED",
        output,
        latencyMs: latencyMs(),
      });
      for (const event of events) {
        // The deal comes from the run (§11.1).
        await insertEvent(tx, workspaceId, { ...event, dealId: run.dealId });
      }
    });
  } catch (error) {
    if (attempt.signal.aborted) {
      throw error;
    }
    if (
      error instanceof ProviderError &&
      attempt.retryCount < attempt.retryLimit
    ) {
      throw error;
    }
    const message = sanitiseError(error);
    try {
      await withTransaction((tx) =>
        finishRun(tx, workspaceId, runId, {
          status: "FAILED",
          error: message,
          latencyMs: latencyMs(),
        }),
      );
    } catch (recordError) {
      throw new Error(
        `Run ${runId} failed (${message}) and the failure couldn't be recorded`,
        { cause: recordError },
      );
    }
    deps.log(`Run ${runId} (${run.agent}) failed: ${message}`);
  }
}

// What the run read. A resumed run must read the same (startRun checks).
function hashSnapshot(snapshot: DealSnapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

function parseOutput(agent: AnyAgentDefinition, output: unknown): unknown {
  const parsed = agent.outputSchema.safeParse(output);
  if (!parsed.success) {
    throw new Error(
      `${agent.key} output is invalid:\n${describeIssues(agent.outputSchema, parsed.error)}`,
    );
  }
  return parsed.data;
}

// ctx.runStep and ctx.llm for one attempt. Steps finished by an earlier
// attempt return their saved output; the others run and are saved,
// SUCCEEDED or FAILED, with the model usage they spent. Steps run one at a
// time and the model is called only inside one, so a step's usage is the
// attempt client's usage across it. Before each model call, the workspace's
// spend today (saved steps plus the running step's unsaved usage) must be
// under `dailySpendCapMicros`, the cap in the run's config (§15.5).
async function stepRunner(
  workspaceId: string,
  runId: string,
  client: LlmClient,
  signal: AbortSignal,
  dailySpendCapMicros: number,
): Promise<Pick<AgentContext, "runStep" | "llm">> {
  // In insertion order, so the latest row for a step wins.
  const saved = new Map<string, RunStep>();
  for (const step of await listSteps(workspaceId, runId)) {
    saved.set(step.step, step);
  }
  const seen = new Set<string>();
  let running: string | null = null;
  // The client's usage when the running step started.
  let stepStart: LlmUsage = client.usage();

  const runStep = async <T>(
    name: string,
    schema: z.ZodType<T>,
    fn: () => Promise<T>,
  ): Promise<T> => {
    if (running !== null) {
      throw new Error(
        `Step "${name}" started while step "${running}" is running in run ${runId}; steps run one at a time`,
      );
    }
    if (seen.has(name)) {
      throw new Error(`Step "${name}" ran twice in run ${runId}`);
    }
    seen.add(name);

    const previous = saved.get(name);
    if (previous?.status === "SUCCEEDED") {
      const parsed = schema.safeParse(previous.output);
      if (!parsed.success) {
        throw new Error(
          `Saved output of step "${name}" in run ${runId} is invalid:\n${describeIssues(schema, parsed.error)}`,
        );
      }
      return parsed.data;
    }

    signal.throwIfAborted();
    const before = client.usage();
    const spent = () => usageSince(before, client.usage());
    stepStart = before;
    running = name;
    let output: T;
    try {
      output = await fn();
    } catch (error) {
      running = null;
      const message = sanitiseError(error);
      try {
        await insertStep(workspaceId, runId, {
          step: name,
          status: "FAILED",
          output: { error: message },
          usage: spent(),
        });
      } catch (recordError) {
        throw new Error(
          `Step "${name}" of run ${runId} failed (${message}) and the failure couldn't be recorded`,
          { cause: recordError },
        );
      }
      throw error;
    }
    running = null;
    await insertStep(workspaceId, runId, {
      step: name,
      status: "SUCCEEDED",
      output,
      usage: spent(),
    });
    return output;
  };

  const llm: LlmClient = {
    structured: async (request) => {
      if (running === null) {
        throw new Error(
          `Model call for ${request.promptVersion} outside a step in run ${runId}; call ctx.llm inside ctx.runStep`,
        );
      }
      const unsaved = usageSince(stepStart, client.usage()).costMicros;
      assertUnderSpendCap(
        workspaceId,
        (await getSpendTodayMicros(workspaceId)) + unsaved,
        dailySpendCapMicros,
      );
      return client.structured(request);
    },
    usage: () => client.usage(),
  };

  return { runStep, llm };
}

function usageSince(before: LlmUsage, after: LlmUsage): LlmUsage {
  return {
    tokensIn: after.tokensIn - before.tokensIn,
    tokensOut: after.tokensOut - before.tokensOut,
    costMicros: after.costMicros - before.costMicros,
  };
}

function parseJob(job: JobWithMetadata<unknown>): AgentRunJob {
  const data = agentRunJobSchema.safeParse(job.data);
  if (!data.success) {
    throw new Error(
      `Job ${job.id} has invalid data: ${z.prettifyError(data.error)}`,
    );
  }
  return data.data;
}

// The pg-boss handler for AGENT_RUN_QUEUE (batch size 1). Throwing fails the
// job, which pg-boss retries up to the queue's retryLimit, then moves to
// AGENT_RUN_DEAD_LETTER_QUEUE.
export async function handleAgentRunJobs(
  jobs: readonly JobWithMetadata<unknown>[],
  deps: RunDeps,
): Promise<void> {
  for (const job of jobs) {
    await executeRun(parseJob(job), job, deps);
  }
}

// The pg-boss handler for AGENT_RUN_DEAD_LETTER_QUEUE: the run's job failed
// its last attempt, so no attempt will finish the run. A run still QUEUED or
// RUNNING is finished FAILED, so none is left stuck.
export async function handleDeadLetterJobs(
  jobs: readonly JobWithMetadata<unknown>[],
  deps: Pick<RunDeps, "log">,
): Promise<void> {
  for (const job of jobs) {
    const { workspaceId, runId } = parseJob(job);
    const run = await getRun(workspaceId, runId);
    if (run.status === "SUCCEEDED" || run.status === "FAILED") {
      deps.log(`Run ${runId} is already ${run.status}; nothing to do`);
      continue;
    }
    const error = `Run ${runId} stopped: its job failed its last attempt (it timed out, or the worker stopped or couldn't record the run)`;
    await withTransaction((tx) =>
      finishRun(tx, workspaceId, runId, {
        status: "FAILED",
        error,
        // A run that never started has no latency to record.
        latencyMs:
          run.startedAt === null ? null : Date.now() - run.startedAt.getTime(),
      }),
    );
    deps.log(`Run ${runId} (${run.agent}) failed: ${error}`);
  }
}
