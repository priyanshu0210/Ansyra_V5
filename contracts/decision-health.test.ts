import { describe, expect, it } from "vitest";
import type { FailurePattern } from "./failure-patterns";
import {
  GATE_CHIP_LABELS,
  MAX_MATCHED_PATTERNS,
  blockingReasonOf,
  buildDecisionHealth,
  countUnansweredFatal,
  coverageLabel,
  gateStatusOf,
  matchedPatterns,
  type DecisionHealthInput,
  type HealthOutcome,
  type HealthRecommendation,
} from "./decision-health";
import { SCHEDULED_HORIZONS, horizonStates } from "./outcome-schedule";

// The fold is the whole engine, and it takes plain data — so this is where it is
// proven. api/queries/decision-health.ts only fetches rows; its own risks
// (scope, delegation, read-only) are guarded at the source level in
// api/decision-health.wiring.test.ts.

const NOW = new Date("2026-08-06T12:00:00Z");
const TODAY = "2026-08-06";
/** Decided four months back: 30-day and 90-day due, 6-month still upcoming. */
const DECIDED = "2026-04-01T12:00:00.000Z";

const rec = (over: Partial<HealthRecommendation> = {}): HealthRecommendation => ({
  id: 1,
  stage: "diligence",
  status: "accepted",
  confidence: 85,
  expiresAt: null,
  decidedAt: DECIDED,
  supportingEvidence: [{ kind: "regulatory" }],
  counterarguments: [],
  ...over,
});

const outcome = (
  recommendationId: number,
  horizon: string | null,
  over: Partial<HealthOutcome> = {},
): HealthOutcome => ({ id: 1, recommendationId, horizon, outcomeType: "held", ...over });

const build = (over: Partial<DecisionHealthInput> = {}) =>
  buildDecisionHealth({
    dealId: 7,
    stage: "diligence",
    recommendations: [rec()],
    outcomes: [],
    patterns: [],
    closeDate: null,
    now: NOW,
    today: TODAY,
    ...over,
  });

const pattern = (over: Partial<FailurePattern> = {}): FailurePattern => ({
  patternId: "regulatory:diligence:high:6_month",
  kind: "regulatory",
  stage: "diligence",
  band: "high",
  horizon: "6_month",
  direction: "accepted",
  highSignalCount: 3,
  supportingCount: 4,
  rate: 0.75,
  severity: "acute",
  lowSample: true,
  exampleRecommendationIds: [11, 12],
  description: "Accepted regulatory recommendations at diligence with high confidence were contradicted in 3 of 4 six-month reads.",
  ...over,
});

describe("gateStatusOf / blockingReasonOf", () => {
  it("projects every GateState shape", () => {
    expect(gateStatusOf({ kind: "ungated" })).toBe("ungated");
    expect(gateStatusOf({ kind: "clear", live: 1, soonestExpiry: null, expiringSoon: false })).toBe("clear");
    for (const reason of ["none", "drafts_pending", "expired"] as const) {
      expect(gateStatusOf({ kind: "locked", reason, drafts: 0, expired: 0 })).toBe("blocked");
    }
  });

  it("reports a reason only when locked", () => {
    expect(blockingReasonOf({ kind: "ungated" })).toBeNull();
    expect(blockingReasonOf({ kind: "clear", live: 1, soonestExpiry: null, expiringSoon: false })).toBeNull();
    expect(blockingReasonOf({ kind: "locked", reason: "expired", drafts: 0, expired: 1 })).toBe("expired");
  });

  it("labels the chip for every status, and never as a sentence", () => {
    for (const s of ["ungated", "clear", "blocked"] as const) {
      expect(GATE_CHIP_LABELS[s].length).toBeGreaterThan(0);
      // The sentence belongs to Recommendations.tsx. A chip is a chip.
      expect(GATE_CHIP_LABELS[s]).not.toMatch(/requires|Record one|advancing/);
    }
  });
});

