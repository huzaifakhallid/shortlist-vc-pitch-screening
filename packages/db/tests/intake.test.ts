import type { IntakeMatch } from "@shortlist/schemas";
import { describe, expect, it } from "vitest";
import { withTransaction } from "../client";
import {
  createRun,
  getFounderContact,
  insertEvent,
  listSteps,
  receivePitch,
  startRun,
  type IntakeFacts,
  type ReceivedPitch,
} from "../index";
import {
  createTestDeal,
  createTestWorkspace,
  listTestDeals,
  listTestSubmissions,
  saveTestConfig,
  type TestWorkspace,
} from "./helpers";

// A synthetic pitch, already normalised as Intake does (§7.1).
function pitch(overrides: Partial<ReceivedPitch> = {}): ReceivedPitch {
  return {
    channel: "form",
    companyName: "Larkspur Labs",
    domainNormalized: "larkspur.example",
    founderEmail: "ana@larkspur.example",
    formData: {
      companyName: "Larkspur Labs",
      website: "https://larkspur.example",
      oneLiner: "Ledger reconciliation for small lenders",
      roundSizeUsd: 1_500_000,
      founderName: "Ana Test",
      founderEmail: "Ana@Larkspur.example",
    },
    deck: {
      objectKey: "workspaces/ws/decks/deck.pdf",
      etag: '"etag-1"',
      sizeBytes: 1024,
    },
    ...overrides,
  };
}

// Stands in for Intake's rules (tested in packages/agents/intake): links any
// candidate the query found.
function linkAny(facts: IntakeFacts): IntakeMatch {
  const found = facts.candidates.byDomain ?? facts.candidates.byEmail;
  return found === null
    ? { kind: "new" }
    : {
        kind: "resubmission",
        dealId: found.dealId,
        matchedBy: facts.candidates.byDomain === null ? "email" : "domain",
        held: found.held,
      };
}

// A RUNNING Intake run in the workspace, as executeRun has it when it calls
// receivePitch (the dedupe step is recorded on it).
async function intakeRun(t: TestWorkspace): Promise<string> {
  const config = await saveTestConfig(t);
  const workspaceId = t.workspace.id;
  const { run } = await withTransaction(async (tx) => {
    const trigger = await insertEvent(tx, workspaceId, {
      type: "form.submitted",
      dealId: null,
      payload: { form: pitch().formData, deck: pitch().deck },
    });
    return createRun(tx, workspaceId, {
      agent: "intake",
      triggerEventId: trigger.id,
      configVersionId: config.id,
    });
  });
  await startRun(workspaceId, run.id, {
    promptVersion: null,
    model: null,
    inputHash: "h",
  });
  return run.id;
}

async function receive(
  t: TestWorkspace,
  input: ReceivedPitch,
  decide: (facts: IntakeFacts) => IntakeMatch = linkAny,
) {
  const runId = await intakeRun(t);
  return withTransaction((tx) =>
    receivePitch(tx, t.workspace.id, runId, input, decide),
  );
}

