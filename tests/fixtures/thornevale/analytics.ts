// ─────────────────────────────────────────────────────────────────────────────
// The judgements a deal team records about Thornevale: stress-tested
// assumptions, scenario snapshots, recommendations, and the outcome ledger that
// says what actually happened to each of them.
//
// This is the part of the corpus the product is actually about. Documents and
// financials are the raw material; these are the decisions, and the decisions
// are what Ansyra claims to be better at than a data room.
//
// Two structural rules the fixture has to respect, both enforced by the app:
//
//   1. THE ASSUMPTION GATE. An assumption scoring above 80 with no reviewer
//      response blocks stage advancement (contracts/assumption-gate.ts). Anvil
//      deliberately has one, so the gate is visibly locked on the deal a person
//      is most likely to open first.
//
//   2. THE RECOMMENDATION GATE. Moving into diligence, negotiation, closing or
//      integration needs an accepted, unexpired recommendation recorded at the
//      stage you are LEAVING (contracts/recommendation-gate.ts). Every deal that
//      has already advanced therefore carries the recommendation that justified
//      the move it already made — otherwise the corpus would describe a history
//      the product says is impossible.
//
// Cross-row references are by HANDLE, never by id: the database assigns serial
// ids at insert time, so the seeder resolves these into RecommendationEvidence
// rows. A fixture that hard-coded ids would be wrong the first time it ran.
// ─────────────────────────────────────────────────────────────────────────────
import {
  BACKLOG,
  COVENANT,
  MANAGEMENT_ADJ_EBITDA_M,
  MANAGEMENT_MARGIN_PCT,
  QOE_ADJ_EBITDA_M,
  QOE_GAP_M,
  QOE_MARGIN_PCT,
  WORKING_CAPITAL,
} from "./financials";
import { ANVIL_EV_ON_QOE_MULTIPLE } from "./deals";

// ─── Narrative tensions ──────────────────────────────────────────────────────
// Moved here from company.ts so the figures can be DERIVED. When they lived
// beside the narrative they were hand-typed, and the first change to the
// financial model left them quietly asserting numbers the corpus no longer had.

export interface NarrativeTension {
  claim: string;
  record: string;
  severity: "high" | "medium" | "low";
}

export const NARRATIVE_TENSIONS: NarrativeTension[] = [
  {
    claim: BACKLOG.managementClaim,
    record:
      `Backlog is $${BACKLOG.currentM}M in ${BACKLOG.quarter} against $${BACKLOG.priorYearM}M in ${BACKLOG.priorYearQuarter} — ` +
      `${BACKLOG.changePct.toFixed(1)}% year over year, and below the $${BACKLOG.peakM}M peak in the period. ` +
      `The "record" figure appears to include an unexercised $94M framework option.`,
    severity: "high",
  },
  {
    claim: `Adjusted EBITDA margin of ${MANAGEMENT_MARGIN_PCT.toFixed(1)}%.`,
    record:
      `The quality-of-earnings report supports ${QOE_MARGIN_PCT.toFixed(1)}% ($${QOE_ADJ_EBITDA_M.toFixed(1)}M against management's ` +
      `$${MANAGEMENT_ADJ_EBITDA_M.toFixed(1)}M — a gap of $${QOE_GAP_M.toFixed(1)}M). At the QoE's number the agreed price is ` +
      `${ANVIL_EV_ON_QOE_MULTIPLE.toFixed(1)}x rather than 8.0x.`,
    severity: "high",
  },
  {
    claim: "Days sales outstanding down nine days year over year.",
    record:
      `DSO excluding the $${WORKING_CAPITAL.factoringProgrammeM}M factoring programme initiated in ${WORKING_CAPITAL.factoringStarted} is ` +
      `${WORKING_CAPITAL.dsoCurrentDays} days, up from ${WORKING_CAPITAL.dsoStartDays} at the start of the period. The reported ` +
      `${WORKING_CAPITAL.dsoReportedCurrentDays} days is the programme, not an operating improvement.`,
    severity: "high",
  },
  {
    claim: "Braeburn is a stabilised business.",
    record:
      "Braeburn revenue has declined in seven of the last ten years and segment margin is 8.9% against 15.3% a decade ago, " +
      "after two restructurings totalling $42M. Voluntary attrition ran at 19.4% in FY2025.",
    severity: "medium",
  },
  {
    claim: "The Connect programme was concluded on schedule.",
    record:
      "The FY2019 strategic plan committed $62M through 2024. The programme consumed $84.2M and was wound down in 2023, " +
      "a year early, having reached 7.8% of its revenue target.",
    severity: "medium",
  },
  {
    claim: "Disciplined acquisition record.",
    record:
      "Two of four acquisitions have met their underwriting case. Kestrel (2007) was bought at 9.1x into a cycle peak and " +
      "lost a third of its EBITDA within eighteen months; Vantage (2021) has been impaired.",
    severity: "medium",
  },
  {
    claim: `Net leverage of ${COVENANT.currentRatio.toFixed(2)}x is comfortable against a ${COVENANT.currentLimit.toFixed(2)}x covenant.`,
    record:
      `Headroom is ${COVENANT.headroom.toFixed(2)}x today and ${COVENANT.headroomAfterStepDown.toFixed(2)}x after the ${COVENANT.stepDownDate} step-down — ` +
      `a breach on current EBITDA. Compliance assumes Braeburn disposal proceeds against no signed process.`,
    severity: "high",
  },
];

// ─── Assumptions ─────────────────────────────────────────────────────────────

export type AssumptionCategoryKey =
  | "revenue_retention"
  | "margin"
  | "integration"
  | "regulatory"
  | "market"
  | "financing"
  | "other";

export interface SeedAssumption {
  /** Handle for cross-references. Never persisted. */
  key: string;
  dealKey: string;
  assumption: string;
  /** null models a pre-Phase-15.15 row. The schema says these must NOT be
   *  back-guessed from the statement text, so one is left genuinely null. */
  category: AssumptionCategoryKey | null;
  reviewer: string | null;
  /** Empty/absent + optimism > 80 = blocks advancement. */
  reviewerNote: string | null;
  result: {
    reviewHistory?: import("../../../contracts/assumption-gate").AssumptionReview[];
    optimismScore: number;
    confidence: string;
    reasoning: string;
    recommendation: string;
    comparables?: string[];
  } | null;
}

const R_PARTNER = "Rosalind Achterberg";
const R_ASSOC = "Tobias Lindqvist";

