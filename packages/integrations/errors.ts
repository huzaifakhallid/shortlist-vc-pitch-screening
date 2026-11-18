// A failed call to an external provider (add-integration skill). The message
// is built by the adapter (operation, HTTP status, provider error code), never
// copied from the provider's response, and the provider's raw error isn't
// kept. Status is null when no HTTP response arrived (network error, timeout).
export class IntegrationError extends Error {
  readonly provider: string;
  readonly status: number | null;
  // The provider's error code (e.g. S3 "NoSuchKey") and request id, for
  // support tickets. Null when the provider didn't send one.
  readonly code: string | null;
  readonly requestId: string | null;

  constructor(fields: {
    provider: string;
    status: number | null;
    message: string;
    code: string | null;
    requestId: string | null;
  }) {
    super(fields.message);
    this.name = "IntegrationError";
    this.provider = fields.provider;
    this.status = fields.status;
    this.code = fields.code;
    this.requestId = fields.requestId;
  }
}
