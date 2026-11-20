"use client";

import { useRouter } from "next/navigation";
import { useId, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";

// One sidebar filter value. Checking it goes to `href`, the list with this
// value toggled; the server renders the filtered list.
export function FilterOption({
  label,
  count,
  checked,
  href,
}: {
  label: string;
  count: number;
  checked: boolean;
  href: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const id = useId();

  return (
    <div className="flex items-center gap-2 py-1">
      <Checkbox
        id={id}
        checked={checked}
        disabled={pending}
        onCheckedChange={() => {
          startTransition(() => {
            router.replace(href, { scroll: false });
          });
        }}
      />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer truncate">
        {label}
      </label>
      <span className="tabular text-xs text-faint-foreground">{count}</span>
    </div>
  );
}
