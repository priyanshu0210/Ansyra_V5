// ─────────────────────────────────────────────────────────────────────────────
// The eight deals the Thornevale corpus is organised around, plus the ~30
// screening targets that give the pipeline, comps and analytics surfaces enough
// population to say anything.
//
// The deals are not eight variations on one theme. Each exists because some
// surface of the app needs a shape that the others do not provide: a completed
// deal with a realised outcome (or the comps engine has nothing to compare
// against), a killed deal (or failure patterns has no negative signal), an
// integration-stage deal with quarterly synergy phasing, a deal at every stage
// so the stage-gate can be exercised in both directions, and one deliberately
// data-poor deal so the empty and partial states get tested too.
//
// Economics are in $M and are all run through the app's own contracts/economics
// functions at seed time rather than being hand-computed here — the derived
// columns are the server's job, and a fixture that pre-computes them would be
// asserting its own arithmetic instead of the product's.
// ─────────────────────────────────────────────────────────────────────────────
import {
  COMPANY_NAME,
  BUSINESS_UNITS,
} from "./company";
import {
  FY25,
  MANAGEMENT_ADJ_EBITDA_M,
  NET_DEBT_M,
  QOE_ADJ_EBITDA_M,
} from "./financials";
import { epochPlusDaysIso, round } from "./ids";

export type DealStageKey =
  | "sourcing"
  | "evaluation"
  | "diligence"
  | "negotiation"
  | "closing"
  | "integration";
export type DealStatusKey = "active" | "on_hold" | "completed" | "cancelled";

export interface SeedMilestone {
  kind:
    | "loi_signed"
    | "exclusivity_expiry"
    | "filing_submitted"
    | "regulatory_deadline"
    | "financing_commitment"
    | "signing"
    | "closing"
    | "custom";
  customLabel?: string;
  /** Days relative to DATASET_EPOCH. Negative is in the past. */
  dueInDays: number;
  note?: string;
  completed: boolean;
}

export type SourcesUsesSide = "source" | "use";

export interface SeedEconomics {
  currency: string;
  equityValue: number | null;
  netDebt: number | null;
  enterpriseValue: number | null;
  targetEbitda: number | null;
  targetRevenue: number | null;
  peInputs: { equityPct?: number; holdYears?: number; exitMultiple?: number } | null;
  sourcesUses: { label: string; side: SourcesUsesSide; amount: number }[] | null;
  realized: { exitDate?: string; exitEv?: number; realizedIrr?: number; realizedMoic?: number } | null;
}

export interface SeedDeal {
  /** Stable handle used by every other fixture module and by the tests. The
   *  database assigns the real serial id; this is how we find it again. */
  key: string;
  name: string;
  targetCompany: string;
  stage: DealStageKey;
  status: DealStatusKey;
  /** Display string. The server derives value_amount/value_currency from it via
   *  contracts/value.ts, so seeding must go through the same parse, not around it. */
  value: string | null;
  industry: string | null;
  /** What this deal exists to exercise. Read by the dataset documentation. */
  purpose: string;
  economics: SeedEconomics | null;
  milestones: SeedMilestone[];
}

const braeburn = BUSINESS_UNITS.find((u) => u.key === "motion")!;

/** Project Anvil's headline economics. EV at 8.0× the EBITDA management asks
 *  you to underwrite — which is the number the seller is marketing, and the
 *  reason the QoE gap matters so much: at the QoE's EBITDA the same price is
 *  9.6×, and that difference is the deal. */
const ANVIL_EV = round(MANAGEMENT_ADJ_EBITDA_M * 8.0, 1);
const ANVIL_EQUITY = round(ANVIL_EV - NET_DEBT_M, 1);

export const ANVIL_EV_ON_QOE_MULTIPLE = round(ANVIL_EV / QOE_ADJ_EBITDA_M, 2);

/**
 * Project Anvil's sources and uses, with the sponsor cheque DERIVED as the plug
 * rather than typed in.
 *
 * An earlier version set the sponsor equity to 45% of EV and the two sides came
 * out 5% apart — which is not a rounding artefact, it is a sources-and-uses that
 * does not balance, and no diligence team would accept one. The equity cheque is
 * whatever is left after the committed debt and available cash, so that is how
 * it is computed here. `contracts/economics.ts::sourcesUsesBalance` agrees, and
 * a test asserts as much.
 */
