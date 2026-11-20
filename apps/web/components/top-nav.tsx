import { Suspense } from "react";
import { NavAccount } from "@/components/nav-account";
import { NavLinks, NavLinksFallback } from "@/components/nav-links";
import { Wordmark } from "@/components/wordmark";

export function TopNav() {
  return (
    <header className="h-14 border-b">
      <div className="mx-auto flex h-full max-w-6xl items-center gap-8 px-6">
        <Wordmark />
        {/* The path is request data on dynamic routes (/deals/[dealId]). */}
        <Suspense fallback={<NavLinksFallback />}>
          <NavLinks />
        </Suspense>
        {/* Reads the session cookie, so it streams in (cacheComponents). */}
        <Suspense fallback={null}>
          <NavAccount />
        </Suspense>
      </div>
    </header>
  );
}
