import { NavLinks } from "@/components/nav-links";

// Placeholder until auth (milestone 1, step 6) puts the workspace in the session.
const WORKSPACE_NAME = "Your workspace";

export function TopNav() {
  return (
    <header className="h-14 border-b">
      <div className="mx-auto flex h-full max-w-6xl items-center gap-8 px-6">
        <span className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
          <span aria-hidden="true" className="size-2 rounded-full bg-brand" />
          Shortlist
        </span>
        <NavLinks />
        <span className="ml-auto hidden text-muted-foreground sm:block">
          {WORKSPACE_NAME}
        </span>
      </div>
    </header>
  );
}
