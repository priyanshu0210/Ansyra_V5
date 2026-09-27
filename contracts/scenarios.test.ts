import { describe, it, expect } from "vitest";
import {
  MAX_COMPARE,
  SCENARIO_CASE_NAMES,
  canCompare,
  compareBlockedMessage,
  compareDrivers,
  inPlaySummary,
  indexAssumptions,
  normaliseDriverName,
  parseScenarioId,
  projectScenarios,
  recommendationsInPlay,
  resolveCompareSelection,
  scenarioId,
  scenariosForAssumption,
  scenarioChain,
  scenariosOfSnapshot,
  latestGlimpse,
  untestedChainNote,
  stanceOfRelation,
  unmatchedDrivers,
  type ScenarioSnapshotInput,
} from "./scenarios";

// The fixture mirrors the SQL/jsonb grain deliberately rather than importing
// db/schema: these are the shapes the query module hands over, so a drift in
// the projection shows up here rather than in a live click-through.

const ASSUMPTIONS = [
  { id: 11, assumption: "EBITDA margin is sustainable post-close" },
  { id: 12, assumption: "Key engineers stay through integration" },
  { id: 13, assumption: "No Phase 2 regulatory review" },
];

function snap(over: Partial<ScenarioSnapshotInput> = {}): ScenarioSnapshotInput {
  return {
    id: 47,
    dealId: 3,
    createdAt: "2026-08-01T00:00:00.000Z",
    createdBy: "u1",
    model: "gemini-2.5",
    assumptionCount: 3,
    result: {
      summary: "A wide range driven by retention.",
      watchItems: ["Retention"],
      cases: [
        {
          name: "base",
          probabilityPct: 55,
          narrative: "Margins hold; integration lands on plan.",
          thesisImpact: "Thesis intact.",
          keyMetricDelta: "EBITDA +2%",
          drivers: [
            { assumption: "EBITDA margin is sustainable post-close", direction: "holds" },
            { assumption: "Key engineers stay through integration", direction: "holds" },
          ],
        },
        {
          name: "downside",
          probabilityPct: 25,
          narrative: "Attrition bites.",
          thesisImpact: "Returns compress.",
          drivers: [
            { assumption: "EBITDA margin is sustainable post-close", direction: "breaks" },
            { assumption: "Key engineers stay through integration", direction: "breaks" },
            { assumption: "Freight costs normalise by Q3", direction: "breaks" },
          ],
        },
        {
          name: "upside",
          probabilityPct: 20,
          narrative: "Cross-sell lands early.",
          thesisImpact: "Upside to plan.",
          drivers: [{ assumption: "EBITDA margin is sustainable post-close", direction: "exceeds" }],
        },
      ],
    },
    ...over,
  };
}

describe("scenario ids", () => {
  it("round-trips", () => {
    expect(scenarioId(47, "base")).toBe("47:base");
    expect(parseScenarioId("47:base")).toEqual({ snapshotId: 47, caseName: "base" });
  });

  it("refuses anything malformed instead of throwing", () => {
    // These arrive from a client payload, so every branch must be a null.
    for (const bad of ["", ":", "base", "47:", "47:sideways", "0:base", "-1:base", "x:base", "47"]) {
      expect(parseScenarioId(bad), bad).toBeNull();
    }
  });
});

