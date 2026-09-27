// ─────────────────────────────────────────────────────────────────────────────
// Thornevale Industrial Group — 25 years of financial history, plus the recent
// quarterly detail a diligence team would actually be given.
//
// The annual series is DERIVED, not typed out: each unit is back-solved from its
// FY2025 revenue along its own growth trend, then the cycle events (2009, 2020)
// and a per-unit deterministic jitter are applied. That matters because a
// hand-typed 25-year table drifts out of agreement with itself the first time
// someone edits one cell, and this corpus's whole value is that it is
// internally consistent: group revenue really is the sum of its units, margin
// really is EBITDA over revenue, and the covenant ratio really is net debt over
// the EBITDA the credit agreement defines.
//
// The balance sheet is modelled the way a real LBO model does it — a target
// leverage path drives net debt, and shareholder distributions are the plug —
// rather than the other way round. Letting free cash flow drive net debt made
// the group debt-free by FY2003 and left the covenant story with nothing to
// stand on; a sponsor-owned industrial does not deleverage to zero, it
// recapitalises.
//
// Amounts are $M throughout, matching the app's convention (deals.value_amount
// and every deal_economics column are millions).
//
// Pure. Deterministic. No I/O.
// ─────────────────────────────────────────────────────────────────────────────
import { BUSINESS_UNITS, CORPORATE_EVENTS, FY_FIRST, FY_LAST, type BusinessUnit } from "./company";
import { round, streamFor } from "./ids";

/** Group-level revenue shocks, as multipliers on the trend. Applied to every
 *  unit, because a cycle does not politely skip a division. */
const CYCLE: Record<number, number> = {
  2002: 0.972,
  2008: 0.981,
  2009: 0.78, // −22% peak-to-trough, the figure the restructuring narrative cites
  2010: 0.94,
  2016: 0.976,
  2020: 0.854, // −14.6%
  2021: 0.951,
};

/** Margin pressure/expansion by year, in percentage POINTS off the unit anchor.
 *  Recessions compress margin harder than they compress revenue — operating
 *  leverage running backwards. */
const MARGIN_SHIFT: Record<number, number> = {
  2009: -5.4,
  2010: -2.9,
  2015: -0.8,
  2020: -3.1,
  2021: -1.2,
  2023: -0.9,
  2024: -1.4,
  2025: -1.1,
};

/**
 * Net-leverage anchors. Interpolated linearly between the years named here.
 * The shape is the group's actual financing history: modest after the 2001
 * MBO, stepped up by each acquisition, worked back down in between, spiked by
 * the FY2020 EBITDA collapse, and drifting up again since FY2022 as earnings
 * softened while distributions continued.
 */
const LEVERAGE_ANCHORS: Record<number, number> = {
  2001: 0.9,
  2004: 1.5,
  2007: 2.4, // Kestrel
  2012: 1.6,
  2013: 2.9, // Marrow & Pike
  2019: 2.1,
  2020: 3.3, // denominator collapse, not new borrowing
  2021: 3.4, // Vantage
  2023: 3.5,
  2025: 3.94, // the covenant ratio the current credit agreement is tested at
};

function targetLeverage(fyYear: number): number {
  const years = Object.keys(LEVERAGE_ANCHORS).map(Number).sort((a, b) => a - b);
  if (fyYear <= years[0]) return LEVERAGE_ANCHORS[years[0]];
  if (fyYear >= years[years.length - 1]) return LEVERAGE_ANCHORS[years[years.length - 1]];
  for (let i = 0; i < years.length - 1; i++) {
    const lo = years[i];
    const hi = years[i + 1];
    if (fyYear >= lo && fyYear <= hi) {
      const t = (fyYear - lo) / (hi - lo);
      return LEVERAGE_ANCHORS[lo] + t * (LEVERAGE_ANCHORS[hi] - LEVERAGE_ANCHORS[lo]);
    }
  }
  return LEVERAGE_ANCHORS[years[years.length - 1]];
}

