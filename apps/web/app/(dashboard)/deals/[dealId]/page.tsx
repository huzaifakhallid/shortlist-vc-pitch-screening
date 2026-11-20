import { getDealView } from "@shortlist/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DealHeader } from "@/components/deal/deal-header";
import { ScreeningPanel } from "@/components/deal/screening-panel";
import { DeckProvider } from "@/components/deck/deck-context";
import { DeckViewer } from "@/components/deck/deck-viewer";
import { authorize } from "@/lib/authorize";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Deal · Shortlist" };

// Tabs for agents that don't have screens yet are listed but not linked
// (as in the top nav).
const LATER_TABS = ["Memo", "Research", "Diligence", "Messages", "History"];

// The Deal page (§18): Screening's result on the left, the deck on the
// right; every citation jumps the deck to its page. loading.tsx is the
// Suspense boundary for the session read.
export default async function DealPage({
  params,
}: PageProps<"/deals/[dealId]">) {
  const session = await requireSession();
  authorize(session, "deal.view");

  const { dealId } = await params;
  if (!z.uuid().safeParse(dealId).success) {
    notFound();
  }
  const deal = await getDealView(session.workspaceId, dealId);
  if (deal === null) {
    notFound();
  }
  const now = new Date();

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <nav
        aria-label="Breadcrumb"
        className="mb-4 text-sm text-faint-foreground"
      >
        <Link
          href="/deals"
          className="rounded-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Deals
        </Link>{" "}
        / <span aria-current="page">{deal.companyName}</span>
      </nav>
      <DealHeader deal={deal} now={now} />

      <DeckProvider>
        <div className="mt-5 grid grid-cols-1 gap-8 md:grid-cols-12">
          <div className="min-w-0 md:col-span-7">
            <nav
              aria-label="Deal sections"
              className="flex gap-6 overflow-x-auto border-b"
            >
              <span
                aria-current="page"
                className="-mb-px shrink-0 border-b-2 border-brand py-2 font-medium text-foreground"
              >
                Screening
              </span>
              {LATER_TABS.map((tab) => (
                <span
                  key={tab}
                  title="Coming soon"
                  className="-mb-px hidden shrink-0 border-b-2 border-transparent py-2 font-medium text-faint-foreground sm:block"
                >
                  {tab}
                </span>
              ))}
            </nav>
            <ScreeningPanel deal={deal} now={now} />
          </div>

          <div className="md:col-span-5">
            <div className="md:sticky md:top-20">
              {deal.hasDeck ? (
                <DeckViewer src={`/deals/${deal.id}/deck`} />
              ) : (
                <section aria-label="Pitch deck" className="rounded-lg border">
                  <h2 className="rounded-t-lg border-b bg-subtle px-4 py-2 font-semibold">
                    Pitch deck
                  </h2>
                  <p className="px-4 py-12 text-center text-muted-foreground">
                    No deck yet. This pitch arrived without one.
                  </p>
                </section>
              )}
            </div>
          </div>
        </div>
      </DeckProvider>
    </div>
  );
}
