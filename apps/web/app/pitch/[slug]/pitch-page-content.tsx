import { MAX_DECK_BYTES } from "@shortlist/integrations/storage";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { pitchFormStatus } from "@/lib/pitch/form-status";
import { PitchForm } from "./pitch-form";

// The fund's header and its form, or why the form is closed (§7.1, §21).
export async function PitchPageContent({
  params,
}: {
  params: PageProps<"/pitch/[slug]">["params"];
}) {
  await connection();
  const { slug } = await params;
  const form = await pitchFormStatus(slug);
  if (form.status === "not_found") {
    notFound();
  }
  const fundName = form.workspace.name;

  return (
    <>
      <FundHeader fundName={fundName} open={form.status === "open"} />
      {form.status === "closed" ? (
        <p className="mt-8 border-t pt-8 text-muted-foreground">
          {fundName} isn&apos;t taking pitches through this form right now.
          Reach the team directly instead.
        </p>
      ) : (
        <PitchForm
          slug={slug}
          fundName={fundName}
          maxDeckBytes={MAX_DECK_BYTES}
        />
      )}
    </>
  );
}

function FundHeader({ fundName, open }: { fundName: string; open: boolean }) {
  return (
    <header>
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="grid size-11 place-items-center rounded-md border bg-subtle font-semibold text-muted-foreground"
        >
          {fundName.charAt(0).toUpperCase()}
        </div>
        <p className="text-base font-semibold">{fundName}</p>
      </div>
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">
        Submit your pitch
      </h1>
      {open && (
        <p className="mt-0.5 text-sm text-muted-foreground">
          Share your deck and a few details with {fundName}.
        </p>
      )}
    </header>
  );
}
