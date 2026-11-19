import {
  dealProfileSchema,
  pitchFormSchema,
  screeningOutputSchema,
  type DealProfile,
  type DealStage,
  type RunStatus,
  type ScreeningOutput,
  type SubmissionChannel,
} from "@shortlist/schemas";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "../client";
import { agentRun, company, deal, submission } from "../schema";
import { getConfigVersion, type ActiveConfig } from "./config";

// Reads for the dashboard's Deals list and Deal page (§18). Every query is
// scoped by the session's workspace. JSON columns are parsed on read:
// deal.profile with dealProfileSchema, a finished Screening run's output with
// screeningOutputSchema, a form submission's fields with pitchFormSchema.

export type DealSummary = {
  id: string;
  companyName: string;
  domain: string | null;
  stage: DealStage;
  profile: DealProfile | null;
  totalScore: number | null;
  receivedAt: Date;
  // From the deal's first submission (§7.1: its founder contact).
  channel: SubmissionChannel;
  founderEmail: string;
  // The form's fields; null for a pitch that didn't come through the form.
  oneLiner: string | null;
  founderName: string | null;
  // The first submission carried a deck; false is "Needs deck" (§7.1).
  hasDeck: boolean;
  // The deal's latest Screening run; null when Screening hasn't run.
  screening: { status: RunStatus; finishedAt: Date | null } | null;
  // From the latest Screening run that succeeded, so a re-run in progress
  // or a failed one doesn't hide them; null until one succeeds.
  flags: { hiddenText: boolean; mismatch: boolean } | null;
};

type DealRow = {
  id: string;
  companyName: string;
  domain: string | null;
  stage: DealStage;
  profile: unknown;
  totalScore: number | null;
  receivedAt: Date;
};

function dealRows(workspaceId: string, dealId?: string) {
  return db()
    .select({
      id: deal.id,
      companyName: company.name,
      domain: company.domainNormalized,
      stage: deal.stage,
      profile: deal.profile,
      totalScore: deal.totalScore,
      receivedAt: deal.createdAt,
    })
    .from(deal)
    .innerJoin(
      company,
      and(
        eq(company.workspaceId, deal.workspaceId),
        eq(company.id, deal.companyId),
      ),
    )
    .where(
      and(
        eq(deal.workspaceId, workspaceId),
        dealId === undefined ? undefined : eq(deal.id, dealId),
      ),
    )
    .orderBy(desc(deal.createdAt), desc(deal.id));
}

// Each deal's first submission (by seq).
function firstSubmissions(workspaceId: string, dealId?: string) {
  return db()
    .selectDistinctOn([submission.dealId], {
      dealId: submission.dealId,
      channel: submission.channel,
      formData: submission.formData,
      founderEmail: submission.founderEmail,
      deckObjectKey: submission.deckObjectKey,
      deckEtag: submission.deckEtag,
    })
    .from(submission)
    .where(
      and(
        eq(submission.workspaceId, workspaceId),
        dealId === undefined ? undefined : eq(submission.dealId, dealId),
      ),
    )
    .orderBy(submission.dealId, asc(submission.seq));
}

// Each deal's latest Screening run.
function latestScreeningRuns(workspaceId: string, dealId?: string) {
  return db()
    .selectDistinctOn([agentRun.dealId], {
      id: agentRun.id,
      dealId: agentRun.dealId,
      status: agentRun.status,
      finishedAt: agentRun.finishedAt,
    })
    .from(agentRun)
    .where(
      and(
        eq(agentRun.workspaceId, workspaceId),
        eq(agentRun.agent, "screening"),
        isNotNull(agentRun.dealId),
        dealId === undefined ? undefined : eq(agentRun.dealId, dealId),
      ),
    )
    .orderBy(agentRun.dealId, desc(agentRun.createdAt), desc(agentRun.id));
}

// Each deal's latest succeeded Screening run, with its output.
function latestScreeningOutputs(workspaceId: string, dealId?: string) {
  return db()
    .selectDistinctOn([agentRun.dealId], {
      id: agentRun.id,
      dealId: agentRun.dealId,
      output: agentRun.output,
    })
    .from(agentRun)
    .where(
      and(
        eq(agentRun.workspaceId, workspaceId),
        eq(agentRun.agent, "screening"),
        eq(agentRun.status, "SUCCEEDED"),
        isNotNull(agentRun.dealId),
        dealId === undefined ? undefined : eq(agentRun.dealId, dealId),
      ),
    )
    .orderBy(agentRun.dealId, desc(agentRun.createdAt), desc(agentRun.id));
}

type SubmissionRow = Awaited<ReturnType<typeof firstSubmissions>>[number];
type OutputRow = Awaited<ReturnType<typeof latestScreeningOutputs>>[number];
type RunRow = Awaited<ReturnType<typeof latestScreeningRuns>>[number];

