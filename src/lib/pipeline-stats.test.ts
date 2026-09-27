import { describe, it, expect } from "vitest";
import { computePipelineStats, PIPELINE_STAGES, type StatsDeal, type StatsTarget } from "./pipeline-stats";

const deal = (over: Partial<StatsDeal> = {}): StatsDeal => ({
  stage: "sourcing",
  value: "$100M",
  valueAmount: "100",
  valueCurrency: "USD",
  ...over,
});

const target = (over: Partial<StatsTarget> = {}): StatsTarget => ({
  sector: "Enterprise Software",
  fitScore: 80,
  ...over,
});

describe("computePipelineStats — byStage", () => {
  // Guards the exact shape the Analytics BarChart consumes. This was once
  // reported as "the chart renders empty"; the data was in fact correct and the
  // report came from a bad DOM selector, so this test pins the real contract.
  it("counts deals into their canonical stages", () => {
    const stats = computePipelineStats([deal({ stage: "sourcing" }), deal({ stage: "closing" })], []);
    const counts = Object.fromEntries(stats.byStage.map((s) => [s.stage, s.count]));

    expect(counts).toEqual({
      sourcing: 1,
      evaluation: 0,
      diligence: 0,
      negotiation: 0,
      closing: 1,
      integration: 0,
    });
  });

  it("always returns one row per canonical stage, in order", () => {
    const stats = computePipelineStats([], []);
    expect(stats.byStage.map((s) => s.stage)).toEqual([...PIPELINE_STAGES]);
  });

  // The latent gap worth knowing about: `byStage` is built by filtering the
  // canonical list, so a deal carrying any other stage contributes to NO row.
  // It disappears from the chart silently while still counting toward the
  // "Deals in flight" KPI, so the two can disagree.
  it("drops deals whose stage is outside the canonical list", () => {
    const deals = [deal({ stage: "sourcing" }), deal({ stage: "closed-lost" }), deal({ stage: "Sourcing" })];
    const stats = computePipelineStats(deals, []);
    const charted = stats.byStage.reduce((n, s) => n + s.count, 0);

    // Only the exact-match deal is charted; the unknown stage and the
    // differently-cased one are both invisible.
    expect(charted).toBe(1);
    expect(deals.length).toBe(3);
    expect(charted).toBeLessThan(deals.length);
  });

  it("matching is case-sensitive and untrimmed", () => {
    const stats = computePipelineStats([deal({ stage: " sourcing" }), deal({ stage: "SOURCING" })], []);
    expect(stats.byStage.find((s) => s.stage === "sourcing")?.count).toBe(0);
  });
});

describe("computePipelineStats — sectors", () => {
  // Sector mix is derived from TARGETS, not deals: an empty pie with a healthy
  // deal count is expected when the watchlist is empty.
  it("groups targets by sector, descending", () => {
    const stats = computePipelineStats(
      [],
      [target({ sector: "Life Sciences" }), target({ sector: "Enterprise Software" }), target({ sector: "Life Sciences" })],
    );
    expect(stats.sectors).toEqual([
      { name: "Life Sciences", value: 2 },
      { name: "Enterprise Software", value: 1 },
    ]);
  });

  it("returns no sectors when there are no targets, regardless of deal count", () => {
    const stats = computePipelineStats([deal(), deal()], []);
    expect(stats.sectors).toEqual([]);
  });

  it("caps the pie at six slices", () => {
    const many = Array.from({ length: 9 }, (_, i) => target({ sector: `Sector ${i}` }));
    expect(computePipelineStats([], many).sectors).toHaveLength(6);
  });
});

describe("computePipelineStats — totals", () => {
  it("totals per currency without FX conversion", () => {
    const stats = computePipelineStats(
      [
        deal({ valueAmount: "100", valueCurrency: "USD" }),
        deal({ valueAmount: "50", valueCurrency: "USD" }),
        deal({ valueAmount: "20", valueCurrency: "EUR" }),
      ],
      [],
    );
    expect(stats.currencyTotals).toEqual([
      ["USD", 150],
      ["EUR", 20],
    ]);
  });

  it("counts unparseable values apart instead of dropping them", () => {
    const stats = computePipelineStats([deal({ valueAmount: null, value: "TBD" })], []);
    expect(stats.unparsed).toBe(1);
    expect(stats.currencyTotals).toEqual([]);
  });

  it("averages fit scores and returns 0 for an empty watchlist", () => {
    expect(computePipelineStats([], [target({ fitScore: 90 }), target({ fitScore: 80 })]).avgFit).toBe(85);
    expect(computePipelineStats([], []).avgFit).toBe(0);
  });
});
