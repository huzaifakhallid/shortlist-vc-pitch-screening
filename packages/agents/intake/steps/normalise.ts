import type { PitchForm, SubmittedDeck } from "@shortlist/schemas";
import type { NormalisedPitch } from "../schema";
import { companyDomain, normalizeEmail } from "./dedupe";

// The form pitch with the values dedupe compares (§7.1): the company domain
// from the stated website and the normalised founder email. Throws, naming
// the field, for a website or email Intake's rules reject.
export function normaliseFormPitch(payload: {
  form: PitchForm;
  deck: SubmittedDeck;
}): NormalisedPitch {
  return {
    channel: "form",
    companyDomain: companyDomain(payload.form.website),
    founderEmail: normalizeEmail(payload.form.founderEmail),
    form: payload.form,
    deck: payload.deck,
  };
}
