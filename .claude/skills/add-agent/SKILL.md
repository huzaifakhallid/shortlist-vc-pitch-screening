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
  promptVersion: string | null;                 // recorded on the run; null without a model call
  model: string | null;
  timeoutSeconds: number;                       // one attempt's limit; pg-boss expires the job and aborts ctx.signal
  needs(deal: DealSnapshot): In;                // throw MissingInputError("field") if absent
  run(input: In, ctx: AgentContext): Promise<Out>;
  outputSchema: z.ZodType<Out>;
  emits(output: Out): ShortlistEvent[];
  sideEffect?: { kind: "email" | "crm" | "slack"; approval: "required" | "none" };
};
```

The types live in `packages/agents/shared/runtime.ts` (`sideEffect` arrives with Comms). Register the agent in `apps/worker/src/registry.ts`; the coordinator queues runs only for registered agents.

`AgentContext` provides: `workspaceId`, `config` (the version the run was queued with), `runStep(name, schema, fn)` (persists step output and resumes from the first unfinished step), `llm` (model client), `signal` (aborted when the attempt expires), `storage` (with file storage), `log`. Agents get nothing else.

## Steps

- `ctx.runStep("render", schema, () => ...)` persists each step's output to `run_step`. A retried run skips finished steps and returns their saved output, parsed with `schema`. Step names are unique within a run.
- Throw `ProviderError` (from `@shortlist/agents-shared`) only for provider rate limits, 5xx and timeouts: the job is retried and the run resumes. Any other error fails the run at once.
- A step is either deterministic code or one model call. Never both in one function.
- Errors the agent throws and `ctx.log` messages name paths and ids (step, field path, page number), never content: no deck text, snippets or email fields.
- Provider errors (429, 5xx, timeout) are retried by the job runner. Don't add your own retry loops except the single corrective retry for invalid model output (`llm-call` skill).

## Events

- Emit only event types from `packages/schemas/events.ts`. Adding a type means updating that file and design §8.2.
- The coordinator queues jobs for **enabled** agents only. Idempotency key: `(agent, triggerEventId)`.
- An emitted event's `dealId` comes from the run, never from agent or model output. Intake (milestone 2) is the one exception: it creates the deal in the same transaction as `finishRun`, and its `deal.received` takes the deal id from that insert.

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
