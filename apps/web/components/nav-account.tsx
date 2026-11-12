import { Button } from "@/components/ui/button";
import { signOutUser } from "@/lib/auth-actions";
import { ROLE_LABEL } from "@/lib/role-label";
import { requireSession } from "@/lib/session";

// Right side of the top nav: workspace name, the signed-in person, sign out.
export async function NavAccount() {
  const session = await requireSession();
  const displayName = session.name ?? session.email;
  const role = ROLE_LABEL[session.role];

  return (
    <div className="ml-auto flex items-center gap-3">
      <span className="hidden text-muted-foreground sm:block">
        {session.workspaceName}
      </span>
      <span
        title={`${displayName} · ${role}`}
        className="grid size-7 place-items-center rounded-full border bg-subtle text-xs font-semibold text-muted-foreground"
      >
        <span className="sr-only">
          Signed in as {displayName}, {role}
        </span>
        <span aria-hidden="true">{initials(displayName)}</span>
      </span>
      <form action={signOutUser}>
        <Button type="submit" variant="ghost" size="sm">
          Sign out
        </Button>
      </form>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
