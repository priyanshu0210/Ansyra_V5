// ─────────────────────────────────────────────────────────────────────────────
// Scenario normalisation (Phase 15.13) — a flat, addressable view of the cases
// that already live inside scenario_analyses.result.
//
// 15.6 stores a scenario RUN, not a scenario: one immutable snapshot row whose
// jsonb carries `cases: ScenarioCase[]` (downside/base/upside) plus a summary
// and watch items. That shape is right for generation — the three cases are
// composed together against one set of assumptions and only mean something as a
// set — but it is wrong for everything downstream. You cannot address one case,
// compare two, or ask what a case depends on.
//
// So this module PROJECTS. It stores nothing, adds no table, and invents no
// field. A scenario is identified by the pair that already identifies it in the
// data — `${snapshotId}:${caseName}` — and every value on it is lifted verbatim
// from the snapshot it came from. Regenerating still produces a new snapshot and
// therefore new scenario ids, which is correct: a case from run 47 is not the
// same object as the case from run 52, and the recommendation links pinned to 47
// (Phase 15.9) would be lying if it were.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT HAVE: npv, irr, payback, or any other
// per-scenario economic metric. `ScenarioCase` has never carried one, and
// `deal_economics` is unique-per-deal — a single IRR/MOIC for the whole deal,
// not one per case. The only quantity a case owns is `probabilityPct`; the only
// impact statement is free text (`thesisImpact`, `keyMetricDelta`). Compare
// surfaces must show deal economics as SHARED context, never as a column that
// varies by scenario, because it does not.
//
// Pure. No clock, no I/O. Unit-tested in contracts/scenarios.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** Display order: worst to best, the order a reader scans a range in. */
export const SCENARIO_CASE_NAMES = ["downside", "base", "upside"] as const;
export type ScenarioCaseName = (typeof SCENARIO_CASE_NAMES)[number];

export const SCENARIO_CASE_LABELS: Record<ScenarioCaseName, string> = {
  downside: "Downside",
  base: "Base",
  upside: "Upside",
};

/** How a driver assumption behaves in a case. Mirrors ScenarioCase.drivers. */
export const DRIVER_DIRECTIONS = ["holds", "breaks", "exceeds"] as const;
export type DriverDirection = (typeof DRIVER_DIRECTIONS)[number];

export const DRIVER_DIRECTION_LABELS: Record<DriverDirection, string> = {
  holds: "holds",
  breaks: "breaks",
  exceeds: "exceeds",
};

/**
 * `${snapshotId}:${caseName}` — e.g. "47:base".
 *
 * Deliberately a readable composite rather than an opaque id, for the same
 * reason patternId is: both halves are meaningful, enumerable and short, and a
 * hash would make every debugging session worse. It is also honest about the
 * fact that a scenario has no independent identity — it is a case OF a run.
 */
export type ScenarioId = `${number}:${ScenarioCaseName}`;

export function scenarioId(snapshotId: number, caseName: ScenarioCaseName): ScenarioId {
  return `${snapshotId}:${caseName}`;
}

/** Inverse of scenarioId. Null for anything malformed — never throws, because
 *  this parses ids that arrive from a URL or a client payload. */
export function parseScenarioId(
  id: string,
): { snapshotId: number; caseName: ScenarioCaseName } | null {
  const at = id.indexOf(":");
  if (at <= 0) return null;
  const snapshotId = Number(id.slice(0, at));
  const caseName = id.slice(at + 1);
  if (!Number.isInteger(snapshotId) || snapshotId <= 0) return null;
  if (!(SCENARIO_CASE_NAMES as readonly string[]).includes(caseName)) return null;
  return { snapshotId, caseName: caseName as ScenarioCaseName };
}

// ─── Structural inputs ───────────────────────────────────────────────────────
// Shaped so a drizzle row satisfies them uncast, the GateableRecommendation
// instinct. Only the fields this module actually reads are required.

export interface ScenarioCaseInput {
  name: string;
  probabilityPct: number;
  narrative: string;
  drivers: readonly { assumption: string; direction: string }[];
  thesisImpact: string;
  keyMetricDelta?: string | null;
}

