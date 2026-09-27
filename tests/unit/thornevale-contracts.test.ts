import { describe, expect, it } from "vitest";
import {
  ANVIL_BLOCKING_ASSUMPTION_KEYS,
  ANVIL_CURRENT_SCENARIO_KEY,
  ANVIL_SUPERSEDED_SCENARIO_KEY,
  DATASET_EPOCH,
  EXPIRED_RECOMMENDATION_KEY,
  HIGH_SCORE_ANSWERED_KEYS,
  MANAGEMENT_ADJ_EBITDA_M,
  NET_DEBT_M,
  QOE_ADJ_EBITDA_M,
  SEED_ASSUMPTIONS,
  SEED_DEALS,
  SEED_RECOMMENDATIONS,
  SEED_SCENARIOS,
  SEED_SYNERGY_CATEGORIES,
  SYNERGY_REALISATION_PCT,
  UNSCORED_ASSUMPTION_KEYS,
  dealByKey,
} from "@fixtures/thornevale/index";
import { blockingAssumptions, blocksAdvancement } from "@contracts/assumption-gate";
import { computeMultiples, deriveEv, quickIrrMoic } from "@contracts/economics";
import { isLiveRecommendation, satisfyingRecommendations } from "@contracts/recommendation-gate";
import { confidenceBand } from "@contracts/recommendations";
import { categoryTotals, periodVariances, variancePct, worstQuarter } from "@contracts/synergy";

// The real business logic, run over the real corpus.
//
// The existing contract tests are excellent but they run on two-line fixtures
// built inside the test. These run the same functions over a dataset with 25
// years of history, contradictory documents and deliberate edge cases — which
// is where the interactions between rules show up rather than the rules
// individually.

const NOW = DATASET_EPOCH;

