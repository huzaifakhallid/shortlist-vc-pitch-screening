"use client";

import type { Citation } from "@shortlist/schemas";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

// Shared by the Deal page's citation chips and its deck viewer: a chip
// jumps the viewer to its page and shows the quoted snippet there.
type DeckState = {
  page: number;
  // The citation last chosen, shown as the highlighted quote while its page
  // is open.
  selected: Citation | null;
  showPage: (page: number) => void;
  jump: (citation: Citation) => void;
  viewerRef: RefObject<HTMLDivElement | null>;
};

const DeckContext = createContext<DeckState | null>(null);

export function DeckProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Citation | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  const showPage = useCallback((next: number) => {
    setPage(next);
  }, []);
  const jump = useCallback((citation: Citation) => {
    setPage(citation.page);
    setSelected(citation);
    // On narrow screens the viewer sits under the memo; bring it into view.
    // On wide screens it is sticky and already visible, so nothing moves.
    viewerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  const value = useMemo(
    () => ({ page, selected, showPage, jump, viewerRef }),
    [page, selected, showPage, jump],
  );
  return <DeckContext value={value}>{children}</DeckContext>;
}

export function useDeck(): DeckState {
  const state = useContext(DeckContext);
  if (state === null) {
    throw new Error("useDeck must be used inside a DeckProvider");
  }
  return state;
}
