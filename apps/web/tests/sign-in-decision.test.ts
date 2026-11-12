import * as db from "@shortlist/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInDecision } from "@/lib/sign-in-decision";

vi.mock("@shortlist/db", () => ({
  getUserByEmail: vi.fn(),
  listUserMemberships: vi.fn(),
}));

const USER_ID = "00000000-0000-0000-0000-00000000000b";
const EMAIL = "sana.mirza@kestrel.example";

describe("signInDecision", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(db.getUserByEmail).mockResolvedValue({
      id: USER_ID,
      name: "Sana Mirza",
      email: EMAIL,
      emailVerified: null,
      image: null,
      createdAt: new Date(),
    });
  });

  it("refuses an unknown email without looking for memberships", async () => {
    vi.mocked(db.getUserByEmail).mockResolvedValue(null);

    expect(await signInDecision("stranger@example.com")).toBe("refuse");
    expect(db.listUserMemberships).not.toHaveBeenCalled();
  });

  it("refuses a user with no memberships", async () => {
    vi.mocked(db.listUserMemberships).mockResolvedValue([]);

    expect(await signInDecision(EMAIL)).toBe("refuse");
    expect(db.listUserMemberships).toHaveBeenCalledWith(USER_ID);
  });

  it("allows a workspace member", async () => {
    vi.mocked(db.listUserMemberships).mockResolvedValue([
      {
        workspaceId: "00000000-0000-0000-0000-00000000000a",
        workspaceSlug: "kestrel",
        workspaceName: "Kestrel Ventures",
        role: "analyst",
      },
    ]);

    expect(await signInDecision(EMAIL)).toBe("allow");
  });
});
