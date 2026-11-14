import { createHash } from "node:crypto";
import {
  ProviderError,
  sanitiseError,
  type AgentContext,
  type AgentRegistry,
  type AnyAgentDefinition,
  type DealSnapshot,
  type LlmClient,
} from "@shortlist/agents-shared";
import { agentRunJobSchema, type AgentRunJob } from "@shortlist/coordinator";
import {
  finishRun,
  getConfigVersion,
  getEvent,
  getRun,
  insertEvent,
  insertStep,
  listSteps,
  startRun,
  withTransaction,
  type RunStep,
} from "@shortlist/db";
import type { JobWithMetadata } from "pg-boss";
import { z } from "zod";

export type RunDeps = {
  registry: AgentRegistry;
  // A fresh client per attempt; its usage() goes on the run record.
  llmForRun: () => LlmClient;
  log: (message: string) => void;
};

// The job's attempt as pg-boss reports it: retryCount is 0 on the first.
export type Attempt = { retryCount: number; retryLimit: number };

// Executes one agent run (§11.2). A ProviderError with retries left is
// rethrown so pg-boss retries the job; the run stays RUNNING and the retry
// resumes at its first unfinished step. Any other error, or the last
// attempt's, finishes the run FAILED (from QUEUED if it never started) with
// the sanitised error. If recording that fails too, the job fails.
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
  let startedAt = Date.now();
  let llm: LlmClient | null = null;
  const usage = () => ({
    ...(llm === null
      ? { tokensIn: 0, tokensOut: 0, costMicros: 0 }
      : llm.usage()),
    latencyMs: Date.now() - startedAt,
  });

  try {
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
    llm = deps.llmForRun();
    const ctx: AgentContext = {
      workspaceId,
      config,
      runStep: await stepRunner(workspaceId, runId),
      llm,
      log: (message) => {
        deps.log(`[${agent.key} ${runId}] ${message}`);
      },
    };

    const output = parseOutput(
      agent,
      await agent.run(agent.needs(snapshot), ctx),
    );
    const events = agent.emits(output);
    await withTransaction(async (tx) => {
      await finishRun(tx, workspaceId, runId, {
        status: "SUCCEEDED",
        output,
        ...usage(),
      });
      for (const event of events) {
        // The deal comes from the run (§11.1).
        await insertEvent(tx, workspaceId, { ...event, dealId: run.dealId });
      }
    });
  } catch (error) {
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
          ...usage(),
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
      `${agent.key} output is invalid: ${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}

// ctx.runStep for one attempt. Steps finished by an earlier attempt return
// their saved output; the others run and are saved, SUCCEEDED or FAILED.
async function stepRunner(
  workspaceId: string,
  runId: string,
): Promise<AgentContext["runStep"]> {
  // In insertion order, so the latest row for a step wins.
  const saved = new Map<string, RunStep>();
  for (const step of await listSteps(workspaceId, runId)) {
    saved.set(step.step, step);
  }
  const seen = new Set<string>();

  return async <T>(
    name: string,
    schema: z.ZodType<T>,
    fn: () => Promise<T>,
  ): Promise<T> => {
    if (seen.has(name)) {
      throw new Error(`Step "${name}" ran twice in run ${runId}`);
    }
    seen.add(name);

    const previous = saved.get(name);
    if (previous?.status === "SUCCEEDED") {
      const parsed = schema.safeParse(previous.output);
      if (!parsed.success) {
        throw new Error(
          `Saved output of step "${name}" in run ${runId} is invalid: ${z.prettifyError(parsed.error)}`,
        );
      }
      return parsed.data;
    }

    let output: T;
    try {
      output = await fn();
    } catch (error) {
      await insertStep(workspaceId, runId, {
        step: name,
        status: "FAILED",
        output: { error: sanitiseError(error) },
      });
      throw error;
    }
    await insertStep(workspaceId, runId, {
      step: name,
      status: "SUCCEEDED",
      output,
    });
    return output;
  };
}

// The pg-boss handler for AGENT_RUN_QUEUE (batch size 1). Throwing fails the
// job, which pg-boss retries up to the queue's retryLimit.
export async function handleAgentRunJobs(
  jobs: readonly JobWithMetadata<unknown>[],
  deps: RunDeps,
): Promise<void> {
  for (const job of jobs) {
    const data = agentRunJobSchema.safeParse(job.data);
    if (!data.success) {
      throw new Error(
        `Job ${job.id} has invalid data: ${z.prettifyError(data.error)}`,
      );
    }
    await executeRun(data.data, job, deps);
  }
}
