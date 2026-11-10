import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { DealsHeader } from "./deals-header";

export const metadata: Metadata = { title: "Deals · Shortlist" };

// Shell only: deals are read from packages/db once auth gives us a workspace.
export default function DealsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <DealsHeader />
      <section aria-label="Deals" className="border-t">
        <EmptyState>
          No pitches yet. Share your pitch form or forward your deal inbox.
        </EmptyState>
      </section>
    </div>
  );
}
