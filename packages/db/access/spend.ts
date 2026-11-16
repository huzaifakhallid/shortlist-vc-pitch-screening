import { and, eq, gte, sql } from "drizzle-orm";
import { db, single, type Executor } from "../client";
import { runStep } from "../schema";

// The workspace's model spend today, in micro-dollars: the cost of every
// step attempt (FAILED ones included) recorded since 00:00 UTC (§15.5).
export function getSpendTodayMicros(workspaceId: string): Promise<number> {
  return selectSpendTodayMicros(db(), workspaceId);
}

// Exported only from "@shortlist/db/coordinator": for reads inside a
// caller's transaction.
export async function selectSpendTodayMicros(
  q: Executor,
  workspaceId: string,
): Promise<number> {
  const rows = await q
    .select({
      // sum(bigint) is numeric, which node-postgres returns as a string.
      micros: sql<string>`coalesce(sum(${runStep.costMicros}), 0)`,
    })
    .from(runStep)
    .where(
      and(
        eq(runStep.workspaceId, workspaceId),
        gte(
          runStep.createdAt,
          sql`date_trunc('day', now() at time zone 'utc') at time zone 'utc'`,
        ),
      ),
    );
  const micros = Number(single(rows, "spend total").micros);
  if (!Number.isSafeInteger(micros)) {
    throw new Error(
      `Spend today for workspace ${workspaceId} is not a safe integer`,
    );
  }
  return micros;
}
