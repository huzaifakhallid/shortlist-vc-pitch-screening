import type { IntakeFacts, ReceivedPitch, StoredEvent } from "@shortlist/db";
import type {
  AgentKey,
  EventType,
  IntakeMatch,
  ShortlistEvent,
  WorkspaceConfig,
} from "@shortlist/schemas";
import type { z } from "zod";
import type { ModelId } from "./models";

// What an agent reads about its deal (§11.1). Milestone 1 has the trigger
// event only; deal fields are added with the agents that read them.
export type DealSnapshot = {
  workspaceId: string;
  // Null for an Intake run: it starts before its deal exists.
  dealId: string | null;
  trigger: StoredEvent;
};

// The model client (§14.4). The Gemini implementation is
// packages/agents/shared/llm.ts, the only importer of the Gemini SDK.

// One HTTP request to the model may take this long; an agent's
// timeoutSeconds must be longer (agentRegistry).
export const MODEL_REQUEST_TIMEOUT_MS = 180_000;

// Brands, so prompt text and parts come only from their constructors in
// prompt.ts: a string can't be passed as a system prompt, and founder
// content can't be passed as an instruction.
declare const brand: unique symbol;
type Branded<T, B extends string> = T & { readonly [brand]: B };

type TextPart = { kind: "text"; text: string };
type PngPart = { kind: "png"; data: Uint8Array };

// Instructions from a versioned prompt file (systemPrompt()).
export type SystemPrompt = Branded<string, "SystemPrompt">;
// Untrusted content inside its delimiters (untrustedText, untrustedPng).
export type UntrustedPart = Branded<TextPart | PngPart, "UntrustedPart">;
// Fixed text we wrote, e.g. instruction`Score these facts:`.
export type InstructionPart = Branded<TextPart, "InstructionPart">;
// The fund's own settings, delimited (workspaceContext()).
export type WorkspaceContextPart = Branded<TextPart, "WorkspaceContextPart">;
export type LlmPart = UntrustedPart | InstructionPart | WorkspaceContextPart;

export type StructuredRequest<T> = {
  model: ModelId;
  promptVersion: string;
  system: SystemPrompt;
  input: readonly LlmPart[];
  // Sent as the JSON-schema response and validated on return. Domain rules
  // (e.g. a citation's snippet is on its page) are refinements of this
  // schema, so their failures get the same corrective retry.
  schema: z.ZodType<T>;
};

export type LlmUsage = {
  tokensIn: number;
  tokensOut: number;
  costMicros: number;
};

// One client per run attempt, bound to the attempt's abort signal. usage()
// totals every call the client has made, failed and retried ones included.
export type LlmClient = {
  structured<T>(request: StructuredRequest<T>): Promise<T>;
  usage(): LlmUsage;
};

// Everything an agent gets (add-agent skill). Nothing else.
export type AgentContext = {
  workspaceId: string;
  // The config version the run was queued with.
  config: WorkspaceConfig;
  // Saves the step's output and model usage to run_step. A retried run
  // returns a finished step's saved output, parsed with `schema`, instead of
  // running it (§11.2). Steps run one at a time, and model calls happen only
  // inside a step, so each step's usage is known.
  runStep<T>(
    name: string,
    schema: z.ZodType<T>,
    fn: () => Promise<T>,
  ): Promise<T>;
  llm: LlmClient;
  // Aborted when the attempt expires (timeoutSeconds) or the worker stops.
  // Model calls take it already; long deterministic work should check it.
  signal: AbortSignal;
  log(message: string): void;
};

// §11.1. Method syntax keeps In and Out bivariant, so one registry holds
// agents with different input and output types (AnyAgentDefinition).
export type AgentDefinition<In, Out> = {
  key: AgentKey;
  listensTo: readonly EventType[];
  // Recorded on every run. Null for an agent that makes no model call.
  promptVersion: string | null;
  model: string | null;
  // How long one attempt may run. pg-boss then expires the job, aborts
  // ctx.signal and retries it (or dead-letters it after the last attempt).
  timeoutSeconds: number;
  // Throws, naming the field, when the deal lacks an input.
  needs(deal: DealSnapshot): In;
  run(input: In, ctx: AgentContext): Promise<Out>;
  outputSchema: z.ZodType<Out>;
  // Written in the transaction that saves the output (§8.1).
  emits(output: Out): ShortlistEvent[];
  // Intake only (§11.1): its run starts before its deal exists. The worker
  // creates or links the deal from the output (receivePitch) in the
  // transaction that finishes the run, and writes the events for the match
  // that made, with that insert's deal id. emits(output) must return none.
  receivesPitch?: IntakePath<Out>;
};

export type IntakePath<Out> = {
  pitch(output: Out): ReceivedPitch;
  // The dedupe rules, on facts read inside that transaction.
  decide(output: Out, facts: IntakeFacts): IntakeMatch;
  emits(match: IntakeMatch): ShortlistEvent[];
};

export type AnyAgentDefinition = AgentDefinition<unknown, unknown>;

// The agents a worker runs. The coordinator queues runs only for these.
export type AgentRegistry = readonly AnyAgentDefinition[];

// The worker's registry. Each agent's attempt must outlast one model
// request, or a slow request would always expire the job instead of
// timing out as a retryable provider error.
export function agentRegistry(
  agents: readonly AnyAgentDefinition[],
): AgentRegistry {
  const requestSeconds = MODEL_REQUEST_TIMEOUT_MS / 1000;
  for (const agent of agents) {
    if (agent.timeoutSeconds <= requestSeconds) {
      throw new Error(
        `Agent "${agent.key}" has timeoutSeconds ${String(agent.timeoutSeconds)}; it must be more than the ${String(requestSeconds)}s model request timeout`,
      );
    }
  }
  return agents;
}

// needs() found the deal without an input the agent requires. Names the
// field, never its value.
export class MissingInputError extends Error {
  constructor(field: string) {
    super(`Missing input: ${field}`);
    this.name = "MissingInputError";
  }
}

// A rate limit, 5xx or timeout from the model provider. The job runner
// retries the run, which resumes at the failed step (§11.2). Any other error
// fails the run at once.
export class ProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProviderError";
  }
}

// The model's output failed its schema twice: once, then again after the
// corrective retry. Fails the run (llm-call skill).
export class InvalidModelOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidModelOutputError";
  }
}
