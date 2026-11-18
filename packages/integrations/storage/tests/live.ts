import { existsSync } from "node:fs";
import { S3Client } from "@aws-sdk/client-s3";
import { storageEnvSchema } from "@shortlist/schemas";
import { deckStorage } from "../adapter";
import { s3ClientConfig } from "../client";

// `pnpm test:integrations`: against the R2 bucket in the R2_* variables,
// checks that a presigned PUT refuses another type, another size and a second
// write, then verifies, reads and deletes one synthetic PDF. Skipped, naming
// the missing variables, when they aren't set. Runs only on a bucket whose
// name ends in "-dev".

const envFile = new URL("../../../../.env", import.meta.url);
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}
const parsed = storageEnvSchema.safeParse(process.env);
if (!parsed.success) {
  const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
  console.log(
    `SKIPPED storage live test: missing or invalid ${names.join(", ")}`,
  );
  process.exit(0);
}
const env = parsed.data;
if (!env.R2_BUCKET.endsWith("-dev")) {
  throw new Error(
    'Storage live test refused: R2_BUCKET must be a dev bucket (name ending in "-dev")',
  );
}

// A fixed fictional workspace, so test objects sit under one prefix.
const WORKSPACE = "00000000-0000-4000-8000-000000000000";
const storage = deckStorage(new S3Client(s3ClientConfig(env)), env.R2_BUCKET);
const body = new TextEncoder().encode(
  "%PDF-1.7\n% Shortlist storage live test (synthetic)\n%%EOF\n",
);

const upload = await storage.presignDeckUpload(WORKSPACE, body.length);

async function put(
  headers: Record<string, string>,
  bytes: Uint8Array,
): Promise<number> {
  const response = await fetch(upload.url, {
    method: "PUT",
    headers,
    body: bytes,
  });
  return response.status;
}

function expectRefused(what: string, status: number): void {
  if (status < 400) {
    throw new Error(`Presigned PUT accepted ${what} (HTTP ${String(status)})`);
  }
}

try {
  expectRefused(
    "a Content-Type it wasn't signed for",
    await put({ ...upload.headers, "Content-Type": "text/html" }, body),
  );
  const longer = new Uint8Array(body.length + 1);
  longer.set(body);
  expectRefused(
    "a size it wasn't signed for",
    await put(upload.headers, longer),
  );

  const status = await put(upload.headers, body);
  if (status >= 400) {
    throw new Error(`Presigned PUT failed: HTTP ${String(status)}`);
  }
  const etag = await storage.verifyDeckUpload(
    WORKSPACE,
    upload.key,
    body.length,
  );
  expectRefused(
    "a second write to a verified key",
    await put(upload.headers, body),
  );

  const read = await storage.readDeck(WORKSPACE, upload.key, etag);
  if (Buffer.compare(Buffer.from(read), Buffer.from(body)) !== 0) {
    throw new Error("readDeck returned different bytes from the upload");
  }
  console.log(
    "PASSED storage live test: type, size and overwrite refused; upload, verify, read",
  );
} finally {
  await storage.deleteDeck(WORKSPACE, upload.key);
}
