"use client";

import { FileText } from "lucide-react";
import {
  useId,
  useState,
  type DragEvent,
  type SyntheticEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  presignResponseSchema,
  refusalResponseSchema,
  type RefusalResponse,
} from "@/lib/pitch/responses";
import { cn } from "@/lib/utils";

type Deck =
  | { status: "empty" }
  | { status: "uploading"; name: string }
  | { status: "ready"; name: string; sizeBytes: number; key: string };

type Submit = "idle" | "submitting" | "submitted";

const UPLOAD_FAILED =
  "Couldn't upload your deck. Check your connection and try again.";
const SUBMIT_FAILED =
  "Couldn't submit your pitch. Check your connection and try again.";

// Uploads the deck as soon as it's chosen (presign, then a PUT straight to
// storage), then submits the form with the upload's key. The file name stays
// in the browser: only the server-made key is sent.
export function PitchForm({
  slug,
  fundName,
  maxDeckBytes,
}: {
  slug: string;
  fundName: string;
  maxDeckBytes: number;
}) {
  const [deck, setDeck] = useState<Deck>({ status: "empty" });
  const [deckError, setDeckError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submit, setSubmit] = useState<Submit>("idle");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [dragging, setDragging] = useState(false);
  const deckHintId = useId();

  async function uploadDeck(file: File): Promise<void> {
    setDeckError(null);
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      setDeckError("Choose a PDF file.");
      return;
    }
    if (file.size === 0 || file.size > maxDeckBytes) {
      setDeckError(
        `Your deck must be a PDF of at most ${megabytes(maxDeckBytes)}.`,
      );
      return;
    }
    setDeck({ status: "uploading", name: file.name });
    try {
      const presigned = await fetch(
        `/api/pitch/${encodeURIComponent(slug)}/uploads`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sizeBytes: file.size }),
        },
      );
      if (!presigned.ok) {
        setDeck({ status: "empty" });
        setDeckError((await refusal(presigned))?.error ?? UPLOAD_FAILED);
        return;
      }
      const parsed = presignResponseSchema.safeParse(await presigned.json());
      if (!parsed.success) {
        console.error("Unexpected presign response", parsed.error);
        setDeck({ status: "empty" });
        setDeckError(UPLOAD_FAILED);
        return;
      }
      const upload = parsed.data;
      const put = await fetch(upload.url, {
        method: "PUT",
        headers: upload.headers,
        body: file,
      });
      if (!put.ok) {
        setDeck({ status: "empty" });
        setDeckError(UPLOAD_FAILED);
        return;
      }
      setDeck({
        status: "ready",
        name: file.name,
        sizeBytes: file.size,
        key: upload.key,
      });
    } catch (error) {
      // A network failure: shown to the founder, and logged for the console.
      console.error("Deck upload failed", error);
      setDeck({ status: "empty" });
      setDeckError(UPLOAD_FAILED);
    }
  }

  async function onSubmit(
    event: SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setFormError(null);
    if (deck.status !== "ready") {
      setDeckError(
        deck.status === "uploading"
          ? "Wait for your deck to finish uploading."
          : "Add your deck.",
      );
      return;
    }
    const data = new FormData(event.currentTarget);
    // Text fields only (the deck input has no name); the server refuses a
    // required field left empty.
    const field = (name: string) => {
      const value = data.get(name);
      return typeof value === "string" ? value.trim() : "";
    };
    const website = field("website");
    const roundSize = field("roundSizeUsd");
    const form = {
      companyName: field("companyName"),
      website: website === "" ? null : website,
      oneLiner: field("oneLiner"),
      roundSizeUsd: roundSize === "" ? null : Number(roundSize),
      founderName: field("founderName"),
      founderEmail: field("founderEmail"),
    };
    setSubmit("submitting");
    try {
      const response = await fetch(
        `/api/pitch/${encodeURIComponent(slug)}/submissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deckKey: deck.key, form, fax: field("fax") }),
        },
      );
      if (!response.ok) {
        setSubmit("idle");
        const refused = await refusal(response);
        if (refused?.reupload === true) {
          setDeck({ status: "empty" });
        }
        setFormError(refused?.error ?? SUBMIT_FAILED);
        return;
      }
      setSubmittedEmail(form.founderEmail);
      setSubmit("submitted");
    } catch (error) {
      console.error("Pitch submission failed", error);
      setSubmit("idle");
      setFormError(SUBMIT_FAILED);
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>): void {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file !== undefined && deck.status !== "uploading") {
      void uploadDeck(file);
    }
  }

  if (submit === "submitted") {
    return (
      <section aria-live="polite" className="mt-8 border-t pt-8">
        <h2 className="text-base font-semibold">Thanks, your pitch is in</h2>
        <p className="mt-1 text-muted-foreground">
          {fundName} has your deck. If the team would like to talk, they&apos;ll
          email you at <span className="text-foreground">{submittedEmail}</span>
          .
        </p>
      </section>
    );
  }

  const busy = deck.status === "uploading" || submit === "submitting";

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      className="mt-8 border-t pt-8"
    >
      {formError !== null && (
        <div
          role="alert"
          className="mb-6 rounded-md border border-danger/20 bg-danger-soft px-4 py-3 text-danger"
        >
          {formError}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="companyName" label="Company name">
          <Input
            id="companyName"
            name="companyName"
            required
            maxLength={200}
            autoComplete="organization"
          />
        </Field>
        <Field id="website" label="Website" hint="Optional">
          <Input
            id="website"
            name="website"
            type="url"
            maxLength={2048}
            placeholder="https://"
            autoComplete="url"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field
            id="oneLiner"
            label="What are you building?"
            hint="One sentence"
          >
            <Textarea
              id="oneLiner"
              name="oneLiner"
              required
              maxLength={280}
              rows={2}
            />
          </Field>
        </div>
        <Field id="roundSizeUsd" label="Round size (USD)" hint="Optional">
          <Input
            id="roundSizeUsd"
            name="roundSizeUsd"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            className="tabular"
            placeholder="1500000"
          />
        </Field>
        <div aria-hidden="true" className="hidden sm:block" />
        <Field id="founderName" label="Your name">
          <Input
            id="founderName"
            name="founderName"
            required
            maxLength={200}
            autoComplete="name"
          />
        </Field>
        <Field id="founderEmail" label="Your email">
          <Input
            id="founderEmail"
            name="founderEmail"
            type="email"
            required
            maxLength={320}
            autoComplete="email"
          />
        </Field>
      </div>

      <div className="mt-6 space-y-2">
        <p id={`${deckHintId}-label`} className="text-sm font-medium">
          Pitch deck
        </p>
        {deck.status === "ready" ? (
          <div className="flex items-center gap-3 rounded-md border px-4 py-3">
            <FileText
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{deck.name}</p>
              <p className="text-xs text-faint-foreground tabular">
                {megabytes(deck.sizeBytes)} · Uploaded
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setDeck({ status: "empty" });
              }}
            >
              Replace
            </Button>
          </div>
        ) : (
          <label
            htmlFor="deck"
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => {
              setDragging(false);
            }}
            onDrop={onDrop}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed border-input px-6 py-8 text-center focus-within:ring-3 focus-within:ring-ring/50 hover:bg-accent",
              dragging ? "bg-brand-soft" : "bg-subtle",
              deck.status === "uploading" && "cursor-wait",
            )}
          >
            <input
              id="deck"
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              aria-labelledby={`${deckHintId}-label`}
              aria-describedby={deckHintId}
              disabled={deck.status === "uploading"}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file !== undefined) {
                  void uploadDeck(file);
                }
              }}
            />
            {deck.status === "uploading" ? (
              <span aria-live="polite" className="text-muted-foreground">
                Uploading {deck.name}…
              </span>
            ) : (
              <span>
                Drag your deck here, or{" "}
                <span className="font-medium text-primary">choose a file</span>
              </span>
            )}
            <span id={deckHintId} className="text-xs text-faint-foreground">
              PDF, up to {megabytes(maxDeckBytes)}
            </span>
          </label>
        )}
        {deckError !== null && (
          <p role="alert" className="text-sm text-danger">
            {deckError}
          </p>
        )}
      </div>

      {/* Honeypot (§15.5): off-screen and skipped by keyboard and screen readers. */}
      <div
        aria-hidden="true"
        className="absolute -left-full size-px overflow-hidden"
      >
        <label htmlFor="fax">Fax</label>
        <input
          id="fax"
          name="fax"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <p className="mt-8 text-xs text-faint-foreground">
        Your deck and details go only to {fundName}. Files are stored privately
        and encrypted, and never get a public link. {fundName} uses Shortlist,
        which sends your deck and details to an AI provider (Google Gemini) to
        summarise pitches for the team; people make every decision. Your IP
        address is logged to prevent abuse of this form. To have your pitch
        deleted, contact {fundName}.
      </p>

      <Button type="submit" className="mt-6 w-full sm:w-auto" disabled={busy}>
        {submit === "submitting" ? "Submitting…" : "Submit pitch"}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {hint !== undefined && (
          <span className="font-normal text-faint-foreground">{hint}</span>
        )}
      </Label>
      {children}
    </div>
  );
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 1024 * 1024 ? 2 : 1).replace(/\.0+$/, "")} MB`;
}

// The route's refusal, or null when the response isn't one (a 500 page, a
// proxy error).
async function refusal(response: Response): Promise<RefusalResponse | null> {
  const body: unknown = await response.json().catch((error: unknown) => {
    console.error("Unreadable error response", error);
    return null;
  });
  const parsed = refusalResponseSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}
