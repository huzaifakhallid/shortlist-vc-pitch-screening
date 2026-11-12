import type { Metadata } from "next";
import { Suspense } from "react";
import { Wordmark } from "@/components/wordmark";
import { SignInForms } from "./sign-in-forms";

export const metadata: Metadata = { title: "Sign in · Shortlist" };

export default function SignInPage({ searchParams }: PageProps<"/signin">) {
  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <Wordmark />
      <h1 className="mt-10 text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        We&apos;ll email you a link to sign in. No password needed.
      </p>
      {/* Reads the query and the environment at request time. */}
      <Suspense fallback={null}>
        <SignInForms searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
