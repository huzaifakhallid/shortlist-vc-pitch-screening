import type { DealSummary } from "@shortlist/db";
import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { CompanyAvatar } from "@/components/company-avatar";
import { ScorePill } from "@/components/score-pill";
import { Tag } from "@/components/tag";
import { FLAGS, hasFlag, STAGE_LABEL } from "@/lib/deals/list";
import { countryName, formatUsd, labelOf, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

// What is happening to the deal now, in plain words.
export function dealStatus(deal: DealSummary): {
  text: string;
  failed: boolean;
} {
  if (!deal.hasDeck) {
    return { text: "Needs deck", failed: false };
  }
  const status = deal.screening?.status;
  if (status === "QUEUED" || status === "RUNNING") {
    return { text: "Screening…", failed: false };
  }
  if (status === "FAILED") {
    return { text: "Screening failed", failed: true };
  }
  if (deal.stage === "RECEIVED") {
    return { text: "Waiting for screening", failed: false };
  }
  return { text: STAGE_LABEL[deal.stage], failed: false };
}

// ui-design-system DealRow: one directory-style row per deal.
export function DealRow({ deal, now }: { deal: DealSummary; now: Date }) {
  const { profile } = deal;
  const status = dealStatus(deal);
  const flags = FLAGS.filter((flag) => hasFlag(deal, flag.key));

  return (
    <li>
      <Link
        href={`/deals/${deal.id}`}
        data-deal-row=""
        className="-mx-3 flex gap-4 rounded-md border-b px-3 py-5 outline-none hover:bg-accent focus-visible:bg-brand-soft focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CompanyAvatar name={deal.companyName} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-base font-semibold">{deal.companyName}</span>
            {profile?.country != null && (
              <span className="text-xs text-faint-foreground">
                {countryName(profile.country)}
              </span>
            )}
          </p>
          {deal.oneLiner !== null && (
            <p className="mt-0.5 text-muted-foreground">{deal.oneLiner}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {profile?.stage != null && <Tag>{labelOf(profile.stage)}</Tag>}
            {profile?.sector != null && <Tag>{labelOf(profile.sector)}</Tag>}
            {profile?.roundSizeUsd != null && (
              <Tag>{formatUsd(profile.roundSizeUsd)} round</Tag>
            )}
            {flags.map((flag) => (
              <span
                key={flag.key}
                className="inline-flex items-center gap-1 text-xs font-medium text-danger"
              >
                <CircleAlert aria-hidden="true" className="size-3.5" />
                {flag.label}
              </span>
            ))}
          </div>
        </div>
        <ScorePill score={deal.totalScore} label="score" />
        <div className="hidden w-28 shrink-0 text-right text-xs sm:block">
          <p
            className={cn(
              status.failed
                ? "font-medium text-danger"
                : "text-faint-foreground",
            )}
          >
            {status.text}
          </p>
          <p className="text-faint-foreground">
            {timeAgo(deal.receivedAt, now)}
          </p>
        </div>
      </Link>
    </li>
  );
}
