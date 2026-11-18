import {
  AGENT_RUN_DEAD_LETTER_QUEUE,
  AGENT_RUN_QUEUE,
  dispatchEvents,
  type AgentRunJob,
} from "@shortlist/coordinator";
import {
  getFounderContact,
  insertEvent,
  listSteps,
  saveConfigVersion,
  withTransaction,
  type AgentRun,
} from "@shortlist/db";
import { claimUnprocessedEventsAcrossWorkspaces } from "@shortlist/db/coordinator";
import type { GeminiKeyTier, PitchForm } from "@shortlist/schemas";
import type { PgBoss } from "pg-boss";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestBoss } from "../../../packages/coordinator/tests/boss";
import {
  configFor,
  createTestWorkspace,
  getTestEventRow,
  listTestDeals,
  listTestEvents,
  listTestRuns,
  listTestSubmissions,
  type TestWorkspace,
} from "../../../packages/db/tests/helpers";
import { executeRun, type RunDeps } from "../src/execute-run";
import { registry } from "../src/registry";

let boss: PgBoss;
beforeAll(async () => {
  boss = await startTestBoss();
});
beforeEach(async () => {
  await boss.deleteAllJobs(AGENT_RUN_QUEUE);
  await boss.deleteAllJobs(AGENT_RUN_DEAD_LETTER_QUEUE);
});
afterAll(async () => {
  await boss.stop();
});

// The worker's real registry; Intake calls no model.
function deps(keyTier: GeminiKeyTier = "paid") {
  const logs: string[] = [];
  const value: RunDeps = {
    registry,
    llmForRun: () => ({
      structured: () => Promise.reject(new Error("Intake calls no model")),
      usage: () => ({ tokensIn: 0, tokensOut: 0, costMicros: 0 }),
    }),
    keyTier,
    log: (message) => logs.push(message),
  };
  return { deps: value, logs };
}

const attempt = {
  retryCount: 0,
  retryLimit: 3,
  signal: new AbortController().signal,
};

// A synthetic pitch (fictional company).
function form(overrides: Partial<PitchForm> = {}): PitchForm {
  return {
    companyName: "Larkspur Labs",
    website: "https://www.larkspur.example",
    oneLiner: "Ledger reconciliation for small lenders",
    roundSizeUsd: 1_500_000,
    founderName: "Ana Test",
    founderEmail: "Ana@Larkspur.example",
    ...overrides,
  };
}

async function workspace(synthetic = false): Promise<TestWorkspace> {
  const t = await createTestWorkspace(synthetic ? "demo" : "kestrel", {
    synthetic,
  });
  await saveConfigVersion(
    t.workspace.id,
    configFor(t.partner.id),
    t.partner.id,
  );
  return t;
}

// Writes form.submitted, dispatches it and runs the Intake run it queued.
async function submitAndRun(
  t: TestWorkspace,
  pitch: PitchForm,
  keyTier: GeminiKeyTier = "paid",
): Promise<{ run: AgentRun; logs: string[] }> {
  const trigger = await withTransaction((tx) =>
    insertEvent(tx, t.workspace.id, {
      type: "form.submitted",
      dealId: null,
      payload: {
        form: pitch,
        deck: {
          objectKey: `workspaces/${t.workspace.id}/decks/deck.pdf`,
          etag: '"etag-1"',
          sizeBytes: 2048,
        },
      },
    }),
  );
  // Also claims earlier deal.received events, which fail dispatch while
  // Screening isn't registered (the last test).
  await dispatchEvents(boss, registry);
  const run = (await listTestRuns(t.workspace.id)).find(
    (r) => r.triggerEventId === trigger.id,
  );
  if (run === undefined) {
    throw new Error("Expected the dispatch to queue an Intake run");
  }
  const job: AgentRunJob = { workspaceId: t.workspace.id, runId: run.id };
  const { deps: runDeps, logs } = deps(keyTier);
  await executeRun(job, attempt, runDeps);
  const finished = (await listTestRuns(t.workspace.id)).find(
    (r) => r.id === run.id,
  );
  if (finished === undefined) {
    throw new Error(`Run ${run.id} disappeared`);
  }
  return { run: finished, logs };
}

