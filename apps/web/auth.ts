import { authAdapter } from "@shortlist/db";
import NextAuth from "next-auth";
import type { EmailConfig } from "next-auth/providers/email";
import { webEnv } from "@/lib/env";
import { sendMagicLink } from "@/lib/magic-link";
import { SESSION_MAX_AGE_SECONDS, sessionCookie } from "@/lib/session-cookie";
import { signInDecision } from "@/lib/sign-in-decision";

const CHECK_EMAIL_PATH = "/signin/check-email";
// Where a refused email is sent: the exact redirect a sent link produces
// (Auth.js's verify-request, which then shows CHECK_EMAIL_PATH), so the
// response doesn't reveal who is a member.
const REFUSED_PATH = "/api/auth/verify-request?provider=email&type=email";

// Auth.js with database sessions (§15.1). The config is built per request, so
// importing this file never needs the environment.
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const env = webEnv();

  const magicLink: EmailConfig = {
    id: "email",
    type: "email",
    name: "Email",
    // A sign-in link is valid for 15 minutes.
    maxAge: 15 * 60,
    sendVerificationRequest: ({ identifier, url }) => {
      sendMagicLink(
        { identifier, url },
        { nodeEnv: process.env.NODE_ENV, appUrl: env.APP_URL },
      );
    },
  };

  return {
    adapter: authAdapter(),
    secret: env.AUTH_SECRET,
    // Magic links are checked against APP_URL in sendMagicLink.
    trustHost: true,
    session: { strategy: "database", maxAge: SESSION_MAX_AGE_SECONDS },
    cookies: { sessionToken: sessionCookie(env.APP_URL) },
    providers: [magicLink],
    pages: {
      signIn: "/signin",
      verifyRequest: CHECK_EMAIL_PATH,
      error: "/signin",
    },
    // Auth.js reports its errors here and carries on (a failed session read
    // counts as signed out). Recorded on the server; Sentry comes later.
    logger: {
      error(error) {
        console.error(error);
      },
    },
    callbacks: {
      // Only existing workspace members sign in; nobody signs up here. Runs
      // when a link is requested and again when it is used.
      async signIn({ user }) {
        const email = user.email;
        if (typeof email !== "string") {
          throw new Error("Sign-in attempt without an email address");
        }
        if ((await signInDecision(email)) === "refuse") {
          // No address in the log: it is personal data and user input.
          console.warn("Sign-in refused: email is not a workspace member");
          return REFUSED_PATH;
        }
        return true;
      },
    },
  };
});
