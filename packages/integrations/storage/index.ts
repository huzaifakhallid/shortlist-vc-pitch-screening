import { S3Client } from "@aws-sdk/client-s3";
import type { StorageEnv } from "@shortlist/schemas";
import { deckStorage, type DeckStorage } from "./adapter";
import { s3ClientConfig } from "./client";

export {
  DECK_CONTENT_TYPE,
  DeckChangedError,
  InvalidUploadError,
  MAX_DECK_BYTES,
  UPLOAD_URL_EXPIRY_SECONDS,
  type DeckStorage,
  type DeckUpload,
} from "./adapter";
export { IntegrationError } from "../errors";

export function createDeckStorage(env: StorageEnv): DeckStorage {
  return deckStorage(new S3Client(s3ClientConfig(env)), env.R2_BUCKET);
}
