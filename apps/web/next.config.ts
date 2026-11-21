import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// Local development reads the repo-root .env (next only looks in apps/web);
// deployments set the variables directly. lib/env.ts validates them.
const envFile = new URL("../../.env", import.meta.url);
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

// The deck bucket's origin: the pitch form uploads to it and the deck
// viewer fetches presigned links from it (virtual-hosted style,
// <bucket>.<account>.r2.cloudflarestorage.com).
function r2Origin(): string {
  const { R2_ENDPOINT: endpoint, R2_BUCKET: bucket } = process.env;
  if (endpoint === undefined || bucket === undefined) {
    throw new Error(
      "R2_ENDPOINT and R2_BUCKET are needed to build the Content-Security-Policy",
    );
  }
  return `https://${bucket}.${new URL(endpoint).host}`;
}

// Production only: next dev needs eval and its HMR socket. Next's runtime
// writes its React Server Components payload in inline <script> tags, and
// per-request nonces can't reach prerendered shells (cacheComponents,
// partial prerendering), so script-src keeps 'unsafe-inline' (a progress.md
// follow-up). object-src, base-uri, frame-ancestors, worker-src (the pdf.js
// worker) and connect-src are locked down.
function contentSecurityPolicy(): string {
  return [
    "script-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    `connect-src 'self' ${r2Origin()}`,
  ].join("; ");
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
  // The deck route reads the bundled synthetic decks from disk.
  outputFileTracingIncludes: {
    "/deals/[dealId]/deck": ["./synthetic-decks/**"],
  },
  headers() {
    if (process.env.NODE_ENV !== "production") {
      return Promise.resolve([]);
    }
    return Promise.resolve([
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
        ],
      },
    ]);
  },
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
