import { DEMO_MEMBERS } from "@shortlist/db/demo";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { requestMagicLink, signInAsDemoPersona } from "@/lib/auth-actions";
import { DEMO_PERSONAS } from "@/lib/demo-login";
import { webEnv } from "@/lib/env";
import { magicLinksAvailable } from "@/lib/magic-link";
import { ROLE_LABEL } from "@/lib/role-label";

// Auth.js error codes (pages.error) plus our own, in plain words.
const ERRORS: Partial<Record<string, string>> = {
  InvalidEmail: "Enter a valid email address.",
  Verification:
    "That sign-in link has expired or was already used. Ask for a new one.",
};
const DEFAULT_ERROR = "Couldn't sign you in. Try again.";

export async function SignInForms({
  searchParams,
}: {
  searchParams: PageProps<"/signin">["searchParams"];
}) {
  // Already signed in: straight to the dashboard. Request time only, as in
  // requireSession.
  await connection();
  if ((await auth())?.user?.id !== undefined) {
    redirect("/deals");
  }
  const { error } = await searchParams;
  const errorCode = typeof error === "string" ? error : null;
  const { DEMO_LOGINS: demoLogins } = webEnv();

  return (
    <>
      {errorCode !== null && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-danger/20 bg-danger-soft px-4 py-3 text-danger"
        >
          {ERRORS[errorCode] ?? DEFAULT_ERROR}
        </div>
      )}

      {magicLinksAvailable(process.env.NODE_ENV) && (
        <form action={requestMagicLink} className="mt-6 space-y-3">
          <label htmlFor="email" className="block text-sm font-medium">
            Work email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" className="w-full">
            Email me a sign-in link
          </Button>
        </form>
      )}

      {demoLogins && (
        <section aria-labelledby="demo-heading" className="mt-10 border-t pt-6">
          <h2 id="demo-heading" className="text-base font-semibold">
            Try the demo
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Kestrel Ventures is a fictional fund with synthetic pitches.
          </p>
          <ul className="mt-4">
            {DEMO_PERSONAS.map((key) => {
              const member = DEMO_MEMBERS[key];
              const role = ROLE_LABEL[member.role];
              return (
                <li
                  key={key}
                  className="flex items-center gap-4 border-b py-3 last:border-b-0"
                >
                  <div className="flex-1">
                    <p className="font-medium">{member.name}</p>
                    <p className="text-xs text-faint-foreground">{role}</p>
                  </div>
                  <form action={signInAsDemoPersona}>
                    <input type="hidden" name="persona" value={key} />
                    <Button type="submit" variant="outline" size="sm">
                      Sign in as {role.toLowerCase()}
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
