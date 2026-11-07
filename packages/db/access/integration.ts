import type { IntegrationKind } from "@shortlist/schemas";
import { and, eq } from "drizzle-orm";
import { db, type Executor } from "../client";
import { integration } from "../schema";

export function listConnectedKinds(
  workspaceId: string,
): Promise<IntegrationKind[]> {
  return selectConnectedKinds(db(), workspaceId);
}

// Not exported from the package: for reads inside an access-layer transaction.
export async function selectConnectedKinds(
  q: Executor,
  workspaceId: string,
): Promise<IntegrationKind[]> {
  const rows = await q
    .select({ kind: integration.kind })
    .from(integration)
    .where(
      and(
        eq(integration.workspaceId, workspaceId),
        eq(integration.status, "connected"),
      ),
    );
  return rows.map((row) => row.kind);
}
