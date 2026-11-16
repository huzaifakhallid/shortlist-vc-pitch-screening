import { and, asc, eq } from "drizzle-orm";
import { db, single, withTransaction } from "../client";
import { agentRun, runStep } from "../schema";
import { runUpdateRefused, type FinishedStatus } from "./run";

export type RunStep = typeof runStep.$inferSelect;

// The model usage of one step attempt.
export type StepUsage = {
  tokensIn: number;
  tokensOut: number;
  costMicros: number;
};

// Each step is saved when it ends, before the next starts (§11.2), with the
// usage it spent, FAILED or not. Only a RUNNING run takes steps; the share
// lock holds off finishRun meanwhile.
export async function insertStep(
  workspaceId: string,
  runId: string,
  input: {
    step: string;
    status: FinishedStatus;
    output: unknown;
    usage: StepUsage;
  },
): Promise<RunStep> {
  return withTransaction(async (tx) => {
    const [run] = await tx
      .select({ status: agentRun.status })
      .from(agentRun)
      .where(and(eq(agentRun.id, runId), eq(agentRun.workspaceId, workspaceId)))
      .for("share");
    if (run?.status !== "RUNNING") {
      throw await runUpdateRefused(workspaceId, runId, "add a step to");
    }
    const { usage, ...step } = input;
    const rows = await tx
      .insert(runStep)
      .values({ workspaceId, runId, ...step, ...usage })
      .returning();
    return single(rows, `step "${input.step}" of run ${runId}`);
  });
}

// In insertion order. Empty for a run in another workspace.
export async function listSteps(
  workspaceId: string,
  runId: string,
): Promise<RunStep[]> {
  return db()
    .select()
    .from(runStep)
    .where(and(eq(runStep.runId, runId), eq(runStep.workspaceId, workspaceId)))
    .orderBy(asc(runStep.seq));
}