export const SEED_ASSUMPTIONS: SeedAssumption[] = ([
  // ── Project Anvil ──
  {
    key: "anvil_margin_2450",
    dealKey: "anvil",
    assumption:
      "Adjusted EBITDA margin reaches 24.5% by FY2028, from 22.0% today, as the Braeburn restructuring annualises and Vantage synergies land.",
    category: "margin",
    reviewer: null,
    // NO reviewer note + optimism 87 → this is the row that locks the gate.
    reviewerNote: null,
    result: {
      optimismScore: 87,
      confidence: "low",
      reasoning:
        "The starting point is disputed before the walk even begins: the QoE supports 18.4%, not 22.0%, so the target is 610bps of expansion rather than 250bps. Both drivers have failed before — the Braeburn restructuring was underwritten twice (2015, 2022) and delivered roughly 30% of case each time, and Vantage synergies are at 22% of case in year four. Nothing in the plan explains what is different this time.",
      recommendation:
        "Reunderwrite from the QoE base of 18.4% and apply the group's own realisation history to both drivers. A defensible FY2028 case is 19.5-20.5%.",
      comparables: [
        "Braeburn 2015 restructuring: 400bps planned, ~120bps delivered",
        "Vantage 2021 revenue synergy: $14.0M planned, $3.1M delivered",
        "Kestrel Retro cross-sell: $5.5M planned, $1.2M delivered",
      ],
    },
  },
  {
    key: "anvil_torvald_renewal",
    dealKey: "anvil",
    assumption:
      "The Torvald Agritech master supply agreement renews in December 2027 on substantially current terms.",
    category: "revenue_retention",
    reviewer: R_PARTNER,
    reviewerNote:
      "Accepted with a condition. Sole-sourcing across 41 part numbers is real protection and the relationship is nineteen years old. But the renewal falls inside the hold period, the contract carries a 3% annual price-down, and Torvald's own volumes fell 8% in calendar 2025. We should model a renewal at a 5% price concession and require a customer call before signing.",
    result: {
      optimismScore: 72,
      confidence: "medium",
      reasoning:
        "Switching costs are genuinely high — requalification of sole-sourced parts runs 12-18 months on the customer side. The risk is not loss of the account but erosion of its terms at a moment when the customer is under volume pressure of its own.",
      recommendation:
        "Model renewal with a 5% price concession. Seek a customer reference call as a condition to signing.",
      comparables: ["Osmund Water Group: 22-year relationship, renewed twice on improving terms"],
    },
  },
  {
    key: "anvil_sanjiu_alternate",
    dealKey: "anvil",
    assumption:
      "An alternate supplier for the Sanjiu castings can be qualified within 12 months if required.",
    category: "other",
    reviewer: R_ASSOC,
    reviewerNote:
      "Contradicted by the procurement memo, which puts requalification at 14-18 months PER PART FAMILY, not in aggregate. There are four families. The realistic figure is three to four years for full coverage. Rescored down.",
    result: {
      optimismScore: 84,
      confidence: "low",
      reasoning:
        "The 12-month figure appears in the management materials without support. The group's own procurement function estimates 14-18 months per part family and notes that no alternate is qualified today.",
      recommendation:
        "Treat as a multi-year exposure. Price a supply-disruption scenario rather than a mitigation plan.",
    },
  },
  {
    key: "anvil_backlog_visibility",
    dealKey: "anvil",
    assumption: "Record backlog provides exceptional visibility into FY2026.",
    category: "market",
    reviewer: R_ASSOC,
    reviewerNote:
      "Rejected. Backlog is down 9.6% year over year and has fallen in five of the last six quarters. The 'record' claim rests on including an unexercised $94M framework option. This is not a visibility story, it is the opposite.",
    result: {
      optimismScore: 91,
      confidence: "low",
      reasoning:
        "The claim is contradicted by the company's own quarterly trending pack. Including an unexercised option in backlog is not a conventional treatment and was not disclosed as such.",
      recommendation:
        "Remove the framework option from backlog and restate the visibility case. Raise as a disclosure-quality issue with the seller.",
    },
  },
  {
    key: "anvil_covenant_headroom",
    dealKey: "anvil",
    assumption:
      "The FY2026 covenant step-down to 3.75x is manageable through Braeburn disposal proceeds.",
    category: "financing",
    reviewer: R_PARTNER,
    reviewerNote:
      "The logic holds only if the disposal completes on time and at price. There is no signed process. We should assume an amendment is required and price the fee.",
    result: {
      optimismScore: 79,
      confidence: "medium",
      reasoning:
        "Headroom after step-down is -0.19x on current EBITDA, so something has to happen. The disposal is the cleanest path but is entirely unevidenced; an amendment is the fallback and is achievable but not free.",
      recommendation: "Model an amendment fee of 25-50bps on the term loan and a 50bp margin step-up.",
    },
  },
  {
    key: "anvil_connect_addback",
    dealKey: "anvil",
    assumption: "Connect wind-down costs are non-recurring and will not repeat post-close.",
    category: "margin",
    reviewer: R_ASSOC,
    reviewerNote:
      "Rejected in line with the QoE. An item added back in each of four consecutive years is recurring in substance. Twelve of fourteen staff were redeployed rather than exited, so the cost moved into the unit cost bases rather than disappearing.",
    result: {
      optimismScore: 88,
      confidence: "low",
      reasoning:
        "The programme closed in 2023 and costs are still being added back in FY2025. The QoE declines this add-back and we agree.",
      recommendation: "Exclude from adjusted EBITDA. This is $8.9M of the $47.2M bridge gap.",
    },
  },
  {
    key: "anvil_aftermarket_durability",
    dealKey: "anvil",
    assumption:
      "Flow Systems' aftermarket mix of approximately 44% is durable and protects group margin through the cycle.",
    category: "margin",
    reviewer: R_PARTNER,
    reviewerNote:
      "Supported. This is the single most attractive feature of the asset and the 25-year record bears it out — Flow held margin through both 2009 and 2020 while the rest of the portfolio did not.",
    result: {
      optimismScore: 44,
      confidence: "high",
      reasoning:
        "Twenty-five years of segment data show Flow's margin compressing far less than Kestrel's or Braeburn's in both downturns. Aftermarket revenue on an installed base with 15-20 year asset lives is genuinely sticky.",
      recommendation: "Underwrite. Consider whether the aftermarket can be grown as a standalone thesis.",
      comparables: ["FY2009: Flow margin -3.1pts vs group -6.5pts", "FY2020: Flow margin -2.2pts vs group -3.1pts"],
    },
  },
  {
    key: "anvil_working_capital",
    dealKey: "anvil",
    assumption: "Working capital is normalised and requires no post-close investment.",
    category: "financing",
    reviewer: R_ASSOC,
    reviewerNote:
      "Rejected. If the factoring programme is not continued, roughly $60M unwinds at close. The sources and uses provided by the seller does not reflect this.",
    result: {
      optimismScore: 83,
      confidence: "low",
      reasoning:
        "Underlying DSO has deteriorated from 64 to 71 days and inventory turns have fallen every year since FY2021. The reported improvement is a financing arrangement, not an operating one.",
      recommendation: "Add a $60M working-capital line to uses, or obtain lender consent to continue the programme.",
    },
  },
  {
    key: "anvil_management_continuity",
    dealKey: "anvil",
    assumption: "The existing management team will remain in place through the first 24 months.",
    // DELIBERATELY NULL — this models a row created before Phase 15.15
    // introduced categories. The schema is explicit that such rows must be read
    // as "other" and must NOT be back-filled by guessing at the statement text,
    // so the corpus has to actually contain one for that path to be reachable.
    category: null,
    reviewer: null,
    reviewerNote: null,
    result: {
      optimismScore: 66,
      confidence: "medium",
      reasoning:
        "The CFO is four months into the role. The COO seat has been empty for over a year. Two of five unit presidents hold change-of-control provisions and neither has signed a retention agreement.",
      recommendation: "Make retention agreements for the two at-risk presidents a condition to signing.",
    },
  },
  {
    key: "anvil_management_continuity_dupe",
    dealKey: "anvil",
    assumption: "Existing management will stay in post for at least two years after closing.",
    // Near-duplicate of the row above, entered separately by a second team
    // member. Left in deliberately: deduplication is a real problem in a shared
    // ledger and the product should surface it rather than the fixture hiding it.
    category: "integration",
    reviewer: null,
    reviewerNote: null,
    result: {
      optimismScore: 64,
      confidence: "medium",
      reasoning:
        "Key-person risk is concentrated in the unit presidents rather than the centre. Two hold change-of-control rights.",
      recommendation: "Retention agreements before signing.",
    },
  },
  {
    key: "anvil_no_score",
    dealKey: "anvil",
    assumption:
      "The Toledo environmental remediation liability is capped at the agreed state programme and no successor liability attaches.",
    category: "regulatory",
    reviewer: null,
    reviewerNote: null,
    // No result at all — the AI never got to this one. The gate must NOT treat
    // an unscored row as blocking, which is exactly what this row proves.
    result: null,
  },

  // ── Project Anvil-Carve ──
  {
    key: "carve_stranded_cost",
    dealKey: "anvil_carve",
    assumption: "Standalone incremental cost for a carved-out Braeburn is $6M per annum.",
    category: "integration",
    reviewer: R_PARTNER,
    reviewerNote:
      "This is the deal. The seller's $6M assumes a 24-month TSA at cost; our number is $14M on a permanent standalone basis. At $14M the entry multiple goes from 9.6x to 17.5x and the transaction does not work.",
    result: {
      optimismScore: 89,
      confidence: "low",
      reasoning:
        "The seller's figure prices group IT, treasury and HR at internal cost under a temporary arrangement. A permanent standalone entity must stand those functions up at market. The gap is not a negotiating position, it is a different question being answered.",
      recommendation:
        "Do not proceed above $110M unless the seller funds the standalone cost differential or extends the TSA at cost for 48 months.",
    },
  },
  {
    key: "carve_overhead_basis",
    dealKey: "anvil_carve",
    assumption: "Revenue-based allocation of group overhead fairly represents Braeburn's cost.",
    category: "margin",
    reviewer: R_ASSOC,
    reviewerNote:
      "Untested by either side. Braeburn is 15.0% of revenue and 8.7% of EBITDA; whether revenue is the right basis for a business with that margin profile is an open question worth roughly $2-3M either way.",
    result: {
      optimismScore: 58,
      confidence: "medium",
      reasoning: "Allocation basis has not been challenged in the seller's materials.",
      recommendation: "Request an activity-based allocation as an alternative view.",
    },
  },

  // ── Project Loom (deliberately thin) ──
  {
    key: "loom_qualification",
    dealKey: "loom",
    assumption:
      "Ashgrove's rail-platform qualifications transfer on a change of control without re-qualification.",
    category: "regulatory",
    reviewer: null,
    reviewerNote: null,
    result: null,
  },

  // ── Project Verity ──
  {
    key: "verity_price_discipline",
    dealKey: "verity",
    assumption: "The second bidder will not go above EUR 320M.",
    category: "market",
    reviewer: R_PARTNER,
    reviewerNote:
      "Unknowable, and we should stop pretending otherwise. Set our own walk-away and hold it rather than modelling someone else's book.",
    result: {
      optimismScore: 81,
      confidence: "low",
      reasoning: "We have no visibility on the competing bidder's cost of capital or strategic rationale.",
      recommendation: "Set a walk-away at EUR 318M and communicate it internally before the next round.",
    },
  },
  {
    key: "verity_financing_timing",
    dealKey: "verity",
    assumption: "Financing commitment papers will be in place before exclusivity expires.",
    category: "financing",
    reviewer: R_ASSOC,
    reviewerNote:
      "Two days of margin between the commitment letter expiry and exclusivity expiry. That is not a plan, it is a coincidence.",
    result: {
      optimismScore: 76,
      confidence: "medium",
      reasoning: "Lead arranger is engaged but papers remain indicative.",
      recommendation: "Seek a two-week extension on the commitment letter now, not later.",
    },
  },

  // ── Project Suzhou ──
  {
    key: "suzhou_clearance",
    dealKey: "suzhou",
    assumption: "German Phase I clearance will be obtained without remedies.",
    category: "regulatory",
    reviewer: R_PARTNER,
    reviewerNote:
      "Base case accepted. Two competitor submissions raise the probability of an extended Phase I but neither complainant is a customer, which limits their weight.",
    result: {
      optimismScore: 69,
      confidence: "medium",
      reasoning:
        "Combined share is approximately 24% on the narrowest plausible market and below 10% on a wider one. Market definition is the whole question.",
      recommendation: "Prepare a behavioural remedy proposal in advance rather than reactively.",
    },
  },

  // ── Project Ardsley (the deal that was killed) ──
  {
    key: "ardsley_concentration",
    dealKey: "ardsley",
    assumption: "Customer concentration at 52% of revenue is mitigated by contract tenure.",
    category: "revenue_retention",
    reviewer: R_PARTNER,
    reviewerNote:
      "Rejected, and this is why we passed. Tenure is not mitigation when the contracts are terminable on 90 days notice.",
    result: {
      optimismScore: 92,
      confidence: "low",
      reasoning: "Two customers at 52% combined, both on rolling 90-day terms with no minimum volume.",
      recommendation: "Pass.",
    },
  },

  // ── Project Kestrel Retro ──
  {
    key: "kestrel_synergy_realisation",
    dealKey: "kestrel_retro",
    assumption: "Announced synergies of $24.9M will be realised in full by the end of year three.",
    category: "integration",
    reviewer: R_ASSOC,
    reviewerNote:
      "Tracking at 63% at the year-two review. Facility rationalisation has over-delivered; both revenue-linked workstreams are at or below 61%.",
    result: {
      optimismScore: 74,
      confidence: "medium",
      reasoning:
        "Cost synergies with named owners and dated plans are delivering. Revenue synergies are at 22% of case, repeating the Vantage pattern exactly.",
      recommendation:
        "Apply a 25% realisation factor to revenue synergies in all future acquisition cases unless a named customer commitment exists at signing.",
    },
  },

  // ── Project Nordhaven (closed) ──
  {
    key: "nordhaven_exit_multiple",
    dealKey: "nordhaven",
    assumption: "An exit at 8.5x trailing EBITDA is achievable within four years.",
    category: "market",
    reviewer: R_PARTNER,
    reviewerNote: "Achieved. Exited at 8.5x in November 2024.",
    result: {
      optimismScore: 61,
      confidence: "medium",
      reasoning: "Entry at 6.1x into a weak market left genuine multiple headroom on any cycle recovery.",
      recommendation: "Underwrite.",
    },
  },
] satisfies SeedAssumption[]).map((a: SeedAssumption) => a.result && a.reviewerNote ? { ...a, result: { ...a.result, reviewHistory: [{ outcome: "risk_accepted" as const, reason: a.reviewerNote, evidence: "Fictional Thornevale diligence record", reviewedBy: "fixture-reviewer", reviewedAt: "2026-08-01T00:00:00Z" }] } } : a);

/** The assumption that currently locks Anvil's advancement gate: scored above
 *  the red-flag threshold with no reviewer response. Exactly one, because the
 *  gate message is count-sensitive and a corpus where five rows block makes the
 *  singular/plural branch untestable. */
export const ANVIL_BLOCKING_ASSUMPTION_KEYS = ["anvil_margin_2450"] as const;

/**
 * Scored ABOVE the red-flag threshold but answered by a reviewer. These are the
 * rows that prove the gate keys off the response and not the score — a gate
 * that blocked on score alone would make every hard question permanent.
 */
export const HIGH_SCORE_ANSWERED_KEYS = [
  "anvil_sanjiu_alternate",
  "anvil_backlog_visibility",
  "anvil_connect_addback",
  "anvil_working_capital",
  "carve_stranded_cost",
  "verity_price_discipline",
  "ardsley_concentration",
] as const;

/** No result at all — must not block, and must not be treated as a failure. */
export const UNSCORED_ASSUMPTION_KEYS = ["anvil_no_score", "loom_qualification"] as const;

export const NULL_CATEGORY_ASSUMPTION_KEY = "anvil_management_continuity";
export const DUPLICATE_ASSUMPTION_KEYS = [
  "anvil_management_continuity",
  "anvil_management_continuity_dupe",
] as const;

// ─── Scenario snapshots ──────────────────────────────────────────────────────

export interface SeedScenarioCase {
  name: "base" | "upside" | "downside";
  probabilityPct: number;
  narrative: string;
  drivers: { assumption: string; direction: "holds" | "breaks" | "exceeds" }[];
  thesisImpact: string;
  keyMetricDelta?: string;
}

