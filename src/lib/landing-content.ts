// ─────────────────────────────────────────────────────────────────────────────
// Landing content — the research library and instrument profiles behind the
// clickable landing cards (2026-07 revamp). Every figure here is the same
// cited data already used on the acts; each research entry summarizes ONE
// public study/report and names its publisher. Keep source lines in sync if
// figures change (re-verify before editing — see act files' research notes).
// ─────────────────────────────────────────────────────────────────────────────

import { FEATURE_KEYS, type FeatureKey } from "@contracts/constants";

export type ChartSpec =
  | { kind: "process"; steps: string[] }
  | { kind: "donut"; value: number; caption: string }
  | { kind: "bars"; unit?: string; data: { label: string; value: number; accent?: boolean }[] }
  | { kind: "cause"; data: { label: string; value: number; accent?: boolean }[] }
  | { kind: "line"; unit?: string; points: number[]; labels: string[] }
  | { kind: "slope"; leftLabel: string; rightLabel: string; pairs: { label: string; from: number; to: number }[] };

export interface ResearchEntry {
  published: string;
  evidenceType: string;
  scope: string;
  verified: string;
  slug: string;
  source: string;
  sourceUrl: string;
  year: string;
  title: string;
  headline: string; // the one number
  headlineLabel: string;
  summary: string[];
  findings: { stat: string; label: string }[];
  chart: ChartSpec;
  chartCaption: string;
  takeaway: string;
}

export const RESEARCH: ResearchEntry[] = [
  {
    "slug": "pwc-buyers-2026",
    "source": "PwC",
    "sourceUrl": "https://www.pwc.com/my/en/perspective/epb/260701-what-buyers-really-look-for.html",
    "published": "1 July 2026",
    "evidenceType": "Practitioner commentary",
    "scope": "Private-business sale readiness; PwC Malaysia practitioner perspective, not a statistical study.",
    "title": "What buyers really look for in an M&A",
    "headline": "Credible earnings",
    "headlineLabel": "connect the seller’s story to the underlying financial information",
    "summary": [
      "PwC describes how gaps in reporting, inconsistent narratives, and slow responses to buyer questions can undermine a sale. Its authors emphasize the quality and sustainability of earnings."
    ],
    "findings": [
      {
        "stat": "Information",
        "label": "Make the underlying financial record understandable"
      },
      {
        "stat": "Consistency",
        "label": "Reconcile the narrative with historical performance"
      },
      {
        "stat": "Readiness",
        "label": "Address buyer concerns early"
      }
    ],
    "chart": {
      "kind": "process",
      "steps": [
        "Seller’s narrative",
        "Financial evidence",
        "Buyer’s questions"
      ]
    },
    "chartCaption": "Conceptual reading guide, not measured results.",
    "takeaway": "Ansyra’s design response: keep the evidence beside each assumption so a reviewer can explain why the acquisition case changes.",
    "year": "2026",
    "verified": "6 September 2026"
  },
  {
    "slug": "bain-midyear-2026",
    "source": "Bain & Company",
    "sourceUrl": "https://www.bain.com/insights/m-and-a-midyear-outlook-2026-a-winners-paradox/",
    "published": "29 June 2026",
    "evidenceType": "Market outlook",
    "scope": "Global market commentary using 2026 year-to-date activity. Full-year projections are not completed-year results.",
    "title": "M&A Midyear Outlook 2026: A Winner’s Paradox",
    "headline": "A changing thesis",
    "headlineLabel": "acquisition plans meet AI-driven business transformation",
    "summary": [
      "Bain describes the challenge of pursuing ambitious acquisitions while managing AI transformation and major integrations. The outlook asks dealmakers to consider these demands together."
    ],
    "findings": [
      {
        "stat": "Strategy",
        "label": "Consider how the underlying business may change"
      },
      {
        "stat": "Integration",
        "label": "Examine the demands on the combined organisation"
      },
      {
        "stat": "Scenarios",
        "label": "Challenge the assumptions behind the deal"
      }
    ],
    "chart": {
      "kind": "process",
      "steps": [
        "Acquisition rationale",
        "Changing conditions",
        "Integration capacity"
      ]
    },
    "chartCaption": "Conceptual reading guide; no extrapolated 2026 totals are presented as actual results.",
    "takeaway": "Ansyra’s design response: preserve the original deal rationale and compare it with later scenarios and recorded decisions.",
    "year": "2026",
    "verified": "6 September 2026"
  },
  {
    "slug": "pwc-synergy-2026",
    "source": "PwC",
    "sourceUrl": "https://www.pwc.com/us/en/services/consulting/deals/library/m-and-a-synergies-credibility-gap-reporting.html",
    "published": "18 May 2026",
    "evidenceType": "Transaction analysis",
    "scope": "180 US public transactions valued at $1bn or more, 2016–2024, across six industries. Findings do not establish causation or represent all mid-market deals.",
    "title": "The M&A synergies credibility gap",
    "headline": "Nearly 1 in 3",
    "headlineLabel": "synergy announcers provided no quantified follow-through in PwC’s sample",
    "summary": [
      "PwC examines the difference between announcing merger benefits and reporting their delivery. Nearly one-third of companies announcing synergies did not provide quantified follow-through."
    ],
    "findings": [
      {
        "stat": "180",
        "label": "US public transactions studied"
      },
      {
        "stat": "$1bn+",
        "label": "Minimum transaction value in the sample"
      },
      {
        "stat": "2016–2024",
        "label": "Transaction observation period"
      }
    ],
    "chart": {
      "kind": "process",
      "steps": [
        "Benefits announced",
        "Delivery tracked",
        "Results reported"
      ]
    },
    "chartCaption": "Reporting sequence suggested by the topic; this is not a performance chart.",
    "takeaway": "Ansyra’s design response: compare planned benefits with recorded outcomes. Tracking makes the difference visible; it does not guarantee better returns.",
    "year": "2026",
    "verified": "6 September 2026"
  },
  {
    "slug": "mckinsey-ai-2026",
    "source": "McKinsey & Company",
    "sourceUrl": "https://www.mckinsey.com/capabilities/m-and-a/our-insights/gen-ai-in-m-and-a-from-theory-to-practice-to-high-performance",
    "published": "14 January 2026",
    "evidenceType": "Survey and practitioner analysis",
    "scope": "Reported experiences of M&A practitioners. Survey responses are not independently verified product performance measurements.",
    "title": "Gen AI in M&A: From theory to practice to high performance",
    "headline": "AI in practice",
    "headlineLabel": "evaluate useful assistance within a disciplined deal process",
    "summary": [
      "McKinsey examines how dealmakers apply generative AI and the benefits respondents report. The article considers the move from experimentation toward practical use in M&A workflows."
    ],
    "findings": [
      {
        "stat": "Adoption",
        "label": "Understand how AI enters deal work"
      },
      {
        "stat": "Workflow",
        "label": "Examine where assistance is useful"
      },
      {
        "stat": "Evaluation",
        "label": "Measure results on the actual task"
      }
    ],
    "chart": {
      "kind": "process",
      "steps": [
        "Defined task",
        "AI assistance",
        "Human review"
      ]
    },
    "chartCaption": "Ansyra’s proposed workflow, not a measured finding or publisher endorsement.",
    "takeaway": "Ansyra’s design response: distinguish source evidence, model inference, and human decisions. Structured output still requires factual checking.",
    "year": "2026",
    "verified": "6 September 2026"
  }
];