describe("projectScenarios", () => {
  it("flattens a run into one scenario per case, newest run first", () => {
    const rows = projectScenarios([snap({ id: 47 }), snap({ id: 52 })], ASSUMPTIONS);
    expect(rows).toHaveLength(6);
    // Newest snapshot first, then downside → base → upside inside each run.
    expect(rows.map((r) => r.id)).toEqual([
      "52:downside",
      "52:base",
      "52:upside",
      "47:downside",
      "47:base",
      "47:upside",
    ]);
  });

  it("lifts every value verbatim and invents no metric", () => {
    const base = projectScenarios([snap()], ASSUMPTIONS).find((s) => s.caseName === "base")!;
    expect(base).toMatchObject({
      dealId: 3,
      snapshotId: 47,
      caseName: "base",
      label: "Base",
      probabilityPct: 55,
      thesisImpact: "Thesis intact.",
      keyMetricDelta: "EBITDA +2%",
      snapshotAssumptionCount: 3,
      model: "gemini-2.5",
    });
    // The guard against the spec's npv/irr/payback: a scenario has no such field.
    for (const k of ["npv", "irr", "paybackPeriod", "moic"]) {
      expect(base, `a scenario must not carry ${k}`).not.toHaveProperty(k);
    }
  });

  it("keyMetricDelta is null, never undefined, when the generator omits it", () => {
    const down = projectScenarios([snap()]).find((s) => s.caseName === "downside")!;
    expect(down.keyMetricDelta).toBeNull();
  });

  it("drops a case whose name is outside the closed vocabulary", () => {
    const rogue = snap({
      result: {
        cases: [
          { name: "sideways", probabilityPct: 10, narrative: "n", thesisImpact: "t", drivers: [] },
          { name: "base", probabilityPct: 90, narrative: "n", thesisImpact: "t", drivers: [] },
        ],
      },
    });
    const rows = projectScenarios([rogue]);
    expect(rows.map((r) => r.caseName)).toEqual(["base"]);
  });

  it("survives a snapshot with a null result or no cases", () => {
    expect(projectScenarios([snap({ result: null })])).toEqual([]);
    expect(projectScenarios([snap({ result: { cases: [] } })])).toEqual([]);
  });
});

describe("driver → assumption resolution", () => {
  it("matches through case, whitespace and trailing punctuation noise", () => {
    expect(normaliseDriverName("  EBITDA   margin is Sustainable post-close.  ")).toBe(
      "ebitda margin is sustainable post-close",
    );
  });

  it("resolves a named driver to the deal's assumption id", () => {
    const base = projectScenarios([snap()], ASSUMPTIONS).find((s) => s.caseName === "base")!;
    expect(base.drivers.map((d) => d.assumptionId)).toEqual([11, 12]);
  });

  it("leaves an unlogged driver null rather than guessing", () => {
    // "Freight costs normalise by Q3" is in no assumption row. A near-miss must
    // stay unmatched: a wrong link on a decision surface beats an absent one.
    const down = projectScenarios([snap()], ASSUMPTIONS).find((s) => s.caseName === "downside")!;
    expect(down.drivers.find((d) => d.assumption.startsWith("Freight"))!.assumptionId).toBeNull();
    expect(unmatchedDrivers(down)).toEqual(["Freight costs normalise by Q3"]);
  });

  it("does NOT substring- or prefix-match", () => {
    const rows = projectScenarios([snap()], [{ id: 99, assumption: "EBITDA margin" }]);
    const base = rows.find((s) => s.caseName === "base")!;
    expect(base.drivers[0].assumptionId).toBeNull();
  });

  it("indexes duplicate assumption text deterministically, first row wins", () => {
    const idx = indexAssumptions([
      { id: 5, assumption: "Same text" },
      { id: 6, assumption: "same TEXT" },
    ]);
    expect(idx.get("same text")).toBe(5);
  });

  it("coerces an unknown direction rather than dropping the driver", () => {
    const odd = snap({
      result: {
        cases: [
          {
            name: "base",
            probabilityPct: 100,
            narrative: "n",
            thesisImpact: "t",
            drivers: [{ assumption: "EBITDA margin is sustainable post-close", direction: "wobbles" }],
          },
        ],
      },
    });
    expect(projectScenarios([odd], ASSUMPTIONS)[0].drivers[0]).toMatchObject({
      direction: "holds",
      assumptionId: 11,
    });
  });
});

describe("reverse lookups", () => {
  it("finds every case that names an assumption as a driver", () => {
    const rows = projectScenarios([snap()], ASSUMPTIONS);
    expect(scenariosForAssumption(rows, 11).map((s) => s.caseName).sort()).toEqual([
      "base",
      "downside",
      "upside",
    ]);
    // 13 is a logged assumption no case happens to name.
    expect(scenariosForAssumption(rows, 13)).toEqual([]);
  });

  it("groups a run's cases", () => {
    const rows = projectScenarios([snap({ id: 47 }), snap({ id: 52 })], ASSUMPTIONS);
    expect(scenariosOfSnapshot(rows, 47)).toHaveLength(3);
    expect(scenariosOfSnapshot(rows, 47).every((s) => s.snapshotId === 47)).toBe(true);
  });
});

