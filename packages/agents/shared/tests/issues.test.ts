import { describe, expect, it } from "vitest";
import { z } from "zod";
import { describeIssues } from "../issues";

function issuesFor(schema: z.ZodType, value: unknown): string {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    throw new Error("Expected the value to be invalid");
  }
  return describeIssues(schema, parsed.error);
}

describe("describeIssues", () => {
  it("names schema keys and indices, with the expected type or bound", () => {
    const schema = z.strictObject({
      claims: z.array(z.strictObject({ page: z.int().min(1) })),
      score: z.int().max(5),
    });
    expect(
      issuesFor(schema, { claims: [{ page: 2 }, { page: 0 }], score: "high" }),
    ).toBe(
      "- claims[1].page: too_small (minimum 1)\n- score: invalid_type (expected number)",
    );
  });

  it("hides a record's keys, which come from the value", () => {
    const schema = z.strictObject({ scores: z.record(z.string(), z.int()) });
    expect(issuesFor(schema, { scores: { "IGNORE RULES": "x" } })).toBe(
      "- scores.(unexpected key): invalid_type (expected number)",
    );
  });

  it("counts unrecognized keys without naming them", () => {
    const schema = z.strictObject({ score: z.int() });
    const text = issuesFor(schema, { score: 1, "INJECTED key": 1, other: 2 });
    expect(text).toBe(
      "- (root): unrecognized_keys (2 keys the schema doesn't have)",
    );
  });

  it("reports an invalid union by its code", () => {
    const schema = z.strictObject({
      source: z.union([z.strictObject({ page: z.int() }), z.url()]),
    });
    expect(issuesFor(schema, { source: { snippet: "INJECTED" } })).toBe(
      "- source: invalid_union",
    );
  });

  it("hides a refinement path built from output text", () => {
    const schema = z
      .strictObject({ snippet: z.string() })
      .superRefine((value, ctx) => {
        ctx.addIssue({
          code: "custom",
          message: `Snippet "${value.snippet}" isn't on its page`,
          path: [value.snippet],
        });
      });
    const text = issuesFor(schema, { snippet: "IGNORE ALL RULES" });
    expect(text).toBe("- (unexpected key): custom");
  });
});