export const RESEARCH_REDIRECTS: Record<string, string> = {
  "hbr-playbook-2011": "pwc-buyers-2026",
  "lseg-volume-2025": "bain-midyear-2026",
  "mckinsey-culture-2023": "pwc-buyers-2026",
  "deloitte-integration-culture": "pwc-buyers-2026",
  "bain-synergy-2026": "mckinsey-ai-2026",
  "mckinsey-synergy-miss": "pwc-synergy-2026"
};

// ── Platform instruments ─────────────────────────────────────────────────────
//
// This list and contracts/constants.ts:FEATURE_KEYS are the same product seen
// from two sides: what a visitor is told, and what an admin can grant. They
// drifted badly once — the landing sold five features while seventeen shipped —
// so they are now joined by `featureKey` and checked at the bottom of this file.
// A new feature key must be given a page here or listed in SUPPORTING, or the
// build fails. That check is the whole point; do not weaken it to ship faster.

export type CategoryId = "origination" | "diligence" | "decision" | "memory";

export interface CategoryEntry {
  id: CategoryId;
  n: string;
  label: string;
  /** The question this stretch of the deal has to answer. */
  thesis: string;
}

/** The deal's arc, in order. Each row on the landing opens to its instruments. */
export const CATEGORIES: CategoryEntry[] = [
  {
    id: "origination",
    n: "01",
    label: "Origination and pipeline",
    thesis: "Find possible acquisitions, build a shortlist, and track the deals you choose to pursue.",
  },
  {
    id: "diligence",
    n: "02",
    label: "Diligence and analysis",
    thesis: "What it is worth, what is in the documents, and the people and regulatory questions that need specialist review.",
  },
  {
    id: "decision",
    n: "03",
    label: "The decision record",
    thesis: "What was assumed, by whom, who challenged it, and what the committee actually decided.",
  },
  {
    id: "memory",
    n: "04",
    label: "Memory and outcomes",
    thesis: "What your own history says about this deal, and whether the last one delivered what it promised.",
  },
];

export interface ToolEntry {
  slug: string;
  n: string;
  /** RBAC key this instrument is gated by — the join to FEATURE_KEYS. */
  featureKey: FeatureKey;
  category: CategoryId;
  name: string;
  tag: string;
  tagline: string;
  description: string[];
  how: { step: string; detail: string }[];
  outputs: string[];
  scenario: { title: string; body: string };
  chart: ChartSpec;
  chartCaption: string;
  relatedResearch: string[]; // research slugs
}

