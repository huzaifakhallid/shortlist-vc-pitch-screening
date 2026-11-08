import { dbTestEnvSchema, parseEnv } from "@shortlist/schemas";

// The tests wipe their database, so refuse any whose name doesn't end in _test.
export function testDatabaseUrl(): string {
  const { TEST_DATABASE_URL } = parseEnv(dbTestEnvSchema, process.env);
  const name = new URL(TEST_DATABASE_URL).pathname.slice(1);
  if (!name.endsWith("_test")) {
    throw new Error(
      `TEST_DATABASE_URL must name a database ending in "_test" (got "${name}"): the tests wipe it`,
    );
  }
  return TEST_DATABASE_URL;
}
