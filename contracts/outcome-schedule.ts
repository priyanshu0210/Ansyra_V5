// ─────────────────────────────────────────────────────────────────────────────
// Outcome scheduling (Phase 15.11) — what the firm still owes itself.
//
// 15.9 gave outcomes a `horizon` column and left it as free-choice metadata:
// nothing anchored "30_day" to a date, and "post_close" anchored to nothing at
// all. This turns those labels into a schedule, so a conclusion accepted four
// months ago can say out loud that nobody has been back to look.
//
// Nothing is stored. "Owed" is derived from recommendations + outcomes +
// milestones on every read, so it is correct by construction and there is no
// state to go stale. That is also why there is no reminder table and no
// `last_notified` column: see §16c of the recommendations blueprint for the
// email path this deliberately does not build.
//
// DATE-ONLY STRINGS throughout, borrowed from contracts/milestones.ts. The
// anchor on the other side is already `date({ mode: "string" })` — a closing
// date is a calendar day, not an instant — and "is the 90-day read due?" is a
// calendar question. Nobody owes a read at 14:32.
//
// Pure + clock-injected. Unit-tested in contracts/outcome-schedule.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { daysUntil, todayIso } from "./milestones";
import type { OutcomeHorizon } from "./outcomes";

/**
 * The horizons a decided recommendation owes.
 *
 * `ad_hoc` is absent, and its absence IS the rule: an ad-hoc read is one someone
 * chose to take outside a schedule, so it can never be owed. Enforced here by
 * construction rather than by a filter somewhere downstream.
 */
export const SCHEDULED_HORIZONS = ["30_day", "90_day", "6_month", "post_close"] as const;
export type ScheduledHorizon = (typeof SCHEDULED_HORIZONS)[number];

/** Which fact a horizon counts from. Kept separate from the offset so "when does
 *  the clock start" and "how long does it run" cannot be confused. */
export const HORIZON_ANCHORS: Record<ScheduledHorizon, "decision" | "close"> = {
  "30_day": "decision",
  "90_day": "decision",
  "6_month": "decision",
  post_close: "close",
};

type Offset = { days: number } | { months: number };

export const HORIZON_OFFSETS: Record<ScheduledHorizon, Offset> = {
  "30_day": { days: 30 },
  "90_day": { days: 90 },
  // Calendar months, not 180 days — see addMonths.
  "6_month": { months: 6 },
  // The close date IS the post-close read's due date. A lag is a product
  // decision nobody has made; zero is the one that asserts nothing.
  post_close: { days: 0 },
};

/**
 * `upcoming` — anchored, not yet due.
 * `due` — anchored and the date has arrived or passed.
 * `completed` — a read carrying this exact horizon label is on file (or the
 *   claim went moot).
 * `unanchored` — no date to count from, so it can never be owed or overdue.
 *
 * "Overdue" is deliberately NOT a fifth state: it answers the same question as
 * `due` for a work queue, and splitting it would force every consumer to write
 * `s === "due" || s === "overdue"`. `daysUntilDue` is signed instead, and
 * callers hand it to countdownLabel/urgencyOf, which already make that
 * distinction for display.
 */
export type HorizonState = "upcoming" | "due" | "completed" | "unanchored";

const DAY_MS = 86_400_000;

/**
 * A stored instant → the calendar day it happened on, in UTC. The one place a
 * Date becomes a date; nothing below this line handles a Date.
 *
 * UTC deliberately, where todayIso reads LOCAL components. `decidedAt` is an
 * instant written server-side; rendering it through local getters would put a
 * late-evening accept on the next day for a reader in UTC+13, and the same
 * recommendation would then fall due on different days for two members of one
 * firm. "Today" is a human question and belongs in the reader's timezone; "the
 * day this was decided" is a fact and does not.
 */
