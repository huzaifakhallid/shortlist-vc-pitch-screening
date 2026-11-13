import type { StoredEvent } from "@shortlist/db";
import type {
  AgentKey,
  EventType,
  ShortlistEvent,
  WorkspaceConfig,
} from "@shortlist/schemas";
import type { z } from "zod";

// What an agent reads about its deal (§11.1). Milestone 1 has the trigger
// event only; deal fields are added with the agents that read them.
export type DealSnapshot = {
  workspaceId: string;
  // Null for an Intake run: it starts before its deal exists.
  dealId: string | null;
  trigger: StoredEvent;
};

// The model client (§14.4). The Gemini implementation is
// packages/agents/shared/llm.ts, the only importer of the Gemini SDK
// (milestone 2).
export type LlmPart =
  { kind: "text"; text: string } | { kind: "png"; data: Uint8Array };

export type StructuredRequest<T> = {
  model: string;
  promptVersion: string;
  system: string;
  // Untrusted content stays inside its labelled delimiters (§14.2).
  input: readonly LlmPart[];
  // Sent as the JSON-schema response and validated on return.
  schema: z.ZodType<T>;
};

export type LlmUsage = {
  tokensIn: number;
  tokensOut: number;
  costMicros: number;
};

// One client per run attempt: usage() totals its calls for the run record.
export type LlmClient = {
  structured<T>(request: StructuredRequest<T>): Promise<T>;
  usage(): LlmUsage;
};

// Everything an agent gets (add-agent skill). Nothing else.
export type AgentContext = {
  workspaceId: string;
  // The config version the run was queued with.
  config: WorkspaceConfig;
  // Saves the step's output to run_step. A retried run returns a finished
  // step's saved output, parsed with `schema`, instead of running it (§11.2).
  runStep<T>(
    name: string,
    schema: z.ZodType<T>,
    fn: () => Promise<T>,
  ): Promise<T>;
  llm: LlmClient;
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
  // Throws, naming the field, when the deal lacks an input.
  needs(deal: DealSnapshot): In;
  run(input: In, ctx: AgentContext): Promise<Out>;
  outputSchema: z.ZodType<Out>;
  // Written in the transaction that saves the output (§8.1).
  emits(output: Out): ShortlistEvent[];
};

export type AnyAgentDefinition = AgentDefinition<unknown, unknown>;

// The agents a worker runs. The coordinator queues runs only for these.
export type AgentRegistry = readonly AnyAgentDefinition[];

// A rate limit, 5xx or timeout from the model provider. The job runner
// retries the run, which resumes at the failed step (§11.2). Any other error
// fails the run at once.
export class ProviderError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProviderError";
  }
}
