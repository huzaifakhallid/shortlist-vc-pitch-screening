import type { PitchForm, SubmittedDeck } from "@shortlist/schemas";

// A synthetic form pitch (fictional company).
export function formPayload(form: Partial<PitchForm> = {}): {
  form: PitchForm;
  deck: SubmittedDeck;
} {
  return {
    form: {
      companyName: "Larkspur Labs",
      website: "https://www.Larkspur.example/about",
      oneLiner: "Ledger reconciliation for small lenders",
      roundSizeUsd: 1_500_000,
      founderName: "Ana Test",
      founderEmail: "Ana@Larkspur.example",
      ...form,
    },
    deck: {
      objectKey: "workspaces/ws/decks/deck.pdf",
      etag: '"etag-1"',
      sizeBytes: 1024,
    },
  };
}