export function isoDateOf(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

export function addDays(iso: string, days: number): string | null {
  const base = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(base)) return null;
  return new Date(base + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Add whole CALENDAR months, clamping to the last valid day of the target month.
 *
 * Six months after 31 August is 28 (or 29) February — not 2 March, which is what
 * Date's rollover gives, and not 27 February, which is what 180 days gives. A
 * six-month read is a date a human writes in a diary; this produces that date.
 * Total over negative months and leap years.
 */
export function addMonths(iso: string, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const target = mo - 1 + months; // 0-indexed; may run either way
  const ty = y + Math.floor(target / 12);
  const tm = ((target % 12) + 12) % 12;
  // Day 0 of the NEXT month is the last day of this one — the idiom, and the
  // only clamp that stays right across leap years.
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const td = Math.min(d, lastDay);
  return `${String(ty).padStart(4, "0")}-${String(tm + 1).padStart(2, "0")}-${String(td).padStart(2, "0")}`;
}

export interface SchedulableRecommendation {
  status: string;
  decidedAt?: Date | string | null;
}

/**
 * Which horizons this recommendation owes.
 *
 * NOT canRecordOutcome, and the distinction matters. That predicate answers
 * "may a human attach a reading to this row" and deliberately says yes to
 * superseded, because isHighSignal wants those rows. This answers "does the firm
 * still owe itself a look" — and a superseded conclusion has been replaced by
 * one carrying the live claim at the same stage, whose own clock started on the
 * day of the replacement. Scheduling both asks one question twice; worse,
 * `decidedAt` on a superseded row is its ORIGINAL accept time and never moves,
 * so every revision would add three permanently-overdue items. A queue that
 * grows when you do the right thing is a queue nobody keeps.
 */
export function scheduledHorizons(rec: SchedulableRecommendation): ScheduledHorizon[] {
  if (rec.status !== "accepted" && rec.status !== "rejected") return [];
  if (isoDateOf(rec.decidedAt) === null) return [];
  return [...SCHEDULED_HORIZONS];
}

/** The date a horizon falls due on, or null when there is nothing to count from. */
export function horizonDueDate(
  horizon: ScheduledHorizon,
  rec: SchedulableRecommendation,
  closeDate?: string | null,
): string | null {
  const off = HORIZON_OFFSETS[horizon];
  const anchor =
    HORIZON_ANCHORS[horizon] === "close" ? (closeDate ?? null) : isoDateOf(rec.decidedAt);
  // No closing milestone → no post-close anchor → unanchored. Never guessed from
  // deals.stage, never defaulted to decision + N: an invented anchor would put a
  // date on a queue item that has no date.
  if (anchor === null) return null;
  return "months" in off ? addMonths(anchor, off.months) : addDays(anchor, off.days);
}

export interface ScheduleOutcomeRow {
  id?: number;
  horizon?: string | null;
  outcomeType?: string | null;
}

export interface HorizonStatus {
  horizon: ScheduledHorizon;
  state: HorizonState;
  dueDate: string | null;
  /** Negative = overdue. Null when unanchored. */
  daysUntilDue: number | null;
  satisfiedByOutcomeId?: number;
  /** True when this closed because the claim went moot, not because anyone
   *  looked. Kept distinct so the UI never says "read recorded" about silence. */
  closedAsMoot?: boolean;
}

/**
 * Per-horizon state for one recommendation.
 *
 * An outcome satisfies a horizon IFF `outcome.horizon` equals it — exact string
 * match, never date proximity. `recordedAt` is user-settable by design ("a
 * 30-day read written up in month two is still a 30-day read"), so inferring the
 * horizon from the date would override the user's own explicit choice with a
 * guess, on the one field the schema comment says not to trust for that. A read
 * with no horizon therefore satisfies nothing — it is reported separately in
 * summariseSchedule rather than silently credited, the same instinct as 15.10's
 * `unspecified`.
 */
export function horizonStates(
  rec: SchedulableRecommendation,
  outcomes: readonly ScheduleOutcomeRow[],
  closeDate?: string | null,
  now: string = todayIso(),
): HorizonStatus[] {
  return horizonStatesFrom(
    scheduledHorizons(rec),
    isoDateOf(rec.decidedAt),
    outcomes,
    closeDate,
    now,
  );
}

/**
 * The anchor-driven core of `horizonStates`, shared rather than duplicated.
 *
 * Everything above reads `rec` in exactly two ways — which horizons are owed at
 * all, and what date the decision clock starts from — so those are the two
 * parameters here. Extracted for the assumption ledger (Phase 15.15), which
 * owes the same four reads on the same offsets but anchors them on a different
 * event: an assumption has no `status` and no `decidedAt`, and forcing it into
 * a recommendation-shaped object to reuse this would be a lie in the type.
 *
 * `horizons` is passed rather than derived so a caller can legitimately owe
 * nothing (superseded recommendations already do exactly that).
 */
export function horizonStatesFrom(
  horizons: readonly ScheduledHorizon[],
  decisionAnchor: string | null,
  outcomes: readonly ScheduleOutcomeRow[],
  closeDate?: string | null,
  now: string = todayIso(),
): HorizonStatus[] {
  const logged = new Map<string, number | undefined>();
  let mootId: number | undefined;
  let sawMoot = false;
  for (const o of outcomes) {
    if (o.horizon) logged.set(o.horizon, o.id);
    if (o.outcomeType === "moot" && !sawMoot) {
      sawMoot = true;
      mootId = o.id;
    }
  }

  return horizons.map((horizon) => {
    const off = HORIZON_OFFSETS[horizon];
    const anchor = HORIZON_ANCHORS[horizon] === "close" ? (closeDate ?? null) : decisionAnchor;
    const dueDate =
      anchor === null
        ? null
        : "months" in off
          ? addMonths(anchor, off.months)
          : addDays(anchor, off.days);
    const daysUntilDue = dueDate ? daysUntil(dueDate, now) : null;

    // Completed BEATS unanchored, deliberately: someone who filed a post-close
    // read on a deal with no closing milestone has done the work, and calling it
    // unanchored would ask them again forever.
    if (logged.has(horizon)) {
      return {
        horizon,
        state: "completed" as const,
        dueDate,
        daysUntilDue,
        satisfiedByOutcomeId: logged.get(horizon),
      };
    }
    // A moot claim closes the rest: "circumstances changed; the claim no longer
    // applies" makes a later read archaeology, not learning.
    if (sawMoot) {
      return {
        horizon,
        state: "completed" as const,
        dueDate,
        daysUntilDue,
        satisfiedByOutcomeId: mootId,
        closedAsMoot: true,
      };
    }
    if (dueDate === null) {
      return { horizon, state: "unanchored" as const, dueDate: null, daysUntilDue: null };
    }
    // The due date itself is a day you owe, not a day you have.
    return {
      horizon,
      state: (daysUntilDue !== null && daysUntilDue <= 0 ? "due" : "upcoming") as HorizonState,
      dueDate,
      daysUntilDue,
    };
  });
}

export interface OwedSummary {
  owed: number;
  upcoming: number;
  completed: number;
  unanchored: number;
  /** Reads on file naming no horizon. Never owed, never complete — counted here
   *  so the number is visible rather than quietly lost. */
  unlabelled: number;
  /** Owed only, per horizon. */
  byHorizon: Partial<Record<ScheduledHorizon, number>>;
  /** Largest positive overdue day-count, or null when nothing is overdue. */
  mostOverdueDays: number | null;
}

export function owedCount(states: readonly HorizonStatus[]): number {
  return states.filter((s) => s.state === "due").length;
}

export function summariseSchedule(
  states: readonly HorizonStatus[],
  outcomes: readonly ScheduleOutcomeRow[] = [],
): OwedSummary {
  const byHorizon: Partial<Record<ScheduledHorizon, number>> = {};
  let owed = 0;
  let upcoming = 0;
  let completed = 0;
  let unanchored = 0;
  let mostOverdueDays: number | null = null;

  for (const s of states) {
    if (s.state === "due") {
      owed += 1;
      byHorizon[s.horizon] = (byHorizon[s.horizon] ?? 0) + 1;
      const over = s.daysUntilDue === null ? 0 : -s.daysUntilDue;
      if (over > 0 && (mostOverdueDays === null || over > mostOverdueDays)) mostOverdueDays = over;
    } else if (s.state === "upcoming") upcoming += 1;
    else if (s.state === "completed") completed += 1;
    else unanchored += 1;
  }

  return {
    owed,
    upcoming,
    completed,
    unanchored,
    unlabelled: outcomes.filter((o) => !o.horizon).length,
    byHorizon,
    mostOverdueDays,
  };
}

export const SCHEDULED_HORIZON_PHRASE: Record<ScheduledHorizon, string> = {
  "30_day": "30-day",
  "90_day": "90-day",
  "6_month": "6-month",
  post_close: "post-close",
};

/** "2 reads owed — the oldest is 12 days overdue". Null when nothing is owed, so
 *  a caller renders no chip rather than an empty one. */
export function owedLabel(s: OwedSummary): string | null {
  if (s.owed === 0) return null;
  const head = `${s.owed} read${s.owed === 1 ? "" : "s"} owed`;
  if (s.mostOverdueDays === null) return head;
  return `${head} — the oldest is ${s.mostOverdueDays} day${s.mostOverdueDays === 1 ? "" : "s"} overdue`;
}

// ─── Close anchor ────────────────────────────────────────────────────────────

export interface ClosingMilestone {
  id: number;
  dueDate: string;
  completed: boolean;
}

export interface CloseAnchor {
  closeDate: string;
  closeSource: "closed" | "planned";
}

/**
 * Which closing milestone anchors the post-close read.
 *
 * `deal_milestones` has no unique constraint, so a deal may carry several
 * `closing` rows. Precedence: a COMPLETED milestone beats a planned one (a date
 * that happened beats a date that is intended); among equals, the LATEST due
 * date; ties by highest id. Several planned closings means the close slipped and
 * someone added rather than edited — anchoring on the earliest would fire
 * post-close reads against a date the firm has already abandoned.
 *
 * Pure, so the rule is unit-testable without a database: the query returns rows,
 * this picks.
 */
export function pickCloseDate(rows: readonly ClosingMilestone[]): CloseAnchor | null {
  if (rows.length === 0) return null;
  const rank = (r: ClosingMilestone) => (r.completed ? 1 : 0);
  const best = rows.reduce((a, b) => {
    if (rank(b) !== rank(a)) return rank(b) > rank(a) ? b : a;
    if (b.dueDate !== a.dueDate) return b.dueDate > a.dueDate ? b : a;
    return b.id > a.id ? b : a;
  });
  return { closeDate: best.dueDate, closeSource: best.completed ? "closed" : "planned" };
}

// ─── The firm-wide roll-up ───────────────────────────────────────────────────

/** One decided recommendation, as api/queries/outcomes-owed.ts returns it. The
 *  transport shape — so foldOwed is testable over fixtures with no database. */
export interface OwedRow {
  recommendationId: number;
  dealId: number;
  dealName: string;
  status: string;
  decidedAt: Date | string;
  stage: string;
  /** Horizon labels already logged against this recommendation. */
  loggedHorizons: string[];
  hasMoot: boolean;
  closeDate: string | null;
  closeSource: "closed" | "planned" | null;
}

export interface OwedDeal {
  dealId: number;
  dealName: string;
  owed: number;
  byHorizon: Partial<Record<ScheduledHorizon, number>>;
  recommendationIds: number[];
  /** True when this deal has no closing milestone, so its post-close reads are
   *  not scheduled. Reported, never counted as owed. */
  unanchoredPostClose: boolean;
}

export interface OwedRollup {
  totalOwed: number;
  byHorizon: Partial<Record<ScheduledHorizon, number>>;
  deals: OwedDeal[];
  /** Deals whose post-close read cannot be scheduled for want of a close date. */
  unanchoredDeals: number;
}

/**
 * Rows → the firm's queue. Deliberately mirrors foldPatterns: the query returns
 * transport rows and every judgement happens here, where it can be tested.
 */
export function foldOwed(rows: readonly OwedRow[], now: string = todayIso()): OwedRollup {
  const byDeal = new Map<number, OwedDeal>();
  const byHorizon: Partial<Record<ScheduledHorizon, number>> = {};
  let totalOwed = 0;

  for (const r of rows) {
    const states = horizonStates(
      { status: r.status, decidedAt: r.decidedAt },
      r.loggedHorizons
        .map((h) => ({ horizon: h }) as ScheduleOutcomeRow)
        .concat(r.hasMoot ? [{ outcomeType: "moot" }] : []),
      r.closeDate,
      now,
    );

    const due = states.filter((s) => s.state === "due");
    const entry = byDeal.get(r.dealId) ?? {
      dealId: r.dealId,
      dealName: r.dealName,
      owed: 0,
      byHorizon: {},
      recommendationIds: [],
      unanchoredPostClose: false,
    };
    if (states.some((s) => s.state === "unanchored")) entry.unanchoredPostClose = true;
    if (due.length > 0) {
      entry.owed += due.length;
      totalOwed += due.length;
      if (!entry.recommendationIds.includes(r.recommendationId)) {
        entry.recommendationIds.push(r.recommendationId);
      }
      for (const s of due) {
        entry.byHorizon[s.horizon] = (entry.byHorizon[s.horizon] ?? 0) + 1;
        byHorizon[s.horizon] = (byHorizon[s.horizon] ?? 0) + 1;
      }
    }
    byDeal.set(r.dealId, entry);
  }

  const deals = [...byDeal.values()]
    .filter((d) => d.owed > 0 || d.unanchoredPostClose)
    // Most owed first; ties by name so two runs agree.
    .sort((a, b) => b.owed - a.owed || a.dealName.localeCompare(b.dealName));

  return {
    totalOwed,
    byHorizon,
    deals,
    unanchoredDeals: deals.filter((d) => d.unanchoredPostClose).length,
  };
}

/** Every horizon this module schedules is a real OutcomeHorizon — a compile-time
 *  assertion that SCHEDULED_HORIZONS can never drift from OUTCOME_HORIZONS. */
const _horizonsAreReal: readonly OutcomeHorizon[] = SCHEDULED_HORIZONS;
void _horizonsAreReal;
