// Skeleton of the Deal page: header, then the two columns.
export default function DealLoading() {
  return (
    <div
      aria-label="Loading deal"
      aria-busy="true"
      className="mx-auto max-w-6xl px-6 py-8"
    >
      <div className="mb-4 h-4 w-32 animate-pulse rounded-md bg-muted" />
      <div className="flex gap-4 border-b pb-5">
        <div className="size-14 shrink-0 animate-pulse rounded-md bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-full max-w-md animate-pulse rounded-md bg-muted" />
          <div className="h-5 w-64 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-11 w-14 shrink-0 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="mt-5 grid grid-cols-1 gap-8 md:grid-cols-12">
        <div className="space-y-3 md:col-span-7">
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="h-5 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
        <div className="aspect-video animate-pulse rounded-lg bg-muted md:col-span-5" />
      </div>
    </div>
  );
}
