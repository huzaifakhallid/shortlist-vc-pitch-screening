"use client";

import { Button } from "@/components/ui/button";

export default function PitchError({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">
        Submit your pitch
      </h1>
      <div
        role="alert"
        className="mt-8 flex items-center gap-4 rounded-md border border-danger/20 bg-danger-soft px-4 py-3 text-danger"
      >
        <p>Couldn&apos;t load the pitch form.</p>
        <Button variant="outline" size="sm" onClick={retry} className="ml-auto">
          Retry
        </Button>
      </div>
    </main>
  );
}