const ANVIL_USES: { label: string; side: SourcesUsesSide; amount: number }[] = [
  { label: "Purchase of equity", side: "use", amount: ANVIL_EQUITY },
  { label: "Refinance existing debt", side: "use", amount: 1140 },
  { label: "Transaction fees & expenses", side: "use", amount: 61.5 },
  { label: "Financing fees (OID)", side: "use", amount: 20.1 },
];

const ANVIL_NON_EQUITY_SOURCES: { label: string; side: SourcesUsesSide; amount: number }[] = [
  { label: "New Term Loan B", side: "source", amount: 980 },
  { label: "Senior notes (rolled)", side: "source", amount: 250 },
  { label: "Cash on balance sheet", side: "source", amount: 32.1 },
];

const ANVIL_SPONSOR_EQUITY = round(
  ANVIL_USES.reduce((n, r) => n + r.amount, 0) -
    ANVIL_NON_EQUITY_SOURCES.reduce((n, r) => n + r.amount, 0),
  1,
);

export const ANVIL_SOURCES_USES: { label: string; side: SourcesUsesSide; amount: number }[] = [
  { label: "Sponsor equity", side: "source", amount: ANVIL_SPONSOR_EQUITY },
  ...ANVIL_NON_EQUITY_SOURCES,
  ...ANVIL_USES,
];