export const TOOLS: ToolEntry[] = [
  // ── 01. Origination and pipeline ──────────────────────────────────────────
  {
    slug: "deal-pipeline",
    n: "01",
    featureKey: "pipeline",
    category: "origination",
    name: "Deal Pipeline",
    tag: "The Spine",
    tagline: "Every live deal, at its real stage, with the record attached to it.",
    description: [
      "A deal is not a row in a spreadsheet that someone remembers to update. It moves through six stages, from sourcing to integration, and at every one of them somebody is deciding something they will answer for later.",
      "The pipeline is where those deals live: name, target, industry, value, stage, status. Forward stage changes must go through a recorded decision. Advancing a deal requires a recorded decision, and the deal and the decision are written in the same transaction, so there is no version of events where the stage moved and the reason went unrecorded.",
      "Every other instrument hangs off this. The assumptions, the economics, the documents, the committee decisions, and the post-close scoreboard all attach to a deal here.",
    ],
    how: [
      { step: "Open", detail: "Create a deal with its target, industry, value, and current stage. Values are stored numerically and per currency, so the totals are real arithmetic." },
      { step: "Work", detail: "The instruments you have been granted attach their output to the deal as the team uses them." },
      { step: "Advance", detail: "A forward stage move goes through the Decision Log. The reasoning is required, and unanswered red-flag assumptions stop the move." },
      { step: "Account", detail: "Supported actions appear in the activity trail with their author and time. The dossier exports the sections available to your account." },
    ],
    outputs: [
      "One live view of every deal and the stage it is genuinely at",
      "A stage history that cannot advance without a recorded reason",
      "A per-deal dossier that prints, and a pipeline that exports to CSV",
    ],
    scenario: {
      title: "The Monday pipeline review",
      body: "Four deals moved last week. Nobody has to reconstruct why from memory or a thread: each move carries the decision that authorised it, the person who made it, and the date. The one deal that did not move is the one with an assumption still sitting unanswered at 91.",
    },
    chart: {
      kind: "bars",
      unit: "",
      data: [
        { label: "Sourcing", value: 12 },
        { label: "Evaluation", value: 7 },
        { label: "Diligence", value: 4, accent: true },
        { label: "Closing", value: 2 },
      ],
    },
    chartCaption: "A sample pipeline by stage. The shape of the funnel is the first thing a partner asks for and the last thing a spreadsheet keeps current.",
    relatedResearch: [],
  },
  {
    slug: "target-screening",
    n: "02",
    featureKey: "targets",
    category: "origination",
    name: "Target Screening",
    tag: "Deal Sourcing",
    tagline: "Qualify what is in front of you, and have the market researched for what is not.",
    description: [
      "Keep a shortlist of potential acquisitions with sector, revenue, earnings, notes, status, and a fit rating entered by your team. Search the list by name or sector.",
      "AI Target Discovery is a separate research mode. Describe the thesis, the industries, the geography, and the size bands you will consider, plus the must-haves and the deal-breakers, and it runs a live web search for real, currently-operating companies that match.",
      "Every candidate comes back with a fit score, a rationale, named risks, and the sources it was found in. Financial figures are returned as estimates and labelled as estimates, because that is what they are. Save a candidate to your target shortlist after review. Create a pipeline deal separately when you decide to pursue it.",
    ],
    how: [
      { step: "Screen", detail: "Search your existing targets by company name or sector and review their saved figures and notes." },
      { step: "Describe", detail: "For discovery, give the thesis: industries, geography, size bands, must-haves, deal-breakers." },
      { step: "Research", detail: "With live research configured, request five or ten candidate companies, source links, and confidence labels. Check the results before outreach." },
      { step: "Promote", detail: "A candidate worth pursuing becomes a target in one click, and the run stays on file." },
    ],
    outputs: [
      "A fit-scored, filterable target list",
      "Researched candidates with cited sources, named risks, and estimates marked as estimates",
      "A saved history of every discovery run and the thesis behind it",
    ],
    scenario: {
      title: "The thesis with no list behind it",
      body: "A partner wants European industrial-services roll-ups at $5M to $25M revenue, family-owned, no private-equity incumbent. There is no list. Discovery returns ten real companies with sources, fit scores, and the two that fail the deal-breaker flagged as failing it. The team checks the sources, saves three candidates to the shortlist, and creates a deal separately for any opportunity it pursues.",
    },
    chart: {
      kind: "cause",
      data: [
        { label: "Strong fit — worth a call", value: 30, accent: true },
        { label: "Possible — needs a check", value: 40 },
        { label: "Fails a deal-breaker", value: 30 },
      ],
    },
    chartCaption: "A sample discovery run, sorted by fit. The value is as much in the clean rejections as in the shortlist.",
    relatedResearch: ["bain-midyear-2026"],
  },
  // ── 02. Diligence and analysis ────────────────────────────────────────────
  {
    slug: "deal-economics",
    n: "03",
    featureKey: "economics",
    category: "diligence",
    name: "Deal Economics",
    tag: "Deterministic Math",
    tagline: "Enterprise value, multiples, and returns. Computed, not generated.",
    description: [
      "Deal Economics uses defined formulas rather than AI for arithmetic: enterprise value from equity value and net debt, EV/EBITDA and EV/Revenue multiples, estimates of the multiple on invested capital (MOIC) and annualised return (IRR) from your entry, hold period, and exit multiple, and a sources-and-uses table that tells you plainly whether it balances.",
      "Every one of those figures is computed by shared, unit-tested code, on the server, from the inputs you gave it. The same functions run in the browser for a live preview; the server recomputes the figures when you save.",
      "Scenario analysis sits alongside it. Base, upside, and downside cases let you see which assumption the return is actually resting on, which is usually not the one the model spends the most rows on.",
    ],
    how: [
      { step: "Enter", detail: "Equity value, net debt, target EBITDA and revenue, in the deal's own currency." },
      { step: "Derive", detail: "Enterprise value, EV/EBITDA and EV/Revenue fall out of that. Multiples with no meaningful denominator return n.m. rather than a misleading number." },
      { step: "Project", detail: "Equity share, hold period, and exit multiple give estimates of the multiple on invested capital (MOIC) and annualised return (IRR). Sources and uses balance, or the delta is shown." },
      { step: "Flex", detail: "Base, upside, and downside scenarios, so the committee argues about the driver rather than the output." },
    ],
    outputs: [
      "EV, EV/EBITDA, EV/Revenue, MOIC and IRR estimates, recomputed server-side",
      "A sources-and-uses table that shows its own imbalance rather than hiding it",
      "Base, upside, and downside cases, and the figures that feed the Deal Genome and the comps set",
    ],
    scenario: {
      title: "The multiple nobody had actually calculated",
      body: "The deck says 8x. The deck was built before the net-debt number came back from diligence. Entered properly, the enterprise value moves and the deal is at 9.4x, above the median of the last four the firm did in the sector. That comparison is one tab away, and it is drawn from the firm's own closed deals.",
    },
    chart: {
      kind: "bars",
      unit: "x",
      data: [
        { label: "This deal", value: 9.4, accent: true },
        { label: "Your median", value: 8.1 },
        { label: "Your Q3", value: 8.8 },
      ],
    },
    chartCaption: "Sample EV/EBITDA against the firm's own precedent set. The benchmark is your closed deals, never a market average.",
    relatedResearch: [],
  },
  {
    slug: "data-room",
    n: "04",
    featureKey: "documents",
    category: "diligence",
    name: "Data Room",
    tag: "Document Intelligence",
    tagline: "Read the contract at 11pm. Get the clause and the quote, not a summary you have to trust.",
    description: [
      "Attach diligence documents to a deal, PDF, DOCX, or plain text, and run four different reads over them: an executive summary, clause-level red flags, extracted key terms, and a gap review against a standard diligence checklist.",
      "The red-flag pass is the one that earns its place. Every flag must carry a verbatim quote copied character for character out of the document, with a severity and a stated concern. If the model cannot produce an exact supporting quote, the instruction is to drop the flag entirely rather than describe one. You are checking a citation, not trusting a paraphrase.",
      "Key terms come out structured: parties, effective date, consideration, closing conditions, indemnities, change of control, non-compete. The checklist pass names what is present, what is missing, and what is merely unclear, and it can be merged into the due diligence tracker without ever overwriting a status a human set by hand.",
      "Documents sit in private storage. Every download is access-checked at the moment it is requested, not at the moment the link was made.",
    ],
    how: [
      { step: "Attach", detail: "Upload to the deal. Files live in private storage, scoped to your firm." },
      { step: "Analyse", detail: "Choose the read: summary, red flags, key terms, or the diligence-checklist gap review." },
      { step: "Verify", detail: "Each red flag carries a verbatim quote and a severity, so you can go straight to the clause and check it." },
      { step: "Merge", detail: "Checklist findings flow into the due diligence tracker. Manual state always wins over an AI import." },
    ],
    outputs: [
      "Clause-level red flags, each with a verbatim quote and a severity",
      "Structured key terms: parties, consideration, conditions, indemnities, change of control",
      "A present, missing, or unclear read against the diligence checklist",
    ],
    scenario: {
      title: "Week three, 11pm, the supply agreement",
      body: "Forty pages, and the change-of-control provision is on page 31 in a sentence that does not use the phrase. The red-flag pass returns it with the exact wording quoted, marked High, and one line on why it matters at this deal's structure. Verifying that takes a minute, because the quote is right there to check against the page.",
    },
    // `bars`, not `cause`: CauseBars renders every value with a % suffix, and
    // these are counts of flags, not shares of anything.
    chart: {
      kind: "bars",
      unit: "",
      data: [
        { label: "High", value: 3, accent: true },
        { label: "Medium", value: 7 },
        { label: "Low", value: 11 },
      ],
    },
    chartCaption: "A sample red-flag pass over one agreement, by severity. Every flag counted here would carry a verbatim quote behind it.",
    relatedResearch: [],
  },
  // ── 03. The decision record ───────────────────────────────────────────────
  {
    slug: "decision-log",
    n: "08",
    featureKey: "decisions",
    category: "decision",
    name: "Decision Log & Committee Memo",
    tag: "The Stage Gate",
    tagline: "A deal cannot advance without a reason on the record. Request an AI draft memo from the saved record, then review it.",
    description: [
      "This is the enforcement point of the whole product. A deal cannot move to a later stage except through a recorded decision: advance, hold, pass, approve a letter of intent, approve binding, or kill. The rationale is required, committee votes and conditions can be attached, and the decision and the stage change are written in one transaction so the two can never disagree.",
      "Direct forward stage edits are rejected. Recorded advancement requires any applicable recommendation check and resolution or explicit risk acceptance for every high-risk assumption, with evidence and an attributed reason.",
      "An investment committee memo, a briefing for the people approving an investment, can be drafted from a bounded selection of saved records: the stress-tested assumptions, the cultural and regulatory reads, the synergy plan, the server-computed economics, the extracted document key terms, and the decision history. It returns a thesis, a valuation section, sourced risks, a recommendation, and, importantly, an open-items list naming what is missing. It is instructed never to invent a source. Missing people or regulatory evidence must remain an open item.",
    ],
    how: [
      { step: "Decide", detail: "Record the decision type, the target stage, and the rationale. Votes and conditions optional." },
      { step: "Gate", detail: "Open high-risk assumptions and unmet recommendation checks block advancement." },
      { step: "Compose", detail: "The memo is assembled from the deal's own analyses and decisions, with every gap named rather than filled." },
      { step: "Defend", detail: "Thesis, valuation, risks by source, open items, and a recommendation with its conditions." },
    ],
    outputs: [
      "A stage history where every move carries its reason and its author",
      "A hard gate on advancing past an unanswered red-flag assumption",
      "An AI draft committee memo based on selected records, with open questions for human review",
    ],
    scenario: {
      title: "The memo due Friday",
      body: "Six weeks of work sits in eight places. The memo pulls it into one: the thesis, what the economics actually say, the three risks with their sources attached, and an open-items list noting that no regulatory read has been run. Nobody has to remember that gap at 11pm on Thursday, because the memo will not pretend it isn't there.",
    },
    // Counts, so `bars` rather than `cause` (which suffixes every value with %).
    // Labels stay short: BarsChart centres them under a vertical bar.
    chart: {
      kind: "bars",
      unit: "",
      data: [
        { label: "Assumptions", value: 5, accent: true },
        { label: "Documents", value: 3 },
        { label: "Culture, reg.", value: 2 },
        { label: "Open items", value: 4 },
      ],
    },
    chartCaption: "A sample memo, counted by where each risk came from. The open-items bar is the honest part: it is what the memo refused to make up.",
    relatedResearch: ["pwc-buyers-2026"],
  },
  // ── 04. Memory and outcomes ───────────────────────────────────────────────
  {
    slug: "comps-engine",
    n: "10",
    featureKey: "comps",
    category: "memory",
    name: "Precedent Comps",
    tag: "Your Own Benchmark",
    tagline: "What this firm has actually paid, by sector. Median, quartiles, and the sample size.",
    description: [
      "Compare the values and multiples recorded for your own accessible deals. This gives the team an internal reference point for pricing discussions, with the sample size visible. It is not a market-wide transactions database or a measure of investment returns.",
      "The engine aggregates accessible deals with saved economics, with an optional filter for completed deals: median, first and third quartile EV/EBITDA and EV/Revenue, grouped by sector and currency. It is plain SQL over your own rows, with no model involved and nothing crossing between firms.",
      "It also tells you when not to trust it. Small samples are flagged as small samples, and a deal can be benchmarked against its own sector's set to show where it sits in the range. A median drawn from three deals is presented as a median drawn from three deals.",
    ],
    how: [
      { step: "Accrue", detail: "Every deal with recorded economics joins the set. Sample data is excluded from the statistics." },
      { step: "Aggregate", detail: "Median and quartile EV/EBITDA and EV/Revenue per sector and currency, computed in the database." },
      { step: "Benchmark", detail: "Place a live deal against its sector's own range and see the gap." },
      { step: "Caveat", detail: "Thin samples are labelled thin. The engine would rather say so than imply a precision it does not have." },
    ],
    outputs: [
      "Median and quartile multiples from your selected deal set, grouped by sector and currency",
      "A live deal positioned against its sector's range",
      "An explicit low-sample warning instead of false precision",
    ],
    scenario: {
      title: "The price nobody could defend",
      body: "The committee asks why 9.4x. The answer used to be a market report and a feeling. It is now the firm's own five closed deals in the sector: median 8.1x, third quartile 8.8x, and this one above all of them. The deal may still be right. But the conversation is now about why this one is different, which is the conversation worth having.",
    },
    chart: {
      kind: "bars",
      unit: "x",
      data: [
        { label: "Q1", value: 7.2 },
        { label: "Median", value: 8.1, accent: true },
        { label: "Q3", value: 8.8 },
      ],
    },
    chartCaption: "A sample sector set of EV/EBITDA, drawn from one firm's own closed deals. Never a market average, and never shared across firms.",
    relatedResearch: [],
  },
  {
    slug: "deal-genome",
    n: "09",
    featureKey: "genome",
    category: "memory",
    name: "Deal Genome™",
    tag: "Institutional Memory",
    tagline: "Ask questions about a bounded selection of your deals, assumptions, and economics.",
    description: [
      "Most firms' M&A memory lives in the heads of whoever was in the room. When they leave, the pattern-recognition leaves with them, and the next team repeats a mistake the firm already paid to learn.",
      "Deal Genome answers questions using up to 40 accessible deals, up to three selected assumptions per deal, and saved economics, including realised returns when recorded there. It does not search documents, committee memos, decision narratives, or synergy plans.",
      "Results identify the selected deals used as context. Check each reference before relying on an inference.",
    ],
    how: [
      { step: "Scope", detail: "The corpus is assembled from the deals you and your organization already own. Nothing crosses tenants, and there is no separate upload step." },
      { step: "Ask", detail: "Ask a plain-language question on the Deal Genome page." },
      { step: "Ground", detail: "Your deals, their stress-tested assumptions, and their recorded economics go to the model with the question. It answers from that record." },
      { step: "Compound", detail: "Revisit saved records as they change. Each search still uses a bounded extract rather than the whole portfolio." },
    ],
    outputs: [
      "Answers with matching deal references to open and check",
      "Precedent patterns for the deal on your desk",
      "Institutional memory that survives staff turnover",
    ],
    scenario: {
      title: "A company information pack arrives",
      body: "A partner forwards a logistics company information pack. Instead of a week of 'didn't we look at something like this in 2023?', an associate asks the Genome. The selected deal records surface earlier pricing assumptions and economics. The associate opens those records to check whether they are relevant.",
    },
    chart: {
      kind: "bars",
      unit: "",
      data: [
        { label: "Deals", value: 30 },
        { label: "Assumptions", value: 60 },
        { label: "Economics", value: 25, accent: true },
      ],
    },
    chartCaption: "An illustrative search extract within the current limits: up to 40 deals, selected assumptions, and saved economics.",
    relatedResearch: ["pwc-buyers-2026", "bain-midyear-2026"],
  },
  {
  "slug": "cultural-compatibility",
  "n": "05",
  "featureKey": "cultural",
  "category": "diligence",
  "name": "People & Integration Review",
  "tag": "Diligence questions",
  "tagline": "Questions about leadership, retention, and ways of working, with evidence gaps visible.",
  "description": [
    "Combining organisations raises questions about people as well as finances. Names and sector labels alone cannot establish cultural compatibility.",
    "This instrument turns your supplied context into questions to investigate. It records the evidence provided and identifies what remains unknown; it does not assign a compatibility score."
  ],
  "how": [
    {
      "step": "1",
      "detail": "Name both organisations"
    },
    {
      "step": "2",
      "detail": "Provide context and sources"
    },
    {
      "step": "3",
      "detail": "Generate diligence questions"
    },
    {
      "step": "4",
      "detail": "Review with the people leading integration"
    }
  ],
  "outputs": [
    "A scoped diligence checklist",
    "Evidence gaps and questions to investigate",
    "A saved analytical aid for human review"
  ],
  "scenario": {
    "title": "Illustrative workflow",
    "body": "Illustrative example: a buyer supplies a management-meeting note about approval delays. The review proposes questions about decision authority and retention, without pretending to have interviewed employees."
  },
  "chart": {
    "kind": "process",
    "steps": [
      "Supplied context",
      "Missing evidence",
      "Questions for review"
    ]
  },
  "chartCaption": "Illustrative workflow; no probability or compatibility score is estimated.",
  "relatedResearch": [
    "pwc-buyers-2026",
    "mckinsey-ai-2026"
  ]
},
  {
  "slug": "regulatory-radar",
  "n": "06",
  "featureKey": "regulatory",
  "category": "diligence",
  "name": "Regulatory Review",
  "tag": "Diligence questions",
  "tagline": "Organise regulatory questions and missing evidence for specialist review.",
  "description": [
    "Deal structure, the parties, and the relevant jurisdictions determine what specialists need to investigate. Company names alone cannot support a reliable challenge probability.",
    "This instrument uses the transaction context you provide to prepare an issue checklist. It does not predict clearance, invent precedent cases, or claim that a filing is required."
  ],
  "how": [
    {
      "step": "1",
      "detail": "Name both parties"
    },
    {
      "step": "2",
      "detail": "Describe the transaction and geography"
    },
    {
      "step": "3",
      "detail": "Provide relevant source context"
    },
    {
      "step": "4",
      "detail": "Prepare questions for qualified counsel"
    }
  ],
  "outputs": [
    "A regulatory issue checklist",
    "Missing facts and source context",
    "A saved starting point for specialist review"
  ],
  "scenario": {
    "title": "Illustrative workflow",
    "body": "Illustrative example: a buyer describes overlapping activities in two countries. The review asks for turnover, market definitions, and current authority guidance before any filing conclusion is drawn."
  },
  "chart": {
    "kind": "process",
    "steps": [
      "Supplied context",
      "Missing evidence",
      "Questions for review"
    ]
  },
  "chartCaption": "Illustrative workflow; no probability or compatibility score is estimated.",
  "relatedResearch": [
    "pwc-buyers-2026",
    "mckinsey-ai-2026"
  ]
},
  {
    slug: "assumption-ledger",
    n: "07",
    featureKey: "assumptions",
    category: "decision",
    name: "Assumption Ledger™",
    tag: "Bias Audit",
    tagline: "Record each thesis, challenge its assumptions, and document the review.",
    description: [
      "An acquisition can miss its goals when important assumptions go untested. An explicit assumption is easier to challenge than an unstated expectation.",
      "The Assumption Ledger makes the thesis explicit. Every assumption is written down against the deal with a named owner, then challenged by the model: an optimism score from 0 to 100, a confidence grade, the reasoning, and one concrete action to take.",
      "The score is not the point. The gate is. An assumption that scores above 80 and has no attributed review resolving or accepting the risk blocks the deal from advancing a stage. The reviewer records a reason, supporting evidence, and an explicit outcome before the deal moves.",
    ],
    how: [
      { step: "Write", detail: "The team drafts assumptions against the deal as the thesis forms, each with an owner." },
      { step: "Challenge", detail: "The model scores each one for optimism, grades its confidence, and argues the other side." },
      { step: "Answer", detail: "Anything scoring above 80 needs an attributed review. A response alone leaves it open; resolving the concern or accepting the risk requires evidence and a recorded reason." },
      { step: "Keep", detail: "The whole exchange stays attached to the deal, and prints into the dossier with it." },
    ],
    outputs: [
      "A written, owned, scored thesis for every deal",
      "A counter-argument and a concrete next action against every assumption",
      "A hard stage gate, and the audit trail of who cleared it",
    ],
    scenario: {
      title: "The synergy line nobody questioned",
      body: "Cross-sell synergies: $14M by Year 2. Nobody in the room wanted to be the one to push. The Ledger scores it 91 and the deal stops moving: it cannot advance from its current stage until an attributed review resolves the concern or accepts the risk. The answer that comes back reprices the line. The deal still happens, at a number someone put their name to.",
    },
    chart: {
      kind: "slope",
      leftLabel: "Modeled",
      rightLabel: "Realized",
      pairs: [
        { label: "cross-sell", from: 100, to: 31 },
        { label: "cost takeout", from: 100, to: 84 },
      ],
    },
    chartCaption: "Fictional illustration of two synergy assumptions. These figures explain the workflow; they are not measured research findings.",
    relatedResearch: ["mckinsey-ai-2026", "pwc-synergy-2026", "pwc-buyers-2026"],
  },
  {
    slug: "synergy-reality-engine",
    n: "11",
    featureKey: "synergy",
    category: "memory",
    name: "Synergy Reality Engine™",
    tag: "Post-Close Truth",
    tagline: "The deal record does not stop at close. Announced numbers meet reality.",
    description: [
      "Most deal work goes quiet at closing, precisely when the value creation is supposed to start. Announced benefits need follow-through: the planned benefit and the recorded outcome belong in the same record.",
      "Enter planned benefits and actual results by category, adding quarterly detail where available. You can request an AI explanation of the differences and suggested actions for your team to investigate.",
      "The arithmetic is computed on the server before the model ever sees it, so the totals and the variance percentages are not something the AI can drift on. It explains the numbers. It does not produce them.",
    ],
    how: [
      { step: "Plan", detail: "The announced plan becomes the scoreboard, category by category, planned against actual." },
      { step: "Phase", detail: "Add quarterly detail where you have it, and drift becomes visible in the quarter it starts rather than at year end." },
      { step: "Explain", detail: "Request an analysis for category-level assessments, calculated differences, explanations, and proposed corrective actions." },
      { step: "Record", detail: "The plan and analysis are saved against the deal. Synergy plans do not feed Deal Genome; separately saved economics can include realised returns." },
    ],
    outputs: [
      "A category-level announced-versus-actual scoreboard, with quarterly phasing",
      "A verdict and a corrective action per category, not just a variance",
      "Server-computed figures the model explains but never recalculates",
    ],
    scenario: {
      title: "Quarter two, post-close",
      body: "The team enters quarterly results showing procurement savings on track and revenue from cross-selling at 40% of plan. An AI analysis may suggest reviewing joint pricing. The team checks the explanation, decides on an action, and uses the saved comparison in its next review.",
    },
    chart: {
      kind: "line",
      unit: "%",
      points: [12, 31, 47, 58],
      labels: ["Q1", "Q2", "Q3", "Q4"],
    },
    chartCaption: "Sample Year-1 capture against a 100% announced plan, phased by quarter. Visible drift beats a year-end surprise.",
    relatedResearch: ["mckinsey-ai-2026", "pwc-synergy-2026"],
  },
];

