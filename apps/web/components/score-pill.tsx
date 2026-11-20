import { scoreTone } from "@/lib/deals/list";
import { cn } from "@/lib/utils";

// ui-design-system ScorePill: the weighted score (0-100), coloured by its
// band (SCORE_BANDS), with a meta label underneath.

export function ScorePill({
  score,
  label,
  size = "default",
}: {
  score: number | null;
  label: string;
  size?: "default" | "lg";
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-0.5 text-center">
      {score === null ? (
        <span
          className={cn(
            "inline-flex min-w-11 justify-center rounded-md bg-muted px-2 py-1 font-semibold text-faint-foreground",
            size === "lg" ? "text-2xl" : "text-base",
          )}
        >
          <span aria-hidden="true">–</span>
          <span className="sr-only">No score</span>
        </span>
      ) : (
        <span
          className={cn(
            "tabular inline-flex min-w-11 justify-center rounded-md px-2 py-1 font-semibold",
            size === "lg" ? "px-3 py-1.5 text-2xl" : "text-base",
            scoreTone(score),
          )}
        >
          {Math.round(score)}
        </span>
      )}
      <span className="text-xs text-faint-foreground">{label}</span>
    </div>
  );
}
