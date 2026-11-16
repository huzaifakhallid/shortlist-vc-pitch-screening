import { agentRegistry } from "@shortlist/agents-shared";

// The agents this worker runs; the coordinator queues runs for these only.
// Empty until milestone 2 adds Intake and Screening, so no runs are created.
export const registry = agentRegistry([]);
