import type { UserMembership } from "@shortlist/db";
import { describe, expect, it } from "vitest";
import { soleMembership } from "@/lib/workspace-membership";

const USER = "00000000-0000-0000-0000-000000000001";
const kestrel: UserMembership = {
  workspaceId: "00000000-0000-0000-0000-00000000000a",
  workspaceSlug: "kestrel",
  workspaceName: "Kestrel Ventures",
  role: "partner",
};

describe("soleMembership", () => {
  it("returns the user's only membership", () => {
    expect(soleMembership(USER, [kestrel])).toBe(kestrel);
  });

  it("fails for a user with no workspace", () => {
    expect(() => soleMembership(USER, [])).toThrow(
      `User ${USER} is not a member of any workspace`,
    );
  });

  it("fails for more than one workspace until a switcher exists", () => {
    const other = { ...kestrel, workspaceSlug: "other" };
    expect(() => soleMembership(USER, [kestrel, other])).toThrow(
      `User ${USER} belongs to 2 workspaces; choosing one needs a workspace switcher, which doesn't exist yet`,
    );
  });
});
