// ─────────────────────────────────────────────────────────────────────────────
// Thornevale Industrial Group — the fictional target at the centre of the
// `thornevale-v1` corpus.
//
// Entirely invented. It is *shaped* like a long-lived diversified industrial —
// several units on very different margins, two divestitures, one expensive
// failed initiative, a bolt-on that did not work, concentration on both the
// customer and the supplier side — because that shape is what makes the app's
// analysis surfaces say anything interesting. No real company's names, numbers
// or history appear here.
//
// This module is the narrative spine. `financials.ts` puts numbers on it,
// `documents.ts` turns it into readable artifacts, `analytics.ts` turns it into
// the judgements a deal team would record about it.
//
// Pure data. No imports, no I/O.
// ─────────────────────────────────────────────────────────────────────────────

export const COMPANY_NAME = "Thornevale Industrial Group";
export const COMPANY_SHORT = "TIG";
export const COMPANY_FOUNDED = 2001;
export const COMPANY_HQ = "Toledo, Ohio, USA";

/** Fiscal years the corpus covers, inclusive. 25 years of operating history. */
export const FY_FIRST = 2001;
export const FY_LAST = 2025;

export interface BusinessUnit {
  key: string;
  name: string;
  /** How it entered the group. */
  origin: "founding" | "acquired" | "greenfield";
  originYear: number;
  /** null while still owned. */
  divestedYear: number | null;
  description: string;
  /** Long-run EBITDA margin the unit trends toward, as a percentage. */
  marginAnchorPct: number;
  /** FY2025 revenue in $M. Zero for units no longer in the perimeter. */
  fy25RevenueM: number;
  /** Compound revenue growth the unit trends at, as a fraction. Negative for
   *  the units in structural decline. */
  growthTrend: number;
  primarySites: string[];
}

/**
 * Six units, four still in the perimeter at FY2025. The margin spread — 8.9% at
 * Braeburn against 31.4% at Marrow & Pike — is the single most important
 * property of this fixture: a diversified industrial whose units all earn the
 * same margin tests nothing, because every mix-shift question has the same
 * answer.
 */
export const BUSINESS_UNITS: BusinessUnit[] = [
  {
    key: "flow",
    name: "Thornevale Flow Systems",
    origin: "founding",
    originYear: 2001,
    divestedYear: null,
    description:
      "Centrifugal and positive-displacement pumps, control valves and mechanical sealing for water treatment, chemical processing and power generation. The original business and still the group's profit engine: roughly 44% of unit revenue is aftermarket parts and service, which is why its margin holds through cycles that flatten the rest of the portfolio.",
    marginAnchorPct: 27.8,
    fy25RevenueM: 486.2,
    growthTrend: 0.041,
    primarySites: ["Toledo, Ohio", "Bielefeld, Germany", "Pune, India"],
  },
  {
    key: "thermal",
    name: "Kestrel Thermal Systems",
    origin: "acquired",
    originYear: 2007,
    divestedYear: null,
    description:
      "Shell-and-tube and plate heat exchangers, air-cooled condensers and process cooling packages for refining, petrochemical and district-energy customers. Acquired in 2007 for $214M at what the board later conceded was a cycle peak. Project-based and therefore lumpy: revenue recognition follows milestone billing, and a single deferred refinery turnaround can move a quarter by nine points.",
    marginAnchorPct: 16.2,
    fy25RevenueM: 341.4,
    growthTrend: 0.019,
    primarySites: ["Grand Rapids, Michigan", "Wrocław, Poland", "Curitiba, Brazil"],
  },
  {
    key: "coatings",
    name: "Marrow & Pike Coatings",
    origin: "acquired",
    originYear: 2013,
    divestedYear: null,
    description:
      "Specialty industrial coatings, structural adhesives and corrosion-inhibiting primers, largely qualified into customer specifications. The highest-margin unit in the group by a wide distance, and the most fragile: qualification is a two-to-three-year process that locks customers in, but three accounts represent 61% of unit revenue and a single re-specification would take years to replace.",
    marginAnchorPct: 31.4,
    fy25RevenueM: 228.7,
    growthTrend: 0.063,
    primarySites: ["Toledo, Ohio", "Monterrey, Mexico"],
  },
  {
    key: "motion",
    name: "Braeburn Motion Controls",
    origin: "founding",
    originYear: 2001,
    divestedYear: null,
    description:
      "Fractional and integral-horsepower motors, gearboxes and variable-frequency drives. Structurally challenged: commodity import pressure has compressed price by roughly 2% a year for a decade while the unit's Toledo and Suzhou footprint carries fixed cost sized for a business a third larger. Two restructurings (2015, 2022) took out capacity without restoring margin. This is the carve-out candidate.",
    marginAnchorPct: 8.9,
    fy25RevenueM: 197.3,
    growthTrend: -0.022,
    primarySites: ["Toledo, Ohio", "Suzhou, China"],
  },
  {
    key: "sealing",
    name: "Vantage Sealing Technologies",
    origin: "acquired",
    originYear: 2021,
    divestedYear: null,
    description:
      "Engineered gaskets, elastomeric seals and expansion joints. A $118M bolt-on acquired in 2021 on a thesis of cross-selling into the Flow Systems channel. The cross-sell has not materialised at anything like the modelled rate: management attributes this to channel-conflict with two Flow distributors, and the unit took a $31M goodwill impairment in FY2024.",
    marginAnchorPct: 11.1,
    fy25RevenueM: 74.1,
    growthTrend: 0.008,
    primarySites: ["Grand Rapids, Michigan", "Monterrey, Mexico"],
  },
  {
    key: "connect",
    name: "Thornevale Connect",
    origin: "greenfield",
    originYear: 2019,
    divestedYear: 2023,
    description:
      "A group-level digital initiative — connected-asset monitoring and a predictive-maintenance subscription layered across the installed base. Announced in 2019 with a target of $120M of recurring revenue by 2024. It reached $9.4M. Wound down in 2023 with $84.2M written off, of which $51M was capitalised software. The most instructive failure in the group's history and the one management is least forthcoming about.",
    marginAnchorPct: -38.0,
    fy25RevenueM: 0,
    growthTrend: 0,
    primarySites: ["Toledo, Ohio"],
  },
];

