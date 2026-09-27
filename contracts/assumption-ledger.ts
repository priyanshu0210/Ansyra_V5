// ─────────────────────────────────────────────────────────────────────────────
// Assumption-to-outcome ledger (Phase 15.15).
//
// WHAT THIS IS NOT: a second assumption model. `assumptions` has been a real
// table since Phase 3 — statement, reviewer, reviewer note, and the AI's
// stress-test `result`. It has exactly one producer (ai.stressTestAssumption),
// so there is nothing scattered to unify and no `module`/`source` axis to add:
// such a column would read "assumptions" on every row ever written.
//
// What was missing is the other half of the loop. A recommendation can be read
// back at 30/90/180 days (15.9); an assumption could not, even though the
// assumption is the thing that actually turns out to be right or wrong. This
// module is the projection that closes that.
//
// WHAT IT REUSES RATHER THAN RESTATES:
//   - blocksAdvancement (contracts/assumption-gate) decides "red flag". The
//     gate already owns assumption status; a second AssumptionStatus enum would
//     be a second answer to a question that already has one.
//   - OUTCOME_TYPES / OUTCOME_HORIZONS (contracts/outcomes) are the same
//     vocabulary the recommendation ledger uses. A read is a read.
//   - horizonStatesFrom (contracts/outcome-schedule) is the same clock, shared
//     as a primitive rather than copied.
//   - supporting_evidence with kind "assumption" is ALREADY how a recommendation
//     cites an assumption. The forward direction shipped in 15.8; this module
//     only builds the reverse index. No join table is added, because one would
//     be a second place for the same fact to live.
//
// THE ONE NEW CONCEPT is `category`. Cross-deal learning has to fold on
// something, and a free-text statement cannot be folded — "EBITDA margin holds"
// and "margins are sustainable" are the same claim and no aggregate can see it.
// The vocabulary below is closed and set at creation, so a cluster means
// something precise. It is deliberately NOT derived from the statement text by
// keyword: 15.13 refused exactly that for scenario drivers, and a mis-filed
// assumption would silently corrupt a cross-deal claim.
//
// Pure. Clock-injected. Unit-tested in contracts/assumption-ledger.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { blocksAdvancement, type GateableAssumption } from "./assumption-gate";
import { OUTCOME_SIGNAL, type OutcomeType } from "./outcomes";
import {
  SCHEDULED_HORIZONS,
  horizonStatesFrom,
  isoDateOf,
  summariseSchedule,
  type HorizonStatus,
  type OwedSummary,
  type ScheduleOutcomeRow,
} from "./outcome-schedule";
import { todayIso } from "./milestones";

/** The axis cross-deal learning folds on. Closed, and short on purpose: an
 *  axis with thirty values never clears a support floor. */
export const ASSUMPTION_CATEGORIES = [
  "revenue_retention",
  "margin",
  "integration",
  "regulatory",
  "market",
  "financing",
  "other",
] as const;
export type AssumptionCategory = (typeof ASSUMPTION_CATEGORIES)[number];

export const ASSUMPTION_CATEGORY_LABELS: Record<AssumptionCategory, string> = {
  revenue_retention: "Revenue retention",
  margin: "Margin",
  integration: "Integration",
  regulatory: "Regulatory",
  market: "Market",
  financing: "Financing",
  other: "Other",
};

/** Shown next to the picker so the classification is a decision, not a guess. */
export const ASSUMPTION_CATEGORY_HINTS: Record<AssumptionCategory, string> = {
  revenue_retention: "Churn, customer concentration, renewal rates.",
  margin: "EBITDA, cost base, pricing power, cost synergies.",
  integration: "Talent retention, systems, operating model, timing.",
  regulatory: "Clearance, remedies, licensing, review delay.",
  market: "Demand, competition, cycle, market share.",
  financing: "Leverage, rates, covenants, capital structure.",
  other: "Anything the six above would misfile.",
};

export function isAssumptionCategory(v: unknown): v is AssumptionCategory {
  return typeof v === "string" && (ASSUMPTION_CATEGORIES as readonly string[]).includes(v);
}

/** Unknown/absent categories fall to "other" rather than being dropped: an
 *  uncategorised assumption is still an assumption, and silently excluding it
 *  from the ledger would make the deal panel disagree with the table. */
export function coerceCategory(v: unknown): AssumptionCategory {
  return isAssumptionCategory(v) ? v : "other";
}

