import { parseEnv, webEnvSchema, type WebEnv } from "@shortlist/schemas";

// The web app's environment, validated on every read so a missing or invalid
// variable fails with its name (next.config.ts loads the repo-root .env).
export function webEnv(): WebEnv {
  return parseEnv(webEnvSchema, process.env);
}
