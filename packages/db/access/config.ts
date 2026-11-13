import {
  parseWorkspaceConfig,
  validateConfigAgainstWorkspace,
  workspaceConfigSchema,
  type WorkspaceConfig,
} from "@shortlist/schemas";
import { and, eq, max } from "drizzle-orm";
import { z } from "zod";
import { db, single, withTransaction, type Executor } from "../client";
import { configVersion, workspace } from "../schema";
import { selectConnectedKinds } from "./integration";
import { selectPartnerIds } from "./membership";

export type ActiveConfig = {
  id: string;
  version: number;
  config: WorkspaceConfig;
};

// Validates both stages (§13), then makes the new version the only active one.
export async function saveConfigVersion(
  workspaceId: string,
  input: unknown,
  createdBy: string,
): Promise<ActiveConfig> {
  const config = parseWorkspaceConfig(input);

  return withTransaction(async (tx) => {
    // Lock the workspace row so concurrent saves can't pick the same version
    // or validate against partners and integrations that are changing.
    const locked = await tx
      .select({ id: workspace.id })
      .from(workspace)
      .where(eq(workspace.id, workspaceId))
      .for("no key update");
    single(locked, `workspace ${workspaceId}`);

    validateConfigAgainstWorkspace(config, {
      partnerUserIds: new Set(await selectPartnerIds(tx, workspaceId)),
      connectedIntegrations: new Set(
        await selectConnectedKinds(tx, workspaceId),
      ),
    });

    const latest = single(
      await tx
        .select({ version: max(configVersion.version) })
        .from(configVersion)
        .where(eq(configVersion.workspaceId, workspaceId)),
      "max config version",
    );
    // The first save is version 1.
    const version = latest.version === null ? 1 : latest.version + 1;

    await tx
      .update(configVersion)
      .set({ isActive: false })
      .where(
        and(
          eq(configVersion.workspaceId, workspaceId),
          eq(configVersion.isActive, true),
        ),
      );
    const rows = await tx
      .insert(configVersion)
      .values({ workspaceId, version, config, isActive: true, createdBy })
      .returning({ id: configVersion.id, version: configVersion.version });
    const row = single(rows, `config version ${String(version)}`);
    return { id: row.id, version: row.version, config };
  });
}

export function getActiveConfig(workspaceId: string): Promise<ActiveConfig> {
  return selectActiveConfig(db(), workspaceId);
}

// Exported only from "@shortlist/db/coordinator": for reads inside a
// caller's transaction.
export async function selectActiveConfig(
  q: Executor,
  workspaceId: string,
): Promise<ActiveConfig> {
  const [row] = await q
    .select()
    .from(configVersion)
    .where(
      and(
        eq(configVersion.workspaceId, workspaceId),
        eq(configVersion.isActive, true),
      ),
    );
  if (row === undefined) {
    throw new Error(`Workspace ${workspaceId} has no active config version`);
  }
  return parseConfigRow(workspaceId, row);
}

// The version a run recorded, active or not: a run uses the config it was
// queued with.
export async function getConfigVersion(
  workspaceId: string,
  configVersionId: string,
): Promise<ActiveConfig> {
  const [row] = await db()
    .select()
    .from(configVersion)
    .where(
      and(
        eq(configVersion.workspaceId, workspaceId),
        eq(configVersion.id, configVersionId),
      ),
    );
  if (row === undefined) {
    throw new Error(
      `Config version ${configVersionId} not found in workspace ${workspaceId}`,
    );
  }
  return parseConfigRow(workspaceId, row);
}

function parseConfigRow(
  workspaceId: string,
  row: typeof configVersion.$inferSelect,
): ActiveConfig {
  const parsed = workspaceConfigSchema.safeParse(row.config);
  if (!parsed.success) {
    throw new Error(
      `Config version ${row.id} of workspace ${workspaceId} is invalid: ${z.prettifyError(parsed.error)}`,
    );
  }
  return { id: row.id, version: row.version, config: parsed.data };
}
