import { agentRegistry } from "@shortlist/agents-shared";

// The agents this worker runs. Every agent a workspace enables must be here:
// the coordinator fails an event's dispatch when one that takes it isn't.
// Empty until milestone 2 adds Intake and Screening.
export const registry = agentRegistry([]);
