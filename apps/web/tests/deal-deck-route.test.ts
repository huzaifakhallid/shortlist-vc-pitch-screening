import { fileURLToPath } from "node:url";
import { getDealDeck, getWorkspace, type Workspace } from "@shortlist/db";
import { DEMO_DECKS } from "@shortlist/db/demo-decks";
import type { DeckStorage } from "@shortlist/integrations/storage";
import type { Role } from "@shortlist/schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/(dashboard)/deals/[dealId]/deck/route";
import { deckStorage } from "@/lib/deck-storage";
import { requireSession, type SessionContext } from "@/lib/session";
import { readSyntheticDeck } from "@/lib/synthetic-decks";

vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));
vi.mock("@shortlist/db", () => ({
  getDealDeck: vi.fn(),
  getWorkspace: vi.fn(),
}));
vi.mock("@/lib/deck-storage", () => ({ deckStorage: vi.fn() }));
// The route reads the bundled decks from the app's working directory, which
// the tests don't run in.
vi.mock("@/lib/synthetic-decks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/synthetic-decks")>();
  return {
    ...actual,
    readSyntheticDeck: vi.fn(actual.readSyntheticDeck),
  };
});

const DECK_DIR = fileURLToPath(new URL("../synthetic-decks", import.meta.url));
const WORKSPACE_ID = "00000000-0000-4000-8000-00000000000a";
const DEAL_ID = "00000000-0000-4000-8000-0000000000d1";
const PAYLANE = {
  objectKey: `workspaces/${WORKSPACE_ID}/decks/${DEMO_DECKS.paylane.id}.pdf`,
  etag: DEMO_DECKS.paylane.etag,
};

function session(role: Role): SessionContext {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    name: "Sana Mirza",
    email: "sana.mirza@kestrel.example",
    workspaceId: WORKSPACE_ID,
    workspaceName: "Kestrel Ventures",
    role,
  };
}

function workspace(synthetic: boolean): Workspace {
  return {
    id: WORKSPACE_ID,
    slug: "kestrel",
    name: "Kestrel Ventures",
    intakeAddress: "pitches+kestrel@in.shortlist.dev",
    synthetic,
    createdAt: new Date(),
  };
}

const storage = {
  presignDeckUpload: vi.fn<DeckStorage["presignDeckUpload"]>(),
  verifyDeckUpload: vi.fn<DeckStorage["verifyDeckUpload"]>(),
  readDeck: vi.fn<DeckStorage["readDeck"]>(),
  deleteDeck: vi.fn<DeckStorage["deleteDeck"]>(),
  presignDeckView: vi.fn<DeckStorage["presignDeckView"]>(),
};

function get(dealId: string): Promise<Response> {
  return GET(new Request(`http://localhost:3000/deals/${dealId}/deck`), {
    params: Promise.resolve({ dealId }),
  });
}

describe("GET /deals/[dealId]/deck", () => {
  beforeEach(() => {
    vi.mocked(requireSession).mockResolvedValue(session("analyst"));
    vi.mocked(deckStorage).mockReturnValue(storage);
    vi.mocked(readSyntheticDeck).mockImplementation((workspaceId, deck) =>
      vi
        .importActual<typeof import("@/lib/synthetic-decks")>(
          "@/lib/synthetic-decks",
        )
        .then((actual) =>
          actual.readSyntheticDeck(workspaceId, deck, DECK_DIR),
        ),
    );
  });

  it("sends a synthetic workspace's bundled deck inline, uncached", async () => {
    vi.mocked(getDealDeck).mockResolvedValue(PAYLANE);
    vi.mocked(getWorkspace).mockResolvedValue(workspace(true));

    const response = await get(DEAL_ID);

    expect(getDealDeck).toHaveBeenCalledWith(WORKSPACE_ID, DEAL_ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const body = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(body.subarray(0, 5))).toBe("%PDF-");
    expect(storage.presignDeckView).not.toHaveBeenCalled();
  });

  it("redirects to a presigned R2 link for any other workspace", async () => {
    vi.mocked(getDealDeck).mockResolvedValue(PAYLANE);
    vi.mocked(getWorkspace).mockResolvedValue(workspace(false));
    storage.presignDeckView.mockResolvedValue("https://r2.example/deck?sig=x");

    const response = await get(DEAL_ID);

    expect(storage.presignDeckView).toHaveBeenCalledWith(
      WORKSPACE_ID,
      PAYLANE.objectKey,
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://r2.example/deck?sig=x",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(readSyntheticDeck).not.toHaveBeenCalled();
  });

  it("is a 404 for a deal without a deck, outside the workspace, or a bad id", async () => {
    vi.mocked(getDealDeck).mockResolvedValue(null);

    expect((await get(DEAL_ID)).status).toBe(404);
    expect((await get("../../etc/passwd")).status).toBe(404);
    expect(getDealDeck).toHaveBeenCalledTimes(1);
    expect(getWorkspace).not.toHaveBeenCalled();
  });

  it("reads the session before anything else", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(get(DEAL_ID)).rejects.toThrow("NEXT_REDIRECT");
    expect(getDealDeck).not.toHaveBeenCalled();
  });
});

describe("readSyntheticDeck", () => {
  const read = (deck: { objectKey: string; etag: string }) =>
    vi
      .importActual<typeof import("@/lib/synthetic-decks")>(
        "@/lib/synthetic-decks",
      )
      .then((actual) => actual.readSyntheticDeck(WORKSPACE_ID, deck, DECK_DIR));

  it("refuses a key of another workspace", async () => {
    await expect(
      read({
        ...PAYLANE,
        objectKey: PAYLANE.objectKey.replace(
          WORKSPACE_ID,
          "00000000-0000-4000-8000-00000000000b",
        ),
      }),
    ).rejects.toThrow(
      "Storage: object key is not a deck key of this workspace",
    );
  });

  it("refuses a deck that isn't bundled", async () => {
    await expect(
      read({
        ...PAYLANE,
        objectKey: `workspaces/${WORKSPACE_ID}/decks/00000000-0000-4000-8000-0000000000ee.pdf`,
      }),
    ).rejects.toThrow("No bundled synthetic deck has id");
  });

  it("refuses a bundled file that doesn't match the stored ETag", async () => {
    await expect(read({ ...PAYLANE, etag: '"0"' })).rejects.toThrow(
      "doesn't match the deck's ETag",
    );
  });
});
