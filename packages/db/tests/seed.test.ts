import { count, eq, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { db, single } from "../client";
import {
  createWorkspace,
  getActiveConfig,
  getUserByEmail,
  listPartnerIds,
} from "../index";
import {
  agentRun,
  configVersion,
  deal,
  event,
  membership,
  stageTransition,
  user,
  workspace,
} from "../schema";
import { DEMO_DEALS } from "../seed/demo-deals";
import { DEMO_SLUG } from "../seed/demo-members";
import { seedDemoWorkspace } from "../seed/seed";

async function userId(email: string): Promise<string> {
  const found = await getUserByEmail(email);
  if (found === null) {
    throw new Error(`Seed did not create ${email}`);
  }
  return found.id;
}

async function rowCount(table: PgTable) {
  return single(await db().select({ n: count() }).from(table), "count").n;
}

describe("seedDemoWorkspace", () => {
  it("creates Kestrel Ventures with members and config v1, integrations off", async () => {
    const result = await seedDemoWorkspace();

    expect(result.status).toBe("created");
    expect(result.workspace).toMatchObject({
      slug: DEMO_SLUG,
      name: "Kestrel Ventures",
      // Synthetic data only, so a free-tier Gemini key may run it (§14.4).
      synthetic: true,
    });
    const active = await getActiveConfig(result.workspace.id);
    expect(active.version).toBe(1);
    expect(active.config.dailySpendCapMicros).toBe(5_000_000);
    expect(active.config.agents.pipeline.crm).toBeNull();
    expect(active.config.agents.pipeline.slackChannel).toBeNull();

    const amara = await userId("amara.qureshi@kestrel.example");
    const daniel = await userId("daniel.okafor@kestrel.example");
    expect(active.config.routing).toEqual({
      fintech: amara,
      climate: daniel,
      devtools: amara,
    });
    expect(active.config.defaultPartnerId).toBe(amara);
    expect((await listPartnerIds(result.workspace.id)).toSorted()).toEqual(
      [amara, daniel].toSorted(),
    );

    const roles = await db()
      .select({ email: user.email, role: membership.role })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .where(eq(membership.workspaceId, result.workspace.id))
      .orderBy(user.email);
    expect(roles).toEqual([
      { email: "amara.qureshi@kestrel.example", role: "partner" },
      { email: "daniel.okafor@kestrel.example", role: "partner" },
      { email: "leo.varga@kestrel.example", role: "admin" },
      { email: "sana.mirza@kestrel.example", role: "analyst" },
    ]);
  });

  it("leaves an existing demo workspace unchanged on a second run", async () => {
    const first = await seedDemoWorkspace();
    const second = await seedDemoWorkspace();

    expect(second.status).toBe("exists");
    expect(second.workspace.id).toBe(first.workspace.id);
    expect(second.config).toEqual(first.config);
    expect(await rowCount(workspace)).toBe(1);
    expect(await rowCount(user)).toBe(4);
    expect(await rowCount(membership)).toBe(4);
    expect(await rowCount(configVersion)).toBe(1);
    expect(first.dealsAdded).toBe(DEMO_DEALS.length);
    expect(second.dealsAdded).toBe(0);
    expect(await rowCount(deal)).toBe(DEMO_DEALS.length);
  });

  it("seeds the demo deals across stages, with processed events only", async () => {
    const { workspace: ws } = await seedDemoWorkspace();

    const stages = await db()
      .select({ stage: deal.stage })
      .from(deal)
      .where(eq(deal.workspaceId, ws.id));
    expect(stages.map((d) => d.stage).toSorted()).toEqual(
      [
        "FIRST_CALL",
        "NEEDS_REVIEW",
        "OUT_OF_MANDATE",
        "OUT_OF_MANDATE",
        "RECEIVED",
        "RECEIVED",
        "SCREENED",
        "SCREENED",
        "SCREENED",
      ].toSorted(),
    );
    // One Screening run per deal with a deck; none for the deal without.
    expect(await rowCount(agentRun)).toBe(8);
    expect(await rowCount(stageTransition)).toBe(1);
    const unprocessed = (
      await db().select({ processedAt: event.processedAt }).from(event)
    ).filter((e) => e.processedAt === null);
    expect(unprocessed).toEqual([]);
  });

  it("adds the demo deals to an existing workspace without deals", async () => {
    await seedDemoWorkspace();
    await db().delete(stageTransition);
    await db().delete(agentRun);
    await db().delete(event);
    await db().execute(sql`truncate submission, deal, company cascade`);

    const again = await seedDemoWorkspace();

    expect(again.status).toBe("exists");
    expect(again.dealsAdded).toBe(DEMO_DEALS.length);
  });

  it("adds no demo deals to an existing kestrel workspace that isn't synthetic", async () => {
    await createWorkspace({
      slug: DEMO_SLUG,
      name: "Kestrel Ventures",
      intakeAddress: `pitches+${DEMO_SLUG}@in.shortlist.dev`,
      synthetic: false,
    });

    await expect(seedDemoWorkspace()).rejects.toThrow(/isn't synthetic/);
    expect(await rowCount(deal)).toBe(0);
  });

  it("fails loudly when an earlier run stopped before saving the config", async () => {
    await createWorkspace({
      slug: DEMO_SLUG,
      name: "Kestrel Ventures",
      intakeAddress: `pitches+${DEMO_SLUG}@in.shortlist.dev`,
      synthetic: true,
    });

    await expect(seedDemoWorkspace()).rejects.toThrow(
      /no active config version/,
    );
  });
});
