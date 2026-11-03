import { defineConfig } from "vitest/config";

// Every workspace package is its own Vitest project. A package without its own
// vitest.config.ts uses Vitest's default include, which finds tests/**/*.test.ts
// and src/**/*.test.ts. packages/agents holds one folder per agent, so each
// agent folder is a project and the container folder itself is not
// (a "!packages/agents" negation would also drop its children).
export default defineConfig({
  test: {
    projects: ["apps/*", "packages/!(agents)", "packages/agents/*"],
  },
});
