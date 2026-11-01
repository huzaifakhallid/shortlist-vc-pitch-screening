---
name: db-change
description: How to change the Shortlist database - Drizzle schema edits, generated migrations, workspace-scoped data-access functions, append-only tables. Use for any change in packages/db.
---

# Database changes

Source: `docs/design.md` §12.

## Steps

1. Edit the Drizzle schema in `packages/db/schema/`. Match §12 names. If the design changes, update §12 in the same commit.
2. `pnpm db:generate` to create the migration. Read the generated SQL. Never hand-edit a migration that has been applied anywhere; write a new one.
3. `pnpm db:migrate` locally, then `pnpm test`.
4. Add or change data-access functions in `packages/db/access/<entity>.ts`.

## Rules

- **Every** data-access function takes `workspaceId` as its first parameter and filters by it. No exported function queries across workspaces, except the coordinator's job polling, which is clearly named (`claimJobsAcrossWorkspaces`).
- App code never imports the Drizzle client directly; only `packages/db/access/*`.
- JSONB columns are typed with a Zod schema from `packages/schemas` and parsed on read.
- **Append-only tables:** `agent_run`, `run_step`, `event`, `score_override`, `stage_transition`, `audit_event`. No update or delete functions exist for them (except `agent_run.status/finished_at` and `event.processed_at`, set once).
- A state change and its event are written in one transaction: `withTransaction(tx => { update…; insertEvent… })`.
- Index every foreign key used in filters, and the list queries in §12.
- Money as integer micro-dollars (`cost_micros`), never floats.
