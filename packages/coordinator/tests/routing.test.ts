import { describe, expect, it } from "vitest";
import { validConfig } from "../../schemas/tests/config.fixture";
import {
  agentsFor as agentsForDefinitions,
  UnroutableEventError,
} from "../routing";
import { fullRegistry, listener } from "./agents";

// The keys of the agents that take the event.
function agentsFor(...args: Parameters<typeof agentsForDefinitions>) {
  return agentsForDefinitions(...args).map((agent) => agent.key);
}

const registry = fullRegistry();

describe("agentsFor", () => {
  it("returns the enabled agents the §8.2 table routes the event to", () => {
    const config = validConfig();
    expect(agentsFor("deal.received", config, registry)).toEqual([
      "screening",
      "comms",
      "pipeline",
    ]);
    expect(agentsFor("form.submitted", config, registry)).toEqual(["intake"]);
  });

  it("skips disabled agents", () => {
    const config = validConfig();
    config.agents.pipeline.enabled = false;
    config.agents.comms.enabled = false;
    expect(agentsFor("deal.received", config, registry)).toEqual(["screening"]);
  });

  it("refuses an enabled agent this worker doesn't register", () => {
    expect(() =>
      agentsFor("form.submitted", validConfig(), fullRegistry("intake")),
    ).toThrow(
      new UnroutableEventError(
        `Agent "intake" is enabled and takes form.submitted, but this worker doesn't register it`,
      ),
    );
    expect(() => agentsFor("deal.received", validConfig(), [])).toThrow(
      UnroutableEventError,
    );
  });

  it("needs no registration for a disabled agent", () => {
    const config = validConfig();
    config.agents.intake.enabled = false;
    expect(agentsFor("form.submitted", config, fullRegistry("intake"))).toEqual(
      [],
    );
  });

  it("refuses a definition that disagrees with the §8.2 table", () => {
    const config = validConfig();
    const offTable = [
      ...fullRegistry("memo"),
      listener("memo", ["deal.received", "deal.screened"]),
    ];
    expect(() => agentsFor("deal.received", config, offTable)).toThrow(
      `Agent "memo" listens to deal.received, which the §8.2 table doesn't route to it`,
    );
    const missing = [...fullRegistry("pipeline"), listener("pipeline", [])];
    expect(() => agentsFor("deal.received", config, missing)).toThrow(
      `Agent "pipeline" takes deal.received (§8.2) but its definition doesn't listen to it`,
    );
  });

  it("gives Research deal.received only while Screening is off (§8.2)", () => {
    const config = validConfig();
    config.agents.screening.enabled = false;
    config.agents.memo.enabled = false;
    config.agents.diligence.enabled = false;
    expect(agentsFor("deal.received", config, registry)).toEqual([
      "research",
      "comms",
      "pipeline",
    ]);
  });

  it("gives Memo deal.screened only while Research is off (§8.4)", () => {
    const config = validConfig();
    expect(agentsFor("deal.screened", config, registry)).toEqual([
      "research",
      "pipeline",
    ]);
    expect(agentsFor("research.completed", config, registry)).toEqual(["memo"]);

    config.agents.research.enabled = false;
    expect(agentsFor("deal.screened", config, registry)).toEqual([
      "memo",
      "pipeline",
    ]);
  });
});