export interface SeedScenario {
  key: string;
  dealKey: string;
  /** Days before the epoch this snapshot was generated. Older snapshots exist
   *  so the "a newer run exists" staleness path has something to detect. */
  ageDays: number;
  assumptionCount: number;
  result: {
    cases: SeedScenarioCase[];
    summary: string;
    watchItems: string[];
  };
}

export const SEED_SCENARIOS: SeedScenario[] = [
  {
    key: "anvil_scenario_v1",
    dealKey: "anvil",
    ageDays: 38,
    assumptionCount: 6,
    result: {
      summary:
        "First pass, run before the quality-of-earnings report landed. Superseded by the run of 12 days ago, but retained because two recommendations are pinned to it.",
      watchItems: [
        "QoE report — due within the fortnight",
        "Torvald volume trend",
        "Covenant step-down date",
      ],
      cases: [
        {
          name: "downside",
          probabilityPct: 25,
          narrative:
            "Margin expansion does not materialise and the group runs at 20-21% through the hold. Braeburn disposal slips past the covenant step-down and an amendment is required.",
          drivers: [
            { assumption: "Adjusted EBITDA margin reaches 24.5% by FY2028", direction: "breaks" },
            { assumption: "Braeburn disposal completes before the FY2026 step-down", direction: "breaks" },
          ],
          thesisImpact: "Returns fall below the fund's hurdle. The deal becomes a hold-for-recovery rather than a value-creation story.",
          keyMetricDelta: "MOIC 1.1-1.3x",
        },
        {
          name: "base",
          probabilityPct: 55,
          narrative:
            "Margin reaches 22.5-23% by FY2028 rather than 24.5%. Braeburn is disposed of at book. Torvald renews with a modest concession.",
          drivers: [
            { assumption: "Adjusted EBITDA margin reaches 24.5% by FY2028", direction: "breaks" },
            { assumption: "Torvald renews on substantially current terms", direction: "holds" },
            { assumption: "Flow aftermarket mix is durable", direction: "holds" },
          ],
          thesisImpact: "The deal clears the hurdle on multiple expansion and modest deleveraging, not on the margin story management is selling.",
          keyMetricDelta: "MOIC 1.7-1.9x",
        },
        {
          name: "upside",
          probabilityPct: 20,
          narrative:
            "The aftermarket franchise is grown as a standalone thesis and Marrow & Pike wins two further platform qualifications.",
          drivers: [
            { assumption: "Flow aftermarket mix is durable", direction: "exceeds" },
            { assumption: "Marrow & Pike qualification pipeline converts", direction: "exceeds" },
          ],
          thesisImpact: "The coatings and aftermarket businesses carry the return and Braeburn becomes irrelevant to the outcome.",
          keyMetricDelta: "MOIC 2.3-2.6x",
        },
      ],
    },
  },
  {
    key: "anvil_scenario_v2",
    dealKey: "anvil",
    ageDays: 12,
    assumptionCount: 11,
    result: {
      summary:
        "Rerun after the quality-of-earnings report. The downside probability rises materially because the QoE moves the starting margin from 22.0% to 18.4%, which changes the base of every forward case rather than just the downside.",
      watchItems: [
        "Working-capital unwind if the factoring programme is not continued (~$60M)",
        "Torvald contract renewal, December 2027 — inside the hold period",
        "Covenant step-down to 3.75x on 2026-12-31 — headroom is -0.19x on current EBITDA",
        "Sanjiu sole-source: no qualified alternate, 14-18 months per part family",
        "Two unit presidents with unexercised change-of-control rights",
      ],
      cases: [
        {
          name: "downside",
          probabilityPct: 40,
          narrative:
            "The QoE base holds and margin runs at 18.5-19.5% through the hold. The covenant step-down requires an amendment at a fee. Torvald renews at a 5% concession and Braeburn does not find a buyer at book. The working-capital programme unwinds at close.",
          drivers: [
            { assumption: "Adjusted EBITDA margin reaches 24.5% by FY2028", direction: "breaks" },
            { assumption: "Working capital is normalised and requires no post-close investment", direction: "breaks" },
            { assumption: "The FY2026 covenant step-down is manageable through Braeburn proceeds", direction: "breaks" },
            { assumption: "The Torvald master supply agreement renews on current terms", direction: "breaks" },
          ],
          thesisImpact:
            "Equity returns fall well below the hurdle. At the QoE's EBITDA the agreed price is 9.6x, which leaves no room for a multiple-driven return.",
          keyMetricDelta: "MOIC 0.9-1.2x",
        },
        {
          name: "base",
          probabilityPct: 45,
          narrative:
            "Margin settles at 20-21% — above the QoE base, below management's case. Braeburn is disposed of at a discount to book but in time for the step-down. Torvald renews with a concession. Aftermarket holds.",
          drivers: [
            { assumption: "Adjusted EBITDA margin reaches 24.5% by FY2028", direction: "breaks" },
            { assumption: "Flow aftermarket mix is durable", direction: "holds" },
            { assumption: "The Torvald master supply agreement renews on current terms", direction: "holds" },
            { assumption: "Braeburn disposal completes before the FY2026 step-down", direction: "holds" },
          ],
          thesisImpact:
            "A workable but unexciting deal at the current price. It clears the hurdle only if the price moves toward the QoE's view of EBITDA.",
          keyMetricDelta: "MOIC 1.5-1.7x",
        },
        {
          name: "upside",
          probabilityPct: 15,
          narrative:
            "Price is renegotiated to reflect the QoE. The aftermarket is separated and grown, Marrow & Pike converts its qualification pipeline, and Braeburn exits early and cleanly.",
          drivers: [
            { assumption: "Flow aftermarket mix is durable", direction: "exceeds" },
            { assumption: "Braeburn disposal completes before the FY2026 step-down", direction: "exceeds" },
          ],
          thesisImpact:
            "The return comes from buying at the right EBITDA and from portfolio surgery, not from the operating plan management presented.",
          keyMetricDelta: "MOIC 2.1-2.4x",
        },
      ],
    },
  },
  {
    key: "carve_scenario_v1",
    dealKey: "anvil_carve",
    ageDays: 20,
    assumptionCount: 2,
    result: {
      summary:
        "The carve-out has one variable that matters. Every case below is really a case about the stranded-cost number.",
      watchItems: ["Stranded cost: seller $6M vs buyer $14M", "TSA scope and duration", "Braeburn voluntary attrition at 19.4%"],
      cases: [
        {
          name: "downside",
          probabilityPct: 45,
          narrative: "Stranded cost lands at $14M and the seller will not fund the differential.",
          drivers: [{ assumption: "Standalone incremental cost is $6M per annum", direction: "breaks" }],
          thesisImpact: "Entry multiple of 17.5x on a declining business. Do not proceed.",
          keyMetricDelta: "Entry 17.5x",
        },
        {
          name: "base",
          probabilityPct: 40,
          narrative: "Stranded cost settles around $10M with a 36-month TSA at cost.",
          drivers: [{ assumption: "Standalone incremental cost is $6M per annum", direction: "breaks" }],
          thesisImpact: "Workable at a price around $120-130M, not at $168M.",
          keyMetricDelta: "Entry 12.8x",
        },
        {
          name: "upside",
          probabilityPct: 15,
          narrative: "The seller funds the differential to get the disposal done before the covenant step-down.",
          drivers: [{ assumption: "Standalone incremental cost is $6M per annum", direction: "holds" }],
          thesisImpact: "The covenant clock is our leverage, and it is the seller's problem more than ours.",
          keyMetricDelta: "Entry 9.6x",
        },
      ],
    },
  },
  {
    key: "verity_scenario_v1",
    dealKey: "verity",
    ageDays: 9,
    assumptionCount: 2,
    result: {
      summary: "A competitive process with a hard exclusivity date and a financing letter expiring two days earlier.",
      watchItems: ["Exclusivity expiry", "Commitment letter expiry", "Second bidder"],
      cases: [
        { name: "downside", probabilityPct: 35, narrative: "Financing slips and exclusivity lapses with the second bidder in the room.", drivers: [{ assumption: "Financing commitment papers will be in place before exclusivity expires", direction: "breaks" }], thesisImpact: "We lose the asset having spent the diligence budget.", keyMetricDelta: "Deal lost" },
        { name: "base", probabilityPct: 50, narrative: "Papers land in time and we sign at EUR 312M.", drivers: [{ assumption: "Financing commitment papers will be in place before exclusivity expires", direction: "holds" }], thesisImpact: "Signed at plan.", keyMetricDelta: "MOIC 1.9x" },
        { name: "upside", probabilityPct: 15, narrative: "The second bidder withdraws and we retrade on the QoE findings.", drivers: [{ assumption: "The second bidder will not go above EUR 320M", direction: "exceeds" }], thesisImpact: "Signed below plan.", keyMetricDelta: "MOIC 2.2x" },
      ],
    },
  },
];

/** Anvil has two snapshots. Anything pinned to v1 must STAY pinned to v1 after
 *  v2 exists — that is the citation-integrity rule the link table enforces. */
export const ANVIL_SUPERSEDED_SCENARIO_KEY = "anvil_scenario_v1";
export const ANVIL_CURRENT_SCENARIO_KEY = "anvil_scenario_v2";

// ─── Recommendations ─────────────────────────────────────────────────────────
// Evidence is expressed as a HANDLE, not an id. The seeder resolves each ref
// into a RecommendationEvidence row once the real serial ids exist.

export type EvidenceRef =
  | { kind: "assumption"; assumptionKey: string; label: string }
  | { kind: "economics"; dealKey: string; label: string }
  | { kind: "scenario"; scenarioKey: string; label: string }
  | { kind: "document_analysis"; documentName: string; analysisKind: string; label: string }
  | { kind: "cultural" | "regulatory" | "synergy" | "ic_memo"; dealKey: string; label: string };

export interface SeedCounterargument {
  point: string;
  weight: "minor" | "material" | "fatal";
  response?: string | null;
}

export interface SeedRecommendation {
  key: string;
  dealKey: string;
  /** The stage the conclusion was reached AT. The gate reads this, and a
   *  recommendation filed against a stage the deal has not entered is a plan,
   *  not a finding. */
  stage: "sourcing" | "evaluation" | "diligence" | "negotiation" | "closing" | "integration";
  claim: string;
  rationale: string;
  evidence: EvidenceRef[];
  counterarguments: SeedCounterargument[];
  confidence: number;
  owner: "ai" | "human";
  status: "draft" | "accepted" | "rejected" | "superseded";
  /** Days from the epoch. Negative = already expired. null = never expires. */
  expiresInDays: number | null;
  /** Handle of the recommendation this one replaces. */
  supersedesKey?: string;
  /** Days before the epoch this row was created. */
  ageDays: number;
}