export interface ScenarioSnapshotInput {
  id: number;
  dealId: number;
  createdAt: Date | string;
  createdBy?: string | null;
  model?: string | null;
  assumptionCount?: number | null;
  result: {
    cases?: readonly ScenarioCaseInput[] | null;
    summary?: string | null;
    watchItems?: readonly string[] | null;
  } | null;
}

export interface AssumptionInput {
  id: number;
  assumption: string;
}

// ─── The projection ──────────────────────────────────────────────────────────

export interface ScenarioDriver {
  assumption: string;
  direction: DriverDirection;
  /** The deal assumption this driver names, when one matches. Null is the
   *  honest answer, not a failure: the generator writes prose, and a driver may
   *  legitimately describe something nobody logged as an assumption. */
  assumptionId: number | null;
}

export interface Scenario {
  id: ScenarioId;
  dealId: number;
  snapshotId: number;
  caseName: ScenarioCaseName;
  label: string;
  probabilityPct: number;
  narrative: string;
  thesisImpact: string;
  /** Free text as generated ("EBITDA -12%"), never a parsed number — parsing it
   *  into a metric would be inventing an economic field. */
  keyMetricDelta: string | null;
  drivers: ScenarioDriver[];
  createdAt: Date | string;
  createdBy: string | null;
  model: string | null;
  /** How many assumptions fed the snapshot — powers the existing staleness hint. */
  snapshotAssumptionCount: number;
}

/**
 * Normalise a free-text driver name for matching.
 *
 * Case, surrounding whitespace, internal whitespace runs and trailing sentence
 * punctuation are all noise the generator introduces; nothing else is touched.
 * In particular this does NOT stem, fuzzy-match or take a prefix — a driver that
 * merely resembles an assumption must stay unmatched, because a wrong link on a
 * decision surface is worse than an absent one.
 */
export function normaliseDriverName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,;:!?]+$/, "");
}

/** Index a deal's assumptions by normalised text. Later duplicates lose to the
 *  first, so the mapping is deterministic regardless of row order. */
export function indexAssumptions(rows: readonly AssumptionInput[]): Map<string, number> {
  const byText = new Map<string, number>();
  for (const r of rows) {
    const key = normaliseDriverName(r.assumption);
    if (key && !byText.has(key)) byText.set(key, r.id);
  }
  return byText;
}

function caseOrdinal(name: ScenarioCaseName): number {
  return SCENARIO_CASE_NAMES.indexOf(name);
}

/**
 * Project snapshots into flat scenarios.
 *
 * Ordering is newest snapshot first, then downside → base → upside within a
 * run, so the most recent range reads top-down in the order a partner scans it.
 * Cases whose `name` is not one of the three are dropped rather than coerced:
 * the vocabulary is closed, and a fourth case would be a generation bug, not a
 * new kind of scenario.
 */
export function projectScenarios(
  snapshots: readonly ScenarioSnapshotInput[],
  assumptions: readonly AssumptionInput[] = [],
): Scenario[] {
  const byText = indexAssumptions(assumptions);
  const out: Scenario[] = [];

  for (const snap of snapshots) {
    for (const c of snap.result?.cases ?? []) {
      if (!(SCENARIO_CASE_NAMES as readonly string[]).includes(c.name)) continue;
      const caseName = c.name as ScenarioCaseName;
      out.push({
        id: scenarioId(snap.id, caseName),
        dealId: snap.dealId,
        snapshotId: snap.id,
        caseName,
        label: SCENARIO_CASE_LABELS[caseName],
        probabilityPct: c.probabilityPct,
        narrative: c.narrative,
        thesisImpact: c.thesisImpact,
        keyMetricDelta: c.keyMetricDelta ?? null,
        drivers: (c.drivers ?? []).map((d) => ({
          assumption: d.assumption,
          direction: (DRIVER_DIRECTIONS as readonly string[]).includes(d.direction)
            ? (d.direction as DriverDirection)
            : "holds",
          assumptionId: byText.get(normaliseDriverName(d.assumption)) ?? null,
        })),
        createdAt: snap.createdAt,
        createdBy: snap.createdBy ?? null,
        model: snap.model ?? null,
        snapshotAssumptionCount: snap.assumptionCount ?? 0,
      });
    }
  }

  return out.sort(
    (a, b) => b.snapshotId - a.snapshotId || caseOrdinal(a.caseName) - caseOrdinal(b.caseName),
  );
}

