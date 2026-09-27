// ─────────────────────────────────────────────────────────────────────────────
// `thornevale-v1` — the composed synthetic dataset, and the integrity rules it
// has to satisfy.
//
// The re-exports are the boring half. The interesting half is `validateDataset`,
// which encodes every consistency rule the corpus must hold: no dangling
// references, no rows that would violate a unique index, scenario probabilities
// that sum to 100, synergy totals that equal their own periods, and — the one
// that actually caught something — every deal sitting at a stage the
// recommendation gate says it could legally have reached.
//
// That last check found four deals in an impossible state on first run. It is
// worth being precise about why that mattered: a corpus describing a history
// the product forbids is worse than no corpus, because every gate test written
// against it would have been asserting a lie and passing.
//
// The seeder runs this before it writes anything, and a unit test runs it in CI
// with no database at all.
// ─────────────────────────────────────────────────────────────────────────────
export * from "./ids";
export * from "./company";
export * from "./financials";
export * from "./deals";
export * from "./documents";
export * from "./analytics";
export { pdfBytes, docxBytes, txtBytes, asciiFold, wrap, zipBytes } from "./binary";

import { DATASET_VERSION, SEED_USERS, ORG_A_ID, ORG_B_ID } from "./ids";
import { ANNUAL_HISTORY, NET_DEBT_M, QUARTERLY_HISTORY } from "./financials";
import { FY_FIRST, FY_LAST } from "./company";
import { SEED_DEALS, SEED_TARGETS } from "./deals";
import { SEED_DOCUMENTS } from "./documents";
import {
  SEED_ASSUMPTIONS,
  SEED_ASSUMPTION_OUTCOMES,
  SEED_COMMENTS,
  SEED_CULTURAL_SCORES,
  SEED_DD_OVERRIDES,
  SEED_DECISIONS,
  SEED_IC_MEMOS,
  SEED_RECOMMENDATIONS,
  SEED_RECOMMENDATION_OUTCOMES,
  SEED_REGULATORY_ANALYSES,
  SEED_SCENARIOS,
  SEED_SCENARIO_LINKS,
  SEED_SYNERGY_CATEGORIES,
} from "./analytics";
import { isGatedTransition, satisfyingRecommendations } from "@contracts/recommendation-gate";
import { DEAL_STAGES } from "@contracts/stages";

/** Row counts, for the dataset documentation and for a "did the seed land"
 *  sanity check that does not require knowing the corpus by heart. */
export function datasetManifest() {
  return {
    version: DATASET_VERSION,
    organizations: 2,
    users: SEED_USERS.length,
    deals: SEED_DEALS.length,
    targets: SEED_TARGETS.length,
    documents: SEED_DOCUMENTS.length,
    assumptions: SEED_ASSUMPTIONS.length,
    assumptionOutcomes: SEED_ASSUMPTION_OUTCOMES.length,
    scenarioSnapshots: SEED_SCENARIOS.length,
    recommendations: SEED_RECOMMENDATIONS.length,
    recommendationOutcomes: SEED_RECOMMENDATION_OUTCOMES.length,
    scenarioLinks: SEED_SCENARIO_LINKS.length,
    decisions: SEED_DECISIONS.length,
    ddOverrides: SEED_DD_OVERRIDES.length,
    comments: SEED_COMMENTS.length,
    culturalScores: SEED_CULTURAL_SCORES.length,
    regulatoryAnalyses: SEED_REGULATORY_ANALYSES.length,
    icMemos: SEED_IC_MEMOS.length,
    synergyCategories: SEED_SYNERGY_CATEGORIES.length,
    annualYears: ANNUAL_HISTORY.length,
    quarters: QUARTERLY_HISTORY.length,
  };
}

/**
 * Every rule the corpus must satisfy. Returns the problems rather than throwing
 * them one at a time, so a broken fixture reports everything wrong with it in
 * one pass instead of one error per run.
 */
