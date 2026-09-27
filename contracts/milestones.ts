// ─────────────────────────────────────────────────────────────────────────────
// Deal-milestone kinds + countdown math (Phase 15.3). Shared FE/BE: the dossier
// chips, the dashboard widget and the reminder job all derive urgency from these
// pure functions. Dates are DATE-ONLY strings ("YYYY-MM-DD") to dodge timezone
// drift — a closing date is a calendar day, not an instant.
// Unit-tested in contracts/milestones.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

export const MILESTONE_KINDS = [
  "loi_signed",
  "exclusivity_expiry",
  "filing_submitted",
  "regulatory_deadline",
  "financing_commitment",
  "signing",
  "closing",
  "custom",
] as const;

export type MilestoneKind = (typeof MILESTONE_KINDS)[number];

export const MILESTONE_LABELS: Record<MilestoneKind, string> = {
  loi_signed: "LOI signed",
  exclusivity_expiry: "Exclusivity expiry",
  filing_submitted: "Filing submitted",
  regulatory_deadline: "Regulatory deadline",
  financing_commitment: "Financing commitment",
  signing: "Signing",
  closing: "Closing",
  custom: "Custom",
};

/** Reminder thresholds, in days before the due date. */
export const REMINDER_THRESHOLDS = [7, 1] as const;
export type ReminderThreshold = (typeof REMINDER_THRESHOLDS)[number];

/** Today as a date-only string in the caller's local timezone. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Whole days from `from` (default today) until `dueDate`. Negative = overdue.
 * Both are date-only strings, compared at UTC midnight so DST can't shift the
 * count. Returns null for an unparseable date.
 */
export function daysUntil(dueDate: string, from: string = todayIso()): number | null {
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const base = Date.parse(`${from}T00:00:00Z`);
  if (Number.isNaN(due) || Number.isNaN(base)) return null;
  return Math.round((due - base) / 86_400_000);
}

export type Urgency = "overdue" | "imminent" | "soon" | "later";

/**
 * Urgency band for display: overdue (past due), imminent (≤2 days),
 * soon (≤7 days), later. Drives chip colour — never invents a colour per-call.
 */
export function urgencyOf(dueDate: string, from: string = todayIso()): Urgency | null {
  const d = daysUntil(dueDate, from);
  if (d == null) return null;
  if (d < 0) return "overdue";
  if (d <= 2) return "imminent";
  if (d <= 7) return "soon";
  return "later";
}

/** Short human countdown: "Overdue 3d", "Due today", "6d". */
export function countdownLabel(dueDate: string, from: string = todayIso()): string {
  const d = daysUntil(dueDate, from);
  if (d == null) return "—";
  if (d < 0) return `Overdue ${Math.abs(d)}d`;
  if (d === 0) return "Due today";
  return `${d}d`;
}

export interface NotifiedState {
  d7?: string; // ISO date this milestone's 7-day reminder was sent
  d1?: string;
}

/**
 * Which reminder threshold (if any) is due for a milestone right now.
 *
 * Deliberately a WINDOW, not exact-day equality: if the server was down on the
 * exact day, the reminder still fires on the next run ("due in ≤7 days and the
 * d7 reminder has not been sent"). Idempotent — once a threshold is recorded in
 * `lastNotified`, it never fires again. Overdue and completed milestones never
 * notify (no nagging after the fact).
 */
export function dueReminder(
  input: { dueDate: string; completed: boolean; lastNotified?: NotifiedState | null },
  from: string = todayIso(),
): ReminderThreshold | null {
  if (input.completed) return null;
  const d = daysUntil(input.dueDate, from);
  if (d == null || d < 0) return null;
  const sent = input.lastNotified ?? {};
  // Check the tightest threshold first so a milestone 1 day out sends the d1
  // reminder rather than a stale d7.
  if (d <= 1 && !sent.d1) return 1;
  if (d <= 7 && !sent.d7) return 7;
  return null;
}

/** Key used to record a sent reminder in `lastNotified`. */
export function thresholdKey(t: ReminderThreshold): keyof NotifiedState {
  return t === 1 ? "d1" : "d7";
}
