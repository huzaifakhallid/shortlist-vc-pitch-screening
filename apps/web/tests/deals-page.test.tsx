import type { Role } from "@shortlist/schemas";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DealsPage from "@/app/(dashboard)/deals/page";
import { requireSession, type SessionContext } from "@/lib/session";

vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

function signedInAs(role: Role): SessionContext {
  return {
    userId: "00000000-0000-0000-0000-000000000001",
    name: "Sana Mirza",
    email: "sana.mirza@kestrel.example",
    workspaceId: "00000000-0000-0000-0000-000000000002",
    workspaceName: "Kestrel Ventures",
    role,
  };
}

describe("Deals page", () => {
  beforeEach(() => {
    vi.mocked(requireSession).mockResolvedValue(signedInAs("analyst"));
  });

  it("shows the empty state, not placeholder rows", async () => {
    const html = renderToStaticMarkup(await DealsPage());

    expect(html).toContain("<h1");
    expect(html).toContain(
      "No pitches yet. Share your pitch form or forward your deal inbox.",
    );
    expect(html).not.toContain("animate-pulse");
  });

  it("reads the session before rendering", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(DealsPage()).rejects.toThrow("NEXT_REDIRECT");
  });
});
