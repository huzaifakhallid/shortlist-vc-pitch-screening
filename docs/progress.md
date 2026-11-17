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
- [x] Dedupe rules (§7.1): `packages/agents/intake` (no definition, prompts or registry yet) with `normalizeDomain`, `companyDomain` (shared-host denylist → "none, shared_host"; no website → "none, no_website"), strict ASCII dot-atom `normalizeEmail`, `decideDuplicate` (domain match links only when the founder email is on the company domain or an earlier submission of the deal, else `possible_duplicate`; the email rule (≤ 90 days inclusive) only without a company domain; a founder email on the fund's own domains fails) and `dedupeDecisionSchema`; `findDuplicateCandidates` in `packages/db/access/deal.ts` (workspace-scoped, returns `founderEmailOnDeal`, fails for a company without a deal). `company.domain_normalized` nullable (migration `0005_company_domain_nullable`). Conservative readings written into §7.1, §7.5, §12
- [ ] Dedupe follow-ups for the Intake agent slice: (a) two concurrent Intake runs for the same new pitch can both decide "new": run the dedupe query and the deal insert in one transaction (and handle the `(workspace_id, domain_normalized)` unique violation) or serialise per workspace; read `now` for `decideDuplicate` from the database clock in that same transaction, never the worker's; (b) a `possible_duplicate` decision needs somewhere to go: a deal or submission state a partner confirms or rejects (dashboard and Slack), not built yet; (c) the caller must build `excludedEmailDomains` from the workspace's intake address domain and its members' email domains (needs a workspace-scoped access function); (d) Founder Comms must read the founder contact from the deal's first submission (§7.5)
- [ ] Before Research fetches a stated website: resolve the host and block private, loopback, link-local and metadata IP ranges (and re-check after redirects); `normalizeDomain` doesn't make a host safe to fetch
- [ ] Screening: render, page reading, hidden-text check, facts + profile, mandate, rubric scoring, citation validator, score
- [x] Screening, rule-based slice (`packages/agents/screening`, not registered, no prompts or model calls yet): schemas for facts (each fact and deck profile value carries `{page, snippet}` citations; `dealFactsSchemaFor(filters)` limits stage and sector to the fund's lists plus `"other"`), deal profile, mandate result (fixed-order tuple) and rubric scores; `checkMandate` (case-insensitive list match, empty list = no filter, inclusive round range, unknown → NEEDS_REVIEW, any known fail → OUT_OF_MANDATE); `totalScore` (§7.2 step 8, fails fast when scores don't match the rubric keys); `citationIssues` (snippet of 12+ characters that is a whitespace-collapsed substring of the page's `neutraliseTags` visible text, issues by path only); `findHiddenSpans` (text-layer words not covered by a 3-word run of visible text, spans of 8+ words; thresholds uncalibrated, weak for scripts without spaces). Design §7.2 steps 4-7, §13 filters and §20.2 updated to match
- [ ] Screening next slice: render + page reading + hidden-text step + facts/profile call (form-vs-deck mismatch over 25%) + scoring call, with `definition.ts`, prompts, registry entry. The facts call sends each page's visible text in its own block and its schema refines with `citationIssues`; scoring reads the facts only and cites their citations, its schema refined with rubric coverage and `citationIssues` against the page texts
- [x] `llm.ts` builds each `ProviderError` message itself (HTTP status + reason); it never copies the SDK's message or `cause`, since those can echo prompt content into `agent_run.error`
- [ ] Intake's narrow path (§11.1): create the deal in the same transaction as `finishRun` and take `deal.received`'s deal id from that insert, never from model output
- [x] Before real model calls: `AgentDefinition.timeoutSeconds` is each job's `expireInSeconds`; the job's abort signal is `ctx.signal` and goes to every model call; an aborted attempt is rethrown without failing the run
- [x] Per-attempt usage: each `run_step` row records its attempt's tokens and cost (migration `0003_step_usage`), failed attempts included; `finishRun` totals them. Steps run one at a time and model calls are allowed only inside a step
- [ ] §11.3 tool allowlist enforcement and `storage` in `AgentContext`: add with the first agent that needs a tool or file storage
- [x] BLOCKER before the public form or Postmark intake ships: daily AI spend cap per workspace (§15.5). Required config field `dailySpendCapMicros` (§13; Kestrel seed $5). Spend = the workspace's `run_step.cost_micros` since 00:00 UTC (`getSpendTodayMicros`, index on `run_step(workspace_id, created_at)`, migration `0004_spend_cap_synthetic`). The coordinator checks it in the event's savepoint before queuing runs (`SpendCapReachedError` → `dispatch_error`); the worker's `ctx.llm` wrapper checks it, plus the running step's unsaved spend, before each `structured()` call (run `FAILED`)
- [ ] BLOCKER before the public form or Postmark intake ships — spend cap follow-up (§15.5, §19): an event over the cap fails dispatch like any other and is dropped after 3 attempts (seconds apart), so it is lost rather than paused until the next UTC day; add a real per-workspace pause/resume and the admin alert
- [x] Before real intake: required env `GEMINI_KEY_TIER=free|paid` (worker). `workspace.synthetic` (migration `0004_spend_cap_synthetic`, default false; `createWorkspace` requires it; the seed marks Kestrel). On `free`, `executeRun` fails a run in a non-synthetic workspace before it starts, so no model call is made
- [ ] BLOCKER before any intake path ships (§14.4, §15.4): the free-tier gate trusts `workspace.synthetic`, so every deal-creating path (Postmark hook, upload, `/v1`) must refuse a synthetic workspace except the bundled synthetic-deck re-run, with a test per path
- [ ] Spend cap with more than one worker or `localConcurrency > 1`: record usage per model call (or reserve under an advisory lock) so concurrent runs and killed processes can't overshoot or go uncounted; today one worker runs one job at a time
- [ ] Before Research ships: add grounding per-request fees to `models.ts` costs so they count toward the cap
- [ ] Demo: block workspace config saves (or cap `dailySpendCapMicros`) for demo sessions; the nightly reset must reseed from an empty database
- [ ] Local dev database: after `0004`, a Kestrel workspace seeded earlier has `synthetic = false` and a config v1 without `dailySpendCapMicros` (the seed leaves an existing workspace unchanged, and now reports its config invalid). Recreate the database and run `pnpm db:migrate && pnpm db:seed` before running the worker against it
- [x] Citation validator: compare snippets with the neutralised text the model saw (`neutraliseTags`, llm-call skill): `packages/agents/screening/steps/citations.ts`

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
