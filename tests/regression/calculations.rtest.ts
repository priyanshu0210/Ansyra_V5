import { describe, expect, it } from "vitest";
import {
  DATASET_EPOCH,
  MANAGEMENT_ADJ_EBITDA_M,
  MANAGEMENT_MARGIN_PCT,
  NET_DEBT_M,
  QOE_ADJ_EBITDA_M,
  QOE_GAP_M,
  QOE_MARGIN_PCT,
  REPORTED_EBITDA_M,
  ANNUAL_HISTORY,
  BACKLOG,
  COVENANT,
  FY25,
  QUARTERLY_HISTORY,
  Q3_FY25_RESTATEMENT,
  SEED_SYNERGY_CATEGORIES,
  WORKING_CAPITAL,
  dealByKey,
} from "@fixtures/thornevale/index";
import { computeMultiples, deriveEv, fmtMultiple, quickIrrMoic, sourcesUsesBalance } from "@contracts/economics";
import { categoryTotals, variancePct, worstQuarter } from "@contracts/synergy";
import { confidenceBand } from "@contracts/recommendations";
import { parseDealValue } from "@contracts/value";
import { isForwardStageMove } from "@contracts/stages";

// REG-CALC — the deterministic maths behind every number a dealmaker reads.
//
// Pure: no database, no network, no clock. These are the golden values for the
// `thornevale-v1` corpus, and a future run that disagrees with any of them has
// changed the product's arithmetic, not its plumbing.

describe("REG-CALC — deal economics", () => {
  const anvil = dealByKey("anvil").economics!;
  const ev = deriveEv({ equityValue: anvil.equityValue, netDebt: anvil.netDebt })!;

  it("REG-CALC-001: enterprise value is equity plus net debt", () => {
    expect(ev).toBeCloseTo(anvil.equityValue! + NET_DEBT_M, 1);
  });

  it("REG-CALC-002: enterprise value is never solved backwards from a missing equity value", () => {
    expect(deriveEv({ equityValue: null, netDebt: 500 })).toBeNull();
  });

  it("REG-CALC-003: net debt defaults to zero when absent rather than voiding the calculation", () => {
    expect(deriveEv({ equityValue: 100 })).toBe(100);
  });

  it("REG-CALC-004: Project Anvil prices at 8.0x management's adjusted EBITDA", () => {
    expect(computeMultiples({ ev, ebitda: MANAGEMENT_ADJ_EBITDA_M }).evEbitda).toBeCloseTo(8.0, 1);
  });

  it("REG-CALC-005: the same price is 9.6x on the quality-of-earnings EBITDA", () => {
    expect(computeMultiples({ ev, ebitda: QOE_ADJ_EBITDA_M }).evEbitda).toBeCloseTo(9.56, 1);
  });

  it("REG-CALC-006: the gap between the two EBITDAs is $47.2M", () => {
    expect(QOE_GAP_M).toBeCloseTo(47.2, 1);
  });

  it("REG-CALC-007: management margin is 22.0% and the QoE's is 18.4%", () => {
    expect(MANAGEMENT_MARGIN_PCT).toBeCloseTo(22.0, 1);
    expect(QOE_MARGIN_PCT).toBeCloseTo(18.4, 1);
  });

  it("REG-CALC-008: reported EBITDA sits between the two adjusted figures", () => {
    expect(REPORTED_EBITDA_M).toBeGreaterThan(QOE_ADJ_EBITDA_M);
    expect(REPORTED_EBITDA_M).toBeLessThan(MANAGEMENT_ADJ_EBITDA_M);
  });

  it("REG-CALC-009: a zero EBITDA yields n.m. rather than Infinity", () => {
    expect(computeMultiples({ ev: 500, ebitda: 0 }).evEbitda).toBeNull();
  });

  it("REG-CALC-010: a negative EBITDA yields n.m. rather than a negative multiple", () => {
    expect(computeMultiples({ ev: 500, ebitda: -20 }).evEbitda).toBeNull();
  });

  it("REG-CALC-011: a missing EBITDA yields n.m. while revenue still computes", () => {
    const m = computeMultiples({ ev: 500, ebitda: null, revenue: 250 });
    expect(m.evEbitda).toBeNull();
    expect(m.evRevenue).toBe(2);
  });

  it("REG-CALC-012: n.m. renders as text, never as a number", () => {
    expect(fmtMultiple(null)).toBe("n.m.");
    expect(fmtMultiple(8)).toBe("8×");
  });

  it("REG-CALC-013: the closed deal's modelled MOIC is within a third of what was realised", () => {
    const n = dealByKey("nordhaven").economics!;
    const nev = deriveEv({ equityValue: n.equityValue, netDebt: n.netDebt })!;
    const { moic } = quickIrrMoic({
      ev: nev,
      ebitda: n.targetEbitda,
      equityPct: n.peInputs!.equityPct,
      holdYears: n.peInputs!.holdYears,
      exitMultiple: n.peInputs!.exitMultiple,
    });
    expect(Math.abs(moic! - n.realized!.realizedMoic!)).toBeLessThan(0.35);
  });

  it("REG-CALC-014: an equity percentage outside (0,100] produces no return estimate", () => {
    for (const equityPct of [0, -10, 101]) {
      expect(quickIrrMoic({ ev: 100, ebitda: 10, equityPct, holdYears: 5, exitMultiple: 8 }).moic).toBeNull();
    }
  });

  it("REG-CALC-015: a non-positive hold period produces no return estimate", () => {
    expect(quickIrrMoic({ ev: 100, ebitda: 10, equityPct: 50, holdYears: 0, exitMultiple: 8 }).moic).toBeNull();
  });

  it("REG-CALC-016: a wiped-out equity returns a MOIC but no IRR", () => {
    // IRR is undefined for a total loss; reporting one would be a fiction.
    const r = quickIrrMoic({ ev: 1000, ebitda: 50, equityPct: 5, holdYears: 5, exitMultiple: 4 });
    expect(r.moic).not.toBeNull();
    expect(r.irr).toBeNull();
  });

  it("REG-CALC-017: Project Anvil's sources and uses balance exactly", () => {
    expect(sourcesUsesBalance(dealByKey("anvil").economics!.sourcesUses!).balanced).toBe(true);
  });

  it("REG-CALC-018: an unbalanced sources and uses reports its delta rather than rounding it away", () => {
    const r = sourcesUsesBalance([
      { label: "a", side: "source", amount: 100 },
      { label: "b", side: "use", amount: 90 },
    ]);
    expect(r.balanced).toBe(false);
    expect(r.delta).toBe(10);
  });
});