// ─── Capital structure ───────────────────────────────────────────────────────

export interface DebtInstrument {
  name: string;
  kind: "term_loan" | "revolver" | "notes" | "other";
  facilityM: number;
  drawnM: number;
  rate: string;
  maturity: string;
  secured: boolean;
  note: string;
}

export const DEBT_STRUCTURE: DebtInstrument[] = [
  {
    name: "Senior Secured Term Loan B",
    kind: "term_loan",
    facilityM: 760,
    drawnM: 760,
    rate: "SOFR + 375bps",
    maturity: "2028-09-30",
    secured: true,
    note: "1% annual amortisation. 50% excess-cash-flow sweep stepping to 25% below 3.5× net leverage. Unhedged beyond a $400M swap maturing 2027.",
  },
  {
    name: "Senior Secured Revolving Facility",
    kind: "revolver",
    facilityM: 200,
    drawnM: 130,
    rate: "SOFR + 325bps",
    maturity: "2028-03-31",
    secured: true,
    note: "Springing net-leverage covenant tested when utilisation exceeds 35%. Utilisation has been above that threshold for six consecutive quarters, so the covenant is live rather than springing.",
  },
  {
    name: "6.25% Senior Notes due 2029",
    kind: "notes",
    facilityM: 250,
    drawnM: 250,
    rate: "6.25% fixed",
    maturity: "2029-06-15",
    secured: false,
    note: "Change-of-control put at 101. The restricted-payments basket was largely consumed by the 2021 Vantage acquisition.",
  },
];

export const TOTAL_DEBT_M = round(DEBT_STRUCTURE.reduce((n, d) => n + d.drawnM, 0), 1);
export const CASH_M = 32.1;
export const NET_DEBT_M = round(TOTAL_DEBT_M - CASH_M, 1);

/**
 * The EBITDA the credit agreement is tested on. Deliberately its own number:
 * a credit-agreement definition is neither reported EBITDA nor the QoE's view,
 * and conflating the three is exactly the mistake this corpus should be able to
 * catch someone making.
 */
export const COVENANT_EBITDA_M = round(NET_DEBT_M / 3.94, 1);

/** The covenant, and how little room is left under it. */
export const COVENANT = {
  test: "Total Net Leverage Ratio",
  definitionNote:
    "Tested on Consolidated Adjusted EBITDA as defined in the credit agreement, which permits a narrower set of add-backs than management's presentation and a wider set than the QoE accepts.",
  covenantEbitdaM: COVENANT_EBITDA_M,
  netDebtM: NET_DEBT_M,
  currentLimit: 4.25,
  steppedLimit: 3.75,
  stepDownDate: "2026-12-31",
  currentRatio: 3.94,
  headroom: round(4.25 - 3.94, 2),
  headroomAfterStepDown: round(3.75 - 3.94, 2),
  note:
    "At the FY2026 step-down the group is 0.19× through the covenant on current LTM EBITDA. Compliance depends on either the Braeburn disposal proceeds or an amendment. Management's model assumes the former; no signed process exists.",
};

export interface UnitYear {
  fy: number;
  unitKey: string;
  unitName: string;
  revenueM: number;
  ebitdaM: number;
  marginPct: number;
}

export interface GroupYear {
  fy: number;
  revenueM: number;
  ebitdaM: number;
  marginPct: number;
  capexM: number;
  cashInterestM: number;
  cashTaxM: number;
  /** Movement in net working capital. Positive = cash absorbed. */
  workingCapitalMoveM: number;
  /** EBITDA − capex − cash interest − cash tax − working-capital movement. */
  freeCashFlowM: number;
  netDebtM: number;
  netLeverage: number;
  /** The plug: distributions to (or contributions from, when negative)
   *  shareholders that reconcile free cash flow to the leverage path. */
  shareholderFlowM: number;
  headcount: number;
  units: UnitYear[];
}