/** The existing serial primary key. Named for readability at call sites; there
 *  is deliberately no composite id here, unlike ScenarioId — an assumption row
 *  really does have its own identity. */
export type AssumptionId = number;

// ─── Structural inputs ───────────────────────────────────────────────────────
// Shaped so drizzle rows satisfy them uncast.

export interface AssumptionRowInput extends GateableAssumption {
  id: AssumptionId;
  dealId: number;
  assumption: string;
  category?: string | null;
  reviewer?: string | null;
  reviewerNote?: string | null;
  result?: { optimismScore?: number | null; confidence?: string | null; reviewHistory?: import("./assumption-gate").AssumptionReview[] } | null;
  createdAt: Date | string;
  createdBy?: string | null;
}

export interface AssumptionOutcomeInput extends ScheduleOutcomeRow {
  id: number;
  assumptionId: AssumptionId;
  outcomeType: string;
  outcomeSummary?: string | null;
  horizon?: string | null;
  recordedAt: Date | string;
  /** Set when this read was filed alongside a recommendation outcome. An
   *  explicit pointer, never an inferred one — see linkedRecommendationOutcomeId
   *  in the schema comment. */
  recommendationOutcomeId?: number | null;
}

/** A recommendation that cites this assumption in supporting_evidence. */
export interface CitingRecommendationInput {
  id: number;
  claim: string;
  status: string;
  stage?: string | null;
  decidedAt?: Date | string | null;
  /** The evidence array as stored — read, never rewritten. */
  supportingEvidence?: readonly { kind: string; id: number }[] | null;
}

// ─── The projection ──────────────────────────────────────────────────────────

export interface LedgerAssumption {
  id: AssumptionId;
  dealId: number;
  statement: string;
  category: AssumptionCategory;
  categoryLabel: string;
  /** From the SHIPPED gate predicate, never re-derived. */
  isRedFlag: boolean;
  optimismScore: number | null;
  reviewerNote: string | null;
  reviewHistory: import("./assumption-gate").AssumptionReview[];
  createdAt: Date | string;
  createdBy: string | null;
  /** Recommendations citing this assumption, newest decision first. */
  citedBy: { id: number; claim: string; status: string; stage: string | null }[];
  /** The date the firm ACTED on this assumption — earliest decidedAt among
   *  citing recommendations. Null when nothing has been decided on it yet. */
  actedOnAt: string | null;
  outcomes: AssumptionOutcomeInput[];
  horizons: HorizonStatus[];
  schedule: OwedSummary;
}

/**
 * Which recommendations cite this assumption.
 *
 * Reads `supporting_evidence` — the link 15.8 already ships — rather than a new
 * join table. `kind` must match too: evidence ids are per-kind serials, so an
 * economics row with the same numeric id is a different object entirely.
 */
export function citingRecommendations<T extends CitingRecommendationInput>(
  assumptionId: AssumptionId,
  recs: readonly T[],
): T[] {
  return recs.filter((r) =>
    (r.supportingEvidence ?? []).some((e) => e.kind === "assumption" && e.id === assumptionId),
  );
}

/**
 * When the firm acted on this assumption: the earliest decision among the
 * recommendations that cite it.
 *
 * Drafts do not count — a draft is a thought, not an act — so an assumption
 * cited only by drafts owes nothing yet. This mirrors `scheduledHorizons`,
 * where a recommendation owes reads only once it has been decided, and it is
 * why the ledger does not drown a user in owed reads for every stress test they
 * have ever run.
 */
export function actedOnDate(recs: readonly CitingRecommendationInput[]): string | null {
  let earliest: string | null = null;
  for (const r of recs) {
    if (r.status !== "accepted" && r.status !== "rejected") continue;
    const iso = isoDateOf(r.decidedAt);
    if (iso === null) continue;
    if (earliest === null || iso < earliest) earliest = iso;
  }
  return earliest;
}

/** An assumption owes the standard four reads once it has been acted on, and
 *  nothing before that. */
export function assumptionHorizons(actedOn: string | null) {
  return actedOn === null ? [] : [...SCHEDULED_HORIZONS];
}

export interface ProjectAssumptionsInput {
  assumptions: readonly AssumptionRowInput[];
  outcomes: readonly AssumptionOutcomeInput[];
  recommendations: readonly CitingRecommendationInput[];
  closeDate?: string | null;
  today?: string;
}

