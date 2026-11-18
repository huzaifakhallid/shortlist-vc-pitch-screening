import type { Metadata } from "next";
import { Suspense } from "react";
import { PitchPageContent } from "./pitch-page-content";

export const metadata: Metadata = { title: "Submit your pitch" };

// The public pitch form (§18): no session, the workspace comes from the slug.
export default function PitchPage({ params }: PageProps<"/pitch/[slug]">) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      {/* Reads the workspace at request time. */}
      <Suspense fallback={<PitchPageSkeleton />}>
        <PitchPageContent params={params} />
      </Suspense>
      <footer className="mt-16 border-t pt-6 text-xs text-faint-foreground">
        Powered by Shortlist
      </footer>
    </main>
  );
}

function PitchPageSkeleton() {
  return (
    <div aria-label="Loading the pitch form" aria-busy="true">
      <div className="flex items-center gap-3">
        <div className="size-11 animate-pulse rounded-md bg-muted" />
        <div className="h-5 w-40 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="mt-8 h-8 w-56 animate-pulse rounded-md bg-muted" />
      <div className="mt-2 h-4 w-72 animate-pulse rounded-md bg-muted" />
      <div className="mt-8 space-y-6 border-t pt-8">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="space-y-2">
            <div className="h-4 w-32 animate-pulse rounded-md bg-muted" />
            <div className="h-8 w-full animate-pulse rounded-md bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
