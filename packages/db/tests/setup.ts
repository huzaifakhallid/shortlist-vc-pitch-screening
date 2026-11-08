import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeEach } from "vitest";
import { closeDb, db } from "../client";
import * as schema from "../schema";
import { testDatabaseUrl } from "./test-env";

// The client reads DATABASE_URL on first use, which comes after this file.
process.env.DATABASE_URL = testDatabaseUrl();

const tables = Object.values(schema)
  .filter((value) => is(value, PgTable))
  .map((table) => `"${getTableName(table)}"`)
  .join(", ");

beforeEach(async () => {
  await db().execute(sql.raw(`truncate ${tables} cascade`));
});

afterAll(async () => {
  await closeDb();
});
