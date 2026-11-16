import { describe, expect, it } from "vitest";
import { validConfig } from "../../schemas/tests/config.fixture";
import { agentsFor as agentsForDefinitions } from "../routing";
import { listener } from "./agents";

// The keys of the agents that take the event.
function agentsFor(...args: Parameters<typeof agentsForDefinitions>) {
  return agentsForDefinitions(...args).map((agent) => agent.key);
}

const registry = [
  listener("screening", ["deal.received"]),
  listener("research", ["deal.received", "deal.screened"]),
  listener("memo", ["deal.screened", "research.completed"]),
  listener("pipeline", ["deal.received", "deal.screened"]),
];

describe("agentsFor", () => {
  it("returns the enabled agents listening to the event", () => {
    const config = validConfig();
    expect(agentsFor("deal.received", config, registry)).toEqual([
      "screening",
      "pipeline",
    ]);
    expect(agentsFor("memo.completed", config, registry)).toEqual([]);
  });

  it("skips disabled agents", () => {
    const config = validConfig();
    config.agents.pipeline.enabled = false;
    expect(agentsFor("deal.received", config, registry)).toEqual(["screening"]);
  });

  it("skips agents this worker doesn't register", () => {
    expect(agentsFor("deal.received", validConfig(), [])).toEqual([]);
  });

  it("gives Research deal.received only while Screening is off (§8.2)", () => {
    const config = validConfig();
    config.agents.screening.enabled = false;
    config.agents.memo.enabled = false;
    config.agents.diligence.enabled = false;
    expect(agentsFor("deal.received", config, registry)).toEqual([
      "research",
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
