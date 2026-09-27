import { describe, expect, it } from "vitest";
import { confidenceBand } from "./recommendations";
import {
  LOW_CONFIDENCE_SAMPLE,
  MIN_HIGH_SIGNAL,
  MIN_PATTERN_SUPPORT,
  PATTERN_BLOCK_LABEL,
  describePattern,
  foldPatterns,
  matchesPattern,
  patternHintBlock,
  patternId,
  patternSeverity,
  relevantPatterns,
  sortPatterns,
  type FailurePattern,
  type PatternCell,
} from "./failure-patterns";

// The SQL that produces these cells cannot be tested here — there is no db
// harness in this repo, and building one means faking db.execute(sql`…`) with
// jsonb lateral-join semantics, which is not a test, it is a second Postgres.
//
// What IS tested here is every counting rule the SQL feeds: the fold, both
// floors, the description, the sort, the match, and the prompt block. The
// query's own risks — scope, demo exclusion, jsonb unnesting, and the
// created_by/"createdBy" column-naming trap — are covered by the source-level
// guard in api/failure-patterns.wiring.test.ts.
//
// A PatternCell IS the SQL's output row, so seeding cells here is seeding
// recommendations and outcomes at the only layer that exists to seed.

const cell = (over: Partial<PatternCell> = {}): PatternCell => ({
  kind: "regulatory",
  stage: "diligence",
  band: "high",
  horizon: "6_month",
  recStatus: "accepted",
  outcomeType: "contradicted",
  n: 1,
  exampleRecommendationIds: [],
  ...over,
});

describe("foldPatterns — the worked example from the spec", () => {
  // Six six-month reads on high-confidence regulatory claims at diligence.
  // Four went against the firm; two held.
  const cells = [
    cell({ n: 4, outcomeType: "contradicted", exampleRecommendationIds: [11, 12, 13, 14] }),
    cell({ n: 2, outcomeType: "held" }),
  ];

  it("produces exactly one pattern with the right counts", () => {
    const [p, ...rest] = foldPatterns(cells);
    expect(rest).toEqual([]);
    expect(p.patternId).toBe("regulatory:diligence:high:6_month");
    expect(p.supportingCount).toBe(6);
    expect(p.highSignalCount).toBe(4);
    expect(p.rate).toBe(0.667);
    expect(p.severity).toBe("acute");
    expect(p.lowSample).toBe(false);
    expect(p.direction).toBe("accepted");
  });

  it("writes the sentence a partner actually reads", () => {
    expect(foldPatterns(cells)[0].description).toBe(
      "Accepted regulatory recommendations at diligence with high confidence were contradicted in 4 of 6 six-month reads.",
    );
  });

  it("offers at most three examples, and only from reads that went wrong", () => {
    const p = foldPatterns([
      cell({ n: 4, outcomeType: "contradicted", exampleRecommendationIds: [11, 12, 13, 14] }),
      // A read that went the firm's way must never supply a "where this showed
      // up" link — the link would lead to a success.
      cell({ n: 2, outcomeType: "held", exampleRecommendationIds: [99] }),
    ])[0];
    expect(p.exampleRecommendationIds).toEqual([11, 12, 13]);
    expect(p.exampleRecommendationIds).not.toContain(99);
  });
});

describe("foldPatterns — the other direction", () => {
  it("describes a rejected claim that turned out right", () => {
    const p = foldPatterns([
      cell({ recStatus: "rejected", outcomeType: "held", n: 3, kind: "cultural", band: "medium" }),
      cell({ recStatus: "rejected", outcomeType: "contradicted", n: 1, kind: "cultural", band: "medium" }),
    ])[0];
    expect(p.direction).toBe("rejected");
    expect(p.description).toBe(
      "Rejected cultural recommendations at diligence with medium confidence held after being rejected in 3 of 4 six-month reads.",
    );
  });
});

describe("the floors — a pattern the data cannot support is not printed", () => {
  it("suppresses a cluster below MIN_PATTERN_SUPPORT entirely", () => {
    expect(foldPatterns([cell({ n: MIN_PATTERN_SUPPORT - 1 })])).toEqual([]);
  });

  it("suppresses a well-supported cluster with too few actual misfires", () => {
    // 1 of 8 is not a pattern, it is a coincidence with a percentage attached.
    const out = foldPatterns([
      cell({ n: MIN_HIGH_SIGNAL - 1, outcomeType: "contradicted" }),
      cell({ n: 7, outcomeType: "held" }),
    ]);
    expect(out).toEqual([]);
  });

  it("admits a cluster that clears both floors, flagged when thin", () => {
    const [p] = foldPatterns([
      cell({ n: 3, outcomeType: "contradicted" }),
      cell({ n: 1, outcomeType: "held" }),
    ]);
    expect(p.supportingCount).toBe(4);
    expect(p.supportingCount).toBeLessThan(LOW_CONFIDENCE_SAMPLE);
    expect(p.lowSample).toBe(true);
  });

  it("drops the flag once the sample is no longer thin", () => {
    expect(foldPatterns([cell({ n: LOW_CONFIDENCE_SAMPLE })])[0].lowSample).toBe(false);
  });
});

