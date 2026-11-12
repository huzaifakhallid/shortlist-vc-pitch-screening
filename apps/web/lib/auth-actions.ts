"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { startDemoSession } from "@/lib/demo-login";
import { webEnv } from "@/lib/env";
import { assertMagicLinksAvailable } from "@/lib/magic-link";
import { sessionCookie } from "@/lib/session-cookie";

// Server actions are POST-only and Next.js checks their Origin against the
// Host, which is the CSRF protection for all three.

const emailSchema = z.email();

export async function requestMagicLink(formData: FormData): Promise<void> {
  assertMagicLinksAvailable(process.env.NODE_ENV);
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) {
    redirect("/signin?error=InvalidEmail");
  }
  await signIn("email", { email: email.data, redirectTo: "/deals" });
}

export async function signInAsDemoPersona(formData: FormData): Promise<void> {
  const env = webEnv();
  const session = await startDemoSession(formData.get("persona"), env);
  const cookie = sessionCookie(env.APP_URL);
  (await cookies()).set(cookie.name, session.sessionToken, {
    ...cookie.options,
    expires: session.expires,
  });
  redirect("/deals");
}

export async function signOutUser(): Promise<void> {
  await signOut({ redirectTo: "/signin" });
}
