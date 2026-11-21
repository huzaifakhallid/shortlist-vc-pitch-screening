import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DealDeck } from "@shortlist/db";
import { syntheticDeckById } from "@shortlist/db/demo-decks";
import { assertDeckKey } from "@shortlist/integrations/storage";

// Decks in a synthetic workspace (the demo fund) are the bundled synthetic
// decks in apps/web/synthetic-decks/<id>.pdf, written by
// scripts/generate-synthetic-decks.ts; nothing of theirs is in R2. The deck
// route serves them from here after authorization, and serves every other
// workspace's decks through 60-second presigned R2 links (§15.3). Which one
// is decided by workspace.synthetic, never by trying one and then the other.

// `next dev` and `next start` run in apps/web.
export const SYNTHETIC_DECK_DIR = path.join(process.cwd(), "synthetic-decks");

export class SyntheticDeckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyntheticDeckError";
  }
}

// The bundled PDF for a synthetic workspace's deck, checked against the
// deck's stored ETag (the MD5 R2 would give it), so the file shown is the one
// the seeded Screening run cites.
export async function readSyntheticDeck(
  workspaceId: string,
  deck: DealDeck,
  dir: string = SYNTHETIC_DECK_DIR,
): Promise<Uint8Array> {
  // workspaces/<workspaceId>/decks/<file id>.pdf, the storage key rule.
  assertDeckKey(workspaceId, deck.objectKey);
  const fileId = path.posix.basename(deck.objectKey, ".pdf");
  const bundled = syntheticDeckById(fileId);
  if (bundled === null) {
    throw new SyntheticDeckError(`No bundled synthetic deck has id ${fileId}`);
  }
  const bytes = await readFile(path.join(dir, `${bundled.id}.pdf`));
  const etag = `"${createHash("md5").update(bytes).digest("hex")}"`;
  if (etag !== deck.etag) {
    throw new SyntheticDeckError(
      `Bundled synthetic deck ${fileId} doesn't match the deck's ETag; regenerate it (scripts/generate-synthetic-decks.ts)`,
    );
  }
  return bytes;
}
