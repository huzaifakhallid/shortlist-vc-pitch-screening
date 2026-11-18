import type {
  FundEmails,
  IntakeMatch,
  PitchForm,
  SubmissionChannel,
  SubmittedDeck,
} from "@shortlist/schemas";
import { and, eq, sql } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import pg from "pg";
import { single, type Tx } from "../client";
import { company, deal, runStep, submission, workspace } from "../schema";
import { selectDuplicateCandidates, type DuplicateCandidates } from "./deal";
import { selectFundEmails } from "./workspace";

// Intake's narrow path (§11.1): the one place a pitch becomes a company, deal
// and submission. Runs in the transaction that finishes the Intake run, so
// the deal, its dedupe decision, the run's SUCCEEDED and its events commit
// together.

// The advisory-lock class of Intake's per-workspace lock (the first key of
// the two-int form); the second key is the workspace id's hash.
const INTAKE_LOCK_CLASS = 7101;

// A pitch as Intake normalised it (§7.1).
export type ReceivedPitch = {
  channel: SubmissionChannel;
  companyName: string;
  // Null without a usable company domain (no website, or a shared host).
  domainNormalized: string | null;
  founderEmail: string;
  // The form fields as the founder entered them.
  formData: PitchForm;
  deck: SubmittedDeck;
};

// What the dedupe rules decide from, read under the lock below.
export type IntakeFacts = {
  candidates: DuplicateCandidates;
  fundEmails: FundEmails;
  // The database clock at the start of the transaction.
  now: Date;
};

export type ReceivedDeal = {
  // The deal the submission was added to.
  dealId: string;
  match: IntakeMatch;
};

// Creates or links the deal for a pitch:
// - Refuses a synthetic workspace: a free-tier key runs those, so no real
//   pitch may land in one (§14.4, §15.4).
// - Serialises Intake per workspace (a transaction-level advisory lock), then
//   reads the facts and lets `decide` (Intake's dedupe rules) match the
//   pitch. Under the lock this is the only writer of companies with a
//   domain, so a unique violation on the domain is a bug and fails the run.
// - Records the decision as the run's "dedupe" step, in this transaction.
// - new: a company, a RECEIVED deal and the submission.
// - resubmission: a submission on the matched deal (held or not). Its
//   founder contact stays the first submission's (getFounderContact).
// - possible_duplicate: a company without a domain (the domain is taken, and
//   the link is unconfirmed) and a NEEDS_REVIEW deal pointing at the
//   suspected original. A partner confirms or rejects the link.
export async function receivePitch(
  tx: Tx,
  workspaceId: string,
  runId: string,
  pitch: ReceivedPitch,
  decide: (facts: IntakeFacts) => IntakeMatch,
): Promise<ReceivedDeal> {
  const [fund] = await tx
    .select({ synthetic: workspace.synthetic })
    .from(workspace)
    .where(eq(workspace.id, workspaceId));
  if (fund === undefined) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }
  if (fund.synthetic) {
    throw new Error(
      `Pitch refused: workspace ${workspaceId} is synthetic and takes no pitches (§14.4)`,
    );
  }

  await tx.execute(
    sql`select pg_advisory_xact_lock(${INTAKE_LOCK_CLASS}, hashtext(${workspaceId}))`,
  );
  const match = decide(await readFacts(tx, workspaceId, pitch));
  await tx.insert(runStep).values({
    workspaceId,
    runId,
    step: "dedupe",
    status: "SUCCEEDED",
    output: match,
    tokensIn: 0,
    tokensOut: 0,
    costMicros: 0,
  });

  if (match.kind === "resubmission") {
    await insertSubmission(tx, workspaceId, match.dealId, pitch);
    return { dealId: match.dealId, match };
  }
  const companyId = await insertCompany(
    tx,
    workspaceId,
    pitch.companyName,
    // A possible duplicate's company has no domain: the original keeps it.
    match.kind === "new" ? pitch.domainNormalized : null,
  );
  const dealId = await insertDeal(
    tx,
    workspaceId,
    companyId,
    match.kind === "new" ? null : match.dealId,
  );
  await insertSubmission(tx, workspaceId, dealId, pitch);
  return { dealId, match };
}

async function readFacts(
  tx: Tx,
  workspaceId: string,
  pitch: ReceivedPitch,
): Promise<IntakeFacts> {
  const clock = await tx.execute<{ now: Date | string }>(
    sql`select now() as now`,
  );
  return {
    candidates: await selectDuplicateCandidates(tx, workspaceId, {
      domainNormalized: pitch.domainNormalized,
      founderEmail: pitch.founderEmail,
    }),
    fundEmails: await selectFundEmails(tx, workspaceId),
    now: new Date(single(clock.rows, "database clock").now),
  };
}

async function insertCompany(
  tx: Tx,
  workspaceId: string,
  name: string,
  domainNormalized: string | null,
): Promise<string> {
  try {
    const rows = await tx
      .insert(company)
      .values({ workspaceId, name, domainNormalized })
      .returning({ id: company.id });
    return single(rows, "company").id;
  } catch (error) {
    if (
      error instanceof DrizzleQueryError &&
      error.cause instanceof pg.DatabaseError &&
      error.cause.constraint === "company_workspace_id_domain_normalized_key"
    ) {
      throw new Error(
        `Company domain is already taken in workspace ${workspaceId}, but the dedupe decision was "new"`,
        { cause: error },
      );
    }
    throw error;
  }
}

async function insertDeal(
  tx: Tx,
  workspaceId: string,
  companyId: string,
  possibleDuplicateOfDealId: string | null,
): Promise<string> {
  const rows = await tx
    .insert(deal)
    .values({
      workspaceId,
      companyId,
      stage: possibleDuplicateOfDealId === null ? "RECEIVED" : "NEEDS_REVIEW",
      possibleDuplicateOfDealId,
    })
    .returning({ id: deal.id });
  return single(rows, "deal").id;
}

async function insertSubmission(
  tx: Tx,
  workspaceId: string,
  dealId: string,
  pitch: ReceivedPitch,
): Promise<void> {
  // A resubmission's deal must be in this workspace; the composite foreign
  // key enforces it, this names it.
  const [target] = await tx
    .select({ id: deal.id })
    .from(deal)
    .where(and(eq(deal.workspaceId, workspaceId), eq(deal.id, dealId)));
  if (target === undefined) {
    throw new Error(`Deal ${dealId} not found in workspace ${workspaceId}`);
  }
  await tx.insert(submission).values({
    workspaceId,
    dealId,
    channel: pitch.channel,
    formData: pitch.formData,
    founderEmail: pitch.founderEmail,
    deckObjectKey: pitch.deck.objectKey,
    deckEtag: pitch.deck.etag,
  });
}
