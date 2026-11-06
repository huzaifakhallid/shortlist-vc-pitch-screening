import { z } from "zod";

// The workspace configuration (§13), validated in two stages:
// 1. workspaceConfigSchema: from the config alone (shape, rubric, §8.3 rules).
// 2. validateConfigAgainstWorkspace: against the workspace's partners and
//    connected integrations, which the save path loads from the database.

const nonEmpty = z.string().min(1);

const anchor = (score: "1" | "3" | "5") =>
  z
    .string({ error: `Anchor "${score}" is required` })
    .min(1, `Anchor "${score}" must not be empty`);

const criterionSchema = z.strictObject({
  key: nonEmpty,
  label: nonEmpty,
  weight: z.int().min(1).max(100),
  question: nonEmpty,
  anchors: z.strictObject({
    "1": anchor("1"),
    "3": anchor("3"),
    "5": anchor("5"),
  }),
});

const filtersSchema = z.strictObject({
  stages: z.array(nonEmpty),
  sectors: z.array(nonEmpty),
  countries: z.array(
    z
      .string()
      .regex(/^[A-Z]{2}$/, "Country must be an ISO 3166-1 alpha-2 code"),
  ),
  roundSizeUsd: z
    .strictObject({ min: z.int().min(0), max: z.int().min(0) })
    .refine((round) => round.min <= round.max, {
      path: ["max"],
      message: "Maximum round size must be at least the minimum",
    }),
  excludedSectors: z.array(nonEmpty),
});

export const integrationKindSchema = z.enum([
  "slack",
  "hubspot",
  "airtable",
  "sheets",
  "postmark_domain",
]);
export type IntegrationKind = z.infer<typeof integrationKindSchema>;

// §12 integration.status. Only "connected" counts for stage 2.
export const integrationStatusSchema = z.enum([
  "connected",
  "error",
  "disconnected",
]);
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;

const agentsSchema = z.strictObject({
  intake: z.strictObject({
    enabled: z.boolean(),
    channels: z.array(z.enum(["form", "email"])).min(1),
  }),
  screening: z.strictObject({ enabled: z.boolean() }),
  research: z.strictObject({ enabled: z.boolean() }),
  memo: z.strictObject({
    enabled: z.boolean(),
    sections: z.array(nonEmpty).min(1),
  }),
  comms: z.strictObject({
    enabled: z.boolean(),
    autoSendMandateDeclines: z.boolean(),
    voice: nonEmpty,
  }),
  pipeline: z.strictObject({
    enabled: z.boolean(),
    crm: z.enum(["hubspot", "airtable", "sheets"]).nullable(),
    slackChannel: nonEmpty.nullable(),
    slackScoreThreshold: z.number().min(0).max(100),
    weeklyDigest: z
      .string()
      .regex(
        /^(MON|TUE|WED|THU|FRI|SAT|SUN) ([01]\d|2[0-3]):[0-5]\d$/,
        'Weekly digest must look like "MON 09:00"',
      ),
  }),
  diligence: z.strictObject({
    enabled: z.boolean(),
    checklist: z.array(nonEmpty).min(1),
  }),
});

export const workspaceConfigSchema = z
  .strictObject({
    thesis: nonEmpty,
    filters: filtersSchema,
    rubric: z.array(criterionSchema).min(1),
    agents: agentsSchema,
    routing: z.record(nonEmpty, nonEmpty),
    defaultPartnerId: nonEmpty,
  })
  .superRefine((config, ctx) => {
    const totalWeight = config.rubric.reduce((sum, c) => sum + c.weight, 0);
    if (totalWeight !== 100) {
      ctx.addIssue({
        code: "custom",
        path: ["rubric"],
        message: `Rubric weights must sum to 100 (got ${String(totalWeight)})`,
      });
    }

    const seenKeys = new Set<string>();
    config.rubric.forEach((criterion, index) => {
      if (seenKeys.has(criterion.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["rubric", index, "key"],
          message: `Duplicate rubric key "${criterion.key}"`,
        });
      }
      seenKeys.add(criterion.key);
    });

    // Dependency rules (§8.3).
    const { agents } = config;
    if (!agents.screening.enabled) {
      if (agents.memo.enabled) {
        ctx.addIssue({
          code: "custom",
          path: ["agents", "memo", "enabled"],
          message: "Memo needs Screening to be enabled",
        });
      }
      if (agents.diligence.enabled) {
        ctx.addIssue({
          code: "custom",
          path: ["agents", "diligence", "enabled"],
          message: "Diligence needs Screening to be enabled",
        });
      }
      if (agents.comms.enabled && agents.comms.autoSendMandateDeclines) {
        ctx.addIssue({
          code: "custom",
          path: ["agents", "comms", "autoSendMandateDeclines"],
          message: "Comms mandate declines need Screening to be enabled",
        });
      }
    }
  });
export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>;

export type ConfigIssue = {
  readonly path: readonly (string | number)[];
  readonly message: string;
};

export class ConfigValidationError extends Error {
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    super(
      `Invalid workspace config: ${issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}

// Stage 1 for unknown input (a settings form, the seed): same checks as
// workspaceConfigSchema, reported as a ConfigValidationError.
export function parseWorkspaceConfig(input: unknown): WorkspaceConfig {
  const result = workspaceConfigSchema.safeParse(input);
  if (!result.success) {
    throw new ConfigValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path.map((key) =>
          typeof key === "symbol" ? key.toString() : key,
        ),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

export type WorkspaceContext = {
  readonly partnerUserIds: ReadonlySet<string>;
  readonly connectedIntegrations: ReadonlySet<IntegrationKind>;
};

// Stage 2. Pure: the caller loads ctx from the database. Collects every issue.
export function validateConfigAgainstWorkspace(
  config: WorkspaceConfig,
  ctx: WorkspaceContext,
): void {
  const issues: ConfigIssue[] = [];

  for (const [sector, userId] of Object.entries(config.routing)) {
    if (!ctx.partnerUserIds.has(userId)) {
      issues.push({
        path: ["routing", sector],
        message: `Routing target "${userId}" is not a partner in this workspace`,
      });
    }
  }
  if (!ctx.partnerUserIds.has(config.defaultPartnerId)) {
    issues.push({
      path: ["defaultPartnerId"],
      message: `Default partner "${config.defaultPartnerId}" is not a partner in this workspace`,
    });
  }

  const { pipeline } = config.agents;
  if (pipeline.enabled) {
    if (pipeline.crm !== null && !ctx.connectedIntegrations.has(pipeline.crm)) {
      issues.push({
        path: ["agents", "pipeline", "crm"],
        message: `CRM "${pipeline.crm}" is not connected`,
      });
    }
    if (
      pipeline.slackChannel !== null &&
      !ctx.connectedIntegrations.has("slack")
    ) {
      issues.push({
        path: ["agents", "pipeline", "slackChannel"],
        message: "Slack channel is set but Slack is not connected",
      });
    }
  }

  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }
}