export const SEED_DEALS: SeedDeal[] = [
  {
    key: "anvil",
    name: "Project Anvil",
    targetCompany: COMPANY_NAME,
    stage: "diligence",
    status: "active",
    value: `$${Math.round(ANVIL_EV)}M`,
    industry: "Industrials & Manufacturing",
    purpose:
      "The centrepiece. Carries the full document set, the full assumption ledger, scenario snapshots, recommendations with outcomes, DD items and the decision log. Every dense-data surface is tested against this deal.",
    economics: {
      currency: "USD",
      equityValue: ANVIL_EQUITY,
      netDebt: NET_DEBT_M,
      enterpriseValue: null, // server derives EV from equity + net debt
      targetEbitda: MANAGEMENT_ADJ_EBITDA_M,
      targetRevenue: FY25.revenueM,
      peInputs: { equityPct: 45, holdYears: 5, exitMultiple: 9.0 },
      sourcesUses: ANVIL_SOURCES_USES,
      realized: null,
    },
    milestones: [
      { kind: "loi_signed", dueInDays: -84, note: "Non-binding LOI countersigned at $2,310M EV.", completed: true },
      { kind: "exclusivity_expiry", dueInDays: 12, note: "45-day exclusivity. One 15-day extension available at the seller's discretion.", completed: false },
      { kind: "custom", customLabel: "Quality-of-earnings final report", dueInDays: -9, note: "Received. Adjusted EBITDA supported at $241.6M against management's $288.8M.", completed: true },
      { kind: "custom", customLabel: "Site visits — Suzhou & Monterrey", dueInDays: 21, completed: false },
      { kind: "financing_commitment", dueInDays: 26, note: "Committed papers from the lead arranger. Currently indicative only.", completed: false },
      { kind: "signing", dueInDays: 47, completed: false },
      { kind: "closing", dueInDays: 118, note: "Assumes HSR clearance without a second request.", completed: false },
    ],
  },
  {
    key: "anvil_carve",
    name: "Project Anvil-Carve",
    targetCompany: braeburn.name,
    stage: "evaluation",
    status: "active",
    value: "$168M",
    industry: "Industrials & Manufacturing",
    purpose:
      "The Braeburn carve-out, run as a parallel track. Exists to test carve-out economics against contradictory cost allocations, and to give the corpus a second deal on the same underlying company — which is what makes cross-deal Deal Genome search non-trivial.",
    economics: {
      currency: "USD",
      equityValue: 168,
      netDebt: 0,
      enterpriseValue: null,
      targetEbitda: round((braeburn.fy25RevenueM * braeburn.marginAnchorPct) / 100, 1),
      targetRevenue: braeburn.fy25RevenueM,
      peInputs: { equityPct: 60, holdYears: 5, exitMultiple: 7.5 },
      sourcesUses: [
        { label: "Sponsor equity", side: "source", amount: 100.8 },
        { label: "Unitranche facility", side: "source", amount: 67.2 },
        { label: "Purchase of assets", side: "use", amount: 156 },
        { label: "Standalone-cost investment", side: "use", amount: 12 },
      ],
      realized: null,
    },
    milestones: [
      { kind: "custom", customLabel: "Carve-out P&L received", dueInDays: -31, note: "Stranded-cost estimate disputed: management says $6M, the diligence team models $14M.", completed: true },
      { kind: "custom", customLabel: "TSA scope agreed", dueInDays: 34, completed: false },
      { kind: "loi_signed", dueInDays: 41, completed: false },
    ],
  },
  {
    key: "loom",
    name: "Project Loom",
    targetCompany: "Ashgrove Surface Technologies",
    stage: "sourcing",
    status: "active",
    value: null,
    industry: "Chemicals & Materials",
    purpose:
      "Deliberately data-poor: no value, no economics, no documents, one assumption. This is the empty-state deal — every panel on the dossier has to render honestly against it, and sourcing → evaluation is the one ungated stage move.",
    economics: null,
    milestones: [],
  },
  {
    key: "nordhaven",
    name: "Project Nordhaven",
    targetCompany: "Nordhaven Marine Fasteners",
    stage: "integration",
    status: "completed",
    value: "$71M",
    industry: "Industrials & Manufacturing",
    purpose:
      "A closed deal with a realised outcome. Without at least one of these the comps engine has no precedent to compute against and the forecast-vs-actual benchmark has nothing to score.",
    economics: {
      currency: "USD",
      equityValue: 24.9,
      netDebt: 46.1,
      enterpriseValue: null,
      targetEbitda: 11.6,
      targetRevenue: 78.4,
      peInputs: { equityPct: 35, holdYears: 4, exitMultiple: 8.5 },
      sourcesUses: [
        { label: "Sponsor equity", side: "source", amount: 24.9 },
        { label: "Senior facility", side: "source", amount: 46.1 },
        { label: "Purchase of equity", side: "use", amount: 68.2 },
        { label: "Fees", side: "use", amount: 2.8 },
      ],
      realized: {
        exitDate: "2024-11-14",
        exitEv: 98.6,
        realizedIrr: 0.213,
        realizedMoic: 2.14,
      },
    },
    milestones: [
      { kind: "signing", dueInDays: -1_580, completed: true },
      { kind: "closing", dueInDays: -1_505, completed: true },
      { kind: "custom", customLabel: "Exit completed", dueInDays: -279, note: "Sold to a strategic buyer at 8.5× trailing.", completed: true },
    ],
  },
  {
    key: "ardsley",
    name: "Project Ardsley",
    targetCompany: "Ardsley Precision Holdings",
    stage: "evaluation",
    status: "cancelled",
    value: "$96M",
    industry: "Industrials & Manufacturing",
    purpose:
      "A deal the firm walked away from, with a recorded kill decision and recommendations that were later contradicted. Failure-pattern detection needs negative outcomes to detect anything; a corpus of successes teaches the engine that nothing ever goes wrong.",
    economics: {
      currency: "USD",
      equityValue: 96,
      netDebt: 18.4,
      enterpriseValue: null,
      targetEbitda: 13.0,
      targetRevenue: 104.2,
      peInputs: { equityPct: 50, holdYears: 5, exitMultiple: 8.0 },
      sourcesUses: null,
      realized: null,
    },
    milestones: [
      { kind: "custom", customLabel: "IC review", dueInDays: -204, note: "Passed. Customer concentration above the fund's threshold and no path to mitigate.", completed: true },
    ],
  },
  {
    key: "kestrel_retro",
    name: "Project Kestrel Retro",
    targetCompany: "Kestrel Thermal Systems",
    stage: "integration",
    status: "active",
    value: "$214M",
    industry: "Industrials & Manufacturing",
    purpose:
      "The synergy deal. Carries a synergy plan with quarterly planned-vs-actual phasing, which is the only way the Synergy Reality Engine's period logic gets exercised — an unphased plan takes a completely different code path.",
    economics: {
      currency: "USD",
      equityValue: 128.4,
      netDebt: 85.6,
      enterpriseValue: null,
      targetEbitda: 23.5,
      targetRevenue: 168.9,
      peInputs: { equityPct: 60, holdYears: 6, exitMultiple: 8.0 },
      sourcesUses: null,
      realized: null,
    },
    milestones: [
      { kind: "closing", dueInDays: -640, completed: true },
      { kind: "custom", customLabel: "Day-100 integration review", dueInDays: -540, note: "Three of eight workstreams behind plan.", completed: true },
      { kind: "custom", customLabel: "Year-2 synergy checkpoint", dueInDays: 5, note: "Due imminently. Procurement synergies are tracking at 61% of plan.", completed: false },
    ],
  },
  {
    key: "verity",
    name: "Project Verity",
    targetCompany: "Verity Fluid Handling",
    stage: "negotiation",
    status: "active",
    value: "€312M",
    industry: "Industrials & Manufacturing",
    purpose:
      "Non-USD, covenant-stressed and milestone-dense, with two deadlines inside the reminder window. The timeline and deadline surfaces need a deal that is genuinely up against the clock, and the euro value proves the portfolio aggregates by currency instead of inventing an FX rate.",
    economics: {
      currency: "EUR",
      equityValue: 194,
      netDebt: 118,
      enterpriseValue: null,
      targetEbitda: 34.6,
      targetRevenue: 241.8,
      peInputs: { equityPct: 48, holdYears: 5, exitMultiple: 9.25 },
      sourcesUses: null,
      realized: null,
    },
    milestones: [
      { kind: "loi_signed", dueInDays: -62, completed: true },
      { kind: "exclusivity_expiry", dueInDays: 4, note: "No extension agreed. The seller has a second bidder in the room.", completed: false },
      { kind: "financing_commitment", dueInDays: 6, note: "Commitment letter expires the same week as exclusivity.", completed: false },
      { kind: "signing", dueInDays: 29, completed: false },
    ],
  },
  {
    key: "suzhou",
    name: "Project Suzhou",
    targetCompany: "Anfeng Motion Technologies",
    stage: "closing",
    status: "active",
    value: "$142M",
    industry: "Industrials & Manufacturing",
    purpose:
      "Multi-jurisdiction merger control (US, Germany, China) with a filing already submitted and a regulatory deadline pending. Regulatory Radar has nothing to reason about without a deal that actually has a clearance path.",
    economics: {
      currency: "USD",
      equityValue: 142,
      netDebt: 31.2,
      enterpriseValue: null,
      targetEbitda: 19.4,
      targetRevenue: 121.6,
      peInputs: { equityPct: 55, holdYears: 5, exitMultiple: 8.25 },
      sourcesUses: null,
      realized: null,
    },
    milestones: [
      { kind: "loi_signed", dueInDays: -151, completed: true },
      { kind: "signing", dueInDays: -63, completed: true },
      { kind: "filing_submitted", dueInDays: -44, note: "HSR and Bundeskartellamt filings submitted. SAMR filing followed nine days later.", completed: true },
      { kind: "regulatory_deadline", dueInDays: 19, note: "German Phase I decision due. A Phase II referral would push closing past the long-stop date.", completed: false },
      { kind: "closing", dueInDays: 58, completed: false },
    ],
  },
];