describe("the gate is consumed, never re-derived", () => {
  it("stores the GateState verbatim and projects from it", () => {
    const h = build({ recommendations: [rec({ status: "draft" })] });
    expect(h.gate.kind).toBe("locked");
    expect(h.gateStatus).toBe(gateStatusOf(h.gate));
    expect(h.blockingReason).toBe(blockingReasonOf(h.gate));
  });

  it("is clear when a live accepted recommendation stands at this stage", () => {
    expect(build().gateStatus).toBe("clear");
  });

  it("reports drafts_pending when only drafts stand at this stage", () => {
    const h = build({ recommendations: [rec({ status: "draft" }), rec({ id: 2, status: "draft" })] });
    expect(h.blockingReason).toBe("drafts_pending");
    expect(h.draftsPending).toBe(2);
  });

  it("reports expired when the only acceptance has aged out", () => {
    const h = build({ recommendations: [rec({ expiresAt: "2026-07-01T00:00:00Z" })] });
    expect(h.blockingReason).toBe("expired");
    expect(h.expiredAccepted).toBe(1);
    expect(h.liveAccepted).toBe(0);
  });

  it("is ungated at a stage the gate does not apply to", () => {
    expect(build({ stage: "sourcing", recommendations: [rec({ stage: "sourcing" })] }).gateStatus).toBe(
      "ungated",
    );
  });
});

describe("draftsPending is a census, not a claim", () => {
  // Drafts never block; the ABSENCE of an accepted recommendation does. So the
  // count must be meaningful even when the gate is clear.
  it("counts drafts at this stage even while the gate is clear", () => {
    const h = build({ recommendations: [rec(), rec({ id: 2, status: "draft" })] });
    expect(h.gateStatus).toBe("clear");
    expect(h.draftsPending).toBe(1);
  });

  it("ignores drafts recorded at another stage", () => {
    const h = build({ recommendations: [rec(), rec({ id: 2, status: "draft", stage: "closing" })] });
    expect(h.draftsPending).toBe(0);
  });
});

describe("accepted counts partition by expiry", () => {
  it("counts accepted regardless of expiry, and splits live from expired", () => {
    const h = build({
      recommendations: [
        rec(),
        rec({ id: 2, expiresAt: "2026-07-01T00:00:00Z" }),
        rec({ id: 3, status: "rejected" }),
      ],
    });
    expect(h.totalRecommendations).toBe(3);
    expect(h.acceptedRecommendations).toBe(2);
    expect(h.liveAccepted).toBe(1);
    expect(h.expiredAccepted).toBe(1);
  });
});

describe("countUnansweredFatal", () => {
  const fatal = (response?: string) => ({ point: "No QoE has been run.", weight: "fatal" as const, response });

  it("counts an unanswered fatal on a draft — the actionable case", () => {
    expect(countUnansweredFatal([rec({ status: "draft", counterarguments: [fatal()] })])).toEqual({
      onDrafts: 1,
      onAccepted: 0,
    });
  });

  it("does not count minor or material objections", () => {
    const rows = [
      rec({ status: "draft", counterarguments: [{ point: "x", weight: "minor" }] }),
      rec({ id: 2, status: "draft", counterarguments: [{ point: "y", weight: "material" }] }),
    ];
    expect(countUnansweredFatal(rows)).toEqual({ onDrafts: 0, onAccepted: 0 });
  });

  it("treats a whitespace-only response as unanswered", () => {
    // The shared predicate already does this; the point is that it is READ.
    expect(countUnansweredFatal([rec({ status: "draft", counterarguments: [fatal("   ")] })]).onDrafts).toBe(1);
  });

  it("clears once the objection is answered", () => {
    expect(
      countUnansweredFatal([rec({ status: "draft", counterarguments: [fatal("QoE engaged.")] })]).onDrafts,
    ).toBe(0);
  });

  it("counts nothing on rejected or superseded rows — nobody stands behind them", () => {
    const rows = [
      rec({ status: "rejected", counterarguments: [fatal()] }),
      rec({ id: 2, status: "superseded", counterarguments: [fatal()] }),
    ];
    expect(countUnansweredFatal(rows)).toEqual({ onDrafts: 0, onAccepted: 0 });
  });

  it("is zero on accepted rows in every realistic case", () => {
    // canAccept blocks acceptance while an unanswered fatal exists, update
    // rejects any non-draft edit, and supersede re-checks. onAccepted > 0 is a
    // data-integrity signal, not a normal state.
    const h = build({ recommendations: [rec({ counterarguments: [fatal("Answered.")] })] });
    expect(h.unansweredFatal.onAccepted).toBe(0);
  });

  it("still reports an accepted row that somehow carries one", () => {
    // Deliberate integrity fixture: a row that predates the rule or was imported.
    expect(countUnansweredFatal([rec({ counterarguments: [fatal()] })])).toEqual({
      onDrafts: 0,
      onAccepted: 1,
    });
  });
});

