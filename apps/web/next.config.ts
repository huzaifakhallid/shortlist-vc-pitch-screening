import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// Local development reads the repo-root .env (next only looks in apps/web);
// deployments set the variables directly. lib/env.ts validates them.
const envFile = new URL("../../.env", import.meta.url);
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const nextConfig: NextConfig = {
  // The repo documents agent rules in CLAUDE.md; stop next dev writing AGENTS.md.
  agentRules: false,
  cacheComponents: true,
  partialPrefetching: true,
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    "@shortlist/agents-intake",
    "@shortlist/db",
    "@shortlist/integrations",
    "@shortlist/schemas",
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
