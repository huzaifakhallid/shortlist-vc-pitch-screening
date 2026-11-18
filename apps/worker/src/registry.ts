import { intake } from "@shortlist/agents-intake";
import { agentRegistry } from "@shortlist/agents-shared";

// The agents this worker runs. Every agent a workspace enables must be here:
// the coordinator fails an event's dispatch when one that takes it isn't.
// Intake takes the form channel only; Screening and the rest follow.
export const registry = agentRegistry([intake]);
