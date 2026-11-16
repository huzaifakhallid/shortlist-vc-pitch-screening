import { count, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { db, single } from "../client";
import {
  createWorkspace,
  getActiveConfig,
  getUserByEmail,
  listPartnerIds,
} from "../index";
import { configVersion, membership, user, workspace } from "../schema";
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
