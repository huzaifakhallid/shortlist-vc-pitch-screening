import { describe, expect, it } from "vitest";
import { db, single } from "../client";
import { findDuplicateCandidates } from "../index";
import { company, deal, submission } from "../schema";
import { createTestWorkspace } from "./helpers";

// No access function creates companies, deals or submissions yet (Intake,
// milestone 2), so these insert directly, with explicit timestamps.
async function insertCompany(
  workspaceId: string,
  domainNormalized: string | null,
): Promise<string> {
  const rows = await db()
    .insert(company)
    .values({ workspaceId, name: "Acme", domainNormalized })
    .returning({ id: company.id });
  return single(rows, "company").id;
}

async function insertDeal(
  workspaceId: string,
  companyId: string,
  createdAt: Date,
): Promise<string> {
  const rows = await db()
    .insert(deal)
    .values({ workspaceId, companyId, stage: "RECEIVED", createdAt })
    .returning({ id: deal.id });
  return single(rows, "deal").id;
}

async function insertSubmission(
  workspaceId: string,
  dealId: string,
  founderEmail: string,
  createdAt: Date,
): Promise<void> {
  await db()
    .insert(submission)
    .values({ workspaceId, dealId, channel: "email", founderEmail, createdAt });
}

const day = 24 * 60 * 60 * 1000;
const longAgo = new Date(Date.now() - 400 * day);
const recently = new Date(Date.now() - 3 * day);