/** Whether a unit is inside the perimeter in a given fiscal year. */
function inPerimeter(u: BusinessUnit, fyYear: number): boolean {
  if (fyYear < u.originYear) return false;
  if (u.divestedYear !== null && fyYear >= u.divestedYear) return false;
  return true;
}

function unitRevenue(u: BusinessUnit, fyYear: number, jitter: () => number): number {
  if (!inPerimeter(u, fyYear)) return 0;
  // Connect never had meaningful revenue, so it is a ramp table rather than a
  // growth model it does not fit. $9.4M at peak against a $120M target.
  if (u.key === "connect") {
    const ramp: Record<number, number> = { 2019: 0.4, 2020: 1.9, 2021: 4.6, 2022: 9.4 };
    return round(ramp[fyYear] ?? 0, 1);
  }
  const yearsBack = 2025 - fyYear;
  let rev = u.fy25RevenueM / Math.pow(1 + u.growthTrend, yearsBack);
  const cycleMult = CYCLE[fyYear];
  if (cycleMult !== undefined) rev *= cycleMult;
  // ±3% of deterministic texture, so no series is suspiciously smooth.
  rev *= 0.97 + jitter() * 0.06;
  return round(rev, 1);
}

function unitMarginPct(u: BusinessUnit, fyYear: number, jitter: () => number): number {
  if (u.key === "connect") return u.marginAnchorPct;
  let m = u.marginAnchorPct + (MARGIN_SHIFT[fyYear] ?? 0);
  // Braeburn's decline is in margin as well as revenue: 14.2% a decade ago
  // against 8.9% now. CAPPED — extrapolating the same slope back 24 years put
  // the unit at 21.6% in FY2001, which would have made it the group's best
  // business at founding and contradicts every document about it.
  if (u.key === "motion") m += Math.min((2025 - fyYear) * 0.53, 6.4);
  // Vantage never reached its underwriting margin; the impairment year is worse.
  if (u.key === "sealing" && fyYear === 2024) m -= 2.6;
  // Marrow & Pike's FY2023 outlier — high but defensible, and flagged as an
  // outlier downstream. A corpus with no outliers cannot test outlier handling.
  if (u.key === "coatings" && fyYear === 2023) m += 9.8;
  m += (jitter() - 0.5) * 1.4;
  return round(m, 1);
}

function buildYear(fyYear: number, prevNetDebt: number, jitter: () => number): GroupYear {
  const units: UnitYear[] = [];
  for (const u of BUSINESS_UNITS) {
    if (!inPerimeter(u, fyYear)) continue;
    const revenueM = unitRevenue(u, fyYear, jitter);
    const marginPct = unitMarginPct(u, fyYear, jitter);
    units.push({
      fy: fyYear,
      unitKey: u.key,
      unitName: u.name,
      revenueM,
      ebitdaM: round((revenueM * marginPct) / 100, 1),
      marginPct,
    });
  }
  const revenueM = round(units.reduce((n, x) => n + x.revenueM, 0), 1);
  const ebitdaM = round(units.reduce((n, x) => n + x.ebitdaM, 0), 1);
  const marginPct = revenueM > 0 ? round((ebitdaM / revenueM) * 100, 1) : 0;

  const capexM = round(revenueM * (0.031 + jitter() * 0.011), 1);
  const cashInterestM = round(prevNetDebt * 0.062, 1);
  const cashTaxM = round(Math.max(0, ebitdaM - capexM - cashInterestM) * 0.24, 1);
  const workingCapitalMoveM = round((jitter() - 0.42) * revenueM * 0.028, 1);
  const freeCashFlowM = round(
    ebitdaM - capexM - cashInterestM - cashTaxM - workingCapitalMoveM,
    1,
  );

  // Net debt follows the leverage path, not free cash flow. Acquisitions and
  // divestitures move it too, which is why the anchors step at 2007/2013/2021.
  // FY2025 is the exception: it is pinned to the actual balance sheet, because
  // the current capital structure is a fact about the deal rather than an
  // output of the model, and a corpus whose closing net debt disagrees with its
  // own debt schedule would fail the first diligence question asked of it.
  const netDebtM = fyYear === FY_LAST ? NET_DEBT_M : round(targetLeverage(fyYear) * ebitdaM, 1);
  const eventCash = CORPORATE_EVENTS.filter((e) => e.year === fyYear).reduce(
    (n, e) => n + (e.cashImpactM ?? 0),
    0,
  );
  // Whatever free cash flow did not go into (or come out of) net debt went to
  // shareholders. Positive = distributed out.
  const shareholderFlowM = round(freeCashFlowM + eventCash + (netDebtM - prevNetDebt), 1);

  return {
    fy: fyYear,
    revenueM,
    ebitdaM,
    marginPct,
    capexM,
    cashInterestM,
    cashTaxM,
    workingCapitalMoveM,
    freeCashFlowM,
    netDebtM,
    netLeverage: ebitdaM > 0 ? round(netDebtM / ebitdaM, 2) : 0,
    shareholderFlowM,
    headcount: Math.round(revenueM * 3.42),
    units,
  };
}

