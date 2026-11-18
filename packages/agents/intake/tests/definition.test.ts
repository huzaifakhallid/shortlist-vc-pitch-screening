import {
  MissingInputError,
  type AgentContext,
  type DealSnapshot,
} from "@shortlist/agents-shared";
import type { StoredEvent } from "@shortlist/db";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { validConfig } from "../../../schemas/tests/config.fixture";
import { intake } from "../definition";
import { normaliseFormPitch } from "../steps/normalise";
import { formPayload } from "./fixtures";

const workspaceId = "00000000-0000-4000-8000-0000000000aa";

function snapshot(trigger: StoredEvent): DealSnapshot {
  return { workspaceId, dealId: null, trigger };
}

function formEvent(): StoredEvent {
  return {
    type: "form.submitted",
    payload: formPayload(),
    id: "00000000-0000-4000-8000-0000000000bb",
    workspaceId,
    dealId: null,
    createdAt: new Date(),
  };
}

// Runs each step at once and records its name. Intake calls no model.
function context(channels: ("form" | "email")[] = ["form", "email"]) {
  const steps: string[] = [];
  const config = validConfig();
  config.agents.intake.channels = channels;
  const ctx: AgentContext = {
    workspaceId,
    config,
    runStep: async <T>(
      name: string,
      schema: z.ZodType<T>,
      fn: () => Promise<T>,
    ) => {
      steps.push(name);
      return schema.parse(await fn());
    },
    llm: {
      structured: () => Promise.reject(new Error("Intake calls no model")),
      usage: () => ({ tokensIn: 0, tokensOut: 0, costMicros: 0 }),
    },
    signal: new AbortController().signal,
    log: () => undefined,
  };
  return { ctx, steps };
}

describe("intake definition", () => {
  it("listens to form.submitted only, without a model", () => {
    expect(intake.listensTo).toEqual(["form.submitted"]);
    expect(intake.promptVersion).toBeNull();
    expect(intake.model).toBeNull();
  });

  it("emits only through its intake path (§11.1)", () => {
    expect(intake.emits(normaliseFormPitch(formPayload()))).toEqual([]);
    expect(intake.receivesPitch).toBeDefined();
  });

  it("needs the form payload from its trigger", () => {
    expect(intake.needs(snapshot(formEvent()))).toEqual(formPayload());
    expect(() =>
      intake.needs(
        snapshot({ ...formEvent(), type: "email.received", payload: {} }),
      ),
    ).toThrow(new MissingInputError("trigger.payload.form"));
  });

  it("normalises the pitch in one step", async () => {
    const { ctx, steps } = context();
    const output = await intake.run(formPayload(), ctx);
    expect(steps).toEqual(["normalise"]);
    expect(output).toEqual(normaliseFormPitch(formPayload()));
    expect(intake.outputSchema.parse(output)).toEqual(output);
  });

  it("refuses a form pitch once the config's form channel is off", async () => {
    const { ctx, steps } = context(["email"]);
    await expect(intake.run(formPayload(), ctx)).rejects.toThrow(
      "Intake's form channel is off in this config version",
    );
    expect(steps).toEqual([]);
  });
});
