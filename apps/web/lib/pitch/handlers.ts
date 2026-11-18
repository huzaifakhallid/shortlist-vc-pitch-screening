import {
  companyDomain,
  isFundEmail,
  normalizeEmail,
} from "@shortlist/agents-intake/steps/dedupe";
import {
  createPendingUpload,
  deletePendingUpload,
  getFundEmails,
  getPendingUpload,
  submitPitchForm,
  UploadNotConfirmableError,
  type Workspace,
} from "@shortlist/db";
import {
  InvalidUploadError,
  MAX_DECK_BYTES,
} from "@shortlist/integrations/storage";
import { pitchFormSchema, type PitchForm } from "@shortlist/schemas";
import { z } from "zod";
import { deckStorage } from "@/lib/deck-storage";
import { webEnv } from "@/lib/env";
import { clientIp, InvalidClientIpError } from "./client-ip";
import { pitchFormStatus } from "./form-status";
import { withinPitchRateLimits, type PitchAction } from "./rate-limits";
import type { PresignResponse, RefusalResponse } from "./responses";

// The public pitch form's two routes (§7.1, §15.3, §15.5). The workspace
// comes from the page's slug, resolved here; nothing in a request body names
// a workspace. Every refusal is JSON with a sentence the founder can act on
// (RefusalResponse); anything unexpected is thrown (a 500).

// How long a founder has, after choosing a deck, to submit the form. The
// presigned PUT itself expires sooner (UPLOAD_URL_EXPIRY_SECONDS).
export const PENDING_UPLOAD_TTL_SECONDS = 3600;
export const MAX_BODY_BYTES = 16 * 1024;

export const DECK_SIZE_MESSAGE = `Your deck must be a PDF of at most ${String(MAX_DECK_BYTES / (1024 * 1024))} MB.`;

class RefusedRequest extends Error {
  readonly status: number;
  readonly reupload: boolean;

  constructor(status: number, message: string, reupload = false) {
    super(message);
    this.name = "RefusedRequest";
    this.status = status;
    this.reupload = reupload;
  }
}

const presignBodySchema = z.strictObject({
  sizeBytes: z.int().positive().max(MAX_DECK_BYTES),
});

const submitBodySchema = z.strictObject({
  deckKey: z.string().min(1).max(200),
  form: pitchFormSchema,
  // Honeypot (§15.5): hidden from people, so it is empty unless a bot filled it.
  fax: z.string(),
});

export function presignDeck(request: Request, slug: string): Promise<Response> {
  return respond(async () => {
    const workspace = await openWorkspace(slug, request, "presign");
    const body = parseBody(
      presignBodySchema,
      await readJson(request),
      DECK_SIZE_MESSAGE,
    );
    const upload = await deckStorage().presignDeckUpload(
      workspace.id,
      body.sizeBytes,
    );
    await createPendingUpload(workspace.id, {
      objectKey: upload.key,
      sizeBytes: upload.sizeBytes,
      expiresInSeconds: PENDING_UPLOAD_TTL_SECONDS,
    });
    const response: PresignResponse = {
      key: upload.key,
      url: upload.url,
      headers: upload.headers,
    };
    return Response.json(response);
  });
}

// The confirm step and the submission in one request: the deck is verified
// against the size stored when it was presigned, then the upload is
// confirmed with its ETag in the same transaction as form.submitted.
export function submitPitch(request: Request, slug: string): Promise<Response> {
  return respond(async () => {
    const workspace = await openWorkspace(slug, request, "submit");
    const body = parseBody(
      submitBodySchema,
      await readJson(request),
      "Check the form and try again.",
    );
    if (body.fax !== "") {
      throw new RefusedRequest(400, "This submission was refused.");
    }
    assertIntakeAccepts(body.form);
    // Intake fails a pitch from the fund's own address or domain (§7.1);
    // refuse it here so the founder hears it now.
    if (
      isFundEmail(
        normalizeEmail(body.form.founderEmail),
        await getFundEmails(workspace.id),
      )
    ) {
      throw new RefusedRequest(
        400,
        "This email address belongs to the fund. Use the founder's own email.",
      );
    }

    const upload = await getPendingUpload(workspace.id, body.deckKey);
    if (upload === null) {
      throw new RefusedRequest(
        400,
        "Upload your deck before submitting.",
        true,
      );
    }
    if (upload.confirmed) {
      throw new RefusedRequest(409, "This deck was already submitted.");
    }
    if (upload.expired) {
      throw new RefusedRequest(
        400,
        "Your deck upload expired. Upload it again.",
        true,
      );
    }

    const storage = deckStorage();
    let etag: string;
    try {
      etag = await storage.verifyDeckUpload(
        workspace.id,
        upload.objectKey,
        upload.sizeBytes,
      );
    } catch (error) {
      if (!(error instanceof InvalidUploadError)) {
        throw error;
      }
      // Nothing stored yet: the upload may still be in flight, so the row
      // and key stay and the founder can submit again.
      if (error.reason === "not_uploaded") {
        throw new RefusedRequest(
          400,
          "Your deck hasn't finished uploading. Wait a moment and submit again.",
        );
      }
      // A stored object that isn't the presigned PDF is deleted, object
      // first, then its row (§15.3).
      await storage.deleteDeck(workspace.id, upload.objectKey);
      await deletePendingUpload(workspace.id, upload.objectKey);
      throw new RefusedRequest(400, `${error.message}. Upload it again.`, true);
    }

    try {
      await submitPitchForm(workspace.id, {
        objectKey: upload.objectKey,
        etag,
        form: body.form,
      });
    } catch (error) {
      if (error instanceof UploadNotConfirmableError) {
        throw new RefusedRequest(409, error.message, true);
      }
      throw error;
    }
    return Response.json({ submitted: true });
  });
}