function summary(
  workspaceId: string,
  row: DealRow,
  first: SubmissionRow | undefined,
  run: RunRow | undefined,
  succeeded: OutputRow | undefined,
): DealSummary {
  // Intake creates a deal together with its first submission.
  if (first === undefined) {
    throw new Error(
      `Deal ${row.id} in workspace ${workspaceId} has no submission`,
    );
  }
  const form =
    first.channel === "form" ? pitchFormSchema.parse(first.formData) : null;
  return {
    id: row.id,
    companyName: row.companyName,
    domain: row.domain,
    stage: row.stage,
    profile: dealProfileSchema.nullable().parse(row.profile),
    totalScore: row.totalScore,
    receivedAt: row.receivedAt,
    channel: first.channel,
    founderEmail: first.founderEmail,
    oneLiner: form?.oneLiner ?? null,
    founderName: form?.founderName ?? null,
    hasDeck: first.deckObjectKey !== null,
    screening:
      run === undefined
        ? null
        : { status: run.status, finishedAt: run.finishedAt },
    flags: succeeded === undefined ? null : flagsOf(workspaceId, succeeded),
  };
}

function flagsOf(
  workspaceId: string,
  run: OutputRow,
): NonNullable<DealSummary["flags"]> {
  const output = parseOutput(workspaceId, run);
  return {
    hiddenText: output.hiddenSpans.length > 0,
    mismatch: output.mismatches.length > 0,
  };
}

// Every deal in the workspace, newest first. The Deals list filters, counts
// and ranks these in the web app; paging comes when a fund's volume needs it.
export async function listDeals(workspaceId: string): Promise<DealSummary[]> {
  const [rows, submissions, runs, outputs] = await Promise.all([
    dealRows(workspaceId),
    firstSubmissions(workspaceId),
    latestScreeningRuns(workspaceId),
    latestScreeningOutputs(workspaceId),
  ]);
  const firstByDeal = new Map(submissions.map((s) => [s.dealId, s]));
  const runByDeal = new Map(runs.map((r) => [r.dealId, r]));
  const outputByDeal = new Map(outputs.map((r) => [r.dealId, r]));
  return rows.map((row) =>
    summary(
      workspaceId,
      row,
      firstByDeal.get(row.id),
      runByDeal.get(row.id),
      outputByDeal.get(row.id),
    ),
  );
}

export type ScreeningRunView = {
  id: string;
  status: RunStatus;
  // Set when the run succeeded.
  output: ScreeningOutput | null;
  // The stored failure (sanitised when it was written, §11.2).
  error: string | null;
  // The config version the run used: its rubric names the scored criteria.
  config: ActiveConfig;
  promptVersion: string | null;
  model: string | null;
  createdAt: Date;
  finishedAt: Date | null;
};

export type DealView = DealSummary & {
  screeningRun: ScreeningRunView | null;
};

// One deal for the Deal page, with its latest Screening run; null when the
// workspace has no such deal.
export async function getDealView(
  workspaceId: string,
  dealId: string,
): Promise<DealView | null> {
  const [rows, submissions, runs, outputs] = await Promise.all([
    dealRows(workspaceId, dealId),
    firstSubmissions(workspaceId, dealId),
    latestScreeningRuns(workspaceId, dealId),
    latestScreeningOutputs(workspaceId, dealId),
  ]);
  const [row] = rows;
  if (row === undefined) {
    return null;
  }
  const run = runs[0];
  return {
    ...summary(workspaceId, row, submissions[0], run, outputs[0]),
    screeningRun:
      run === undefined ? null : await screeningRun(workspaceId, run.id),
  };
}

async function screeningRun(
  workspaceId: string,
  runId: string,
): Promise<ScreeningRunView> {
  const [run] = await db()
    .select()
    .from(agentRun)
    .where(and(eq(agentRun.workspaceId, workspaceId), eq(agentRun.id, runId)));
  if (run === undefined) {
    throw new Error(`Run ${runId} not found in workspace ${workspaceId}`);
  }
  const output =
    run.status === "SUCCEEDED" ? parseOutput(workspaceId, run) : null;
  return {
    id: run.id,
    status: run.status,
    output,
    error: run.error,
    config: await getConfigVersion(workspaceId, run.configVersionId),
    promptVersion: run.promptVersion,
    model: run.model,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
  };
}

function parseOutput(
  workspaceId: string,
  run: { id: string; output: unknown },
): ScreeningOutput {
  const parsed = screeningOutputSchema.safeParse(run.output);
  if (!parsed.success) {
    // Paths only: the output holds founder content.
    throw new Error(
      `Screening run ${run.id} in workspace ${workspaceId} has an invalid output (${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")})`,
    );
  }
  return parsed.data;
}

export type DealDeck = {
  objectKey: string;
  etag: string;
};

// The deck on the deal's first submission, the one deal.received's
// Screening run read (§7.1: only a new deal emits deal.received); null when
// that submission had no deck or the workspace has no such deal.
export async function getDealDeck(
  workspaceId: string,
  dealId: string,
): Promise<DealDeck | null> {
  const [first] = await firstSubmissions(workspaceId, dealId);
  if (first === undefined || first.deckObjectKey === null) {
    return null;
  }
  if (first.deckEtag === null) {
    // submission_deck_with_etag makes this unreachable.
    throw new Error(`Deal ${dealId} has a deck without an ETag`);
  }
  return { objectKey: first.deckObjectKey, etag: first.deckEtag };
}
