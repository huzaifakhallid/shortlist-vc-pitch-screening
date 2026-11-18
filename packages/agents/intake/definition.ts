import {
  MissingInputError,
  type AgentDefinition,
} from "@shortlist/agents-shared";
import type { PitchForm, SubmittedDeck } from "@shortlist/schemas";
import { normalisedPitchSchema, type NormalisedPitch } from "./schema";
import { normaliseFormPitch } from "./steps/normalise";
import { eventsFor, matchPitch, receivedPitch } from "./steps/receive";

type FormPayload = { form: PitchForm; deck: SubmittedDeck };

// The Intake agent, form channel (§7.1). No model call: the form's fields
// are structured already. The run normalises the pitch; the worker's narrow
// path then dedupes it and creates or links the deal in the transaction that
// finishes the run (§11.1).
export const intake: AgentDefinition<FormPayload, NormalisedPitch> = {
  key: "intake",
  listensTo: ["form.submitted"],
  promptVersion: null,
  model: null,
  // agentRegistry requires more than one model request's timeout.
  timeoutSeconds: 240,
  needs(deal) {
    if (deal.trigger.type !== "form.submitted") {
      throw new MissingInputError("trigger.payload.form");
    }
    return deal.trigger.payload;
  },
  async run(input, ctx) {
    // The config the run was queued with: a fund that turned the form off
    // since the pitch was submitted takes no more form pitches.
    if (!ctx.config.agents.intake.channels.includes("form")) {
      throw new Error("Intake's form channel is off in this config version");
    }
    return ctx.runStep("normalise", normalisedPitchSchema, () =>
      Promise.resolve(normaliseFormPitch(input)),
    );
  },
  outputSchema: normalisedPitchSchema,
  emits: () => [],
  receivesPitch: {
    pitch: receivedPitch,
    decide: matchPitch,
    emits: eventsFor,
  },
};