describe("REG-CALC — deal value parsing", () => {
  it("REG-CALC-019: parses a dollar value into amount and currency", () => {
    expect(parseDealValue("$2310M")).toEqual({ amount: 2310, currency: "USD" });
  });

  it("REG-CALC-020: parses a euro value without inventing an FX rate", () => {
    expect(parseDealValue("€312M")).toEqual({ amount: 312, currency: "EUR" });
  });

  it("REG-CALC-021: parses a sterling value", () => {
    expect(parseDealValue("£19M")?.currency).toBe("GBP");
  });

  it("REG-CALC-022: returns null for an unparseable string rather than guessing", () => {
    // The display string stays the fallback; a wrong number is worse than none.
    expect(parseDealValue("TBC")).toBeNull();
  });

  it("REG-CALC-023: every seeded deal value either parses or is deliberately absent", () => {
    for (const d of [dealByKey("anvil"), dealByKey("verity"), dealByKey("suzhou"), dealByKey("loom")]) {
      if (d.value === null) continue;
      expect(parseDealValue(d.value)).not.toBeNull();
    }
  });
});

describe("REG-CALC — the financial model agrees with itself", () => {
  it("REG-CALC-024: the corpus covers twenty-five fiscal years", () => {
    expect(ANNUAL_HISTORY.length).toBe(25);
    expect(ANNUAL_HISTORY[0].fy).toBe(2001);
    expect(ANNUAL_HISTORY[24].fy).toBe(2025);
  });

  it("REG-CALC-025: group revenue is the sum of its business units in every year", () => {
    for (const y of ANNUAL_HISTORY) {
      const sum = Math.round(y.units.reduce((n, u) => n + u.revenueM, 0) * 10) / 10;
      expect(Math.abs(sum - y.revenueM)).toBeLessThan(0.15);
    }
  });

  it("REG-CALC-026: group EBITDA is the sum of its business units in every year", () => {
    for (const y of ANNUAL_HISTORY) {
      const sum = Math.round(y.units.reduce((n, u) => n + u.ebitdaM, 0) * 10) / 10;
      expect(Math.abs(sum - y.ebitdaM)).toBeLessThan(0.15);
    }
  });

  it("REG-CALC-027: margin is EBITDA over revenue in every year", () => {
    for (const y of ANNUAL_HISTORY) {
      expect(Math.abs((y.ebitdaM / y.revenueM) * 100 - y.marginPct)).toBeLessThan(0.15);
    }
  });

  it("REG-CALC-028: the closing year's net debt matches the debt schedule", () => {
    expect(FY25.netDebtM).toBe(NET_DEBT_M);
  });

  it("REG-CALC-029: the two recessions are visible as revenue declines", () => {
    const rev = (fy: number) => ANNUAL_HISTORY.find((y) => y.fy === fy)!.revenueM;
    expect(rev(2009)).toBeLessThan(rev(2008));
    expect(rev(2020)).toBeLessThan(rev(2019));
  });

  it("REG-CALC-030: margin compresses harder than revenue in a downturn", () => {
    // Operating leverage running backwards. A corpus where margin and revenue
    // move together would make every mix question trivial.
    const m = (fy: number) => ANNUAL_HISTORY.find((y) => y.fy === fy)!.marginPct;
    expect(m(2008) - m(2009)).toBeGreaterThan(4);
  });

  it("REG-CALC-031: the declining unit's margin actually declines across the period", () => {
    const at = (fy: number) => ANNUAL_HISTORY.find((y) => y.fy === fy)!.units.find((u) => u.unitKey === "motion")!;
    expect(at(2015).marginPct).toBeGreaterThan(at(2025).marginPct);
  });

  it("REG-CALC-032: the highest-margin unit outearns the lowest by more than 20 points", () => {
    const units = FY25.units;
    const best = Math.max(...units.map((u) => u.marginPct));
    const worst = Math.min(...units.map((u) => u.marginPct));
    expect(best - worst).toBeGreaterThan(20);
  });
});

