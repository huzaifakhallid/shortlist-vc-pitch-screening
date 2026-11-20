"use client";

import { useEffect, useRef, type ReactNode } from "react";

// j and k move focus down and up the deal rows (Enter opens one), unless
// the person is typing in a field.
export function DealListKeys({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "j" && event.key !== "k") {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      const rows = Array.from(
        ref.current?.querySelectorAll<HTMLElement>("[data-deal-row]") ?? [],
      );
      if (rows.length === 0) {
        return;
      }
      const current = rows.findIndex((row) => row === document.activeElement);
      const next =
        current === -1
          ? 0
          : Math.min(
              rows.length - 1,
              Math.max(0, current + (event.key === "j" ? 1 : -1)),
            );
      event.preventDefault();
      rows[next]?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return <div ref={ref}>{children}</div>;
}
