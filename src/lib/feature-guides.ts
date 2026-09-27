import type { FeatureKey } from "@contracts/constants";

export interface FeatureGuide {
  stage: string;
  where: string;
  input: string;
  output: string;
  ai: string;
  limit: string;
}

// Public feature pages and dashboard help share this implementation-backed guide.
export const FEATURE_GUIDES: Record<FeatureKey, FeatureGuide> = {
  pipeline: {
    stage: "Sourcing through integration", where: "Dashboard → Deal Pipeline → open a deal",
    input: "Add the company, industry, value, and current deal stage.",
    output: "A stage board, filters, archived deals, CSV export, and a working record for each deal.",
    ai: "The board does not use AI. People record decisions; the server checks whether a deal can advance.",
    limit: "The board reflects what your team enters. It does not synchronise with an external deal database.",
  },
  targets: {
    stage: "Sourcing and screening", where: "Dashboard → Target Screening → My Targets",
    input: "Add a company, sector, financial figures, notes, status, and your team's fit rating.",
    output: "A saved shortlist searchable by company name or sector.",
    ai: "Manual target ratings are entered by your team. AI Discovery is a separate mode that suggests candidates.",
    limit: "Saving a target does not create a pipeline deal. Create that deal separately when you decide to pursue it.",
  },
  target_discovery: {
    stage: "Sourcing", where: "Dashboard → Target Screening → AI Discovery",
    input: "Choose industries, geography, size bands, requirements, exclusions, and five or ten candidates.",
    output: "A saved research run with candidate companies, fit reasoning, risks, confidence labels, and source links.",
    ai: "Uses live web research when a live research provider is configured; sample mode returns examples.",
    limit: "Check that each company and source is relevant. Financial estimates and fit scores are suggestions, not verified facts.",
  },
  economics: {
    stage: "Evaluation and valuation", where: "Deal Pipeline → open a deal → Execution → Deal Economics",
    input: "Enter equity value, net debt, earnings, revenue, financing, holding period, and exit assumptions.",
    output: "Enterprise value, valuation multiples, estimated investment returns, and a financing balance check.",
    ai: "Defined formulas calculate the numbers in the browser and on the server. AI does not perform this arithmetic.",
    limit: "Returns are simplified estimates from your inputs. They are not a full financial forecast or a guarantee.",
  },
  documents: {
    stage: "Due diligence", where: "Open a deal → Documents → Data Room",
    input: "Upload a supported PDF, Word document, or text file and choose an analysis.",
    output: "Saved summaries, quoted concerns, key terms, or a checklist of present, missing, and unclear information.",
    ai: "Reads extracted text from the selected document. Quoted concerns are checked against that text.",
    limit: "Extraction may miss scanned or complex content; long text is truncated. Check the original document and any flagged extraction limits.",
  },
  dd_tracker: {
    stage: "Due diligence", where: "Open a deal → Execution → Diligence tracker",
    input: "Add tasks, owners, statuses, and notes, or import a document checklist analysis.",
    output: "A saved checklist showing what has been reviewed and what remains open.",
    ai: "Document analysis can suggest checklist findings. Importing them preserves manually set statuses.",
    limit: "Checklist completion is recorded by your team; it is not certification that diligence is complete.",
  },
  cultural: {
    stage: "Evaluation through integration planning", where: "Dashboard → People & Integration Review",
    input: "Name the buyer and target and supply sector information and relevant evidence or notes.",
    output: "A saved scope summary, questions for review, and a list of missing evidence. Optionally link it to a deal.",
    ai: "Uses the context you supply to propose questions about leadership, retention, and ways of working.",
    limit: "It does not interview employees, browse employer reviews, or calculate a cultural compatibility score.",
  },
  regulatory: {
    stage: "Screening through pre-close review", where: "Dashboard → Regulatory Review",
    input: "Supply the parties, sector, geography, market-share context, and source notes.",
    output: "A saved regulatory question list and missing-evidence checklist, optionally linked to a deal.",
    ai: "Organises questions from your supplied transaction context for review with qualified specialists.",
    limit: "It does not research current law, predict clearance, or determine filing obligations.",
  },
  assumptions: {
    stage: "Evaluation and due diligence", where: "Dashboard → Assumption Ledger; reviews also appear in the deal's Decision case",
    input: "Write an assumption and its context against a deal, then record a review and evidence when challenged.",
    output: "An optimism score, confidence label, reasoning, suggested action, and attributed review history.",
    ai: "Challenges the supplied assumption. It does not retrieve comparable transactions for this task.",
    limit: "The score is a model judgement, not a probability. Scores above 80 block forward moves until a review resolves or explicitly accepts the risk with evidence and a reason.",
  },
  decisions: {
    stage: "Evaluation through closing and integration", where: "Open a deal → Decision case → Decision Log and committee memo",
    input: "Record the decision, rationale, and any proposed stage change, conditions, or votes.",
    output: "An attributed decision history and, on request, a saved draft investment committee memo.",
    ai: "Drafts a memo from selected saved analyses, economics, key terms, recommendations, and decisions.",
    limit: "The memo is a draft, not approval or a review of every document. People approve decisions; server checks govern forward stage changes.",
  },
  recommendations: {
    stage: "Evaluation and approval", where: "Open a deal → Decision case → Recommendations",
    input: "Write or request a draft recommendation, then add evidence, counterarguments, an owner, and review dates.",
    output: "Draft, accepted, rejected, or superseded recommendations, readiness checks, and recorded outcomes.",
    ai: "Can draft proposed conclusions from the supplied deal record. Acceptance and decisions remain human actions.",
    limit: "A draft does not satisfy an approval gate. Applicable evidence, review, and freshness checks still need to pass.",
  },
  scenarios: {
    stage: "Evaluation and decision review", where: "Open a deal → Decision case → Scenarios",
    input: "For an AI scenario analysis, first stress-test at least two assumptions; saved economics and synergy context are included when available.",
    output: "Saved base, upside, and downside narratives with drivers and watch items; numerical scenario records support comparison.",
    ai: "Suggests narratives and judgement-based weights. Formula-based scenario calculations remain separate.",
    limit: "AI weights are not statistically calibrated forecasts. Review drivers and numerical inputs before using a scenario.",
  },
  timeline: {
    stage: "Diligence, negotiation, and closing", where: "Open a deal → Execution → Timeline",
    input: "Add milestones, due dates, owners, and status updates.",
    output: "A saved deal timetable and upcoming or overdue deadlines.",
    ai: "No AI is required to maintain the timeline.",
    limit: "Dates are entered by your team; this is not an external calendar integration or an automatic filing timetable.",
  },
  comments: {
    stage: "Across the deal lifecycle", where: "Open a deal → Execution → Comments",
    input: "Write a comment on the deal.",
    output: "An attributed discussion thread attached to that deal.",
    ai: "Comments are written by people, not generated automatically.",
    limit: "A comment does not itself resolve an assumption or approve a stage change; use the relevant review control.",
  },
  genome: {
    stage: "Evaluation and learning from past deals", where: "Dashboard → Deal Genome",
    input: "Ask a question about your accessible deal records.",
    output: "An answer with matching deal references that you can open and check.",
    ai: "Uses an extract of up to 40 deals, up to three selected assumptions per deal, and saved economics.",
    limit: "It does not search full documents, committee memos, decision narratives, or synergy plans. Search answers are not saved as deal analyses.",
  },
  comps: {
    stage: "Evaluation and valuation", where: "Dashboard → Precedent Comps",
    input: "Choose a sector and currency, optionally restrict to completed deals, and select a deal to benchmark.",
    output: "Recorded valuation multiples, medians, quartiles, sample sizes, and a peer comparison.",
    ai: "Database calculations produce the statistics; no AI model is involved.",
    limit: "The set uses your accessible recorded deals and excludes demo rows. It is not an external market database; small samples need caution.",
  },
  synergy: {
    stage: "Post-close integration", where: "Dashboard → Synergy Engine → choose a deal in integration",
    input: "Enter planned and actual savings or extra revenue by category, with optional quarterly detail.",
    output: "A saved plan, measured differences, and an optional AI explanation with suggested corrective actions.",
    ai: "Explains supplied planned-versus-actual figures and proposes actions. The server calculates the source figures.",
    limit: "Actuals are entered by your team, not imported from operating systems. Explanations are hypotheses to investigate. Synergy plans are not searched by Deal Genome.",
  },
  analytics: {
    stage: "Across the deal lifecycle", where: "Dashboard → Analytics",
    input: "Use the deal, target, assumption, recommendation, and outcome records your team has saved.",
    output: "Portfolio summaries, stage and sector breakdowns, and recorded decision-learning views.",
    ai: "Reports and aggregates recorded data; it does not independently verify business performance.",
    limit: "Incomplete records produce incomplete reporting. These charts do not establish that Ansyra improves investment returns.",
  },
};
