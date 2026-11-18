// The daily AI spend cap (§15.5). The coordinator checks it before it queues
// a run, and the worker before each model call.

// The workspace has spent its cap for the current UTC day. Fails the run (not
// retried), or defers the event's dispatch to the next UTC day.
export class SpendCapReachedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpendCapReachedError";
  }
}

// Throws once today's spend has reached the cap. Both are micro-dollars.
export function assertUnderSpendCap(
  workspaceId: string,
  spentMicros: number,
  capMicros: number,
): void {
  if (spentMicros >= capMicros) {
    throw new SpendCapReachedError(
      `Workspace ${workspaceId} reached its daily AI spend cap: ${String(spentMicros)} of ${String(capMicros)} micro-dollars spent today (UTC)`,
    );
  }
}
