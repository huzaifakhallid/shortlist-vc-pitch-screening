import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DEMO_DECKS } from "@shortlist/db/demo-decks";
import { describe, expect, it } from "vitest";

// The bundled PDFs must match their ETags, or the deck route refuses them.
// Regenerate with `pnpm --filter @shortlist/web decks:generate`.
describe("bundled synthetic decks", () => {
  it.each(Object.entries(DEMO_DECKS))("%s matches its ETag", (_name, deck) => {
    const bytes = readFileSync(
      new URL(`../synthetic-decks/${deck.id}.pdf`, import.meta.url),
    );
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(`"${createHash("md5").update(bytes).digest("hex")}"`).toBe(
      deck.etag,
    );
  });
});
