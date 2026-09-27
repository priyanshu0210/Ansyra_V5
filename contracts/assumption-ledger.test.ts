import { describe, it, expect } from "vitest";
import {
  ASSUMPTION_CATEGORIES,
  actedOnDate,
  citingRecommendations,
  coerceCategory,
  ledgerHeadline,
  projectAssumptionLedger,
  summariseLedger,
  type AssumptionOutcomeInput,
  type AssumptionRowInput,
  type CitingRecommendationInput,
} from "./assumption-ledger";
import { RED_FLAG_OPTIMISM } from "./assumption-gate";

const TODAY = "2026-08-11";

function assumption(over: Partial<AssumptionRowInput> = {}): AssumptionRowInput {
  return {
    id: 1,
    dealId: 7,
    assumption: "EBITDA margin is sustainable post-close",
    category: "margin",
    reviewerNote: null,
    result: { optimismScore: 40 },
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "u1",
    ...over,
  };
}

function rec(over: Partial<CitingRecommendationInput> = {}): CitingRecommendationInput {
  return {
    id: 100,
    claim: "Proceed at the current price.",
    status: "accepted",
    stage: "diligence",
    decidedAt: "2026-02-01T00:00:00.000Z",
    supportingEvidence: [{ kind: "assumption", id: 1 }],
    ...over,
  };
}

function outcome(over: Partial<AssumptionOutcomeInput> = {}): AssumptionOutcomeInput {
  return {
    id: 900,
    assumptionId: 1,
    outcomeType: "held",
    outcomeSummary: "Margin held through Q1.",
    horizon: "30_day",
    recordedAt: "2026-03-05T00:00:00.000Z",
    ...over,
  };
}

describe("categories", () => {
  it("is a short closed vocabulary", () => {
    // An axis with thirty values never clears a support floor.
    expect(ASSUMPTION_CATEGORIES.length).toBeLessThanOrEqual(8);
    expect(ASSUMPTION_CATEGORIES).toContain("other");
  });

  it("coerces anything unrecognised to `other` rather than dropping the row", () => {
    for (const junk of [null, undefined, "", "REVENUE_RETENTION", "widgets", 3, {}]) {
      expect(coerceCategory(junk)).toBe("other");
    }
    expect(coerceCategory("regulatory")).toBe("regulatory");
  });
});

describe("citingRecommendations", () => {
  it("reads supporting_evidence rather than a join table", () => {
    const recs = [rec({ id: 100 }), rec({ id: 101, supportingEvidence: [{ kind: "assumption", id: 2 }] })];
    expect(citingRecommendations(1, recs).map((r) => r.id)).toEqual([100]);
  });

  it("requires the KIND to match, not just the id", () => {
    // Evidence ids are per-kind serials: economics #1 is not assumption #1.
    const recs = [rec({ supportingEvidence: [{ kind: "economics", id: 1 }] })];
    expect(citingRecommendations(1, recs)).toEqual([]);
  });

  it("survives a recommendation citing nothing", () => {
    expect(citingRecommendations(1, [rec({ supportingEvidence: null })])).toEqual([]);
    expect(citingRecommendations(1, [rec({ supportingEvidence: [] })])).toEqual([]);
  });
});

describe("actedOnDate", () => {
  it("takes the EARLIEST decision among citing recommendations", () => {
    const date = actedOnDate([
      rec({ id: 1, decidedAt: "2026-05-01T00:00:00.000Z" }),
      rec({ id: 2, decidedAt: "2026-02-01T00:00:00.000Z" }),
      rec({ id: 3, decidedAt: "2026-09-01T00:00:00.000Z" }),
    ]);
    expect(date).toBe("2026-02-01");
  });

  it("ignores drafts — a draft is a thought, not an act", () => {
    expect(actedOnDate([rec({ status: "draft", decidedAt: null })])).toBeNull();
    expect(actedOnDate([rec({ status: "draft", decidedAt: "2026-02-01T00:00:00.000Z" })])).toBeNull();
  });

  it("counts a rejection as acting on the assumption", () => {
    // Rejecting on the strength of an assumption is still relying on it.
    expect(actedOnDate([rec({ status: "rejected" })])).toBe("2026-02-01");
  });

  it("is null when nothing cites it", () => {
    expect(actedOnDate([])).toBeNull();
  });
});

