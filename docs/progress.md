# Progress

Update this file when a task finishes. One line per task: `- [x] what (commit or PR)`. Add discovered tasks under the milestone they belong to.

## Milestone 1 — Foundations (§24)
- [ ] pnpm workspace, TypeScript strict base config, ESLint, Prettier, Vitest
- [ ] `apps/web` (Next.js App Router, Tailwind v4, shadcn/ui) with design tokens from `ui-design-system`
- [x] Native toolchain: Node 26.13.0, pnpm 12.18.0, PostgreSQL 16.15 (no-install zip, not a Windows service), poppler 25.07.0, GitHub CLI 2.103.3 (§21)
- [ ] MinIO: blocked. winget and dl.min.io both return 410 and the `minio/minio` repo is archived with no binaries. Needs a decision before milestone 2; milestone 1 doesn't use file storage.
- [ ] `packages/schemas`: env, workspace config (§13) with two-stage validation incl. dependency rules (§8.3), stages + run status (§12.1), events (§8.2)
- [ ] `packages/db`: Drizzle schema (§12), first migration, data-access layer scoped by workspace
- [ ] Auth.js magic link + one-click demo users; roles + `authorize()` (§6, §15.1)
- [ ] `packages/coordinator` + `packages/agents/shared` + `apps/worker`: events → enabled agents → pg-boss jobs; `agent_run` + `run_step` persistence; `LlmClient` type only (Gemini implementation is milestone 2)
- [ ] Seed script: demo workspace "Kestrel Ventures" (fictional) with config v1, Slack and HubSpot off
- [ ] CI: GitHub Actions with a Postgres service container

## Milestone 2 — Intake + Screening
- [ ] `packages/agents/shared/llm.ts`: Gemini SDK, Zod → JSON Schema, inline PNG parts, `LLM_RPM` rate limiter; `models.ts` with model IDs + price table (§14.4)
- [ ] Public pitch form + presigned upload
- [ ] Postmark inbound webhook (signature-verified) → Intake agent
- [ ] Dedupe rules
- [ ] Screening: render, page reading, hidden-text check, facts + profile, mandate, rubric scoring, citation validator, score

## Milestone 3 — Research + Memo + dashboard
- [ ] Research agent with Google Search grounding + source URLs + 30-day cache (live runs need billing on the key; tests use recorded fixtures)
- [ ] Memo agent + template rendering + PDF/Markdown export
- [ ] Deals list (directory style) and Deal page with deck viewer + citation jumps

## Milestone 4 — Comms + Pipeline
- [ ] Approvals inbox + approval state machine (§11.4)
- [ ] Postmark outbound from verified domain
- [ ] Slack cards, buttons (signature-verified), weekly digest
- [ ] HubSpot, Airtable, Google Sheets adapters

## Milestone 5 — Diligence + API + Agents page
- [ ] Founder upload link, XLSX parsing, claim checks, checklist
- [ ] Public API `/v1` with workspace API keys
- [ ] Manual re-run trigger: `agent.run_requested` event for dashboard re-runs and `POST /v1/agents/{agent}/runs` (§11.2)
- [ ] Agents page (on/off cards), Integrations page, Run inspector, Audit log

## Milestone 6 — Evaluation + launch
- [ ] Synthetic dataset (30 decks, 5 data rooms, 10 emails) + labels
- [ ] Eval harness + first report
- [ ] Demo deploy with nightly reset
- [ ] README (plain language first), 90-second video, case study, Upwork entry
