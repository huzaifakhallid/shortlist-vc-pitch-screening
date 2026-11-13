import type { AgentKey, RunStatus } from "@shortlist/schemas";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, single, type Tx } from "../client";
import { agentRun, event } from "../schema";

export type AgentRun = typeof agentRun.$inferSelect;

// Idempotent per (agent, trigger event) (§11.2): a duplicate returns the
// existing run with created: false. The deal comes from the trigger event.
// Takes the coordinator's transaction, which also claims the event and
// enqueues the run's job.
export async function createRun(
  tx: Tx,
  workspaceId: string,
  input: { agent: AgentKey; triggerEventId: string; configVersionId: string },
): Promise<{ run: AgentRun; created: boolean }> {
  const [trigger] = await tx
    .select({ dealId: event.dealId })
    .from(event)
    .where(
      and(
        eq(event.id, input.triggerEventId),
        eq(event.workspaceId, workspaceId),
      ),
    );
  if (trigger === undefined) {
    throw new Error(
      `Trigger event ${input.triggerEventId} not found in workspace ${workspaceId}`,
    );
  }

  const inserted = await tx
    .insert(agentRun)
    .values({
      workspaceId,
      dealId: trigger.dealId,
      agent: input.agent,
      triggerEventId: input.triggerEventId,
      configVersionId: input.configVersionId,
      status: "QUEUED",
    })
    .onConflictDoNothing({
      target: [agentRun.agent, agentRun.triggerEventId],
    })
    .returning();
  const [run] = inserted;
  if (run !== undefined) {
    return { run, created: true };
  }

  const existing = await tx
    .select()
    .from(agentRun)
    .where(
      and(
        eq(agentRun.workspaceId, workspaceId),
        eq(agentRun.agent, input.agent),
        eq(agentRun.triggerEventId, input.triggerEventId),
      ),
    );
  return {
    run: single(existing, `${input.agent} run for ${input.triggerEventId}`),
    created: false,
  };
}

export async function getRun(
  workspaceId: string,
  runId: string,
): Promise<AgentRun> {
  const [run] = await db()
    .select()
    .from(agentRun)
    .where(and(eq(agentRun.id, runId), eq(agentRun.workspaceId, workspaceId)));
  if (run === undefined) {
    throw new Error(`Run ${runId} not found in workspace ${workspaceId}`);
  }
  return run;
}

// Explains why a guarded update matched no row. Not exported from the package.
export async function runUpdateRefused(
  workspaceId: string,
  runId: string,
  action: string,
): Promise<Error> {
  const [run] = await db()
    .select({ status: agentRun.status })
    .from(agentRun)
    .where(and(eq(agentRun.id, runId), eq(agentRun.workspaceId, workspaceId)));
  if (run === undefined) {
    return new Error(`Run ${runId} not found in workspace ${workspaceId}`);
  }
  return new Error(`Cannot ${action} run ${runId}: it is ${run.status}`);
}

type StartInput = {
  promptVersion: string | null;
  model: string | null;
  inputHash: string;
};

// QUEUED -> RUNNING, recording what the run uses. A RUNNING run is a retried
// job resuming from its first unfinished step (§11.2): it must bring the same
// prompt, model and input, and is returned unchanged.
export async function startRun(
  workspaceId: string,
  runId: string,
  input: StartInput,
): Promise<AgentRun> {
  const [current] = await db()
    .select()
    .from(agentRun)
    .where(and(eq(agentRun.id, runId), eq(agentRun.workspaceId, workspaceId)));
  if (current === undefined) {
    throw new Error(`Run ${runId} not found in workspace ${workspaceId}`);
  }

  if (current.status === "RUNNING") {
    for (const key of ["promptVersion", "model", "inputHash"] as const) {
      if (current[key] !== input[key]) {
        throw new Error(
          `Cannot resume run ${runId} with a different ${key}: started with ${JSON.stringify(current[key])}, got ${JSON.stringify(input[key])}`,
        );
      }
    }
    return current;
  }

  const rows = await db()
    .update(agentRun)
    .set({ ...input, status: "RUNNING", startedAt: sql`now()` })
    .where(
      and(
        eq(agentRun.id, runId),
        eq(agentRun.workspaceId, workspaceId),
        eq(agentRun.status, "QUEUED"),
      ),
    )
    .returning();
  const [run] = rows;
  if (run === undefined) {
    throw await runUpdateRefused(workspaceId, runId, "start");
  }
  return run;
}

type RunUsage = {
  tokensIn: number;
  tokensOut: number;
  costMicros: number;
  latencyMs: number;
};

export type RunResult =
  | ({ status: "SUCCEEDED"; output: unknown } & RunUsage)
  | ({ status: "FAILED"; error: string } & RunUsage);

// RUNNING -> SUCCEEDED | FAILED, once. QUEUED -> FAILED too, so a run that
// fails before it starts still records why. Takes the caller's transaction:
// a run's output events are written in the same commit (§8.1).
export async function finishRun(
  tx: Tx,
  workspaceId: string,
  runId: string,
  result: RunResult,
): Promise<AgentRun> {
  const outcome =
    result.status === "SUCCEEDED"
      ? { output: result.output, error: null }
      : { output: null, error: result.error };
  const from: RunStatus[] =
    result.status === "SUCCEEDED" ? ["RUNNING"] : ["QUEUED", "RUNNING"];
  const rows = await tx
    .update(agentRun)
    .set({
      ...outcome,
      status: result.status,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costMicros: result.costMicros,
      latencyMs: result.latencyMs,
      finishedAt: sql`now()`,
    })
    .where(
      and(
        eq(agentRun.id, runId),
        eq(agentRun.workspaceId, workspaceId),
        inArray(agentRun.status, from),
      ),
    )
    .returning();
  const [run] = rows;
  if (run === undefined) {
    throw await runUpdateRefused(workspaceId, runId, "finish");
  }
  return run;
}

export type FinishedStatus = Extract<RunStatus, "SUCCEEDED" | "FAILED">;
