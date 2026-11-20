import type { MandateCheck, MandateResult } from "@shortlist/schemas";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

const RULE_LABEL: Record<MandateCheck["rule"], string> = {
  stage: "Stage",
  sector: "Sector",
  country: "Country",
  roundSize: "Round size",
  exclusions: "Exclusions",
};

const STATUS: Record<MandateCheck["status"], { text: string; tone: string }> = {
  pass: { text: "Fits", tone: "bg-success-soft text-success" },
  fail: { text: "Outside", tone: "bg-danger-soft text-danger" },
  unknown: { text: "Unknown", tone: "bg-warning-soft text-warning" },
};

const OUTCOME: Record<
  MandateResult["outcome"],
  { text: string; tone: string }
> = {
  inside: { text: "Inside your focus", tone: "text-success" },
  outside: { text: "Outside your focus", tone: "text-danger" },
  undetermined: {
    text: "Needs review: details missing",
    tone: "text-warning",
  },
};

// §7.2 step 5: the rule-based mandate check, one row per rule. Plain code
// decided it, not the model.
export function MandateSection({ mandate }: { mandate: MandateResult }) {
  const outcome = OUTCOME[mandate.outcome];
  return (
    <section aria-labelledby="mandate-heading">
      <SectionHeading
        id="mandate-heading"
        aside={
          <span className={cn("text-sm font-medium", outcome.tone)}>
            {outcome.text}
          </span>
        }
      >
        Fit with your focus
      </SectionHeading>
      <ul>
        {mandate.checks.map((check) => {
          const status = STATUS[check.status];
          return (
            <li
              key={check.rule}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b py-2.5 last:border-b-0"
            >
              <span className="w-28 shrink-0 font-semibold">
                {RULE_LABEL[check.rule]}
              </span>
              <span
                className={cn(
                  "inline-flex w-16 shrink-0 justify-center rounded-md px-1.5 text-xs font-medium",
                  status.tone,
                )}
              >
                {status.text}
              </span>
              <span className="min-w-0 flex-1 basis-64 text-muted-foreground">
                {check.reason}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
