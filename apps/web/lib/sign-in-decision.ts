import { getUserByEmail, listUserMemberships } from "@shortlist/db";

// Who may sign in by email: only existing members of a workspace. Nobody
// signs up here, so an unknown email never creates a user.
export async function signInDecision(
  email: string,
): Promise<"allow" | "refuse"> {
  const user = await getUserByEmail(email);
  if (user === null) {
    return "refuse";
  }
  const memberships = await listUserMemberships(user.id);
  return memberships.length > 0 ? "allow" : "refuse";
}
