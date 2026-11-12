import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { authorize } from "@/lib/authorize";
import { requireSession } from "@/lib/session";
import { DealsHeader } from "./deals-header";

export const metadata: Metadata = { title: "Deals · Shortlist" };

// Shell only: deals are read from packages/db, scoped by the session's
// workspace, once Intake creates them (milestone 2). loading.tsx is the
// Suspense boundary for the session read.
export default async function DealsPage() {
  const session = await requireSession();
  authorize(session, "deal.view");

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
