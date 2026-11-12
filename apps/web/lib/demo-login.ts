import {
  createSession,
  getMembership,
  getUserByEmail,
  getWorkspaceBySlug,
} from "@shortlist/db";
import { DEMO_MEMBERS, DEMO_SLUG } from "@shortlist/db/demo";
import { z } from "zod";

// The one-click logins on the sign-in page: one persona per role (§23.1).
export const DEMO_PERSONAS = ["amara", "sana", "leo"] as const;
const demoPersonaSchema = z.enum(DEMO_PERSONAS);

// Demo sessions are short: anyone can start one on the public demo.
export const DEMO_SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

// Starts a real database session for a seeded demo persona, the same kind a
// magic link creates. Only when DEMO_LOGINS is on, and only for the fixed
// personas of the demo workspace: never an arbitrary user.
export async function startDemoSession(
  persona: unknown,
  env: { DEMO_LOGINS: boolean },
): Promise<{ sessionToken: string; expires: Date }> {
  if (!env.DEMO_LOGINS) {
    throw new Error("Demo logins are off (DEMO_LOGINS=false)");
  }
  const parsed = demoPersonaSchema.safeParse(persona);
  if (!parsed.success) {
    throw new Error(`Unknown demo persona: ${JSON.stringify(persona)}`);
  }
  const member = DEMO_MEMBERS[parsed.data];

  const workspace = await getWorkspaceBySlug(DEMO_SLUG);
  if (workspace === null) {
    throw new Error(
      `Demo workspace "${DEMO_SLUG}" not found. Run pnpm db:seed.`,
    );
  }
  const user = await getUserByEmail(member.email);
  const membership =
    user === null ? null : await getMembership(workspace.id, user.id);
  if (user === null || membership?.role !== member.role) {
    throw new Error(
      `Demo persona ${member.email} is not a ${member.role} of "${DEMO_SLUG}". Run pnpm db:seed on a fresh database.`,
    );
  }

  return createSession(
    user.id,
    new Date(Date.now() + DEMO_SESSION_MAX_AGE_SECONDS * 1000),
  );
}
