import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../client";
import { company, deal, submission } from "../schema";

export type DuplicateCandidates = {
  // The latest deal of the workspace's company with this domain, and whether
  // the founder email is on any earlier submission of that deal.
  byDomain: {
    companyId: string;
    dealId: string;
    founderEmailOnDeal: boolean;
  } | null;
  // The latest submission in the workspace from this founder email, whatever
  // its age: the 90-day window is a rule in Intake's dedupe step (§7.1).
  byEmail: { dealId: string; submittedAt: Date } | null;
};

// Intake's dedupe query (§7.1, §11.3): the existing deals a pitch could be a
// resubmission of. Takes the values already normalized by Intake's dedupe
// rules, as they are stored (`company.domain_normalized`,
// `submission.founder_email`); null domain when the pitch has no usable
// company domain (no website, or a shared host).
export async function findDuplicateCandidates(
  workspaceId: string,
  input: { domainNormalized: string | null; founderEmail: string },
): Promise<DuplicateCandidates> {
  // A sanity check that the caller normalized, not validation: the rules in
  // Intake's dedupe step are the only normalizers.
  if (
    input.domainNormalized !== null &&
    input.domainNormalized !== input.domainNormalized.trim().toLowerCase()
  ) {
    throw new Error("Dedupe query needs a normalized domain");
  }
  if (input.founderEmail !== input.founderEmail.trim().toLowerCase()) {
    throw new Error("Dedupe query needs a normalized founder email");
  }
  return {
    byDomain:
      input.domainNormalized === null
        ? null
        : await latestDealForDomain(
            workspaceId,
            input.domainNormalized,
            input.founderEmail,
          ),
    byEmail: await latestSubmissionFrom(workspaceId, input.founderEmail),
  };
}

async function latestDealForDomain(
  workspaceId: string,
  domainNormalized: string,
  founderEmail: string,
): Promise<DuplicateCandidates["byDomain"]> {
  const emailOnDeal = db()
    .select({ id: submission.id })
    .from(submission)
    .where(
      and(
        eq(submission.workspaceId, deal.workspaceId),
        eq(submission.dealId, deal.id),
        eq(submission.founderEmail, founderEmail),
      ),
    );
  const [row] = await db()
    .select({
      companyId: company.id,
      dealId: deal.id,
      founderEmailOnDeal: sql<boolean>`exists (${emailOnDeal})`,
    })
    .from(company)
    .leftJoin(
      deal,
      and(
        eq(deal.workspaceId, company.workspaceId),
        eq(deal.companyId, company.id),
      ),
    )
    .where(
      and(
        eq(company.workspaceId, workspaceId),
        eq(company.domainNormalized, domainNormalized),
      ),
    )
    .orderBy(desc(deal.createdAt), desc(deal.id))
    .limit(1);
  if (row === undefined) {
    return null;
  }
  // Intake creates a company together with its first deal, so a company
  // without one is broken data, not "no match".
  if (row.dealId === null) {
    throw new Error(
      `Company ${row.companyId} in workspace ${workspaceId} has no deal`,
    );
  }
  return {
    companyId: row.companyId,
    dealId: row.dealId,
    founderEmailOnDeal: row.founderEmailOnDeal,
  };
}

async function latestSubmissionFrom(
  workspaceId: string,
  founderEmail: string,
): Promise<DuplicateCandidates["byEmail"]> {
  const [row] = await db()
    .select({ dealId: submission.dealId, submittedAt: submission.createdAt })
    .from(submission)
    .where(
      and(
        eq(submission.workspaceId, workspaceId),
        eq(submission.founderEmail, founderEmail),
      ),
    )
    .orderBy(desc(submission.createdAt), desc(submission.id))
    .limit(1);
  return row ?? null;
}
