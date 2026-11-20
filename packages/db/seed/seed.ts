import type { Role } from "@shortlist/schemas";
import {
  createMembership,
  createUser,
  createWorkspace,
  getActiveConfig,
  getUserByEmail,
  getWorkspaceBySlug,
  saveConfigVersion,
  type ActiveConfig,
  type User,
  type Workspace,
} from "../index";
import { DEMO_MEMBERS, DEMO_SLUG, type DemoMemberKey } from "./demo-members";
import { kestrelConfig } from "./kestrel-config";
import { seedDemoDeals } from "./seed-deals";

export type SeedResult = {
  status: "created" | "exists";
  workspace: Workspace;
  config: ActiveConfig;
  // Demo deals added by this run: all of them into a workspace without
  // deals, none otherwise.
  dealsAdded: number;
};

// Creates the Kestrel Ventures demo workspace once. A second run leaves an
// existing one untouched, after checking it has an active config (a run that
// failed halfway shows up here instead of being skipped silently). To recover
// from that locally, recreate the database and run db:migrate and db:seed again.
// The demo deals are added to a Kestrel workspace that has no deals yet, so
// a workspace seeded before they existed gets them too.
export async function seedDemoWorkspace(): Promise<SeedResult> {
  const existing = await getWorkspaceBySlug(DEMO_SLUG);
  if (existing !== null) {
    // Synthetic deals only ever go into a synthetic workspace (§14.4).
    if (!existing.synthetic) {
      throw new Error(
        `The ${DEMO_SLUG} workspace exists but isn't synthetic, so no demo deals were added; recreate the database and seed again`,
      );
    }
    const config = await getActiveConfig(existing.id);
    return {
      status: "exists",
      workspace: existing,
      config,
      dealsAdded: await seedDemoDeals({
        workspaceId: existing.id,
        configVersionId: config.id,
        members: await existingMembers(),
        now: new Date(),
      }),
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
  const dealsAdded = await seedDemoDeals({
    workspaceId: workspace.id,
    configVersionId: config.id,
    members: {
      amara: users.amara.id,
      daniel: users.daniel.id,
      sana: users.sana.id,
      leo: users.leo.id,
    },
    now: new Date(),
  });
  return { status: "created", workspace, config, dealsAdded };
}

async function addMember(
  workspaceId: string,
  member: { email: string; name: string; role: Role },
): Promise<User> {
  const user = await createUser({ email: member.email, name: member.name });
  await createMembership(workspaceId, { userId: user.id, role: member.role });
  return user;
}

// The demo members of an existing Kestrel workspace, by key.
async function existingMembers(): Promise<Record<DemoMemberKey, string>> {
  const id = async (key: DemoMemberKey): Promise<string> => {
    const found = await getUserByEmail(DEMO_MEMBERS[key].email);
    if (found === null) {
      throw new Error(
        `The ${DEMO_SLUG} workspace exists but its demo member ${DEMO_MEMBERS[key].email} doesn't; recreate the database and seed again`,
      );
    }
    return found.id;
  };
  return {
    amara: await id("amara"),
    daniel: await id("daniel"),
    sana: await id("sana"),
    leo: await id("leo"),
  };
}
