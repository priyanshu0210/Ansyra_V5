import { describe, it, expect } from "vitest";
import {
  LOW_ASSUMPTION_SAMPLE,
  MIN_ASSUMPTION_SUPPORT,
  MIN_CONTRADICTED,
  ASSUMPTION_BLOCK_LABEL,
  assumptionHintBlock,
  foldAssumptionFindings,
  relevantFindings,
  isAgainstAssumption,
  isInconclusive,
  isPartialMiss,
  lowSampleNote,
  type AssumptionCell,
} from "./assumption-learning";

const cell = (over: Partial<AssumptionCell> = {}): AssumptionCell => ({
  category: "revenue_retention",
  horizon: "post_close",
  outcomeType: "contradicted",
  n: 1,
  ...over,
});

describe("what counts against an assumption", () => {
  it("counts ONLY contradicted, because that is what the sentence claims", () => {
    expect(isAgainstAssumption("contradicted")).toBe(true);
    expect(isAgainstAssumption("held")).toBe(false);
    // NOT reused from OUTCOME_SIGNAL: that map decides chip tint and files
    // partially_held as neutral. A headline must not depend on a styling call.
    expect(isAgainstAssumption("partially_held")).toBe(false);
    expect(isPartialMiss("partially_held")).toBe(true);
  });

  it("carries partial misses beside the rate, never inside it", () => {
    const [f] = foldAssumptionFindings([
      { category: "margin", horizon: "6_month", outcomeType: "contradicted", n: 3 },
      { category: "margin", horizon: "6_month", outcomeType: "partially_held", n: 4 },
      { category: "margin", horizon: "6_month", outcomeType: "held", n: 1 },
    ]);
    expect(f.contradictedCount).toBe(3);
    expect(f.partiallyHeldCount).toBe(4);
    expect(f.supportingCount).toBe(8);
    expect(f.description).toContain("contradicted in 3 of 8");
  });

  it("treats too_early and moot as saying nothing either way", () => {
    expect(isInconclusive("too_early")).toBe(true);
    expect(isInconclusive("moot")).toBe(true);
    expect(isInconclusive("held")).toBe(false);
    expect(isInconclusive("contradicted")).toBe(false);
  });
});

