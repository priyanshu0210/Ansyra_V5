// The outcome ledger (Phase 15.9) — what actually happened to a conclusion.
//
// A recommendation records what the firm believed. This records what came of it,
// and it is append-only with many entries per recommendation, because the
// trajectory is the point: being wrong at thirty days and right at six months is
// precisely the signal a failure-pattern detector wants, and one editable
// verdict destroys it.
//
// Shared FE/BE for the same reason contracts/recommendations.ts is: the button
// and the server must judge a row the same way. Pure + unit-tested
// (see contracts/outcomes.test.ts).

export const OUTCOME_TYPES = [
  "held", // the claim proved right
  "partially_held", // right in direction, wrong in degree
  "contradicted", // the claim proved wrong
  "too_early", // we looked and cannot yet tell — NOT the same as never looking
  "moot", // circumstances changed; the claim no longer applies
] as const;
export type OutcomeType = (typeof OUTCOME_TYPES)[number];

export const OUTCOME_TYPE_LABELS: Record<OutcomeType, string> = {
  held: "Held",
  partially_held: "Partially held",
  contradicted: "Contradicted",
  too_early: "Too early to tell",
  moot: "Moot",
};

/** Which severity token tints the chip. The meaning lives here; the colour lives
 *  in the card, which is the only place that knows about CSS variables. */
export const OUTCOME_SIGNAL: Record<OutcomeType, "positive" | "negative" | "neutral"> = {
  held: "positive",
  partially_held: "neutral",
  contradicted: "negative",
  too_early: "neutral",
  moot: "neutral",
};

/** Which read this is. Nullable on the row: an ad-hoc observation still counts. */
export const OUTCOME_HORIZONS = ["30_day", "90_day", "6_month", "post_close", "ad_hoc"] as const;
export type OutcomeHorizon = (typeof OUTCOME_HORIZONS)[number];

export const OUTCOME_HORIZON_LABELS: Record<OutcomeHorizon, string> = {
  "30_day": "30-day read",
  "90_day": "90-day read",
  "6_month": "6-month read",
  post_close: "Post-close",
  ad_hoc: "Ad-hoc",
};

/**
 * Outcomes attach to DECIDED recommendations only. Nobody has claimed a draft,
 * so there is nothing for it to have been right or wrong about. Enforced on both
 * sides, exactly like canAccept.
 *
 * Note this deliberately INCLUDES rejected and superseded rows — see isHighSignal.
 */
export function canRecordOutcome(status: string): boolean {
  return status !== "draft";
}

export function outcomeBlockedMessage(): string {
  return "Outcomes attach to decided recommendations. Accept or reject this draft first.";
}

export interface OutcomeRow {
  outcomeType: string;
  recordedAt: Date | string;
}

/** What the card hands back when a human records a reading. Lives here rather
 *  than in the component because a .tsx may only export components. */
export interface NewOutcome {
  outcomeType: OutcomeType;
  outcomeSummary: string;
  horizon?: OutcomeHorizon;
  recordedAt?: Date;
}

/** Ascending by the date of the reading — the trajectory is the point, so this
 *  is the canonical order and no component sorts for itself. */
export function outcomeTrajectory<T extends OutcomeRow>(rows: readonly T[]): T[] {
  return rows
    .slice()
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime());
}

export function latestOutcome<T extends OutcomeRow>(rows: readonly T[]): T | null {
  const ordered = outcomeTrajectory(rows);
  return ordered.length > 0 ? ordered[ordered.length - 1] : null;
}

export type ReviewState = "not_decided" | "never_reviewed" | "reviewed";

export interface ReviewStatus {
  state: ReviewState;
  reads: number;
  daysSinceDecision: number | null;
  daysSinceLastRead: number | null;
}

const DAY_MS = 86_400_000;
const daysSince = (from: Date | string | null | undefined, now: Date): number | null => {
  if (from == null) return null;
  const t = new Date(from).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((now.getTime() - t) / DAY_MS);
};

/**
 * "Has anyone gone back and checked?" — the derived question the whole ledger
 * exists to answer, and the one a dossier should surface without being asked.
 *
 * Clock injected, per the react-hooks/purity rule; same shape as isExpired in
 * contracts/recommendation-gate.ts.
 */
export function reviewStatus(
  rec: { status: string; decidedAt?: Date | string | null },
  outcomes: readonly OutcomeRow[],
  now: Date = new Date(),
): ReviewStatus {
  const daysSinceDecision = daysSince(rec.decidedAt, now);
  if (!canRecordOutcome(rec.status)) {
    return { state: "not_decided", reads: 0, daysSinceDecision, daysSinceLastRead: null };
  }
  const last = latestOutcome(outcomes);
  if (!last) {
    return { state: "never_reviewed", reads: 0, daysSinceDecision, daysSinceLastRead: null };
  }
  return {
    state: "reviewed",
    reads: outcomes.length,
    daysSinceDecision,
    daysSinceLastRead: daysSince(last.recordedAt, now),
  };
}

/** "today" / "1 day ago" / "12 days ago" — "0 days ago" is not a thing anyone says. */
function agoPhrase(days: number): string {
  if (days <= 0) return "today";
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** The one line the card shows outside the expand. Null when there is nothing
 *  worth saying (an undecided draft). */
export function reviewStatusMessage(s: ReviewStatus, latestType?: string): string | null {
  if (s.state === "not_decided") return null;
  if (s.state === "never_reviewed") {
    return s.daysSinceDecision === null
      ? "Never reviewed"
      : `Decided ${agoPhrase(s.daysSinceDecision)} · never reviewed`;
  }
  const label = latestType
    ? (OUTCOME_TYPE_LABELS[latestType as OutcomeType] ?? latestType).toLowerCase()
    : "recorded";
  const ago = s.daysSinceLastRead === null ? "" : `, ${agoPhrase(s.daysSinceLastRead)}`;
  return `${s.reads} read${s.reads === 1 ? "" : "s"} · last: ${label}${ago}`;
}

/**
 * The two combinations worth interrupting a reader for.
 *
 * A rejected recommendation that turned out true, and an accepted one that
 * turned out false, are the highest-signal rows in the system — they are the
 * only two that say the firm's judgement was wrong in a specific, dated,
 * attributable way. Made machine-readable so the UI can find them without
 * matching on prose, and so a future failure-pattern detector has one
 * definition to read rather than inventing its own.
 */
export function isHighSignal(recStatus: string, outcomeType: string): boolean {
  return (
    (recStatus === "rejected" && outcomeType === "held") ||
    (recStatus === "accepted" && outcomeType === "contradicted")
  );
}

export function highSignalLabel(recStatus: string): string {
  return recStatus === "rejected" ? "Rejected — and it held." : "Accepted — and it did not.";
}
