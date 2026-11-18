import { S3ServiceException, type S3ClientConfig } from "@aws-sdk/client-s3";
import type { StorageEnv } from "@shortlist/schemas";
import { IntegrationError } from "../errors";

export const STORAGE_PROVIDER = "r2";

// R2's S3 API with the AWS SDK v3: region "auto" and the account endpoint.
// https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
// https://developers.cloudflare.com/r2/api/s3/api/
export function s3ClientConfig(env: StorageEnv): S3ClientConfig {
  return {
    region: "auto",
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    // Checksums only where an operation requires them. With the SDK's default
    // ("WHEN_SUPPORTED") a presigned PUT carries a CRC32 checksum of an empty
    // body, so a browser upload of the real file fails.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    // No SDK retries: the worker's job retries with backoff (§11.2), and the
    // web app reports the failure to the person uploading.
    maxAttempts: 1,
  };
}

// Node socket errors that mean no response arrived. The SDK's HTTP handler
// renames ECONNRESET, EPIPE and ETIMEDOUT to TimeoutError; the rest keep their
// code (@smithy/node-http-handler).
const NETWORK_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "ETIMEDOUT",
]);

function networkErrorName(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }
  if (error.name === "TimeoutError") {
    return error.name;
  }
  const code = "code" in error ? error.code : undefined;
  return typeof code === "string" && NETWORK_ERROR_CODES.has(code)
    ? code
    : null;
}

// Runs one S3 call. An S3 error response or a network failure becomes an
// IntegrationError with a message we build (operation, HTTP status, S3 error
// code); the SDK's error object isn't kept. Anything else (a bug in our code
// or the SDK) is rethrown unchanged.
export async function storageCall<T>(
  operation: string,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof S3ServiceException) {
      const status = error.$metadata.httpStatusCode ?? null;
      throw new IntegrationError({
        provider: STORAGE_PROVIDER,
        status,
        message: `R2 ${operation} failed: HTTP ${String(status)} ${error.name}`,
        code: error.name,
        requestId: error.$metadata.requestId ?? null,
      });
    }
    const network = networkErrorName(error);
    if (network !== null) {
      throw new IntegrationError({
        provider: STORAGE_PROVIDER,
        status: null,
        message: `R2 ${operation} failed: no response (${network})`,
        code: null,
        requestId: null,
      });
    }
    throw error;
  }
}
