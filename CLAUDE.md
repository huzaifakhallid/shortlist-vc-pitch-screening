# Shortlist

AI agents that screen startup pitches for VC firms. Seven agents (Intake, Screening, Research, Memo, Founder Comms, Pipeline, Diligence) that a fund can use one at a time or all together. Portfolio project for our AI services agency (Upwork + GitHub).

**Source of truth:** `docs/design.md`. Read the relevant section before building anything. **Progress:** `docs/progress.md`. Update it when a task finishes.

| Working on… | Read in docs/design.md |
|---|---|
| Any agent | §7 (its section), §8, §11 |
| Database | §12 |
| Workspace settings | §13 |
| Prompts / model calls | §14 |
| Auth, files, webhooks | §15 |
| Slack / CRM / email | §16 |
| API routes | §17 |
| Screens | §18 + `.claude/skills/ui-design-system` |
| Evaluation | §20 |

## Stack

TypeScript (strict) · pnpm workspaces · Next.js App Router · Tailwind CSS v4 + shadcn/ui · PostgreSQL 16 + Drizzle · pg-boss · Cloudflare R2 (MinIO locally) · Google Gemini API · Postmark · Slack Web API · Zod · Vitest · Playwright · Sentry.

Do not add a dependency that duplicates one of these. A new dependency needs a one-line reason in the PR/commit message.

## Commands

Established in milestone 1. Keep this list accurate when scripts change.

```bash
pnpm install
pnpm db:generate            # Drizzle migration from schema change
pnpm db:migrate
pnpm db:seed                # demo workspace + synthetic deals
pnpm dev                    # web app
pnpm worker                 # coordinator + agents
pnpm typecheck
pnpm lint
pnpm test                   # Vitest
pnpm test:e2e               # Playwright
pnpm eval                   # evaluation harness, writes eval/reports/
```

Local development has no Docker: PostgreSQL 16 and MinIO run natively on Windows (design §21). Both must be running before `pnpm db:migrate`, `pnpm dev` or `pnpm worker`. MinIO isn't installed yet (see `docs/progress.md`).

Postgres runs from `%LOCALAPPDATA%\shortlist-dev` and isn't a Windows service, so start it after a reboot, in PowerShell:

```powershell
& "$env:LOCALAPPDATA\shortlist-dev\pgsql\bin\pg_ctl.exe" -D "$env:LOCALAPPDATA\shortlist-dev\pgdata" -l "$env:LOCALAPPDATA\shortlist-dev\postgres.log" start
```

Before saying a task is done: `pnpm typecheck && pnpm lint && pnpm test` pass.

## Repository layout

```
apps/web            Next.js: dashboard, API routes (/v1), webhooks (/hooks)
apps/worker         coordinator + agent runner (Dockerfile includes poppler, used for Railway only)
packages/agents/*   one folder per agent: definition.ts, steps/, prompts/, schema.ts, tests/
packages/agents/shared  agent runtime types and llm.ts, the only file that imports the Gemini SDK
packages/coordinator  event → enabled agents → jobs
packages/integrations postmark, slack, hubspot, airtable, sheets
packages/db         Drizzle schema, migrations, data-access layer
packages/schemas    Zod: config, deal, events, env
eval/               synthetic decks, data rooms, emails, labels, reports
docs/               design.md, progress.md, ui/
```

## Engineering principles (non-negotiable)

1. **Simple beats clever.** Don't overengineer. No abstraction until a second real use exists.
2. **One way.** One pattern per concern. Before adding code, find how the repo already does it and follow that.
3. **No fallbacks, no backups.** One correct execution path. No "try X, else try Y". No silent defaults for missing data.
4. **Fail fast.** Invalid input, missing config, or invalid model output throws with a specific message. Never swallow errors (`catch {}` is banned; every catch rethrows or records a visible failure).
5. **Types over runtime checks.** Strict TypeScript, no `any`, no non-null `!` without a comment. Zod only at boundaries (HTTP, DB JSON, model output, env).
6. **Single responsibility.** One module = one job. Each agent is one folder.
7. **Surgical changes.** Smallest change that solves the problem. No drive-by refactors.
8. **Evidence before fixes.** Debug by observing, hypothesizing, proving, then fixing (use the `debugger` subagent). No speculative fixes.

## Architecture rules (from the design doc)

- Agents never call each other. They read the deal record, write their output, and emit events. The coordinator maps events → **enabled** agents → jobs (§8).
- Every event is written in the **same transaction** as the change that caused it.
- Every agent run is an `agent_run` row with model, prompt version, config version, tokens, cost, status, error. Runs, steps, overrides and stage transitions are **append-only**.
- **Rules before AI.** Mandate check, citation validation, claim checks, dependency rules and scoring math are plain code with unit tests.
- Every model output uses a **JSON-schema response generated from a Zod schema, then validated by that Zod schema**. Invalid output → one corrective retry → visible failure.
- **Gemini only, through one file.** `packages/agents/shared/llm.ts` is the only importer of the Gemini SDK. No multi-provider abstraction, no fallback provider. Only synthetic data goes through a free-tier key (§14.4).
- Every claim cites a source: `{page, snippet}` for decks, URL for research. Validators enforce it.
- Each agent may only use the tools in its allowlist (§11.3).
- **Founder messages:** drafts need approval. A pass based on rubric scores is never sent automatically. This is code, not a setting.
- `workspaceId` always comes from the session or API key, never from a request body. All queries go through `packages/db` data-access functions.
- Webhooks (Postmark, Slack) are signature-verified before anything is parsed.
- Never extract, store or score founder demographic attributes. Research is professional, public information only.

## Working style

- Start each task by reading the design section and existing code it touches. State the plan in a few lines, then implement.
- Build in thin vertical slices that run end to end, with tests, rather than layers.
- After implementing, run checks, then ask the `code-reviewer` subagent to review the diff. Security-sensitive changes (auth, webhooks, files, integrations) also go to `security-reviewer`.
- Never read or print `.env` files or secrets. Use `packages/schemas/env.ts` names in code and `.env.example` for documentation.
- Commit messages: `area: what changed` (e.g., `screening: validate citations against page text`).

## Subagents (`.claude/agents/`)

| Subagent | Use for |
|---|---|
| `agent-builder` | Implementing or changing one Shortlist agent end to end |
| `integration-builder` | Postmark, Slack, CRM adapters, webhooks |
| `ui-builder` | Screens and components following the design system |
| `debugger` | Any bug or failing test: evidence first, minimal fix |
| `code-reviewer` | Reviewing a diff against these principles (read-only) |
| `security-reviewer` | Auth, tenancy, webhooks, file handling, prompt injection (read-only) |

## Skills (`.claude/skills/`)

| Skill | Use for |
|---|---|
| `/build-milestone <n>` | Run a delivery-plan week from §24 |
| `add-agent` | Agent contract, folder layout, events, tests |
| `llm-call` | Prompt + schema + validation + retry pattern |
| `db-change` | Schema changes and migrations |
| `add-integration` | Adapter interface, signatures, credentials, error states |
| `ui-design-system` | Visual rules, tokens, components, screen layouts |
| `/run-eval` | Run evaluation and compare against the last report |