/** The scenarios belonging to one run, in display order. */
export function scenariosOfSnapshot(
  scenarios: readonly Scenario[],
  snapshotId: number,
): Scenario[] {
  return scenarios.filter((s) => s.snapshotId === snapshotId);
}

/** Reverse direction: which scenarios name this assumption as a driver. */
export function scenariosForAssumption(
  scenarios: readonly Scenario[],
  assumptionId: number,
): Scenario[] {
  return scenarios.filter((s) => s.drivers.some((d) => d.assumptionId === assumptionId));
}

/** Drivers the generator named that match no logged assumption. Surfaced rather
 *  than hidden: an unmatched driver is usually a real gap in the ledger. */
export function unmatchedDrivers(scenario: Scenario): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of scenario.drivers) {
    if (d.assumptionId !== null) continue;
    const key = normaliseDriverName(d.assumption);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(d.assumption);
    }
  }
  return out;
}

// ─── Compare ─────────────────────────────────────────────────────────────────
// Two or three cases side by side. Three is the cap because the compare grid is
// read on a dossier that already carries several panels, and a fourth column
// makes every cell narrower than the sentences inside it.

export const MIN_COMPARE = 2;
export const MAX_COMPARE = 3;

/**
 * Resolve requested ids to scenarios, in the caller's chosen order.
 *
 * Unknown ids are dropped rather than erroring: a stale link or a regenerated
 * snapshot should degrade to "that case is gone", not blow up the panel.
 */
export function resolveCompareSelection(
  scenarios: readonly Scenario[],
  ids: readonly string[],
): Scenario[] {
  const byId = new Map(scenarios.map((s) => [s.id as string, s]));
  const seen = new Set<string>();
  const out: Scenario[] = [];
  for (const id of ids) {
    const s = byId.get(id);
    if (s && !seen.has(id)) {
      seen.add(id);
      out.push(s);
    }
  }
  return out.slice(0, MAX_COMPARE);
}

export function canCompare(selected: readonly unknown[]): boolean {
  return selected.length >= MIN_COMPARE && selected.length <= MAX_COMPARE;
}

/** Why a compare selection is not yet actionable. Null once it is. */
export function compareBlockedMessage(selectedCount: number): string | null {
  if (selectedCount < MIN_COMPARE) {
    const need = MIN_COMPARE - selectedCount;
    return `Select ${need} more case${need === 1 ? "" : "s"} to compare.`;
  }
  if (selectedCount > MAX_COMPARE) return `Compare up to ${MAX_COMPARE} cases at a time.`;
  return null;
}

export interface DriverComparison {
  assumption: string;
  assumptionId: number | null;
  /** Direction per selected scenario, positionally aligned with the selection.
   *  Null where that case does not name this driver at all. */
  directions: (DriverDirection | null)[];
  /** True when every selected case names it AND agrees on the direction. */
  agrees: boolean;
}

/**
 * Driver-by-driver across the selection.
 *
 * This is the part of a compare that actually earns its place: the narratives
 * are prose a reader can compare unaided, but "which assumption do these cases
 * disagree about" is the question the range exists to answer, and it is tedious
 * to answer by eye. Disagreements sort first for that reason.
 *
 * Keyed on the normalised driver name so the same assumption written with
 * different capitalisation in two cases still lines up on one row.
 */
export function compareDrivers(selected: readonly Scenario[]): DriverComparison[] {
  const order: string[] = [];
  const byKey = new Map<string, DriverComparison>();

  selected.forEach((scenario, col) => {
    for (const d of scenario.drivers) {
      const key = normaliseDriverName(d.assumption);
      if (!key) continue;
      let row = byKey.get(key);
      if (!row) {
        row = {
          assumption: d.assumption,
          assumptionId: d.assumptionId,
          directions: Array(selected.length).fill(null),
          agrees: false,
        };
        byKey.set(key, row);
        order.push(key);
      }
      row.directions[col] = d.direction;
      // A resolved id anywhere wins: one case naming it exactly is enough.
      if (row.assumptionId === null && d.assumptionId !== null) {
        row.assumptionId = d.assumptionId;
      }
    }
  });

  const rows = order.map((k) => byKey.get(k)!);
  for (const r of rows) {
    const present = r.directions.filter((d): d is DriverDirection => d !== null);
    r.agrees = present.length === r.directions.length && new Set(present).size === 1;
  }
  // Disagreements first, then partially-named, then unanimous; stable within.
  return rows.sort((a, b) => Number(a.agrees) - Number(b.agrees));
}

