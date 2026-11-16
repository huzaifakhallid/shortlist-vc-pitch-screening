import type { PgBoss } from "pg-boss";
import { z } from "zod";

// One pg-boss job per agent run. The job id is the run id. Each job expires
// after its agent's timeoutSeconds (set when it is sent).
export const AGENT_RUN_QUEUE = "agent-run";
// A job that fails its last attempt (it expired, or its handler threw) is
// copied here; the worker's handler finishes its run FAILED. It has no dead
// letter of its own: a dead-letter job that fails every retry stays failed.
export const AGENT_RUN_DEAD_LETTER_QUEUE = "agent-run-dead-letter";

export const agentRunJobSchema = z.strictObject({
  workspaceId: z.uuid(),
  runId: z.uuid(),
});
export type AgentRunJob = z.infer<typeof agentRunJobSchema>;

// Provider errors retry with exponential backoff, at most 3 times (§11.2).
const retries = { retryLimit: 3, retryDelay: 5, retryBackoff: true };

// createQueue leaves an existing queue's options as they are, so they are
// applied with updateQueue too, and a changed option reaches existing queues.
export async function createAgentRunQueue(boss: PgBoss): Promise<void> {
  await boss.createQueue(AGENT_RUN_DEAD_LETTER_QUEUE, retries);
  await boss.updateQueue(AGENT_RUN_DEAD_LETTER_QUEUE, retries);
  const options = { ...retries, deadLetter: AGENT_RUN_DEAD_LETTER_QUEUE };
  await boss.createQueue(AGENT_RUN_QUEUE, options);
  await boss.updateQueue(AGENT_RUN_QUEUE, options);
}
