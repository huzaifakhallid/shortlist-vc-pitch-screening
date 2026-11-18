import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, type Executor } from "../client";
import { company, deal, submission } from "../schema";

export type DuplicateCandidates = {
  // The latest deal of the workspace's company with this domain, and whether
  // the founder email is on any earlier submission of that deal.
  // `held`: that deal is a possible duplicate waiting for a partner (never
  // true today: a held deal's company has no domain). `openClaimDealId`: the
  // latest held deal pointing at it that has a submission from this founder
  // email (a repeat claim joins it, §7.1).
  byDomain: {
    companyId: string;
    dealId: string;
    founderEmailOnDeal: boolean;
    held: boolean;
    openClaimDealId: string | null;
  } | null;
  // The latest submission in the workspace from this founder email, whatever
  // its age: the 90-day window is a rule in Intake's dedupe step (§7.1).
  // `held`: its deal is a possible duplicate waiting for a partner.
  byEmail: { dealId: string; submittedAt: Date; held: boolean } | null;
};

// Intake's dedupe query (§7.1, §11.3): the existing deals a pitch could be a
// resubmission of. Takes the values already normalized by Intake's dedupe
// rules, as they are stored (`company.domain_normalized`,
// `submission.founder_email`); null domain when the pitch has no usable
// company domain (no website, or a shared host).
export function findDuplicateCandidates(
  workspaceId: string,
  input: { domainNormalized: string | null; founderEmail: string },
): Promise<DuplicateCandidates> {
  return selectDuplicateCandidates(db(), workspaceId, input);
}

// Not exported from the package: Intake's narrow path (receivePitch) runs the
// same query inside its transaction.
export async function selectDuplicateCandidates(
  q: Executor,
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
            q,
            workspaceId,
            input.domainNormalized,
            input.founderEmail,
          ),
    byEmail: await latestSubmissionFrom(q, workspaceId, input.founderEmail),
  };
}

async function latestDealForDomain(
  q: Executor,
  workspaceId: string,
  domainNormalized: string,
  founderEmail: string,
): Promise<DuplicateCandidates["byDomain"]> {
  const emailOnDeal = q
    .select({ id: submission.id })
    .from(submission)
    .where(
      and(
        eq(submission.workspaceId, deal.workspaceId),
        eq(submission.dealId, deal.id),
        eq(submission.founderEmail, founderEmail),
      ),
    );
  const [row] = await q
    .select({
      companyId: company.id,
      dealId: deal.id,
      founderEmailOnDeal: sql<boolean>`exists (${emailOnDeal})`,
      held: sql<boolean>`${deal.possibleDuplicateOfDealId} is not null`,
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
  const [claim] = await q
    .select({ dealId: deal.id })
    .from(deal)
    .innerJoin(
      submission,
      and(
        eq(submission.workspaceId, deal.workspaceId),
        eq(submission.dealId, deal.id),
      ),
    )
    .where(
      and(
        eq(deal.workspaceId, workspaceId),
        eq(deal.possibleDuplicateOfDealId, row.dealId),
        eq(submission.founderEmail, founderEmail),
      ),
    )
    .orderBy(desc(deal.createdAt), desc(deal.id))
    .limit(1);
  return {
    companyId: row.companyId,
    dealId: row.dealId,
    founderEmailOnDeal: row.founderEmailOnDeal,
    held: row.held,
    openClaimDealId: claim?.dealId ?? null,
  };
}

async function latestSubmissionFrom(
  q: Executor,
  workspaceId: string,
  founderEmail: string,
): Promise<DuplicateCandidates["byEmail"]> {
  const [row] = await q
    .select({
      dealId: submission.dealId,
      submittedAt: submission.createdAt,
      held: sql<boolean>`${deal.possibleDuplicateOfDealId} is not null`,
    })
    .from(submission)
    .innerJoin(
      deal,
      and(
        eq(deal.workspaceId, submission.workspaceId),
        eq(deal.id, submission.dealId),
      ),
    )
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

// The deal's founder contact (§7.1, §7.5): the founder email on its first
// submission. A resubmission adds a submission and never changes it.
// Founder Comms is its consumer (milestone 4): every founder message goes
// to this address.
export async function getFounderContact(
  workspaceId: string,
  dealId: string,
): Promise<string> {
  const [row] = await db()
    .select({ founderEmail: submission.founderEmail })
    .from(submission)
    .where(
      and(
        eq(submission.workspaceId, workspaceId),
        eq(submission.dealId, dealId),
      ),
    )
    .orderBy(asc(submission.seq))
    .limit(1);
  if (row === undefined) {
    throw new Error(
      `Deal ${dealId} in workspace ${workspaceId} has no submission`,
    );
  }
  return row.founderEmail;
}
