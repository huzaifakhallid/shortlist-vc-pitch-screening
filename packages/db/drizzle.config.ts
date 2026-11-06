import { existsSync } from "node:fs";
import { dbEnvSchema, parseEnv } from "@shortlist/schemas";
import { defineConfig } from "drizzle-kit";

// Local development reads the repo-root .env; CI sets the variables directly.
const envFile = new URL("../../.env", import.meta.url);
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}
const env = parseEnv(dbEnvSchema, process.env);

export default defineConfig({
  dialect: "postgresql",
  schema: "./schema/index.ts",
  out: "./migrations",
  dbCredentials: { url: env.DATABASE_URL },
  verbose: true,
});
