import { existsSync } from "node:fs";
import { defineProject } from "vitest/config";

// Local development reads the repo-root .env; CI sets the variables directly.
// Vitest loads this file with plain Node, which can't import the workspace's
// TypeScript packages, so validation happens in tests/global-setup.ts and
// tests/setup.ts.
const envFile = new URL("../../.env", import.meta.url);
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

// The tests share one database, so files run one at a time. globalSetup
// migrates it once; tests/setup.ts points the client at it and empties it
// before each test.
export default defineProject({
  test: {
    name: "db",
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
  },
});
