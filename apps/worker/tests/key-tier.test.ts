import { describe, expect, it } from "vitest";
import { assertKeyTierAllows } from "../src/key-tier";

const real = { id: "ws-real", synthetic: false };
const demo = { id: "ws-demo", synthetic: true };

describe("assertKeyTierAllows", () => {
  it("runs any workspace on a paid key", () => {
    expect(() => {
      assertKeyTierAllows("paid", real);
    }).not.toThrow();
    expect(() => {
      assertKeyTierAllows("paid", demo);
    }).not.toThrow();
  });

  it("runs a synthetic workspace on a free key", () => {
    expect(() => {
      assertKeyTierAllows("free", demo);
    }).not.toThrow();
  });

  it("refuses a workspace that isn't synthetic on a free key", () => {
    expect(() => {
      assertKeyTierAllows("free", real);
    }).toThrow(
      "Run refused: this worker's Gemini key is free tier (GEMINI_KEY_TIER=free), which runs synthetic workspaces only, and workspace ws-real isn't synthetic",
    );
  });
});
