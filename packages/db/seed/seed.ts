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
import { DEMO_MEMBERS, DEMO_SLUG, type DemoMemberKey } from "./demo-members";
import { kestrelConfig } from "./kestrel-config";

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
    // The fictional demo fund holds synthetic decks only, so a free-tier
    // Gemini key may run it (§14.4).
    synthetic: true,
  });

  const users: Record<DemoMemberKey, User> = {
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
