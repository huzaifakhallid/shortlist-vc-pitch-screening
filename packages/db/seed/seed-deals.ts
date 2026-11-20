import {
  screeningOutputSchema,
  type ScreeningOutput,
  type ShortlistEvent,
} from "@shortlist/schemas";
import { count, eq } from "drizzle-orm";
import { single, withTransaction, type Tx } from "../client";
import {
  agentRun,
  company,
  deal,
  event,
  stageTransition,
  submission,
} from "../schema";
import { DEMO_DEALS, screenedStage, type DemoDeal } from "./demo-deals";
import { DEMO_DECKS } from "./demo-decks";
import type { DemoMemberKey } from "./demo-members";

const HOUR_MS = 3_600_000;
// How long a seeded Screening run took.
const RUN_MS = 95_000;

function screenedEvent(output: ScreeningOutput): ShortlistEvent {
  switch (output.mandate.outcome) {
    case "inside":
      return { type: "deal.screened", payload: {} };
    case "outside":
      return { type: "deal.out_of_mandate", payload: {} };
    case "undetermined":
      return { type: "deal.needs_review", payload: {} };
  }
}

// Seeds the demo deals into a workspace that has none, in one transaction,
// and returns how many it added; a workspace with deals is left unchanged
// (0). Rows are written directly, not through Intake and Screening: a
// synthetic workspace takes no pitches (receivePitch refuses it), and no
// model runs. The rows have the shape those agents write: company, deal,
// first submission with its deck, deal.received, a Screening run whose
// output parses with screeningOutputSchema, and its outcome event. Every
// event is already processed, so a worker started on this database doesn't
// dispatch them. Seeded runs record no model, prompt or usage (no call was
// made).
export async function seedDemoDeals(input: {
  workspaceId: string;
  configVersionId: string;
  members: Record<DemoMemberKey, string>;
  now: Date;
}): Promise<number> {
  return withTransaction(async (tx) => {
    const [existing] = await tx
      .select({ n: count() })
      .from(deal)
      .where(eq(deal.workspaceId, input.workspaceId));
    if (existing !== undefined && existing.n > 0) {
      return 0;
    }
    for (const demo of DEMO_DEALS) {
      await insertDemoDeal(tx, input, demo);
    }
    return DEMO_DEALS.length;
  });
}

async function insertDemoDeal(
  tx: Tx,
  input: Parameters<typeof seedDemoDeals>[0],
  demo: DemoDeal,
): Promise<void> {
  const { workspaceId } = input;
  const hoursAgo = (hours: number) =>
    new Date(input.now.getTime() - hours * HOUR_MS);
  const receivedAt = hoursAgo(demo.receivedHoursAgo);
  const finishedAt = new Date(receivedAt.getTime() + RUN_MS);
  const result = demo.screening;
  const output =
    result?.status === "SUCCEEDED"
      ? screeningOutputSchema.parse(result.output)
      : null;
  const screenedTo = screenedStage(output);

  const companyRow = single(
    await tx
      .insert(company)
      .values({
        workspaceId,
        name: demo.company,
        domainNormalized: demo.domain,
        createdAt: receivedAt,
      })
      .returning({ id: company.id }),
    `company ${demo.company}`,
  );
  const dealId = single(
    await tx
      .insert(deal)
      .values({
        workspaceId,
        companyId: companyRow.id,
        stage: demo.moved?.to ?? screenedTo,
        profile: output?.profile ?? null,
        totalScore: output?.totalScore ?? null,
        integrityFlag: output === null ? null : output.hiddenSpans.length > 0,
        createdAt: receivedAt,
      })
      .returning({ id: deal.id }),
    `deal ${demo.company}`,
  ).id;

  const deck = demo.deck === null ? null : DEMO_DECKS[demo.deck];
  await tx.insert(submission).values({
    workspaceId,
    dealId,
    channel: demo.channel,
    formData: demo.form,
    founderEmail: demo.founderEmail,
    deckObjectKey:
      deck === null ? null : `workspaces/${workspaceId}/decks/${deck.id}.pdf`,
    deckEtag: deck?.etag ?? null,
    createdAt: receivedAt,
  });

  const addEvent = async ({ type, payload }: ShortlistEvent, at: Date) =>
    single(
      await tx
        .insert(event)
        .values({
          workspaceId,
          dealId,
          type,
          payload,
          createdAt: at,
          processedAt: at,
        })
        .returning({ id: event.id }),
      `${type} event`,
    ).id;

  const receivedEventId = await addEvent(
    { type: "deal.received", payload: {} },
    receivedAt,
  );
  if (result !== null) {
    await tx.insert(agentRun).values({
      workspaceId,
      dealId,
      agent: "screening",
      triggerEventId: receivedEventId,
      configVersionId: input.configVersionId,
      status: result.status,
      output,
      error: result.status === "FAILED" ? result.error : null,
      tokensIn: 0,
      tokensOut: 0,
      costMicros: 0,
      latencyMs: RUN_MS,
      createdAt: receivedAt,
      startedAt: receivedAt,
      finishedAt,
    });
  }
  if (output !== null) {
    await addEvent(screenedEvent(output), finishedAt);
  }

  if (demo.moved !== null) {
    const movedAt = hoursAgo(demo.moved.hoursAgo);
    await tx.insert(stageTransition).values({
      workspaceId,
      dealId,
      from: screenedTo,
      to: demo.moved.to,
      userId: input.members[demo.moved.by],
      source: "dashboard",
      reason: demo.moved.reason,
      createdAt: movedAt,
    });
    await addEvent(
      {
        type: "deal.stage_changed",
        payload: { from: screenedTo, to: demo.moved.to, source: "dashboard" },
      },
      movedAt,
    );
  }
}