export function dealByKey(key: string): SeedDeal {
  const d = SEED_DEALS.find((x) => x.key === key);
  if (!d) throw new Error(`thornevale fixture: no deal with key "${key}"`);
  return d;
}

/** Absolute due dates, resolved off the dataset epoch. */
export function milestoneDueDate(m: SeedMilestone): string {
  return epochPlusDaysIso(m.dueInDays);
}

// ─── Screening targets ───────────────────────────────────────────────────────
// Enough population that the screening table, the fit-score sort and the
// analytics roll-ups have something to do. Financials are display STRINGS
// because that is what the column is — the server derives the numeric mirrors
// through contracts/value.ts, and seeding the numbers directly would bypass
// the parse this fixture is partly here to test.

export interface SeedTarget {
  name: string;
  sector: string;
  ebitda: string | null;
  revenue: string | null;
  fitScore: number;
  description: string;
  status: "new" | "screened" | "contacted" | "offer" | "declined" | "acquired";
}

export const SEED_TARGETS: SeedTarget[] = [
  { name: "Ashgrove Surface Technologies", sector: "Chemicals & Materials", ebitda: "$14M", revenue: "$61M", fitScore: 88, description: "Powder-coating formulations qualified into two rail platforms. The Project Loom target.", status: "screened" },
  { name: "Caldera Valve Works", sector: "Industrials & Manufacturing", ebitda: "$21M", revenue: "$96M", fitScore: 84, description: "Severe-service valves for power generation. Aftermarket mix 38%.", status: "contacted" },
  { name: "Peregrine Sealing Group", sector: "Industrials & Manufacturing", ebitda: "$9M", revenue: "$52M", fitScore: 71, description: "Elastomeric seals. Overlaps Vantage; would compound rather than diversify the existing exposure.", status: "new" },
  { name: "Hollowmere Pumps", sector: "Industrials & Manufacturing", ebitda: "$17M", revenue: "$74M", fitScore: 79, description: "Positive-displacement pumps for food and beverage. Clean bolt-on to Flow Systems.", status: "screened" },
  { name: "Torvald Agritech Inc.", sector: "Agricultural equipment", ebitda: "$212M", revenue: "$1,840M", fitScore: 31, description: "Thornevale's largest customer. Logged as a target during a 2024 reverse-merger exploration that went nowhere.", status: "declined" },
  { name: "Torvald AgriTech, Inc.", sector: "Agricultural Equipment", ebitda: "$214M", revenue: "$1,845M", fitScore: 29, description: "DUPLICATE ENTITY — the same company as the row above, entered a second time from a different data provider with a slightly different legal name and refreshed financials. Left in deliberately.", status: "new" },
  { name: "Brackenfell Thermal", sector: "Industrials & Manufacturing", ebitda: "$8M", revenue: "$47M", fitScore: 64, description: "Plate heat exchangers, Benelux. Sub-scale but strategically located next to Wrocław.", status: "new" },
  { name: "Quillon Drive Systems", sector: "Industrials & Manufacturing", ebitda: null, revenue: "$38M", fitScore: 42, description: "MISSING FINANCIALS — EBITDA never supplied by the banker. Forces every multiple on this row to render as 'n.m.'.", status: "new" },
  { name: "Verity Fluid Handling", sector: "Industrials & Manufacturing", ebitda: "€35M", revenue: "€242M", fitScore: 91, description: "The Project Verity target. Euro-denominated.", status: "offer" },
  { name: "Anfeng Motion Technologies", sector: "Industrials & Manufacturing", ebitda: "$19M", revenue: "$122M", fitScore: 86, description: "The Project Suzhou target. Chinese motion-control manufacturer.", status: "offer" },
  { name: "Stourbridge Adhesives", sector: "Chemicals & Materials", ebitda: "$26M", revenue: "$88M", fitScore: 87, description: "Structural adhesives, UK. Would extend Marrow & Pike into aerospace qualification.", status: "contacted" },
  { name: "Ravenscourt Filtration", sector: "Industrials & Manufacturing", ebitda: "$12M", revenue: "$58M", fitScore: 73, description: "Industrial filtration. Recurring consumables model.", status: "new" },
  { name: "Delmarch Instruments", sector: "Technology & Software", ebitda: "$7M", revenue: "$29M", fitScore: 58, description: "Process instrumentation with a thin software layer. The nearest thing to a Connect do-over, which is exactly why it is being looked at sceptically.", status: "new" },
  { name: "Oakhurst Castings", sector: "Industrials & Manufacturing", ebitda: "$11M", revenue: "$79M", fitScore: 68, description: "Ductile-iron foundry. Vertical integration that would resolve the Sanjiu sole-source exposure.", status: "screened" },
  { name: "Lindenow Gearing", sector: "Industrials & Manufacturing", ebitda: "$6M", revenue: "$41M", fitScore: 47, description: "Precision gearing, Germany. Declining end-market.", status: "declined" },
  { name: "Marisco Water Systems", sector: "Water & Environment", ebitda: "$23M", revenue: "$101M", fitScore: 89, description: "Municipal water treatment packages. Directly adjacent to the Osmund relationship.", status: "contacted" },
  { name: "Halberd Corrosion Control", sector: "Chemicals & Materials", ebitda: "$18M", revenue: "$64M", fitScore: 82, description: "Corrosion-inhibiting primers for offshore structures.", status: "screened" },
  { name: "Fennimore Actuation", sector: "Industrials & Manufacturing", ebitda: "$15M", revenue: "$67M", fitScore: 76, description: "Electric actuators. Would give Flow Systems an electrification story.", status: "new" },
  { name: "Bramwell Heat Transfer", sector: "Industrials & Manufacturing", ebitda: "$31M", revenue: "$187M", fitScore: 80, description: "Air-cooled condensers, US Gulf Coast. Scale, but concentrated in the same Helvexa end-market Kestrel already depends on.", status: "screened" },
  { name: "Sable Point Composites", sector: "Chemicals & Materials", ebitda: "$9M", revenue: "$33M", fitScore: 61, description: "Composite repair systems. Small and early.", status: "new" },
  { name: "Kirkmichael Motors", sector: "Industrials & Manufacturing", ebitda: "$4M", revenue: "$44M", fitScore: 22, description: "Commodity fractional-horsepower motors. Screened solely to confirm the Braeburn end-market read; the 8.4% margin confirmed it.", status: "declined" },
  { name: "Trenholm Process Solutions", sector: "Industrials & Manufacturing", ebitda: "$27M", revenue: "$112M", fitScore: 85, description: "Skid-mounted process packages. Strong aftermarket attach.", status: "contacted" },
  { name: "Aveley Elastomers", sector: "Chemicals & Materials", ebitda: "$13M", revenue: "$49M", fitScore: 70, description: "Custom-compound elastomers. Would resolve the Peregrine Polymers FX exposure through onshoring.", status: "new" },
  { name: "Northgate Fluid Power", sector: "Industrials & Manufacturing", ebitda: "$22M", revenue: "$95M", fitScore: 81, description: "Hydraulic power units for mobile equipment.", status: "screened" },
  { name: "Cleremont Bearings", sector: "Industrials & Manufacturing", ebitda: "$16M", revenue: "$86M", fitScore: 66, description: "Industrial bearings. Competitive, low-differentiation.", status: "new" },
  { name: "Westhaven Coatings Ltd", sector: "Chemicals & Materials", ebitda: "£19M", revenue: "£71M", fitScore: 83, description: "Sterling-denominated. Marine and offshore coatings.", status: "contacted" },
  { name: "Duncastle Thermal Products", sector: "Industrials & Manufacturing", ebitda: "$0M", revenue: "$26M", fitScore: 18, description: "ZERO EBITDA — genuinely break-even after two loss-making years. Forces EV/EBITDA to 'n.m.' through the zero-denominator branch rather than the null branch.", status: "declined" },
  { name: "Ellersby Instruments", sector: "Technology & Software", ebitda: "$5M", revenue: "$21M", fitScore: 54, description: "Condition-monitoring sensors.", status: "new" },
  { name: "Marchmont Industrial Group", sector: "Industrials & Manufacturing", ebitda: "$96M", revenue: "$612M", fitScore: 77, description: "Diversified industrial. A plausible alternative platform to Thornevale, at roughly half the size.", status: "screened" },
  { name: "Penrhos Valve & Controls", sector: "Industrials & Manufacturing", ebitda: "$20M", revenue: "$83M", fitScore: 78, description: "Control valves, Wales. Overlaps Caldera; the two are alternatives, not complements.", status: "new" },
];

/** Kept explicit because several tests assert on it and a silent edit to the
 *  list above should break them loudly rather than quietly. */
export const DUPLICATE_TARGET_NAMES = ["Torvald Agritech Inc.", "Torvald AgriTech, Inc."] as const;
export const NULL_EBITDA_TARGET = "Quillon Drive Systems";
export const ZERO_EBITDA_TARGET = "Duncastle Thermal Products";

/** The one target whose sector deliberately does not match the group's own
 *  taxonomy casing, so normalisation has something to normalise. */
export const CASING_VARIANT_SECTORS = ["Agricultural equipment", "Agricultural Equipment"] as const;
