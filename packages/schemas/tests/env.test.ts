import { describe, expect, it } from "vitest";
import { parseEnv, webEnvSchema, workerEnvSchema } from "../src/env";

const validWebEnv = {
  DATABASE_URL: "postgres://shortlist:shortlist@localhost:5432/shortlist",
  AUTH_SECRET: "a".repeat(32),
  APP_URL: "http://localhost:3000",
  DEMO_LOGINS: "false",
};

describe("parseEnv", () => {
  it("names every missing variable", () => {
    expect(() => parseEnv(webEnvSchema, {})).toThrow(
      "Missing or invalid environment variables: DATABASE_URL, AUTH_SECRET, APP_URL, DEMO_LOGINS",
    );
  });

  it("names invalid variables", () => {
    expect(() =>
      parseEnv(webEnvSchema, {
        ...validWebEnv,
        DATABASE_URL: "mysql://localhost/shortlist",
        AUTH_SECRET: "short",
        DEMO_LOGINS: "1",
      }),
    ).toThrow(
      "Missing or invalid environment variables: DATABASE_URL, AUTH_SECRET, DEMO_LOGINS",
    );
  });

  it("returns the web env when valid", () => {
    expect(parseEnv(webEnvSchema, { ...validWebEnv, PATH: "/bin" })).toEqual({
      ...validWebEnv,
      DEMO_LOGINS: false,
    });
  });

  it("reads DEMO_LOGINS as a boolean", () => {
    expect(
      parseEnv(webEnvSchema, { ...validWebEnv, DEMO_LOGINS: "true" })
        .DEMO_LOGINS,
    ).toBe(true);
  });

  it("needs the database, the Gemini key, LLM_RPM and the key tier for the worker", () => {
    const worker = {
      DATABASE_URL: validWebEnv.DATABASE_URL,
      GEMINI_API_KEY: "test-key",
      LLM_RPM: "10",
      GEMINI_KEY_TIER: "free",
    };
    expect(parseEnv(workerEnvSchema, worker)).toEqual({
      ...worker,
      LLM_RPM: 10,
    });
    expect(() =>
      parseEnv(workerEnvSchema, { DATABASE_URL: validWebEnv.DATABASE_URL }),
    ).toThrow(
      "Missing or invalid environment variables: GEMINI_API_KEY, LLM_RPM, GEMINI_KEY_TIER",
    );
    for (const rpm of ["0", "", "2.5", "ten"]) {
      expect(() =>
        parseEnv(workerEnvSchema, { ...worker, LLM_RPM: rpm }),
      ).toThrow("Missing or invalid environment variables: LLM_RPM");
    }
  });

  it("takes only free or paid as GEMINI_KEY_TIER", () => {
    const worker = {
      DATABASE_URL: validWebEnv.DATABASE_URL,
      GEMINI_API_KEY: "test-key",
      LLM_RPM: "10",
    };
    expect(
      parseEnv(workerEnvSchema, { ...worker, GEMINI_KEY_TIER: "paid" })
        .GEMINI_KEY_TIER,
    ).toBe("paid");
    for (const tier of ["", "FREE", "billing", "true"]) {
      expect(() =>
        parseEnv(workerEnvSchema, { ...worker, GEMINI_KEY_TIER: tier }),
      ).toThrow("Missing or invalid environment variables: GEMINI_KEY_TIER");
    }
  });
});