/** Units still in the FY2025 perimeter. */
export const ACTIVE_UNITS = BUSINESS_UNITS.filter((u) => u.divestedYear === null && u.fy25RevenueM > 0);

export interface CorporateEvent {
  year: number;
  kind: "acquisition" | "divestiture" | "restructuring" | "impairment" | "failed_initiative" | "financing" | "leadership";
  headline: string;
  detail: string;
  /** $M. Sign is meaningful: positive = cash in, negative = cash out. */
  cashImpactM: number | null;
}

/**
 * The group's history as a deal team would reconstruct it. Ordered oldest
 * first. Several of these are contradicted or under-described by the documents
 * in `documents.ts` — deliberately, because reconciling a management narrative
 * against the record is the actual work of diligence.
 */
export const CORPORATE_EVENTS: CorporateEvent[] = [
  {
    year: 2001,
    kind: "leadership",
    headline: "Thornevale Industrial Group founded",
    detail:
      "Formed from the merger of Thornevale Pump Works (Toledo, est. 1954) and Braeburn Electric Motor Co. (Toledo, est. 1961) under a management buyout led by Aldous Thornevale III.",
    cashImpactM: null,
  },
  {
    year: 2004,
    kind: "financing",
    headline: "First institutional recapitalisation",
    detail: "$140M senior facility replacing seller notes; Thornevale family retained 61%.",
    cashImpactM: 140,
  },
  {
    year: 2007,
    kind: "acquisition",
    headline: "Kestrel Thermal Systems acquired for $214M",
    detail:
      "9.1× trailing EBITDA. Board minutes record two directors dissenting on price. The unit's EBITDA fell 34% in the following eighteen months as the refining capex cycle turned.",
    cashImpactM: -214,
  },
  {
    year: 2009,
    kind: "restructuring",
    headline: "Downturn restructuring — 780 positions",
    detail:
      "Group revenue fell 22% peak-to-trough. Two Kestrel plants consolidated into Grand Rapids; $28M charge.",
    cashImpactM: -28,
  },
  {
    year: 2011,
    kind: "divestiture",
    headline: "Ardsley Hand Tools divested for $96M",
    detail:
      "Consumer-channel business judged non-core. Sold to a strategic buyer at 7.4× EBITDA. Widely regarded internally as the group's best-executed exit.",
    cashImpactM: 96,
  },
  {
    year: 2013,
    kind: "acquisition",
    headline: "Marrow & Pike Coatings acquired for $265M",
    detail:
      "11.8× trailing EBITDA — the highest multiple the group has ever paid, and the acquisition that has most clearly worked. Revenue has compounded at 6.3% since.",
    cashImpactM: -265,
  },
  {
    year: 2015,
    kind: "restructuring",
    headline: "Braeburn footprint restructuring",
    detail:
      "Two US lines relocated to Suzhou; 340 positions eliminated; $19M charge. Modelled to restore 400bps of unit margin. Delivered approximately 120bps.",
    cashImpactM: -19,
  },
  {
    year: 2016,
    kind: "divestiture",
    headline: "Nordhaven Marine Fasteners divested for $71M",
    detail:
      "Marine and offshore fastener business exited at 6.1× EBITDA into a weak offshore market. Management's later characterisation of this exit differs materially between the FY2019 strategic plan and the current management presentation.",
    cashImpactM: 71,
  },
  {
    year: 2019,
    kind: "failed_initiative",
    headline: "Thornevale Connect launched",
    detail:
      "Group digital initiative targeting $120M of recurring revenue by 2024. $62M of committed investment approved at launch; ultimately consumed $84.2M.",
    cashImpactM: -62,
  },
  {
    year: 2020,
    kind: "restructuring",
    headline: "Pandemic cost actions",
    detail:
      "Temporary furloughs across all units, capex deferred by $41M, no permanent headcount reduction. Revenue fell 14.6% and recovered fully by FY2022.",
    cashImpactM: null,
  },
  {
    year: 2021,
    kind: "acquisition",
    headline: "Vantage Sealing Technologies acquired for $118M",
    detail:
      "10.2× trailing EBITDA on a cross-sell thesis into the Flow Systems distribution channel. The synergy case assumed $14M of revenue synergy by year three; realised approximately $3.1M.",
    cashImpactM: -118,
  },
  {
    year: 2022,
    kind: "restructuring",
    headline: "Second Braeburn restructuring",
    detail: "One Toledo line closed, 210 positions; $23M charge. Unit margin did not recover.",
    cashImpactM: -23,
  },
  {
    year: 2023,
    kind: "failed_initiative",
    headline: "Thornevale Connect wound down",
    detail:
      "$84.2M written off including $51M of capitalised software. Twelve of the fourteen Connect engineering staff were redeployed rather than exited, which is why the charge shows no severance line.",
    cashImpactM: -84.2,
  },
  {
    year: 2024,
    kind: "impairment",
    headline: "Vantage goodwill impairment — $31M",
    detail:
      "Triggered by the third consecutive year of missed cross-sell targets. The impairment test used a 9.5% WACC; the FY2023 test had used 8.25%.",
    cashImpactM: null,
  },
  {
    year: 2024,
    kind: "financing",
    headline: "Receivables factoring programme initiated",
    detail:
      "A $60M non-recourse programme against Torvald and Helvexa receivables. Reported DSO improved by 9 days on initiation; DSO excluding the programme continued to deteriorate.",
    cashImpactM: 47,
  },
  {
    year: 2025,
    kind: "leadership",
    headline: "CFO transition",
    detail:
      "Ingrid Vasquez-Møller appointed CFO in March 2025 following the retirement of the incumbent of eleven years. The Q3 FY2025 revenue restatement was identified during her first close.",
    cashImpactM: null,
  },
];

