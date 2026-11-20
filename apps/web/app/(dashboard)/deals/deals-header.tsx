import type { ReactNode } from "react";

export function DealsHeader({
  subtitle = "Every pitch your fund receives, ranked against your focus.",
  actions,
}: {
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight">Deals</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {actions}
    </header>
  );
}
