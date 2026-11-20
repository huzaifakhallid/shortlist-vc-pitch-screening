import { getDealView } from "@shortlist/db";
import type { Role } from "@shortlist/schemas";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DealPage from "@/app/(dashboard)/deals/[dealId]/page";
import { requireSession, type SessionContext } from "@/lib/session";
import { demoDealView } from "./deal-fixtures";

vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));
vi.mock("@shortlist/db", () => ({ getDealView: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

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

async function renderDeal(company: string) {
  const deal = demoDealView(company);
  vi.mocked(getDealView).mockResolvedValue(deal);
  const html = renderToStaticMarkup(
    await DealPage({
      params: Promise.resolve({ dealId: deal.id }),
      searchParams: Promise.resolve({}),
    }),
  );
  return { deal, html };
}

describe("Deal page", () => {
  beforeEach(() => {
    vi.mocked(requireSession).mockResolvedValue(signedInAs("analyst"));
  });

  it("shows the header, mandate, scores and facts with citation chips", async () => {
    const { deal, html } = await renderDeal("Paylane");

    expect(getDealView).toHaveBeenCalledWith(WORKSPACE_ID, deal.id);
    expect(html).toContain("<h1");
    expect(html).toContain("Paylane");
    expect(html).toContain("First call");
    expect(html).toContain(">88<");
    expect(html).toContain("Inside your focus");
    expect(html).toContain(
      "Round size $1,500,000 is within the fund&#x27;s range of $250,000 to $3,000,000",
    );
    // Rubric labels and weights from the run's config.
    expect(html).toContain("Product &amp; edge");
    expect(html).toContain("Weight 30% · high confidence");
    expect(html).toContain("Live with 14 factories and 9,200 workers.");
    // Citations are buttons that jump the deck viewer.
    expect(html).toContain(
      'aria-label="Show page 5: &quot;$38k monthly revenue in September 2026.&quot;"',
    );
    expect(html).toContain("AI draft");
    expect(html).toContain("config v1");
    // The deck viewer loads the deck through the authorized route.
    expect(html).toContain('aria-label="Pitch deck"');
  });

  it("flags hidden text and mismatched numbers", async () => {
    const hidden = await renderDeal("Tallyfold");
    expect(hidden.html).toContain("Hidden text on page 5");
    expect(hidden.html).toContain("View page 5");

    const mismatch = await renderDeal("Driftcode");
    expect(mismatch.html).toContain(
      "Numbers don&#x27;t match: the form says a $600k round; the deck says $900k.",
    );
  });

  it("shows why a deal is outside the focus, without scores", async () => {
    const { html } = await renderDeal("Harborline");

    expect(html).toContain("Outside your focus");
    expect(html).toContain(
      "Country &quot;GB&quot; is not in the fund&#x27;s country list (PK, AE, SA)",
    );
    expect(html).not.toContain('id="scores-heading"');
  });

  it("shows a failed Screening run plainly", async () => {
    const { html } = await renderDeal("Brightpour");

    expect(html).toContain(
      "Screening couldn&#x27;t finish this deck, so it has no scores yet.",
    );
    expect(html).toContain(
      "Rubric scores are invalid after one corrective retry",
    );
  });

  it("explains a pitch without a deck and shows no viewer", async () => {
    const { html } = await renderDeal("Quillstack");

    expect(html).toContain(
      "This pitch arrived without a deck, so it hasn&#x27;t been screened.",
    );
    expect(html).toContain("No deck yet. This pitch arrived without one.");
    expect(html).not.toContain("Deck pages");
  });

  it("is not found for an id that isn't a deal of the workspace", async () => {
    vi.mocked(getDealView).mockResolvedValue(null);
    await expect(
      DealPage({
        params: Promise.resolve({
          dealId: "00000000-0000-4000-8000-0000000000aa",
        }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    await expect(
      DealPage({
        params: Promise.resolve({ dealId: "not-a-uuid" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getDealView).toHaveBeenCalledTimes(1);
  });

  it("reads the session before anything else", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(
      DealPage({
        params: Promise.resolve({
          dealId: "00000000-0000-4000-8000-0000000000aa",
        }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(getDealView).not.toHaveBeenCalled();
  });
});
