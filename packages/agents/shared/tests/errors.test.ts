import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_ERROR_LENGTH, sanitiseError } from "../errors";

const internal = /^Internal error \(ref [0-9a-f-]{36}\)$/;

describe("sanitiseError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps an error's message", () => {
    expect(sanitiseError(new Error("Rubric has no anchors"))).toBe(
      "Rubric has no anchors",
    );
  });

  it("caps a long message", () => {
    const text = sanitiseError(new Error("x".repeat(5000)));
    expect(text).toHaveLength(MAX_ERROR_LENGTH);
    expect(text.endsWith("...")).toBe(true);
  });

  it("replaces a database error with a reference and logs it in full", () => {
    const log = vi.spyOn(console, "error").mockReturnValue(undefined);
    const query = Object.assign(
      new Error('Failed query: insert into "event" ...\nparams: secret'),
      { query: 'insert into "event"', params: ["secret"] },
    );
    const wrapped = new Error("outer", {
      cause: Object.assign(new Error("violates check"), { severity: "ERROR" }),
    });

    for (const error of [query, wrapped]) {
      const text = sanitiseError(error);
      expect(text).toMatch(internal);
      expect(text).not.toContain("secret");
      expect(log).toHaveBeenLastCalledWith(`${text}:`, error);
    }
  });

  it("replaces a thrown non-Error with a reference", () => {
    vi.spyOn(console, "error").mockReturnValue(undefined);
    expect(sanitiseError("plain string")).toMatch(internal);
    expect(sanitiseError({ code: 42 })).toMatch(internal);
  });
});
