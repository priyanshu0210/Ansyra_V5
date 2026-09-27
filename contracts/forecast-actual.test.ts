import { describe, it, expect } from "vitest";
import {
  LOW_BENCHMARK_SAMPLE,
  MIN_BENCHMARK_JUDGED,
  MIN_BENCHMARK_SCENARIOS,
  accuracyLabel,
  benchmarkHeadline,
  benchmarkLowSampleNote,
  foldBenchmark,
  isJudgeable,
  scoreScenario,
  verdictFor,
  type BenchmarkCell,
} from "./forecast-actual";
import { projectScenarios, type ScenarioSnapshotInput } from "./scenarios";

const ASSUMPTIONS = [
  { id: 11, assumption: "EBITDA margin is sustainable post-close" },
  { id: 12, assumption: "Key engineers stay through integration" },
];

function snap(over: Partial<ScenarioSnapshotInput> = {}): ScenarioSnapshotInput {
  return {
    id: 47,
    dealId: 3,
    createdAt: "2026-08-01T00:00:00.000Z",
    result: {
      cases: [
        {
          name: "downside", probabilityPct: 30, narrative: "n", thesisImpact: "t",
          drivers: [
            { assumption: "EBITDA margin is sustainable post-close", direction: "breaks" },
            { assumption: "Key engineers stay through integration", direction: "breaks" },
            { assumption: "Freight normalises", direction: "breaks" },
          ],
        },
        {
          name: "base", probabilityPct: 50, narrative: "n", thesisImpact: "t",
          drivers: [
            { assumption: "EBITDA margin is sustainable post-close", direction: "holds" },
            { assumption: "Key engineers stay through integration", direction: "holds" },
          ],
        },
      ],
    },
    ...over,
  };
}

const rows = projectScenarios([snap()], ASSUMPTIONS);
const downside = rows.find((r) => r.caseName === "downside")!;
const base = rows.find((r) => r.caseName === "base")!;

describe("verdictFor — the matrix, stated", () => {
  it("scores a correct call as matched, either direction", () => {
    expect(verdictFor("holds", "held")).toBe("matched");
    expect(verdictFor("breaks", "contradicted")).toBe("matched");
  });

  it("names the direction of a miss", () => {
    // Said it would hold, it broke → the case was optimistic.
    expect(verdictFor("holds", "contradicted")).toBe("too_optimistic");
    // Said it would break, it held → the case was pessimistic.
    expect(verdictFor("breaks", "held")).toBe("too_pessimistic");
  });

  it("does not flatter `exceeds` when the claim merely held", () => {
    // The one arguable cell, settled against the forecast: exceeding is a
    // stronger claim than holding, and it was not met.
    expect(verdictFor("exceeds", "held")).toBe("too_optimistic");
    expect(verdictFor("exceeds", "contradicted")).toBe("too_optimistic");
    expect(verdictFor("exceeds", "partially_held")).toBe("too_optimistic");
  });

  it("calls a half-right directional call partial", () => {
    expect(verdictFor("holds", "partially_held")).toBe("partial");
    expect(verdictFor("breaks", "partially_held")).toBe("partial");
  });

  it("judges nothing it cannot judge", () => {
    expect(verdictFor("holds", null)).toBe("unread");
    expect(verdictFor("holds", undefined)).toBe("unread");
    expect(verdictFor("holds", "too_early")).toBe("inconclusive");
    expect(verdictFor("holds", "moot")).toBe("inconclusive");
    expect(verdictFor("holds", "something_new")).toBe("inconclusive");
  });

  it("keeps unjudgeable verdicts out of every rate", () => {
    // Counting "nobody looked" as a hit or a miss is how a scoreboard lies.
    expect(isJudgeable("matched")).toBe(true);
    expect(isJudgeable("partial")).toBe(true);
    expect(isJudgeable("unread")).toBe(false);
    expect(isJudgeable("inconclusive")).toBe(false);
  });
});

describe("scoreScenario", () => {
  const bothBroke = [
    { assumptionId: 11, outcomeType: "contradicted", recordedAt: "2026-06-01" },
    { assumptionId: 12, outcomeType: "contradicted", recordedAt: "2026-06-01" },
  ];

  it("scores the case that called it right", () => {
    const a = scoreScenario(downside, bothBroke);
    expect(a.matched).toBe(2);
    expect(a.judgeable).toBe(2);
    expect(a.hitRate).toBe(1);
    expect(accuracyLabel(a)).toBe("Downside called 2 of 2 drivers right.");
  });

  it("scores the case that did not", () => {
    const a = scoreScenario(base, bothBroke);
    expect(a.matched).toBe(0);
    expect(a.tooOptimistic).toBe(2);
    expect(a.hitRate).toBe(0);
  });

  it("uses the LATEST read, so a briefly-right forecast is not flattered", () => {
    const a = scoreScenario(base, [
      { assumptionId: 11, outcomeType: "held", recordedAt: "2026-03-01" },
      { assumptionId: 11, outcomeType: "contradicted", recordedAt: "2026-09-01" },
    ]);
    expect(a.drivers.find((d) => d.assumptionId === 11)!.verdict).toBe("too_optimistic");
  });

  it("leaves an unresolved driver out of the denominator entirely", () => {
    // "Freight normalises" resolves to no assumption row — there is nothing to
    // have been right or wrong about.
    const a = scoreScenario(downside, bothBroke);
    expect(a.drivers).toHaveLength(3);
    expect(a.drivers.find((d) => d.assumptionId === null)!.verdict).toBe("unread");
    expect(a.judgeable).toBe(2);
  });

  it("hitRate is NULL, never 0, when nothing could be judged", () => {
    // 0 would read as "this case was wrong about everything".
    const a = scoreScenario(base, []);
    expect(a.judgeable).toBe(0);
    expect(a.hitRate).toBeNull();
    expect(accuracyLabel(a)).toBeNull();
  });
});

