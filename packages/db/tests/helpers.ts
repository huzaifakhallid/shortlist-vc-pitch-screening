import type { WorkspaceConfig } from "@shortlist/schemas";
import { asc, eq } from "drizzle-orm";
import { validConfig } from "../../schemas/tests/config.fixture";
import {
  createMembership,
  createUser,
  createWorkspace,
  saveConfigVersion,
  type ActiveConfig,
  type AgentRun,
  type User,
  type Workspace,
} from "../index";
import { db, single } from "../client";
import { agentRun, company, deal, event, runStep } from "../schema";

export type TestWorkspace = {
  workspace: Workspace;
  partner: User;
};

// A workspace with one partner member. Not synthetic unless asked.
export async function createTestWorkspace(
  slug: string,
  options: { synthetic: boolean } = { synthetic: false },
): Promise<TestWorkspace> {
  const workspace = await createWorkspace({
    slug,
    name: `Fund ${slug}`,
    intakeAddress: `pitches+${slug}@in.shortlist.dev`,
    synthetic: options.synthetic,
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

// No access function lists runs yet (run inspector, milestone 5).
export async function listTestRuns(workspaceId: string): Promise<AgentRun[]> {
  return db()
    .select()
    .from(agentRun)
    .where(eq(agentRun.workspaceId, workspaceId))
    .orderBy(asc(agentRun.createdAt));
}

// The raw row, with the coordinator's fields StoredEvent leaves out.
export async function getTestEventRow(
  eventId: string,
): Promise<typeof event.$inferSelect> {
  const rows = await db().select().from(event).where(eq(event.id, eventId));
  return single(rows, `event ${eventId}`);
}

// Model spend recorded in the workspace: one finished step costing
// `costMicros` at `at` (now by default), on its own already-processed event
// and run, so the coordinator doesn't claim it. Inserted directly, because
// run_step.created_at is always now() through the access layer.
export async function recordTestSpend(
  workspaceId: string,
  configVersionId: string,
  costMicros: number,
  at?: Date,
): Promise<void> {
  const events = await db()
    .insert(event)
    .values({
      workspaceId,
      type: "email.received",
      payload: {},
      processedAt: new Date(),
    })
    .returning({ id: event.id });
  const runs = await db()
    .insert(agentRun)
    .values({
      workspaceId,
      agent: "intake",
      triggerEventId: single(events, "event").id,
      configVersionId,
      status: "SUCCEEDED",
    })
    .returning({ id: agentRun.id });
  await db()
    .insert(runStep)
    .values({
      workspaceId,
      runId: single(runs, "run").id,
      step: "spend",
      status: "SUCCEEDED",
      tokensIn: 0,
      tokensOut: 0,
      costMicros,
      ...(at === undefined ? {} : { createdAt: at }),
    });
}