// ── Who it's for — roles, workflows, no repeated stats ───────────────────────

export interface RoleEntry {
  id: string;
  role: string;
  line: string;
  detail: string;
  uses: { tool: string; how: string }[];
}

export const ROLES: RoleEntry[] = [
  {
    id: "PE",
    role: "Private Equity",
    line: "Review acquisitions with the assumptions and evidence in view.",
    detail: "Investment teams reviewing company information packs and planning how acquired businesses will grow.",
    uses: [
      { tool: "Deal Genome™", how: "ask questions about selected past deal records" },
      { tool: "People & Integration Review", how: "prepare leadership and retention questions before management meetings" },
      { tool: "Synergy Engine", how: "compare planned benefits with the actual figures your team enters" },
    ],
  },
  {
    id: "CD",
    role: "Corporate Development",
    line: "Explain proposed acquisitions to your board.",
    detail: "In-house teams that must defend every thesis to an investment committee, then live with the integration afterward.",
    uses: [
      { tool: "Assumption Ledger™", how: "review assumptions alongside the committee memo" },
      { tool: "Regulatory Review", how: "the regulatory discussion has questions and evidence gaps" },
      { tool: "Synergy Engine", how: "planned benefits and actual results stay in the private workspace" },
    ],
  },
  {
    id: "AD",
    role: "M&A Advisors",
    line: "A clearer evidence trail for a small deal team.",
    detail: "Advisors helping clients compare acquisitions and document the reasoning behind their recommendations.",
    uses: [
      { tool: "Deal Genome™", how: "find matching records within the supported search extract" },
      { tool: "People & Integration Review", how: "organise people-related questions and missing evidence for clients" },
      { tool: "Assumption Ledger™", how: "challenge assumptions behind a proposed valuation" },
    ],
  },
  {
    id: "SC",
    role: "Strategy Consultants",
    line: "Commercial diligence with a memory.",
    detail: "Teams evaluating markets and businesses who want to revisit the evidence from earlier work.",
    uses: [
      { tool: "Deal Genome™", how: "compare selected saved assumptions and economics across deals" },
      { tool: "Synergy Engine", how: "post-deal reviews grounded in tracked outcomes" },
      { tool: "People & Integration Review", how: "prepare integration questions from the notes and sources you supply" },
    ],
  },
  {
    id: "FO",
    role: "Family Offices",
    line: "Bring a clear review process to direct investments.",
    detail: "Families and their investment teams assessing businesses they may invest in directly.",
    uses: [
      { tool: "Assumption Ledger™", how: "challenge an investment assumption before committing capital" },
      { tool: "People & Integration Review", how: "questions about leadership and retention" },
      { tool: "Deal Genome™", how: "revisit selected saved deal details and assumptions" },
    ],
  },
  {
    id: "TC",
    role: "Transaction Counsel",
    line: "Identify questions to investigate before drafting deal terms.",
    detail: "Lawyers reviewing a proposed acquisition and the facts needed to advise on its terms.",
    uses: [
      { tool: "Regulatory Review", how: "regulatory questions scoped to the supplied facts" },
      { tool: "Assumption Ledger™", how: "identify assumptions that may need contractual protection" },
      { tool: "Deal Genome™", how: "revisit selected deal details and recorded economics" },
    ],
  },
];

