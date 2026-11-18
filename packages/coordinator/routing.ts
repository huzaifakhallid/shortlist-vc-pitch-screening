import type {
  AgentRegistry,
  AnyAgentDefinition,
} from "@shortlist/agents-shared";
import type { AgentKey, EventType, WorkspaceConfig } from "@shortlist/schemas";

// An agent that would also listen to `event` sits it out while `unless` is
// enabled, because it then waits for that agent's output instead.
// §8.2: Research takes deal.received only when Screening is off.
// §8.4: Memo takes deal.screened only when Research is off.
const waits: readonly {
  agent: AgentKey;
  event: EventType;
  unless: AgentKey;
}[] = [
  { agent: "research", event: "deal.received", unless: "screening" },
  { agent: "memo", event: "deal.screened", unless: "research" },
];

// The §8.2 event table: the agents that listen to each event. Diligence's
// "only when to is DILIGENCE" condition is a milestone 5 follow-up.
export const LISTENERS: Readonly<Record<EventType, readonly AgentKey[]>> = {
  "email.received": ["intake"],
  "form.submitted": ["intake"],
  "deal.received": ["screening", "research", "comms", "pipeline"],
  "deal.screened": ["research", "memo", "pipeline"],
  "deal.out_of_mandate": ["comms", "pipeline"],
  "deal.needs_review": ["pipeline"],
  "research.completed": ["memo"],
  "memo.completed": ["pipeline"],
  "deal.stage_changed": ["comms", "pipeline", "diligence"],
  "document.uploaded": ["diligence"],
};

// An enabled agent that takes the event isn't in this worker's registry, or
// a registered definition disagrees with the §8.2 table. The event's
// dispatch fails visibly instead of being processed with a run missing.
export class UnroutableEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnroutableEventError";
  }
}

// Event -> the enabled agents that take it (§8.1), from the §8.2 table and
// the workspace config. Every one must be registered, with a definition
// that listens to the event. The §8.3 dependency rules need nothing here: a
// config that breaks them can't be saved or loaded.
export function agentsFor(
  event: EventType,
  config: WorkspaceConfig,
  registry: AgentRegistry,
): AnyAgentDefinition[] {
  const enabled = (key: AgentKey) =>
    config.agents[key].enabled &&
    !waits.some(
      (wait) =>
        wait.agent === key &&
        wait.event === event &&
        config.agents[wait.unless].enabled,
    );
  const listeners = LISTENERS[event];

  for (const agent of registry) {
    if (agent.listensTo.includes(event) && !listeners.includes(agent.key)) {
      throw new UnroutableEventError(
        `Agent "${agent.key}" listens to ${event}, which the §8.2 table doesn't route to it`,
      );
    }
  }

  return listeners.filter(enabled).map((key) => {
    const agent = registry.find((a) => a.key === key);
    if (agent === undefined) {
      throw new UnroutableEventError(
        `Agent "${key}" is enabled and takes ${event}, but this worker doesn't register it`,
      );
    }
    if (!agent.listensTo.includes(event)) {
      throw new UnroutableEventError(
        `Agent "${key}" takes ${event} (§8.2) but its definition doesn't listen to it`,
      );
    }
    return agent;
  });
}
