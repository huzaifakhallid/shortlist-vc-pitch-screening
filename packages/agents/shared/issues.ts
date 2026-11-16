import { z } from "zod";

// Validation issues as text that is safe to send back to the model (the
// corrective retry) and to store (agent_run.error). Built only from the
// schema's side of each issue: its code, the path through the schema's own
// keys, and the expected type or bound. Never the received keys or values,
// and never an issue's message: a refinement's message could quote the
// output, which may carry founder content. So a refinement should say what
// is wrong through its path (e.g. `path: ["claims", i, "citation"]`).
export function describeIssues(schema: z.ZodType, error: z.ZodError): string {
  const keys = schemaKeys(schema);
  return error.issues
    .map((issue) => `- ${pathOf(issue.path, keys)}: ${detail(issue)}`)
    .join("\n");
}

function pathOf(path: readonly PropertyKey[], keys: Set<string>): string {
  if (path.length === 0) {
    return "(root)";
  }
  return path
    .map((key) =>
      typeof key === "number"
        ? `[${String(key)}]`
        : typeof key === "string" && keys.has(key)
          ? `.${key}`
          : ".(unexpected key)",
    )
    .join("")
    .replace(/^\./, "");
}

function detail(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return `invalid_type (expected ${issue.expected})`;
    case "too_big":
      return `too_big (maximum ${String(issue.maximum)})`;
    case "too_small":
      return `too_small (minimum ${String(issue.minimum)})`;
    case "unrecognized_keys":
      return `unrecognized_keys (${String(issue.keys.length)} keys the schema doesn't have)`;
    default:
      return issue.code;
  }
}

// Every property name anywhere in the schema.
function schemaKeys(schema: z.ZodType): Set<string> {
  const keys = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object" || node === null) {
      return;
    }
    for (const [key, value] of Object.entries(
      node as Record<string, unknown>,
    )) {
      if (key === "properties" && typeof value === "object" && value !== null) {
        for (const name of Object.keys(value)) {
          keys.add(name);
        }
      }
      visit(value);
    }
  };
  visit(z.toJSONSchema(schema, { unrepresentable: "any", io: "input" }));
  return keys;
}