describe("foldAssumptionFindings", () => {
  it("produces the sentence the brief asked for", () => {
    const [f] = foldAssumptionFindings([
      cell({ outcomeType: "contradicted", n: 4 }),
      cell({ outcomeType: "held", n: 3 }),
    ]);
    expect(f.description).toBe(
      "Revenue retention assumptions were contradicted in 4 of 7 post-close reads.",
    );
    expect(f.contradictedCount).toBe(4);
    expect(f.supportingCount).toBe(7);
    expect(f.rate).toBe(0.571);
    expect(f.severity).toBe("elevated");
  });

  it("SUPPRESSES a cluster below the support floor rather than caveating it", () => {
    // "100% failed (1 of 1)" is not a weak claim, it is a false one.
    expect(
      foldAssumptionFindings([cell({ outcomeType: "contradicted", n: MIN_ASSUMPTION_SUPPORT - 1 })]),
    ).toEqual([]);
  });

  it("suppresses a cluster with enough reads but too few misses", () => {
    const out = foldAssumptionFindings([
      cell({ outcomeType: "contradicted", n: MIN_CONTRADICTED - 1 }),
      cell({ outcomeType: "held", n: 20 }),
    ]);
    expect(out).toEqual([]);
  });

  it("flags a thin sample rather than hiding it, above the floors", () => {
    const [f] = foldAssumptionFindings([
      cell({ outcomeType: "contradicted", n: 3 }),
      cell({ outcomeType: "held", n: 2 }),
    ]);
    expect(f.supportingCount).toBeLessThan(LOW_ASSUMPTION_SAMPLE);
    expect(f.lowSample).toBe(true);
    expect(lowSampleNote(f)).toBe("Based on 5 reads — directional, not conclusive.");
  });

  it("drops the low-sample note once the sample is real", () => {
    const [f] = foldAssumptionFindings([
      cell({ outcomeType: "contradicted", n: 5 }),
      cell({ outcomeType: "held", n: 5 }),
    ]);
    expect(f.lowSample).toBe(false);
    expect(lowSampleNote(f)).toBeNull();
  });

  it("NEVER makes a claim about `other`", () => {
    // "other" is the catch-all plus every pre-15.15 row: an incoherent set.
    const out = foldAssumptionFindings([
      cell({ category: "other", outcomeType: "contradicted", n: 40 }),
      cell({ category: "other", outcomeType: "held", n: 2 }),
    ]);
    expect(out).toEqual([]);
  });

  it("ignores an unrecognised category instead of inventing a label", () => {
    expect(
      foldAssumptionFindings([cell({ category: "widgets", outcomeType: "contradicted", n: 40 })]),
    ).toEqual([]);
  });

  it("drops unscheduled and absent horizons", () => {
    // An ad-hoc read taken whenever someone felt like it is not comparable to a
    // six-month one, and "4 of 7" only means something if they are comparable.
    for (const horizon of [null, "ad_hoc", "whenever"]) {
      expect(
        foldAssumptionFindings([
          cell({ horizon, outcomeType: "contradicted", n: 10 }),
          cell({ horizon, outcomeType: "held", n: 10 }),
        ]),
        `horizon=${horizon}`,
      ).toEqual([]);
    }
  });

  it("keeps inconclusive reads out of the denominator", () => {
    // 4 contradicted + 3 held + 20 too_early must read "4 of 7", not "4 of 27".
    const [f] = foldAssumptionFindings([
      cell({ outcomeType: "contradicted", n: 4 }),
      cell({ outcomeType: "held", n: 3 }),
      cell({ outcomeType: "too_early", n: 20 }),
      cell({ outcomeType: "moot", n: 5 }),
    ]);
    expect(f.supportingCount).toBe(7);
    expect(f.description).toContain("4 of 7");
  });

  it("separates categories and horizons into their own findings", () => {
    const out = foldAssumptionFindings([
      cell({ category: "regulatory", horizon: "90_day", outcomeType: "contradicted", n: 4 }),
      cell({ category: "regulatory", horizon: "90_day", outcomeType: "held", n: 1 }),
      cell({ category: "regulatory", horizon: "post_close", outcomeType: "contradicted", n: 5 }),
      cell({ category: "regulatory", horizon: "post_close", outcomeType: "held", n: 1 }),
    ]);
    expect(out).toHaveLength(2);
    expect(new Set(out.map((f) => f.findingId))).toEqual(
      new Set(["regulatory:90_day", "regulatory:post_close"]),
    );
  });

  it("severity tracks the rate", () => {
    const acute = foldAssumptionFindings([
      cell({ outcomeType: "contradicted", n: 8 }),
      cell({ outcomeType: "held", n: 2 }),
    ])[0];
    const noted = foldAssumptionFindings([
      cell({ outcomeType: "contradicted", n: 2 }),
      cell({ outcomeType: "held", n: 8 }),
    ])[0];
    expect(acute.severity).toBe("acute");
    expect(noted.severity).toBe("noted");
  });

  it("is byte-stable over a shuffled input", () => {
    const cells = [
      cell({ category: "margin", horizon: "6_month", outcomeType: "contradicted", n: 3 }),
      cell({ category: "margin", horizon: "6_month", outcomeType: "held", n: 3 }),
      cell({ category: "integration", horizon: "90_day", outcomeType: "contradicted", n: 6 }),
      cell({ category: "integration", horizon: "90_day", outcomeType: "held", n: 1 }),
    ];
    const a = foldAssumptionFindings(cells);
    const b = foldAssumptionFindings([...cells].reverse());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // Most misses first.
    expect(a[0].category).toBe("integration");
  });
});