// ── The FEATURE_KEYS ↔ landing join ──────────────────────────────────────────

/**
 * Features that ship inside another instrument's surface rather than standing
 * on their own. Each maps to the `featureKey` of the page that describes it, so
 * "where is Scenario Analysis on the site?" has an answer in code, not in
 * somebody's memory. Not every capability deserves its own headline; every
 * capability does need a home.
 */
export const SUPPORTING: Partial<Record<FeatureKey, FeatureKey>> = {
  target_discovery: "targets", // a research mode of the Targets screen
  scenarios: "economics", // base / upside / downside on the model
  dd_tracker: "documents", // the checklist the document review merges into
  timeline: "decisions", // milestones and deadlines around the decisions
  comments: "decisions", // the discussion attached to the record
  analytics: "comps", // pipeline reporting alongside the benchmark set
  recommendations: "decisions", // the conclusion the record is a record OF
};

/**
 * Every feature an admin can grant is either an instrument with a page or a
 * supporting capability described inside one. This is a runtime assertion in a
 * unit test AND the reason the arrays above stay honest: ship a new FEATURE_KEY
 * without deciding how the public surface says it exists, and the test fails.
 */
export function unrepresentedFeatureKeys(): FeatureKey[] {
  const paged = new Set<string>(TOOLS.map((t) => t.featureKey));
  return FEATURE_KEYS.filter((k) => !paged.has(k) && !(k in SUPPORTING));
}

/** Instruments in a category, in page order. */
/** Current sources shared by the landing, footer, and article pages. */
export const FEATURED_RESEARCH = RESEARCH;

export function toolsInCategory(id: CategoryId): ToolEntry[] {
  return TOOLS.filter((t) => t.category === id);
}

/** The supporting capabilities described inside a given instrument's page. */
export function supportingFor(featureKey: FeatureKey): FeatureKey[] {
  return (Object.keys(SUPPORTING) as FeatureKey[]).filter((k) => SUPPORTING[k] === featureKey);
}
