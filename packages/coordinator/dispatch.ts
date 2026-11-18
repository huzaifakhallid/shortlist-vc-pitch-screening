import {
  assertUnderSpendCap,
  sanitiseError,
  SpendCapReachedError,
  type AgentRegistry,
} from "@shortlist/agents-shared";
import {
  createRun,
  withTransaction,
  type ActiveConfig,
  type StoredEvent,
  type Tx,
} from "@shortlist/db";
import {
  claimUnprocessedEventsAcrossWorkspaces,
  deferDispatchToNextUtcDay,
  jobQueueDb,
  markEventProcessed,
  recordDispatchFailure,
  selectActiveConfig,
  selectSpendTodayMicros,
} from "@shortlist/db/coordinator";
import type { PgBoss } from "pg-boss";
import { AGENT_RUN_QUEUE, type AgentRunJob } from "./queue";
import { agentsFor } from "./routing";

const BATCH_SIZE = 100;

// One coordinator tick (§8.1). A single transaction claims a batch of
// events. Each event is dispatched in its own savepoint: its runs, their
// jobs and its processed mark commit together. An event that fails rolls
// back alone and has the failure recorded on its row, so it can't block the
// rest of the batch; after MAX_DISPATCH_ATTEMPTS it is no longer claimed.
// An event stopped by the workspace's daily spend cap is deferred instead: not
// a failed attempt, claimed again from the next 00:00 UTC (§15.5).
export async function dispatchEvents(
  boss: PgBoss,
  registry: AgentRegistry,
): Promise<{ events: number; runs: number; failed: number; deferred: number }> {
  return withTransaction(async (tx) => {
    const events = await claimUnprocessedEventsAcrossWorkspaces(tx, BATCH_SIZE);
    const configs = new Map<string, ActiveConfig>();
    let runs = 0;
    let failed = 0;
    let deferred = 0;
    for (const event of events) {
      try {
        runs += await tx.transaction(async (sp) => {
          let config = configs.get(event.workspaceId);
          if (config === undefined) {
            config = await selectActiveConfig(sp, event.workspaceId);
            configs.set(event.workspaceId, config);
          }
          const created = await dispatchEvent(
            sp,
            boss,
            registry,
            event,
            config,
          );
          await markEventProcessed(sp, event.workspaceId, event.id);
          return created;
        });
      } catch (error) {
        const message = sanitiseError(error);
        if (error instanceof SpendCapReachedError) {
          const { deferredUntil } = await deferDispatchToNextUtcDay(
            tx,
            event.workspaceId,
            event.id,
            message,
          );
          // The admin alert (§19) until Slack and email alerts exist.
          console.error(
            `ALERT spend cap reached: workspace ${event.workspaceId}, event ${event.id} (${event.type}) deferred until ${deferredUntil.toISOString()}`,
          );
          deferred += 1;
          continue;
        }
        const { attempts } = await recordDispatchFailure(
          tx,
          event.workspaceId,
          event.id,
          message,
        );
        console.error(
          `Dispatch of event ${event.id} (${event.type}) failed, attempt ${String(attempts)}: ${message}`,
        );
        failed += 1;
      }
    }
    return { events: events.length, runs, failed, deferred };
  });
}

// Creates a run per enabled listening agent and enqueues each new run's job.
// A workspace that has reached its daily spend cap (§15.5) gets no runs: the
// SpendCapReachedError rolls back the event's dispatch, which is deferred.
async function dispatchEvent(
  sp: Tx,
  boss: PgBoss,
  registry: AgentRegistry,
  event: StoredEvent,
  config: ActiveConfig,
): Promise<number> {
  const agents = agentsFor(event.type, config.config, registry);
  if (agents.length > 0) {
    assertUnderSpendCap(
      event.workspaceId,
      await selectSpendTodayMicros(sp, event.workspaceId),
      config.config.dailySpendCapMicros,
    );
  }
  let created = 0;
  for (const agent of agents) {
    const result = await createRun(sp, event.workspaceId, {
      agent: agent.key,
      triggerEventId: event.id,
      configVersionId: config.id,
    });
    // An existing run got its job in the transaction that created it.
    if (!result.created) {
      continue;
    }
    const { run } = result;
    const job: AgentRunJob = { workspaceId: run.workspaceId, runId: run.id };
    const jobId = await boss.send(AGENT_RUN_QUEUE, job, {
      id: run.id,
      expireInSeconds: agent.timeoutSeconds,
      db: jobQueueDb(sp),
    });
    if (jobId === null) {
      throw new Error(`Job for run ${run.id} was not created`);
    }
    created += 1;
  }
  return created;
}