/** FY2001 → FY2025. The single source every downstream artifact reads. */
export const ANNUAL_HISTORY: GroupYear[] = (() => {
  const jitter = streamFor("thornevale-annual");
  const out: GroupYear[] = [];
  let netDebt = 88.0;
  for (let y = FY_FIRST; y <= FY_LAST; y++) {
    const row = buildYear(y, netDebt, jitter);
    netDebt = row.netDebtM;
    out.push(row);
  }
  return out;
})();

export function fy(year: number): GroupYear {
  const row = ANNUAL_HISTORY.find((y) => y.fy === year);
  if (!row) throw new Error(`thornevale fixture: no FY${year} in ANNUAL_HISTORY`);
  return row;
}

export const FY25 = fy(2025);
export const FY24 = fy(2024);

// ─── Quarterly detail ────────────────────────────────────────────────────────
// FY2024 Q1 through FY2026 Q2 — ten quarters, which is what a mid-market
// process actually hands over. The recent quarters are where the deterioration
// lives, so this is the series the analysis surfaces should be reacting to.

export interface Quarter {
  label: string; // "FY2025-Q3"
  fyYear: number;
  q: 1 | 2 | 3 | 4;
  revenueM: number;
  ebitdaM: number;
  marginPct: number;
  backlogM: number;
  dsoDays: number;
  inventoryTurns: number;
  /** Free-text colour, the kind a management pack carries. */
  note: string;
}

const QUARTER_SHAPE: {
  label: string;
  fyYear: number;
  q: 1 | 2 | 3 | 4;
  rev: number;
  margin: number;
  backlog: number;
  dso: number;
  turns: number;
  note: string;
}[] = [
  { label: "FY2024-Q1", fyYear: 2024, q: 1, rev: 302.1, margin: 21.4, backlog: 441, dso: 61, turns: 5.4, note: "Flow aftermarket strong; the Braeburn price-down clause takes effect." },
  { label: "FY2024-Q2", fyYear: 2024, q: 2, rev: 318.7, margin: 21.9, backlog: 458, dso: 63, turns: 5.2, note: "Kestrel books two Gulf Coast packages." },
  { label: "FY2024-Q3", fyYear: 2024, q: 3, rev: 311.4, margin: 20.6, backlog: 463, dso: 66, turns: 5.0, note: "Vantage impairment recognised. Factoring programme initiated in-quarter." },
  { label: "FY2024-Q4", fyYear: 2024, q: 4, rev: 336.9, margin: 22.1, backlog: 452, dso: 58, turns: 4.9, note: "Reported DSO improves 8 days on factoring; underlying DSO 67." },
  { label: "FY2025-Q1", fyYear: 2025, q: 1, rev: 307.8, margin: 20.1, backlog: 447, dso: 60, turns: 4.7, note: "Ferralux index pass-through lags; Thermal margin −180bps." },
  { label: "FY2025-Q2", fyYear: 2025, q: 2, rev: 314.2, margin: 20.8, backlog: 438, dso: 62, turns: 4.6, note: "Marrow & Pike wins the Calderwood re-specification." },
  { label: "FY2025-Q3", fyYear: 2025, q: 3, rev: 298.7, margin: 18.9, backlog: 421, dso: 65, turns: 4.4, note: "RESTATED. Originally reported as $312.4M; $13.7M of Kestrel milestone revenue reversed into FY2026-Q1 on percentage-of-completion review." },
  { label: "FY2025-Q4", fyYear: 2025, q: 4, rev: 335.4, margin: 21.2, backlog: 412, dso: 63, turns: 4.3, note: "Torvald volumes down 8% — the first quarter of absolute Torvald decline in six years." },
  { label: "FY2026-Q1", fyYear: 2026, q: 1, rev: 309.6, margin: 19.4, backlog: 404, dso: 68, turns: 4.2, note: "Includes $13.7M restated out of FY2025-Q3. Underlying revenue $295.9M." },
  { label: "FY2026-Q2", fyYear: 2026, q: 2, rev: 301.2, margin: 18.7, backlog: 396, dso: 71, turns: 4.1, note: "Second consecutive quarter of backlog decline. DSO at a ten-year high." },
];

