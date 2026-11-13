import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineProject, type UserWorkspaceConfig } from "vitest/config";

// The Vitest project for a package whose tests use the test database: this
// package, the coordinator and the worker.
//
// Local development reads the repo-root .env; CI sets the variables directly.
// Vitest loads config files with plain Node, which can't import the
// workspace's TypeScript packages, so validation happens in global-setup.ts
// and setup.ts.
//
// The tests share one database, so their files run one at a time, across all
// of these projects. globalSetup migrates it once; setup.ts points the client
// at it and empties it before each test.
export function databaseTestProject(name: string): UserWorkspaceConfig {
  const envFile = new URL("../../../.env", import.meta.url);
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
  return defineProject({
    test: {
      name,
      globalSetup: [fileURLToPath(new URL("global-setup.ts", import.meta.url))],
      setupFiles: [fileURLToPath(new URL("setup.ts", import.meta.url))],
      fileParallelism: false,
    },
  });
}
