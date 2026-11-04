import { describe, expect, it } from "vitest";
import { parseEnv, webEnvSchema, workerEnvSchema } from "../src/env";

const validWebEnv = {
  DATABASE_URL: "postgres://shortlist:shortlist@localhost:5432/shortlist",
  AUTH_SECRET: "a".repeat(32),
  APP_URL: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("names every missing variable", () => {
    expect(() => parseEnv(webEnvSchema, {})).toThrow(
      "Missing or invalid environment variables: DATABASE_URL, AUTH_SECRET, APP_URL",
    );
  });

  it("names invalid variables", () => {
    expect(() =>
      parseEnv(webEnvSchema, {
        ...validWebEnv,
        DATABASE_URL: "mysql://localhost/shortlist",
        AUTH_SECRET: "short",
      }),
    ).toThrow(
      "Missing or invalid environment variables: DATABASE_URL, AUTH_SECRET",
    );
  });

  it("returns the web env when valid", () => {
    expect(parseEnv(webEnvSchema, { ...validWebEnv, PATH: "/bin" })).toEqual(
      validWebEnv,
    );
  });

  it("needs only DATABASE_URL for the worker", () => {
    expect(
      parseEnv(workerEnvSchema, { DATABASE_URL: validWebEnv.DATABASE_URL }),
    ).toEqual({ DATABASE_URL: validWebEnv.DATABASE_URL });
  });
});