async function respond(handle: () => Promise<Response>): Promise<Response> {
  try {
    return await handle();
  } catch (error) {
    if (error instanceof RefusedRequest) {
      const body: RefusalResponse = {
        error: error.message,
        reupload: error.reupload,
      };
      return Response.json(body, { status: error.status });
    }
    throw error;
  }
}

// Refusals before the body is read: a cross-site or non-JSON request, one
// without a small enough Content-Length, an unknown or closed form, then the
// rate limits.
async function openWorkspace(
  slug: string,
  request: Request,
  action: PitchAction,
): Promise<Workspace> {
  assertSameOriginJson(request.headers);
  assertBodyLength(request.headers);
  const form = await pitchFormStatus(slug);
  if (form.status === "not_found") {
    throw new RefusedRequest(404, "There's no pitch form at this address.");
  }
  if (form.status === "closed") {
    throw new RefusedRequest(
      403,
      `${form.workspace.name} isn't taking pitches through this form.`,
    );
  }
  let ip: string;
  try {
    ip = clientIp(request.headers);
  } catch (error) {
    if (error instanceof InvalidClientIpError) {
      throw new RefusedRequest(400, "This request was refused.");
    }
    throw error;
  }
  if (!(await withinPitchRateLimits(form.workspace.id, action, ip))) {
    throw new RefusedRequest(
      429,
      "Too many attempts from your connection. Try again in an hour.",
    );
  }
  return form.workspace;
}

// The form posts JSON from its own page (§15.5). A browser sends Origin on
// these POSTs; Sec-Fetch-Site covers one that doesn't. Anything else,
// including a client that sends neither, is refused.
function assertSameOriginJson(headers: Headers): void {
  const contentType = headers.get("content-type") ?? "";
  if (contentType.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    throw new RefusedRequest(415, "This request must be JSON.");
  }
  const origin = headers.get("origin");
  const sameOrigin =
    origin === null
      ? headers.get("sec-fetch-site") === "same-origin"
      : origin === new URL(webEnv().APP_URL).origin;
  if (!sameOrigin) {
    throw new RefusedRequest(403, "This request was refused.");
  }
}

function assertBodyLength(headers: Headers): void {
  const length = headers.get("content-length");
  if (length === null || !/^\d+$/.test(length)) {
    throw new RefusedRequest(411, "This request needs a Content-Length.");
  }
  if (Number(length) > MAX_BODY_BYTES) {
    throw new RefusedRequest(413, "This request is too large.");
  }
}

// Reads at most MAX_BODY_BYTES, whatever Content-Length claimed: the read
// stops at the cap.
async function readJson(request: Request): Promise<unknown> {
  if (request.body === null) {
    throw new RefusedRequest(400, "This request has no body.");
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RefusedRequest(413, "This request is too large.");
    }
    chunks.push(value);
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks),
    );
  } catch (error) {
    if (error instanceof TypeError) {
      throw new RefusedRequest(400, "This request isn't valid UTF-8.");
    }
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new RefusedRequest(400, "This request isn't valid JSON.");
    }
    throw error;
  }
}

// An invalid form field value carries the form's own message
// (pitchFormSchema); any other invalid body gets `message`.
function parseBody<T>(
  schema: z.ZodType<T>,
  input: unknown,
  message: string,
): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    // A wrong type is a malformed request, not a founder's mistake.
    const isFormField =
      issue?.path[0] === "form" &&
      issue.path.length === 2 &&
      issue.code !== "invalid_type";
    throw new RefusedRequest(400, isFormField ? issue.message : message);
  }
  return result.data;
}

// The website and email must pass Intake's own rules (§7.1), so a pitch the
// form accepts never fails Intake's run on them. Those functions throw only
// for invalid input, with a message that names the field, never its value.
function assertIntakeAccepts(form: PitchForm): void {
  for (const check of [
    () => companyDomain(form.website),
    () => normalizeEmail(form.founderEmail),
  ]) {
    try {
      check();
    } catch (error) {
      if (error instanceof Error) {
        throw new RefusedRequest(400, `${error.message}.`);
      }
      throw error;
    }
  }
}
