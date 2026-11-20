import { listDeals } from "@shortlist/db";
import type { Role } from "@shortlist/schemas";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DealsPage from "@/app/(dashboard)/deals/page";
import { requireSession, type SessionContext } from "@/lib/session";
import { demoDealViews } from "./deal-fixtures";

vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));
vi.mock("@shortlist/db", () => ({ listDeals: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

const WORKSPACE_ID = "00000000-0000-0000-0000-000000000002";

function signedInAs(role: Role): SessionContext {
  return {
    userId: "00000000-0000-0000-0000-000000000001",
    name: "Sana Mirza",
    email: "sana.mirza@kestrel.example",
    workspaceId: WORKSPACE_ID,
    workspaceName: "Kestrel Ventures",
    role,
  };
}

async function render(query: Record<string, string | string[]> = {}) {
  return renderToStaticMarkup(
    await DealsPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve(query),
    }),
  );
}

describe("Deals page", () => {
  beforeEach(() => {
    vi.mocked(requireSession).mockResolvedValue(signedInAs("analyst"));
    vi.mocked(listDeals).mockResolvedValue(demoDealViews());
  });

  it("shows the empty state, not placeholder rows, when there are no deals", async () => {
    vi.mocked(listDeals).mockResolvedValue([]);

    const html = await render();

    expect(html).toContain("<h1");
    expect(html).toContain(
      "No pitches yet. Share your pitch form or forward your deal inbox.",
    );
    expect(html).not.toContain("animate-pulse");
  });

  it("lists the session workspace's shortlisted deals as linked rows", async () => {
    const html = await render();

    expect(listDeals).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(html.match(/data-deal-row/g)).toHaveLength(4);
    expect(html).toContain("Paylane");
    expect(html).toContain(
      'href="/deals/00000000-0000-4000-8000-000000000001"',
    );
    expect(html).toContain("Pakistan");
    expect(html).toContain("$1.5M round");
    expect(html).not.toContain("Harborline");
    // Flags on the rows that have them.
    expect(html).toContain("Hidden text");
    expect(html).toContain("Numbers don&#x27;t match");
  });

  it("shows tabs with counts, filters and the search box", async () => {
    const html = await render({ tab: "outside" });

    expect(html).toMatch(/aria-current="page"[^>]*>Outside focus<span[^>]*>2</);
    expect(html).toContain("Coinmint");
    expect(html).toContain('aria-label="Filters"');
    expect(html).toContain("Search companies or founders");
    expect(html).toContain('<input type="hidden" name="tab" value="outside"/>');
  });

  it("says plainly when the filters match nothing", async () => {
    const html = await render({ q: "no such company" });

    expect(html).toContain("No deals match this search and these filters.");
    expect(html).toContain("Clear search and filters");
  });

  it("explains a filter link it doesn't recognise", async () => {
    const html = await render({ flag: "spam" });

    expect(html).toContain(
      "This link has filters Shortlist doesn&#x27;t recognise.",
    );
    expect(listDeals).not.toHaveBeenCalled();
  });

  it("reads the session before rendering", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(render()).rejects.toThrow("NEXT_REDIRECT");
    expect(listDeals).not.toHaveBeenCalled();
  });
});
