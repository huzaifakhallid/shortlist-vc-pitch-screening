import { dbEnvSchema, parseEnv } from "@shortlist/schemas";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

// Internal to packages/db: app code goes through access/* (CLAUDE.md).
export type Db = NodePgDatabase;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
// Reads that must also run inside a caller's transaction take one of these.
export type Executor = Db | Tx;

let connection: { pool: pg.Pool; db: Db } | null = null;

// Created on first use, so importing the package never needs DATABASE_URL.
export function db(): Db {
  if (connection === null) {
    const env = parseEnv(dbEnvSchema, process.env);
    const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
    connection = { pool, db: drizzle({ client: pool }) };
  }
  return connection.db;
}

export function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db().transaction(fn);
}

export async function closeDb(): Promise<void> {
  if (connection === null) {
    return;
  }
  const { pool } = connection;
  connection = null;
  await pool.end();
}

// For `const [row] = await ….returning()` under noUncheckedIndexedAccess.
export function single<T>(rows: readonly T[], what: string): T {
  const [row] = rows;
  if (row === undefined || rows.length > 1) {
    throw new Error(`Expected exactly one ${what}, got ${String(rows.length)}`);
  }
  return row;
}
