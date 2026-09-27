// ─────────────────────────────────────────────────────────────────────────────
// The data room. Every document here is generated as REAL BYTES and uploaded to
// the `deal-documents` bucket, in the mime type its content implies.
//
// This module is where the twenty-five years of history actually live. The
// schema has no table for a target's operating history — it is deal-centric —
// so the history goes where the product genuinely consumes it: as documents a
// deal team reads and an AI analyses. That is not a workaround; it is the same
// path a real diligence process takes, and it means the extraction pipeline is
// exercised against content with real structure rather than lorem ipsum.
//
// Several documents CONTRADICT each other on purpose. The management pack and
// the restatement memo disagree about Q3 FY2025; the CIM and the QoE disagree
// about margin; the FY2019 strategic plan describes a Connect programme that
// did not happen and a Nordhaven exit that is characterised differently in the
// current management presentation. Reconciling those is the work, and a corpus
// where every document agrees cannot test whether the product helps with it.
// ─────────────────────────────────────────────────────────────────────────────
import {
  BUSINESS_UNITS,
  COMPANY_NAME,
  CORPORATE_EVENTS,
  KEY_SUPPLIERS,
  MANAGEMENT_NARRATIVE,
  REVENUE_BY_REGION,
  SITES,
  TOP5_CUSTOMER_SHARE_PCT,
  TOP_CUSTOMERS,
  TOTAL_HEADCOUNT,
} from "./company";
import {
  ANNUAL_HISTORY,
  BACKLOG,
  COVENANT,
  DEBT_STRUCTURE,
  FY25,
  MANAGEMENT_ADJ_EBITDA_M,
  MANAGEMENT_MARGIN_PCT,
  NET_DEBT_M,
  QOE_ADJ_EBITDA_M,
  QOE_BRIDGE,
  QOE_MARGIN_PCT,
  QUARTERLY_HISTORY,
  Q3_FY25_RESTATEMENT,
  REPORTED_EBITDA_M,
  TOTAL_DEBT_M,
  WORKING_CAPITAL,
} from "./financials";
import { docxBytes, pdfBytes, txtBytes } from "./binary";

export const PDF_MIME = "application/pdf";
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const TXT_MIME = "text/plain";

export type DocMime = typeof PDF_MIME | typeof DOCX_MIME | typeof TXT_MIME;

