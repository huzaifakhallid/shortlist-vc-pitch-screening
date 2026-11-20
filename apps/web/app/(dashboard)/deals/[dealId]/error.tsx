"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DealError({ retry }: { retry: () => void }) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <p className="mb-4 text-sm">
        <Link
          href="/deals"
          className="rounded-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Deals
        </Link>
      </p>
      <div
        role="alert"
        className="flex items-center gap-4 rounded-md border border-danger/20 bg-danger-soft px-4 py-3 text-danger"
      >
        <p>Couldn&apos;t load this deal.</p>
        <Button variant="outline" size="sm" onClick={retry} className="ml-auto">
          Retry
        </Button>
      </div>
    </div>
  );
}
