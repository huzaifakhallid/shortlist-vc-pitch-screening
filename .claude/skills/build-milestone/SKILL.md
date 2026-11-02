---
name: build-milestone
description: Runs one milestone (week) of the Shortlist delivery plan from docs/design.md §24 - plans tasks, delegates to subagents, builds in vertical slices, verifies, updates progress.
argument-hint: "[milestone-number 1-6]"
disable-model-invocation: true
---

Build milestone **$ARGUMENTS** of Shortlist.

Current progress:
!`cat docs/progress.md`

## Steps

1. Read `docs/design.md` §24 (row for milestone $ARGUMENTS) and every section that row depends on. Read `CLAUDE.md`.
2. List the unchecked tasks for this milestone from `docs/progress.md`. Add any missing task the design requires.
3. Order tasks so each one leaves the app runnable. Present the ordered list with one line each and the subagent you'll use. Then start; don't wait for approval unless a decision is irreversible or the design is ambiguous.
4. For each task:
   - Delegate to the right subagent (`agent-builder`, `integration-builder`, `ui-builder`) with the task, the design sections, and the acceptance check.
   - Run `pnpm typecheck && pnpm lint && pnpm test`.
   - Send the diff to `code-reviewer` (and `security-reviewer` for auth, webhooks, files, integrations). Fix blockers.
   - Commit: `feat: one short sentence`, with no body and no attribution. Tick the task in `docs/progress.md`.
5. At the end: run the app (`pnpm dev`, `pnpm worker`) and walk through the milestone's "done when" from §24. Report what works, what's left, and any design change you had to make (and update `docs/design.md` if so).

## Milestone 1 notes (scaffolding)

- Check current CLI flags with `--help` before running scaffolding commands; don't rely on memory.
- Create the pnpm workspace (`pnpm-workspace.yaml` with `apps/*`, `packages/*`), a shared `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`), ESLint, Prettier, Vitest.
- Scaffold `apps/web` with create-next-app (TypeScript, App Router, Tailwind, ESLint), then `npx shadcn@latest init`. Apply `.claude/skills/ui-design-system/tokens.css` to `globals.css` as that skill describes.
- No Docker locally: PostgreSQL 16 and MinIO run natively on Windows (§21). CI uses a GitHub Actions Postgres service container.
- `packages/schemas/env.ts`: Zod-validated env; the process exits with the missing variable name. Write `.env.example`.
