import type { WorkspaceConfig } from "@shortlist/schemas";
import { describe, expect, it } from "vitest";
import { totalScore } from "../steps/score";

type Rubric = WorkspaceConfig["rubric"];

function criterion(key: string, weight: number): Rubric[number] {
  return {
    key,
    label: key,
    weight,
    question: `How strong is ${key}?`,
    anchors: { "1": "Weak", "3": "Fair", "5": "Strong" },
  };
}

// The §13 example weights.
function rubric(): Rubric {
  return [
    criterion("team", 30),
    criterion("traction", 25),
    criterion("market", 20),
    criterion("product", 15),
    criterion("fit", 10),
  ];
}

function scores(
  values: Record<string, number>,
): { key: string; score: number }[] {
  return Object.entries(values).map(([key, score]) => ({ key, score }));
}

describe("totalScore", () => {
  it("computes Σ (score / 5) × weight", () => {
    // (4×30 + 3×25 + 5×20 + 2×15 + 4×10) / 5 = 365 / 5
    expect(
      totalScore(
        rubric(),
        scores({ team: 4, traction: 3, market: 5, product: 2, fit: 4 }),
      ),
    ).toBe(73);
  });

  it("ranges from 20 to 100", () => {
    const all = (n: number) =>
      scores({ team: n, traction: n, market: n, product: n, fit: n });
    expect(totalScore(rubric(), all(1))).toBe(20);
    expect(totalScore(rubric(), all(5))).toBe(100);
  });

  it("gives exact multiples of 0.2 and ignores the order of scores", () => {
    const total = totalScore(
      [criterion("a", 33), criterion("b", 33), criterion("c", 34)],
      scores({ c: 1, b: 2, a: 2 }),
    );
    // (2×33 + 2×33 + 1×34) / 5 = 166 / 5
    expect(total).toBe(33.2);
  });

  it("rejects a rubric criterion with no score", () => {
    expect(() =>
      totalScore(
        rubric(),
        scores({ team: 4, traction: 3, market: 5, product: 2 }),
      ),
    ).toThrow('Rubric criterion "fit" has no score');
  });

  it("rejects a score for a criterion outside the rubric", () => {
    expect(() =>
      totalScore(
        rubric(),
        scores({
          team: 4,
          traction: 3,
          market: 5,
          product: 2,
          fit: 4,
          vibes: 5,
        }),
      ),
    ).toThrow("criteria[5] scores a criterion that isn't in the rubric");
  });

  it("rejects a criterion scored twice", () => {
    const twice = [
      ...scores({ team: 4, traction: 3, market: 5, product: 2, fit: 4 }),
      { key: "team", score: 1 },
    ];
    expect(() => totalScore(rubric(), twice)).toThrow(
      'criteria[5] scores rubric criterion "team" a second time',
    );
  });
});
