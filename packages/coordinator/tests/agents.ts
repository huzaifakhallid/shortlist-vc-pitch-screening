import type { AnyAgentDefinition } from "@shortlist/agents-shared";
import type { AgentKey, EventType } from "@shortlist/schemas";
import { z } from "zod";

// A definition that only routes: the coordinator never runs agents.
export function listener(
  key: AgentKey,
  listensTo: EventType[],
): AnyAgentDefinition {
  return {
    key,
    listensTo,
    promptVersion: null,
    model: null,
    timeoutSeconds: 60,
    needs: () => null,
    run: () => Promise.resolve(null),
    outputSchema: z.null(),
    emits: () => [],
  };
}