export const SEED_RECOMMENDATIONS: SeedRecommendation[] = [
  // ── Anvil: the accepted evaluation-stage conclusion that justified entering
  //    diligence. Without this the corpus would describe a stage move the
  //    product says is impossible.
  {
    key: "anvil_proceed_to_dd",
    dealKey: "anvil",
    stage: "evaluation",
    claim:
      "Proceed to confirmatory diligence on Thornevale at an indicative EV of $2,310M, conditional on a quality-of-earnings review of the margin bridge.",
    rationale:
      "The aftermarket franchise at Flow Systems and the qualification moat at Marrow & Pike are genuine and are supported by twenty-five years of segment data through two downturns. Those two units are 54% of revenue and 71% of EBITDA. The rest of the portfolio is a portfolio-surgery problem rather than a reason not to look. The price is defensible on management's numbers; whether management's numbers survive is precisely what diligence is for, which is why this recommendation is conditional rather than clean.",
    evidence: [
      { kind: "assumption", assumptionKey: "anvil_aftermarket_durability", label: "Flow aftermarket mix is durable (optimism 44, high confidence)" },
      { kind: "economics", dealKey: "anvil", label: "EV $2,310M at 8.0x management adjusted EBITDA" },
      { kind: "scenario", scenarioKey: "anvil_scenario_v1", label: "Pre-QoE scenario run: base 55%, downside 25%" },
    ],
    counterarguments: [
      {
        point: "The margin bridge to 24.5% relies on two drivers that have each failed before in this group.",
        weight: "material",
        response:
          "Acknowledged and priced. The recommendation is explicitly conditional on the QoE, and the base case does not underwrite the management margin.",
      },
      {
        point: "Customer concentration at 44.7% top-five is above the fund's normal tolerance.",
        weight: "material",
        response:
          "The largest account is sole-sourced across 41 part numbers with a nineteen-year tenure. We are treating this as a terms risk rather than a loss risk, and have made a customer call a condition to signing.",
      },
    ],
    confidence: 68,
    owner: "human",
    status: "accepted",
    expiresInDays: null,
    ageDays: 84,
  },

  // ── Anvil: the AI-drafted post-QoE conclusion, still a draft. This is what
  //    keeps the diligence → negotiation gate locked.
  {
    key: "anvil_retrade",
    dealKey: "anvil",
    stage: "diligence",
    claim:
      "Retrade to $1,950M or walk. At the quality-of-earnings EBITDA the agreed price is 9.6x, and no scenario in the current run clears the fund's hurdle at that entry.",
    rationale:
      "The quality-of-earnings report moves adjusted EBITDA from $288.8M to $241.6M — a $47.2M gap, of which $30.2M is charges the management accounts do not carry at all rather than add-backs we merely dispute. That is not a negotiating position, it is a different company. At $2,310M the entry multiple on supportable earnings is 9.6x against the 8.0x that was underwritten. The scenario rerun puts 40% probability on a downside case returning 0.9-1.2x. Separately, the sources and uses omits roughly $60M of working-capital unwind if the factoring programme is not continued, and the covenant steps down to 3.75x on 2026-12-31 against -0.19x of headroom on current EBITDA.",
    evidence: [
      { kind: "assumption", assumptionKey: "anvil_margin_2450", label: "Margin reaches 24.5% by FY2028 (optimism 87, unanswered)" },
      { kind: "assumption", assumptionKey: "anvil_working_capital", label: "Working capital is normalised (optimism 83, rejected)" },
      { kind: "assumption", assumptionKey: "anvil_covenant_headroom", label: "Covenant step-down manageable via Braeburn proceeds (optimism 79)" },
      { kind: "scenario", scenarioKey: "anvil_scenario_v2", label: "Post-QoE scenario run: downside 40%, base 45%" },
      { kind: "economics", dealKey: "anvil", label: "EV $2,310M — 9.6x on QoE EBITDA" },
    ],
    counterarguments: [
      {
        point: "A retrade of this size may lose the asset. The seller has stated the price is firm.",
        weight: "material",
        response:
          "The covenant step-down is the seller's problem before it is ours. A vendor who needs a disposal completed before 2026-12-31 has less price flexibility than they are presenting, not more.",
      },
      {
        point: "Some of the QoE charges are estimates and may soften on further work.",
        weight: "minor",
        response:
          "The inventory reserve and warranty accrual are estimates. The lease costs and the restatement run-rate effect are not.",
      },
      {
        point:
          "We have already spent significant diligence budget. Walking now writes that off entirely.",
        weight: "minor",
        response: null,
      },
    ],
    confidence: 74,
    owner: "ai",
    status: "draft",
    expiresInDays: 30,
    ageDays: 6,
  },

  // ── Anvil: superseded pair, so the supersede chain is exercised.
  {
    key: "anvil_braeburn_keep",
    dealKey: "anvil",
    stage: "evaluation",
    claim: "Retain Braeburn Motion Controls and fix it operationally rather than divesting.",
    rationale:
      "A third restructuring, properly resourced, could recover 200-300bps of unit margin and avoid a distressed disposal into a weak market.",
    evidence: [],
    counterarguments: [
      { point: "Two prior restructurings delivered roughly 30% of case each.", weight: "material", response: null },
    ],
    confidence: 41,
    owner: "human",
    status: "superseded",
    expiresInDays: null,
    ageDays: 71,
  },
  {
    key: "anvil_braeburn_divest",
    dealKey: "anvil",
    stage: "evaluation",
    claim:
      "Divest Braeburn Motion Controls within eighteen months of close, and treat the proceeds as covenant relief rather than as return.",
    rationale:
      "Two restructurings totalling $42M have delivered roughly 30% of case each. There is no evidence a third would differ, and the unit's 19.4% voluntary attrition means the carve-out process is already degrading the asset. The covenant step-down makes the timing non-optional.",
    evidence: [
      { kind: "assumption", assumptionKey: "anvil_covenant_headroom", label: "Covenant step-down manageable via Braeburn proceeds" },
    ],
    counterarguments: [
      {
        point: "A forced disposal against a covenant clock is the worst possible negotiating position.",
        weight: "material",
        response:
          "Which is why the disposal should be run before close by the seller, not after close by us. That is a term to negotiate, not a risk to accept.",
      },
    ],
    confidence: 77,
    owner: "human",
    status: "accepted",
    expiresInDays: null,
    supersedesKey: "anvil_braeburn_keep",
    ageDays: 44,
  },

  // ── Anvil: an EXPIRED accepted recommendation. Still readable, no longer
  //    satisfies the gate. This is the row that proves expiry is real.
  {
    key: "anvil_expired_financing",
    dealKey: "anvil",
    stage: "diligence",
    claim: "Financing terms indicated by the lead arranger are achievable at SOFR+400 on 5.5x total leverage.",
    rationale:
      "Indicative terms received from two arrangers were consistent. Given rate movement since, this conclusion has aged out and must be refreshed before it is relied on.",
    evidence: [],
    counterarguments: [],
    confidence: 55,
    owner: "human",
    status: "accepted",
    expiresInDays: -11,
    ageDays: 52,
  },

  // ── Anvil: a rejected recommendation. Outcomes attach to these too, and a
  //    rejected conclusion that turned out right is the highest-signal row in
  //    the whole system.
  {
    key: "anvil_ignore_backlog",
    dealKey: "anvil",
    stage: "diligence",
    claim: "The backlog decline is seasonal noise and should not change the underwriting.",
    rationale: "Q2 is seasonally the weakest quarter for Kestrel project bookings.",
    evidence: [],
    counterarguments: [
      {
        point: "Backlog has fallen in five of the last six quarters, which is not seasonality.",
        weight: "fatal",
        response: null,
      },
    ],
    confidence: 28,
    owner: "ai",
    status: "rejected",
    expiresInDays: null,
    ageDays: 19,
  },

  // ── Carve-out ──
  {
    key: "carve_proceed_conditional",
    dealKey: "anvil_carve",
    stage: "sourcing",
    claim: "Continue evaluating the Braeburn carve-out, but only as a lever in the Anvil negotiation.",
    rationale:
      "As a standalone acquisition the carve-out does not work at the asking price. As a demonstration that a buyer exists for the unit, it materially improves our position on the covenant conversation in the main deal.",
    evidence: [
      { kind: "assumption", assumptionKey: "carve_stranded_cost", label: "Standalone cost $6M (seller) vs $14M (buyer)" },
    ],
    counterarguments: [
      {
        point: "Running a process we do not intend to complete has reputational cost with the seller.",
        weight: "material",
        response: "We would complete it at the right price. $110M is a real number, not a stalking horse.",
      },
    ],
    confidence: 62,
    owner: "human",
    status: "accepted",
    expiresInDays: null,
    ageDays: 33,
  },

  // ── Verity: accepted at negotiation, so the deal is genuinely ready to
  //    advance to closing. The corpus needs at least one deal in that state.
  {
    key: "verity_sign",
    dealKey: "verity",
    stage: "negotiation",
    claim: "Sign at up to EUR 318M, and walk above it.",
    rationale:
      "The asset is a clean fit with Flow Systems and the diligence has produced no material findings. The discipline that matters here is the walk-away, because a competitive process with a hard exclusivity date is exactly the situation in which firms talk themselves upward.",
    evidence: [
      { kind: "assumption", assumptionKey: "verity_price_discipline", label: "Second bidder will not exceed EUR 320M (optimism 81)" },
      { kind: "scenario", scenarioKey: "verity_scenario_v1", label: "Base case 50%, MOIC 1.9x" },
    ],
    counterarguments: [
      {
        point: "The financing commitment letter expires two days before exclusivity.",
        weight: "material",
        response: "An extension has been requested. If it is not granted by the end of next week we should assume we are out.",
      },
    ],
    confidence: 71,
    owner: "human",
    status: "accepted",
    expiresInDays: 21,
    ageDays: 14,
  },

  // ── Suzhou: accepted at closing.
  {
    key: "suzhou_close",
    dealKey: "suzhou",
    stage: "closing",
    claim: "Proceed to closing on Anfeng, accepting the risk of an extended German Phase I.",
    rationale:
      "Combined share is below 10% on any market definition wider than premium-efficiency IE4 motors in the EEA. Two competitor complaints have been made but neither complainant is a customer of either party, which is the weighting the authority normally applies.",
    evidence: [
      { kind: "assumption", assumptionKey: "suzhou_clearance", label: "German Phase I clearance without remedies (optimism 69)" },
      { kind: "regulatory", dealKey: "suzhou", label: "Merger control analysis: three jurisdictions, one live risk" },
    ],
    counterarguments: [
      {
        point: "A Phase II referral pushes closing past the long-stop date.",
        weight: "material",
        response: "A behavioural remedy proposal has been prepared in advance rather than reactively, which is what shortens Phase I.",
      },
    ],
    confidence: 73,
    owner: "human",
    status: "accepted",
    expiresInDays: 45,
    ageDays: 40,
  },

  // ── Ardsley: the killed deal.
  {
    key: "ardsley_pass",
    dealKey: "ardsley",
    stage: "evaluation",
    claim: "Pass on Ardsley. Customer concentration of 52% on 90-day terms is not mitigable at any price we would pay.",
    rationale:
      "Two customers represent 52% of revenue on rolling 90-day terms with no minimum volume. Tenure was offered as mitigation; tenure is not mitigation when either party can leave in a quarter.",
    evidence: [
      { kind: "assumption", assumptionKey: "ardsley_concentration", label: "Concentration mitigated by tenure (optimism 92, rejected)" },
    ],
    counterarguments: [
      {
        point: "The price already reflects the concentration at 7.4x against a sector median of 9.1x.",
        weight: "material",
        response: "A discount for a risk we cannot size is not a discount, it is a lottery ticket.",
      },
    ],
    confidence: 81,
    owner: "human",
    status: "accepted",
    expiresInDays: null,
    ageDays: 210,
  },

  // ── Kestrel Retro / Nordhaven: the historical record that lets the learning
  //    surfaces compute anything at all.
  {
    key: "kestrel_synergy_underwrite",
    dealKey: "kestrel_retro",
    stage: "diligence",
    claim: "Underwrite $24.9M of synergies, of which $5.5M is revenue synergy.",
    rationale: "Procurement and facility consolidation are well evidenced. The cross-sell case follows the Vantage template.",
    evidence: [{ kind: "synergy", dealKey: "kestrel_retro", label: "Synergy plan: $24.9M across four categories" }],
    counterarguments: [
      { point: "Vantage revenue synergy delivered 22% of case on the same logic.", weight: "material", response: null },
    ],
    confidence: 64,
    owner: "human",
    status: "accepted",
    expiresInDays: null,
    ageDays: 700,
  },
  {
    key: "nordhaven_exit_now",
    dealKey: "nordhaven",
    stage: "integration",
    claim: "Exit Nordhaven in FY2024 rather than holding for a fifth year.",
    rationale: "The offshore cycle had recovered enough to support 8.5x. Holding longer risked giving the multiple back.",
    evidence: [
      { kind: "assumption", assumptionKey: "nordhaven_exit_multiple", label: "8.5x exit achievable within four years (optimism 61)" },
      { kind: "economics", dealKey: "nordhaven", label: "Realised: 2.14x MOIC, 21.3% IRR" },
    ],
    counterarguments: [
      { point: "A fifth year would have captured the FY2025 recovery in offshore capex.", weight: "minor", response: "Possibly. We took a certain 8.5x over an uncertain 9.5x." },
    ],
    confidence: 79,
    owner: "human",
    status: "accepted",
    expiresInDays: null,
    ageDays: 300,
  },
  // ── The conclusions that justify the stage each deal is ALREADY at.
  //
  // Added after an integrity check found four deals sitting at stages the
  // recommendation gate says they could not have reached: the gate looks for an
  // accepted, unexpired recommendation recorded at the stage being LEFT, and
  // these deals only carried conclusions filed at the stage they had arrived
  // at. A corpus that describes a history the product forbids is worse than no
  // corpus, because every gate test written against it would be testing a lie.
  {
    key: "verity_proceed_to_negotiation",
    dealKey: "verity",
    stage: "diligence",
    claim: "Conclude diligence on Verity with no material findings and proceed to negotiation.",
    rationale:
      "Quality of earnings supported management's number within 2%. No environmental, tax or litigation findings of substance. The only open risk is process risk — a competitive situation with a hard exclusivity date — which is a negotiation problem rather than a diligence one.",
    evidence: [],
    counterarguments: [
      {
        point: "Diligence was compressed into five weeks to meet the seller's timetable.",
        weight: "minor",
        response: "Scope was prioritised rather than cut. The workstreams that were shortened were the ones with the lowest prior probability of a finding.",
      },
    ],
    confidence: 76,
    owner: "human",
    status: "accepted",
    expiresInDays: null,
    ageDays: 48,
  },
  {
    key: "suzhou_proceed_to_signing",
    dealKey: "suzhou",
    stage: "negotiation",
    claim: "Agree final terms on Anfeng and proceed to signing at $142M.",
    rationale:
      "Terms landed within the authorised range with a satisfactory regulatory-efforts covenant and a long-stop date that accommodates an extended Phase I. The seller conceded on the reverse break fee, which was the point we were least willing to give.",
    evidence: [
      { kind: "assumption", assumptionKey: "suzhou_clearance", label: "German Phase I clearance without remedies (optimism 69)" },
    ],
    counterarguments: [
      {
        point: "The long-stop date does not accommodate a full Phase II.",
        weight: "material",
        response: "Correct, and deliberate. A Phase II referral on this market definition would mean we had misread the case badly enough that walking is the right answer.",
      },
    ],
    confidence: 74,
    owner: "human",
    status: "accepted",
    expiresInDays: null,
    ageDays: 70,
  },
  {
    key: "kestrel_proceed_to_close",
    dealKey: "kestrel_retro",
    stage: "closing",
    claim: "Close the Kestrel acquisition and begin integration on the eight-workstream plan.",
    rationale:
      "All conditions satisfied. Integration leadership appointed and the workstream plan agreed with the target's management before signing rather than after, which is the one process change carried over from the Vantage experience.",
    evidence: [{ kind: "synergy", dealKey: "kestrel_retro", label: "Synergy plan: $24.9M across four categories" }],
    counterarguments: [
      {
        point: "Only three of the eight workstreams have a named owner at close.",
        weight: "material",
        response: null,
      },
    ],
    confidence: 70,
    owner: "human",
    status: "accepted",
    expiresInDays: null,
    ageDays: 645,
  },
  {
    key: "nordhaven_proceed_to_close",
    dealKey: "nordhaven",
    stage: "closing",
    claim: "Close the Nordhaven acquisition at $71M and hold for four years.",
    rationale:
      "Entry at 6.1x into a weak offshore market with a defensible niche position. The thesis is multiple recovery on a cycle turn rather than operational improvement, which sets a shorter hold and a clearer exit trigger than this fund normally underwrites.",
    evidence: [
      { kind: "assumption", assumptionKey: "nordhaven_exit_multiple", label: "8.5x exit achievable within four years (optimism 61)" },
    ],
    counterarguments: [
      {
        point: "A cycle-timing thesis is not a control-equity thesis. If the cycle does not turn there is no second way to win.",
        weight: "material",
        response: "Accepted. Position sized accordingly at 4% of fund rather than the usual 7-8%.",
      },
    ],
    confidence: 66,
    owner: "human",
    status: "accepted",
    expiresInDays: null,
    ageDays: 1_520,
  },
];