describe("compare selection", () => {
  const rows = projectScenarios([snap()], ASSUMPTIONS);

  it("needs two and caps at three", () => {
    expect(canCompare([])).toBe(false);
    expect(canCompare([1])).toBe(false);
    expect(canCompare([1, 2])).toBe(true);
    expect(canCompare([1, 2, 3])).toBe(true);
    expect(canCompare([1, 2, 3, 4])).toBe(false);
    expect(compareBlockedMessage(0)).toBe("Select 2 more cases to compare.");
    expect(compareBlockedMessage(1)).toBe("Select 1 more case to compare.");
    expect(compareBlockedMessage(2)).toBeNull();
    expect(compareBlockedMessage(4)).toBe(`Compare up to ${MAX_COMPARE} cases at a time.`);
  });

  it("preserves the caller's order, dedupes, and drops unknown ids", () => {
    const sel = resolveCompareSelection(rows, ["47:upside", "47:base", "47:upside", "99:base"]);
    expect(sel.map((s) => s.id)).toEqual(["47:upside", "47:base"]);
  });

  it("truncates past the cap instead of erroring", () => {
    const sel = resolveCompareSelection(rows, ["47:downside", "47:base", "47:upside", "47:base"]);
    expect(sel).toHaveLength(MAX_COMPARE);
  });
});

describe("compareDrivers", () => {
  const rows = projectScenarios([snap()], ASSUMPTIONS);
  const sel = resolveCompareSelection(rows, ["47:downside", "47:base"]);

  it("aligns each driver positionally and marks disagreement", () => {
    const table = compareDrivers(sel);
    const ebitda = table.find((r) => r.assumption.startsWith("EBITDA"))!;
    // Column order follows the selection: downside then base.
    expect(ebitda.directions).toEqual(["breaks", "holds"]);
    expect(ebitda.agrees).toBe(false);
    expect(ebitda.assumptionId).toBe(11);
  });

  it("marks a driver null in a case that does not name it", () => {
    const freight = compareDrivers(sel).find((r) => r.assumption.startsWith("Freight"))!;
    expect(freight.directions).toEqual(["breaks", null]);
    expect(freight.agrees).toBe(false);
  });

  it("sorts disagreements before unanimous rows", () => {
    // Two real columns: they agree on "Key engineers" and differ on "EBITDA".
    // (An earlier version of this test selected the same case twice, which
    // resolveCompareSelection dedupes to one column — making every row
    // unanimous and the assertion vacuous.)
    const mixed = snap({
      id: 60,
      result: {
        cases: [
          {
            name: "base", probabilityPct: 60, narrative: "n", thesisImpact: "t",
            drivers: [
              { assumption: "EBITDA margin is sustainable post-close", direction: "holds" },
              { assumption: "Key engineers stay through integration", direction: "holds" },
            ],
          },
          {
            name: "downside", probabilityPct: 40, narrative: "n", thesisImpact: "t",
            drivers: [
              { assumption: "EBITDA margin is sustainable post-close", direction: "breaks" },
              { assumption: "Key engineers stay through integration", direction: "holds" },
            ],
          },
        ],
      },
    });
    const two = resolveCompareSelection(projectScenarios([mixed], ASSUMPTIONS), [
      "60:downside",
      "60:base",
    ]);
    expect(two).toHaveLength(2);

    const table = compareDrivers(two);
    expect(table).toHaveLength(2);
    // The contested driver leads; the unanimous one follows.
    expect(table[0].assumption).toMatch(/^EBITDA/);
    expect(table[0].agrees).toBe(false);
    expect(table[1].assumption).toMatch(/^Key engineers/);
    expect(table[1].agrees).toBe(true);
    expect(table[1].directions).toEqual(["holds", "holds"]);
  });

  it("lines up the same assumption written with different capitalisation", () => {
    const messy = snap({
      result: {
        cases: [
          {
            name: "base", probabilityPct: 50, narrative: "n", thesisImpact: "t",
            drivers: [{ assumption: "EBITDA margin is sustainable post-close", direction: "holds" }],
          },
          {
            name: "downside", probabilityPct: 50, narrative: "n", thesisImpact: "t",
            drivers: [{ assumption: "ebitda MARGIN is sustainable post-close.", direction: "breaks" }],
          },
        ],
      },
    });
    const s = projectScenarios([messy], ASSUMPTIONS);
    const table = compareDrivers(resolveCompareSelection(s, ["47:downside", "47:base"]));
    expect(table).toHaveLength(1);
    expect(table[0].directions).toEqual(["breaks", "holds"]);
  });
});

