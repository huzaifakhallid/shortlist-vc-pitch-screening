import type { IntakeFacts, ReceivedPitch } from "@shortlist/db";
import type { IntakeMatch, ShortlistEvent } from "@shortlist/schemas";
import type { NormalisedPitch } from "../schema";
import { decideDuplicate } from "./dedupe";

// Intake's narrow path (§11.1), as plain functions the worker calls inside
// the transaction that finishes the run (receivePitch).

export function receivedPitch(output: NormalisedPitch): ReceivedPitch {
  return {
    channel: output.channel,
    companyName: output.form.companyName,
    domainNormalized:
      output.companyDomain.kind === "domain"
        ? output.companyDomain.domain
        : null,
    founderEmail: output.founderEmail,
    formData: output.form,
    deck: output.deck,
  };
}

// The dedupe rules (steps/dedupe.ts) on the facts read under Intake's lock:
// the database clock and the fund's own email identity included.
export function matchPitch(
  output: NormalisedPitch,
  facts: IntakeFacts,
): IntakeMatch {
  return decideDuplicate({
    companyDomain: output.companyDomain,
    founderEmail: output.founderEmail,
    fundEmails: facts.fundEmails,
    candidates: facts.candidates,
    now: facts.now,
  }).match;
}

// §8.2, form channel (§7.1). A new deal is deal.received. Nothing on the form
// proves who sent it, so every resubmission onto an open deal is unverified:
// the submission is attached and deal.needs_review tells the team, and
// Screening never re-runs on its own. A possible duplicate is
// deal.needs_review too. A resubmission onto a held deal (a possible
// duplicate waiting for a partner) emits nothing: the partner's confirm
// action emits deal.received.
export function eventsFor(match: IntakeMatch): ShortlistEvent[] {
  if (match.kind === "new") {
    return [{ type: "deal.received", payload: {} }];
  }
  if (match.kind === "resubmission" && match.held) {
    return [];
  }
  return [{ type: "deal.needs_review", payload: {} }];
}