// ─── Concentration ───────────────────────────────────────────────────────────

export interface CustomerAccount {
  name: string;
  sector: string;
  sharePct: number;
  units: string[];
  tenureYears: number;
  note: string;
}

/** Top-5 at 44.7% — heavy, but not so heavy the deal is obviously undoable.
 *  The interesting property is that the two largest are concentrated in the two
 *  units with the most and least attractive economics. */
export const TOP_CUSTOMERS: CustomerAccount[] = [
  {
    name: "Torvald Agritech Inc.",
    sector: "Agricultural equipment",
    sharePct: 18.7,
    units: ["motion", "flow"],
    tenureYears: 19,
    note: "Sole-sourced on 41 part numbers. Contract renews December 2027 and carries a 3% annual price-down clause. Torvald's own volumes fell 8% in calendar 2025.",
  },
  {
    name: "Helvexa Energy Services",
    sector: "Oilfield & process services",
    sharePct: 9.2,
    units: ["thermal", "flow"],
    tenureYears: 12,
    note: "Project-based; no framework agreement. Two of the last three years' revenue came from a single Gulf Coast programme now substantially complete.",
  },
  {
    name: "Brand & Quill Mobility",
    sector: "Commercial vehicles",
    sharePct: 7.4,
    units: ["coatings", "motion"],
    tenureYears: 8,
    note: "Coatings qualified into two vehicle platforms. A platform refresh scheduled for 2028 will require re-qualification.",
  },
  {
    name: "Calderwood Rail Systems",
    sector: "Rail infrastructure",
    sharePct: 5.1,
    units: ["coatings", "sealing"],
    tenureYears: 6,
    note: "Growing. The only top-5 account where Vantage cross-sell actually worked.",
  },
  {
    name: "Osmund Water Group",
    sector: "Municipal water",
    sharePct: 4.3,
    units: ["flow"],
    tenureYears: 22,
    note: "Longest-standing customer in the group. Municipal budget cycles make it slow but exceptionally sticky.",
  },
];

export const TOP5_CUSTOMER_SHARE_PCT = 44.7;

