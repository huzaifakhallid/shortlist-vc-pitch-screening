import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

export const metadata: Metadata = { title: "Check your email · Shortlist" };

export default function CheckEmailPage() {
  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <Wordmark />
      <h1 className="mt-10 text-2xl font-semibold tracking-tight">
        Check your email
      </h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        If that address belongs to a Shortlist workspace, a sign-in link is on
        its way. It works once, for 15 minutes.
      </p>
      <p className="mt-6 text-xs text-faint-foreground">
        Running locally? The link is printed in the terminal running pnpm dev.
      </p>
      <Link
        href="/signin"
        className="mt-6 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Back to sign in
      </Link>
    </main>
  );
}
