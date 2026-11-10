import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DealsPage from "@/app/(dashboard)/deals/page";

describe("Deals page", () => {
  it("shows the empty state, not placeholder rows", () => {
    const html = renderToStaticMarkup(<DealsPage />);

    expect(html).toContain("<h1");
    expect(html).toContain(
      "No pitches yet. Share your pitch form or forward your deal inbox.",
    );
    expect(html).not.toContain("animate-pulse");
  });
});
