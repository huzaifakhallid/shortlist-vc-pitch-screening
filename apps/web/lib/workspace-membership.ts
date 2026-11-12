import type { UserMembership } from "@shortlist/db";

// Picks the workspace a signed-in user works in. The design has no workspace
// switcher yet, so exactly one membership is required; more than one fails
// with a specific error until a switcher exists.
export function soleMembership(
  userId: string,
  memberships: readonly UserMembership[],
): UserMembership {
  const [first, ...rest] = memberships;
  if (first === undefined) {
    throw new Error(`User ${userId} is not a member of any workspace`);
  }
  if (rest.length > 0) {
    throw new Error(
      `User ${userId} belongs to ${String(memberships.length)} workspaces; choosing one needs a workspace switcher, which doesn't exist yet`,
    );
  }
  return first;
}
