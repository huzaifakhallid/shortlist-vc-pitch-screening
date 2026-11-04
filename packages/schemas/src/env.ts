import { z } from "zod";

// Only variables milestone 1 uses. Later milestones add theirs when they use them.
const databaseUrl = z.url({ protocol: /^postgres(ql)?$/ });
const authSecret = z.string().min(32);
const appUrl = z.url({ protocol: /^https?$/ });

export const webEnvSchema = z.object({
  DATABASE_URL: databaseUrl,
  AUTH_SECRET: authSecret,
  APP_URL: appUrl,
});
export type WebEnv = z.infer<typeof webEnvSchema>;

export const workerEnvSchema = z.object({
  DATABASE_URL: databaseUrl,
});
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

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
