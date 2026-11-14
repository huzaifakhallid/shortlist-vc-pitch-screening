import { PgBoss } from "pg-boss";
import { testDatabaseUrl } from "../../db/tests/test-env";
import { createAgentRunQueue } from "../queue";

// pg-boss on the test database, in its own schema, which the per-test
// truncate leaves alone; callers empty the queue with deleteAllJobs. No
// maintenance or cron, so nothing runs in the background.
export async function startTestBoss(): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString: testDatabaseUrl(),
    supervise: false,
    schedule: false,
  });
  boss.on("error", (error) => {
    throw error;
  });
  await boss.start();
  await createAgentRunQueue(boss);
  return boss;
}
