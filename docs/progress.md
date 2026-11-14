# Progress

Update this file when a task finishes. One line per task: `- [x] what (commit or PR)`. Add discovered tasks under the milestone they belong to.

## Milestone 1 — Foundations (§24)
- [x] pnpm workspace, TypeScript strict base config, ESLint, Prettier, Vitest (TypeScript pinned to 6.0 until typescript-eslint supports 7)
- [x] `apps/web` (Next.js 16 App Router, Tailwind v4, shadcn/ui radix-nova) with design tokens from `ui-design-system`: top nav, `/` → `/deals`, empty Deals page with loading and error states; `pnpm dev` runs it. Screenshots in `docs/ui/screens/built/`
- [x] Decision: `apps/web/next.config.ts` keeps `cacheComponents: true` (required by `partialPrefetching`), so `cookies()`/`headers()` reads, including the auth session in step 6, must sit inside a `<Suspense>` boundary
- [ ] Design system radius scale: shadcn nova maps `rounded-lg` to `--radius` (6px) and `rounded-md` to 4.8px, but the skill expects `rounded-md` = 6px and `rounded-lg` = 8px. Decide which wins before milestone 3 builds deal rows
- [x] Native toolchain: Node 26.13.0, pnpm 12.18.0, PostgreSQL 16.15 (no-install zip, not a Windows service), poppler 25.07.0, GitHub CLI 2.103.3 (§21)
- [ ] MinIO: blocked. winget and dl.min.io both return 410 and the `minio/minio` repo is archived with no binaries. Needs a decision before milestone 2; milestone 1 doesn't use file storage.
- [x] `packages/schemas`: env, workspace config (§13) with two-stage validation incl. dependency rules (§8.3), stages + run status (§12.1), events (§8.2)
- [x] `packages/db`: Drizzle schema (§12), first migration, data-access layer scoped by workspace
- [x] Auth.js magic link + one-click demo users; roles + `authorize()` (§6, §15.1): next-auth 5 beta with the Drizzle adapter and database sessions (migration `0001_auth`); members only, no sign-up; magic links print to the `pnpm dev` terminal and throw elsewhere until Postmark; demo logins behind `DEMO_LOGINS`; `authorize()` in `apps/web/lib/authorize.ts`; `proxy.ts` redirects signed-out visitors (add new dashboard routes to its matcher)
- [ ] Workspace switcher: a user with more than one membership currently fails with a specific error (`apps/web/lib/workspace-membership.ts`)
- [ ] Known gap (library behaviour): Auth.js treats a database error while reading the session as signed out. Its `logger.error` records the error on the server; Sentry later
- [x] `packages/coordinator` + `packages/agents/shared` + `apps/worker`: events → enabled agents → pg-boss jobs; `agent_run` + `run_step` persistence; `LlmClient` type only (Gemini implementation is milestone 2). pg-boss 12: runs and their jobs are created in the event-claim transaction (`jobQueueDb` in `@shortlist/db/coordinator`); provider errors retry and resume at the failed step, other errors (including ones before the run starts) fail the run. Each event dispatches in its own savepoint; a failing one records `dispatch_error` and is dropped after 3 attempts (migration `0002_dispatch_failures`). Stored error text goes through `sanitiseError` (DB errors become a logged reference). `pnpm worker` runs with an empty registry (`apps/worker/src/registry.ts`) until milestone 2
- [ ] Worker gap: a process that dies mid-job (the job expires) leaves the run `RUNNING`. Add a dead-letter handler that fails the run before milestone 2 agents ship
- [ ] Coordinator: Diligence listens to `deal.stage_changed` only when `to` is `DILIGENCE` (§8.2); add that payload condition to `packages/coordinator/routing.ts` with the Diligence agent (milestone 5)
- [x] Seed script (`pnpm db:seed`): demo workspace "Kestrel Ventures" (fictional) with two partners, an analyst and an admin, config v1, Slack and HubSpot off. Leaves an existing `kestrel` workspace unchanged (no FK cascades, so the milestone 6 nightly reset needs its own delete path)
- [ ] CI: GitHub Actions with a Postgres service container

## Milestone 2 — Intake + Screening
- [ ] `packages/agents/shared/llm.ts`: Gemini SDK, Zod → JSON Schema, inline PNG parts, `LLM_RPM` rate limiter; `models.ts` with model IDs + price table (§14.4)
- [ ] Public pitch form + presigned upload
- [ ] Postmark inbound webhook (signature-verified) → Intake agent
- [ ] Dedupe rules
- [ ] Screening: render, page reading, hidden-text check, facts + profile, mandate, rubric scoring, citation validator, score
- [ ] `llm.ts` builds each `ProviderError` message itself (HTTP status + reason); it never copies the SDK's message or `cause`, since those can echo prompt content into `agent_run.error`
- [ ] Intake's narrow path (§11.1): create the deal in the same transaction as `finishRun` and take `deal.received`'s deal id from that insert, never from model output
- [ ] Before real model calls: a job expiry sized per agent, and the pg-boss job's abort signal passed into `AgentContext`, so an expired attempt stops instead of running alongside its retry
- [ ] Per-attempt usage: `LlmClient.usage()` covers the current attempt only, so tokens spent on an attempt that hit a provider error are missing from the run. Record usage per step (or per attempt) with `llm.ts`
- [ ] §11.3 tool allowlist enforcement and `storage` in `AgentContext`: add with the first agent that needs a tool or file storage

## Milestone 3 — Research + Memo + dashboard
- [ ] Research agent with Google Search grounding + source URLs + 30-day cache (live runs need billing on the key; tests use recorded fixtures)
- [ ] Memo agent + template rendering + PDF/Markdown export
- [ ] Deals list (directory style) and Deal page with deck viewer + citation jumps

## Milestone 4 — Comms + Pipeline
- [ ] Approvals inbox + approval state machine (§11.4)
- [ ] Postmark outbound from verified domain
- [ ] With Postmark: turn email sign-in on outside `pnpm dev` (`apps/web/lib/magic-link.ts`), and add a per-IP rate limit on `requestMagicLink` and the demo login (§15.5)
- [ ] Slack cards, buttons (signature-verified), weekly digest
- [ ] HubSpot, Airtable, Google Sheets adapters

## Milestone 5 — Diligence + API + Agents page
- [ ] Founder upload link, XLSX parsing, claim checks, checklist
- [ ] Public API `/v1` with workspace API keys
- [ ] Manual re-run trigger: `agent.run_requested` event for dashboard re-runs and `POST /v1/agents/{agent}/runs` (§11.2)
- [ ] Agents page (on/off cards), Integrations page, Run inspector, Audit log
- [ ] `users.manage`: removing a membership deletes that user's sessions in the same transaction
- [ ] Consider banning `withTransaction`/`Tx` in `apps/web` (ESLint), so the web app can't compose its own cross-table transactions

## Milestone 6 — Evaluation + launch
- [ ] Synthetic dataset (30 decks, 5 data rooms, 10 emails) + labels
- [ ] Eval harness + first report
- [ ] Demo deploy with nightly reset
- [ ] Demo workspace safety: deny `integrations.manage` and `users.manage` to demo sessions, or rely on the nightly reset. Decide before those handlers ship
- [ ] README (plain language first), 90-second video, case study, Upwork entry
