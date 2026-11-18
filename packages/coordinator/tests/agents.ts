import type { AnyAgentDefinition } from "@shortlist/agents-shared";
import type { AgentKey, EventType } from "@shortlist/schemas";
import { z } from "zod";
import { LISTENERS } from "../routing";

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

// A registry of every agent, each listening to its §8.2 events, except
// `without`.
export function fullRegistry(...without: AgentKey[]): AnyAgentDefinition[] {
  const keys = new Set(Object.values(LISTENERS).flat());
  return [...keys]
    .filter((key) => !without.includes(key))
    .map((key) =>
      listener(
        key,
        (Object.keys(LISTENERS) as EventType[]).filter((event) =>
          LISTENERS[event].includes(key),
        ),
      ),
    );
}
