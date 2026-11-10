import type { ReactNode } from "react";

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="grid place-items-center py-16 text-center">
      <p className="max-w-sm text-muted-foreground">{children}</p>
    </div>
  );
}
