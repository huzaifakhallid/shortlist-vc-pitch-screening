import { sql } from "drizzle-orm";
import { db, single } from "../client";
import { rateLimitWindow } from "../schema";

// Counts one request in the workspace's bucket for the current fixed window
// (database clock) and says whether it is within `limit` (§15.5). Requests
// over the limit are counted too.
export async function consumeRateLimit(
  workspaceId: string,
  bucket: string,
  rule: { limit: number; windowSeconds: number },
): Promise<boolean> {
  const windowStart = sql`to_timestamp(floor(extract(epoch from now()) / ${rule.windowSeconds}) * ${rule.windowSeconds})`;
  const rows = await db()
    .insert(rateLimitWindow)
    .values({ workspaceId, bucket, windowStart, hits: 1 })
    .onConflictDoUpdate({
      target: [
        rateLimitWindow.workspaceId,
        rateLimitWindow.bucket,
        rateLimitWindow.windowStart,
      ],
      set: { hits: sql`${rateLimitWindow.hits} + 1` },
    })
    .returning({ hits: rateLimitWindow.hits });
  return single(rows, `rate limit window "${bucket}"`).hits <= rule.limit;
}
