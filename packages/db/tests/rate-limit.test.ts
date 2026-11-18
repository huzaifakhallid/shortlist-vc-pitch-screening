import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../client";
import { consumeRateLimit } from "../index";
import { rateLimitWindow } from "../schema";
import { createTestWorkspace } from "./helpers";

describe("consumeRateLimit", () => {
  const rule = { limit: 2, windowSeconds: 3600 };

  it("allows `limit` hits per bucket and window, then refuses", async () => {
    const { workspace } = await createTestWorkspace("alpha");
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      results.push(await consumeRateLimit(workspace.id, "submit:ip:a", rule));
    }
    expect(results).toEqual([true, true, false, false]);
    expect(await consumeRateLimit(workspace.id, "submit:ip:b", rule)).toBe(
      true,
    );
  });

  it("counts each workspace separately", async () => {
    const a = await createTestWorkspace("alpha");
    const b = await createTestWorkspace("beta");
    await consumeRateLimit(a.workspace.id, "submit", rule);
    await consumeRateLimit(a.workspace.id, "submit", rule);

    expect(await consumeRateLimit(a.workspace.id, "submit", rule)).toBe(false);
    expect(await consumeRateLimit(b.workspace.id, "submit", rule)).toBe(true);
  });

  it("starts a new count in the next window", async () => {
    const { workspace } = await createTestWorkspace("alpha");
    await consumeRateLimit(workspace.id, "submit", rule);
    await consumeRateLimit(workspace.id, "submit", rule);
    // The stored window moves an hour back, so now is in a new one.
    await db()
      .update(rateLimitWindow)
      .set({
        windowStart: sql`${rateLimitWindow.windowStart} - interval '1 hour'`,
      });

    expect(await consumeRateLimit(workspace.id, "submit", rule)).toBe(true);
    const rows = await db()
      .select()
      .from(rateLimitWindow)
      .orderBy(rateLimitWindow.windowStart);
    expect(rows.map((r) => r.hits)).toEqual([2, 1]);
    // Windows start on a multiple of the window length.
    expect(rows[1]?.windowStart.getTime()).toBe(
      Math.floor(Date.now() / 3_600_000) * 3_600_000,
    );
  });
});