describe("projectAssumptionLedger", () => {
  it("owes nothing until the firm has acted", () => {
    const [row] = projectAssumptionLedger({
      assumptions: [assumption()],
      outcomes: [],
      recommendations: [rec({ status: "draft", decidedAt: null })],
      today: TODAY,
    });
    expect(row.actedOnAt).toBeNull();
    expect(row.horizons).toEqual([]);
    expect(row.schedule.owed).toBe(0);
    // The point: a stress test nobody acted on must not generate work.
    expect(row.citedBy).toHaveLength(1);
  });

  it("owes the standard four reads once acted on", () => {
    const [row] = projectAssumptionLedger({
      assumptions: [assumption()],
      outcomes: [],
      recommendations: [rec()],
      today: TODAY,
    });
    expect(row.actedOnAt).toBe("2026-02-01");
    expect(row.horizons.map((h) => h.horizon)).toEqual([
      "30_day",
      "90_day",
      "6_month",
      "post_close",
    ]);
    // No closing milestone supplied → post_close is unanchored, never guessed.
    expect(row.horizons.find((h) => h.horizon === "post_close")!.state).toBe("unanchored");
  });

  it("anchors the clock on the decision, not on when the assumption was written", () => {
    const [row] = projectAssumptionLedger({
      assumptions: [assumption({ createdAt: "2025-01-01T00:00:00.000Z" })],
      outcomes: [],
      recommendations: [rec({ decidedAt: "2026-08-01T00:00:00.000Z" })],
      today: TODAY,
    });
    // 30 days from 2026-08-01, not from the 2025 creation date.
    expect(row.horizons.find((h) => h.horizon === "30_day")!.dueDate).toBe("2026-08-31");
  });

  it("completes a horizon on an exact label match and orders reads by date", () => {
    const [row] = projectAssumptionLedger({
      assumptions: [assumption()],
      outcomes: [
        outcome({ id: 902, horizon: "90_day", recordedAt: "2026-06-01T00:00:00.000Z" }),
        outcome({ id: 901, horizon: "30_day", recordedAt: "2026-03-05T00:00:00.000Z" }),
      ],
      recommendations: [rec()],
      today: TODAY,
    });
    expect(row.outcomes.map((o) => o.id)).toEqual([901, 902]);
    const states = Object.fromEntries(row.horizons.map((h) => [h.horizon, h.state]));
    expect(states["30_day"]).toBe("completed");
    expect(states["90_day"]).toBe("completed");
    expect(states["6_month"]).toBe("due");
  });

  it("a moot read closes the remaining horizons without claiming anyone looked", () => {
    const [row] = projectAssumptionLedger({
      assumptions: [assumption()],
      outcomes: [outcome({ outcomeType: "moot", horizon: null })],
      recommendations: [rec()],
      today: TODAY,
    });
    const sixMonth = row.horizons.find((h) => h.horizon === "6_month")!;
    expect(sixMonth.state).toBe("completed");
    expect(sixMonth.closedAsMoot).toBe(true);
  });

  it("reads the SHIPPED gate rather than re-deriving red flags", () => {
    const flagged = assumption({ id: 2, result: { optimismScore: RED_FLAG_OPTIMISM + 1 } });
    const answered = assumption({
      id: 3,
      result: { optimismScore: RED_FLAG_OPTIMISM + 1 },
      reviewerNote: "Stress-tested against the downside case.",
    });
    const rows = projectAssumptionLedger({
      assumptions: [assumption(), flagged, answered],
      outcomes: [],
      recommendations: [],
      today: TODAY,
    });
    expect(rows.find((r) => r.id === 2)!.isRedFlag).toBe(true);
    expect(rows.find((r) => r.id === 3)!.isRedFlag).toBe(true);
    // Red flags sort first — they are what is holding the deal up.
    expect(rows.slice(0, 2).map((r) => r.id).sort()).toEqual([2, 3]);
  });

  it("keeps an uncategorised row in the ledger as `other`", () => {
    const [row] = projectAssumptionLedger({
      assumptions: [assumption({ category: null })],
      outcomes: [],
      recommendations: [],
      today: TODAY,
    });
    expect(row.category).toBe("other");
    expect(row.categoryLabel).toBe("Other");
  });

  it("never leaks another assumption's outcomes", () => {
    const rows = projectAssumptionLedger({
      assumptions: [assumption({ id: 1 }), assumption({ id: 2 })],
      outcomes: [outcome({ id: 900, assumptionId: 1 }), outcome({ id: 901, assumptionId: 2 })],
      recommendations: [rec()],
      today: TODAY,
    });
    expect(rows.find((r) => r.id === 1)!.outcomes.map((o) => o.id)).toEqual([900]);
    expect(rows.find((r) => r.id === 2)!.outcomes.map((o) => o.id)).toEqual([901]);
  });

  it("injects the clock — nothing else moves when only `today` does", () => {
    const base = {
      assumptions: [assumption()],
      outcomes: [],
      recommendations: [rec()],
    };
    const early = projectAssumptionLedger({ ...base, today: "2026-02-15" })[0];
    const late = projectAssumptionLedger({ ...base, today: "2026-12-01" })[0];
    const stateOf = (r: typeof early, h: string) =>
      r.horizons.find((x) => x.horizon === h)!.state;
    expect(stateOf(early, "30_day")).toBe("upcoming");
    expect(stateOf(late, "30_day")).toBe("due");
    // Due dates are a property of the anchor, not of when you asked.
    expect(early.horizons.map((h) => h.dueDate)).toEqual(late.horizons.map((h) => h.dueDate));
  });
});

