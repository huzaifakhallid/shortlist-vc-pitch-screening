import type { DealView } from "@shortlist/db";
import { CompanyAvatar } from "@/components/company-avatar";
import { ScorePill } from "@/components/score-pill";
import { Tag } from "@/components/tag";
import { STAGE_LABEL } from "@/lib/deals/list";
import { countryName, formatUsd, labelOf, timeAgo } from "@/lib/format";

const CHANNEL: Record<DealView["channel"], string> = {
  form: "pitch form",
  email: "email",
  api: "API",
  upload: "upload",
};

// The Deal page header: company, one-liner, profile tags, stage and score.
export function DealHeader({ deal, now }: { deal: DealView; now: Date }) {
  const { profile } = deal;
  return (
    <header className="flex flex-wrap items-start gap-4 border-b pb-5">
      <CompanyAvatar name={deal.companyName} size="lg" />
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {deal.companyName}
        </h1>
        {deal.oneLiner !== null && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {deal.oneLiner}
          </p>
        )}
        {profile !== null && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {profile.stage !== null && <Tag>{labelOf(profile.stage)}</Tag>}
            {profile.sector !== null && <Tag>{labelOf(profile.sector)}</Tag>}
            {profile.country !== null && (
              <Tag>{countryName(profile.country)}</Tag>
            )}
            {profile.roundSizeUsd !== null && (
              <Tag>{formatUsd(profile.roundSizeUsd)} round</Tag>
            )}
          </div>
        )}
        <p className="mt-2 text-xs text-faint-foreground">
          {STAGE_LABEL[deal.stage]} · Received {timeAgo(deal.receivedAt, now)}{" "}
          by {CHANNEL[deal.channel]}
          {deal.domain !== null && <> · {deal.domain}</>}
        </p>
      </div>
      <ScorePill score={deal.totalScore} label="of 100" size="lg" />
    </header>
  );
}
