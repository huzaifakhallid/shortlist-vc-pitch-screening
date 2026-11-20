import type { ReactNode } from "react";

export function SectionHeading({
  children,
  aside,
  id,
}: {
  children: ReactNode;
  aside?: ReactNode;
  id: string;
}) {
  return (
    <div className="mt-8 mb-2 flex items-baseline gap-3">
      <h2 id={id} className="text-base font-semibold">
        {children}
      </h2>
      {aside !== undefined && <div className="ml-auto">{aside}</div>}
    </div>
  );
}
