import type { Role } from "@shortlist/schemas";
import {
  createMembership,
  createUser,
  createWorkspace,
  getActiveConfig,
  getWorkspaceBySlug,
  saveConfigVersion,
  type ActiveConfig,
  type User,
  type Workspace,
} from "../index";
import { kestrelConfig } from "./kestrel-config";

export const DEMO_SLUG = "kestrel";

// Fictional people, one per §6 role, plus a second partner so routing splits.
const DEMO_MEMBERS = {
  amara: {
    email: "amara.qureshi@kestrel.example",
    name: "Amara Qureshi",
    role: "partner",
  },
  daniel: {
    email: "daniel.okafor@kestrel.example",
    name: "Daniel Okafor",
    role: "partner",
  },
  sana: {
    email: "sana.mirza@kestrel.example",
    name: "Sana Mirza",
    role: "analyst",
  },
  leo: {
    email: "leo.varga@kestrel.example",
    name: "Leo Varga",
    role: "admin",
  },
} as const satisfies Record<
  string,
  { email: string; name: string; role: Role }
>;

export type SeedResult = {
  status: "created" | "exists";
  workspace: Workspace;
  config: ActiveConfig;
};

// Creates the Kestrel Ventures demo workspace once. A second run leaves an
// existing one untouched, after checking it has an active config (a run that
// failed halfway shows up here instead of being skipped silently). To recover
// from that locally, recreate the database and run db:migrate and db:seed again.
export async function seedDemoWorkspace(): Promise<SeedResult> {
  const existing = await getWorkspaceBySlug(DEMO_SLUG);
  if (existing !== null) {
    return {
      status: "exists",
      workspace: existing,
      config: await getActiveConfig(existing.id),
    };
  }

  const workspace = await createWorkspace({
    slug: DEMO_SLUG,
    name: "Kestrel Ventures",
    intakeAddress: `pitches+${DEMO_SLUG}@in.shortlist.dev`,
  });

  const users: Record<keyof typeof DEMO_MEMBERS, User> = {
    amara: await addMember(workspace.id, DEMO_MEMBERS.amara),
    daniel: await addMember(workspace.id, DEMO_MEMBERS.daniel),
    sana: await addMember(workspace.id, DEMO_MEMBERS.sana),
    leo: await addMember(workspace.id, DEMO_MEMBERS.leo),
  };

  const config = await saveConfigVersion(
    workspace.id,
    kestrelConfig({
      fintechAndDevtools: users.amara.id,
      climate: users.daniel.id,
    }),
    users.leo.id,
  );
  return { status: "created", workspace, config };
}

async function addMember(
  workspaceId: string,
  member: { email: string; name: string; role: Role },
): Promise<User> {
  const user = await createUser({ email: member.email, name: member.name });
  await createMembership(workspaceId, { userId: user.id, role: member.role });
  return user;
}