// ─── Recommendations in play ─────────────────────────────────────────────────

/** What a linked recommendation's fate is if this case materialises. Derived
 *  from the shipped 15.9 relation vocabulary — never a second vocabulary. */
export type RecommendationStance = "at_risk" | "depends_on" | "survives";

export const RECOMMENDATION_STANCE_LABELS: Record<RecommendationStance, string> = {
  at_risk: "Would change",
  depends_on: "Rests on this case",
  survives: "Built to survive it",
};

export function stanceOfRelation(relation: string): RecommendationStance {
  switch (relation) {
    // The claim is wrong, or argued against, in this case.
    case "relevant_if_false":
    case "contradicted_by":
      return "at_risk";
    // The claim is underwritten on this case obtaining.
    case "assumes":
    case "supports":
      return "depends_on";
    case "stress_case":
    default:
      return "survives";
  }
}

export interface ScenarioLinkInput {
  recommendationId: number;
  scenarioAnalysisId: number;
  caseName: string;
  relation: string;
  claim?: string | null;
  status?: string | null;
}

export interface RecommendationInPlay {
  recommendationId: number;
  claim: string | null;
  status: string | null;
  relation: string;
  stance: RecommendationStance;
}

/**
 * Recommendations linked to a scenario, with what the link means for them.
 *
 * A link whose case is "all" applies to every case of that run — that is what
 * "whole run" means in SCENARIO_LINK_CASES, and dropping it here would silently
 * hide the most common kind of citation.
 */
export function recommendationsInPlay(
  scenario: Scenario,
  links: readonly ScenarioLinkInput[],
): RecommendationInPlay[] {
  const out: RecommendationInPlay[] = [];
  const seen = new Set<number>();
  for (const l of links) {
    if (l.scenarioAnalysisId !== scenario.snapshotId) continue;
    if (l.caseName !== "all" && l.caseName !== scenario.caseName) continue;
    if (seen.has(l.recommendationId)) continue;
    seen.add(l.recommendationId);
    out.push({
      recommendationId: l.recommendationId,
      claim: l.claim ?? null,
      status: l.status ?? null,
      relation: l.relation,
      stance: stanceOfRelation(l.relation),
    });
  }
  // Most consequential first: what breaks, then what rests on it, then the rest.
  const rank: Record<RecommendationStance, number> = { at_risk: 0, depends_on: 1, survives: 2 };
  return out.sort((a, b) => rank[a.stance] - rank[b.stance] || a.recommendationId - b.recommendationId);
}

/** One line under a compare column. Null when nothing is linked, so the UI can
 *  omit the row rather than print "0 recommendations". */
export function inPlaySummary(rows: readonly RecommendationInPlay[]): string | null {
  if (rows.length === 0) return null;
  const atRisk = rows.filter((r) => r.stance === "at_risk").length;
  if (atRisk === 0) {
    return `${rows.length} linked recommendation${rows.length === 1 ? "" : "s"}, none at risk.`;
  }
  return `${atRisk} of ${rows.length} linked recommendation${rows.length === 1 ? "" : "s"} would change.`;
}

// ─── The chain: scenario -> assumptions/recommendations -> outcomes (15.19) ──
//
// 15.13 got the compare as far as "which conclusions are in play and which
// assumptions do these cases disagree about". It stopped there, which left the
// most interesting column missing: what actually HAPPENED to any of it.
//
// Both ledgers already exist and both are append-only, so this adds no storage
// and no vocabulary — it reads OUTCOME_TYPE_LABELS and OUTCOME_SIGNAL from
// contracts/outcomes, the same map the two ledger panels render from.

import { OUTCOME_SIGNAL, OUTCOME_TYPE_LABELS, type OutcomeType } from "./outcomes";

/** Structural: satisfied uncast by a recommendation_outcomes row AND by an
 *  assumption_outcomes row, which is why neither id is required here. */
