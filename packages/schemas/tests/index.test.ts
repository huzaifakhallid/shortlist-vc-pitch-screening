import { describe, expect, it } from "vitest";
import { SCHEMAS_PACKAGE } from "../src/index";

describe("@shortlist/schemas", () => {
  it("exports its package name", () => {
    expect(SCHEMAS_PACKAGE).toBe("@shortlist/schemas");
  });
});
