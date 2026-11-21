import { getDealDeck, getWorkspace } from "@shortlist/db";
import { z } from "zod";
import { authorize } from "@/lib/authorize";
import { deckStorage } from "@/lib/deck-storage";
import { requireSession } from "@/lib/session";
import { readSyntheticDeck } from "@/lib/synthetic-decks";

// GET /deals/[dealId]/deck: the deal's deck for the Deal page's viewer
// (§15.3: no file has a public URL; viewing is authorized first). The
// session's workspace scopes the lookup, so another workspace's deal is a
// plain 404. A synthetic workspace's deck is a bundled synthetic PDF, sent
// from here; any other deck is a redirect to a 60-second presigned R2 GET.
// Nothing is cached: the response belongs to this session.
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function dealDeckResponse(dealId: string): Promise<Response> {
  const session = await requireSession();
  authorize(session, "deal.view");

  if (!z.uuid().safeParse(dealId).success) {
    return notFound();
  }
  const deck = await getDealDeck(session.workspaceId, dealId);
  if (deck === null) {
    return notFound();
  }

  const workspace = await getWorkspace(session.workspaceId);
  if (workspace.synthetic) {
    const bytes = await readSyntheticDeck(session.workspaceId, deck);
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...NO_STORE,
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="deck.pdf"',
        "X-Content-Type-Options": "nosniff",
        // Opened directly, the PDF runs in a sandbox: no scripts, no origin.
        "Content-Security-Policy": "sandbox",
      },
    });
  }
  const url = await deckStorage().presignDeckView(
    session.workspaceId,
    deck.objectKey,
  );
  return new Response(null, {
    status: 303,
    headers: { ...NO_STORE, Location: url },
  });
}

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: NO_STORE });
}