export interface SupplierAccount {
  name: string;
  category: string;
  spendPct: number;
  soleSource: boolean;
  geography: string;
  risk: string;
}

export const KEY_SUPPLIERS: SupplierAccount[] = [
  {
    name: "Sanjiu Precision Castings",
    category: "Ductile iron & steel castings",
    spendPct: 14.2,
    soleSource: true,
    geography: "Suzhou, China",
    risk: "Sole-sourced on 60% of Flow Systems pump housings. No qualified alternate. Requalification is estimated at 14–18 months per part family.",
  },
  {
    name: "Nordmagnet Rare Earth GmbH",
    category: "Permanent magnets (NdFeB)",
    spendPct: 6.8,
    soleSource: true,
    geography: "Bielefeld, Germany (Chinese feedstock)",
    risk: "Sole-sourced for Braeburn's premium-efficiency motor line. Feedstock originates in China regardless of the German finishing step, so the export-control exposure is not mitigated by the supplier's location.",
  },
  {
    name: "Ferralux Steel Partners",
    category: "Plate & tube stock",
    spendPct: 11.9,
    soleSource: false,
    geography: "Multiple, US & EU",
    risk: "Three qualified sources. Priced on an index with a 90-day lag, which is why input-cost pass-through shows up two quarters late in the Thermal margin.",
  },
  {
    name: "Peregrine Polymers",
    category: "Elastomer compounds",
    spendPct: 4.4,
    soleSource: false,
    geography: "Curitiba, Brazil",
    risk: "Dual-sourced. FX exposure unhedged below a $2M monthly threshold.",
  },
];

// ─── Geography ───────────────────────────────────────────────────────────────

export interface Site {
  city: string;
  country: string;
  kind: "hq" | "manufacturing" | "manufacturing_rd" | "distribution";
  headcount: number;
  units: string[];
}

export const SITES: Site[] = [
  { city: "Toledo", country: "United States", kind: "hq", headcount: 1180, units: ["flow", "motion", "coatings"] },
  { city: "Grand Rapids", country: "United States", kind: "manufacturing", headcount: 640, units: ["thermal", "sealing"] },
  { city: "Monterrey", country: "Mexico", kind: "manufacturing", headcount: 810, units: ["coatings", "sealing"] },
  { city: "Bielefeld", country: "Germany", kind: "manufacturing_rd", headcount: 470, units: ["flow"] },
  { city: "Wrocław", country: "Poland", kind: "manufacturing", headcount: 520, units: ["thermal"] },
  { city: "Suzhou", country: "China", kind: "manufacturing", headcount: 690, units: ["motion"] },
  { city: "Curitiba", country: "Brazil", kind: "manufacturing", headcount: 240, units: ["thermal"] },
  { city: "Pune", country: "India", kind: "manufacturing_rd", headcount: 310, units: ["flow"] },
];

export const TOTAL_HEADCOUNT = SITES.reduce((n, s) => n + s.headcount, 0);

/** Revenue by destination region, FY2025, as percentages. */
export const REVENUE_BY_REGION: { region: string; pct: number }[] = [
  { region: "North America", pct: 54.1 },
  { region: "Europe", pct: 24.6 },
  { region: "Asia-Pacific", pct: 13.8 },
  { region: "Latin America", pct: 5.9 },
  { region: "Rest of world", pct: 1.6 },
];

// ─── The management narrative ────────────────────────────────────────────────

/**
 * How management tells the story. Preserved verbatim-ish so the corpus can
 * contain the gap between this and the numbers — several of these claims are
 * directly contradicted by `financials.ts`, which is the point.
 */
export const MANAGEMENT_NARRATIVE = {
  positioning:
    "Thornevale is a focused industrial platform with leadership positions in flow control and specialty coatings, supported by a resilient aftermarket franchise and a disciplined acquisition record.",
  growthStory:
    "Management projects 6–8% organic revenue growth through FY2029, driven by water-infrastructure spend, the reshoring of chemical processing capacity, and continued qualification wins at Marrow & Pike.",
  marginStory:
    "Adjusted EBITDA margin of 22.0% is expected to reach 24.5% by FY2028 as the Braeburn restructuring annualises and Vantage integration synergies land.",
  backlogClaim:
    "Record backlog entering FY2026 provides exceptional visibility into the coming year.",
  braeburnPosition:
    "Braeburn is a stabilised business with a defensible niche in industrial motion; management does not view divestiture as necessary to the equity story.",
  connectPosition:
    "The Connect programme was a disciplined experiment that was concluded on schedule once the market thesis proved premature.",
  workingCapitalPosition:
    "Working capital discipline has improved materially, with days sales outstanding down nine days year over year.",
};
