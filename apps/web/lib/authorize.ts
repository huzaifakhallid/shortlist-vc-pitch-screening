import type { DealStage, Role } from "@shortlist/schemas";

// The one authorization check (§15.1), called first in every page, route and
// server action, with the role from the server-side session. It lives in the
// web app because every caller does too: dashboard pages, /v1 routes and
// /hooks all run here. Tenancy is not decided here: the data-access layer
// scopes every query by the session's workspaceId.

export type Action =
  | "deal.view"
  | "note.add"
  | "agent.rerun"
  | "message.approve"
  | "deal.move"
  | "score.override"
  | "settings.manage"
  | "agents.manage"
  | "integrations.manage"
  | "users.manage"
  | "audit.view";

// Every action except a stage move, which also needs the move itself.
export type SimpleAction = Exclude<Action, "deal.move">;

export type StageMove = { from: DealStage; to: DealStage };

export type Actor = { role: Role };

// Analysts move deals up to First Call; later stages are partner decisions
// (§6). A deal already at a partner stage stays out of an analyst's reach, so
// an analyst can't reopen a pass or pull a deal back out of IC. Overriding the
// rule-based out-of-mandate result is a partner decision too, so an analyst
// may move a deal into OUT_OF_MANDATE but not out of it.
const ANALYST_TARGET_STAGES: ReadonlySet<DealStage> = new Set<DealStage>([
  "RECEIVED",
  "NEEDS_REVIEW",
  "OUT_OF_MANDATE",
  "SCREENED",
  "FIRST_CALL",
]);
const ANALYST_SOURCE_STAGES: ReadonlySet<DealStage> = new Set<DealStage>([
  "RECEIVED",
  "NEEDS_REVIEW",
  "SCREENED",
  "FIRST_CALL",
]);

const ANALYST_ACTIONS: readonly Action[] = [
  "deal.view",
  "note.add",
  "agent.rerun",
  "message.approve",
  "deal.move",
];
const PARTNER_ACTIONS: readonly Action[] = [
  ...ANALYST_ACTIONS,
  "score.override",
];
const ADMIN_ACTIONS: readonly Action[] = [
  ...PARTNER_ACTIONS,
  "settings.manage",
  "agents.manage",
  "integrations.manage",
  "users.manage",
  "audit.view",
];

// The §6 permission table.
const ROLE_ACTIONS: Record<Role, ReadonlySet<Action>> = {
  analyst: new Set(ANALYST_ACTIONS),
  partner: new Set(PARTNER_ACTIONS),
  admin: new Set(ADMIN_ACTIONS),
};

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

function can(actor: Actor, action: Action, move?: StageMove): boolean {
  if (!ROLE_ACTIONS[actor.role].has(action)) {
    return false;
  }
  if (action !== "deal.move" || actor.role !== "analyst") {
    return true;
  }
  const { from, to } = requireMove(move);
  return ANALYST_SOURCE_STAGES.has(from) && ANALYST_TARGET_STAGES.has(to);
}

// Throws ForbiddenError when the actor's role doesn't allow the action.
export function authorize(actor: Actor, action: SimpleAction): void;
export function authorize(
  actor: Actor,
  action: "deal.move",
  move: StageMove,
): void;
export function authorize(
  actor: Actor,
  action: Action,
  move?: StageMove,
): void {
  if (!can(actor, action, move)) {
    const detail = move === undefined ? "" : ` from ${move.from} to ${move.to}`;
    throw new ForbiddenError(`Role ${actor.role} may not ${action}${detail}`);
  }
}

// The overloads already require a move with "deal.move"; this narrows it.
function requireMove(move: StageMove | undefined): StageMove {
  if (move === undefined) {
    throw new Error("deal.move needs the stage move it authorizes");
  }
  return move;
}
