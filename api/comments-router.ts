// ─────────────────────────────────────────────────────────────────────────────
// Deal Comments (Phase 15.7) — the first collaboration primitive, and the
// deliberately-simplest feature in the codebase: it's the model example of how a
// minimal feature flows through Ansyra's stack (schema → router → UI). A flat
// discussion thread per deal. Org members read the whole thread; edit/delete are
// own-row-only, enforced in the WHERE clause (never an after-fetch check).
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, featureQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { logActivity } from "./lib/activity";
import { assertDealAccess } from "./deals-router";
import { dealComments } from "@db/schema";

const commentsQuery = featureQuery("comments");

export const commentsRouter = createRouter({
  list: commentsQuery
    .input(z.object({ dealId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertDealAccess(input.dealId, ctx.user.id, ctx.user.organizationId ?? null);
      return getDb()
        .select()
        .from(dealComments)
        .where(eq(dealComments.dealId, input.dealId))
        .orderBy(asc(dealComments.id)); // chat order — oldest first
    }),

  add: commentsQuery
    .input(z.object({ dealId: z.number(), body: z.string().trim().min(1).max(4000) }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const deal = await assertDealAccess(input.dealId, ctx.user.id, orgId);
      const [row] = await getDb()
        .insert(dealComments)
        .values({
          dealId: deal.id,
          body: input.body,
          createdBy: ctx.user.id,
          organizationId: orgId,
        })
        .returning();
      logActivity(ctx.user, {
        type: "deal",
        action: "Commented on deal",
        detail: deal.name,
        dealId: deal.id,
      });
      return row;
    }),

  edit: commentsQuery
    .input(z.object({ id: z.number(), body: z.string().trim().min(1).max(4000) }))
    .mutation(async ({ ctx, input }) => {
      // Own-row enforcement lives in the WHERE clause: a comment by someone else
      // simply matches zero rows, so there's nothing to leak or race.
      const [row] = await getDb()
        .update(dealComments)
        .set({ body: input.body, editedAt: new Date() })
        .where(and(eq(dealComments.id, input.id), eq(dealComments.createdBy, ctx.user.id)))
        .returning();
      if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "You can only edit your own comments." });
      return row;
    }),

  delete: commentsQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await getDb()
        .delete(dealComments)
        .where(and(eq(dealComments.id, input.id), eq(dealComments.createdBy, ctx.user.id)))
        .returning({ id: dealComments.id, dealId: dealComments.dealId });
      if (rows.length === 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete your own comments." });
      }
      logActivity(ctx.user, { type: "deal", action: "Deleted a comment", dealId: rows[0].dealId });
      return { success: true };
    }),
});
