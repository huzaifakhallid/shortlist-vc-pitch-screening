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
- [x] Worker gap: a job that fails its last attempt (expired, or its handler threw) moves to `agent-run-dead-letter`, whose handler finishes a still `QUEUED`/`RUNNING` run `FAILED` (milestone 2)
- [ ] Coordinator: Diligence listens to `deal.stage_changed` only when `to` is `DILIGENCE` (§8.2); add that payload condition to `packages/coordinator/routing.ts` with the Diligence agent (milestone 5)
- [x] Seed script (`pnpm db:seed`): demo workspace "Kestrel Ventures" (fictional) with two partners, an analyst and an admin, config v1, Slack and HubSpot off. Leaves an existing `kestrel` workspace unchanged (no FK cascades, so the milestone 6 nightly reset needs its own delete path)
- [x] CI: GitHub Actions with a Postgres service container (typecheck, lint, format, tests, migrations apply + match schema, web build; eval smoke and deploy steps arrive in milestone 6)

## Milestone 2 — Intake + Screening
- [x] `packages/agents/shared/llm.ts` (`@shortlist/agents-shared/llm`, imported only by the worker entry): `@google/genai` 3.3, `z.toJSONSchema` → `responseJsonSchema`, one corrective retry → `InvalidModelOutputError`, inline PNG parts, in-process `LLM_RPM` limiter, no SDK retries; `models.ts`: `gemini-3.5-flash-lite` (page reading) and `gemini-3.8-flash` (scoring, memo) with paid list prices (3.8 Flash at its 2027-01-01 price); `prompt.ts` branded prompt parts, boundary-nonce delimiters + system notice. `GEMINI_API_KEY` and `LLM_RPM` are required worker env
- [ ] Public pitch form + presigned upload
- [ ] Postmark inbound webhook (signature-verified) → Intake agent
- [ ] Dedupe rules
- [ ] Screening: render, page reading, hidden-text check, facts + profile, mandate, rubric scoring, citation validator, score
- [x] `llm.ts` builds each `ProviderError` message itself (HTTP status + reason); it never copies the SDK's message or `cause`, since those can echo prompt content into `agent_run.error`
- [ ] Intake's narrow path (§11.1): create the deal in the same transaction as `finishRun` and take `deal.received`'s deal id from that insert, never from model output
- [x] Before real model calls: `AgentDefinition.timeoutSeconds` is each job's `expireInSeconds`; the job's abort signal is `ctx.signal` and goes to every model call; an aborted attempt is rethrown without failing the run
- [x] Per-attempt usage: each `run_step` row records its attempt's tokens and cost (migration `0003_step_usage`), failed attempts included; `finishRun` totals them. Steps run one at a time and model calls are allowed only inside a step
- [ ] §11.3 tool allowlist enforcement and `storage` in `AgentContext`: add with the first agent that needs a tool or file storage
- [ ] BLOCKER before the public form or Postmark intake ships: daily AI spend cap per workspace (§15.5), checked by the coordinator before it queues a run and by `structured()` before each model call
- [ ] Before real intake: required env `GEMINI_KEY_TIER=free|paid`; on `free` the worker refuses runs for any workspace that isn't synthetic (§14.4, §15.4)
- [ ] Citation validator: compare snippets with the neutralised text the model saw (`neutraliseTags`, llm-call skill)

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
- [ ] Sentry: scrub error objects, causes and parameters (database errors carry SQL and values; SDK errors can echo prompts) before anything is sent
- [ ] Synthetic dataset (30 decks, 5 data rooms, 10 emails) + labels
- [ ] Eval harness + first report
- [ ] Demo deploy on Oracle Cloud Always Free (§21): arm64 images for web and worker, Docker Compose with Postgres 16 and Caddy (HTTPS), R2 bucket for files, GitHub Actions deploy over SSH after CI, cron nightly reset
- [ ] Demo mode: public form and uploads off, screening re-runs only on bundled synthetic decks, Research from recorded results (free Gemini tier, §21)
- [ ] Demo workspace safety: deny `integrations.manage` and `users.manage` to demo sessions, or rely on the nightly reset. Decide before those handlers ship
- [ ] README (plain language first), 90-second video, case study, Upwork entry