describe("summariseLedger", () => {
  it("counts the things a partner actually asks about", () => {
    const rows = projectAssumptionLedger({
      assumptions: [
        assumption({ id: 1 }),
        assumption({ id: 2, result: { optimismScore: 95 } }),
        assumption({ id: 3 }),
      ],
      outcomes: [
        outcome({ id: 900, assumptionId: 1, outcomeType: "held" }),
        outcome({ id: 901, assumptionId: 3, outcomeType: "contradicted" }),
      ],
      recommendations: [rec()],
      today: TODAY,
    });
    const s = summariseLedger(rows);
    expect(s.total).toBe(3);
    expect(s.redFlags).toBe(1);
    expect(s.readsLogged).toBe(2);
    expect(s.held).toBe(1);
    expect(s.contradicted).toBe(1);
  });

  it("judges an assumption by its LATEST read, not its first", () => {
    // A claim that held at 30 days and broke at 6 months is contradicted.
    const rows = projectAssumptionLedger({
      assumptions: [assumption()],
      outcomes: [
        outcome({ id: 900, outcomeType: "held", recordedAt: "2026-03-01T00:00:00.000Z" }),
        outcome({ id: 901, outcomeType: "contradicted", recordedAt: "2026-07-01T00:00:00.000Z" }),
      ],
      recommendations: [rec()],
      today: TODAY,
    });
    const s = summariseLedger(rows);
    expect(s.contradicted).toBe(1);
    expect(s.held).toBe(0);
  });

  it("headline says nothing when there is nothing to say", () => {
    expect(ledgerHeadline(summariseLedger([]))).toBeNull();
  });

  it("headline names only the non-zero facts", () => {
    const rows = projectAssumptionLedger({
      assumptions: [assumption({ id: 1, result: { optimismScore: 95 } })],
      outcomes: [],
      recommendations: [rec()],
      today: TODAY,
    });
    const line = ledgerHeadline(summariseLedger(rows))!;
    expect(line).toContain("1 assumption");
    expect(line).toContain("1 unanswered red flag");
    expect(line).not.toContain("contradicted");
  });
});