export interface OutcomeRowInput {
  outcomeType: string;
  horizon?: string | null;
  recordedAt: Date | string;
}

export interface OutcomeGlimpse {
  outcomeType: string;
  label: string;
  signal: "positive" | "negative" | "neutral";
  horizon: string | null;
  recordedAt: Date | string;
}

/**
 * The LATEST read, because that is the one that decides.
 *
 * A claim that held at 30 days and broke at 6 months is contradicted, and
 * showing the first read would invert the answer. Ties break on nothing — the
 * later element in the supplied array wins — because the callers hand these
 * over already ordered by `recordedAt` from the query layer.
 */
export function latestGlimpse(rows: readonly OutcomeRowInput[]): OutcomeGlimpse | null {
  let best: OutcomeRowInput | null = null;
  for (const r of rows) {
    if (best === null || new Date(r.recordedAt).getTime() >= new Date(best.recordedAt).getTime()) {
      best = r;
    }
  }
  if (best === null) return null;
  return {
    outcomeType: best.outcomeType,
    label: OUTCOME_TYPE_LABELS[best.outcomeType as OutcomeType] ?? best.outcomeType,
    signal: OUTCOME_SIGNAL[best.outcomeType as OutcomeType] ?? "neutral",
    horizon: best.horizon ?? null,
    recordedAt: best.recordedAt,
  };
}

export type WithOutcome<T> = T & { latestOutcome: OutcomeGlimpse | null };

export interface ChainInput {
  links: readonly ScenarioLinkInput[];
  /** recommendation_outcomes rows for the deal. */
  recommendationOutcomes?: readonly (OutcomeRowInput & { recommendationId: number })[];
  /** assumption_outcomes rows for the deal. */
  assumptionOutcomes?: readonly (OutcomeRowInput & { assumptionId: number })[];
}

export interface ScenarioChain {
  drivers: WithOutcome<ScenarioDriver>[];
  recommendations: WithOutcome<RecommendationInPlay>[];
  /** Reads recorded anywhere along this chain. Zero means the case has not been
   *  tested against reality yet — which the UI should say, rather than showing
   *  an empty column that reads as "nothing went wrong". */
  readsRecorded: number;
}

/**
 * One scenario's full chain.
 *
 * A driver with no resolved `assumptionId` can carry no outcome: the generator
 * named something the assumption ledger does not hold, so there is nothing to
 * have read back. That stays null rather than being matched by text, for the
 * reason projectScenarios refuses text matching in the first place.
 */
export function scenarioChain(scenario: Scenario, input: ChainInput): ScenarioChain {
  const byRec = new Map<number, OutcomeRowInput[]>();
  for (const o of input.recommendationOutcomes ?? []) {
    byRec.set(o.recommendationId, [...(byRec.get(o.recommendationId) ?? []), o]);
  }
  const byAssumption = new Map<number, OutcomeRowInput[]>();
  for (const o of input.assumptionOutcomes ?? []) {
    byAssumption.set(o.assumptionId, [...(byAssumption.get(o.assumptionId) ?? []), o]);
  }

  const drivers: WithOutcome<ScenarioDriver>[] = scenario.drivers.map((d) => ({
    ...d,
    latestOutcome:
      d.assumptionId === null ? null : latestGlimpse(byAssumption.get(d.assumptionId) ?? []),
  }));

  const recommendations: WithOutcome<RecommendationInPlay>[] = recommendationsInPlay(
    scenario,
    input.links,
  ).map((r) => ({ ...r, latestOutcome: latestGlimpse(byRec.get(r.recommendationId) ?? []) }));

  const readsRecorded =
    drivers.filter((d) => d.latestOutcome !== null).length +
    recommendations.filter((r) => r.latestOutcome !== null).length;

  return { drivers, recommendations, readsRecorded };
}

/** One line for the chain's foot. Null when reads exist, so the UI only speaks
 *  up to say the case has never been tested. */
export function untestedChainNote(chain: ScenarioChain): string | null {
  if (chain.readsRecorded > 0) return null;
  if (chain.drivers.length === 0 && chain.recommendations.length === 0) return null;
  return "Nothing along this chain has been read back yet.";
}
