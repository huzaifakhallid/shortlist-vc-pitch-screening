import { z } from "zod";

// Only variables milestone 1 uses. Later milestones add theirs when they use them.
const databaseUrl = z.url({ protocol: /^postgres(ql)?$/ });
const authSecret = z.string().min(32);
const appUrl = z.url({ protocol: /^https?$/ });
// An explicit "true" or "false": a flag that opens sign-in has no default.
const flag = z.enum(["true", "false"]).transform((value) => value === "true");

export const geminiKeyTierSchema = z.enum(["free", "paid"]);
export type GeminiKeyTier = z.infer<typeof geminiKeyTierSchema>;

// Deck storage on Cloudflare R2 through its S3 API (§10.3, §15.3). Not yet
// part of the web or worker env: the web app adds it with the upload route,
// the worker with Screening's deck reads.
export const storageEnvSchema = z.object({
  // The account's S3 API endpoint, https://<ACCOUNT_ID>.r2.cloudflarestorage.com
  R2_ENDPOINT: z.url({ protocol: /^https$/ }),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  // S3 bucket naming: 3-63 lowercase letters, digits and hyphens.
  R2_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
});
export type StorageEnv = z.infer<typeof storageEnvSchema>;

export const webEnvSchema = z.object({
  DATABASE_URL: databaseUrl,
  AUTH_SECRET: authSecret,
  APP_URL: appUrl,
  // One-click sign-in as the seeded demo personas (§23.1). Local and demo only.
  DEMO_LOGINS: flag,
});
export type WebEnv = z.infer<typeof webEnvSchema>;

export const workerEnvSchema = z.object({
  DATABASE_URL: databaseUrl,
  // A free-tier key only ever sees synthetic data (§14.4, §15.4).
  GEMINI_API_KEY: z.string().min(1),
  // Model requests per minute for this worker process (§14.4).
  LLM_RPM: z.coerce.number().int().positive(),
  // The Gemini key's tier. On "free" the worker refuses runs for any
  // workspace that isn't synthetic (§14.4, §15.4). No default: the operator
  // states it.
  GEMINI_KEY_TIER: geminiKeyTierSchema,
});
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

// packages/db: the client and drizzle-kit.
export const dbEnvSchema = z.object({
  DATABASE_URL: databaseUrl,
});
export type DbEnv = z.infer<typeof dbEnvSchema>;

// packages/db tests. A separate database, because the tests wipe it.
export const dbTestEnvSchema = z.object({
  TEST_DATABASE_URL: databaseUrl,
});
export type DbTestEnv = z.infer<typeof dbTestEnvSchema>;

// Throws one error naming every missing or invalid variable. Values are never
// included in the message, since they may be secrets.
export function parseEnv<S extends z.ZodObject>(
  schema: S,
  source: Readonly<Record<string, string | undefined>>,
): z.infer<S> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
    ];
    throw new Error(
      `Missing or invalid environment variables: ${names.join(", ")}`,
    );
  }
  return result.data;
}
