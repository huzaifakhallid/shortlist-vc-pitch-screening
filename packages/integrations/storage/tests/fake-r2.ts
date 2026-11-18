import { Readable } from "node:stream";
import { S3Client } from "@aws-sdk/client-s3";
import type { StorageEnv } from "@shortlist/schemas";
import { s3ClientConfig } from "../client";

export const TEST_ENV: StorageEnv = {
  R2_ENDPOINT:
    "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "test-access-key-id",
  R2_SECRET_ACCESS_KEY: "test-secret-access-key",
  R2_BUCKET: "shortlist-test",
};

// One HTTP response, in the shape the S3 API returns.
export type FixtureResponse = {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
};

export type SentRequest = {
  method: string;
  hostname: string;
  path: string;
  headers: Record<string, string>;
};

// An S3 client whose HTTP handler returns fixture responses in order (an
// Error fixture is thrown, like a socket failure) and records each request,
// so the real SDK serialises and parses with no network.
export function fakeR2(responses: (FixtureResponse | Error)[]): {
  client: S3Client;
  sent: SentRequest[];
} {
  const sent: SentRequest[] = [];
  const queue = [...responses];
  const client = new S3Client({
    ...s3ClientConfig(TEST_ENV),
    requestHandler: {
      handle(request: SentRequest) {
        sent.push({
          method: request.method,
          hostname: request.hostname,
          path: request.path,
          headers: request.headers,
        });
        const next = queue.shift();
        if (next === undefined) {
          throw new Error("fakeR2: no fixture response left");
        }
        if (next instanceof Error) {
          return Promise.reject(next);
        }
        return Promise.resolve({
          response: {
            statusCode: next.statusCode,
            headers: next.headers ?? {},
            body: Readable.from([Buffer.from(next.body ?? "")]),
          },
        });
      },
    },
  });
  return { client, sent };
}

export function pdfBytes(): Uint8Array {
  return new TextEncoder().encode("%PDF-1.7\n% synthetic test deck\n%%EOF\n");
}

// S3 error bodies (https://docs.aws.amazon.com/AmazonS3/latest/API/ErrorResponses.html),
// which R2 returns in the same shape.
export function s3ErrorXml(code: string, message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`;
}
