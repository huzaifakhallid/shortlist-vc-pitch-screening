"use client";

import { Button } from "@/components/ui/button";
import { DealsHeader } from "./deals-header";

export default function DealsError({ retry }: { retry: () => void }) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <DealsHeader />
      <div
        role="alert"
        className="flex items-center gap-4 rounded-md border border-danger/20 bg-danger-soft px-4 py-3 text-danger"
      >
        <p>Couldn&apos;t load deals.</p>
        <Button variant="outline" size="sm" onClick={retry} className="ml-auto">
          Retry
        </Button>
      </div>
    </div>
  );
}