export const QUARTERLY_HISTORY: Quarter[] = QUARTER_SHAPE.map((r) => ({
  label: r.label,
  fyYear: r.fyYear,
  q: r.q,
  revenueM: r.rev,
  ebitdaM: round((r.rev * r.margin) / 100, 1),
  marginPct: r.margin,
  backlogM: r.backlog,
  dsoDays: r.dso,
  inventoryTurns: r.turns,
  note: r.note,
}));

/** The restatement, isolated. Two documents in the corpus disagree about this
 *  quarter on purpose; this is the record of which one is right. */
export const Q3_FY25_RESTATEMENT = {
  quarter: "FY2025-Q3",
  originallyReportedM: 312.4,
  restatedM: 298.7,
  deltaM: -13.7,
  reason:
    "Percentage-of-completion review on two Kestrel milestone-billed packages. Revenue was recognised at a milestone that had not been customer-accepted; reversed and recognised in FY2026-Q1.",
  identifiedBy: "The incoming CFO during the FY2025 year-end close, March 2025.",
};

/**
 * Backlog, the claim management leans on hardest. Derived from the quarterly
 * series on a same-quarter, prior-year basis — the only comparison that is not
 * distorted by the group's seasonality, and the one management's "record
 * backlog" line quietly avoids.
 */
const backlogCurrent = QUARTERLY_HISTORY[QUARTERLY_HISTORY.length - 1];
const backlogPriorYear = QUARTERLY_HISTORY[QUARTERLY_HISTORY.length - 5];

export const BACKLOG = {
  quarter: backlogCurrent.label,
  currentM: backlogCurrent.backlogM,
  priorYearQuarter: backlogPriorYear.label,
  priorYearM: backlogPriorYear.backlogM,
  changePct: round(((backlogCurrent.backlogM - backlogPriorYear.backlogM) / backlogPriorYear.backlogM) * 100, 1),
  peakM: Math.max(...QUARTERLY_HISTORY.map((q) => q.backlogM)),
  managementClaim: "Record backlog entering FY2026.",
  note:
    "The \"record\" figure appears to include a $94M Kestrel framework option that has never been exercised. Excluding it, backlog is at a four-year low and has fallen in five of the last six quarters.",
};

// ─── Working capital ─────────────────────────────────────────────────────────

export const WORKING_CAPITAL = {
  dsoStartDays: 52,
  dsoCurrentDays: 71,
  dsoReportedCurrentDays: 63,
  factoringProgrammeM: 60,
  factoringStarted: "FY2024-Q3",
  inventoryTurnsStart: 5.8,
  inventoryTurnsCurrent: 4.1,
  dpoDays: 47,
  note:
    "The nine-day DSO improvement management cites is the factoring programme. Excluding it, DSO has risen from 64 to 71 days over the same period. Inventory turns have fallen every year since FY2021, which management attributes to deliberate safety stock against the Sanjiu sole-source exposure — a defensible explanation that has never been quantified.",
};