describe("recommendations in play", () => {
  const rows = projectScenarios([snap()], ASSUMPTIONS);
  const base = rows.find((s) => s.caseName === "base")!;
  const down = rows.find((s) => s.caseName === "downside")!;

  const links = [
    { recommendationId: 1, scenarioAnalysisId: 47, caseName: "downside", relation: "relevant_if_false", claim: "Proceed", status: "accepted" },
    { recommendationId: 2, scenarioAnalysisId: 47, caseName: "all", relation: "assumes", claim: "Underwrite at 8x", status: "accepted" },
    { recommendationId: 3, scenarioAnalysisId: 47, caseName: "base", relation: "stress_case", claim: "Hold price", status: "draft" },
    { recommendationId: 4, scenarioAnalysisId: 52, caseName: "base", relation: "supports", claim: "Other run", status: "accepted" },
  ];

  it("maps the 15.9 relation vocabulary onto a stance", () => {
    expect(stanceOfRelation("relevant_if_false")).toBe("at_risk");
    expect(stanceOfRelation("contradicted_by")).toBe("at_risk");
    expect(stanceOfRelation("assumes")).toBe("depends_on");
    expect(stanceOfRelation("supports")).toBe("depends_on");
    expect(stanceOfRelation("stress_case")).toBe("survives");
  });

  it("includes an 'all' link on every case of that run", () => {
    expect(recommendationsInPlay(base, links).map((r) => r.recommendationId)).toEqual([2, 3]);
    expect(recommendationsInPlay(down, links).map((r) => r.recommendationId)).toEqual([1, 2]);
  });

  it("never leaks a link belonging to a different run", () => {
    for (const s of rows) {
      expect(recommendationsInPlay(s, links).map((r) => r.recommendationId)).not.toContain(4);
    }
  });

  it("sorts what breaks before what merely rests on it", () => {
    expect(recommendationsInPlay(down, links).map((r) => r.stance)).toEqual([
      "at_risk",
      "depends_on",
    ]);
  });

  it("summarises honestly, and says nothing when nothing is linked", () => {
    expect(inPlaySummary([])).toBeNull();
    expect(inPlaySummary(recommendationsInPlay(down, links))).toBe(
      "1 of 2 linked recommendations would change.",
    );
    expect(inPlaySummary(recommendationsInPlay(base, links))).toBe(
      "2 linked recommendations, none at risk.",
    );
  });
});

describe("the case vocabulary is closed", () => {
  it("has exactly three cases in worst-to-best order", () => {
    expect(SCENARIO_CASE_NAMES).toEqual(["downside", "base", "upside"]);
  });
});

