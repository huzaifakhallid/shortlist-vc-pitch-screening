import { initialOf } from "@/lib/format";
import { cn } from "@/lib/utils";

// The company's initial in a quiet square (no logos are fetched).
export function CompanyAvatar({
  name,
  size = "default",
}: {
  name: string;
  size?: "default" | "lg";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-md border bg-subtle font-semibold text-muted-foreground",
        size === "lg" ? "size-14 text-xl" : "size-11 text-base",
      )}
    >
      {initialOf(name)}
    </span>
  );
}