export const EXPIRED_RECOMMENDATION_KEY = "anvil_expired_financing";
export const SUPERSEDE_CHAIN_KEYS = ["anvil_braeburn_keep", "anvil_braeburn_divest"] as const;
export const REJECTED_RECOMMENDATION_KEY = "anvil_ignore_backlog";

// ─── Outcome ledgers ─────────────────────────────────────────────────────────
// Append-only, many per subject. The trajectory is the signal — being wrong at
// thirty days and right at six months is exactly what a failure-pattern
// detector reads, so several of these deliberately change verdict over time.

export type OutcomeTypeKey = "held" | "partially_held" | "contradicted" | "too_early" | "moot";
export type OutcomeHorizonKey = "30_day" | "90_day" | "6_month" | "post_close" | "ad_hoc";

export interface SeedOutcome {
  /** Handle of the recommendation or assumption this reads on. */
  subjectKey: string;
  outcomeType: OutcomeTypeKey;
  outcomeSummary: string;
  horizon: OutcomeHorizonKey | null;
  /** Days before the epoch the READING was taken (not when it was filed). */
  recordedDaysAgo: number;
}

export const SEED_RECOMMENDATION_OUTCOMES: SeedOutcome[] = [
  // Nordhaven — the full trajectory of a conclusion that came good.
  { subjectKey: "nordhaven_exit_now", outcomeType: "too_early", outcomeSummary: "Process launched. Two indicative offers received, both below 8.0x. Too early to judge the timing call.", horizon: "30_day", recordedDaysAgo: 380 },
  { subjectKey: "nordhaven_exit_now", outcomeType: "partially_held", outcomeSummary: "Best and final at 8.3x. The 8.5x thesis is close but not proven, and the process took two months longer than planned.", horizon: "90_day", recordedDaysAgo: 330 },
  { subjectKey: "nordhaven_exit_now", outcomeType: "held", outcomeSummary: "Completed at 8.5x on a final push. Realised 2.14x MOIC and 21.3% IRR against an underwritten 2.11x. The timing call was right.", horizon: "6_month", recordedDaysAgo: 279 },
  { subjectKey: "nordhaven_exit_now", outcomeType: "held", outcomeSummary: "Offshore multiples softened 0.6x in the two quarters after our exit. Holding for a fifth year would have cost roughly $6M of proceeds.", horizon: "post_close", recordedDaysAgo: 120 },

  // Kestrel Retro — a conclusion that has been steadily contradicted.
  { subjectKey: "kestrel_synergy_underwrite", outcomeType: "too_early", outcomeSummary: "Day-100 review: three of eight workstreams behind plan, none yet quantifiable.", horizon: "30_day", recordedDaysAgo: 540 },
  { subjectKey: "kestrel_synergy_underwrite", outcomeType: "partially_held", outcomeSummary: "Year-one: cost synergies at 78% of plan, revenue synergies at 14%. The split is exactly as the counterargument predicted.", horizon: "90_day", recordedDaysAgo: 340 },
  { subjectKey: "kestrel_synergy_underwrite", outcomeType: "contradicted", outcomeSummary: "Year-two: total realisation 63% of plan. Revenue synergy at 22% of case — identical to Vantage. The counterargument was correct and was overruled.", horizon: "6_month", recordedDaysAgo: 30 },

  // Ardsley — the pass, vindicated.
  { subjectKey: "ardsley_pass", outcomeType: "too_early", outcomeSummary: "Asset sold to a competing buyer at 7.4x. No basis yet to judge whether passing was right.", horizon: "90_day", recordedDaysAgo: 150 },
  { subjectKey: "ardsley_pass", outcomeType: "held", outcomeSummary: "The larger of the two concentrated customers moved 60% of its volume to an in-house programme fourteen months after the sale. The acquirer has written down the asset.", horizon: "6_month", recordedDaysAgo: 45 },

  // Anvil — the rejected recommendation that turned out to be wrong to reject
  // is NOT what happened here; the rejection was correct, and recording that is
  // just as valuable.
  { subjectKey: "anvil_ignore_backlog", outcomeType: "contradicted", outcomeSummary: "Backlog fell a further 2.0% in the following quarter. The seasonality explanation does not survive a sixth consecutive decline. Rejecting this was correct.", horizon: "30_day", recordedDaysAgo: 4 },

  // Anvil — the accepted evaluation conclusion, read after the QoE landed.
  { subjectKey: "anvil_proceed_to_dd", outcomeType: "partially_held", outcomeSummary: "Proceeding to diligence was right; the conditionality on the QoE was the part that mattered and it earned its keep. The indicative price did not survive.", horizon: "90_day", recordedDaysAgo: 8 },

  // Anvil — the Braeburn divestiture conclusion, still open.
  { subjectKey: "anvil_braeburn_divest", outcomeType: "too_early", outcomeSummary: "No disposal process launched by the seller. The covenant clock has not yet forced the issue.", horizon: "30_day", recordedDaysAgo: 14 },
];

export const SEED_ASSUMPTION_OUTCOMES: SeedOutcome[] = [
  { subjectKey: "kestrel_synergy_realisation", outcomeType: "contradicted", outcomeSummary: "63% realisation at the year-two review. The assumption of full realisation by year three is not recoverable from here.", horizon: "6_month", recordedDaysAgo: 30 },
  { subjectKey: "kestrel_synergy_realisation", outcomeType: "partially_held", outcomeSummary: "Cost workstreams delivered. Only the revenue-linked ones failed, which is a narrower failure than the headline number suggests.", horizon: "post_close", recordedDaysAgo: 12 },
  { subjectKey: "nordhaven_exit_multiple", outcomeType: "held", outcomeSummary: "Exited at exactly 8.5x.", horizon: "post_close", recordedDaysAgo: 279 },
  { subjectKey: "ardsley_concentration", outcomeType: "contradicted", outcomeSummary: "Tenure provided no protection. The larger customer moved 60% of volume in-house fourteen months later.", horizon: "6_month", recordedDaysAgo: 45 },
  { subjectKey: "anvil_backlog_visibility", outcomeType: "contradicted", outcomeSummary: "Backlog fell a further 2.0%. Visibility claim not supported.", horizon: "30_day", recordedDaysAgo: 4 },
  { subjectKey: "anvil_connect_addback", outcomeType: "held", outcomeSummary: "The QoE declined the add-back on exactly the grounds recorded here.", horizon: "30_day", recordedDaysAgo: 9 },
  { subjectKey: "anvil_working_capital", outcomeType: "held", outcomeSummary: "Confirmed in the QoE. The reported DSO improvement is the factoring programme.", horizon: "30_day", recordedDaysAgo: 9 },
  { subjectKey: "anvil_torvald_renewal", outcomeType: "too_early", outcomeSummary: "Customer call requested but not yet scheduled.", horizon: "30_day", recordedDaysAgo: 5 },
  { subjectKey: "anvil_sanjiu_alternate", outcomeType: "contradicted", outcomeSummary: "Procurement confirmed 14-18 months per part family across four families. The 12-month figure has no basis.", horizon: "ad_hoc", recordedDaysAgo: 16 },
  { subjectKey: "carve_stranded_cost", outcomeType: "too_early", outcomeSummary: "Seller has not moved off $6M. No independent standalone-cost study commissioned yet.", horizon: "30_day", recordedDaysAgo: 11 },
  { subjectKey: "anvil_aftermarket_durability", outcomeType: "held", outcomeSummary: "Aftermarket revenue held at 44% of Flow revenue through FY2026-Q2 despite the group-level revenue decline.", horizon: "90_day", recordedDaysAgo: 3 },
  { subjectKey: "verity_financing_timing", outcomeType: "too_early", outcomeSummary: "Extension requested from the lead arranger. No response.", horizon: "ad_hoc", recordedDaysAgo: 2 },
];