describe("the drafter's block", () => {
  const findings = foldAssumptionFindings([
    { category: "revenue_retention", horizon: "post_close", outcomeType: "contradicted", n: 4 },
    { category: "revenue_retention", horizon: "post_close", outcomeType: "held", n: 3 },
    { category: "regulatory", horizon: "90_day", outcomeType: "contradicted", n: 6 },
    { category: "regulatory", horizon: "90_day", outcomeType: "held", n: 6 },
  ]);

  it("names whose ledger it is", () => {
    // The model has general priors about M&A assumptions failing. This block is
    // specifically THIS firm's record, and conflating them would let a general
    // prior be reported back as evidence about the firm.
    expect(ASSUMPTION_BLOCK_LABEL).toMatch(/this firm's own/i);
    expect(ASSUMPTION_BLOCK_LABEL).toMatch(/not general knowledge/i);
  });

  it("MUST NOT look like a citation offer", () => {
    // ai-mock scans for citable ids with /\}:\n {2}- \[id=(\d+)\]/. A header in
    // that shape followed by "  - " lines would inject a phantom offer and let
    // the mock cite an analysis nobody supplied.
    expect(ASSUMPTION_BLOCK_LABEL).not.toMatch(/cite as/);
    expect(ASSUMPTION_BLOCK_LABEL).not.toMatch(/\{"kind"/);
    expect(assumptionHintBlock(findings)).not.toMatch(/\[id=\d+\]/);
  });

  it("carries every finding, and the low-sample hedge only where due", () => {
    const block = assumptionHintBlock(findings);
    for (const f of findings) expect(block).toContain(f.description);
    // revenue_retention has 7 reads (< 8) → hedged; regulatory has 12 → not.
    const rr = findings.find((f) => f.category === "revenue_retention")!;
    const reg = findings.find((f) => f.category === "regulatory")!;
    expect(block).toContain(`${rr.description} [low sample — indicative only]`);
    expect(block).toContain(`${reg.description}\n`);
    expect(block).not.toContain(`${reg.description} [low sample`);
  });

  it("says '(none on file)' rather than nothing when there is no history", () => {
    // An absent block would let the model assume the firm has a clean record.
    expect(assumptionHintBlock([])).toBe(`${ASSUMPTION_BLOCK_LABEL}:\n  (none on file)`);
  });

  it("matches the local block() shape the prompt and mock both read", () => {
    expect(assumptionHintBlock(findings).startsWith(`${ASSUMPTION_BLOCK_LABEL}:\n  - `)).toBe(true);
  });
});

describe("relevantFindings", () => {
  const findings = foldAssumptionFindings([
    { category: "revenue_retention", horizon: "post_close", outcomeType: "contradicted", n: 4 },
    { category: "revenue_retention", horizon: "post_close", outcomeType: "held", n: 3 },
    { category: "financing", horizon: "90_day", outcomeType: "contradicted", n: 6 },
    { category: "financing", horizon: "90_day", outcomeType: "held", n: 1 },
  ]);

  it("drops findings about categories this deal does not rely on", () => {
    // A financing finding is noise on a deal with no financing assumption, and
    // noise invites the model to invent an angle to match it.
    const out = relevantFindings(findings, ["revenue_retention", "margin"]);
    expect(out.map((f) => f.category)).toEqual(["revenue_retention"]);
  });

  it("returns nothing when the deal has no assumptions at all", () => {
    expect(relevantFindings(findings, [])).toEqual([]);
  });

  it("caps the block", () => {
    expect(relevantFindings(findings, ["revenue_retention", "financing"], 1)).toHaveLength(1);
  });

  it("preserves the fold's order rather than re-sorting", () => {
    // foldAssumptionFindings already emits a total order; re-sorting here would
    // break the byte-stability that makes the prompt assertable.
    const out = relevantFindings(findings, ["revenue_retention", "financing"]);
    expect(out.map((f) => f.category)).toEqual(
      findings.filter((f) => ["revenue_retention", "financing"].includes(f.category)).map((f) => f.category),
    );
  });
});
