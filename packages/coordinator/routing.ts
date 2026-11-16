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

// Event -> the enabled agents that take it (§8.1). The §8.3 dependency rules
// need nothing here: a config that breaks them can't be saved or loaded.
export function agentsFor(
  event: EventType,
  config: WorkspaceConfig,
  registry: AgentRegistry,
): AnyAgentDefinition[] {
  return registry.filter(
    (agent) =>
      agent.listensTo.includes(event) &&
      config.agents[agent.key].enabled &&
      !waits.some(
        (wait) =>
          wait.agent === agent.key &&
          wait.event === event &&
          config.agents[wait.unless].enabled,
      ),
  );
}
