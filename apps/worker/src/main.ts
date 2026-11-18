import { existsSync } from "node:fs";
import { geminiClients } from "@shortlist/agents-shared/llm";
import {
  AGENT_RUN_DEAD_LETTER_QUEUE,
  AGENT_RUN_QUEUE,
  createAgentRunQueue,
  dispatchEvents,
} from "@shortlist/coordinator";
import { closeDb } from "@shortlist/db";
import { parseEnv, workerEnvSchema } from "@shortlist/schemas";
import { PgBoss } from "pg-boss";
import {
  handleAgentRunJobs,
  handleDeadLetterJobs,
  type RunDeps,
} from "./execute-run";
import { registry } from "./registry";

// `pnpm worker`: the coordinator tick and the agent runner (§8.1, §11.2).
// Local development reads the repo-root .env; deployments set the variables.
const envFile = new URL("../../../.env", import.meta.url);
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}
const env = parseEnv(workerEnvSchema, process.env);

const TICK_MS = 2000;

const deps: RunDeps = {
  registry,
  llmForRun: geminiClients({ apiKey: env.GEMINI_API_KEY, rpm: env.LLM_RPM }),
  keyTier: env.GEMINI_KEY_TIER,
  log: (message) => {
    console.log(message);
  },
};

const boss = new PgBoss({ connectionString: env.DATABASE_URL });
boss.on("error", (error) => {
  console.error("pg-boss error:", error);
});
await boss.start();
await createAgentRunQueue(boss);
await boss.work(AGENT_RUN_QUEUE, { includeMetadata: true }, (jobs) =>
  handleAgentRunJobs(jobs, deps),
);
await boss.work(
  AGENT_RUN_DEAD_LETTER_QUEUE,
  { includeMetadata: true },
  (jobs) => handleDeadLetterJobs(jobs, deps),
);

// Ticks never overlap: the next is scheduled when one ends.
let stopping = false;
let timer: NodeJS.Timeout | undefined;
let ticking: Promise<void> = Promise.resolve();

async function tick(): Promise<void> {
  try {
    const { events, runs, failed, deferred } = await dispatchEvents(
      boss,
      registry,
    );
    if (events > 0) {
      console.log(
        `Dispatched ${String(events)} events into ${String(runs)} runs (${String(failed)} events failed, ${String(deferred)} deferred by the spend cap)`,
      );
    }
  } catch (error) {
    // Nothing was committed; the next tick claims the same events again.
    console.error("Coordinator tick failed:", error);
  }
  if (!stopping) {
    timer = setTimeout(() => {
      ticking = tick();
    }, TICK_MS);
  }
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) {
    return;
  }
  stopping = true;
  console.log(`${signal}: stopping the worker`);
  clearTimeout(timer);
  await ticking;
  // Waits for running jobs; one still running at the timeout is retried later.
  await boss.stop({ graceful: true, timeout: 30_000 });
  await closeDb();
  console.log("Worker stopped");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    shutdown(signal).catch((error: unknown) => {
      console.error("Worker shutdown failed:", error);
      process.exitCode = 1;
    });
  });
}

console.log(
  `Worker running: ${String(registry.length)} agents registered (${registry.map((a) => a.key).join(", ") || "none"}), ${env.GEMINI_KEY_TIER} Gemini key, coordinator tick every ${String(TICK_MS)} ms`,
);
ticking = tick();