describe("receivePitch", () => {
  it("creates the company, a RECEIVED deal and the submission for a new pitch", async () => {
    const t = await createTestWorkspace("kestrel");
    const input = pitch();

    const received = await receive(t, input);

    expect(received.match).toEqual({ kind: "new" });
    expect(await listTestDeals(t.workspace.id)).toEqual([
      {
        id: received.dealId,
        stage: "RECEIVED",
        possibleDuplicateOfDealId: null,
        companyName: "Larkspur Labs",
        domainNormalized: "larkspur.example",
      },
    ]);
    expect(await listTestSubmissions(t.workspace.id)).toMatchObject([
      {
        dealId: received.dealId,
        channel: "form",
        formData: input.formData,
        founderEmail: "ana@larkspur.example",
        deckObjectKey: input.deck.objectKey,
        deckEtag: input.deck.etag,
        deckSha256: null,
      },
    ]);
  });

  it("decides on the database clock, the fund's own emails and the dedupe query", async () => {
    const t = await createTestWorkspace("kestrel");
    const seen: IntakeFacts[] = [];
    const before = Date.now();

    await receive(t, pitch(), (facts) => {
      seen.push(facts);
      return { kind: "new" };
    });

    const [facts] = seen;
    expect(seen).toHaveLength(1);
    expect(facts?.candidates).toEqual({ byDomain: null, byEmail: null });
    // The intake address's domain and the partner's email domain, and the
    // partner's exact address.
    expect(facts?.fundEmails).toEqual({
      domains: new Set(["in.shortlist.dev", "kestrel.test"]),
      addresses: new Set(["partner@kestrel.test"]),
    });
    expect(facts?.now).toBeInstanceOf(Date);
    expect(Math.abs((facts?.now.getTime() ?? 0) - before)).toBeLessThan(60_000);
  });

  it("records the decision as the run's dedupe step, in the same transaction", async () => {
    const t = await createTestWorkspace("kestrel");
    const runId = await intakeRun(t);

    await withTransaction((tx) =>
      receivePitch(tx, t.workspace.id, runId, pitch(), () => ({
        kind: "new",
      })),
    );
    const failedRun = await intakeRun(t);
    await expect(
      withTransaction((tx) =>
        receivePitch(tx, t.workspace.id, failedRun, pitch(), () => ({
          kind: "new",
        })),
      ),
    ).rejects.toThrow();

    expect(
      (await listSteps(t.workspace.id, runId)).map((s) => [
        s.step,
        s.status,
        s.output,
      ]),
    ).toEqual([["dedupe", "SUCCEEDED", { kind: "new" }]]);
    // A rolled-back pitch leaves no decision behind.
    expect(await listSteps(t.workspace.id, failedRun)).toEqual([]);
  });

  it("adds a resubmission to the existing deal and keeps its founder contact", async () => {
    const t = await createTestWorkspace("kestrel");
    const first = await receive(t, pitch());

    const again = await receive(
      t,
      pitch({ founderEmail: "cofounder@larkspur.example" }),
    );

    expect(again).toEqual({
      dealId: first.dealId,
      match: {
        kind: "resubmission",
        dealId: first.dealId,
        matchedBy: "domain",
        held: false,
      },
    });
    expect(await listTestDeals(t.workspace.id)).toHaveLength(1);
    expect(
      (await listTestSubmissions(t.workspace.id)).map((s) => s.founderEmail),
    ).toEqual(["ana@larkspur.example", "cofounder@larkspur.example"]);
    expect(await getFounderContact(t.workspace.id, first.dealId)).toBe(
      "ana@larkspur.example",
    );
  });

  it("makes a possible duplicate its own NEEDS_REVIEW deal, flagged, without the domain", async () => {
    const t = await createTestWorkspace("kestrel");
    const original = await receive(t, pitch());

    const suspect = await receive(
      t,
      pitch({ founderEmail: "someone@elsewhere.example" }),
      (facts) => ({
        kind: "possible_duplicate",
        dealId: facts.candidates.byDomain?.dealId ?? "",
      }),
    );

    expect(suspect.match).toEqual({
      kind: "possible_duplicate",
      dealId: original.dealId,
    });
    expect(suspect.dealId).not.toBe(original.dealId);
    const deals = await listTestDeals(t.workspace.id);
    expect(deals.find((d) => d.id === suspect.dealId)).toEqual({
      id: suspect.dealId,
      stage: "NEEDS_REVIEW",
      possibleDuplicateOfDealId: original.dealId,
      companyName: "Larkspur Labs",
      domainNormalized: null,
    });
    // The original deal still owns the domain, and its contact is unchanged.
    expect(deals.find((d) => d.id === original.dealId)?.domainNormalized).toBe(
      "larkspur.example",
    );
    expect(await getFounderContact(t.workspace.id, suspect.dealId)).toBe(
      "someone@elsewhere.example",
    );
    expect(await getFounderContact(t.workspace.id, original.dealId)).toBe(
      "ana@larkspur.example",
    );
  });

  it("refuses a synthetic workspace before deciding or writing anything", async () => {
    const t = await createTestWorkspace("demo", { synthetic: true });
    let decided = 0;

    await expect(
      receive(t, pitch(), (facts) => {
        decided += 1;
        return linkAny(facts);
      }),
    ).rejects.toThrow(
      `Pitch refused: workspace ${t.workspace.id} is synthetic and takes no pitches (§14.4)`,
    );
    expect(decided).toBe(0);
    expect(await listTestDeals(t.workspace.id)).toEqual([]);
    expect(await listTestSubmissions(t.workspace.id)).toEqual([]);
  });

  it("writes nothing when the decision fails", async () => {
    const t = await createTestWorkspace("kestrel");

    await expect(
      receive(t, pitch(), () => {
        throw new Error("Founder email is on one of the fund's own domains");
      }),
    ).rejects.toThrow("Founder email is on one of the fund's own domains");
    expect(await listTestDeals(t.workspace.id)).toEqual([]);
  });

  it("refuses a resubmission to another workspace's deal", async () => {
    const t = await createTestWorkspace("kestrel");
    const other = await createTestWorkspace("other");
    const foreign = await createTestDeal(other.workspace.id);

    await expect(
      receive(t, pitch(), () => ({
        kind: "resubmission",
        dealId: foreign,
        matchedBy: "email",
        held: false,
      })),
    ).rejects.toThrow(
      `Deal ${foreign} not found in workspace ${t.workspace.id}`,
    );
  });
});