describe("foldBenchmark", () => {
  const cell = (over: Partial<BenchmarkCell> = {}): BenchmarkCell => ({
    caseName: "downside", judged: 3, matched: 3, tooOptimistic: 0, tooPessimistic: 0, ...over,
  });

  it("SUPPRESSES a class below the judged floor", () => {
    expect(foldBenchmark([cell({ judged: MIN_BENCHMARK_JUDGED - 1, matched: 1 })])).toEqual([]);
  });

  it("SUPPRESSES a class carried by too few scenarios", () => {
    // One talkative deal must not make a firm-wide claim.
    const out = foldBenchmark([cell({ judged: 20, matched: 20 }), cell({ judged: 20, matched: 20 })]);
    expect(out).toEqual([]);
    expect(MIN_BENCHMARK_SCENARIOS).toBeGreaterThan(2);
  });

  it("scores a class that clears both floors", () => {
    const [f] = foldBenchmark([cell(), cell(), cell()]);
    expect(f.scenarios).toBe(3);
    expect(f.judged).toBe(9);
    expect(f.hitRate).toBe(1);
    expect(f.description).toBe("Downside cases called 9 of 9 drivers right across 3 scenarios.");
  });

  it("says which way a class errs, and stays silent when it is even", () => {
    const leaning = foldBenchmark([
      cell({ judged: 4, matched: 2, tooOptimistic: 2 }),
      cell({ judged: 4, matched: 2, tooOptimistic: 2 }),
      cell({ judged: 4, matched: 2, tooOptimistic: 2 }),
    ])[0];
    expect(leaning.leans).toBe("optimistic");
    expect(leaning.description).toContain("erring optimistic when wrong");

    const even = foldBenchmark([
      cell({ judged: 4, matched: 2, tooOptimistic: 1, tooPessimistic: 1 }),
      cell({ judged: 4, matched: 2, tooOptimistic: 1, tooPessimistic: 1 }),
      cell({ judged: 4, matched: 2, tooOptimistic: 1, tooPessimistic: 1 }),
    ])[0];
    expect(even.leans).toBeNull();
    expect(even.description).not.toContain("erring");
  });

  it("ignores an unrecognised case name and an unjudgeable cell", () => {
    expect(foldBenchmark([cell({ caseName: "sideways", judged: 99, matched: 99 })])).toEqual([]);
    expect(foldBenchmark([cell({ judged: 0, matched: 0 })])).toEqual([]);
  });

  it("hedges a thin sample above the floors", () => {
    const [f] = foldBenchmark([cell({ judged: 2, matched: 2 }), cell({ judged: 2, matched: 2 }), cell({ judged: 3, matched: 3 })]);
    expect(f.judged).toBeLessThan(LOW_BENCHMARK_SAMPLE);
    expect(benchmarkLowSampleNote(f)).toBe("Based on 7 judged drivers — directional, not conclusive.");
  });

  it("is byte-stable over a shuffle, best first", () => {
    const cells = [
      cell({ caseName: "base", judged: 4, matched: 1, tooOptimistic: 3 }),
      cell({ caseName: "base", judged: 4, matched: 1, tooOptimistic: 3 }),
      cell({ caseName: "base", judged: 4, matched: 1, tooOptimistic: 3 }),
      cell({ caseName: "downside", judged: 4, matched: 4 }),
      cell({ caseName: "downside", judged: 4, matched: 4 }),
      cell({ caseName: "downside", judged: 4, matched: 4 }),
    ];
    const a = foldBenchmark(cells);
    const b = foldBenchmark([...cells].reverse());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a[0].caseName).toBe("downside");
  });
});

describe("benchmarkHeadline — sober, or silent", () => {
  const make = (caseName: string, judged: number, matched: number) =>
    [1, 2, 3].map(() => ({ caseName, judged, matched, tooOptimistic: judged - matched, tooPessimistic: 0 }));

  it("states the gap when there is a real one", () => {
    const f = foldBenchmark([...make("downside", 4, 4), ...make("base", 4, 1)]);
    expect(benchmarkHeadline(f)).toBe(
      "Downside cases have been closer to what happened than base cases, by 75 points.",
    );
  });

  it("says nothing when two classes tie exactly", () => {
    const f = foldBenchmark([...make("downside", 4, 3), ...make("base", 4, 3)]);
    expect(f[0].hitRate).toBe(f[1].hitRate);
    expect(benchmarkHeadline(f)).toBeNull();
  });

  it("says nothing when the classes DIFFER but are too close to call", () => {
    // 0.75 vs 0.70 is a 5-point gap. An earlier version of this test used two
    // EQUAL rates, which exits at the tie guard and never reaches the
    // too-close-to-call guard — so deleting that guard passed. Mutation-checked.
    const f = foldBenchmark([...make("downside", 4, 3), ...make("base", 10, 7)]);
    expect(f[0].hitRate).toBe(0.75);
    expect(f[1].hitRate).toBe(0.7);
    expect(f[0].hitRate).not.toBe(f[1].hitRate);
    expect(benchmarkHeadline(f)).toBeNull();
  });

  it("says nothing with only one class to speak about", () => {
    expect(benchmarkHeadline(foldBenchmark(make("downside", 4, 4)))).toBeNull();
  });
});