describe("findDuplicateCandidates", () => {
  it("finds nothing in an empty workspace", async () => {
    const t = await createTestWorkspace("kestrel");
    expect(
      await findDuplicateCandidates(t.workspace.id, {
        domainNormalized: "acme.com",
        founderEmail: "ana@acme.com",
      }),
    ).toEqual({ byDomain: null, byEmail: null });
  });

  it("finds the company's latest deal by domain, whatever its age", async () => {
    const t = await createTestWorkspace("kestrel");
    const companyId = await insertCompany(t.workspace.id, "acme.com");
    await insertDeal(t.workspace.id, companyId, longAgo);
    const latest = await insertDeal(t.workspace.id, companyId, recently);
    await insertCompany(t.workspace.id, "other.com");

    expect(
      await findDuplicateCandidates(t.workspace.id, {
        domainNormalized: "acme.com",
        founderEmail: "ana@acme.com",
      }),
    ).toEqual({
      byDomain: { companyId, dealId: latest, founderEmailOnDeal: false },
      byEmail: null,
    });
  });

  it("says whether the founder email is on a submission of the matched deal", async () => {
    const t = await createTestWorkspace("kestrel");
    const companyId = await insertCompany(t.workspace.id, "acme.com");
    const older = await insertDeal(t.workspace.id, companyId, longAgo);
    const latest = await insertDeal(t.workspace.id, companyId, recently);
    await insertSubmission(t.workspace.id, latest, "ana@acme.com", recently);
    // On the company's older deal only: not on the matched (latest) deal.
    await insertSubmission(t.workspace.id, older, "bo@gmail.com", longAgo);

    const ana = await findDuplicateCandidates(t.workspace.id, {
      domainNormalized: "acme.com",
      founderEmail: "ana@acme.com",
    });
    expect(ana.byDomain).toEqual({
      companyId,
      dealId: latest,
      founderEmailOnDeal: true,
    });
    const bo = await findDuplicateCandidates(t.workspace.id, {
      domainNormalized: "acme.com",
      founderEmail: "bo@gmail.com",
    });
    expect(bo.byDomain).toEqual({
      companyId,
      dealId: latest,
      founderEmailOnDeal: false,
    });
  });

  it("never matches companies stored without a domain", async () => {
    const t = await createTestWorkspace("kestrel");
    // NULL domains stay distinct under the unique key.
    await insertDeal(
      t.workspace.id,
      await insertCompany(t.workspace.id, null),
      recently,
    );
    await insertDeal(
      t.workspace.id,
      await insertCompany(t.workspace.id, null),
      recently,
    );

    expect(
      await findDuplicateCandidates(t.workspace.id, {
        domainNormalized: null,
        founderEmail: "ana@acme.com",
      }),
    ).toEqual({ byDomain: null, byEmail: null });
  });

  it("skips the domain lookup when the pitch has no website", async () => {
    const t = await createTestWorkspace("kestrel");
    const companyId = await insertCompany(t.workspace.id, "acme.com");
    await insertDeal(t.workspace.id, companyId, recently);

    expect(
      await findDuplicateCandidates(t.workspace.id, {
        domainNormalized: null,
        founderEmail: "ana@acme.com",
      }),
    ).toEqual({ byDomain: null, byEmail: null });
  });

  it("finds the latest submission from the founder email, whatever its age", async () => {
    const t = await createTestWorkspace("kestrel");
    const first = await insertDeal(
      t.workspace.id,
      await insertCompany(t.workspace.id, "first.com"),
      longAgo,
    );
    const second = await insertDeal(
      t.workspace.id,
      await insertCompany(t.workspace.id, "second.com"),
      longAgo,
    );
    await insertSubmission(t.workspace.id, second, "ana@acme.com", longAgo);
    await insertSubmission(t.workspace.id, first, "ana@acme.com", recently);
    await insertSubmission(t.workspace.id, second, "bo@acme.com", new Date());

    expect(
      await findDuplicateCandidates(t.workspace.id, {
        domainNormalized: "acme.com",
        founderEmail: "ana@acme.com",
      }),
    ).toEqual({
      byDomain: null,
      byEmail: { dealId: first, submittedAt: recently },
    });
  });

  it("returns both matches when they point at different deals", async () => {
    const t = await createTestWorkspace("kestrel");
    const companyId = await insertCompany(t.workspace.id, "acme.com");
    const byDomain = await insertDeal(t.workspace.id, companyId, longAgo);
    const byEmail = await insertDeal(
      t.workspace.id,
      await insertCompany(t.workspace.id, "older.com"),
      longAgo,
    );
    await insertSubmission(t.workspace.id, byEmail, "ana@acme.com", recently);

    expect(
      await findDuplicateCandidates(t.workspace.id, {
        domainNormalized: "acme.com",
        founderEmail: "ana@acme.com",
      }),
    ).toEqual({
      byDomain: { companyId, dealId: byDomain, founderEmailOnDeal: false },
      byEmail: { dealId: byEmail, submittedAt: recently },
    });
  });

  it("never finds another workspace's company or submission", async () => {
    const a = await createTestWorkspace("alpha");
    const b = await createTestWorkspace("beta");
    const dealA = await insertDeal(
      a.workspace.id,
      await insertCompany(a.workspace.id, "acme.com"),
      recently,
    );
    await insertSubmission(a.workspace.id, dealA, "ana@acme.com", recently);

    expect(
      await findDuplicateCandidates(b.workspace.id, {
        domainNormalized: "acme.com",
        founderEmail: "ana@acme.com",
      }),
    ).toEqual({ byDomain: null, byEmail: null });
  });

  it("fails for a company without a deal", async () => {
    const t = await createTestWorkspace("kestrel");
    const companyId = await insertCompany(t.workspace.id, "acme.com");

    await expect(
      findDuplicateCandidates(t.workspace.id, {
        domainNormalized: "acme.com",
        founderEmail: "ana@acme.com",
      }),
    ).rejects.toThrow(
      `Company ${companyId} in workspace ${t.workspace.id} has no deal`,
    );
  });

  it.each([
    [{ domainNormalized: "Acme.com", founderEmail: "ana@acme.com" }, "domain"],
    [{ domainNormalized: " acme.com", founderEmail: "ana@acme.com" }, "domain"],
    [{ domainNormalized: null, founderEmail: "Ana@acme.com" }, "founder email"],
  ])("rejects input that isn't normalized (%j)", async (input, field) => {
    const t = await createTestWorkspace("kestrel");
    await expect(
      findDuplicateCandidates(t.workspace.id, input),
    ).rejects.toThrow(`Dedupe query needs a normalized ${field}`);
  });
});
