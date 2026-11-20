import type { ReactNode } from "react";

// ui-design-system Banner: one sentence and at most one action, for an
// integrity flag, a mismatch or a failure.
export function Banner({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-danger/20 bg-danger-soft px-4 py-3 text-danger"
    >
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}
