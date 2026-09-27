import { describe, expect, it } from "vitest";
import {
  computeMultiples,
  deriveEv,
  fmtMultiple,
  quickIrrMoic,
  sourcesUsesBalance,
} from "./economics";

describe("computeMultiples", () => {
  it("computes EV/EBITDA and EV/Revenue", () => {
    expect(computeMultiples({ ev: 850, ebitda: 100, revenue: 500 })).toEqual({
      evEbitda: 8.5,
      evRevenue: 1.7,
    });
  });
  it("returns null (n.m.) when EBITDA is zero or negative", () => {
    expect(computeMultiples({ ev: 850, ebitda: 0 }).evEbitda).toBeNull();
    expect(computeMultiples({ ev: 850, ebitda: -20 }).evEbitda).toBeNull();
  });
  it("returns null when a denominator or EV is missing", () => {
    expect(computeMultiples({ ev: 850 }).evEbitda).toBeNull();
    expect(computeMultiples({ ebitda: 100 }).evEbitda).toBeNull();
  });
  it("never yields Infinity or NaN", () => {
    const m = computeMultiples({ ev: 100, ebitda: 0, revenue: 0 });
    expect(m.evEbitda).toBeNull();
    expect(m.evRevenue).toBeNull();
  });
});

describe("deriveEv", () => {
  it("EV = equity + net debt", () => {
    expect(deriveEv({ equityValue: 600, netDebt: 250 })).toBe(850);
  });
  it("treats missing net debt as zero", () => {
    expect(deriveEv({ equityValue: 600 })).toBe(600);
  });
  it("returns null when equity is absent (never solves backwards)", () => {
    expect(deriveEv({ netDebt: 250 })).toBeNull();
    expect(deriveEv({})).toBeNull();
  });
});

describe("quickIrrMoic", () => {
  it("computes MOIC and IRR for a plausible deal", () => {
    // EV 850, EBITDA 100 (8.5x entry), 40% equity, 5y hold, exit at 10x.
    // entryEquity = 340, entryDebt = 510, exitEV = 1000, exitEquity = 490.
    // MOIC = 490/340 ≈ 1.44, IRR = 1.44^(1/5)-1 ≈ 0.0755.
    const r = quickIrrMoic({ ev: 850, ebitda: 100, equityPct: 40, holdYears: 5, exitMultiple: 10 });
    expect(r.moic).toBeCloseTo(1.44, 2);
    expect(r.irr).toBeCloseTo(0.0755, 3);
  });
  it("guards years <= 0 and bad equity pct", () => {
    expect(quickIrrMoic({ ev: 850, ebitda: 100, equityPct: 40, holdYears: 0, exitMultiple: 10 })).toEqual({ moic: null, irr: null });
    expect(quickIrrMoic({ ev: 850, ebitda: 100, equityPct: 0, holdYears: 5, exitMultiple: 10 })).toEqual({ moic: null, irr: null });
    expect(quickIrrMoic({ ev: 850, ebitda: 100, equityPct: 120, holdYears: 5, exitMultiple: 10 })).toEqual({ moic: null, irr: null });
  });
  it("returns nulls when inputs are incomplete", () => {
    expect(quickIrrMoic({ ev: 850, ebitda: 100 })).toEqual({ moic: null, irr: null });
  });
  it("reports a wipe-out as non-positive MOIC with null IRR", () => {
    // Exit far below the debt load → equity wiped out.
    const r = quickIrrMoic({ ev: 850, ebitda: 100, equityPct: 20, holdYears: 5, exitMultiple: 3 });
    expect(r.moic).not.toBeNull();
    expect(r.moic! <= 0).toBe(true);
    expect(r.irr).toBeNull();
  });
});

describe("sourcesUsesBalance", () => {
  it("sums and flags balanced", () => {
    const r = sourcesUsesBalance([
      { label: "Equity", side: "source", amount: 340 },
      { label: "Debt", side: "source", amount: 510 },
      { label: "Purchase price", side: "use", amount: 850 },
    ]);
    expect(r.sources).toBe(850);
    expect(r.uses).toBe(850);
    expect(r.balanced).toBe(true);
    expect(r.delta).toBe(0);
  });
  it("flags an imbalance", () => {
    const r = sourcesUsesBalance([
      { label: "Equity", side: "source", amount: 300 },
      { label: "Purchase price", side: "use", amount: 850 },
    ]);
    expect(r.balanced).toBe(false);
    expect(r.delta).toBe(-550);
  });
});

describe("fmtMultiple", () => {
  it("formats numbers and n.m.", () => {
    expect(fmtMultiple(8.5)).toBe("8.5×");
    expect(fmtMultiple(null)).toBe("n.m.");
  });
});
