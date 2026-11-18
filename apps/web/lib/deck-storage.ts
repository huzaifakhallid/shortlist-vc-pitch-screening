import {
  createDeckStorage,
  type DeckStorage,
} from "@shortlist/integrations/storage";
import { webEnv } from "@/lib/env";

let storage: DeckStorage | null = null;

// The web app's deck storage (R2), created on first use from the web env.
export function deckStorage(): DeckStorage {
  storage ??= createDeckStorage(webEnv());
  return storage;
}
