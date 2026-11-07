---
name: run-eval
description: Runs the Shortlist evaluation harness, compares results with the previous report, and flags regressions. Use after any prompt, model, scoring or extraction change.
argument-hint: "[optional: agent name to limit the run]"
disable-model-invocation: true
---

Run the evaluation for: $ARGUMENTS (all agents if empty).

Latest committed reports:
!`ls -1t eval/reports/*.md 2>/dev/null | head -3`

## Steps

1. Run `pnpm eval $ARGUMENTS`. It writes `eval/reports/<date>-<git-sha>.md` and a JSON twin.
2. Compare with the most recent previous report on every metric in `docs/design.md` §20.2 and the targets in §5.3.
3. Flag as **regression**: any metric worse than the previous report beyond its noise band (Spearman ρ −0.05, recall −5 pts, stability +0.1, any drop in citation validity or injection flags, any unapproved send).
4. Summarize in the report header: what changed (prompt/model/config versions), metric table (previous → current → target), regressions, and cost per deck.
5. If there are regressions, do not commit the triggering change as "done". Report the regression with the decks that moved most, then use the `debugger` subagent to find the cause.

Never edit labels or fixtures to make a metric pass.