// ─── Scenario links ──────────────────────────────────────────────────────────
// A claim, and the range it was drawn against. Links point at a SPECIFIC
// snapshot: two of these deliberately point at Anvil's SUPERSEDED run, because
// a citation that silently follows a regeneration is not a citation, and that
// is the behaviour the link table exists to guarantee.

export interface SeedScenarioLink {
  recommendationKey: string;
  scenarioKey: string;
  caseName: "all" | "base" | "upside" | "downside";
  relation: "supports" | "assumes" | "relevant_if_false" | "stress_case" | "contradicted_by";
  note?: string;
}

export const SEED_SCENARIO_LINKS: SeedScenarioLink[] = [
  {
    recommendationKey: "anvil_proceed_to_dd",
    scenarioKey: "anvil_scenario_v1",
    caseName: "base",
    relation: "assumes",
    note: "Pinned to the PRE-QoE run. A newer snapshot exists and says something materially different; that is the point of the pin, not a defect in it.",
  },
  {
    recommendationKey: "anvil_proceed_to_dd",
    scenarioKey: "anvil_scenario_v1",
    caseName: "downside",
    relation: "stress_case",
    note: "The 25% downside the recommendation was written to survive.",
  },
  {
    recommendationKey: "anvil_retrade",
    scenarioKey: "anvil_scenario_v2",
    caseName: "downside",
    relation: "supports",
    note: "The 40% downside is the core of the retrade argument.",
  },
  {
    recommendationKey: "anvil_retrade",
    scenarioKey: "anvil_scenario_v2",
    caseName: "upside",
    relation: "relevant_if_false",
    note: "If the retrade is wrong, this is the case in which paying 9.6x still works.",
  },
  {
    recommendationKey: "anvil_braeburn_divest",
    scenarioKey: "anvil_scenario_v2",
    caseName: "all",
    relation: "supports",
  },
  {
    recommendationKey: "verity_sign",
    scenarioKey: "verity_scenario_v1",
    caseName: "base",
    relation: "assumes",
  },
  {
    recommendationKey: "verity_sign",
    scenarioKey: "verity_scenario_v1",
    caseName: "downside",
    relation: "relevant_if_false",
    note: "Financing slips and we lose the asset having spent the budget.",
  },
  {
    recommendationKey: "carve_proceed_conditional",
    scenarioKey: "carve_scenario_v1",
    caseName: "downside",
    relation: "contradicted_by",
    note: "The 45% downside argues against continuing at all. Recorded rather than suppressed.",
  },
];

/** Links deliberately pinned to a snapshot that has since been superseded. */
export const STALE_SCENARIO_LINK_RECOMMENDATION = "anvil_proceed_to_dd";

// ─── Decision log ────────────────────────────────────────────────────────────
// Append-only. Every stage the deals have reached has a decision behind it,
// because in this product a forward stage move that did not go through
// decisions.record is not supposed to exist.

export interface SeedDecision {
  dealKey: string;
  decisionType: "advance" | "hold" | "pass" | "approve_loi" | "approve_binding" | "kill" | "other";
  fromStage: string | null;
  toStage: string | null;
  rationale: string;
  outcome: { votesFor?: number; votesAgainst?: number; abstain?: number; conditions?: string[] } | null;
  ageDays: number;
}

export const SEED_DECISIONS: SeedDecision[] = [
  {
    dealKey: "anvil",
    decisionType: "advance",
    fromStage: "sourcing",
    toStage: "evaluation",
    rationale:
      "Adviser approach received. The asset is larger than our normal range but the aftermarket and coatings franchises justify the work of a first look. Two partners to spend a week on it before we commit further resource.",
    outcome: null,
    ageDays: 132,
  },
  {
    dealKey: "anvil",
    decisionType: "advance",
    fromStage: "evaluation",
    toStage: "diligence",
    rationale:
      "Proceed to confirmatory diligence at an indicative $2,310M, conditional on a quality-of-earnings review of the margin bridge and a customer reference call with Torvald. The margin story is the entire equity case and none of us believes it yet; the purpose of this phase is to find out whether it survives contact with the numbers.",
    outcome: {
      votesFor: 4,
      votesAgainst: 1,
      abstain: 0,
      conditions: [
        "Quality-of-earnings review of the FY2025 margin bridge before any binding offer",
        "Customer reference call with Torvald Agritech",
        "Standalone-cost study for Braeburn",
        "Diligence budget capped at $1.4M",
      ],
    },
    ageDays: 84,
  },
  {
    dealKey: "anvil",
    decisionType: "hold",
    fromStage: "diligence",
    toStage: "diligence",
    rationale:
      "The quality-of-earnings report supports $241.6M against management's $288.8M. That is a different company from the one we agreed a price on, and $30.2M of the gap is charges the management accounts do not carry at all. We are not advancing to a binding offer until the price reflects it. Hold, retrade at $1,950M, and be genuinely prepared to walk.",
    outcome: {
      votesFor: 5,
      votesAgainst: 0,
      abstain: 0,
      conditions: [
        "Retrade to $1,950M or walk",
        "Working-capital unwind of ~$60M to be added to uses or funded by the seller",
        "Covenant amendment fee to be modelled before any revised offer",
      ],
    },
    ageDays: 5,
  },
  {
    dealKey: "anvil_carve",
    decisionType: "advance",
    fromStage: "sourcing",
    toStage: "evaluation",
    rationale:
      "Worth evaluating on its own merits and worth more as a demonstration that a buyer for Braeburn exists. Both purposes are legitimate; the second should be stated openly in the file rather than left as an unrecorded motive.",
    outcome: null,
    ageDays: 33,
  },
  {
    dealKey: "ardsley",
    decisionType: "advance",
    fromStage: "sourcing",
    toStage: "evaluation",
    rationale: "Attractive sector position at an apparent discount to the sector median. Worth a first look.",
    outcome: null,
    ageDays: 240,
  },
  {
    dealKey: "ardsley",
    decisionType: "kill",
    fromStage: "evaluation",
    toStage: null,
    rationale:
      "Pass. Two customers at 52% of revenue on rolling 90-day terms with no minimum volume. Tenure was offered as mitigation and tenure is not mitigation when either side can leave in a quarter. The 7.4x entry against a 9.1x sector median is a discount for a risk we cannot size, which is not a discount at all.",
    outcome: { votesFor: 5, votesAgainst: 0, abstain: 0 },
    ageDays: 204,
  },
  {
    dealKey: "verity",
    decisionType: "advance",
    fromStage: "diligence",
    toStage: "negotiation",
    rationale:
      "Diligence closed with no material findings. Proceed to negotiation with a walk-away at EUR 318M, agreed and recorded now precisely so that it is harder to move later.",
    outcome: { votesFor: 5, votesAgainst: 0, abstain: 0, conditions: ["Walk-away at EUR 318M", "Financing commitment extension before exclusivity expiry"] },
    ageDays: 48,
  },
  {
    dealKey: "suzhou",
    decisionType: "approve_binding",
    fromStage: "negotiation",
    toStage: "closing",
    rationale:
      "Final terms within the authorised range. Reverse break fee conceded by the seller. Long-stop date accommodates an extended Phase I but not a full Phase II, which is a deliberate choice: a Phase II referral would mean we had misread the market definition badly enough that walking is right.",
    outcome: { votesFor: 6, votesAgainst: 0, abstain: 1 },
    ageDays: 63,
  },
  {
    dealKey: "kestrel_retro",
    decisionType: "advance",
    fromStage: "closing",
    toStage: "integration",
    rationale:
      "Conditions satisfied. Integration leadership appointed and the eight-workstream plan agreed with target management before signing rather than after — the one process change carried forward from Vantage.",
    outcome: { votesFor: 7, votesAgainst: 0, abstain: 0 },
    ageDays: 640,
  },
  {
    dealKey: "nordhaven",
    decisionType: "advance",
    fromStage: "closing",
    toStage: "integration",
    rationale: "Closed at $71M, 6.1x trailing. Cycle-recovery thesis with a four-year hold and a stated exit trigger at 8.5x.",
    outcome: { votesFor: 6, votesAgainst: 1, abstain: 0 },
    ageDays: 1_505,
  },
  {
    dealKey: "nordhaven",
    decisionType: "other",
    fromStage: "integration",
    toStage: "integration",
    rationale:
      "Exit approved and completed at 8.5x. Realised 2.14x MOIC and 21.3% IRR against an underwritten 2.11x. Recording this here so the outcome sits in the same log as the decision that produced it.",
    outcome: { votesFor: 7, votesAgainst: 0, abstain: 0 },
    ageDays: 279,
  },
];

// ─── Diligence tracker ───────────────────────────────────────────────────────
// The twelve standard items come from DD_CHECKLIST_ITEMS and are seeded through
// the app's own dd.seed procedure, so only the DEVIATIONS live here: statuses a
// human has set, notes, and the non-standard items this deal added.

export interface SeedDdOverride {
  dealKey: string;
  item: string;
  status: "open" | "requested" | "received" | "reviewed" | "issue" | "n_a";
  workstream: "legal" | "financial" | "tax" | "hr" | "it" | "commercial" | "regulatory" | "other";
  note: string | null;
  isStandard: boolean;
  /** True once a human has ruled on it. An AI import may then append a note but
   *  may never restatus it — the linchpin of the merge rule. */
  manuallySet: boolean;
}

