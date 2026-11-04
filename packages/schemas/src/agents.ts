import { z } from "zod";

// One key per agent (§7). Also the keys of `agents` in the workspace config.
export const agentKeySchema = z.enum([
  "intake",
  "screening",
  "research",
  "memo",
  "comms",
  "pipeline",
  "diligence",
]);
export type AgentKey = z.infer<typeof agentKeySchema>;
