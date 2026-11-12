import { Suspense } from "react";
import { NavAccount } from "@/components/nav-account";
import { NavLinks } from "@/components/nav-links";
import { Wordmark } from "@/components/wordmark";

export function TopNav() {
  return (
    <header className="h-14 border-b">
      <div className="mx-auto flex h-full max-w-6xl items-center gap-8 px-6">
        <Wordmark />
        <NavLinks />
        {/* Reads the session cookie, so it streams in (cacheComponents). */}
        <Suspense fallback={null}>
          <NavAccount />
        </Suspense>
      </div>
    </header>
  );
}