describe("the chain: scenario -> assumptions/recommendations -> outcomes", () => {
  const rows = projectScenarios([snap()], ASSUMPTIONS);
  const down = rows.find((s) => s.caseName === "downside")!;

  const links = [
    { recommendationId: 1, scenarioAnalysisId: 47, caseName: "all", relation: "assumes", claim: "Underwrite at 8x", status: "accepted" },
    { recommendationId: 2, scenarioAnalysisId: 47, caseName: "downside", relation: "contradicted_by", claim: "Hold price", status: "accepted" },
  ];

  it("takes the LATEST read, not the first", () => {
    // Held at 30 days, contradicted at 90 → the claim is contradicted.
    const g = latestGlimpse([
      { outcomeType: "held", horizon: "30_day", recordedAt: "2026-03-01T00:00:00.000Z" },
      { outcomeType: "contradicted", horizon: "90_day", recordedAt: "2026-06-01T00:00:00.000Z" },
    ])!;
    expect(g.outcomeType).toBe("contradicted");
    expect(g.label).toBe("Contradicted");
    expect(g.signal).toBe("negative");
  });

  it("is null when nothing has been read", () => {
    expect(latestGlimpse([])).toBeNull();
  });

  it("borrows the shipped vocabulary rather than restating it", () => {
    expect(latestGlimpse([{ outcomeType: "partially_held", recordedAt: "2026-01-01" }])!.label).toBe(
      "Partially held",
    );
  });

  it("attaches an assumption's outcome to the driver that names it", () => {
    const chain = scenarioChain(down, {
      links,
      assumptionOutcomes: [
        { assumptionId: 11, outcomeType: "contradicted", horizon: "90_day", recordedAt: "2026-06-01" },
      ],
    });
    const ebitda = chain.drivers.find((d) => d.assumptionId === 11)!;
    expect(ebitda.latestOutcome!.outcomeType).toBe("contradicted");
    // Assumption 12 has no read → null, not a fabricated neutral.
    expect(chain.drivers.find((d) => d.assumptionId === 12)!.latestOutcome).toBeNull();
  });

  it("NEVER attaches an outcome to an unresolved driver", () => {
    // "Freight costs normalise by Q3" resolves to no assumption row. Matching it
    // by text is exactly what projectScenarios refuses to do.
    const chain = scenarioChain(down, {
      links,
      assumptionOutcomes: [
        { assumptionId: 11, outcomeType: "held", recordedAt: "2026-06-01" },
      ],
    });
    const unresolved = chain.drivers.find((d) => d.assumptionId === null)!;
    expect(unresolved.latestOutcome).toBeNull();
  });

  it("attaches a recommendation's outcome to the conclusion in play", () => {
    const chain = scenarioChain(down, {
      links,
      recommendationOutcomes: [
        { recommendationId: 2, outcomeType: "held", horizon: "6_month", recordedAt: "2026-07-01" },
      ],
    });
    const rec2 = chain.recommendations.find((r) => r.recommendationId === 2)!;
    expect(rec2.latestOutcome!.signal).toBe("positive");
    expect(chain.recommendations.find((r) => r.recommendationId === 1)!.latestOutcome).toBeNull();
  });

  it("never leaks another scenario's recommendation into the chain", () => {
    const base = rows.find((s) => s.caseName === "base")!;
    // rec 2 is linked to the DOWNSIDE case only.
    expect(scenarioChain(base, { links }).recommendations.map((r) => r.recommendationId)).toEqual([1]);
  });

  it("counts reads across both ends of the chain", () => {
    const chain = scenarioChain(down, {
      links,
      assumptionOutcomes: [{ assumptionId: 11, outcomeType: "held", recordedAt: "2026-06-01" }],
      recommendationOutcomes: [{ recommendationId: 2, outcomeType: "held", recordedAt: "2026-07-01" }],
    });
    expect(chain.readsRecorded).toBe(2);
    expect(untestedChainNote(chain)).toBeNull();
  });

  it("says so when the case has never been tested against reality", () => {
    // An empty column reads as "nothing went wrong"; it means "nobody looked".
    const chain = scenarioChain(down, { links });
    expect(chain.readsRecorded).toBe(0);
    expect(untestedChainNote(chain)).toBe("Nothing along this chain has been read back yet.");
  });

  it("stays silent on a scenario with nothing attached at all", () => {
    const bare = projectScenarios([
      snap({ id: 90, result: { cases: [{ name: "base", probabilityPct: 100, narrative: "n", thesisImpact: "t", drivers: [] }] } }),
    ])[0];
    expect(untestedChainNote(scenarioChain(bare, { links: [] }))).toBeNull();
  });
});
