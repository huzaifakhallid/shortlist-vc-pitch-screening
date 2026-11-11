import {
  dealStageSchema,
  roleSchema,
  type DealStage,
  type Role,
} from "@shortlist/schemas";
import { describe, expect, it } from "vitest";
import { authorize, ForbiddenError, type SimpleAction } from "@/lib/authorize";

// The §6 table, written out in full so a change to it is a visible diff.
const TABLE: Record<SimpleAction, Record<Role, boolean>> = {
  "deal.view": { analyst: true, partner: true, admin: true },
  "note.add": { analyst: true, partner: true, admin: true },
  "agent.rerun": { analyst: true, partner: true, admin: true },
  "message.approve": { analyst: true, partner: true, admin: true },
  "score.override": { analyst: false, partner: true, admin: true },
  "settings.manage": { analyst: false, partner: false, admin: true },
  "agents.manage": { analyst: false, partner: false, admin: true },
  "integrations.manage": { analyst: false, partner: false, admin: true },
  "users.manage": { analyst: false, partner: false, admin: true },
  "audit.view": { analyst: false, partner: false, admin: true },
};

const roles = roleSchema.options;
const simpleActions = Object.keys(TABLE) as SimpleAction[];

describe("authorize: every role × every action", () => {
  for (const action of simpleActions) {
    for (const role of roles) {
      const allowed = TABLE[action][role];
      it(`${role} ${allowed ? "may" : "may not"} ${action}`, () => {
        if (allowed) {
          expect(() => {
            authorize({ role }, action);
          }).not.toThrow();
        } else {
          expect(() => {
            authorize({ role }, action);
          }).toThrow(new ForbiddenError(`Role ${role} may not ${action}`));
        }
      });
    }
  }
});

// Boundary cases of "analysts move deals up to First Call" (§6).
const MOVES: [Role, DealStage, DealStage, boolean][] = [
  ["analyst", "SCREENED", "FIRST_CALL", true],
  ["analyst", "RECEIVED", "OUT_OF_MANDATE", true],
  ["analyst", "FIRST_CALL", "DILIGENCE", false],
  ["analyst", "PASSED", "SCREENED", false],
  ["analyst", "IC", "FIRST_CALL", false],
  ["analyst", "OUT_OF_MANDATE", "SCREENED", false],
  ["partner", "IC", "INVESTED", true],
  ["admin", "DILIGENCE", "PASSED", true],
];

describe("authorize: deal.move", () => {
  for (const [role, from, to, allowed] of MOVES) {
    it(`${role} ${allowed ? "may" : "may not"} move ${from} → ${to}`, () => {
      if (allowed) {
        expect(() => {
          authorize({ role }, "deal.move", { from, to });
        }).not.toThrow();
      } else {
        expect(() => {
          authorize({ role }, "deal.move", { from, to });
        }).toThrow(
          new ForbiddenError(
            `Role ${role} may not deal.move from ${from} to ${to}`,
          ),
        );
      }
    });
  }

  it("lets partners and admins make every move", () => {
    const stages = dealStageSchema.options;
    for (const role of ["partner", "admin"] as const) {
      for (const from of stages) {
        for (const to of stages) {
          expect(() => {
            authorize({ role }, "deal.move", { from, to });
          }).not.toThrow();
        }
      }
    }
  });
});
