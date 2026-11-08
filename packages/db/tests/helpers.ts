import type { WorkspaceConfig } from "@shortlist/schemas";
import { validConfig } from "../../schemas/tests/config.fixture";
import {
  createMembership,
  createUser,
  createWorkspace,
  saveConfigVersion,
  type ActiveConfig,
  type User,
  type Workspace,
} from "../index";
import { db, single } from "../client";
import { company, deal } from "../schema";

export type TestWorkspace = {
  workspace: Workspace;
  partner: User;
};

// A workspace with one partner member.
export async function createTestWorkspace(
  slug: string,
): Promise<TestWorkspace> {
  const workspace = await createWorkspace({
    slug,
    name: `Fund ${slug}`,
    intakeAddress: `pitches+${slug}@in.shortlist.dev`,
  });
  const partner = await createUser({
    email: `partner@${slug}.test`,
    name: "Partner",
  });
  await createMembership(workspace.id, { userId: partner.id, role: "partner" });
  return { workspace, partner };
}

// The §13 example routed to `partnerId`, with no integrations in use.
export function configFor(partnerId: string): WorkspaceConfig {
  const config = validConfig();
  config.routing = {
    fintech: partnerId,
    climate: partnerId,
    devtools: partnerId,
  };
  config.defaultPartnerId = partnerId;
  config.agents.pipeline.crm = null;
  config.agents.pipeline.slackChannel = null;
  return config;
}

export function saveTestConfig(t: TestWorkspace): Promise<ActiveConfig> {
  return saveConfigVersion(
    t.workspace.id,
    configFor(t.partner.id),
    t.partner.id,
  );
}

// No access function creates deals yet (Intake, milestone 2), so tests
// insert one directly.
export async function createTestDeal(workspaceId: string): Promise<string> {
  const companies = await db()
    .insert(company)
    .values({ workspaceId, name: "Acme", domainNormalized: "acme.test" })
    .returning({ id: company.id });
  const deals = await db()
    .insert(deal)
    .values({
      workspaceId,
      companyId: single(companies, "company").id,
      stage: "RECEIVED",
    })
    .returning({ id: deal.id });
  return single(deals, "deal").id;
}
