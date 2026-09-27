// ─────────────────────────────────────────────────────────────────────────────
// Deadline reminders (Phase 15.3) — the first MEMBER-facing notification in the
// product (notify.ts only ever emailed admins). Sweeps incomplete milestones on
// active deals, emails the deal owner at T-7 and T-1 days, and records what it
// sent in `last_notified` so a re-run never double-sends.
//
// Scheduling is external. The authenticated /internal/cron/deadlines endpoint
// invokes this sweep, so scale-to-zero and replica count do not affect delivery.
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, lte } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { sendEmail, type EmailOutcome } from "./email";
import {
  MILESTONE_LABELS,
  countdownLabel,
  dueReminder,
  thresholdKey,
  todayIso,
  type NotifiedState,
} from "@contracts/milestones";
import { dealMilestones, deals, users } from "@db/schema";

export interface DeadlineSweepResult {
  scanned: number;
  sent: number;
  skipped: number;
}

/**
 * One reminder sweep. Safe to call repeatedly — thresholds already recorded are
 * never re-sent. Never throws: a failed sweep must not take down the server.
 */
export async function checkDeadlines(now: Date = new Date()): Promise<DeadlineSweepResult> {
  const today = todayIso(now);
  const result: DeadlineSweepResult = { scanned: 0, sent: 0, skipped: 0 };
  try {
    const db = getDb();
    // Only incomplete milestones on ACTIVE deals, and only those already inside
    // the widest reminder window (7 days) — the partial index covers this.
    const horizon = new Date(now.getTime() + 7 * 86_400_000);
    const rows = await db
      .select({
        id: dealMilestones.id,
        dealId: dealMilestones.dealId,
        kind: dealMilestones.kind,
        customLabel: dealMilestones.customLabel,
        dueDate: dealMilestones.dueDate,
        note: dealMilestones.note,
        completed: dealMilestones.completed,
        lastNotified: dealMilestones.lastNotified,
        dealName: deals.name,
        targetCompany: deals.targetCompany,
        ownerEmail: users.email,
        ownerPrefs: users.preferences,
      })
      .from(dealMilestones)
      .innerJoin(deals, eq(deals.id, dealMilestones.dealId))
      .leftJoin(users, eq(users.id, dealMilestones.createdBy))
      .where(
        and(
          eq(dealMilestones.completed, false),
          eq(deals.status, "active"),
          lte(dealMilestones.dueDate, todayIso(horizon)),
        ),
      );

    for (const m of rows) {
      result.scanned++;
      const threshold = dueReminder(
        { dueDate: m.dueDate, completed: m.completed, lastNotified: m.lastNotified },
        today,
      );
      if (!threshold) {
        result.skipped++;
        continue;
      }
      // Respect the member's email-notification preference (Phase 8 profile).
      const prefs = (m.ownerPrefs ?? {}) as Record<string, unknown>;
      const wantsEmail = prefs.email_notifications !== false;
      const label = m.customLabel ?? MILESTONE_LABELS[m.kind];

      let outcome: EmailOutcome = "skipped";
      if (m.ownerEmail && wantsEmail) {
        outcome = await sendEmail({
          to: m.ownerEmail,
          subject: `${label} — ${countdownLabel(m.dueDate, today)} · ${m.dealName}`,
          text:
            `${label} for ${m.dealName} (${m.targetCompany}) is due ${m.dueDate} — ` +
            `${countdownLabel(m.dueDate, today)}.\n` +
            (m.note ? `\nNote: ${m.note}\n` : "") +
            `\nOpen the deal dossier in Ansyra to review the timeline.`,
        });
      }

      // A provider failure leaves the threshold unrecorded so the next sweep
      // tries again; a transient outage must not silently cancel a reminder.
      // "skipped" (no provider, no address, opted out) IS recorded, so a user
      // without email doesn't accumulate a backlog of sends for later.
      if (outcome === "failed") {
        result.skipped++;
        continue;
      }
      const nextState: NotifiedState = { ...(m.lastNotified ?? {}), [thresholdKey(threshold)]: today };
      await db
        .update(dealMilestones)
        .set({ lastNotified: nextState })
        .where(eq(dealMilestones.id, m.id));
      result.sent++;
    }
  } catch (err) {
    console.warn("[deadlines] sweep failed:", err instanceof Error ? err.message : err);
  }
  return result;
}
