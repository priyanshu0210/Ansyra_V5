import { describe, expect, it } from "vitest";
import {
  categoryTotals,
  hasDuplicateQuarters,
  isValidQuarter,
  periodVariances,
  phasingSummaryLine,
  quarterKey,
  sortPeriods,
  variancePct,
  worstQuarter,
} from "./synergy";

describe("quarter helpers", () => {
  it("validates the quarter format", () => {
    expect(isValidQuarter("2026-Q3")).toBe(true);
    expect(isValidQuarter("2026-Q5")).toBe(false);
    expect(isValidQuarter("26-Q1")).toBe(false);
    expect(isValidQuarter("2026Q1")).toBe(false);
  });
  it("sorts chronologically across year boundaries", () => {
    const sorted = sortPeriods([
      { quarter: "2027-Q1", planned: 1, actual: 1 },
      { quarter: "2026-Q4", planned: 1, actual: 1 },
      { quarter: "2026-Q1", planned: 1, actual: 1 },
    ]).map((p) => p.quarter);
    expect(sorted).toEqual(["2026-Q1", "2026-Q4", "2027-Q1"]);
    expect(quarterKey("2026-Q3")).toBeLessThan(quarterKey("2027-Q1"));
  });
  it("detects duplicate quarters", () => {
    expect(hasDuplicateQuarters([
      { quarter: "2026-Q1", planned: 1, actual: 1 },
      { quarter: "2026-Q1", planned: 2, actual: 2 },
    ])).toBe(true);
    expect(hasDuplicateQuarters([
      { quarter: "2026-Q1", planned: 1, actual: 1 },
      { quarter: "2026-Q2", planned: 1, actual: 1 },
    ])).toBe(false);
  });
});

describe("categoryTotals", () => {
  it("derives totals from periods when present (periods are authoritative)", () => {
    const t = categoryTotals({
      category: "Cost",
      planned: 999, // stale flat value must be ignored
      actual: 999,
      periods: [
        { quarter: "2026-Q1", planned: 5, actual: 4 },
        { quarter: "2026-Q2", planned: 5, actual: 6 },
      ],
    });
    expect(t).toEqual({ planned: 10, actual: 10 });
  });
  it("keeps pre-15.6 behaviour for unphased categories", () => {
    expect(categoryTotals({ category: "Revenue", planned: 12, actual: 9 })).toEqual({
      planned: 12,
      actual: 9,
    });
  });
  it("treats an empty periods array as unphased", () => {
    expect(categoryTotals({ category: "IT", planned: 3, actual: 1, periods: [] })).toEqual({
      planned: 3,
      actual: 1,
    });
  });
});

describe("variancePct", () => {
  it("computes signed variance", () => {
    expect(variancePct(10, 12)).toBe(20);
    expect(variancePct(10, 8)).toBe(-20);
  });
  it("returns null with no baseline", () => {
    expect(variancePct(0, 5)).toBeNull();
  });
});

describe("periodVariances", () => {
  it("reports per-quarter and cumulative variance", () => {
    const rows = periodVariances([
      { quarter: "2026-Q1", planned: 10, actual: 10 },
      { quarter: "2026-Q2", planned: 10, actual: 5 },
      { quarter: "2026-Q3", planned: 10, actual: 15 },
    ]);
    expect(rows[0].variancePct).toBe(0);
    expect(rows[1].variancePct).toBe(-50);
    expect(rows[2].variancePct).toBe(50);
    // Cumulative ends level: 30 planned vs 30 actual.
    expect(rows[2].cumulativePlanned).toBe(30);
    expect(rows[2].cumulativeActual).toBe(30);
    expect(rows[2].cumulativeVariancePct).toBe(0);
  });
});

describe("worstQuarter", () => {
  it("finds the weakest quarter even when cumulative is on plan", () => {
    const w = worstQuarter([
      { quarter: "2026-Q1", planned: 10, actual: 10 },
      { quarter: "2026-Q2", planned: 10, actual: 5 },
      { quarter: "2026-Q3", planned: 10, actual: 15 },
    ]);
    expect(w?.quarter).toBe("2026-Q2");
    expect(w?.variancePct).toBe(-50);
  });
  it("returns null when nothing has a baseline", () => {
    expect(worstQuarter([])).toBeNull();
    expect(worstQuarter([{ quarter: "2026-Q1", planned: 0, actual: 0 }])).toBeNull();
  });
});

describe("phasingSummaryLine", () => {
  it("marks unphased categories", () => {
    expect(phasingSummaryLine({ category: "Revenue", planned: 10, actual: 8 })).toBe(
      "Revenue: planned 10M, actual 8M (-20%) [unphased]",
    );
  });
  it("includes the quarter detail and weakest quarter when phased", () => {
    const line = phasingSummaryLine({
      category: "Cost",
      planned: 0,
      actual: 0,
      periods: [
        { quarter: "2026-Q1", planned: 10, actual: 10 },
        { quarter: "2026-Q2", planned: 10, actual: 5 },
      ],
    });
    expect(line).toContain("planned 20M, actual 15M");
    expect(line).toContain("2026-Q2 5/10M (-50%)");
    expect(line).toContain("weakest quarter: 2026-Q2");
  });
});