function unprocessedEvents() {
  return withTransaction((tx) =>
    claimUnprocessedEventsAcrossWorkspaces(tx, 10),
  );
}

// Events Intake emitted: every event but the form.submitted triggers.
async function emitted(t: TestWorkspace) {
  return (await listTestEvents(t.workspace.id)).filter(
    (e) => e.type !== "form.submitted",
  );
}

describe("Intake, form channel, end to end", () => {
  it("turns form.submitted into a company, deal, submission and deal.received", async () => {
    const t = await workspace();

    const { run } = await submitAndRun(t, form());

    const [created] = await listTestDeals(t.workspace.id);
    expect(created).toMatchObject({
      stage: "RECEIVED",
      domainNormalized: "larkspur.example",
      companyName: "Larkspur Labs",
    });
    expect(run).toMatchObject({
      status: "SUCCEEDED",
      agent: "intake",
      dealId: created?.id,
      promptVersion: null,
      model: null,
      costMicros: 0,
      error: null,
    });
    expect(run.output).toMatchObject({
      founderEmail: "ana@larkspur.example",
      companyDomain: { kind: "domain", domain: "larkspur.example" },
    });
    expect(
      (await listSteps(t.workspace.id, run.id)).map((s) => [s.step, s.status]),
    ).toEqual([
      ["normalise", "SUCCEEDED"],
      ["dedupe", "SUCCEEDED"],
    ]);
    expect(await listTestSubmissions(t.workspace.id)).toMatchObject([
      {
        dealId: created?.id,
        channel: "form",
        founderEmail: "ana@larkspur.example",
        deckEtag: '"etag-1"',
      },
    ]);
    // The deal id comes from the insert, never from agent output.
    expect(await emitted(t)).toEqual([
      { type: "deal.received", dealId: created?.id },
    ]);
  });

  it("attaches a resubmission to the deal, keeps the first founder contact and emits deal.needs_review", async () => {
    const t = await workspace();
    const first = await submitAndRun(t, form());

    const again = await submitAndRun(
      t,
      form({ founderEmail: "cofounder@larkspur.example" }),
    );

    expect(again.run).toMatchObject({
      status: "SUCCEEDED",
      dealId: first.run.dealId,
    });
    expect(await listTestDeals(t.workspace.id)).toHaveLength(1);
    expect(await listTestSubmissions(t.workspace.id)).toHaveLength(2);
    const dealId = first.run.dealId ?? "";
    expect(await getFounderContact(t.workspace.id, dealId)).toBe(
      "ana@larkspur.example",
    );
    // Form resubmissions are unverified (§7.1): no deal.received, so
    // Screening doesn't re-run on its own.
    expect(await emitted(t)).toEqual([
      { type: "deal.received", dealId },
      { type: "deal.needs_review", dealId },
    ]);
    expect(
      (await listSteps(t.workspace.id, again.run.id)).map((s) => [
        s.step,
        s.output,
      ]),
    ).toEqual([
      ["normalise", again.run.output],
      [
        "dedupe",
        { kind: "resubmission", dealId, matchedBy: "domain", held: false },
      ],
    ]);
  });

  it("flags a possible duplicate as its own NEEDS_REVIEW deal and emits deal.needs_review", async () => {
    const t = await workspace();
    const original = await submitAndRun(t, form());

    const suspect = await submitAndRun(
      t,
      form({ founderEmail: "someone@elsewhere.example" }),
    );

    expect(suspect.run.status).toBe("SUCCEEDED");
    const deals = await listTestDeals(t.workspace.id);
    expect(deals.find((d) => d.id === suspect.run.dealId)).toMatchObject({
      stage: "NEEDS_REVIEW",
      possibleDuplicateOfDealId: original.run.dealId,
      domainNormalized: null,
    });
    expect(await emitted(t)).toEqual([
      { type: "deal.received", dealId: original.run.dealId },
      { type: "deal.needs_review", dealId: suspect.run.dealId },
    ]);
  });

  it("holds a repeat claim on the held deal, emitting nothing (§7.1)", async () => {
    const t = await workspace();
    const victim = await submitAndRun(
      t,
      form({ website: "https://victim.example" }),
    );
    const claim = await submitAndRun(
      t,
      form({
        website: "https://victim.example",
        founderEmail: "x@evil.example",
      }),
    );
    const held = claim.run.dealId;

    // Without a website (email rule) and with it again (open claim).
    const noSite = await submitAndRun(
      t,
      form({ website: null, founderEmail: "x@evil.example" }),
    );
    const again = await submitAndRun(
      t,
      form({
        website: "https://victim.example",
        founderEmail: "x@evil.example",
      }),
    );

    expect(noSite.run).toMatchObject({ status: "SUCCEEDED", dealId: held });
    expect(again.run).toMatchObject({ status: "SUCCEEDED", dealId: held });
    const deals = await listTestDeals(t.workspace.id);
    expect(deals).toHaveLength(2);
    expect(deals.find((d) => d.id === held)).toMatchObject({
      stage: "NEEDS_REVIEW",
      possibleDuplicateOfDealId: victim.run.dealId,
    });
    expect(
      (await listTestSubmissions(t.workspace.id)).filter(
        (s) => s.dealId === held,
      ),
    ).toHaveLength(3);
    expect(await emitted(t)).toEqual([
      { type: "deal.received", dealId: victim.run.dealId },
      { type: "deal.needs_review", dealId: held },
    ]);
    const decisions = await Promise.all(
      [noSite, again].map(
        async ({ run }) =>
          (await listSteps(t.workspace.id, run.id)).find(
            (s) => s.step === "dedupe",
          )?.output,
      ),
    );
    expect(decisions).toEqual([
      { kind: "resubmission", dealId: held, matchedBy: "email", held: true },
      {
        kind: "resubmission",
        dealId: held,
        matchedBy: "open_claim",
        held: true,
      },
    ]);
  });

  it("fails visibly, creating nothing, for a founder email on the fund's own domain", async () => {
    const t = await workspace();

    const { run, logs } = await submitAndRun(
      t,
      form({ founderEmail: "partner@kestrel.test", website: null }),
    );

    expect(run).toMatchObject({
      status: "FAILED",
      dealId: null,
      error: "Founder email belongs to the fund",
    });
    expect(await listTestDeals(t.workspace.id)).toEqual([]);
    expect(await emitted(t)).toEqual([]);
    expect(logs).toContain(
      `Run ${run.id} (intake) failed: Founder email belongs to the fund`,
    );
  });

  it("fails the normalise step for a website Intake's rules reject", async () => {
    const t = await workspace();

    const { run } = await submitAndRun(
      t,
      form({ website: "https://10.0.0.1" }),
    );

    expect(run).toMatchObject({
      status: "FAILED",
      error: "Website host is an IP address, not a domain",
    });
    expect(
      (await listSteps(t.workspace.id, run.id)).map((s) => [s.step, s.status]),
    ).toEqual([["normalise", "FAILED"]]);
    expect(await listTestDeals(t.workspace.id)).toEqual([]);
  });

  it("refuses form.submitted in a synthetic workspace (§14.4, §15.5)", async () => {
    const t = await workspace(true);

    // The demo's free-tier key allows the run; Intake still refuses it.
    const { run } = await submitAndRun(t, form(), "free");

    expect(run).toMatchObject({
      status: "FAILED",
      dealId: null,
      error: `Pitch refused: workspace ${t.workspace.id} is synthetic and takes no pitches (§14.4)`,
    });
    expect(await listTestDeals(t.workspace.id)).toEqual([]);
    expect(await emitted(t)).toEqual([]);
  });

  it("leaves deal.received visibly undispatched while Screening isn't registered", async () => {
    const t = await workspace();
    await submitAndRun(t, form());
    const [received] = await emitted(t);

    const result = await dispatchEvents(boss, registry);

    expect(result).toMatchObject({ failed: 1, runs: 0 });
    const events = await unprocessedEvents();
    const row = await getTestEventRow(events[0]?.id ?? "");
    expect(received?.type).toBe("deal.received");
    expect(row).toMatchObject({
      processedAt: null,
      dispatchAttempts: 1,
      dispatchError: `Agent "screening" is enabled and takes deal.received, but this worker doesn't register it`,
    });
  });
});