export const SEED_DD_OVERRIDES: SeedDdOverride[] = [
  { dealKey: "anvil", item: "Financial statements (3 years)", status: "issue", workstream: "financial", note: "FY2025 Q3 restated. FY2012 segment disclosure missing entirely and cannot be reconstructed.", isStandard: true, manuallySet: true },
  { dealKey: "anvil", item: "Material contracts", status: "issue", workstream: "legal", note: "Four change-of-control consents required. Full Sanjiu and Brand & Quill agreements still not provided — extracts only.", isStandard: true, manuallySet: true },
  { dealKey: "anvil", item: "Change-of-control / consent requirements", status: "issue", workstream: "legal", note: "Brand & Quill, Sanjiu, Monterrey landlord, Term Loan B agent. None obtained.", isStandard: true, manuallySet: true },
  { dealKey: "anvil", item: "Tax filings & liabilities", status: "reviewed", workstream: "tax", note: "Transfer pricing not benchmarked since 2019; Suzhou margin above the supported range. Section 382 limitation unmodelled.", isStandard: true, manuallySet: true },
  { dealKey: "anvil", item: "Environmental liabilities", status: "issue", workstream: "regulatory", note: "Toledo solvent remediation, ~$6.8M remaining. Vendor indemnity expired 2011.", isStandard: true, manuallySet: true },
  { dealKey: "anvil", item: "Employment agreements & benefits", status: "reviewed", workstream: "hr", note: "Two unit presidents hold change-of-control rights; neither has signed retention.", isStandard: true, manuallySet: true },
  { dealKey: "anvil", item: "Corporate structure & cap table", status: "reviewed", workstream: "legal", note: null, isStandard: true, manuallySet: true },
  { dealKey: "anvil", item: "Litigation & disputes history", status: "reviewed", workstream: "legal", note: "Eleven open matters, $4.2M reserved against $19.8M claimed. None individually material.", isStandard: true, manuallySet: true },
  { dealKey: "anvil", item: "IP ownership & licenses", status: "received", workstream: "legal", note: null, isStandard: true, manuallySet: false },
  { dealKey: "anvil", item: "Real property & leases", status: "received", workstream: "legal", note: "Monterrey lease carries a change-of-control consent.", isStandard: true, manuallySet: true },
  { dealKey: "anvil", item: "Insurance policies", status: "received", workstream: "other", note: "No R&W policy placed. Expect exclusions around the restatement.", isStandard: true, manuallySet: true },
  { dealKey: "anvil", item: "Regulatory & compliance filings", status: "requested", workstream: "regulatory", note: null, isStandard: true, manuallySet: false },
  // Non-standard items this deal added.
  { dealKey: "anvil", item: "Quality of earnings — margin bridge", status: "issue", workstream: "financial", note: "$47.2M gap to management. $30.2M is charges, not disputed add-backs.", isStandard: false, manuallySet: true },
  { dealKey: "anvil", item: "Sole-source supplier requalification study", status: "open", workstream: "commercial", note: "No qualified alternate for Sanjiu castings. 14-18 months per part family across four families.", isStandard: false, manuallySet: true },
  { dealKey: "anvil", item: "Working capital — factoring programme unwind", status: "issue", workstream: "financial", note: "~$60M not reflected in the seller's sources and uses.", isStandard: false, manuallySet: true },
  { dealKey: "anvil", item: "Braeburn standalone cost study", status: "requested", workstream: "financial", note: "Seller has not commissioned one. Ours estimates $14M against their $6M.", isStandard: false, manuallySet: true },
  { dealKey: "anvil", item: "ERP consolidation cost estimate", status: "open", workstream: "it", note: "Three instances plus Vantage on spreadsheets.", isStandard: false, manuallySet: false },
  { dealKey: "anvil", item: "Torvald customer reference call", status: "requested", workstream: "commercial", note: "Condition of the evaluation-stage decision. Not yet scheduled.", isStandard: false, manuallySet: true },

  { dealKey: "anvil_carve", item: "Financial statements (3 years)", status: "issue", workstream: "financial", note: "Carve-out P&L only. No audited standalone accounts exist.", isStandard: true, manuallySet: true },
  { dealKey: "anvil_carve", item: "Corporate structure & cap table", status: "n_a", workstream: "legal", note: "Asset purchase; no entity being acquired.", isStandard: true, manuallySet: true },
  { dealKey: "anvil_carve", item: "TSA scope and pricing", status: "open", workstream: "other", note: "The whole deal turns on this.", isStandard: false, manuallySet: true },

  { dealKey: "suzhou", item: "Regulatory & compliance filings", status: "reviewed", workstream: "regulatory", note: "HSR, Bundeskartellamt and SAMR all filed. German Phase I decision pending.", isStandard: true, manuallySet: true },
  { dealKey: "verity", item: "Financial statements (3 years)", status: "reviewed", workstream: "financial", note: "QoE supported management within 2%.", isStandard: true, manuallySet: true },
];

// ─── Deal comments ───────────────────────────────────────────────────────────

export interface SeedComment {
  dealKey: string;
  /** Which seeded user wrote it. */
  author: "partner" | "associate";
  body: string;
  ageDays: number;
  edited?: boolean;
}

export const SEED_COMMENTS: SeedComment[] = [
  { dealKey: "anvil", author: "associate", body: "QoE landed. The bridge is worse than we modelled — $47.2M, and $30.2M of it is charges the management accounts don't carry at all rather than add-backs we're arguing about. Posting the summary in the data room now.", ageDays: 9 },
  { dealKey: "anvil", author: "partner", body: "That changes the price, not the thesis. The aftermarket and coatings franchises are still real. Let's separate those two conversations before Thursday.", ageDays: 9 },
  { dealKey: "anvil", author: "associate", body: "Agreed. I've reworked the scenario run off the QoE base — downside goes from 25% to 40%, mostly because it moves the starting point for every case rather than just the bad one.", ageDays: 8 },
  { dealKey: "anvil", author: "partner", body: "Worth noting the management pack in the data room still shows the pre-restatement Q3 number. The CFO memo says it should have been updated. Four months later it hasn't been. That's a disclosure-quality data point in its own right.", ageDays: 7, edited: true },
  { dealKey: "anvil", author: "associate", body: "Also flagging: the backlog 'record' claim includes a $94M framework option that has never been exercised. Backlog ex-option is at a four-year low.", ageDays: 7 },
  { dealKey: "anvil", author: "partner", body: "Add both to the IC paper under disclosure quality. Individually they're small; together they're a pattern about how this team presents.", ageDays: 6 },
  { dealKey: "anvil", author: "associate", body: "Retrade recommendation drafted at $1,950M. Left it as a draft — I don't think it's mine to accept.", ageDays: 6 },
  { dealKey: "anvil", author: "partner", body: "Correct call. We'll take it at Thursday's IC. Before then I want the covenant amendment fee modelled — if we're wrong about Braeburn disposal proceeds the step-down is a problem in fifteen months, not five years.", ageDays: 5 },
  { dealKey: "anvil", author: "associate", body: "Modelled. 25-50bps on the term loan plus a 50bp margin step-up is the market read. Roughly $4.8M up front and $4.6M a year.", ageDays: 4 },
  { dealKey: "anvil", author: "partner", body: "The margin assumption is still sitting unanswered in the ledger at 87. Someone needs to write the second review or we can't advance even if we want to.", ageDays: 3 },
  { dealKey: "anvil", author: "associate", body: "I'd rather leave it unanswered than write something I don't believe. The honest answer is that I can't reconcile 24.5% with this group's own realisation history.", ageDays: 3 },
  { dealKey: "anvil", author: "partner", body: "Then that's the review. Write that.", ageDays: 2 },

  { dealKey: "anvil_carve", author: "partner", body: "The stranded-cost gap is the whole deal. $6M vs $14M is the difference between 9.6x and 17.5x.", ageDays: 20 },
  { dealKey: "anvil_carve", author: "associate", body: "Seller won't commission an independent study. That reluctance is itself informative.", ageDays: 18 },
  { dealKey: "anvil_carve", author: "partner", body: "Keep it alive. Its value to us in the main negotiation exceeds its value as a standalone acquisition, and we should be honest in the file that that's why.", ageDays: 17 },

  { dealKey: "verity", author: "associate", body: "Commitment letter expires two days before exclusivity. Extension requested, no response yet.", ageDays: 4 },
  { dealKey: "verity", author: "partner", body: "Chase daily. If we don't have it by Friday we should assume we're out and stop spending.", ageDays: 3 },
  { dealKey: "verity", author: "associate", body: "Walk-away is recorded at EUR 318M. Putting it in writing now so it's harder to move at 11pm on signing night.", ageDays: 14 },

  { dealKey: "suzhou", author: "partner", body: "Two competitor submissions to the Bundeskartellamt. Neither is a customer, which limits the weight, but it raises the odds of an extended Phase I.", ageDays: 12 },
  { dealKey: "suzhou", author: "associate", body: "Behavioural remedy proposal drafted in advance. Better to have it and not need it.", ageDays: 10 },

  { dealKey: "kestrel_retro", author: "associate", body: "Year-two synergy review: 63% of plan. Every workstream with a named owner and a dated plan delivered. Neither revenue workstream did.", ageDays: 30 },
  { dealKey: "kestrel_retro", author: "partner", body: "Third time we've underwritten revenue synergy in this group and the third time it's come in around a quarter of case. That's not luck, it's a policy problem. Proposing a 25% realisation factor as standing policy unless there's a named customer commitment at signing.", ageDays: 29 },

  { dealKey: "ardsley", author: "partner", body: "Buyer has written the asset down. The larger concentrated customer moved 60% of volume in-house fourteen months after they closed. Recording it against our pass so the next person sees why we walked.", ageDays: 45 },

  { dealKey: "nordhaven", author: "partner", body: "Exited at 8.5x, 2.14x MOIC, 21.3% IRR. Multiples softened 0.6x in the two quarters after. The timing call was right and it was closer than it looked at the time.", ageDays: 279 },

  { dealKey: "loom", author: "associate", body: "Initial approach only. Nothing in the data room yet.", ageDays: 2 },
];

// ─── Synergy plan ────────────────────────────────────────────────────────────
// Quarterly phasing present, which is what makes this the only deal that
// exercises the period logic — an unphased plan takes a different code path.

export interface SeedSynergyPeriod {
  quarter: string;
  planned: number;
  actual: number;
}

export interface SeedSynergyCategory {
  category: string;
  planned: number;
  actual: number;
  periods?: SeedSynergyPeriod[];
}

const QUARTERS = ["2024-Q3", "2024-Q4", "2025-Q1", "2025-Q2", "2025-Q3", "2025-Q4", "2026-Q1", "2026-Q2"];

/**
 * Spread a total across the eight quarters on a ramp shape, then DERIVE the
 * category totals back off the rounded periods.
 *
 * Deriving rather than asserting is not tidiness. The schema is explicit that
 * when `periods` are present they are authoritative and `planned`/`actual` are
 * server-derived sums — so a fixture that carried its own totals alongside its
 * own periods would disagree with itself as soon as per-quarter rounding
 * accumulated, and it did: cross-selling summed to 5.7 against a stated 5.5.
 * There is one number here, and the periods are it.
 */
function phased(
  category: string,
  plannedTotal: number,
  actualTotal: number,
  shape: number[],
): SeedSynergyCategory {
  const shapeSum = shape.reduce((a, b) => a + b, 0);
  const periods: SeedSynergyPeriod[] = QUARTERS.map((q, i) => ({
    quarter: q,
    planned: Math.round(((plannedTotal * shape[i]) / shapeSum) * 10) / 10,
    actual: Math.round(((actualTotal * shape[i]) / shapeSum) * 10) / 10,
  }));
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    category,
    planned: round1(periods.reduce((n, x) => n + x.planned, 0)),
    actual: round1(periods.reduce((n, x) => n + x.actual, 0)),
    periods,
  };
}

export const SEED_SYNERGY_CATEGORIES: SeedSynergyCategory[] = [
  phased("Procurement consolidation", 8.4, 5.1, [0.4, 0.8, 1.1, 1.3, 1.4, 1.6, 1.7, 1.7]),
  phased("Facility rationalisation", 6.2, 6.6, [0.2, 0.5, 0.9, 1.2, 1.4, 1.6, 1.7, 1.8]),
  phased("Overhead reduction", 4.8, 2.9, [0.5, 0.9, 1.1, 1.2, 1.3, 1.3, 1.4, 1.4]),
  phased("Cross-selling revenue synergy", 5.5, 1.2, [0.1, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1]),
];

