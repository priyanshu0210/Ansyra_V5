// ─────────────────────────────────────────────────────────────────────────────
// Deal Timeline & Deadlines (Phase 15.3) — the real clock of a deal. Milestones
// are many-per-deal; `upcoming` powers the dashboard widget across the caller's
// whole scoped portfolio. Countdown/urgency math lives in contracts/milestones.ts
// so the chips, the widget and the reminder job all agree.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { and, asc, eq, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, featureQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { logActivity } from "./lib/activity";
import { assertDealAccess } from "./deals-router";
import { MILESTONE_KINDS, MILESTONE_LABELS } from "@contracts/milestones";
import { dealMilestones, deals } from "@db/schema";

const timelineQuery = featureQuery("timeline");

const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

// A milestone belongs to a deal, so access is the deal's access. Returns the row
// (and its deal) or throws NOT_FOUND / FORBIDDEN.
async function assertMilestoneAccess(id: number, userId: string, orgId: string | null) {
  const db = getDb();
  const [row] = await db.select().from(dealMilestones).where(eq(dealMilestones.id, id)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Milestone not found." });
  const deal = await assertDealAccess(row.dealId, userId, orgId);
  return { row, deal };
}

export const milestonesRouter = createRouter({
  list: timelineQuery
    .input(z.object({ dealId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertDealAccess(input.dealId, ctx.user.id, ctx.user.organizationId ?? null);
      return getDb()
        .select()
        .from(dealMilestones)
        .where(eq(dealMilestones.dealId, input.dealId))
        .orderBy(asc(dealMilestones.dueDate));
    }),

  // Next N incomplete milestones across every deal the caller can see — the
  // dashboard "upcoming deadlines" widget. Cancelled/completed DEALS are
  // excluded: their dates are no longer anyone's problem.
  upcoming: timelineQuery
    .input(z.object({ limit: z.number().min(1).max(20).default(5) }).optional())
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const dealScope = orgId
        ? or(eq(deals.createdBy, ctx.user.id), eq(deals.organizationId, orgId))!
        : eq(deals.createdBy, ctx.user.id);
      return getDb()
        .select({
          id: dealMilestones.id,
          dealId: dealMilestones.dealId,
          dealName: deals.name,
          kind: dealMilestones.kind,
          customLabel: dealMilestones.customLabel,
          dueDate: dealMilestones.dueDate,
          note: dealMilestones.note,
        })
        .from(dealMilestones)
        .innerJoin(deals, eq(deals.id, dealMilestones.dealId))
        .where(and(dealScope, eq(dealMilestones.completed, false), eq(deals.status, "active")))
        .orderBy(asc(dealMilestones.dueDate))
        .limit(input?.limit ?? 5);
    }),

  create: timelineQuery
    .input(
      z.object({
        dealId: z.number(),
        kind: z.enum(MILESTONE_KINDS),
        customLabel: z.string().trim().max(120).optional(),
        dueDate: IsoDate,
        note: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const deal = await assertDealAccess(input.dealId, ctx.user.id, orgId);
      // Mirrors the DB check constraint: custom needs a label, fixed kinds must not carry one.
      if (input.kind === "custom" && !input.customLabel) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Give the custom milestone a label." });
      }
      const db = getDb();
      const [row] = await db
        .insert(dealMilestones)
        .values({
          dealId: deal.id,
          kind: input.kind,
          customLabel: input.kind === "custom" ? input.customLabel! : null,
          dueDate: input.dueDate,
          note: input.note || null,
          createdBy: ctx.user.id,
          organizationId: orgId,
        })
        .returning();
      logActivity(ctx.user, {
        type: "deal",
        action: "Milestone added",
        detail: `${deal.name} — ${input.kind === "custom" ? input.customLabel : MILESTONE_LABELS[input.kind]} due ${input.dueDate}`,
        dealId: deal.id,
      });
      return row;
    }),

  update: timelineQuery
    .input(
      z.object({
        id: z.number(),
        dueDate: IsoDate.optional(),
        note: z.string().trim().max(500).nullish(),
        completed: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { row, deal } = await assertMilestoneAccess(
        input.id,
        ctx.user.id,
        ctx.user.organizationId ?? null,
      );
      const patch: Record<string, unknown> = {};
      if (input.dueDate !== undefined) {
        patch.dueDate = input.dueDate;
        // A moved date is a fresh deadline — re-arm the reminders.
        if (input.dueDate !== row.dueDate) patch.lastNotified = null;
      }
      if (input.note !== undefined) patch.note = input.note || null;
      if (input.completed !== undefined) patch.completed = input.completed;
      if (Object.keys(patch).length === 0) return row;

      const db = getDb();
      const [updated] = await db
        .update(dealMilestones)
        .set(patch)
        .where(eq(dealMilestones.id, input.id))
        .returning();
      if (input.completed === true) {
        logActivity(ctx.user, {
          type: "deal",
          action: "Milestone completed",
          detail: `${deal.name} — ${row.customLabel ?? MILESTONE_LABELS[row.kind]}`,
          dealId: deal.id,
        });
      }
      return updated;
    }),

  delete: timelineQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertMilestoneAccess(input.id, ctx.user.id, ctx.user.organizationId ?? null);
      await getDb().delete(dealMilestones).where(eq(dealMilestones.id, input.id));
      return { success: true };
    }),
});
