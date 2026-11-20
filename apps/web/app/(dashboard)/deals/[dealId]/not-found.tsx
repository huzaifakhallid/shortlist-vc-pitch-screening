import Link from "next/link";

export default function DealNotFound() {
  return (
    <div className="mx-auto grid max-w-6xl place-items-center gap-3 px-6 py-16 text-center">
      <p className="text-muted-foreground">
        This deal doesn&apos;t exist in your workspace.
      </p>
      <Link
        href="/deals"
        className="rounded-xs text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        Back to deals
      </Link>
    </div>
  );
}
