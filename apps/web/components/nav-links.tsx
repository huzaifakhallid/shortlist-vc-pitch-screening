"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Items from the ui-design-system TopNav spec. Screens without a route yet
// are listed but not linked.
const ITEMS: { label: string; href: string | null }[] = [
  { label: "Deals", href: "/deals" },
  { label: "Approvals", href: null },
  { label: "Agents", href: null },
  { label: "Settings", href: null },
];

const item =
  "-mb-px flex h-full items-center border-b-2 border-transparent font-medium";

export function NavLinks() {
  return <NavItems pathname={usePathname()} />;
}

// The links before the path is known (prerendered shell of a dynamic
// route): none is marked active until NavLinks streams in.
export function NavLinksFallback() {
  return <NavItems pathname={null} />;
}

function NavItems({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Main" className="flex h-full gap-6">
      {ITEMS.map(({ label, href }) => {
        if (href === null) {
          return (
            <span
              key={label}
              title="Coming soon"
              className={cn(item, "hidden text-faint-foreground sm:flex")}
            >
              {label}
            </span>
          );
        }
        const active =
          pathname !== null &&
          (pathname === href || pathname.startsWith(href + "/"));
        return (
          <Link
            key={label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              item,
              "rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-brand text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
