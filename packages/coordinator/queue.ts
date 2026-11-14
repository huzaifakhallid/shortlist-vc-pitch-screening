import type { PgBoss } from "pg-boss";
import { z } from "zod";

// One pg-boss job per agent run. The job id is the run id.
export const AGENT_RUN_QUEUE = "agent-run";

export const agentRunJobSchema = z.strictObject({
  workspaceId: z.uuid(),
  runId: z.uuid(),
});
export type AgentRunJob = z.infer<typeof agentRunJobSchema>;

// Provider errors retry with exponential backoff, at most 3 times (§11.2).
// createQueue leaves an existing queue's options as they are: when these
// change, apply them with boss.updateQueue.
export async function createAgentRunQueue(boss: PgBoss): Promise<void> {
  await boss.createQueue(AGENT_RUN_QUEUE, {
    retryLimit: 3,
    retryDelay: 5,
    retryBackoff: true,
  });
}
