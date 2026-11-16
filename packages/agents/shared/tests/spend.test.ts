import { describe, expect, it } from "vitest";
import { assertUnderSpendCap, SpendCapReachedError } from "../spend";

describe("assertUnderSpendCap", () => {
  it("allows spend below the cap", () => {
    expect(() => {
      assertUnderSpendCap("ws-1", 0, 5_000_000);
    }).not.toThrow();
    expect(() => {
      assertUnderSpendCap("ws-1", 4_999_999, 5_000_000);
    }).not.toThrow();
  });

  it("refuses once spend reaches the cap", () => {
    expect(() => {
      assertUnderSpendCap("ws-1", 5_000_000, 5_000_000);
    }).toThrow(
      new SpendCapReachedError(
        "Workspace ws-1 reached its daily AI spend cap: 5000000 of 5000000 micro-dollars spent today (UTC)",
      ),
    );
  });

  it("refuses spend over the cap", () => {
    expect(() => {
      assertUnderSpendCap("ws-1", 5_000_123, 5_000_000);
    }).toThrow(SpendCapReachedError);
  });
});
