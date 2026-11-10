import { DealsHeader } from "./deals-header";

// Skeleton rows follow the DealRow layout: avatar, title, one-liner, tags, score.
export default function DealsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <DealsHeader />
      <section aria-label="Loading deals" aria-busy="true" className="border-t">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex gap-4 border-b py-5">
            <div className="size-11 shrink-0 animate-pulse rounded-md bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-48 animate-pulse rounded-md bg-muted" />
              <div className="h-4 w-full max-w-md animate-pulse rounded-md bg-muted" />
              <div className="h-5 w-40 animate-pulse rounded-md bg-muted" />
            </div>
            <div className="h-8 w-11 shrink-0 animate-pulse rounded-md bg-muted" />
          </div>
        ))}
      </section>
    </div>
  );
}
