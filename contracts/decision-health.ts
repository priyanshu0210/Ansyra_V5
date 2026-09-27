// ─────────────────────────────────────────────────────────────────────────────
// Decision health (Phase 15.12) — one read-only answer to "is this deal's
// decision healthy?", folded from four layers that already exist.
//
// 15.8 gave recommendations a gate, 15.9 an outcome ledger, 15.10 a failure-
// pattern engine, 15.11 a read schedule. Each has its own panel and each is
// correct. What was missing is the sentence a partner actually wants.
//
// This module ENFORCES NOTHING and STORES NOTHING. It reads the shipped
// predicates rather than restating them: gateState decides the gate,
// unansweredCounterarguments decides what "unanswered" means, horizonStates
// decides what is owed, matchesPattern decides what matches. Every one of those
// is imported, never reimplemented.
//
// The one thing it must NOT produce is the gate SENTENCE. gateStateHeadline is
// rendered once, in Recommendations.tsx, beside the controls that resolve it. A
// second copy on a summary card is a second thing to keep in sync and a second
// thing that can lie. This module emits a one-word chip and nothing more; a
// wiring test asserts it imports neither gateStateHeadline nor
// recommendationGateReason.
//
// Pure + clock-injected. Unit-tested in contracts/decision-health.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { DEAL_STAGES, stageOrdinal } from "./stages";
import {
  gateState,
  isExpired,
  type GateLockReason,
  type GateState,
} from "./recommendation-gate";
import {
  confidenceBand,
  unansweredCounterarguments,
  type ConfidenceBand,
  type Counterargument,
} from "./recommendations";
import {
  SCHEDULED_HORIZONS,
  SCHEDULED_HORIZON_PHRASE,
  horizonStates,
  summariseSchedule,
  type HorizonStatus,
  type ScheduleOutcomeRow,
  type ScheduledHorizon,
} from "./outcome-schedule";
import { matchesPattern, type FailurePattern, type PatternSeverity } from "./failure-patterns";
import { todayIso } from "./milestones";

// ─── Inputs ──────────────────────────────────────────────────────────────────
// Structural, so a drizzle row satisfies them without a cast — the same
// instinct as GateableRecommendation in contracts/recommendation-gate.ts.

export interface HealthRecommendation {
  id: number;
  stage: string;
  status: string;
  confidence: number;
  expiresAt?: Date | string | null;
  decidedAt?: Date | string | null;
  supportingEvidence: readonly { kind: string }[];
  counterarguments: readonly Counterargument[];
}

export interface HealthOutcome extends ScheduleOutcomeRow {
  recommendationId: number;
}

export interface DecisionHealthInput {
  dealId: number;
  stage: string;
  recommendations: readonly HealthRecommendation[];
  outcomes: readonly HealthOutcome[];
  patterns: readonly FailurePattern[];
  closeDate?: string | null;
  /** Gate clock (an instant). */
  now?: Date;
  /**
   * Schedule clock (a calendar day). Two clocks deliberately: gateState takes a
   * Date and horizonStates takes an ISO day, because one asks about an instant
   * and the other about a diary date. Unifying them here would put a third
   * definition of "now" in the codebase.
   */
  today?: string;
}

// ─── Outputs ─────────────────────────────────────────────────────────────────

export type GateStatus = "ungated" | "clear" | "blocked";

/** The ONLY gate text this module produces. Never the sentence. */
export const GATE_CHIP_LABELS: Record<GateStatus, string> = {
  ungated: "Gate: not applicable",
  clear: "Gate: clear",
  blocked: "Gate: blocked",
};

export interface FatalObjections {
  /** Actionable. These must be answered before the draft can be accepted. */
  onDrafts: number;
  /**
   * Should be 0 by construction: accept checks canAccept, update rejects any
   * non-draft edit, and supersede re-checks. A non-zero value means the row
   * predates the rule or arrived by import — a data note, not a reprimand, and
   * the UI renders it as one.
   */
  onAccepted: number;
}