describe("REG-CALC — covenant, working capital and backlog", () => {
  it("REG-CALC-033: covenant headroom is positive today and negative after the step-down", () => {
    expect(COVENANT.headroom).toBeGreaterThan(0);
    expect(COVENANT.headroomAfterStepDown).toBeLessThan(0);
  });

  it("REG-CALC-034: the covenant ratio is net debt over the credit-agreement EBITDA", () => {
    expect(COVENANT.netDebtM / COVENANT.covenantEbitdaM).toBeCloseTo(COVENANT.currentRatio, 2);
  });

  it("REG-CALC-035: leverage on reported EBITDA is HIGHER than the covenant ratio", () => {
    // Three correct and different numbers. Any covenant discussion that does not
    // say which definition it is using is unreliable, and the corpus is built to
    // make that visible rather than to hide it.
    expect(NET_DEBT_M / REPORTED_EBITDA_M).toBeGreaterThan(COVENANT.currentRatio);
  });

  it("REG-CALC-036: leverage on the QoE's EBITDA is higher still", () => {
    expect(NET_DEBT_M / QOE_ADJ_EBITDA_M).toBeGreaterThan(NET_DEBT_M / REPORTED_EBITDA_M);
  });

  it("REG-CALC-037: underlying DSO is worse than reported DSO", () => {
    expect(WORKING_CAPITAL.dsoCurrentDays).toBeGreaterThan(WORKING_CAPITAL.dsoReportedCurrentDays);
  });

  it("REG-CALC-038: inventory turns have deteriorated across the period", () => {
    expect(WORKING_CAPITAL.inventoryTurnsCurrent).toBeLessThan(WORKING_CAPITAL.inventoryTurnsStart);
  });

  it("REG-CALC-039: backlog is down year over year despite the 'record' claim", () => {
    expect(BACKLOG.changePct).toBeLessThan(0);
    expect(BACKLOG.currentM).toBeLessThan(BACKLOG.peakM);
  });

  it("REG-CALC-040: the restated quarter is lower than originally reported", () => {
    expect(Q3_FY25_RESTATEMENT.restatedM).toBeLessThan(Q3_FY25_RESTATEMENT.originallyReportedM);
    expect(Q3_FY25_RESTATEMENT.deltaM).toBeCloseTo(-13.7, 1);
  });

  it("REG-CALC-041: the quarterly series carries the RESTATED figure, not the original", () => {
    const q3 = QUARTERLY_HISTORY.find((q) => q.label === "FY2025-Q3")!;
    expect(q3.revenueM).toBe(Q3_FY25_RESTATEMENT.restatedM);
  });

  it("REG-CALC-042: every quarter's EBITDA is its revenue times its margin", () => {
    for (const q of QUARTERLY_HISTORY) {
      expect(Math.abs((q.revenueM * q.marginPct) / 100 - q.ebitdaM)).toBeLessThan(0.15);
    }
  });
});