/** Realisation against plan, derived. The number the Synergy Reality Engine
 *  exists to make unavoidable. */
export const SYNERGY_REALISATION_PCT =
  Math.round(
    (SEED_SYNERGY_CATEGORIES.reduce((n, c) => n + c.actual, 0) /
      SEED_SYNERGY_CATEGORIES.reduce((n, c) => n + c.planned, 0)) *
      1000,
  ) / 10;

// ─── Persisted AI results ────────────────────────────────────────────────────
// Cultural, regulatory and IC-memo rows are stored as jsonb `result` blobs by
// the AI router. Seeding them directly with hand-authored content rather than
// letting mock mode generate them is deliberate: the retained corpus is meant
// to be READ by a person afterwards, and "[mock] Placeholder" on every panel
// would make the whole dataset useless for that. The mock provider still gets
// exercised — the integration tests call the real ai.* procedures against
// scratch deals and assert on what comes back.

export interface SeedCulturalScore {
  dealKey: string;
  acquirer: string;
  target: string;
  sector: string;
  result: Record<string, unknown>;
}

export const SEED_CULTURAL_SCORES: SeedCulturalScore[] = [
  {
    dealKey: "anvil",
    acquirer: "Thornevale Diligence Sandbox",
    target: "Thornevale Industrial Group",
    sector: "Industrials & Manufacturing",
    result: {
      overallScore: 58,
      confidence: "medium",
      summary:
        "A family-founded engineering culture with genuine operating pride and a marked reluctance to describe its own failures accurately. The gap between what the record shows and what management says about the record is the integration risk, more than any conventional culture-fit dimension.",
      dimensions: [
        { dimension: "Decision-making", acquirerTrait: "Evidence-led, written, contested", targetTrait: "Consensus-led, verbal, deferential to the founder", score: 44, risk: "high", note: "Board minutes show a 2007 dissent recorded and then never revisited when the acquisition underperformed. Challenge is permitted but not followed through." },
        { dimension: "Transparency", acquirerTrait: "Bad news travels fast and unedited", targetTrait: "Bad news is reframed before it travels", score: 38, risk: "high", note: "The Connect programme is described externally as concluded on schedule; it ran a year short at 136% of budget. The same pattern appears in the Nordhaven characterisation and the backlog claim." },
        { dimension: "Operating rigour", acquirerTrait: "Named owner, dated plan, monthly review", targetTrait: "Strong in engineering, weak in programme management", score: 71, risk: "medium", note: "Facility rationalisation delivered because it had an owner and a plan. Every workstream that lacked both under-delivered." },
        { dimension: "Talent and retention", acquirerTrait: "Retention agreements before signing", targetTrait: "Long tenure, thin succession", score: 62, risk: "medium", note: "COO seat empty for over a year. Braeburn attrition at 19.4%." },
        { dimension: "Customer orientation", acquirerTrait: "Portfolio view", targetTrait: "Deep, personal, account-level relationships", score: 79, risk: "low", note: "This is a genuine strength and should be preserved rather than systematised away." },
      ],
      redFlags: [
        "A consistent pattern of describing past failures more favourably than the record supports, across four separate documents and two decades.",
        "Challenge is recorded in the governance process but does not change outcomes.",
        "No functioning programme-management discipline outside engineering.",
      ],
      recommendations: [
        "Make the first 90 days about establishing that revised forecasts are rewarded rather than punished. The reframing habit is a response to something.",
        "Install programme management as a capability before attempting any synergy delivery.",
        "Preserve the account-level customer relationships explicitly; they are the most valuable cultural asset here.",
      ],
    },
  },
];

export interface SeedRegulatoryAnalysis {
  dealKey: string;
  target: string;
  sector: string;
  geography: string;
  combinedMarketShare: string;
  result: Record<string, unknown>;
}

export const SEED_REGULATORY_ANALYSES: SeedRegulatoryAnalysis[] = [
  {
    dealKey: "suzhou",
    target: "Anfeng Motion Technologies",
    sector: "Industrials & Manufacturing",
    geography: "United States, Germany, China",
    combinedMarketShare: "24%",
    result: {
      overallRisk: "medium",
      clearanceProbability: 72,
      summary:
        "Market definition is the entire question. On the narrowest plausible market — premium-efficiency IE4 motors in the EEA — combined share is approximately 24%. On any wider motion-control definition it is below 10%. Clearance without remedies is the base case; an extended Phase I is the realistic downside.",
      jurisdictions: [
        { jurisdiction: "United States (HSR)", status: "filed", risk: "low", note: "Waiting period expected to expire without extension. No overlap of substance in North America." },
        { jurisdiction: "Germany (Bundeskartellamt)", status: "filed", risk: "medium", note: "The live risk. Two competitor submissions received. Phase I decision due within three weeks; a Phase II referral would push closing past the long-stop date." },
        { jurisdiction: "China (SAMR)", status: "filed", risk: "low", note: "Filed nine days after the others. Simplified procedure expected." },
      ],
      theories: [
        { theory: "Horizontal overlap in premium-efficiency industrial motors (EEA)", likelihood: "medium", note: "Turns entirely on whether IE4 constitutes a separate product market. The parties' internal documents treat IE3 and IE4 as substitutable, which helps." },
        { theory: "Foreclosure of downstream drive integrators", likelihood: "low", note: "Neither complainant is a customer, which is the weighting the authority normally applies to this kind of submission." },
      ],
      remedies: [
        "Behavioural: supply-terms undertaking to two named OEMs for three years. Prepared in advance.",
        "Structural: divestiture of the Suzhou IE4 line. Would make the transaction uneconomic and should be treated as a walk trigger, not a fallback.",
      ],
      timeline: "Phase I decision expected within 3 weeks. Closing targeted 8 weeks out.",
    },
  },
];

export interface SeedIcMemo {
  dealKey: string;
  /** Handles of the recommendations the memo was composed from. */
  recommendationKeys: string[];
  result: {
    thesis: string;
    dealSummary: string;
    valuation: { summary: string; keyMultiples: string };
    risks: {
      /** Closed vocabulary — mirrors IcMemoRisk in db/schema.ts. Typed as the
       *  union rather than string so a fixture typo fails at compile time
       *  instead of at insert time. */
      source: "assumptions" | "cultural" | "regulatory" | "synergy" | "documents" | "other";
      risk: string;
      severity: "high" | "medium" | "low";
    }[];
    openItems: string[];
    decisionHistory: string;
    recommendation: {
      verdict: "proceed" | "proceed_with_conditions" | "hold" | "decline";
      conditions: string[];
      reasoning: string;
    };
  };
}

export const SEED_IC_MEMOS: SeedIcMemo[] = [
  {
    dealKey: "anvil",
    recommendationKeys: ["anvil_retrade", "anvil_braeburn_divest", "anvil_proceed_to_dd"],
    result: {
      thesis:
        "Thornevale is two good businesses and two problems sold as one platform. Flow Systems and Marrow & Pike are 54% of revenue and 71% of EBITDA, with a genuine aftermarket franchise and a qualification moat that twenty-five years of segment data support through two downturns. Braeburn and Vantage are portfolio surgery. The deal works if it is bought at the earnings the business actually has and if the surgery is priced in rather than assumed away.",
      dealSummary:
        "Acquisition of 100% of Thornevale Industrial Group at an agreed EV of $2,310M, being 8.0x management's adjusted EBITDA of $288.8M. FY2025 revenue $1,312.9M. The quality-of-earnings review supports adjusted EBITDA of $241.6M, at which the agreed price is 9.6x. Current net debt of $1,107.9M sits against a covenant that steps down to 3.75x on 2026-12-31, with negative headroom on current earnings.",
      valuation: {
        summary:
          "The valuation question is not the multiple, it is the denominator. At 8.0x on management's EBITDA the price is unremarkable for a diversified industrial with this aftermarket mix. At 9.6x on supportable EBITDA it is expensive for a business with a declining unit, an impaired bolt-on and a covenant problem. The $47.2M bridge gap is 78% of the difference between a deal that clears the hurdle and one that does not.",
        keyMultiples:
          "EV/EBITDA 8.0x on management adjusted, 9.6x on QoE adjusted. EV/Revenue 1.76x. Net leverage 3.94x on the credit agreement definition, 4.10x on reported EBITDA, 4.58x on the QoE's.",
      },
      risks: [
        { source: "assumptions", risk: "The margin bridge to 24.5% relies on two drivers that have each failed in this group before, and starts from a base the QoE does not support.", severity: "high" },
        { source: "documents", risk: "Working-capital unwind of roughly $60M if the factoring programme is not continued. Absent from the seller's sources and uses.", severity: "high" },
        { source: "documents", risk: "Covenant steps down to 3.75x on 2026-12-31 against -0.19x of headroom. Compliance assumes Braeburn disposal proceeds against no signed process.", severity: "high" },
        { source: "assumptions", risk: "Torvald Agritech at 18.7% of revenue renews inside the hold period with a 3% annual price-down, while its own volumes are declining.", severity: "high" },
        { source: "documents", risk: "Sanjiu sole-source casting dependency with no qualified alternate and 14-18 months of requalification per part family across four families.", severity: "high" },
        { source: "cultural", risk: "A consistent pattern of describing past failures more favourably than the record supports, visible across four documents and two decades.", severity: "medium" },
        { source: "documents", risk: "Four change-of-control consents required, none obtained, plus a $250M notes put at 101.", severity: "medium" },
        { source: "documents", risk: "Toledo environmental remediation of approximately $6.8M with the vendor indemnity expired since 2011.", severity: "medium" },
        { source: "other", risk: "Two of five unit presidents hold change-of-control rights with no retention agreements signed.", severity: "medium" },
      ],
      openItems: [
        "Torvald customer reference call — a condition of the evaluation decision, still unscheduled",
        "Independent standalone-cost study for Braeburn (seller $6M vs our $14M)",
        "Section 382 limitation modelling on the proposed structure",
        "Refreshed transfer-pricing study for Toledo-Suzhou",
        "Consent strategy for the four required change-of-control consents",
        "Sole-source requalification study for the Sanjiu casting families",
        "Second-reviewer response to the 24.5% margin assumption, which currently blocks advancement",
      ],
      decisionHistory:
        "Sourcing to evaluation on adviser approach, 132 days ago. Evaluation to diligence 84 days ago, 4-1, conditional on a quality-of-earnings review of the margin bridge and a Torvald reference call. Held at diligence 5 days ago, 5-0, on receipt of the QoE, with a resolution to retrade to $1,950M or walk. The conditionality attached at the evaluation decision is the reason this deal is being held rather than signed, and it is worth recording that the condition earned its keep.",
      recommendation: {
        verdict: "proceed_with_conditions",
        conditions: [
          "Price reduced to $1,950M or below, reflecting the quality-of-earnings adjusted EBITDA",
          "Working-capital unwind of ~$60M funded by the seller or added to uses",
          "Braeburn disposal process launched by the seller before signing, not by us after close",
          "Retention agreements executed for the two unit presidents holding change-of-control rights",
          "Torvald customer reference call completed satisfactorily",
          "Covenant amendment pre-negotiated with the agent, or headroom demonstrated without disposal proceeds",
        ],
        reasoning:
          "The underlying assets justify continued engagement; the price does not. Every condition here exists because a specific piece of diligence found something specific, and none is a negotiating flourish. If the seller will not move on price, the correct answer is to walk — at 9.6x on supportable earnings, 40% of the probability mass returns below 1.2x, and this fund does not need to own a covenant problem to get industrial exposure.",
      },
    },
  },
];