export interface HorizonCoverage {
  horizon: ScheduledHorizon;
  /** A read actually on file at this horizon. */
  logged: number;
  /**
   * Closed because the claim went moot — NOT a read. horizonStates keeps this
   * distinct so the UI never says "read recorded" about silence; folding it into
   * `logged` would undo that in one line.
   */
  closedAsMoot: number;
  due: number;
  upcoming: number;
  /** The denominator: logged + closedAsMoot + due + upcoming. Excludes unanchored. */
  scheduled: number;
  /** No anchor to count from. Reported, never counted — the OwedRollup posture. */
  unanchored: number;
}

/**
 * A pattern this deal matches.
 *
 * `exampleRecommendationIds` is DELIBERATELY ABSENT. patterns.list exposes those
 * to `analytics` holders on purpose; this payload rides the `recommendations`
 * gate, and handing out cross-deal recommendation ids through it would make this
 * card a back door. The card has nowhere to send a reader anyway — the "where
 * this showed up" links live in Analytics.
 */
export interface MatchedPattern {
  patternId: string;
  severity: PatternSeverity;
  description: string;
  lowSample: boolean;
}

export const MAX_MATCHED_PATTERNS = 3;

export interface DecisionHealth {
  dealId: number;
  stage: string;
  nextStage: string | null;
  /** The shipped model, stored verbatim — never re-derived. */
  gate: GateState;
  gateStatus: GateStatus;
  blockingReason: GateLockReason | null;
  totalRecommendations: number;
  acceptedRecommendations: number;
  liveAccepted: number;
  expiredAccepted: number;
  /**
   * Drafts at THIS stage. A census, not a claim: drafts never block, the absence
   * of an accepted recommendation does. Nothing derives blocked-ness from this.
   */
  draftsPending: number;
  unansweredFatal: FatalObjections;
  coverage: HorizonCoverage[];
  /**
   * Computed and typed, but deliberately NOT rendered by the card: the
   * Recommendations header already shows it, and the two numbers come from
   * different clocks (this one server-side, that one in the browser), so around
   * a midnight they could differ by one. Coverage ratios are timezone-independent.
   */
  readsOwed: number;
  mostOverdueDays: number | null;
  patternsMatched: MatchedPattern[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function gateStatusOf(g: GateState): GateStatus {
  return g.kind === "ungated" ? "ungated" : g.kind === "clear" ? "clear" : "blocked";
}

export function blockingReasonOf(g: GateState): GateLockReason | null {
  return g.kind === "locked" ? g.reason : null;
}

/**
 * Unanswered FATAL objections, split by whose problem they are.
 *
 * Not one number: merging an action item (a draft you must answer) with a
 * data-integrity signal (an accepted row that should be impossible) would make
 * both unreadable. Fatals on rejected or superseded rows count nowhere — nobody
 * is standing behind that claim, so nobody owes an answer.
 */
export function countUnansweredFatal(
  rows: readonly HealthRecommendation[],
): FatalObjections {
  let onDrafts = 0;
  let onAccepted = 0;
  for (const r of rows) {
    // The one definition of "unanswered", read rather than restated — it
    // already treats a whitespace-only response as no response.
    const fatal = unansweredCounterarguments(r.counterarguments).filter(
      (c) => c.weight === "fatal",
    ).length;
    if (fatal === 0) continue;
    if (r.status === "draft") onDrafts += fatal;
    else if (r.status === "accepted") onAccepted += fatal;
  }
  return { onDrafts, onAccepted };
}

/** Always four entries, always in SCHEDULED_HORIZONS order. */
export function coverageByHorizon(
  schedules: Iterable<readonly HorizonStatus[]>,
): HorizonCoverage[] {
  const blank = () => ({ logged: 0, closedAsMoot: 0, due: 0, upcoming: 0, unanchored: 0 });
  const acc = new Map<ScheduledHorizon, ReturnType<typeof blank>>(
    SCHEDULED_HORIZONS.map((h) => [h, blank()]),
  );
  for (const states of schedules) {
    for (const s of states) {
      const a = acc.get(s.horizon);
      if (!a) continue;
      if (s.state === "completed") {
        if (s.closedAsMoot) a.closedAsMoot += 1;
        else a.logged += 1;
      } else if (s.state === "due") a.due += 1;
      else if (s.state === "upcoming") a.upcoming += 1;
      else a.unanchored += 1;
    }
  }
  return SCHEDULED_HORIZONS.map((horizon) => {
    const a = acc.get(horizon)!;
    return { horizon, ...a, scheduled: a.logged + a.closedAsMoot + a.due + a.upcoming };
  });
}

/**
 * "30-day: 3 of 5 logged". Null when no recommendation owes this horizon at
 * all, so the card renders nothing rather than a row of zeros.
 *
 * A deal with no closing milestone has no DENOMINATOR for post-close, so it is
 * never rendered as "0 of 0 logged" — that would read as a failure to act on
 * something that was never scheduled.
 */
export function coverageLabel(c: HorizonCoverage): string | null {
  const phrase = SCHEDULED_HORIZON_PHRASE[c.horizon];
  if (c.scheduled === 0 && c.unanchored === 0) return null;
  if (c.scheduled === 0) {
    return `${phrase}: not scheduled — this deal has no closing milestone`;
  }
  const moot = c.closedAsMoot > 0 ? ` (${c.closedAsMoot} closed as moot)` : "";
  const base = `${phrase}: ${c.logged} of ${c.scheduled} logged${moot}`;
  if (c.unanchored === 0) return base;
  return `${base} — ${c.unanchored} not scheduled (this deal has no closing milestone)`;
}

/**
 * Which known failure patterns this deal's recommendations sit inside.
 *
 * Deduped by patternId, input order preserved (sortPatterns already ranked them
 * most-consequential-first), and capped — a card carries a line, not a report.
 * `bandOf` is injected for the same reason matchesPattern injects it.
 */
export function matchedPatterns(
  rows: readonly HealthRecommendation[],
  patterns: readonly FailurePattern[],
  bandOf: (n: number) => ConfidenceBand = confidenceBand,
  limit: number = MAX_MATCHED_PATTERNS,
): MatchedPattern[] {
  const out: MatchedPattern[] = [];
  const seen = new Set<string>();
  for (const p of patterns) {
    if (out.length >= limit) break;
    if (seen.has(p.patternId)) continue;
    if (!rows.some((r) => matchesPattern(r, p, bandOf))) continue;
    seen.add(p.patternId);
    out.push({
      patternId: p.patternId,
      severity: p.severity,
      description: p.description,
      lowSample: p.lowSample,
    });
  }
  return out;
}

// ─── The fold ────────────────────────────────────────────────────────────────

/**
 * Everything above, in one pass. Takes plain data and returns plain data, so it
 * is testable with no database and would work client-side unchanged.
 */
export function buildDecisionHealth(input: DecisionHealthInput): DecisionHealth {
  const { dealId, stage, recommendations: rows, outcomes, patterns, closeDate } = input;
  const now = input.now ?? new Date();
  const today = input.today ?? todayIso(now);

  // The same expression Recommendations.tsx uses — not a second stage model.
  const nextStage = DEAL_STAGES[stageOrdinal(stage) + 1] ?? null;

  const gate = gateState(rows, stage, nextStage ?? undefined, now);

  const byRec = new Map<number, ScheduleOutcomeRow[]>();
  for (const o of outcomes) {
    byRec.set(o.recommendationId, [...(byRec.get(o.recommendationId) ?? []), o]);
  }

  const schedules = rows.map((r) => horizonStates(r, byRec.get(r.id) ?? [], closeDate, today));
  const owed = summariseSchedule(schedules.flat());

  const accepted = rows.filter((r) => r.status === "accepted");
  const expiredAccepted = accepted.filter((r) => isExpired(r.expiresAt, now)).length;

  return {
    dealId,
    stage,
    nextStage,
    gate,
    gateStatus: gateStatusOf(gate),
    blockingReason: blockingReasonOf(gate),
    totalRecommendations: rows.length,
    acceptedRecommendations: accepted.length,
    liveAccepted: accepted.length - expiredAccepted,
    expiredAccepted,
    draftsPending: rows.filter((r) => r.stage === stage && r.status === "draft").length,
    unansweredFatal: countUnansweredFatal(rows),
    coverage: coverageByHorizon(schedules),
    readsOwed: owed.owed,
    mostOverdueDays: owed.mostOverdueDays,
    patternsMatched: matchedPatterns(rows, patterns),
  };
}
