import type { ReactNode } from "react";

// ui-design-system Tag: a quiet pill for stage, sector, place and round.
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border bg-subtle px-2 py-0.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </span>
  );
}