describe("REG-CALC — synergy phasing", () => {
  it("REG-CALC-043: category totals are the sum of their periods", () => {
    for (const c of SEED_SYNERGY_CATEGORIES) {
      const t = categoryTotals(c);
      expect(t.planned).toBeCloseTo(c.planned, 1);
      expect(t.actual).toBeCloseTo(c.actual, 1);
    }
  });

  it("REG-CALC-044: the programme is materially behind plan overall", () => {
    const planned = SEED_SYNERGY_CATEGORIES.reduce((n, c) => n + categoryTotals(c).planned, 0);
    const actual = SEED_SYNERGY_CATEGORIES.reduce((n, c) => n + categoryTotals(c).actual, 0);
    expect(variancePct(planned, actual)!).toBeLessThan(-25);
  });

  it("REG-CALC-045: the revenue-linked workstream is the worst performer", () => {
    const scored = SEED_SYNERGY_CATEGORIES.map((c) => {
      const t = categoryTotals(c);
      return { category: c.category, v: variancePct(t.planned, t.actual)! };
    }).sort((a, b) => a.v - b.v);
    expect(scored[0].category).toMatch(/revenue/i);
  });

  it("REG-CALC-046: the workstream with a named owner over-delivered", () => {
    const facility = SEED_SYNERGY_CATEGORIES.find((c) => /facility/i.test(c.category))!;
    const t = categoryTotals(facility);
    expect(variancePct(t.planned, t.actual)!).toBeGreaterThanOrEqual(0);
  });

  it("REG-CALC-047: variance is null when there is no baseline to vary from", () => {
    expect(variancePct(0, 5)).toBeNull();
  });

  it("REG-CALC-048: every phased category names a worst quarter", () => {
    for (const c of SEED_SYNERGY_CATEGORIES) {
      expect(worstQuarter(c.periods!)).not.toBeNull();
    }
  });
});

describe("REG-CALC — bands and stage ordering", () => {
  it("REG-CALC-049: confidence bands split at 40 and 70", () => {
    expect(confidenceBand(39)).toBe("low");
    expect(confidenceBand(40)).toBe("medium");
    expect(confidenceBand(69)).toBe("medium");
    expect(confidenceBand(70)).toBe("high");
  });

  it("REG-CALC-050: an out-of-range confidence still bands rather than returning undefined", () => {
    expect(confidenceBand(-10)).toBe("low");
    expect(confidenceBand(150)).toBe("high");
    expect(confidenceBand(Number.NaN)).toBe("low");
  });

  it("REG-CALC-051: stage ordering recognises a forward move", () => {
    expect(isForwardStageMove("evaluation", "diligence")).toBe(true);
  });

  it("REG-CALC-052: stage ordering does not treat a backward move as forward", () => {
    expect(isForwardStageMove("diligence", "evaluation")).toBe(false);
  });

  it("REG-CALC-053: a same-stage move is not a forward move", () => {
    expect(isForwardStageMove("diligence", "diligence")).toBe(false);
  });

  it("REG-CALC-054: the dataset epoch is fixed, so relative dates are reproducible", () => {
    expect(DATASET_EPOCH.toISOString()).toBe("2026-08-20T00:00:00.000Z");
  });
});