describe("receivePitch races (§7.1 dedupe follow-up a)", () => {
  it("serialises two concurrent pitches from one email without a domain", async () => {
    const t = await createTestWorkspace("kestrel");
    const noDomain = pitch({ domainNormalized: null });

    const results = await Promise.all([
      receive(t, noDomain),
      receive(t, noDomain),
    ]);

    expect(results.map((r) => r.match.kind).sort()).toEqual([
      "new",
      "resubmission",
    ]);
    expect(new Set(results.map((r) => r.dealId)).size).toBe(1);
    expect(await listTestDeals(t.workspace.id)).toHaveLength(1);
    expect(await listTestSubmissions(t.workspace.id)).toHaveLength(2);
  });

  it("serialises two concurrent pitches for one domain", async () => {
    const t = await createTestWorkspace("kestrel");

    const results = await Promise.all([
      receive(t, pitch()),
      receive(t, pitch()),
    ]);

    expect(new Set(results.map((r) => r.dealId)).size).toBe(1);
    expect(await listTestDeals(t.workspace.id)).toHaveLength(1);
  });

  it("fails with a specific message when the decision says new for a taken domain", async () => {
    const t = await createTestWorkspace("kestrel");

    await expect(
      receive(t, pitch(), () => ({ kind: "new" })),
    ).resolves.toMatchObject({ match: { kind: "new" } });
    // A wrong decision: under Intake's lock nothing else creates domains.
    await expect(receive(t, pitch(), () => ({ kind: "new" }))).rejects.toThrow(
      `Company domain is already taken in workspace ${t.workspace.id}, but the dedupe decision was "new"`,
    );
    expect(await listTestDeals(t.workspace.id)).toHaveLength(1);
  });
});

describe("getFounderContact", () => {
  it("fails for a deal without a submission", async () => {
    const t = await createTestWorkspace("kestrel");
    const dealId = await createTestDeal(t.workspace.id);

    await expect(getFounderContact(t.workspace.id, dealId)).rejects.toThrow(
      `Deal ${dealId} in workspace ${t.workspace.id} has no submission`,
    );
  });
});
