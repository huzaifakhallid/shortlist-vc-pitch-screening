import { describe, expect, it } from "vitest";
import { workspaceConfigSchema } from "../src/config";
import { validConfig } from "./config.fixture";

function issuesOf(input: unknown) {
  const result = workspaceConfigSchema.safeParse(input);
  if (result.success) {
    throw new Error("Expected the config to be rejected");
  }
  return result.error.issues.map(({ path, message }) => ({ path, message }));
}

describe("workspaceConfigSchema (stage 1)", () => {
  it("accepts the full §13 example", () => {
    expect(workspaceConfigSchema.parse(validConfig())).toEqual(validConfig());
  });

  it("accepts null crm and slackChannel", () => {
    const config = validConfig();
    config.agents.pipeline.crm = null;
    config.agents.pipeline.slackChannel = null;
    expect(workspaceConfigSchema.safeParse(config).success).toBe(true);
  });

  it("rejects weights that do not sum to 100", () => {
    const config = validConfig();
    config.rubric = config.rubric.map((c) =>
      c.key === "team" ? { ...c, weight: 25 } : c,
    );
    expect(issuesOf(config)).toEqual([
      { path: ["rubric"], message: "Rubric weights must sum to 100 (got 95)" },
    ]);
  });

  it("rejects duplicate rubric keys", () => {
    const config = validConfig();
    config.rubric = config.rubric.map((c) =>
      c.key === "fit" ? { ...c, key: "team" } : c,
    );
    expect(issuesOf(config)).toEqual([
      { path: ["rubric", 4, "key"], message: 'Duplicate rubric key "team"' },
    ]);
  });

  it("rejects a missing anchor", () => {
    const config = validConfig();
    const input = {
      ...config,
      rubric: config.rubric.map((c) =>
        c.key === "traction"
          ? { ...c, anchors: { "1": c.anchors["1"], "5": c.anchors["5"] } }
          : c,
      ),
    };
    expect(issuesOf(input)).toEqual([
      {
        path: ["rubric", 1, "anchors", "3"],
        message: 'Anchor "3" is required',
      },
    ]);
  });

  it("rejects Memo enabled without Screening", () => {
    const config = validConfig();
    config.agents.screening.enabled = false;
    expect(issuesOf(config)).toEqual([
      {
        path: ["agents", "memo", "enabled"],
        message: "Memo needs Screening to be enabled",
      },
    ]);
  });

  it("rejects Diligence enabled without Screening", () => {
    const config = validConfig();
    config.agents.screening.enabled = false;
    config.agents.memo.enabled = false;
    config.agents.diligence.enabled = true;
    expect(issuesOf(config)).toEqual([
      {
        path: ["agents", "diligence", "enabled"],
        message: "Diligence needs Screening to be enabled",
      },
    ]);
  });

  it("rejects Comms auto-sending mandate declines without Screening", () => {
    const config = validConfig();
    config.agents.screening.enabled = false;
    config.agents.memo.enabled = false;
    config.agents.comms.autoSendMandateDeclines = true;
    expect(issuesOf(config)).toEqual([
      {
        path: ["agents", "comms", "autoSendMandateDeclines"],
        message: "Comms mandate declines need Screening to be enabled",
      },
    ]);
  });

  it("allows Comms without Screening when it does not auto-send declines", () => {
    const config = validConfig();
    config.agents.screening.enabled = false;
    config.agents.memo.enabled = false;
    expect(workspaceConfigSchema.safeParse(config).success).toBe(true);
  });

  it("allows auto-send declines without Screening when Comms is disabled", () => {
    const config = validConfig();
    config.agents.screening.enabled = false;
    config.agents.memo.enabled = false;
    config.agents.comms.enabled = false;
    config.agents.comms.autoSendMandateDeclines = true;
    expect(workspaceConfigSchema.safeParse(config).success).toBe(true);
  });

  it("rejects a round size whose min exceeds its max", () => {
    const config = validConfig();
    config.filters.roundSizeUsd = { min: 5000000, max: 3000000 };
    expect(issuesOf(config)).toEqual([
      {
        path: ["filters", "roundSizeUsd", "max"],
        message: "Maximum round size must be at least the minimum",
      },
    ]);
  });

  it("rejects a country that is not an alpha-2 code", () => {
    const config = validConfig();
    config.filters.countries = ["PAK"];
    expect(issuesOf(config)).toEqual([
      {
        path: ["filters", "countries", 0],
        message: "Country must be an ISO 3166-1 alpha-2 code",
      },
    ]);
  });

  it("rejects unknown keys", () => {
    expect(issuesOf({ ...validConfig(), extra: true })).toEqual([
      { path: [], message: 'Unrecognized key: "extra"' },
    ]);
  });
});
