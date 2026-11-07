---
name: add-agent
description: The Shortlist agent contract - folder layout, AgentDefinition, steps, events, dependency rules and required tests. Use when creating or changing any agent in packages/agents.
---

# Shortlist agent contract

Source: `docs/design.md` §7, §8, §11.

## Folder

```
packages/agents/<agent>/
  definition.ts     AgentDefinition: key, listensTo, needs, run, outputSchema, emits, sideEffect
  schema.ts         Zod schemas for this agent's input and output
  steps/            one file per step, pure where possible
  prompts/          <step>.v<N>.md  (versioned; never edit a released version, add v<N+1>)
  tests/            unit tests per step + agent test with recorded model fixtures
  index.ts          exports definition only
```

## Contract

```ts
export type AgentDefinition<In, Out> = {
  key: AgentKey;
  listensTo: EventType[];
  needs: (deal: DealSnapshot) => In;            // throw MissingInputError("field") if absent
  run: (input: In, ctx: AgentContext) => Promise<Out>;
  outputSchema: z.ZodType<Out>;
  emits: (output: Out) => EventType[];
  sideEffect?: { kind: "email" | "crm" | "slack"; approval: "required" | "none" };
};
```

`AgentContext` provides: `workspaceId`, `config` (active version), `runStep(name, fn)` (persists step output and resumes from the first unfinished step), `llm` (model client), `storage`, `log`. Agents get nothing else.

## Steps

- `ctx.runStep("render", () => ...)` persists each step's output to `run_step`. Re-runs skip finished steps.
- A step is either deterministic code or one model call. Never both in one function.
- Provider errors (429, 5xx, timeout) are retried by the job runner. Don't add your own retry loops except the single corrective retry for invalid model output (`llm-call` skill).

## Events

- Emit only event types from `packages/schemas/events.ts`. Adding a type means updating that file and design §8.2.
- The coordinator queues jobs for **enabled** agents only. Idempotency key: `(agent, triggerEventId)`.

## Dependencies

If the agent requires another agent's output, add the rule to the config validator (`packages/schemas/config.ts`) and to design §8.3. Invalid combinations are rejected at settings save, never handled at runtime.

## Tool allowlist (§11.3)

| Agent | Allowed |
|---|---|
| intake | email parser, dedupe query |
| screening | page renderer, vision model |
| research | Google Search grounding, company website fetch |
| memo | none |
| comms | draft only (sending is a separate approved step) |
| pipeline | CRM adapter, Slack client |
| diligence | spreadsheet parser, vision model |

## Done checklist

- [ ] `needs` throws on missing input with the field name
- [ ] every model output validated by its Zod schema
- [ ] every claim carries a citation and the validator runs
- [ ] events emitted match §8.2
- [ ] unit tests for deterministic steps; fixture test for success, retry-then-success, fail-twice
- [ ] `agent_run` records model, prompt version, config version, tokens, cost
- [ ] the agent works when every other optional agent is disabled
