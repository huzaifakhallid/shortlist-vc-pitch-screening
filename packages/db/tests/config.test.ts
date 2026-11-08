import { ConfigValidationError } from "@shortlist/schemas";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../client";
import {
  createMembership,
  createUser,
  getActiveConfig,
  saveConfigVersion,
} from "../index";
import { configVersion } from "../schema";
import { configFor, createTestWorkspace } from "./helpers";

async function rejection(promise: Promise<unknown>) {
  const error: unknown = await promise.then(
    () => {
      throw new Error("Expected saveConfigVersion to reject");
    },
    (reason: unknown) => reason,
  );
  if (!(error instanceof ConfigValidationError)) {
    throw error;
  }
  return error.issues;
}

describe("saveConfigVersion", () => {
  it("increments the version and keeps exactly one active", async () => {
    const t = await createTestWorkspace("kestrel");
    const v1 = await saveConfigVersion(
      t.workspace.id,
      configFor(t.partner.id),
      t.partner.id,
    );
    const changed = configFor(t.partner.id);
    changed.thesis = "Seed fintech only.";
    const v2 = await saveConfigVersion(t.workspace.id, changed, t.partner.id);

    expect([v1.version, v2.version]).toEqual([1, 2]);
    const active = await db()
      .select({ id: configVersion.id })
      .from(configVersion)
      .where(
        and(
          eq(configVersion.workspaceId, t.workspace.id),
          eq(configVersion.isActive, true),
        ),
      );
    expect(active).toEqual([{ id: v2.id }]);
    expect(await getActiveConfig(t.workspace.id)).toEqual(v2);
  });

  it("rejects a config that fails the schema (stage 1)", async () => {
    const t = await createTestWorkspace("kestrel");
    const config = configFor(t.partner.id);
    config.rubric = config.rubric.map((criterion) =>
      criterion.key === "team" ? { ...criterion, weight: 99 } : criterion,
    );

    const issues = await rejection(
      saveConfigVersion(t.workspace.id, config, t.partner.id),
    );
    expect(issues).toEqual([
      { path: ["rubric"], message: "Rubric weights must sum to 100 (got 169)" },
    ]);
    await expect(getActiveConfig(t.workspace.id)).rejects.toThrow(
      `Workspace ${t.workspace.id} has no active config version`,
    );
  });

  it("rejects routing to a member who is not a partner (stage 2)", async () => {
    const t = await createTestWorkspace("kestrel");
    const analyst = await createUser({
      email: "analyst@kestrel.test",
      name: null,
    });
    await createMembership(t.workspace.id, {
      userId: analyst.id,
      role: "analyst",
    });
    const config = configFor(t.partner.id);
    config.routing.climate = analyst.id;

    const issues = await rejection(
      saveConfigVersion(t.workspace.id, config, t.partner.id),
    );
    expect(issues).toEqual([
      {
        path: ["routing", "climate"],
        message: `Routing target "${analyst.id}" is not a partner in this workspace`,
      },
    ]);
  });

  it("rejects a CRM that is not connected (stage 2)", async () => {
    const t = await createTestWorkspace("kestrel");
    const config = configFor(t.partner.id);
    config.agents.pipeline.crm = "hubspot";

    const issues = await rejection(
      saveConfigVersion(t.workspace.id, config, t.partner.id),
    );
    expect(issues).toEqual([
      {
        path: ["agents", "pipeline", "crm"],
        message: 'CRM "hubspot" is not connected',
      },
    ]);
  });
});
