import * as db from "@shortlist/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PitchPageContent } from "@/app/pitch/[slug]/pitch-page-content";
import { validConfig } from "../../../packages/schemas/tests/config.fixture";

vi.mock("@shortlist/db", () => ({
  getWorkspaceBySlug: vi.fn(),
  getActiveConfig: vi.fn(),
}));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

function workspace(synthetic: boolean): db.Workspace {
  return {
    id: "00000000-0000-4000-8000-00000000000a",
    slug: "harbor",
    name: "Harbor Capital",
    intakeAddress: "pitches+harbor@in.shortlist.dev",
    synthetic,
    createdAt: new Date(),
  };
}

async function render(slug = "harbor"): Promise<string> {
  return renderToStaticMarkup(
    await PitchPageContent({ params: Promise.resolve({ slug }) }),
  );
}

describe("Pitch page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(db.getActiveConfig).mockResolvedValue({
      id: "c1",
      version: 1,
      config: validConfig(),
    });
  });

  it("shows the fund's form with the privacy notice", async () => {
    vi.mocked(db.getWorkspaceBySlug).mockResolvedValue(workspace(false));

    const html = await render();

    expect(html).toContain("Harbor Capital");
    expect(html).toContain("<form");
    expect(html).toContain('type="file"');
    expect(html).toContain("Files are stored privately and encrypted");
    expect(html).toContain("an AI provider (Google Gemini)");
    expect(html).toContain("IP address is logged to prevent abuse");
    expect(html).toContain("Submit pitch");
  });

  it("shows no form in a synthetic workspace (the demo)", async () => {
    vi.mocked(db.getWorkspaceBySlug).mockResolvedValue(workspace(true));

    const html = await render();

    expect(html).not.toContain("<form");
    expect(html).toContain(
      "Harbor Capital isn&#x27;t taking pitches through this form right now.",
    );
  });

  it("is not found for an unknown slug", async () => {
    vi.mocked(db.getWorkspaceBySlug).mockResolvedValue(null);

    await expect(render("nope")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
