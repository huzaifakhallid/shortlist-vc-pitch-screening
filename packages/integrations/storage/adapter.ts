import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  type GetObjectCommandInput,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { IntegrationError } from "../errors";
import { storageCall } from "./client";
import { assertDeckKey, newDeckKey } from "./keys";

// Deck uploads (§15.3): PDF only, at most 25 MiB, upload URLs expire in
// 5 minutes, and the stored file must start with the PDF magic bytes.
export const DECK_CONTENT_TYPE = "application/pdf";
export const MAX_DECK_BYTES = 25 * 1024 * 1024;
export const UPLOAD_URL_EXPIRY_SECONDS = 300;
// Viewing a deck in the dashboard (§15.3): a 60-second presigned GET, made
// after authorization.
export const VIEW_URL_EXPIRY_SECONDS = 60;
const PDF_MAGIC = new TextEncoder().encode("%PDF-");

// A presigned PUT. Content-Type, Content-Length and If-None-Match are signed
// headers: the upload must send exactly `headers` and the declared size, and
// R2 refuses a second write to the key.
export type DeckUpload = {
  key: string;
  url: string;
  headers: {
    "Content-Type": typeof DECK_CONTENT_TYPE;
    "If-None-Match": "*";
  };
  sizeBytes: number;
};

// An upload that doesn't match what was presigned, or isn't a PDF. Its
// message is safe to show the person uploading. `reason` "not_uploaded"
// means no object exists (yet): there is nothing to delete, and the upload
// may still be in flight. The other reasons mean the stored object is
// unusable and the caller deletes it.
export type InvalidUploadReason = "not_uploaded" | "size" | "type";

export class InvalidUploadError extends Error {
  readonly reason: InvalidUploadReason;

  constructor(reason: InvalidUploadReason, message: string) {
    super(message);
    this.name = "InvalidUploadError";
    this.reason = reason;
  }
}

// The object no longer has the ETag it was verified with (R2 answered 412).
export class DeckChangedError extends Error {
  constructor(key: string) {
    super(`Storage: ${key} changed after it was verified (ETag mismatch)`);
    this.name = "DeckChangedError";
  }
}

export type DeckStorage = {
  presignDeckUpload(
    workspaceId: string,
    sizeBytes: number,
  ): Promise<DeckUpload>;
  // Returns the verified object's ETag; later reads pass it, so the deck that
  // was verified is the one that is read. Throws InvalidUploadError when
  // nothing was uploaded ("not_uploaded") or the object isn't a PDF of the
  // declared size ("size", "type"). The caller deletes a rejected object
  // (deleteDeck), never a "not_uploaded" one.
  verifyDeckUpload(
    workspaceId: string,
    key: string,
    sizeBytes: number,
  ): Promise<string>;
  readDeck(workspaceId: string, key: string, etag: string): Promise<Uint8Array>;
  // A GET URL the browser fetches the deck with, valid for
  // VIEW_URL_EXPIRY_SECONDS. R2 answers it as an inline PDF whatever the
  // object's metadata says. No If-Match is signed: objects are written once
  // (If-None-Match on the upload), and the browser couldn't send one
  // without a CORS preflight.
  presignDeckView(workspaceId: string, key: string): Promise<string>;
  deleteDeck(workspaceId: string, key: string): Promise<void>;
};

export function hasPdfMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= PDF_MAGIC.length &&
    PDF_MAGIC.every((byte, i) => bytes[i] === byte)
  );
}

function assertDeckSize(sizeBytes: number): void {
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    throw new InvalidUploadError(
      "size",
      "The deck's size must be a positive number of bytes",
    );
  }
  if (sizeBytes > MAX_DECK_BYTES) {
    throw new InvalidUploadError(
      "size",
      `The deck is larger than ${String(MAX_DECK_BYTES / (1024 * 1024))} MB`,
    );
  }
}

