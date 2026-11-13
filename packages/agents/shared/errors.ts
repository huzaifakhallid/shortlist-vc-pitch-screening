import { randomUUID } from "node:crypto";

// The longest error text stored on a run, step or event.
export const MAX_ERROR_LENGTH = 1024;

// Error text that is safe to store and show the team (agent_run.error,
// run_step output, event.dispatch_error). An Error keeps its message, capped.
// A database error (its message or fields may carry SQL and parameter
// values) or a thrown non-Error becomes a reference, and the full error goes
// to stderr under that reference.
export function sanitiseError(error: unknown): string {
  if (error instanceof Error && !isDatabaseError(error)) {
    return cap(error.message);
  }
  const ref = randomUUID();
  console.error(`Internal error (ref ${ref}):`, error);
  return `Internal error (ref ${ref})`;
}

// Drizzle's DrizzleQueryError has query and params; node-postgres errors
// have severity and code. Either may sit in the cause chain.
function isDatabaseError(error: Error): boolean {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if ("query" in e || "params" in e || "severity" in e) {
      return true;
    }
  }
  return false;
}

function cap(message: string): string {
  return message.length <= MAX_ERROR_LENGTH
    ? message
    : `${message.slice(0, MAX_ERROR_LENGTH - 3)}...`;
}
