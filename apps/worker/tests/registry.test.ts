import { agentsFor, UnroutableEventError } from "@shortlist/coordinator";
import { describe, expect, it } from "vitest";
import { validConfig } from "../../../packages/schemas/tests/config.fixture";
import { registry } from "../src/registry";

// The worker's registry against the §8.2 table (packages/coordinator/routing.ts).
function keys(...args: Parameters<typeof agentsFor>) {
  return agentsFor(...args).map((agent) => agent.key);
}

describe("worker registry", () => {
  it("routes form.submitted to Intake only while Intake is enabled", () => {
    const config = validConfig();
    expect(keys("form.submitted", config, registry)).toEqual(["intake"]);
    config.agents.intake.enabled = false;
    expect(keys("form.submitted", config, registry)).toEqual([]);
  });

  it("fails email.received visibly: Intake's email channel isn't built", () => {
    expect(() => keys("email.received", validConfig(), registry)).toThrow(
      new UnroutableEventError(
        `Agent "intake" takes email.received (§8.2) but its definition doesn't listen to it`,
      ),
    );
  });

  it("fails Intake's events visibly while their enabled listeners aren't registered", () => {
    const config = validConfig();
    expect(() => keys("deal.received", config, registry)).toThrow(
      UnroutableEventError,
    );
    expect(() => keys("deal.needs_review", config, registry)).toThrow(
      new UnroutableEventError(
        `Agent "pipeline" is enabled and takes deal.needs_review, but this worker doesn't register it`,
      ),
    );
  });

  it("queues nothing for Intake's events when their listeners are off", () => {
    const config = validConfig();
    config.agents.screening.enabled = false;
    config.agents.research.enabled = false;
    config.agents.memo.enabled = false;
    config.agents.diligence.enabled = false;
    config.agents.comms.enabled = false;
    config.agents.pipeline.enabled = false;
    expect(keys("deal.received", config, registry)).toEqual([]);
    expect(keys("deal.needs_review", config, registry)).toEqual([]);
  });
});