export function deckStorage(client: S3Client, bucket: string): DeckStorage {
  return {
    async presignDeckUpload(workspaceId, sizeBytes) {
      assertDeckSize(sizeBytes);
      const key = newDeckKey(workspaceId);
      // Presigned URLs on R2 (PUT with signed Content-Type):
      // https://developers.cloudflare.com/r2/api/s3/presigned-urls/
      // Conditional PUT (If-None-Match: *) refuses to overwrite a key:
      // https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html
      // (R2's support: https://developers.cloudflare.com/r2/api/s3/api/)
      // Presigning is local signing (SigV4 query parameters); no request is made.
      const url = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: DECK_CONTENT_TYPE,
          ContentLength: sizeBytes,
          IfNoneMatch: "*",
        }),
        {
          expiresIn: UPLOAD_URL_EXPIRY_SECONDS,
          // The presigner leaves Content-Type unsigned by default; signing it
          // makes R2 reject an upload of another type.
          signableHeaders: new Set(["content-type"]),
        },
      );
      return {
        key,
        url,
        headers: { "Content-Type": DECK_CONTENT_TYPE, "If-None-Match": "*" },
        sizeBytes,
      };
    },

    async verifyDeckUpload(workspaceId, key, sizeBytes) {
      assertDeckKey(workspaceId, key);
      assertDeckSize(sizeBytes);
      // HeadObject: https://developers.cloudflare.com/r2/api/s3/api/
      const head = await storageCall("HeadObject", () =>
        client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })),
      ).catch((error: unknown) => {
        if (error instanceof IntegrationError && error.status === 404) {
          throw new InvalidUploadError("not_uploaded", "No deck was uploaded");
        }
        throw error;
      });
      if (head.ContentLength !== sizeBytes) {
        throw new InvalidUploadError(
          "size",
          "The uploaded deck's size doesn't match the declared size",
        );
      }
      if (head.ContentType !== DECK_CONTENT_TYPE) {
        throw new InvalidUploadError("type", "The uploaded deck isn't a PDF");
      }
      const etag = head.ETag;
      if (etag === undefined) {
        throw new Error(`Storage: HeadObject returned no ETag for ${key}`);
      }
      // The first bytes of the same object (ranged GetObject, If-Match).
      const start = await getObjectBytes(
        client,
        {
          Bucket: bucket,
          Key: key,
          Range: `bytes=0-${String(PDF_MAGIC.length - 1)}`,
          IfMatch: etag,
        },
        PDF_MAGIC.length,
      );
      if (!hasPdfMagic(start)) {
        throw new InvalidUploadError("type", "The uploaded deck isn't a PDF");
      }
      return etag;
    },

    async readDeck(workspaceId, key, etag) {
      assertDeckKey(workspaceId, key);
      // GetObject: https://developers.cloudflare.com/r2/api/s3/api/
      const bytes = await getObjectBytes(
        client,
        { Bucket: bucket, Key: key, IfMatch: etag },
        MAX_DECK_BYTES,
      );
      if (!hasPdfMagic(bytes)) {
        throw new Error(`Storage: ${key} is not a PDF`);
      }
      return bytes;
    },

    async presignDeckView(workspaceId, key) {
      assertDeckKey(workspaceId, key);
      // Response header overrides on a presigned GET:
      // https://developers.cloudflare.com/r2/api/s3/presigned-urls/
      // Presigning is local signing; no request is made.
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentType: DECK_CONTENT_TYPE,
          ResponseContentDisposition: 'inline; filename="deck.pdf"',
          ResponseCacheControl: "private, no-store",
        }),
        { expiresIn: VIEW_URL_EXPIRY_SECONDS },
      );
    },

    async deleteDeck(workspaceId, key) {
      assertDeckKey(workspaceId, key);
      // DeleteObject: https://developers.cloudflare.com/r2/api/s3/api/
      await storageCall("DeleteObject", () =>
        client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
      );
    },
  };
}

// GetObject with If-Match. The response's length is checked against
// maxBytes before the body is read, so an oversized object is never buffered.
async function getObjectBytes(
  client: S3Client,
  input: GetObjectCommandInput & { Key: string; IfMatch: string },
  maxBytes: number,
): Promise<Uint8Array> {
  const object = await storageCall("GetObject", () =>
    client.send(new GetObjectCommand(input)),
  ).catch((error: unknown) => {
    if (error instanceof IntegrationError && error.status === 412) {
      throw new DeckChangedError(input.Key);
    }
    throw error;
  });
  const body = object.Body;
  if (body === undefined) {
    throw new Error("Storage: GetObject returned no body");
  }
  if (object.ContentLength === undefined || object.ContentLength > maxBytes) {
    // Abort the unread stream, so the connection isn't left open.
    body
      .transformToWebStream()
      .cancel()
      .catch((error: unknown) => {
        console.error(
          "Storage: cancelling an unread GetObject body failed",
          error,
        );
      });
    throw new Error(
      `Storage: ${input.Key} has no length or is larger than ${String(maxBytes)} bytes`,
    );
  }
  // Reading the body is part of the call: a dropped connection fails here.
  return storageCall("GetObject", () => body.transformToByteArray());
}
