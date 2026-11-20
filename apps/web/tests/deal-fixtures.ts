import type { DealView } from "@shortlist/db";
import { DEMO_DEALS, screenedStage } from "@shortlist/db/demo-deals";
import { kestrelConfig } from "@shortlist/db/kestrel-config";

// DealViews built from the seeded demo deals, as getDealView returns them,
// for rendering tests without a database.

export const NOW = new Date("2026-11-19T12:00:00Z");
const HOUR_MS = 3_600_000;

const config = {
  id: "00000000-0000-4000-8000-0000000000c1",
  version: 1,
  config: kestrelConfig({
    fintechAndDevtools: "00000000-0000-4000-8000-000000000001",
    climate: "00000000-0000-4000-8000-000000000002",
  }),
};

export function demoDealView(company: string): DealView {
  const index = DEMO_DEALS.findIndex((d) => d.company === company);
  const demo = DEMO_DEALS[index];
  if (demo === undefined) {
    throw new Error(`No demo deal ${company}`);
  }
  const result = demo.screening;
  const output = result?.status === "SUCCEEDED" ? result.output : null;
  const receivedAt = new Date(NOW.getTime() - demo.receivedHoursAgo * HOUR_MS);
  const finishedAt = new Date(receivedAt.getTime() + 95_000);
  const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
  return {
    id,
    companyName: demo.company,
    domain: demo.domain,
    stage: demo.moved?.to ?? screenedStage(output),
    profile: output?.profile ?? null,
    totalScore: output?.totalScore ?? null,
    receivedAt,
    channel: demo.channel,
    founderEmail: demo.founderEmail,
    oneLiner: demo.form?.oneLiner ?? null,
    founderName: demo.form?.founderName ?? null,
    hasDeck: demo.deck !== null,
    screening:
      result === null
        ? null
        : {
            status: result.status,
            finishedAt,
          },
    flags:
      output === null
        ? null
        : {
            hiddenText: output.hiddenSpans.length > 0,
            mismatch: output.mismatches.length > 0,
          },
    screeningRun:
      result === null
        ? null
        : {
            id: `${id.slice(0, -2)}ff`,
            status: result.status,
            output,
            error: result.status === "FAILED" ? result.error : null,
            config,
            promptVersion: null,
            model: null,
            createdAt: receivedAt,
            finishedAt,
          },
  };
}

export function demoDealViews(): DealView[] {
  return DEMO_DEALS.map((d) => demoDealView(d.company));
}