// ─── Quality of earnings ─────────────────────────────────────────────────────
// Three different EBITDAs, which is the honest state of most processes:
// what management reports, what management asks you to underwrite, and what
// survives a QoE. The bridge is DERIVED off FY25 so it cannot drift.

export type QoeSide = "add_back" | "qoe_charge";

export interface QoeLine {
  label: string;
  amountM: number;
  side: QoeSide;
  /** Whether the QoE provider accepted the add-back. Meaningless for charges. */
  accepted: boolean;
  note: string;
}

export const REPORTED_EBITDA_M = FY25.ebitdaM;

export const QOE_BRIDGE: QoeLine[] = [
  { label: "Sponsor management fees", amountM: 3.2, side: "add_back", accepted: true, note: "Genuinely ceases at close." },
  { label: "Insurance recovery (one-off)", amountM: -1.8, side: "add_back", accepted: true, note: "Correctly removed from run-rate." },
  { label: "Connect wind-down costs", amountM: 8.9, side: "add_back", accepted: false, note: "Added back as non-recurring for the fourth consecutive year." },
  { label: "Braeburn 2022 restructuring tail", amountM: 4.1, side: "add_back", accepted: false, note: "Recurring in substance; the programme has run since 2015." },
  { label: "Vantage integration costs", amountM: 3.5, side: "add_back", accepted: false, note: "Year four of a three-year integration." },
  { label: "Unexecuted pro-forma cost actions", amountM: 0.5, side: "add_back", accepted: false, note: "No supporting plan provided." },
  { label: "Inventory reserve shortfall", amountM: 11.4, side: "qoe_charge", accepted: false, note: "Excess-and-obsolete reserve not kept current with the fall in turns." },
  { label: "Warranty accrual understatement", amountM: 6.8, side: "qoe_charge", accepted: false, note: "Claims experience at Braeburn exceeds the accrual rate." },
  { label: "Q3 FY2025 restatement run-rate effect", amountM: 7.2, side: "qoe_charge", accepted: false, note: "Recognition timing corrected; the run-rate impact persists." },
  { label: "Unrecorded lease and facility costs", amountM: 4.8, side: "qoe_charge", accepted: false, note: "Monterrey and Wrocław leases not fully reflected in the management accounts." },
];

const addBacks = QOE_BRIDGE.filter((l) => l.side === "add_back");
const qoeCharges = QOE_BRIDGE.filter((l) => l.side === "qoe_charge");

/** What management asks you to underwrite: every add-back, no charges. */
export const MANAGEMENT_ADJ_EBITDA_M = round(
  REPORTED_EBITDA_M + addBacks.reduce((n, l) => n + l.amountM, 0),
  1,
);

/** What survives the QoE: accepted add-backs only, less the identified charges. */
export const QOE_ADJ_EBITDA_M = round(
  REPORTED_EBITDA_M +
    addBacks.filter((l) => l.accepted).reduce((n, l) => n + l.amountM, 0) -
    qoeCharges.reduce((n, l) => n + l.amountM, 0),
  1,
);

export const REPORTED_MARGIN_PCT = round((REPORTED_EBITDA_M / FY25.revenueM) * 100, 1);
export const MANAGEMENT_MARGIN_PCT = round((MANAGEMENT_ADJ_EBITDA_M / FY25.revenueM) * 100, 1);
export const QOE_MARGIN_PCT = round((QOE_ADJ_EBITDA_M / FY25.revenueM) * 100, 1);

/** The gap that drives most of the red-flag content downstream. */
export const QOE_GAP_M = round(MANAGEMENT_ADJ_EBITDA_M - QOE_ADJ_EBITDA_M, 1);
