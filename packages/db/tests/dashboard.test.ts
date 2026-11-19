import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "../client";
import { getDealDeck, getDealView, listDeals } from "../index";
import { agentRun, event, submission } from "../schema";
import { DEMO_DECKS } from "../seed/demo-decks";
import { seedDemoWorkspace } from "../seed/seed";
import { createTestDeal, createTestWorkspace } from "./helpers";

async function seeded() {
  const { workspace } = await seedDemoWorkspace();
  const deals = await listDeals(workspace.id);
  const byName = (name: string) => {
    const found = deals.find((d) => d.companyName === name);
    if (found === undefined) {
      throw new Error(`No seeded deal ${name}`);
    }
    return found;
  };
  return { workspace, deals, byName };
}

// A deal in another workspace with a form-less submission.
async function otherWorkspaceDeal(): Promise<{
  workspaceId: string;
  dealId: string;
}> {
  const other = await createTestWorkspace("other");
  const dealId = await createTestDeal(other.workspace.id);
  await db().insert(submission).values({
    workspaceId: other.workspace.id,
    dealId,
    channel: "email",
    founderEmail: "founder@acme.test",
  });
  return { workspaceId: other.workspace.id, dealId };
}

describe("listDeals", () => {
  it("lists the workspace's deals newest first with their summaries", async () => {
    const { deals, byName } = await seeded();

    expect(deals).toHaveLength(9);
    const received = deals.map((d) => d.receivedAt.getTime());
    expect(received).toEqual(received.toSorted((a, b) => b - a));

    expect(byName("Paylane")).toMatchObject({
      stage: "FIRST_CALL",
      totalScore: 88,
      channel: "form",
      founderName: "Hamza Iqbal",
      oneLiner:
        "Payroll and salary advances for factory workers, paid out to mobile wallets.",
      hasDeck: true,
      profile: {
        stage: "seed",
        sector: "fintech",
        country: "PK",
        roundSizeUsd: 1_500_000,
      },
      screening: { status: "SUCCEEDED" },
      flags: { hiddenText: false, mismatch: false },
    });
    expect(byName("Driftcode").flags).toEqual({
      hiddenText: false,
      mismatch: true,
    });
    expect(byName("Tallyfold").flags).toEqual({
      hiddenText: true,
      mismatch: false,
    });
    expect(byName("Gridleaf")).toMatchObject({
      stage: "NEEDS_REVIEW",
      totalScore: null,
    });
    expect(byName("Brightpour")).toMatchObject({
      stage: "RECEIVED",
      profile: null,
      screening: { status: "FAILED" },
      flags: null,
    });
    expect(byName("Quillstack")).toMatchObject({
      stage: "RECEIVED",
      channel: "email",
      oneLiner: null,
      hasDeck: false,
      screening: null,
    });
  });

  it("never returns another workspace's deals", async () => {
    const { workspace } = await seeded();
    const other = await otherWorkspaceDeal();

    const ids = (await listDeals(workspace.id)).map((d) => d.id);
    expect(ids).not.toContain(other.dealId);
    expect((await listDeals(other.workspaceId)).map((d) => d.id)).toEqual([
      other.dealId,
    ]);
  });

  it("shows the latest run's status and the latest succeeded run's flags", async () => {
    const { workspace, byName } = await seeded();
    const deal = byName("Tallyfold");
    const [screened] = await db()
      .select()
      .from(agentRun)
      .where(eq(agentRun.dealId, deal.id));
    if (screened === undefined) {
      throw new Error("Seed has no Tallyfold run");
    }
    // A later re-run on its own trigger, still in progress.
    const [trigger] = await db()
      .insert(event)
      .values({
        workspaceId: workspace.id,
        dealId: deal.id,
        type: "deal.received",
        payload: {},
        processedAt: new Date(),
      })
      .returning({ id: event.id });
    if (trigger === undefined) {
      throw new Error("Event not inserted");
    }
    await db()
      .insert(agentRun)
      .values({
        workspaceId: workspace.id,
        dealId: deal.id,
        agent: "screening",
        triggerEventId: trigger.id,
        configVersionId: screened.configVersionId,
        status: "RUNNING",
        createdAt: new Date(screened.createdAt.getTime() + 60_000),
      });

    const [summary] = (await listDeals(workspace.id)).filter(
      (d) => d.id === deal.id,
    );
    expect(summary?.screening).toEqual({ status: "RUNNING", finishedAt: null });
    // The re-run in progress doesn't hide the earlier run's hidden text.
    expect(summary?.flags).toEqual({ hiddenText: true, mismatch: false });
    const view = await getDealView(workspace.id, deal.id);
    expect(view?.screeningRun).toMatchObject({
      status: "RUNNING",
      output: null,
    });
  });
});

describe("getDealView", () => {
  it("returns the deal with its parsed Screening output and run config", async () => {
    const { workspace, byName } = await seeded();

    const view = await getDealView(workspace.id, byName("Tallyfold").id);

    expect(view?.screeningRun).toMatchObject({
      status: "SUCCEEDED",
      error: null,
      model: null,
      promptVersion: null,
      config: { version: 1 },
    });
    expect(view?.screeningRun?.output?.hiddenSpans).toHaveLength(1);
    expect(
      view?.screeningRun?.output?.scores?.criteria.map((c) => c.key),
    ).toEqual(view?.screeningRun?.config.config.rubric.map((c) => c.key));
  });

  it("returns a failed run's error and no output", async () => {
    const { workspace, byName } = await seeded();

    const view = await getDealView(workspace.id, byName("Brightpour").id);

    expect(view?.screeningRun?.status).toBe("FAILED");
    expect(view?.screeningRun?.output).toBeNull();
    expect(view?.screeningRun?.error).toMatch(/corrective retry/);
  });

  it("has no Screening run for a deal without a deck", async () => {
    const { workspace, byName } = await seeded();

    const view = await getDealView(workspace.id, byName("Quillstack").id);

    expect(view?.screeningRun).toBeNull();
  });

  it("returns null for another workspace's deal", async () => {
    const { workspace } = await seeded();
    const other = await otherWorkspaceDeal();

    expect(await getDealView(workspace.id, other.dealId)).toBeNull();
    expect(await getDealDeck(workspace.id, other.dealId)).toBeNull();
  });
});

describe("getDealDeck", () => {
  it("returns the first submission's deck key and ETag", async () => {
    const { workspace, byName } = await seeded();

    expect(await getDealDeck(workspace.id, byName("Paylane").id)).toEqual({
      objectKey: `workspaces/${workspace.id}/decks/${DEMO_DECKS.paylane.id}.pdf`,
      etag: DEMO_DECKS.paylane.etag,
    });
    expect(await getDealDeck(workspace.id, byName("Quillstack").id)).toBeNull();
  });
});