describe("foldPatterns reads isHighSignal rather than restating it", () => {
  it("counts non-high-signal reads toward support but never toward failure", () => {
    const [p] = foldPatterns([
      cell({ n: 2, outcomeType: "contradicted" }), // accepted+contradicted → high
      cell({ n: 3, outcomeType: "too_early" }), // looked, cannot tell yet
      cell({ n: 1, outcomeType: "moot" }),
      cell({ n: 2, outcomeType: "partially_held" }),
    ]);
    expect(p.supportingCount).toBe(8);
    expect(p.highSignalCount).toBe(2);
  });

  it("does not treat a rejected-and-contradicted read as a failure — the firm was right", () => {
    // rejected + contradicted means: we passed, and the claim was indeed wrong.
    // That is agreement, not a misfire, and isHighSignal says so.
    const out = foldPatterns([
      cell({ recStatus: "rejected", outcomeType: "contradicted", n: 9 }),
    ]);
    expect(out).toEqual([]);
  });

  it("ignores outcomes on a draft, which nobody has claimed", () => {
    expect(foldPatterns([cell({ recStatus: "draft", outcomeType: "contradicted", n: 9 })])).toEqual([]);
  });
});

describe("overlapping lenses", () => {
  it("counts a recommendation citing two kinds in BOTH clusters, on purpose", () => {
    // The same six reads, on claims that cited both regulatory and economics
    // evidence. Each pattern's claim is scoped to "recommendations that cited
    // <kind>" and is true exactly as stated — so this is not double-counting to
    // be fixed, it is two lenses on one body of experience.
    const out = foldPatterns([
      cell({ kind: "regulatory", n: 4 }),
      cell({ kind: "regulatory", n: 2, outcomeType: "held" }),
      cell({ kind: "economics", n: 4 }),
      cell({ kind: "economics", n: 2, outcomeType: "held" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((p) => p.kind).sort()).toEqual(["economics", "regulatory"]);
    for (const p of out) expect(p.supportingCount).toBe(6);
  });

  it("keeps clusters apart when only the stage or band differs", () => {
    const out = foldPatterns([
      cell({ n: 4 }),
      cell({ n: 4, stage: "negotiation" }),
      cell({ n: 4, band: "low" }),
    ]);
    expect(out).toHaveLength(3);
    expect(new Set(out.map((p) => p.patternId)).size).toBe(3);
  });
});

describe("horizon", () => {
  it("says 'recorded reads' for an unlabelled horizon, never 'ad-hoc'", () => {
    // ad_hoc is a reading someone CHOSE to take off-schedule; unspecified is one
    // nobody labelled. Conflating them would be a lie about the data.
    const p = foldPatterns([cell({ n: 4, horizon: "unspecified" })])[0];
    expect(p.description).toContain("4 of 4 recorded reads.");
    expect(p.description).not.toContain("ad-hoc");
  });

  it("keeps ad-hoc distinct in both the id and the sentence", () => {
    const p = foldPatterns([cell({ n: 4, horizon: "ad_hoc" })])[0];
    expect(p.patternId).toBe("regulatory:diligence:high:ad_hoc");
    expect(p.description).toContain("ad-hoc reads.");
  });
});

describe("patternSeverity", () => {
  it("bands at the documented thresholds", () => {
    expect(patternSeverity(0.5)).toBe("acute");
    expect(patternSeverity(0.49)).toBe("elevated");
    expect(patternSeverity(0.25)).toBe("elevated");
    expect(patternSeverity(0.24)).toBe("noted");
    expect(patternSeverity(1)).toBe("acute");
  });

  it("does not throw on a non-finite rate", () => {
    expect(patternSeverity(Number.NaN)).toBe("noted");
  });
});

describe("sortPatterns", () => {
  const p = (over: Partial<FailurePattern>): FailurePattern =>
    ({
      patternId: patternId("regulatory", "diligence", "high", "6_month"),
      kind: "regulatory",
      stage: "diligence",
      band: "high",
      horizon: "6_month",
      direction: "accepted",
      highSignalCount: 2,
      supportingCount: 4,
      rate: 0.5,
      severity: "acute",
      lowSample: true,
      exampleRecommendationIds: [],
      description: "",
      ...over,
    }) as FailurePattern;

  it("puts the most consequential first", () => {
    const out = sortPatterns([
      p({ patternId: "a", highSignalCount: 2 }),
      p({ patternId: "b", highSignalCount: 9 }),
    ]);
    expect(out.map((x) => x.patternId)).toEqual(["b", "a"]);
  });

  it("is a TOTAL order, so the drafter's prompt cannot reshuffle between calls", () => {
    const tied = ["d", "a", "c", "b"].map((patternId) => p({ patternId }));
    const once = sortPatterns(tied).map((x) => x.patternId);
    const again = sortPatterns([...tied].reverse()).map((x) => x.patternId);
    expect(once).toEqual(again);
    expect(once).toEqual(["a", "b", "c", "d"]);
  });

  it("does not mutate its input", () => {
    const rows = [p({ patternId: "z", highSignalCount: 1 }), p({ patternId: "a", highSignalCount: 9 })];
    sortPatterns(rows);
    expect(rows[0].patternId).toBe("z");
  });
});

describe("relevantPatterns", () => {
  const at = (stage: string, id: string) =>
    ({ stage, patternId: id }) as FailurePattern;

  it("narrows to the stage being drafted for", () => {
    const out = relevantPatterns([at("diligence", "a"), at("closing", "b")], "diligence");
    expect(out.map((x) => x.patternId)).toEqual(["a"]);
  });

  it("caps the list, so the prompt cannot be swamped", () => {
    const many = Array.from({ length: 12 }, (_, i) => at("diligence", `p${i}`));
    expect(relevantPatterns(many, "diligence")).toHaveLength(5);
    expect(relevantPatterns(many, "diligence", 2)).toHaveLength(2);
  });
});

describe("matchesPattern", () => {
  const pattern = { kind: "regulatory", stage: "diligence", band: "high" } as Pick<
    FailurePattern,
    "kind" | "stage" | "band"
  >;
  const rec = (over: Partial<Parameters<typeof matchesPattern>[0]> = {}) => ({
    stage: "diligence",
    confidence: 85,
    supportingEvidence: [{ kind: "regulatory" }, { kind: "economics" }],
    ...over,
  });

  it("matches on stage, band and a cited kind", () => {
    expect(matchesPattern(rec(), pattern, confidenceBand)).toBe(true);
  });

  it("does not match a different stage or band", () => {
    expect(matchesPattern(rec({ stage: "closing" }), pattern, confidenceBand)).toBe(false);
    expect(matchesPattern(rec({ confidence: 20 }), pattern, confidenceBand)).toBe(false);
  });

  it("does not match a recommendation that cites nothing of that kind", () => {
    expect(
      matchesPattern(rec({ supportingEvidence: [{ kind: "cultural" }] }), pattern, confidenceBand),
    ).toBe(false);
    expect(matchesPattern(rec({ supportingEvidence: [] }), pattern, confidenceBand)).toBe(false);
  });

  it("ignores horizon entirely — a live recommendation has not been read yet", () => {
    // If horizon were matched, no draft could ever match a pattern (a draft has
    // no reads), and the advisory would be unreachable. Every pattern here
    // differs ONLY by horizon, and every one still matches.
    const byHorizon = foldPatterns([
      cell({ n: 4, horizon: "6_month" }),
      cell({ n: 4, horizon: "30_day" }),
      cell({ n: 4, horizon: "unspecified" }),
    ]);
    expect(byHorizon).toHaveLength(3);
    for (const p of byHorizon) {
      expect(matchesPattern(rec(), p, confidenceBand)).toBe(true);
    }
  });
});

describe("patternHintBlock", () => {
  const fixtures = foldPatterns([
    cell({ n: 4 }),
    cell({ n: 2, outcomeType: "held" }),
    cell({ kind: "cultural", n: 2, outcomeType: "contradicted" }),
    cell({ kind: "cultural", n: 1, outcomeType: "held" }),
  ]);

  it("carries every pattern's sentence under the shared label", () => {
    const block = patternHintBlock(fixtures);
    expect(block.startsWith(`${PATTERN_BLOCK_LABEL}:`)).toBe(true);
    for (const p of fixtures) expect(block).toContain(p.description);
  });

  it("marks the thin ones, and only the thin ones", () => {
    const block = patternHintBlock(fixtures);
    const lines = block.split("\n").slice(1);
    for (const p of fixtures) {
      const line = lines.find((l) => l.includes(p.description))!;
      expect(line.includes("[low sample")).toBe(p.lowSample);
    }
  });

  it("matches the drafter's own empty-block wording", () => {
    expect(patternHintBlock([])).toBe(`${PATTERN_BLOCK_LABEL}:\n  (none on file)`);
  });

  // The load-bearing one. ai-mock.ts finds citable ids by scanning the prompt
  // for `{"kind":"x","id":<id>}:` followed by "  - [id=N]" lines. A pattern
  // block header in that shape would inject a phantom citation offer into mock
  // mode. This fails if anyone rewrites the label into that form.
  it("never takes the shape of a citation offer", () => {
    expect(patternHintBlock(fixtures)).not.toMatch(/\{"kind":"\w+","id":<id>\}/);
    expect(PATTERN_BLOCK_LABEL).not.toContain('"id":<id>');
  });
});

describe("describePattern is total over the enums it reads", () => {
  it("falls back to the raw kind rather than printing undefined", () => {
    const p = foldPatterns([cell({ kind: "not_a_kind", n: 4 })])[0];
    expect(p.description).toContain("not_a_kind recommendations");
    expect(p.description).not.toContain("undefined");
  });

  it("is the same string foldPatterns attaches", () => {
    const [p] = foldPatterns([cell({ n: 4 })]);
    const { description, ...rest } = p;
    expect(describePattern(rest)).toBe(description);
  });
});