/**
 * One deal's assumption ledger.
 *
 * Ordering: red flags first (they are the ones holding the deal up), then
 * newest. Within that, everything is lifted verbatim from the row.
 */
export function projectAssumptionLedger(input: ProjectAssumptionsInput): LedgerAssumption[] {
  const today = input.today ?? todayIso();

  const byAssumption = new Map<number, AssumptionOutcomeInput[]>();
  for (const o of input.outcomes) {
    byAssumption.set(o.assumptionId, [...(byAssumption.get(o.assumptionId) ?? []), o]);
  }

  const rows = input.assumptions.map((a) => {
    const cited = citingRecommendations(a.id, input.recommendations);
    const actedOn = actedOnDate(cited);
    const outcomes = (byAssumption.get(a.id) ?? []).slice().sort(sortByRecordedAt);
    const horizons = horizonStatesFrom(
      assumptionHorizons(actedOn),
      actedOn,
      outcomes,
      input.closeDate ?? null,
      today,
    );
    const category = coerceCategory(a.category);

    return {
      id: a.id,
      dealId: a.dealId,
      statement: a.assumption,
      category,
      categoryLabel: ASSUMPTION_CATEGORY_LABELS[category],
      isRedFlag: blocksAdvancement(a),
      optimismScore: a.result?.optimismScore ?? null,
      reviewerNote: a.reviewerNote ?? null,
      reviewHistory: a.result?.reviewHistory ?? [],
      createdAt: a.createdAt,
      createdBy: a.createdBy ?? null,
      citedBy: cited.map((r) => ({
        id: r.id,
        claim: r.claim,
        status: r.status,
        stage: r.stage ?? null,
      })),
      actedOnAt: actedOn,
      outcomes,
      horizons,
      schedule: summariseSchedule(horizons, outcomes),
    };
  });

  return rows.sort(
    (a, b) => Number(b.isRedFlag) - Number(a.isRedFlag) || compareCreatedDesc(a, b),
  );
}

function sortByRecordedAt(a: AssumptionOutcomeInput, b: AssumptionOutcomeInput): number {
  const at = new Date(a.recordedAt).getTime();
  const bt = new Date(b.recordedAt).getTime();
  return at - bt || a.id - b.id;
}

function compareCreatedDesc(a: LedgerAssumption, b: LedgerAssumption): number {
  const at = new Date(a.createdAt).getTime();
  const bt = new Date(b.createdAt).getTime();
  return bt - at || b.id - a.id;
}

// ─── Deal-level summary ──────────────────────────────────────────────────────

export interface AssumptionLedgerSummary {
  total: number;
  redFlags: number;
  actedOn: number;
  readsLogged: number;
  readsOwed: number;
  /** Assumptions whose latest read went against them. The number a partner
   *  actually wants: what did we get wrong. */
  contradicted: number;
  held: number;
}

export function summariseLedger(rows: readonly LedgerAssumption[]): AssumptionLedgerSummary {
  let redFlags = 0;
  let actedOn = 0;
  let readsLogged = 0;
  let readsOwed = 0;
  let contradicted = 0;
  let held = 0;

  for (const r of rows) {
    if (r.isRedFlag) redFlags++;
    if (r.actedOnAt !== null) actedOn++;
    readsLogged += r.outcomes.length;
    readsOwed += r.schedule.owed;
    const latest = r.outcomes[r.outcomes.length - 1];
    if (latest) {
      const signal = OUTCOME_SIGNAL[latest.outcomeType as OutcomeType];
      if (signal === "negative") contradicted++;
      else if (signal === "positive") held++;
    }
  }

  return { total: rows.length, redFlags, actedOn, readsLogged, readsOwed, contradicted, held };
}

/** One line for the panel header. Null when there is nothing to summarise, so
 *  the UI omits the line rather than printing zeroes. */
export function ledgerHeadline(s: AssumptionLedgerSummary): string | null {
  if (s.total === 0) return null;
  const parts: string[] = [`${s.total} assumption${s.total === 1 ? "" : "s"}`];
  if (s.redFlags > 0) parts.push(`${s.redFlags} unanswered red flag${s.redFlags === 1 ? "" : "s"}`);
  if (s.readsOwed > 0) parts.push(`${s.readsOwed} read${s.readsOwed === 1 ? "" : "s"} owed`);
  if (s.contradicted > 0) parts.push(`${s.contradicted} contradicted so far`);
  return parts.join(" · ");
}