export interface SeedDocument {
  /** Which deal's data room this belongs in. */
  dealKey: string;
  name: string;
  mime: DocMime;
  /** Built lazily — sixty documents' worth of bytes should not be materialised
   *  just because something imported this module for its metadata. */
  build: () => Buffer;
  /** What this document exists to exercise. Surfaced in the dataset docs. */
  purpose: string;
  /** Set when the document is deliberately broken, so tests can find it by
   *  intent rather than by guessing at its name. */
  defect?: "truncated" | "empty" | "contradictory" | "stale";
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

const pad = (s: string | number, n: number) => String(s).padStart(n);
const padEnd = (s: string | number, n: number) => String(s).padEnd(n);
const money = (n: number | null) => (n === null ? "n/a" : n.toFixed(1));

function heading(title: string, subtitle?: string): string {
  const rule = "=".repeat(Math.max(title.length, 60));
  return [rule, title, subtitle ?? "", rule, ""].filter((l) => l !== "").join("\n") + "\n";
}

function section(title: string): string {
  return `\n${title}\n${"-".repeat(title.length)}\n`;
}

// ─── Document bodies ─────────────────────────────────────────────────────────

function cim(): string {
  const units = BUSINESS_UNITS.filter((u) => u.divestedYear === null && u.fy25RevenueM > 0);
  return (
    heading(
      `CONFIDENTIAL INFORMATION MEMORANDUM`,
      `${COMPANY_NAME} — Project Anvil — Prepared by Harrowgate Partners LLC`,
    ) +
    section("1. Executive summary") +
    `${MANAGEMENT_NARRATIVE.positioning}\n\n` +
    `FY2025 revenue of $${FY25.revenueM.toFixed(1)}M and Adjusted EBITDA of $${MANAGEMENT_ADJ_EBITDA_M.toFixed(1)}M, ` +
    `representing an Adjusted EBITDA margin of ${MANAGEMENT_MARGIN_PCT.toFixed(1)}%.\n\n` +
    `${MANAGEMENT_NARRATIVE.growthStory}\n\n${MANAGEMENT_NARRATIVE.marginStory}\n\n` +
    `${MANAGEMENT_NARRATIVE.backlogClaim}\n` +
    section("2. Business units") +
    units
      .map(
        (u) =>
          `${u.name}\n  FY2025 revenue: $${u.fy25RevenueM.toFixed(1)}M | Segment margin: ${u.marginAnchorPct.toFixed(1)}%\n  ${u.description}\n`,
      )
      .join("\n") +
    section("3. Geographic footprint") +
    SITES.map(
      (s) => `  ${padEnd(s.city + ", " + s.country, 34)} ${padEnd(s.kind, 20)} ${pad(s.headcount, 6)} employees`,
    ).join("\n") +
    `\n\n  Total headcount: ${TOTAL_HEADCOUNT}\n\n  Revenue by destination:\n` +
    REVENUE_BY_REGION.map((r) => `    ${padEnd(r.region, 20)} ${pad(r.pct.toFixed(1), 6)}%`).join("\n") +
    section("4. Customer relationships") +
    `The group's commercial base is anchored by long-tenured relationships. The five largest\n` +
    `customers represent ${TOP5_CUSTOMER_SHARE_PCT.toFixed(1)}% of FY2025 revenue, with an average relationship tenure of\n` +
    `${(TOP_CUSTOMERS.reduce((n, c) => n + c.tenureYears, 0) / TOP_CUSTOMERS.length).toFixed(0)} years.\n\n` +
    TOP_CUSTOMERS.map((c) => `  ${padEnd(c.name, 28)} ${pad(c.sharePct.toFixed(1), 5)}%  ${c.sector}`).join("\n") +
    section("5. Capital structure") +
    `  Total debt outstanding: $${TOTAL_DEBT_M.toFixed(1)}M\n  Net debt: $${NET_DEBT_M.toFixed(1)}M\n` +
    `  Net leverage (credit agreement basis): ${COVENANT.currentRatio.toFixed(2)}x\n` +
    section("6. Investment highlights") +
    `  - Leading positions in flow control and specialty coatings\n` +
    `  - Resilient aftermarket franchise, approximately 44% of Flow Systems revenue\n` +
    `  - Disciplined acquisition record with four completed transactions since 2007\n` +
    `  - Diversified end-market exposure across water, chemicals, power and mobility\n` +
    `  - ${MANAGEMENT_NARRATIVE.workingCapitalPosition}\n` +
    `  - ${MANAGEMENT_NARRATIVE.braeburnPosition}\n`
  );
}

function qoeReport(): string {
  return (
    heading(
      "QUALITY OF EARNINGS REPORT — FINAL",
      `${COMPANY_NAME} — Prepared for the Buyer by Ashcombe Transaction Advisory`,
    ) +
    section("Scope and conclusion") +
    `We have performed a quality-of-earnings analysis for the twelve months ended FY2025.\n\n` +
    `Management presents Adjusted EBITDA of $${MANAGEMENT_ADJ_EBITDA_M.toFixed(1)}M (${MANAGEMENT_MARGIN_PCT.toFixed(1)}% margin).\n` +
    `We support Adjusted EBITDA of $${QOE_ADJ_EBITDA_M.toFixed(1)}M (${QOE_MARGIN_PCT.toFixed(1)}% margin).\n\n` +
    `The difference of $${(MANAGEMENT_ADJ_EBITDA_M - QOE_ADJ_EBITDA_M).toFixed(1)}M arises from add-backs we do not accept and\n` +
    `from charges we have identified that are not reflected in the management accounts.\n` +
    section("EBITDA bridge") +
    `  ${padEnd("Reported EBITDA (management accounts)", 46)} ${pad(money(REPORTED_EBITDA_M), 9)}\n\n` +
    `  Add-backs presented by management:\n` +
    QOE_BRIDGE.filter((l) => l.side === "add_back")
      .map(
        (l) =>
          `    ${padEnd(l.label, 44)} ${pad(money(l.amountM), 9)}   ${l.accepted ? "ACCEPTED" : "NOT ACCEPTED"}\n      ${l.note}`,
      )
      .join("\n") +
    `\n\n  Charges identified in the course of our work:\n` +
    QOE_BRIDGE.filter((l) => l.side === "qoe_charge")
      .map((l) => `    ${padEnd(l.label, 44)} ${pad("(" + money(l.amountM) + ")", 9)}\n      ${l.note}`)
      .join("\n") +
    `\n\n  ${padEnd("Management Adjusted EBITDA", 46)} ${pad(money(MANAGEMENT_ADJ_EBITDA_M), 9)}\n` +
    `  ${padEnd("Ashcombe Adjusted EBITDA", 46)} ${pad(money(QOE_ADJ_EBITDA_M), 9)}\n` +
    section("Matters for the buyer's attention") +
    `1. The Connect wind-down has been added back as non-recurring in each of FY2022, FY2023,\n` +
    `   FY2024 and FY2025. An item added back for four consecutive years is not non-recurring.\n\n` +
    `2. The excess-and-obsolete inventory reserve has not been kept current with the decline in\n` +
    `   inventory turns from ${WORKING_CAPITAL.inventoryTurnsStart} to ${WORKING_CAPITAL.inventoryTurnsCurrent}. We estimate the shortfall at $11.4M.\n\n` +
    `3. Reported days sales outstanding of ${WORKING_CAPITAL.dsoReportedCurrentDays} days reflects a $${WORKING_CAPITAL.factoringProgrammeM}M non-recourse factoring\n` +
    `   programme initiated in ${WORKING_CAPITAL.factoringStarted}. Excluding the programme, DSO is ${WORKING_CAPITAL.dsoCurrentDays} days and has\n` +
    `   deteriorated in each of the last three years. Management's characterisation of a\n` +
    `   nine-day improvement is not supported on a like-for-like basis.\n\n` +
    `4. FY2025 Q3 revenue was restated. See our separate memorandum.\n\n` +
    `5. We were not provided with segment disclosure for FY2012 and have been unable to\n` +
    `   reconcile the FY2011-FY2013 unit walk. This remains an open item.\n`
  );
}

function annualHistoryPack(): string {
  const header =
    `  ${padEnd("FY", 6)}${pad("Revenue", 11)}${pad("EBITDA", 10)}${pad("Margin%", 9)}` +
    `${pad("Capex", 9)}${pad("FCF", 10)}${pad("NetDebt", 10)}${pad("Leverage", 10)}${pad("Heads", 8)}`;
  const rows = ANNUAL_HISTORY.map(
    (y) =>
      `  ${padEnd(y.fy, 6)}${pad(y.revenueM.toFixed(1), 11)}${pad(y.ebitdaM.toFixed(1), 10)}` +
      `${pad(y.marginPct.toFixed(1), 9)}${pad(y.capexM.toFixed(1), 9)}${pad(y.freeCashFlowM.toFixed(1), 10)}` +
      `${pad(y.netDebtM.toFixed(1), 10)}${pad(y.netLeverage.toFixed(2) + "x", 10)}${pad(y.headcount, 8)}`,
  ).join("\n");

  const unitBlocks = BUSINESS_UNITS.map((u) => {
    const series = ANNUAL_HISTORY.map((y) => y.units.find((x) => x.unitKey === u.key)).filter(
      (x): x is NonNullable<typeof x> => x !== undefined,
    );
    if (series.length === 0) return "";
    return (
      `\n  ${u.name}\n` +
      `  ${padEnd("FY", 6)}${pad("Revenue", 11)}${pad("EBITDA", 10)}${pad("Margin%", 9)}\n` +
      series
        .map(
          (s) =>
            `  ${padEnd(s.fy, 6)}${pad(s.revenueM.toFixed(1), 11)}${pad(s.ebitdaM.toFixed(1), 10)}${pad(s.marginPct.toFixed(1), 9)}`,
        )
        .join("\n") +
      "\n"
    );
  }).join("\n");

  return (
    heading(
      "TWENTY-FIVE YEAR FINANCIAL HISTORY",
      `${COMPANY_NAME} — FY2001 through FY2025 — all figures $M unless stated`,
    ) +
    section("Group summary") +
    header +
    "\n" +
    rows +
    section("Segment detail") +
    `NOTE: FY2012 segment disclosure is not included. The underlying working papers were\n` +
    `lost in the 2014 ERP migration and have not been reconstructed.\n` +
    unitBlocks +
    section("Corporate events") +
    CORPORATE_EVENTS.map(
      (e) =>
        `  ${e.year}  ${padEnd(e.kind, 20)} ${e.headline}\n        ${e.detail}` +
        (e.cashImpactM === null ? "" : `\n        Cash impact: ${e.cashImpactM > 0 ? "+" : ""}$${e.cashImpactM.toFixed(1)}M`),
    ).join("\n\n")
  );
}

function quarterlyPack(): string {
  return (
    heading("QUARTERLY TRENDING PACK", `${COMPANY_NAME} — FY2024-Q1 through FY2026-Q2`) +
    section("Quarterly performance") +
    `  ${padEnd("Quarter", 13)}${pad("Revenue", 10)}${pad("EBITDA", 10)}${pad("Margin%", 9)}${pad("Backlog", 10)}${pad("DSO", 6)}${pad("Turns", 8)}\n` +
    QUARTERLY_HISTORY.map(
      (q) =>
        `  ${padEnd(q.label, 13)}${pad(q.revenueM.toFixed(1), 10)}${pad(q.ebitdaM.toFixed(1), 10)}` +
        `${pad(q.marginPct.toFixed(1), 9)}${pad(q.backlogM, 10)}${pad(q.dsoDays, 6)}${pad(q.inventoryTurns.toFixed(1), 8)}`,
    ).join("\n") +
    section("Commentary") +
    QUARTERLY_HISTORY.map((q) => `  ${q.label}: ${q.note}`).join("\n\n") +
    section("Backlog") +
    `  ${BACKLOG.quarter} backlog: $${BACKLOG.currentM}M\n` +
    `  ${BACKLOG.priorYearQuarter} backlog: $${BACKLOG.priorYearM}M\n` +
    `  Year-over-year change: ${BACKLOG.changePct.toFixed(1)}%\n` +
    `  Peak in the period: $${BACKLOG.peakM}M\n\n` +
    `  Management position: "${BACKLOG.managementClaim}"\n\n  ${BACKLOG.note}\n`
  );
}

/** The management pack still carries the PRE-restatement Q3 number. This is the
 *  contradiction, and it is the whole reason this document exists. */
function managementPack(): string {
  const q3 = QUARTERLY_HISTORY.find((q) => q.label === "FY2025-Q3")!;
  return (
    heading("MANAGEMENT PRESENTATION", `${COMPANY_NAME} — Buyer Session — Project Anvil`) +
    section("Where we are") +
    `${MANAGEMENT_NARRATIVE.positioning}\n\n${MANAGEMENT_NARRATIVE.growthStory}\n` +
    section("Recent trading") +
    `  FY2025-Q1 revenue  $307.8M\n` +
    `  FY2025-Q2 revenue  $314.2M\n` +
    `  FY2025-Q3 revenue  $${Q3_FY25_RESTATEMENT.originallyReportedM.toFixed(1)}M\n` +
    `  FY2025-Q4 revenue  $335.4M\n\n` +
    `  Q3 was a record third quarter, driven by strong Kestrel project conversion.\n` +
    `  (This page has not been updated since the November board pack. The Q3 figure\n` +
    `   shown is the originally reported number.)\n` +
    section("Margin bridge to FY2028") +
    `  ${MANAGEMENT_NARRATIVE.marginStory}\n` +
    section("Backlog and visibility") +
    `  ${MANAGEMENT_NARRATIVE.backlogClaim}\n` +
    section("Portfolio") +
    `  ${MANAGEMENT_NARRATIVE.braeburnPosition}\n\n  ${MANAGEMENT_NARRATIVE.connectPosition}\n` +
    section("Working capital") +
    `  ${MANAGEMENT_NARRATIVE.workingCapitalPosition}\n\n` +
    `  Reported DSO improved from ${WORKING_CAPITAL.dsoStartDays + 12} days to ${WORKING_CAPITAL.dsoReportedCurrentDays} days year over year.\n` +
    `  Q3 gross margin held at ${q3.marginPct.toFixed(1)}% despite input-cost pressure.\n`
  );
}

function restatementMemo(): string {
  return (
    heading("MEMORANDUM — RESTATEMENT OF FY2025 Q3 REVENUE", `${COMPANY_NAME} — Office of the CFO`) +
    `To:      Board of Directors\nFrom:    Ingrid Vasquez-Moller, Chief Financial Officer\nSubject: Restatement of FY2025 Q3 revenue\n\n` +
    section("Summary") +
    `FY2025 Q3 revenue as originally reported was $${Q3_FY25_RESTATEMENT.originallyReportedM.toFixed(1)}M.\n` +
    `Restated FY2025 Q3 revenue is $${Q3_FY25_RESTATEMENT.restatedM.toFixed(1)}M.\n` +
    `The adjustment is $${Q3_FY25_RESTATEMENT.deltaM.toFixed(1)}M.\n` +
    section("Cause") +
    `${Q3_FY25_RESTATEMENT.reason}\n` +
    section("How it was identified") +
    `${Q3_FY25_RESTATEMENT.identifiedBy}\n` +
    section("Remediation") +
    `Percentage-of-completion recognition at Kestrel now requires documented customer\n` +
    `acceptance before a milestone may be recognised. The control was implemented in\n` +
    `April 2025 and has been operating for two quarters.\n\n` +
    `Note for the data room: the buyer management presentation circulated in this process\n` +
    `has NOT been updated and continues to show the originally reported Q3 figure. This\n` +
    `memorandum is the authoritative statement.\n`
  );
}

function debtAndCovenant(): string {
  return (
    heading("DEBT STRUCTURE AND COVENANT ANALYSIS", `${COMPANY_NAME} — as at FY2026-Q2`) +
    section("Instruments") +
    DEBT_STRUCTURE.map(
      (d) =>
        `  ${d.name}\n    Facility: $${d.facilityM.toFixed(1)}M   Drawn: $${d.drawnM.toFixed(1)}M   Rate: ${d.rate}\n` +
        `    Maturity: ${d.maturity}   ${d.secured ? "Senior secured" : "Unsecured"}\n    ${d.note}`,
    ).join("\n\n") +
    `\n\n  Total drawn: $${TOTAL_DEBT_M.toFixed(1)}M\n  Less cash: $32.1M\n  Net debt: $${NET_DEBT_M.toFixed(1)}M\n` +
    section("Covenant") +
    `  Test: ${COVENANT.test}\n  ${COVENANT.definitionNote}\n\n` +
    `  Covenant EBITDA (credit agreement basis): $${COVENANT.covenantEbitdaM.toFixed(1)}M\n` +
    `  Net debt: $${COVENANT.netDebtM.toFixed(1)}M\n` +
    `  Current ratio: ${COVENANT.currentRatio.toFixed(2)}x\n` +
    `  Current limit: ${COVENANT.currentLimit.toFixed(2)}x\n` +
    `  Headroom: ${COVENANT.headroom.toFixed(2)}x\n\n` +
    `  Step-down to ${COVENANT.steppedLimit.toFixed(2)}x on ${COVENANT.stepDownDate}\n` +
    `  Headroom after step-down: ${COVENANT.headroomAfterStepDown.toFixed(2)}x  ** BREACH ON CURRENT EBITDA **\n\n  ${COVENANT.note}\n` +
    section("Reconciliation note") +
    `  Net leverage on REPORTED EBITDA is ${(NET_DEBT_M / REPORTED_EBITDA_M).toFixed(2)}x.\n` +
    `  Net leverage on the CREDIT AGREEMENT definition is ${COVENANT.currentRatio.toFixed(2)}x.\n` +
    `  Net leverage on the QoE's ADJUSTED EBITDA is ${(NET_DEBT_M / QOE_ADJ_EBITDA_M).toFixed(2)}x.\n\n` +
    `  These three numbers are all correct and all different. Any covenant discussion that\n` +
    `  does not state which definition it is using should be treated as unreliable.\n`
  );
}

function customerConcentration(): string {
  return (
    heading("CUSTOMER CONCENTRATION ANALYSIS", `${COMPANY_NAME} — FY2025`) +
    section("Top five accounts") +
    `  ${padEnd("Customer", 28)}${pad("Share%", 8)}  ${padEnd("Tenure", 9)}Units\n` +
    TOP_CUSTOMERS.map(
      (c) =>
        `  ${padEnd(c.name, 28)}${pad(c.sharePct.toFixed(1), 8)}  ${padEnd(c.tenureYears + " yrs", 9)}${c.units.join(", ")}\n      ${c.note}`,
    ).join("\n\n") +
    `\n\n  Top five combined: ${TOP5_CUSTOMER_SHARE_PCT.toFixed(1)}%\n  Largest single account: ${TOP_CUSTOMERS[0].sharePct.toFixed(1)}%\n` +
    section("Assessment") +
    `  Torvald at ${TOP_CUSTOMERS[0].sharePct.toFixed(1)}% is the group's principal commercial risk. The relationship is\n` +
    `  nineteen years old and sole-sourced across 41 part numbers, which is genuine\n` +
    `  protection. It is also subject to a 3% annual price-down and renews in December\n` +
    `  2027, inside the likely hold period, and Torvald's own volumes fell 8% in calendar\n` +
    `  2025 — the first absolute decline in six years.\n\n` +
    `  The concentration is therefore not stable in the way tenure alone would suggest.\n`
  );
}

function supplierRisk(): string {
  return (
    heading("SUPPLIER RISK MEMORANDUM", `${COMPANY_NAME} — Procurement diligence`) +
    section("Key suppliers") +
    KEY_SUPPLIERS.map(
      (s) =>
        `${s.name}\n  Category: ${s.category}\n  Share of direct spend: ${s.spendPct.toFixed(1)}%\n` +
        `  Geography: ${s.geography}\n  Sole-sourced: ${s.soleSource ? "YES" : "No"}\n  ${s.risk}`,
    ).join("\n\n") +
    section("Assessment") +
    `  Two sole-source dependencies, both with Chinese exposure, together representing\n` +
    `  ${(KEY_SUPPLIERS.filter((s) => s.soleSource).reduce((n, s) => n + s.spendPct, 0)).toFixed(1)}% of direct spend.\n\n` +
    `  The Nordmagnet exposure is frequently mischaracterised internally as a European\n` +
    `  supply relationship because the finishing step is in Bielefeld. The feedstock is\n` +
    `  Chinese and the export-control exposure is unchanged by where the magnet is\n` +
    `  finished. Any mitigation plan built on the supplier's German address is wrong.\n\n` +
    `  Requalification of the Sanjiu casting families is estimated at 14-18 months each.\n` +
    `  No qualified alternate exists today. This is the single largest operational risk\n` +
    `  in the diligence and it is not quantified anywhere in the management materials.\n`
  );
}

function workingCapitalAnalysis(): string {
  return (
    heading("WORKING CAPITAL ANALYSIS", `${COMPANY_NAME} — trailing eight quarters`) +
    section("Trend") +
    `  ${padEnd("Quarter", 13)}${pad("DSO", 8)}${pad("Turns", 9)}\n` +
    QUARTERLY_HISTORY.map(
      (q) => `  ${padEnd(q.label, 13)}${pad(q.dsoDays, 8)}${pad(q.inventoryTurns.toFixed(1), 9)}`,
    ).join("\n") +
    section("The factoring programme") +
    `  Programme size: $${WORKING_CAPITAL.factoringProgrammeM}M non-recourse\n  Initiated: ${WORKING_CAPITAL.factoringStarted}\n\n` +
    `  Reported DSO (with programme):    ${WORKING_CAPITAL.dsoReportedCurrentDays} days\n` +
    `  Underlying DSO (without):         ${WORKING_CAPITAL.dsoCurrentDays} days\n` +
    `  DSO at the start of the period:   ${WORKING_CAPITAL.dsoStartDays} days\n` +
    section("Inventory") +
    `  Turns have fallen from ${WORKING_CAPITAL.inventoryTurnsStart} to ${WORKING_CAPITAL.inventoryTurnsCurrent} since FY2021.\n\n  ${WORKING_CAPITAL.note}\n` +
    section("Buyer note") +
    `  If the factoring programme is not continued post-close, the working-capital\n` +
    `  unwind is approximately $${WORKING_CAPITAL.factoringProgrammeM}M of cash. This is not reflected in the sources\n` +
    `  and uses provided by the seller.\n`
  );
}

function connectPostMortem(): string {
  const connect = BUSINESS_UNITS.find((u) => u.key === "connect")!;
  return (
    heading("POST-IMPLEMENTATION REVIEW — THORNEVALE CONNECT", "Internal audit, restricted circulation") +
    section("Programme summary") +
    `  Launched: 2019\n  Wound down: 2023\n  Approved investment: $62.0M\n  Actual consumption: $84.2M\n` +
    `  Revenue target by 2024: $120.0M\n  Peak revenue achieved: $9.4M (7.8% of target)\n` +
    `  Write-off: $84.2M, of which $51.0M capitalised software\n` +
    section("What happened") +
    `${connect.description}\n` +
    section("Findings") +
    `1. The business case assumed a 34% attach rate on the installed base within three\n` +
    `   years. The attach rate at wind-down was 2.1%. No stage gate ever tested the\n` +
    `   attach assumption against evidence; the programme was reviewed on spend and\n` +
    `   schedule only.\n\n` +
    `2. Capitalisation continued for eleven months after the FY2022 review had already\n` +
    `   concluded the revenue case was not achievable.\n\n` +
    `3. Twelve of fourteen engineering staff were redeployed rather than exited, which\n` +
    `   is why the wind-down charge carries no severance line. The cost did not\n` +
    `   disappear; it moved into the unit cost bases.\n\n` +
    `4. The programme has been presented externally as "concluded on schedule". It was\n` +
    `   wound down a year early having consumed 136% of its approved budget.\n` +
    section("Relevance to a buyer") +
    `  The Connect costs continue to be added back as non-recurring. See the QoE.\n`
  );
}

function staleStrategicPlan(): string {
  return (
    heading("STRATEGIC PLAN FY2019-FY2024", `${COMPANY_NAME} — Board approved, March 2019`) +
    `  *** THIS DOCUMENT IS SUPERSEDED. It is retained in the data room for reference\n` +
    `      and describes plans that were not executed as written. ***\n` +
    section("Strategic priorities 2019-2024") +
    `1. Digital transformation. Thornevale Connect will deliver $120M of high-margin\n` +
    `   recurring revenue by 2024, representing approximately 9% of group revenue at a\n` +
    `   gross margin in excess of 70%. Committed investment $62M over five years.\n\n` +
    `2. Portfolio focus. The 2016 disposal of Nordhaven Marine Fasteners completed the\n` +
    `   group's exit from cyclical offshore end-markets and was executed opportunistically\n` +
    `   into a strong market at an attractive multiple.\n\n` +
    `3. Braeburn Motion Controls will return to double-digit segment margin by FY2022\n` +
    `   following the 2015 footprint actions.\n\n` +
    `4. Group leverage will be maintained below 2.5x net debt to EBITDA.\n` +
    section("Targets versus what happened") +
    `  (Annotated by the diligence team, not part of the original document.)\n\n` +
    `  Connect recurring revenue by 2024:  planned $120.0M  |  actual $0.0M (wound down 2023)\n` +
    `  Braeburn segment margin by FY2022:  planned >10.0%   |  actual 8.4%\n` +
    `  Group leverage ceiling:             planned <2.50x   |  actual ${COVENANT.currentRatio.toFixed(2)}x\n\n` +
    `  Note also that this document describes the Nordhaven exit as opportunistic and into\n` +
    `  a strong market. The current management presentation describes the same transaction\n` +
    `  as a disposal of a structurally challenged business into a weak offshore market.\n` +
    `  Both characterisations cannot be correct.\n`
  );
}

function staleOrgChart(): string {
  return (
    heading("ORGANISATION CHART", `${COMPANY_NAME} — last updated November 2023`) +
    `  *** OUT OF DATE. Retained as provided by the seller. ***\n\n` +
    `  Chief Executive Officer .................... Aldous Thornevale III\n` +
    `  Chief Financial Officer .................... Bernard Okonkwo-Hale     [RETIRED MARCH 2025]\n` +
    `  Chief Operating Officer .................... Halina Brzezinski        [DEPARTED JUNE 2024 - ROLE NOT FILLED]\n` +
    `  President, Flow Systems .................... Marcus Ellery\n` +
    `  President, Kestrel Thermal ................. Yuki Tanabe-Ross\n` +
    `  President, Marrow & Pike ................... Constance Adebayo\n` +
    `  President, Braeburn Motion ................. Dieter Hallgrimsson\n` +
    `  President, Vantage Sealing ................. Rafael Monterroso\n` +
    `  Managing Director, Thornevale Connect ...... Priya Venkataraman       [PROGRAMME CLOSED 2023]\n` +
    `  General Counsel ............................ Eleanor Fitzwilliam\n` +
    `  Chief HR Officer ........................... Samuel Adeyemi-Clarke\n\n` +
    `  Total headcount at date of chart: 4,010\n` +
    `  Current total headcount: ${TOTAL_HEADCOUNT}\n\n` +
    `  Buyer note: three of the eleven positions shown are vacant or obsolete. The COO role\n` +
    `  has been unfilled for over a year, with the unit presidents reporting directly to the\n` +
    `  CEO. Management has not provided a current chart.\n`
  );
}

function nordhavenSummary(): string {
  return (
    heading("DIVESTITURE SUMMARY — NORDHAVEN MARINE FASTENERS", "Prepared 2016, annotated 2026") +
    section("Transaction") +
    `  Completed: 2016\n  Consideration: $71.0M\n  Multiple: 6.1x trailing EBITDA\n` +
    section("As described at the time (2016 board paper)") +
    `  "A disciplined exit from a structurally challenged business into a weak offshore\n` +
    `   market, executed to protect group margin and redeploy capital into coatings."\n` +
    section("As described in the FY2019 strategic plan") +
    `  "Executed opportunistically into a strong market at an attractive multiple."\n` +
    section("As described in the current management presentation") +
    `  "A disposal of a structurally challenged business into a weak offshore market."\n` +
    section("Diligence note") +
    `  The 2016 and 2026 characterisations agree. The FY2019 strategic plan does not.\n` +
    `  6.1x against a group average disposal multiple of 7.4x is consistent with a weak\n` +
    `  market, not a strong one. The FY2019 description appears to be presentational.\n\n` +
    `  This matters less for the $71M than for what it says about how this management\n` +
    `  team describes its own history when the audience changes.\n`
  );
}

function vantageImpairment(): string {
  return (
    heading("GOODWILL IMPAIRMENT MEMORANDUM — VANTAGE SEALING", `${COMPANY_NAME} — FY2024`) +
    section("Conclusion") +
    `  Goodwill impairment of $31.0M recognised against the Vantage Sealing cash-generating\n` +
    `  unit in FY2024.\n` +
    section("Background") +
    `  Vantage was acquired in 2021 for $118.0M at 10.2x trailing EBITDA. The acquisition\n` +
    `  case assumed $14.0M of annual revenue synergy from cross-selling into the Flow\n` +
    `  Systems distribution channel by year three.\n\n` +
    `  Realised cross-sell revenue in FY2024 was $3.1M, or 22% of the case.\n` +
    section("Trigger") +
    `  Third consecutive year of missed cross-sell targets.\n` +
    section("Assumptions") +
    `  FY2024 test discount rate: 9.50%\n  FY2023 test discount rate: 8.25%\n\n` +
    `  Buyer note: the 125bp increase in the discount rate accounts for a material portion\n` +
    `  of the impairment. Had the FY2023 rate been retained, the charge would have been\n` +
    `  approximately $18M. The change is defensible on rates alone, but it means the\n` +
    `  impairment is not a clean read on operating underperformance.\n` +
    section("Management position") +
    `  Management attributes the cross-sell shortfall to channel conflict with two Flow\n` +
    `  distributors. No remediation plan has been provided, and the same explanation was\n` +
    `  given in FY2022 and FY2023.\n`
  );
}

function boardMinutes(): string {
  return (
    heading("EXTRACTS FROM BOARD MINUTES", `${COMPANY_NAME} — selected sessions 2007-2025`) +
    section("14 June 2007 — Kestrel acquisition") +
    `  The Board approved the acquisition of Kestrel Thermal Systems for $214.0M, being\n` +
    `  9.1x trailing EBITDA. Mr Vandersloot and Ms Okereke recorded their dissent, citing\n` +
    `  the position in the refining capex cycle and the absence of a downside case in the\n` +
    `  paper presented. The Chair noted the dissent and the resolution carried 7-2.\n` +
    section("3 November 2009 — Restructuring") +
    `  The Board approved a restructuring charge of $28.0M and the consolidation of two\n` +
    `  Kestrel facilities. It was noted that Kestrel EBITDA had declined 34% since\n` +
    `  acquisition and that the 2007 paper had not modelled a downturn of this severity.\n` +
    section("22 February 2019 — Connect programme") +
    `  The Board approved $62.0M of investment in the Connect programme over five years.\n` +
    `  It was agreed that progress would be reviewed against revenue milestones annually.\n` +
    `  (Diligence note: no such revenue-milestone review appears in the minutes of any\n` +
    `   subsequent meeting. Reviews were conducted against spend and schedule.)\n` +
    section("8 September 2021 — Vantage acquisition") +
    `  The Board approved the acquisition of Vantage Sealing Technologies for $118.0M.\n` +
    `  The paper presented $14.0M of year-three revenue synergy. Mr Vandersloot asked what\n` +
    `  evidence supported the attach rate assumption; the answer recorded is "management\n` +
    `  judgement based on channel overlap". The resolution carried unanimously.\n` +
    section("17 March 2025 — CFO transition and restatement") +
    `  The Board noted the appointment of Ms Vasquez-Moller as Chief Financial Officer and\n` +
    `  received her memorandum on the restatement of FY2025 Q3 revenue. The Board requested\n` +
    `  that the buyer management presentation be updated to reflect the restated figure.\n` +
    `  (Diligence note: as at the date of this data room, it has not been.)\n`
  );
}

function carveOutPnl(): string {
  const braeburn = BUSINESS_UNITS.find((u) => u.key === "motion")!;
  return (
    heading("CARVE-OUT PROFIT & LOSS — BRAEBURN MOTION CONTROLS", "Project Anvil-Carve — seller prepared") +
    section("Standalone P&L as presented") +
    `  Revenue                                  ${pad(braeburn.fy25RevenueM.toFixed(1), 10)}\n` +
    `  Direct cost of sales                     ${pad("(142.6)", 10)}\n` +
    `  Direct operating expense                 ${pad("(31.2)", 10)}\n` +
    `  Allocated group overhead                 ${pad("(6.0)", 10)}\n` +
    `  ------------------------------------------------------\n` +
    `  Segment EBITDA                           ${pad(((braeburn.fy25RevenueM * braeburn.marginAnchorPct) / 100).toFixed(1), 10)}\n` +
    section("Stranded cost — DISPUTED") +
    `  Seller estimate of standalone incremental cost:     $6.0M\n` +
    `  Buyer diligence estimate:                           $14.0M\n\n` +
    `  The seller's $6.0M assumes Braeburn continues to consume group IT, treasury and\n` +
    `  HR services under a TSA priced at cost for 24 months. The buyer's $14.0M assumes\n` +
    `  those functions must be stood up permanently and prices them at market.\n\n` +
    `  At the buyer's number, segment EBITDA falls to approximately $9.6M and the implied\n` +
    `  entry multiple on the $168M asking price rises from 9.6x to 17.5x.\n\n` +
    `  This single disputed line is the deal.\n` +
    section("Allocation basis") +
    `  Group overhead is allocated on revenue. Braeburn is 15.0% of group revenue and\n` +
    `  carries 15.0% of allocated overhead. It is 8.7% of group EBITDA. Whether a\n` +
    `  revenue-based allocation is the right basis for a business with this margin\n` +
    `  profile is an open question and has not been tested.\n`
  );
}

function synergyPlanDoc(): string {
  return (
    heading("INTEGRATION SYNERGY PLAN", "Project Kestrel Retro — year two review") +
    section("Synergy categories") +
    `  Procurement consolidation      planned $8.4M   |  actual $5.1M   (61%)\n` +
    `  Facility rationalisation       planned $6.2M   |  actual $6.6M   (106%)\n` +
    `  Overhead reduction             planned $4.8M   |  actual $2.9M   (60%)\n` +
    `  Cross-selling revenue synergy  planned $5.5M   |  actual $1.2M   (22%)\n` +
    `  ---------------------------------------------------------------\n` +
    `  Total                          planned $24.9M  |  actual $15.8M  (63%)\n` +
    section("Commentary") +
    `  Facility rationalisation is the only workstream that has delivered. It was also\n` +
    `  the only one with a named owner, a dated plan and a monthly review from day one.\n\n` +
    `  Cross-selling revenue synergy at 22% of plan repeats the Vantage pattern almost\n` +
    `  exactly. Revenue synergies in this group have been underwritten three times and\n` +
    `  delivered at 22%, 22% and 61% of case. That is not a run of bad luck.\n` +
    section("Recommendation") +
    `  Any future acquisition case should apply a 25% realisation factor to revenue\n` +
    `  synergies unless a named customer commitment exists at signing.\n`
  );
}

function regulatoryBrief(): string {
  return (
    heading("MERGER CONTROL BRIEF", "Project Suzhou — Anfeng Motion Technologies") +
    section("Filing status") +
    `  United States (HSR)          Filed. Waiting period expires without extension.\n` +
    `  Germany (Bundeskartellamt)   Filed. Phase I decision due.\n` +
    `  China (SAMR)                 Filed nine days after the other two.\n` +
    section("Overlap analysis") +
    `  The parties overlap in fractional-horsepower industrial motors in the EEA. The\n` +
    `  combined share on the narrowest plausible market definition (premium-efficiency\n` +
    `  IE4 motors, EEA) is approximately 24%. On a wider motion-control definition it is\n` +
    `  below 10%.\n\n` +
    `  Market definition is therefore the whole question. A Phase II referral in Germany\n` +
    `  would push closing past the long-stop date of the sale and purchase agreement.\n` +
    section("Third-party risk") +
    `  Two competitors have made submissions to the Bundeskartellamt. Neither is a\n` +
    `  customer of either party, which limits the weight the authority is likely to\n` +
    `  give them, but it does raise the probability of an extended Phase I.\n` +
    section("Assessment") +
    `  Clearance without remedies is the base case. A behavioural remedy on supply terms\n` +
    `  to two named OEMs is the realistic downside. A structural remedy is unlikely and\n` +
    `  would in any event make the transaction uneconomic.\n`
  );
}

/** Deliberately cut off mid-sentence: this is what a failed multi-part upload
 *  leaves behind. It extracts fine — it just says less than it should, which is
 *  the harder failure to notice. */
function truncatedContractSummary(): string {
  const full =
    heading("MATERIAL CONTRACTS SUMMARY", `${COMPANY_NAME} — Project Anvil`) +
    section("Customer contracts") +
    `  Torvald Agritech Inc. — Master Supply Agreement\n` +
    `    Term: renews 31 December 2027. Automatic 3-year renewal absent 12 months notice.\n` +
    `    Pricing: 3% annual price-down on all part numbers.\n` +
    `    Change of control: notification only, no consent required.\n\n` +
    `  Helvexa Energy Services — Framework Agreement\n` +
    `    Term: expired 2024, operating on rolling purchase orders.\n` +
    `    Change of control: none.\n\n` +
    `  Brand & Quill Mobility — Supply and Quality Agreement\n` +
    `    Term: coterminous with vehicle platform, currently 2028.\n` +
    `    Change of control: CONSENT REQUIRED. This is one of four consents needed.\n\n` +
    section("Supplier contracts") +
    `  Sanjiu Precision Castings — Supply Agreement\n` +
    `    Term: 2027. Exclusive supply on 60% of Flow pump housings.\n` +
    `    Change of control: CONSENT REQUIRED.\n\n` +
    `  Nordmagnet Rare Earth GmbH — Supply Agreement\n` +
    `    Term: 2026, currently in renegotiation on price.\n` +
    `    Change of control: notification only.\n\n` +
    section("Financing") +
    `  See the debt structure memorandum. The Term Loan B and the Revolving Facility both\n` +
    `  contain change-of-control events of default. The Senior Notes carry a put at 101.\n\n` +
    section("Leases") +
    `  The Monterrey facility is held under a 15-year lease expiring 2031 with a change-of-\n` +
    `  control consent requirement in favour of the landlord. The Wroclaw facility is held\n` +
    `  under a 10-year lease expiring 2029. The Bielefeld site is freehold. The Suzhou site\n` +
    `  is held under a land-use right expiring 2044 which requires`;
  return full;
}

function unitDeepDive(unitKey: string): string {
  const u = BUSINESS_UNITS.find((x) => x.key === unitKey)!;
  const series = ANNUAL_HISTORY.map((y) => y.units.find((x) => x.unitKey === unitKey)).filter(
    (x): x is NonNullable<typeof x> => x !== undefined,
  );
  const first = series[0];
  const last = series[series.length - 1];
  const cagr =
    series.length > 1 && first.revenueM > 0
      ? (Math.pow(last.revenueM / first.revenueM, 1 / (series.length - 1)) - 1) * 100
      : 0;
  const peak = series.reduce((a, b) => (b.marginPct > a.marginPct ? b : a));
  const trough = series.reduce((a, b) => (b.marginPct < a.marginPct ? b : a));

  return (
    heading(`BUSINESS UNIT DEEP DIVE - ${u.name.toUpperCase()}`, `${COMPANY_NAME} - Project Anvil`) +
    section("Overview") +
    `${u.description}\n\n` +
    `  Entered the group: ${u.origin} (${u.originYear})\n` +
    (u.divestedYear ? `  Exited the group: ${u.divestedYear}\n` : "") +
    `  Primary sites: ${u.primarySites.join("; ")}\n` +
    section("Financial history") +
    `  ${padEnd("FY", 6)}${pad("Revenue", 11)}${pad("EBITDA", 10)}${pad("Margin%", 9)}\n` +
    series
      .map(
        (r) =>
          `  ${padEnd(r.fy, 6)}${pad(r.revenueM.toFixed(1), 11)}${pad(r.ebitdaM.toFixed(1), 10)}${pad(r.marginPct.toFixed(1), 9)}`,
      )
      .join("\n") +
    section("Read") +
    `  Revenue CAGR over the period held: ${cagr.toFixed(1)}%\n` +
    `  Best margin year: FY${peak.fy} at ${peak.marginPct.toFixed(1)}%\n` +
    `  Worst margin year: FY${trough.fy} at ${trough.marginPct.toFixed(1)}%\n` +
    `  FY2025 margin: ${last.marginPct.toFixed(1)}% against a long-run anchor of ${u.marginAnchorPct.toFixed(1)}%\n\n` +
    `  Customers served by this unit: ` +
    TOP_CUSTOMERS.filter((c) => c.units.includes(unitKey)).map((c) => c.name).join(", ") +
    `\n`
  );
}

function siteReview(city: string): string {
  const s = SITES.find((x) => x.city === city)!;
  const unitNames = s.units.map((k) => BUSINESS_UNITS.find((u) => u.key === k)?.name ?? k);
  return (
    heading(`SITE OPERATIONAL REVIEW - ${s.city.toUpperCase()}`, `${COMPANY_NAME} - ${s.country}`) +
    section("Profile") +
    `  Location: ${s.city}, ${s.country}\n  Role: ${s.kind}\n  Headcount: ${s.headcount}\n` +
    `  Units operated: ${unitNames.join("; ")}\n` +
    `  Share of group headcount: ${((s.headcount / TOTAL_HEADCOUNT) * 100).toFixed(1)}%\n` +
    section("Observations") +
    (s.city === "Suzhou"
      ? `  Braeburn's only Asian manufacturing footprint and the destination of the 2015\n` +
        `  relocation. The 400bps of margin the relocation was meant to deliver did not\n` +
        `  materialise; approximately 120bps did. Local wage inflation has run ahead of the\n` +
        `  2015 assumption every year since.\n\n` +
        `  This site is also where the Sanjiu castings arrive. A carve-out of Braeburn does\n` +
        `  not separate the Sanjiu relationship, which serves Flow Systems from the same\n` +
        `  supplier under the same agreement.\n`
      : s.city === "Monterrey"
        ? `  Shared between Marrow & Pike and Vantage. The lease expires 2031 and carries a\n` +
          `  change-of-control consent in favour of the landlord - one of the four consents\n` +
          `  required to close.\n\n` +
          `  The site runs at approximately 71% utilisation. Management has identified it as\n` +
          `  the natural consolidation point for Vantage's Grand Rapids volume, which would\n` +
          `  be the first real Vantage synergy in four years of ownership.\n`
        : s.city === "Bielefeld"
          ? `  Freehold, and the group's only European engineering centre. Also the location of\n` +
            `  Nordmagnet's finishing operation, which is why the magnet supply relationship is\n` +
            `  frequently and wrongly described internally as European.\n`
          : `  No material issues identified in the site visit. Utilisation and quality metrics\n` +
            `  are within the group's normal range. Capital expenditure over the last three\n` +
            `  years has been maintenance-led.\n`)
  );
}

function workstreamMemo(
  workstream: string,
  findings: string[],
  openItems: string[],
): string {
  return (
    heading(`DILIGENCE MEMORANDUM - ${workstream.toUpperCase()}`, `${COMPANY_NAME} - Project Anvil`) +
    section("Findings") +
    findings.map((f, i) => `${i + 1}. ${f}`).join("\n\n") +
    section("Open items") +
    openItems.map((o) => `  - ${o}`).join("\n") +
    "\n"
  );
}

// ─── The corpus ──────────────────────────────────────────────────────────────

export const SEED_DOCUMENTS: SeedDocument[] = [
  // ── Project Anvil: the full data room ──
  { dealKey: "anvil", name: "01 Confidential Information Memorandum.pdf", mime: PDF_MIME, build: () => pdfBytes(cim()), purpose: "The seller's case. Carries the 22.0% margin claim the QoE contradicts." },
  { dealKey: "anvil", name: "02 Quality of Earnings Report (Final).pdf", mime: PDF_MIME, build: () => pdfBytes(qoeReport()), purpose: "The buyer's counter-case. Supports 18.4%.", defect: "contradictory" },
  { dealKey: "anvil", name: "03 Financial History FY2001-FY2025.txt", mime: TXT_MIME, build: () => txtBytes(annualHistoryPack()), purpose: "The full 25-year record, group and by unit. Contains the FY2012 segment gap." },
  { dealKey: "anvil", name: "04 Quarterly Trending Pack.txt", mime: TXT_MIME, build: () => txtBytes(quarterlyPack()), purpose: "Ten quarters of recent detail, where the deterioration is visible." },
  { dealKey: "anvil", name: "05 Management Presentation.pdf", mime: PDF_MIME, build: () => pdfBytes(managementPack()), purpose: "Still shows the PRE-restatement Q3 figure.", defect: "contradictory" },
  { dealKey: "anvil", name: "06 CFO Memo - FY2025 Q3 Restatement.docx", mime: DOCX_MIME, build: () => docxBytes(restatementMemo()), purpose: "The authoritative Q3 number. Directly contradicts document 05.", defect: "contradictory" },
  { dealKey: "anvil", name: "07 Debt Structure and Covenant Analysis.pdf", mime: PDF_MIME, build: () => pdfBytes(debtAndCovenant()), purpose: "Three correct and different leverage ratios; the covenant breach after step-down." },
  { dealKey: "anvil", name: "08 Customer Concentration Analysis.txt", mime: TXT_MIME, build: () => txtBytes(customerConcentration()), purpose: "Top-5 at 44.7%; the Torvald renewal inside the hold period." },
  { dealKey: "anvil", name: "09 Supplier Risk Memorandum.docx", mime: DOCX_MIME, build: () => docxBytes(supplierRisk()), purpose: "Two sole-source dependencies; the Nordmagnet mischaracterisation." },
  { dealKey: "anvil", name: "10 Working Capital Analysis.txt", mime: TXT_MIME, build: () => txtBytes(workingCapitalAnalysis()), purpose: "The factoring programme behind the reported DSO improvement." },
  { dealKey: "anvil", name: "11 Thornevale Connect Post-Implementation Review.docx", mime: DOCX_MIME, build: () => docxBytes(connectPostMortem()), purpose: "The failed initiative, and why its costs are still being added back." },
  { dealKey: "anvil", name: "12 Strategic Plan FY2019-FY2024 (SUPERSEDED).pdf", mime: PDF_MIME, build: () => pdfBytes(staleStrategicPlan()), purpose: "Stale by seven years. Describes plans that did not happen.", defect: "stale" },
  { dealKey: "anvil", name: "13 Organisation Chart (Nov 2023).txt", mime: TXT_MIME, build: () => txtBytes(staleOrgChart()), purpose: "Three of eleven roles vacant or obsolete.", defect: "stale" },
  { dealKey: "anvil", name: "14 Nordhaven Divestiture Summary.txt", mime: TXT_MIME, build: () => txtBytes(nordhavenSummary()), purpose: "The same transaction described three different ways.", defect: "contradictory" },
  { dealKey: "anvil", name: "15 Vantage Goodwill Impairment Memorandum.pdf", mime: PDF_MIME, build: () => pdfBytes(vantageImpairment()), purpose: "The discount-rate change that drove a chunk of the charge." },
  { dealKey: "anvil", name: "16 Board Minutes Extracts 2007-2025.docx", mime: DOCX_MIME, build: () => docxBytes(boardMinutes()), purpose: "The governance record, including the dissent on Kestrel and the missing Connect reviews." },
  { dealKey: "anvil", name: "17 Material Contracts Summary (PARTIAL).txt", mime: TXT_MIME, build: () => txtBytes(truncatedContractSummary()), purpose: "Cuts off mid-sentence — a failed multi-part upload.", defect: "truncated" },
  { dealKey: "anvil", name: "18 Site Photographs (upload failed).txt", mime: TXT_MIME, build: () => txtBytes("   \n\n \t \n"), purpose: "Whitespace only. Forces extractText's explicit no-extractable-text rejection.", defect: "empty" },

  // ── Unit deep dives ──
  { dealKey: "anvil", name: "20 Unit Deep Dive - Thornevale Flow Systems.txt", mime: TXT_MIME, build: () => txtBytes(unitDeepDive("flow")), purpose: "Per-unit 25-year series for the group's profit engine." },
  { dealKey: "anvil", name: "21 Unit Deep Dive - Kestrel Thermal Systems.txt", mime: TXT_MIME, build: () => txtBytes(unitDeepDive("thermal")), purpose: "The 2007 acquisition that lost a third of its EBITDA within eighteen months." },
  { dealKey: "anvil", name: "22 Unit Deep Dive - Marrow & Pike Coatings.txt", mime: TXT_MIME, build: () => txtBytes(unitDeepDive("coatings")), purpose: "The highest-margin unit, and the FY2023 margin outlier." },
  { dealKey: "anvil", name: "23 Unit Deep Dive - Braeburn Motion Controls.txt", mime: TXT_MIME, build: () => txtBytes(unitDeepDive("motion")), purpose: "The margin walk from 15.3% to 8.9% that contradicts the 'stabilised' claim." },
  { dealKey: "anvil", name: "24 Unit Deep Dive - Vantage Sealing Technologies.txt", mime: TXT_MIME, build: () => txtBytes(unitDeepDive("sealing")), purpose: "Four years of an underperforming bolt-on." },
  { dealKey: "anvil", name: "25 Unit Deep Dive - Thornevale Connect.txt", mime: TXT_MIME, build: () => txtBytes(unitDeepDive("connect")), purpose: "A unit that existed for four years and never cleared $10M." },

  // ── Site reviews ──
  { dealKey: "anvil", name: "30 Site Review - Toledo.docx", mime: DOCX_MIME, build: () => docxBytes(siteReview("Toledo")), purpose: "Headquarters site review." },
  { dealKey: "anvil", name: "31 Site Review - Grand Rapids.docx", mime: DOCX_MIME, build: () => docxBytes(siteReview("Grand Rapids")), purpose: "Thermal and Vantage manufacturing." },
  { dealKey: "anvil", name: "32 Site Review - Monterrey.docx", mime: DOCX_MIME, build: () => docxBytes(siteReview("Monterrey")), purpose: "Carries one of the four change-of-control consents." },
  { dealKey: "anvil", name: "33 Site Review - Bielefeld.docx", mime: DOCX_MIME, build: () => docxBytes(siteReview("Bielefeld")), purpose: "Where the Nordmagnet 'European supplier' misreading comes from." },
  { dealKey: "anvil", name: "34 Site Review - Wroclaw.docx", mime: DOCX_MIME, build: () => docxBytes(siteReview("Wrocław")), purpose: "Polish site name exercises non-ASCII handling end to end." },
  { dealKey: "anvil", name: "35 Site Review - Suzhou.docx", mime: DOCX_MIME, build: () => docxBytes(siteReview("Suzhou")), purpose: "The 2015 relocation that under-delivered, and the Sanjiu entanglement." },
  { dealKey: "anvil", name: "36 Site Review - Curitiba.docx", mime: DOCX_MIME, build: () => docxBytes(siteReview("Curitiba")), purpose: "Brazilian thermal manufacturing." },
  { dealKey: "anvil", name: "37 Site Review - Pune.docx", mime: DOCX_MIME, build: () => docxBytes(siteReview("Pune")), purpose: "Indian engineering and manufacturing." },

  // ── Workstream memoranda ──
  { dealKey: "anvil", name: "40 Diligence Memo - Legal.pdf", mime: PDF_MIME, build: () => pdfBytes(workstreamMemo("Legal", [
    "Four change-of-control consents are required to close: Brand & Quill Mobility, Sanjiu Precision Castings, the Monterrey landlord, and the Term Loan B agent. Two have been approached informally; none has been obtained.",
    "The Senior Notes carry a change-of-control put at 101. On $250.0M drawn that is a $252.5M call on closing liquidity if holders put in full.",
    "Litigation: eleven open matters, none individually material. Aggregate reserve $4.2M against an aggregate claimed amount of $19.8M.",
    "A 2022 employment class action in Ohio was settled without admission for $2.1M. The settlement contains a five-year non-repetition undertaking that has one year left to run.",
  ], [
    "Consent strategy and timing for the four required consents",
    "Noteholder engagement plan ahead of signing",
    "Copies of the Sanjiu and Brand & Quill agreements in full (extracts only provided to date)",
  ])), purpose: "The four consents and the notes put — the real closing-condition risk." },
  { dealKey: "anvil", name: "41 Diligence Memo - Tax.pdf", mime: PDF_MIME, build: () => pdfBytes(workstreamMemo("Tax", [
    "Effective tax rate of 24.1% is broadly in line with the statutory blend across the group's jurisdictions.",
    "Transfer pricing between Toledo and Suzhou has not been benchmarked since 2019. The Suzhou entity's margin is above the range the 2019 study supported, which creates exposure on prior years.",
    "$18.4M of US federal NOLs expire between 2027 and 2031. Utilisation post-close is subject to a Section 382 limitation that has not been modelled.",
    "The Polish entity holds a special-economic-zone relief that terminates in 2028 and is worth approximately $1.9M a year.",
  ], [
    "Refreshed transfer-pricing study for Toledo-Suzhou",
    "Section 382 limitation modelling under the proposed structure",
    "Confirmation of the Polish SEZ termination date",
  ])), purpose: "Transfer pricing exposure and an unmodelled NOL limitation." },
  { dealKey: "anvil", name: "42 Diligence Memo - Human Resources.docx", mime: DOCX_MIME, build: () => docxBytes(workstreamMemo("Human Resources", [
    "The Chief Operating Officer role has been vacant since June 2024. Five unit presidents report directly to the CEO, which is a wider span than this group has previously run.",
    "Voluntary attrition at Braeburn was 19.4% in FY2025 against a group average of 11.2%. Exit interviews cite uncertainty about the unit's future, which is a self-fulfilling problem given the carve-out process.",
    "Two of the five unit presidents have change-of-control provisions entitling them to leave with severance within twelve months of a transaction. Neither has signed a retention agreement.",
    "The defined-benefit scheme was closed to new entrants in 2009 and is 94% funded on a technical-provisions basis.",
  ], [
    "Retention packages for the two at-risk unit presidents",
    "COO succession plan",
    "Current organisation chart (the one provided is from November 2023)",
  ])), purpose: "Key-person risk and the attrition the carve-out process is itself causing." },
  { dealKey: "anvil", name: "43 Diligence Memo - Information Technology.docx", mime: DOCX_MIME, build: () => docxBytes(workstreamMemo("Information Technology", [
    "The group runs three ERP instances: SAP at Toledo and Bielefeld, an Infor instance at Grand Rapids inherited with Kestrel, and a local system at Suzhou. A 2014 migration consolidated part of this and is where the FY2012 segment working papers were lost.",
    "Vantage has never been integrated onto any group system and closes on spreadsheets.",
    "IT spend is 1.4% of revenue against an industrial benchmark of 2.1-2.6%. The gap is a deferred-investment liability, not an efficiency.",
    "Residual Connect infrastructure remains provisioned and is costing approximately $0.9M a year three years after the programme closed.",
  ], [
    "ERP consolidation cost estimate",
    "Vantage systems integration plan",
    "Decommissioning plan for residual Connect infrastructure",
  ])), purpose: "Three ERPs, an unintegrated acquisition, and structurally under-invested IT." },
  { dealKey: "anvil", name: "44 Diligence Memo - Environmental.pdf", mime: PDF_MIME, build: () => pdfBytes(workstreamMemo("Environmental", [
    "Phase I assessments completed at all eight sites. Phase II recommended and completed at Toledo and Grand Rapids.",
    "Toledo: historical solvent contamination from operations predating the 2001 formation. Remediation is ongoing under an agreed state programme with an estimated remaining cost of $6.8M. An indemnity from the 2001 vendors expired in 2011.",
    "Grand Rapids: no material findings.",
    "The Marrow & Pike coatings operation at Monterrey handles regulated solvents under a permit that renews in 2027. No compliance issues in the last five years.",
  ], [
    "Independent estimate of the Toledo remediation liability",
    "Confirmation that no successor liability attaches beyond the agreed programme",
  ])), purpose: "A $6.8M remediation liability with an expired vendor indemnity." },
  { dealKey: "anvil", name: "45 Diligence Memo - Insurance.txt", mime: TXT_MIME, build: () => txtBytes(workstreamMemo("Insurance", [
    "Property and casualty programme renews 1 July. Limits are adequate against the group's asset base.",
    "Product liability carries a $5.0M self-insured retention. Braeburn's claims experience has run above the accrual rate, which is the source of the QoE's $6.8M warranty adjustment.",
    "No representations-and-warranties policy has been placed. Given the QoE findings, the buyer should expect a materially higher premium or broad exclusions around the restatement and the Connect add-backs.",
  ], [
    "R&W insurance market soundings",
    "Five-year Braeburn product-liability claims triangle",
  ])), purpose: "Ties the warranty accrual finding back to the QoE bridge." },

  // ── Project Anvil-Carve ──
  { dealKey: "anvil_carve", name: "01 Braeburn Carve-Out P&L.txt", mime: TXT_MIME, build: () => txtBytes(carveOutPnl()), purpose: "The disputed stranded-cost line that decides the carve-out." },
  { dealKey: "anvil_carve", name: "02 Supplier Risk Memorandum.docx", mime: DOCX_MIME, build: () => docxBytes(supplierRisk()), purpose: "The same memo filed in two data rooms — duplicate content under a different deal." },

  // ── Project Kestrel Retro ──
  { dealKey: "kestrel_retro", name: "01 Integration Synergy Plan - Year 2 Review.txt", mime: TXT_MIME, build: () => txtBytes(synergyPlanDoc()), purpose: "Planned versus actual by category; the 22% revenue-synergy pattern." },

  // ── Project Suzhou ──
  { dealKey: "suzhou", name: "01 Merger Control Brief.pdf", mime: PDF_MIME, build: () => pdfBytes(regulatoryBrief()), purpose: "Three-jurisdiction filing status and the market-definition question." },

  // ── Project Nordhaven ──
  { dealKey: "nordhaven", name: "01 Divestiture Summary.txt", mime: TXT_MIME, build: () => txtBytes(nordhavenSummary()), purpose: "Closed-deal record backing the realised outcome." },

  // ── Project Verity ──
  { dealKey: "verity", name: "01 Quality of Earnings Report (Final).pdf", mime: PDF_MIME, build: () => pdfBytes(qoeReport()), purpose: "A second deal with a QoE, so cross-deal document search returns more than one hit." },
];

/** Deliberately-broken documents, addressable by intent. */
export const DEFECTIVE_DOCUMENTS = SEED_DOCUMENTS.filter((d) => d.defect !== undefined);
export const EMPTY_DOCUMENT_NAME = "18 Site Photographs (upload failed).txt";
export const TRUNCATED_DOCUMENT_NAME = "17 Material Contracts Summary (PARTIAL).txt";
