import { describe, expect, it } from "vitest";
import { selectSpendTodayMicros } from "../access/coordinator";
import { getSpendTodayMicros, getWorkspace, withTransaction } from "../index";
import {
  createTestWorkspace,
  recordTestSpend,
  saveTestConfig,
} from "./helpers";

// 00:00 UTC today, and a moment before it.
function utcMidnight(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

describe("getSpendTodayMicros", () => {
  it("is 0 for a workspace with no steps", async () => {
    const t = await createTestWorkspace("kestrel");
    expect(await getSpendTodayMicros(t.workspace.id)).toBe(0);
  });

  it("sums the workspace's step costs since 00:00 UTC", async () => {
    const t = await createTestWorkspace("kestrel");
    const config = await saveTestConfig(t);
    const midnight = utcMidnight();
    await recordTestSpend(t.workspace.id, config.id, 1_200);
    await recordTestSpend(t.workspace.id, config.id, 300, midnight);
    // Yesterday's spend doesn't count.
    await recordTestSpend(
      t.workspace.id,
      config.id,
      50_000,
      new Date(midnight.getTime() - 1),
    );

    expect(await getSpendTodayMicros(t.workspace.id)).toBe(1_500);
    expect(
      await withTransaction((tx) => selectSpendTodayMicros(tx, t.workspace.id)),
    ).toBe(1_500);
  });

  it("counts only the workspace's own spend", async () => {
    const a = await createTestWorkspace("alpha");
    const b = await createTestWorkspace("beta");
    await recordTestSpend(a.workspace.id, (await saveTestConfig(a)).id, 700);

    expect(await getSpendTodayMicros(a.workspace.id)).toBe(700);
    expect(await getSpendTodayMicros(b.workspace.id)).toBe(0);
  });
});

describe("getWorkspace", () => {
  it("returns the workspace with its synthetic flag", async () => {
    const real = await createTestWorkspace("real");
    const demo = await createTestWorkspace("demo", { synthetic: true });

    expect(await getWorkspace(real.workspace.id)).toMatchObject({
      slug: "real",
      synthetic: false,
    });
    expect(await getWorkspace(demo.workspace.id)).toMatchObject({
      slug: "demo",
      synthetic: true,
    });
  });

  it("throws for an unknown id", async () => {
    const id = "00000000-0000-4000-8000-000000000000";
    await expect(getWorkspace(id)).rejects.toThrow(`Workspace ${id} not found`);
  });
});
