import { randomUUID } from "node:crypto";

// Object key layout (§15.3): workspaces/<workspaceId>/decks/<uuid>.pdf. The
// workspace id comes from the session, API key or job, and the file id is
// generated here; nothing a founder supplies (file name, form field) is ever
// part of a key.

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_PATTERN = new RegExp(`^${UUID}$`);

function assertWorkspaceId(workspaceId: string): void {
  if (!UUID_PATTERN.test(workspaceId)) {
    throw new Error("Storage: workspace id is not a lowercase UUID");
  }
}

export function newDeckKey(workspaceId: string): string {
  assertWorkspaceId(workspaceId);
  return `workspaces/${workspaceId}/decks/${randomUUID()}.pdf`;
}

// A key read or verified for a workspace must be one of its own deck keys,
// so a key from a row or job can't reach another workspace's files.
export function assertDeckKey(workspaceId: string, key: string): void {
  assertWorkspaceId(workspaceId);
  if (
    !new RegExp(`^workspaces/${workspaceId}/decks/${UUID}[.]pdf$`).test(key)
  ) {
    throw new Error("Storage: object key is not a deck key of this workspace");
  }
}
