import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { testDatabaseUrl } from "./test-env";

// Runs once per test run, in the main process (vitest.config.ts loaded .env).
export default async function migrateTestDatabase(): Promise<void> {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl() });
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: fileURLToPath(
        new URL("../migrations", import.meta.url),
      ),
    });
  } finally {
    await pool.end();
  }
}
