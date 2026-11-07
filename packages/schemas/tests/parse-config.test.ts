import { describe, expect, it } from "vitest";
import { ConfigValidationError, parseWorkspaceConfig } from "../src/config";
import { validConfig } from "./config.fixture";

describe("parseWorkspaceConfig", () => {
  it("returns a valid config", () => {
    expect(parseWorkspaceConfig(validConfig())).toEqual(validConfig());
  });

  it("throws ConfigValidationError with every issue's path", () => {
    const config = validConfig();
    config.agents.screening.enabled = false;
    let caught: unknown;
    try {
      parseWorkspaceConfig({ ...config, thesis: "" });
    } catch (error) {
      caught = error;
    }
    if (!(caught instanceof ConfigValidationError)) {
      throw new Error("Expected ConfigValidationError");
    }
    expect(caught.issues.map((issue) => issue.path)).toEqual([
      ["thesis"],
      ["agents", "memo", "enabled"],
    ]);
  });
});