describe("coverageByHorizon", () => {
  const coverageOf = (rows: HealthRecommendation[], outcomes: HealthOutcome[], closeDate?: string | null) =>
    Object.fromEntries(
      build({ recommendations: rows, outcomes, closeDate }).coverage.map((c) => [c.horizon, c]),
    );

  it("always returns four entries, in SCHEDULED_HORIZONS order", () => {
    expect(build().coverage.map((c) => c.horizon)).toEqual([...SCHEDULED_HORIZONS]);
  });

  it("counts logged against a scheduled denominator", () => {
    const rows = [1, 2, 3, 4, 5].map((id) => rec({ id }));
    const outcomes = [1, 2, 3].map((id) => outcome(id, "30_day"));
    const c = coverageOf(rows, outcomes)["30_day"];
    expect(c).toMatchObject({ logged: 3, due: 2, scheduled: 5 });
    expect(coverageLabel(c)).toBe("30-day: 3 of 5 logged");
  });

  it("keeps a moot closure out of `logged`", () => {
    // horizonStates keeps this distinct so the UI never says "read recorded"
    // about silence. Folding it into logged would undo that.
    const c = coverageOf([rec()], [outcome(1, null, { outcomeType: "moot" })])["30_day"];
    expect(c.logged).toBe(0);
    expect(c.closedAsMoot).toBe(1);
    expect(coverageLabel(c)).toBe("30-day: 0 of 1 logged (1 closed as moot)");
  });

  it("excludes unanchored post-close from the denominator entirely", () => {
    const c = coverageOf([rec(), rec({ id: 2 })], [])["post_close"];
    expect(c).toMatchObject({ scheduled: 0, unanchored: 2 });
    // Never "0 of 0 logged" — that reads as a failure to act on something that
    // was never scheduled.
    expect(coverageLabel(c)).toBe("post-close: not scheduled — this deal has no closing milestone");
  });

  it("reports a partial anchor honestly", () => {
    const c = coverageOf([rec()], [outcome(1, "post_close")], null)["post_close"];
    // A filed post-close read beats unanchored — the work was done.
    expect(c).toMatchObject({ logged: 1, scheduled: 1, unanchored: 0 });
    expect(coverageLabel(c)).toBe("post-close: 1 of 1 logged");
  });

  it("schedules post-close once a close date exists", () => {
    const c = coverageOf([rec()], [], "2026-05-01")["post_close"];
    expect(c).toMatchObject({ due: 1, scheduled: 1, unanchored: 0 });
  });

  it("returns a null label when nothing owes the horizon at all", () => {
    // A draft owes nothing, so every horizon is empty and the card renders none.
    const c = coverageOf([rec({ status: "draft" })], [])["30_day"];
    expect(c).toMatchObject({ scheduled: 0, unanchored: 0 });
    expect(coverageLabel(c)).toBeNull();
  });

  it("credits nothing to a read naming no horizon", () => {
    expect(coverageOf([rec()], [outcome(1, null)])["30_day"].logged).toBe(0);
  });
});

