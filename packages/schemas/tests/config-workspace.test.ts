import { describe, expect, it } from "vitest";
import {
  ConfigValidationError,
  validateConfigAgainstWorkspace,
  type IntegrationKind,
  type WorkspaceConfig,
  type WorkspaceContext,
} from "../src/config";
import { validConfig } from "./config.fixture";

const connected: WorkspaceContext = {
  partnerUserIds: new Set(["user_a", "user_b"]),
  connectedIntegrations: new Set<IntegrationKind>(["slack", "hubspot"]),
};

function issuesOf(config: WorkspaceConfig, ctx: WorkspaceContext) {
  try {
    validateConfigAgainstWorkspace(config, ctx);
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      return error.issues;
    }
    throw error;
  }
  throw new Error("Expected ConfigValidationError");
}

describe("validateConfigAgainstWorkspace (stage 2)", () => {
  it("accepts a fully connected workspace", () => {
    expect(() => {
      validateConfigAgainstWorkspace(validConfig(), connected);
    }).not.toThrow();
  });

  it("accepts null integrations with nothing connected", () => {
    const config = validConfig();
    config.agents.pipeline.crm = null;
    config.agents.pipeline.slackChannel = null;
    expect(() => {
      validateConfigAgainstWorkspace(config, {
        ...connected,
        connectedIntegrations: new Set(),
      });
    }).not.toThrow();
  });

  it("rejects routing to a non-partner", () => {
    const config = validConfig();
    config.routing.climate = "user_c";
    expect(issuesOf(config, connected)).toEqual([
      {
        path: ["routing", "climate"],
        message: 'Routing target "user_c" is not a partner in this workspace',
      },
    ]);
  });

  it("rejects a default partner who is not a partner", () => {
    const config = validConfig();
    config.defaultPartnerId = "user_c";
    expect(issuesOf(config, connected)).toEqual([
      {
        path: ["defaultPartnerId"],
        message: 'Default partner "user_c" is not a partner in this workspace',
      },
    ]);
  });

  it("rejects a CRM that is not connected", () => {
    const config = validConfig();
    config.agents.pipeline.crm = "airtable";
    expect(issuesOf(config, connected)).toEqual([
      {
        path: ["agents", "pipeline", "crm"],
        message: 'CRM "airtable" is not connected',
      },
    ]);
  });

  it("rejects a Slack channel without Slack connected", () => {
    const ctx: WorkspaceContext = {
      ...connected,
      connectedIntegrations: new Set<IntegrationKind>(["hubspot"]),
    };
    expect(issuesOf(validConfig(), ctx)).toEqual([
      {
        path: ["agents", "pipeline", "slackChannel"],
        message: "Slack channel is set but Slack is not connected",
      },
    ]);
  });

  it("ignores integration settings while Pipeline is disabled", () => {
    const config = validConfig();
    config.agents.pipeline.enabled = false;
    expect(() => {
      validateConfigAgainstWorkspace(config, {
        ...connected,
        connectedIntegrations: new Set(),
      });
    }).not.toThrow();
  });

  it("collects every issue", () => {
    const config = validConfig();
    config.defaultPartnerId = "user_c";
    const issues = issuesOf(config, {
      partnerUserIds: new Set(["user_a"]),
      connectedIntegrations: new Set(),
    });
    expect(issues.map((issue) => issue.path.join("."))).toEqual([
      "routing.climate",
      "defaultPartnerId",
      "agents.pipeline.crm",
      "agents.pipeline.slackChannel",
    ]);
  });
});
