import { describe, expect, it } from "vitest";
import { eventSchema } from "../src/events";

describe("eventSchema", () => {
  it("parses a stage change with its payload", () => {
    const event = {
      type: "deal.stage_changed",
      payload: { from: "SCREENED", to: "FIRST_CALL", source: "slack" },
    };
    expect(eventSchema.parse(event)).toEqual(event);
  });

  it("rejects fields on a payload the design leaves empty", () => {
    const event = { type: "deal.received", payload: { dealId: "d1" } };
    expect(eventSchema.safeParse(event).success).toBe(false);
  });

  it("rejects an event type outside the §8.2 table", () => {
    const event = { type: "agent.run_requested", payload: {} };
    expect(eventSchema.safeParse(event).success).toBe(false);
  });
});