export function validateDataset(now = new Date("2026-08-20T00:00:00.000Z")): string[] {
  const problems: string[] = [];
  const dealKeys = new Set(SEED_DEALS.map((d) => d.key));
  const assumptionKeys = new Set(SEED_ASSUMPTIONS.map((a) => a.key));
  const scenarioKeys = new Set(SEED_SCENARIOS.map((s) => s.key));
  const recommendationKeys = new Set(SEED_RECOMMENDATIONS.map((r) => r.key));

  const uniq = (label: string, values: string[]) => {
    const seen = new Set<string>();
    for (const v of values) {
      if (seen.has(v)) problems.push(`${label}: duplicate "${v}"`);
      seen.add(v);
    }
  };

  // ── Handles must be unique; everything downstream resolves by them.
  uniq("deal key", SEED_DEALS.map((d) => d.key));
  uniq("assumption key", SEED_ASSUMPTIONS.map((a) => a.key));
  uniq("scenario key", SEED_SCENARIOS.map((s) => s.key));
  uniq("recommendation key", SEED_RECOMMENDATIONS.map((r) => r.key));
  uniq("user id", SEED_USERS.map((u) => u.id));
  uniq("user email", SEED_USERS.map((u) => u.email));

  // ── Nothing may reference a handle that does not exist.
  const ref = (ok: boolean, msg: string) => {
    if (!ok) problems.push(msg);
  };
  for (const a of SEED_ASSUMPTIONS) ref(dealKeys.has(a.dealKey), `assumption ${a.key} -> unknown deal ${a.dealKey}`);
  for (const s of SEED_SCENARIOS) ref(dealKeys.has(s.dealKey), `scenario ${s.key} -> unknown deal ${s.dealKey}`);
  for (const d of SEED_DOCUMENTS) ref(dealKeys.has(d.dealKey), `document "${d.name}" -> unknown deal ${d.dealKey}`);
  for (const d of SEED_DECISIONS) ref(dealKeys.has(d.dealKey), `decision -> unknown deal ${d.dealKey}`);
  for (const d of SEED_DD_OVERRIDES) ref(dealKeys.has(d.dealKey), `dd item -> unknown deal ${d.dealKey}`);
  for (const c of SEED_COMMENTS) ref(dealKeys.has(c.dealKey), `comment -> unknown deal ${c.dealKey}`);
  for (const c of SEED_CULTURAL_SCORES) ref(dealKeys.has(c.dealKey), `cultural score -> unknown deal ${c.dealKey}`);
  for (const r of SEED_REGULATORY_ANALYSES) ref(dealKeys.has(r.dealKey), `regulatory analysis -> unknown deal ${r.dealKey}`);

  for (const r of SEED_RECOMMENDATIONS) {
    ref(dealKeys.has(r.dealKey), `recommendation ${r.key} -> unknown deal ${r.dealKey}`);
    if (r.supersedesKey) {
      ref(recommendationKeys.has(r.supersedesKey), `recommendation ${r.key} supersedes unknown ${r.supersedesKey}`);
    }
    for (const e of r.evidence) {
      if (e.kind === "assumption") ref(assumptionKeys.has(e.assumptionKey), `recommendation ${r.key} cites unknown assumption ${e.assumptionKey}`);
      else if (e.kind === "scenario") ref(scenarioKeys.has(e.scenarioKey), `recommendation ${r.key} cites unknown scenario ${e.scenarioKey}`);
      else if (e.kind !== "document_analysis") ref(dealKeys.has(e.dealKey), `recommendation ${r.key} cites unknown deal ${e.dealKey}`);
    }
  }
  for (const o of SEED_RECOMMENDATION_OUTCOMES) {
    ref(recommendationKeys.has(o.subjectKey), `recommendation outcome -> unknown recommendation ${o.subjectKey}`);
  }
  for (const o of SEED_ASSUMPTION_OUTCOMES) {
    ref(assumptionKeys.has(o.subjectKey), `assumption outcome -> unknown assumption ${o.subjectKey}`);
  }
  for (const l of SEED_SCENARIO_LINKS) {
    ref(recommendationKeys.has(l.recommendationKey), `scenario link -> unknown recommendation ${l.recommendationKey}`);
    ref(scenarioKeys.has(l.scenarioKey), `scenario link -> unknown scenario ${l.scenarioKey}`);
  }
  for (const m of SEED_IC_MEMOS) {
    ref(dealKeys.has(m.dealKey), `ic memo -> unknown deal ${m.dealKey}`);
    for (const k of m.recommendationKeys) ref(recommendationKeys.has(k), `ic memo cites unknown recommendation ${k}`);
  }

  // ── Rows that would violate a real unique index.
  uniq("scenario link", SEED_SCENARIO_LINKS.map((l) => `${l.recommendationKey}|${l.scenarioKey}|${l.caseName}`));
  uniq("dd item", SEED_DD_OVERRIDES.map((d) => `${d.dealKey}|${d.item}`));
  uniq("deal economics", SEED_DEALS.filter((d) => d.economics).map((d) => d.key));

  // ── Scenario cases: three cases, probabilities summing to exactly 100.
  for (const s of SEED_SCENARIOS) {
    const sum = s.result.cases.reduce((n, c) => n + c.probabilityPct, 0);
    if (sum !== 100) problems.push(`scenario ${s.key}: probabilities sum to ${sum}, must be 100`);
    const names = s.result.cases.map((c) => c.name).sort().join(",");
    if (names !== "base,downside,upside") problems.push(`scenario ${s.key}: cases are "${names}", must be base/downside/upside`);
  }

  // ── Synergy totals are the sum of their own periods (the server derives them).
  for (const c of SEED_SYNERGY_CATEGORIES) {
    if (!c.periods) continue;
    const p = Math.round(c.periods.reduce((n, x) => n + x.planned, 0) * 10) / 10;
    const a = Math.round(c.periods.reduce((n, x) => n + x.actual, 0) * 10) / 10;
    if (p !== c.planned) problems.push(`synergy "${c.category}": planned ${c.planned} != periods ${p}`);
    if (a !== c.actual) problems.push(`synergy "${c.category}": actual ${c.actual} != periods ${a}`);
  }

  // ── THE STAGE-GATE RULE. Every deal must sit at a stage it could legally have
  //    reached: the recommendation gate needs an accepted, unexpired
  //    recommendation recorded at the stage being LEFT.
  for (const deal of SEED_DEALS) {
    const idx = DEAL_STAGES.indexOf(deal.stage);
    if (idx <= 0) continue;
    const from = DEAL_STAGES[idx - 1];
    if (!isGatedTransition(from, deal.stage)) continue;
    const rows = SEED_RECOMMENDATIONS.filter((r) => r.dealKey === deal.key).map((r) => ({
      stage: r.stage,
      status: r.status,
      expiresAt: r.expiresInDays === null ? null : new Date(now.getTime() + r.expiresInDays * 86_400_000),
    }));
    if (satisfyingRecommendations(rows, from, now).length === 0) {
      problems.push(
        `deal "${deal.key}" is at ${deal.stage} but has no accepted, unexpired recommendation at ${from} — ` +
          `the recommendation gate says this state is unreachable`,
      );
    }
  }

  // ── The financial model must agree with itself.
  if (ANNUAL_HISTORY.length !== FY_LAST - FY_FIRST + 1) {
    problems.push(`annual history has ${ANNUAL_HISTORY.length} years, expected ${FY_LAST - FY_FIRST + 1}`);
  }
  const lastYear = ANNUAL_HISTORY[ANNUAL_HISTORY.length - 1];
  if (lastYear.netDebtM !== NET_DEBT_M) {
    problems.push(`FY${lastYear.fy} net debt ${lastYear.netDebtM} does not match the debt schedule's ${NET_DEBT_M}`);
  }
  for (const y of ANNUAL_HISTORY) {
    const unitSum = Math.round(y.units.reduce((n, u) => n + u.revenueM, 0) * 10) / 10;
    if (Math.abs(unitSum - y.revenueM) > 0.15) {
      problems.push(`FY${y.fy}: group revenue ${y.revenueM} != sum of units ${unitSum}`);
    }
  }

  // ── The two sandbox organisations must be distinct, and every user must
  //    belong to one of them. The org id IS the dataset's namespace.
  // Widened to string on purpose: tsc knows these are distinct literals today,
  // but the check exists to catch someone pasting the same uuid into both
  // constants tomorrow, which would silently collapse the isolation control.
  if ((ORG_A_ID as string) === (ORG_B_ID as string)) {
    problems.push("ORG_A_ID and ORG_B_ID are the same uuid");
  }
  for (const u of SEED_USERS) {
    if (u.organizationId !== ORG_A_ID && u.organizationId !== ORG_B_ID) {
      problems.push(`user ${u.email} is not in either sandbox organisation`);
    }
  }

  return problems;
}