describe("matchedPatterns", () => {
  it("matches a recommendation that has no outcomes at all", () => {
    // matchesPattern deliberately ignores horizon: a live recommendation has not
    // been read yet, which is exactly why the match is worth surfacing.
    const h = build({ patterns: [pattern()] });
    expect(h.patternsMatched.map((p) => p.patternId)).toEqual(["regulatory:diligence:high:6_month"]);
  });

  it("does not match on a different stage, band or evidence kind", () => {
    expect(build({ patterns: [pattern({ stage: "closing" })] }).patternsMatched).toEqual([]);
    expect(build({ patterns: [pattern({ band: "low" })] }).patternsMatched).toEqual([]);
    expect(build({ patterns: [pattern({ kind: "cultural" })] }).patternsMatched).toEqual([]);
  });

  it("never leaks example recommendation ids", () => {
    // This payload rides the `recommendations` gate; patterns.list exposes those
    // ids to `analytics` holders on purpose. A back door here would be silent.
    const [m] = build({ patterns: [pattern()] }).patternsMatched;
    expect(Object.keys(m).sort()).toEqual(["description", "lowSample", "patternId", "severity"]);
    expect(JSON.stringify(m)).not.toContain("exampleRecommendationIds");
  });

  it("dedupes by patternId and preserves input order", () => {
    const out = matchedPatterns(
      [rec()],
      [pattern({ patternId: "b" }), pattern({ patternId: "a" }), pattern({ patternId: "b" })],
    );
    expect(out.map((p) => p.patternId)).toEqual(["b", "a"]);
  });

  it("caps the list — a card carries a line, not a report", () => {
    const many = Array.from({ length: 9 }, (_, i) => pattern({ patternId: `p${i}` }));
    expect(matchedPatterns([rec()], many)).toHaveLength(MAX_MATCHED_PATTERNS);
    expect(matchedPatterns([rec()], many, undefined, 2)).toHaveLength(2);
  });

  it("is empty when the firm has no patterns", () => {
    expect(build({ patterns: [] }).patternsMatched).toEqual([]);
  });
});

describe("the clock is injected", () => {
  // Decided 2026-04-01 → 30-day due 2026-05-01, 90-day due 2026-06-30,
  // 6-month due 2026-10-01, post-close unanchored.
  it("flips due to upcoming and nothing else", () => {
    const early = build({ today: "2026-05-15" }); // 30-day due, 90-day not yet
    const late = build({ today: TODAY }); // both due
    expect(early.readsOwed).toBe(1);
    expect(late.readsOwed).toBe(2);
    expect(early.acceptedRecommendations).toBe(late.acceptedRecommendations);
    expect(early.gateStatus).toBe(late.gateStatus);
  });

  it("reads owed and mostOverdueDays come from the shared summary", () => {
    // The 30-day read, due 2026-05-01, read on 2026-08-06.
    expect(build().mostOverdueDays).toBe(97);
  });
});

describe("the whole fold", () => {
  it("reports a healthy deal and a troubled one differently", () => {
    const healthy = build({
      recommendations: [rec()],
      outcomes: [outcome(1, "30_day"), outcome(1, "90_day", { id: 2 })],
      closeDate: "2026-12-01",
    });
    expect(healthy).toMatchObject({
      gateStatus: "clear",
      readsOwed: 0,
      patternsMatched: [],
    });
    expect(healthy.unansweredFatal).toEqual({ onDrafts: 0, onAccepted: 0 });

    const troubled = build({
      recommendations: [
        rec({ status: "draft", counterarguments: [{ point: "No QoE.", weight: "fatal" }] }),
      ],
      patterns: [pattern()],
    });
    expect(troubled).toMatchObject({ gateStatus: "blocked", blockingReason: "drafts_pending", draftsPending: 1 });
    expect(troubled.unansweredFatal.onDrafts).toBe(1);
    expect(troubled.patternsMatched).toHaveLength(1);
  });

  it("carries the deal and stage through untouched", () => {
    const h = build({ dealId: 42, stage: "negotiation", recommendations: [rec({ stage: "negotiation" })] });
    expect(h).toMatchObject({ dealId: 42, stage: "negotiation", nextStage: "closing" });
  });

  it("has no next stage at the end of the lifecycle", () => {
    expect(build({ stage: "integration", recommendations: [rec({ stage: "integration" })] }).nextStage).toBeNull();
  });

  it("buckets outcomes to the right recommendation", () => {
    const h = build({
      recommendations: [rec({ id: 1 }), rec({ id: 2 })],
      outcomes: [outcome(1, "30_day")],
    });
    const c = h.coverage.find((x) => x.horizon === "30_day")!;
    expect(c).toMatchObject({ logged: 1, due: 1 });
  });

  it("agrees with horizonStates called directly", () => {
    const r = rec();
    const direct = horizonStates(r, [], null, TODAY).filter((s) => s.state === "due").length;
    expect(build({ recommendations: [r] }).readsOwed).toBe(direct);
  });
});
