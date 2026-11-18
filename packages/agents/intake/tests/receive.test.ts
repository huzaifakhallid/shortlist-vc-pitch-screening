import type { IntakeFacts } from "@shortlist/db";
import { describe, expect, it } from "vitest";
import { normaliseFormPitch } from "../steps/normalise";
import { FUND_EMAIL_ERROR } from "../steps/dedupe";
import { eventsFor, matchPitch, receivedPitch } from "../steps/receive";
import { formPayload } from "./fixtures";

const dealId = "00000000-0000-4000-8000-000000000001";
const companyId = "00000000-0000-4000-8000-000000000002";
const now = new Date("2026-11-18T12:00:00Z");

function facts(overrides: Partial<IntakeFacts> = {}): IntakeFacts {
  return {
    candidates: { byDomain: null, byEmail: null },
    fundEmails: {
      domains: new Set(["in.shortlist.dev", "kestrel.example"]),
      addresses: new Set(["partner@kestrel.example"]),
    },
    now,
    ...overrides,
  };
}

const domainMatch = (founderEmailOnDeal: boolean) =>
  facts({
    candidates: {
      byDomain: {
        companyId,
        dealId,
        founderEmailOnDeal,
        held: false,
        openClaimDealId: null,
      },
      byEmail: null,
    },
  });

describe("receivedPitch", () => {
  it("stores the normalised domain and email with the form as entered", () => {
    const payload = formPayload();
    expect(receivedPitch(normaliseFormPitch(payload))).toEqual({
      channel: "form",
      companyName: "Larkspur Labs",
      domainNormalized: "larkspur.example",
      founderEmail: "ana@larkspur.example",
      formData: payload.form,
      deck: payload.deck,
    });
  });

  it("has a null domain without a usable company domain", () => {
    expect(
      receivedPitch(normaliseFormPitch(formPayload({ website: null })))
        .domainNormalized,
    ).toBeNull();
  });
});

describe("matchPitch", () => {
  const pitch = normaliseFormPitch(formPayload());
  const outsider = normaliseFormPitch(
    formPayload({ founderEmail: "someone@elsewhere.example" }),
  );

  it("is new without candidates", () => {
    expect(matchPitch(pitch, facts())).toEqual({ kind: "new" });
  });

  it("links a domain match when the founder email is on the domain", () => {
    expect(matchPitch(pitch, domainMatch(false))).toEqual({
      kind: "resubmission",
      dealId,
      matchedBy: "domain",
      held: false,
    });
  });

  it("links a domain match when the founder email is on the deal", () => {
    expect(matchPitch(outsider, domainMatch(true))).toEqual({
      kind: "resubmission",
      dealId,
      matchedBy: "domain",
      held: false,
    });
  });

  it("is a possible duplicate otherwise", () => {
    expect(matchPitch(outsider, domainMatch(false))).toEqual({
      kind: "possible_duplicate",
      dealId,
    });
  });

  it("uses the database clock it is given for the 90-day email rule", () => {
    const noSite = normaliseFormPitch(formPayload({ website: null }));
    const daysAgo = (days: number) =>
      facts({
        candidates: {
          byDomain: null,
          byEmail: {
            dealId,
            submittedAt: new Date(now.getTime() - days * 86_400_000),
            held: false,
          },
        },
      });
    expect(matchPitch(noSite, daysAgo(90))).toEqual({
      kind: "resubmission",
      dealId,
      matchedBy: "email",
      held: false,
    });
    expect(matchPitch(noSite, daysAgo(91))).toEqual({ kind: "new" });
  });

  it("fails for a founder email that belongs to the fund", () => {
    const own = normaliseFormPitch(
      formPayload({ founderEmail: "partner@kestrel.example", website: null }),
    );
    expect(() => matchPitch(own, facts())).toThrow(FUND_EMAIL_ERROR);
  });
});

describe("eventsFor (form channel)", () => {
  it("emits deal.received for a new deal only", () => {
    expect(eventsFor({ kind: "new" })).toEqual([
      { type: "deal.received", payload: {} },
    ]);
  });

  it("emits deal.needs_review, never deal.received, for a resubmission onto an open deal", () => {
    for (const matchedBy of ["domain", "email"] as const) {
      expect(
        eventsFor({ kind: "resubmission", dealId, matchedBy, held: false }),
      ).toEqual([{ type: "deal.needs_review", payload: {} }]);
    }
  });

  it("emits nothing for a resubmission onto a held deal", () => {
    for (const matchedBy of ["domain", "email", "open_claim"] as const) {
      expect(
        eventsFor({ kind: "resubmission", dealId, matchedBy, held: true }),
      ).toEqual([]);
    }
  });

  it("emits deal.needs_review for a possible duplicate", () => {
    expect(eventsFor({ kind: "possible_duplicate", dealId })).toEqual([
      { type: "deal.needs_review", payload: {} },
    ]);
  });
});