describe("deal economics over the corpus", () => {
  it("prices Project Anvil at 8.0x the EBITDA management is marketing", () => {
    const anvil = dealByKey("anvil").economics!;
    const ev = deriveEv({ equityValue: anvil.equityValue, netDebt: anvil.netDebt })!;
    const { evEbitda } = computeMultiples({ ev, ebitda: MANAGEMENT_ADJ_EBITDA_M });
    expect(evEbitda).toBeCloseTo(8.0, 1);
  });

  it("prices the SAME deal at 9.6x on the earnings the QoE supports", () => {
    // This single number is the entire deal. The multiple did not move; the
    // denominator did, and that is what a diligence process is for.
    const anvil = dealByKey("anvil").economics!;
    const ev = deriveEv({ equityValue: anvil.equityValue, netDebt: anvil.netDebt })!;
    const { evEbitda } = computeMultiples({ ev, ebitda: QOE_ADJ_EBITDA_M });
    expect(evEbitda).toBeGreaterThan(9.5);
    expect(evEbitda).toBeLessThan(9.7);
  });

  it("derives enterprise value as equity plus net debt, never backwards", () => {
    const anvil = dealByKey("anvil").economics!;
    expect(deriveEv({ equityValue: anvil.equityValue, netDebt: anvil.netDebt })).toBeCloseTo(
      anvil.equityValue! + NET_DEBT_M,
      1,
    );
  });

  it("returns n.m. rather than Infinity for the deal with no EBITDA", () => {
    const { evEbitda, evRevenue } = computeMultiples({ ev: 500, ebitda: null, revenue: 200 });
    expect(evEbitda).toBeNull();
    expect(evRevenue).toBe(2.5);
  });

  it("computes a realised-outcome deal's return", () => {
    const nordhaven = dealByKey("nordhaven").economics!;
    const ev = deriveEv({ equityValue: nordhaven.equityValue, netDebt: nordhaven.netDebt })!;
    const { moic, irr } = quickIrrMoic({
      ev,
      ebitda: nordhaven.targetEbitda,
      equityPct: nordhaven.peInputs!.equityPct,
      holdYears: nordhaven.peInputs!.holdYears,
      exitMultiple: nordhaven.peInputs!.exitMultiple,
    });
    expect(moic).toBeGreaterThan(1.5);
    expect(irr).toBeGreaterThan(0.1);
    // The underwritten case and the realised outcome should be in the same
    // neighbourhood — a corpus where they are not would make the forecast-vs-
    // actual benchmark meaningless.
    expect(Math.abs(moic! - nordhaven.realized!.realizedMoic!)).toBeLessThan(0.35);
  });

  it("every deal with economics produces a finite multiple or an honest null", () => {
    for (const d of SEED_DEALS) {
      if (!d.economics) continue;
      const ev = deriveEv({ equityValue: d.economics.equityValue, netDebt: d.economics.netDebt });
      const { evEbitda, evRevenue } = computeMultiples({
        ev,
        ebitda: d.economics.targetEbitda,
        revenue: d.economics.targetRevenue,
      });
      for (const v of [evEbitda, evRevenue]) {
        if (v !== null) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe("the assumption gate over the corpus", () => {
  const anvil = SEED_ASSUMPTIONS.filter((a) => a.dealKey === "anvil");

  it("blocks Anvil on exactly the assumptions the fixture names", () => {
    const blocking = blockingAssumptions(anvil).map((a) => a.key).sort();
    expect(blocking).toEqual([...ANVIL_BLOCKING_ASSUMPTION_KEYS].sort());
  });

  it("does not block on a high score that a reviewer has answered", () => {
    // The property that makes the gate usable rather than a permanent lock: it
    // keys off whether the challenge was ANSWERED, not off how bad the score is.
    for (const key of HIGH_SCORE_ANSWERED_KEYS) {
      const a = SEED_ASSUMPTIONS.find((x) => x.key === key)!;
      expect(a.result!.optimismScore).toBeGreaterThan(80);
      expect(blocksAdvancement(a)).toBe(false);
    }
  });

  it("does not block on an assumption the AI never scored", () => {
    for (const key of UNSCORED_ASSUMPTION_KEYS) {
      const a = SEED_ASSUMPTIONS.find((x) => x.key === key)!;
      expect(a.result).toBeNull();
      expect(blocksAdvancement(a)).toBe(false);
    }
  });

  it("leaves every other deal in the corpus unblocked", () => {
    for (const d of SEED_DEALS) {
      if (d.key === "anvil") continue;
      const rows = SEED_ASSUMPTIONS.filter((a) => a.dealKey === d.key);
      expect(blockingAssumptions(rows)).toEqual([]);
    }
  });
});

describe("the recommendation gate over the corpus", () => {
  const rows = (dealKey: string) =>
    SEED_RECOMMENDATIONS.filter((r) => r.dealKey === dealKey).map((r) => ({
      stage: r.stage,
      status: r.status,
      expiresAt: r.expiresInDays === null ? null : new Date(NOW.getTime() + r.expiresInDays * 86_400_000),
      key: r.key,
    }));

  it("finds the accepted conclusion that justified Anvil entering diligence", () => {
    expect(satisfyingRecommendations(rows("anvil"), "evaluation", NOW).length).toBeGreaterThan(0);
  });

  it("finds NO live conclusion at Anvil's current stage, so it cannot advance", () => {
    // The post-QoE retrade is still a draft and the financing conclusion has
    // expired. Both are deliberate: this is a deal that should be stuck.
    expect(satisfyingRecommendations(rows("anvil"), "diligence", NOW)).toEqual([]);
  });

  it("treats an expired but accepted recommendation as not live", () => {
    const expired = SEED_RECOMMENDATIONS.find((r) => r.key === EXPIRED_RECOMMENDATION_KEY)!;
    expect(expired.status).toBe("accepted");
    expect(
      isLiveRecommendation(
        { stage: expired.stage, status: expired.status, expiresAt: new Date(NOW.getTime() + expired.expiresInDays! * 86_400_000) },
        NOW,
      ),
    ).toBe(false);
  });

  it("ignores a draft no matter how confident it is", () => {
    const draft = SEED_RECOMMENDATIONS.find((r) => r.key === "anvil_retrade")!;
    expect(draft.confidence).toBeGreaterThan(70);
    expect(isLiveRecommendation({ stage: draft.stage, status: draft.status, expiresAt: null }, NOW)).toBe(false);
  });

  it("ignores a superseded conclusion in favour of the one that replaced it", () => {
    const old = SEED_RECOMMENDATIONS.find((r) => r.key === "anvil_braeburn_keep")!;
    const replacement = SEED_RECOMMENDATIONS.find((r) => r.supersedesKey === "anvil_braeburn_keep")!;
    expect(isLiveRecommendation({ stage: old.stage, status: old.status, expiresAt: null }, NOW)).toBe(false);
    expect(isLiveRecommendation({ stage: replacement.stage, status: replacement.status, expiresAt: null }, NOW)).toBe(true);
  });
});

describe("confidence bands over the corpus", () => {
  it("bands every recommendation without returning undefined", () => {
    for (const r of SEED_RECOMMENDATIONS) {
      expect(["low", "medium", "high"]).toContain(confidenceBand(r.confidence));
    }
  });

  it("puts the rejected recommendation in the low band", () => {
    const rejected = SEED_RECOMMENDATIONS.find((r) => r.status === "rejected")!;
    expect(confidenceBand(rejected.confidence)).toBe("low");
  });
});

describe("scenario snapshots over the corpus", () => {
  it("keeps probabilities summing to exactly 100 in every run", () => {
    for (const s of SEED_SCENARIOS) {
      expect(s.result.cases.reduce((n, c) => n + c.probabilityPct, 0)).toBe(100);
    }
  });

  it("shifts probability mass to the downside once the QoE lands", () => {
    // The two Anvil runs are the same deal before and after one piece of
    // diligence. If regenerating a scenario did not change the shape, the
    // feature would not be doing anything.
    const before = SEED_SCENARIOS.find((s) => s.key === ANVIL_SUPERSEDED_SCENARIO_KEY)!;
    const after = SEED_SCENARIOS.find((s) => s.key === ANVIL_CURRENT_SCENARIO_KEY)!;
    const down = (s: typeof before) => s.result.cases.find((c) => c.name === "downside")!.probabilityPct;
    expect(down(after)).toBeGreaterThan(down(before));
  });

  it("reads more assumptions in the later run", () => {
    const before = SEED_SCENARIOS.find((s) => s.key === ANVIL_SUPERSEDED_SCENARIO_KEY)!;
    const after = SEED_SCENARIOS.find((s) => s.key === ANVIL_CURRENT_SCENARIO_KEY)!;
    expect(after.assumptionCount).toBeGreaterThan(before.assumptionCount);
  });
});

describe("synergy phasing over the corpus", () => {
  it("derives category totals from the periods, which are authoritative", () => {
    // The rule the schema states and the fixture had to be rebuilt to respect:
    // when periods exist the totals ARE their sums. An earlier version of this
    // corpus carried both and they disagreed by 0.2 once per-quarter rounding
    // accumulated.
    for (const c of SEED_SYNERGY_CATEGORIES) {
      const t = categoryTotals(c);
      expect(t.planned).toBeCloseTo(c.planned, 1);
      expect(t.actual).toBeCloseTo(c.actual, 1);
    }
  });

  it("reports the group tracking materially behind plan", () => {
    const planned = SEED_SYNERGY_CATEGORIES.reduce((n, c) => n + categoryTotals(c).planned, 0);
    const actual = SEED_SYNERGY_CATEGORIES.reduce((n, c) => n + categoryTotals(c).actual, 0);
    const variance = variancePct(planned, actual)!;
    expect(variance).toBeLessThan(-25);
    // The fixture's own headline realisation figure and the contract's variance
    // must describe the same reality from opposite directions.
    expect(SYNERGY_REALISATION_PCT).toBeCloseTo(100 + variance, 0);
  });

  it("shows cost workstreams delivering and revenue workstreams failing", () => {
    // The finding the whole Synergy Reality Engine exists to surface, and the
    // one this corpus is built to make unavoidable: every workstream with a
    // named owner and a dated plan delivered; neither revenue-linked one did.
    const revenue = SEED_SYNERGY_CATEGORIES.find((c) => /revenue/i.test(c.category))!;
    const facility = SEED_SYNERGY_CATEGORIES.find((c) => /facility/i.test(c.category))!;
    const rt = categoryTotals(revenue);
    const ft = categoryTotals(facility);
    expect(variancePct(rt.planned, rt.actual)!).toBeLessThan(-70);
    expect(variancePct(ft.planned, ft.actual)!).toBeGreaterThanOrEqual(0);
  });

  it("accumulates period variance rather than only reporting the total", () => {
    // The property that makes this an early-warning system rather than a
    // scoreboard: a category can look survivable in aggregate while a specific
    // quarter is clearly gone.
    const revenue = SEED_SYNERGY_CATEGORIES.find((c) => /revenue/i.test(c.category))!;
    const rows = periodVariances(revenue.periods!);
    expect(rows.length).toBe(revenue.periods!.length);
    expect(rows[rows.length - 1].cumulativePlanned).toBeCloseTo(categoryTotals(revenue).planned, 1);
    expect(rows[rows.length - 1].cumulativeActual).toBeCloseTo(categoryTotals(revenue).actual, 1);
  });

  it("identifies a worst quarter for every phased category", () => {
    for (const c of SEED_SYNERGY_CATEGORIES) {
      const worst = worstQuarter(c.periods!);
      expect(worst).not.toBeNull();
      expect(worst!.quarter).toMatch(/^\d{4}-Q[1-4]$/);
    }
  });
});
