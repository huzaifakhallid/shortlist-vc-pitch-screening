// The package's public surface: access functions and types only. The Drizzle
// client, schema and internal helpers stay inside (CLAUDE.md: all queries go
// through here). Coordinator-only functions live in "@shortlist/db/coordinator".
export { closeDb, withTransaction, type Tx } from "./client";
export { authAdapter, createSession } from "./access/auth";
export {
  getActiveConfig,
  saveConfigVersion,
  type ActiveConfig,
} from "./access/config";
export { insertEvent, type StoredEvent } from "./access/event";
export { listConnectedKinds } from "./access/integration";
export {
  createMembership,
  getMembership,
  listPartnerIds,
  listUserMemberships,
  type Membership,
  type UserMembership,
} from "./access/membership";
export {
  createRun,
  finishRun,
  startRun,
  type AgentRun,
  type FinishedStatus,
  type RunResult,
} from "./access/run";
export { insertStep, listSteps, type RunStep } from "./access/step";
export { createUser, getUserByEmail, type User } from "./access/user";
export {
  createWorkspace,
  getWorkspaceBySlug,
  type Workspace,
} from "./access/workspace";
