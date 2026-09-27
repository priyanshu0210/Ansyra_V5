// ─────────────────────────────────────────────────────────────────────────────
// DD Tracker (Phase 15.5) — diligence as a living checklist. The AI's
// dd_checklist analysis (Phase 10) is an INPUT to this workflow, not a substitute:
// `importAnalysis` merges an analysis in via the pure, unit-tested rule in
// contracts/dd-merge.ts, which never overwrites a status a human set.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, featureQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { logActivity } from "./lib/activity";
import { assertDealAccess } from "./deals-router";
import { DD_CHECKLIST_ITEMS } from "@contracts/constants";
import {
  DD_STATUSES,
  DD_WORKSTREAMS,
  mergeDdAnalysis,
  workstreamFor,
  type DdTrackerItem,
} from "@contracts/dd-merge";
import { ddItems, documentAnalyses, documents, users } from "@db/schema";

/** An assignee must be the caller or an active member of the caller's organisation. */
async function assertAssignable(assigneeId: string, userId: string, orgId: string | null) {
  if (assigneeId === userId) return;
  const [row] = await getDb()
    .select({ id: users.id, organizationId: users.organizationId, deactivatedAt: users.deactivatedAt })
    .from(users)
    .where(eq(users.id, assigneeId))
    .limit(1);
  const sameOrg = !!row && !!orgId && row.organizationId === orgId && !row.deactivatedAt;
  if (!sameOrg) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Assignees must be active members of your organisation." });
  }
}

const ddQuery = featureQuery("dd_tracker");

const todayIso = () => new Date().toISOString().slice(0, 10);

async function assertItemAccess(id: number, userId: string, orgId: string | null) {
  const db = getDb();
  const [row] = await db.select().from(ddItems).where(eq(ddItems.id, id)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Checklist item not found." });
  const deal = await assertDealAccess(row.dealId, userId, orgId);
  return { row, deal };
}

function listFor(dealId: number) {
  return getDb()
    .select()
    .from(ddItems)
    .where(eq(ddItems.dealId, dealId))
    .orderBy(asc(ddItems.workstream), asc(ddItems.id));
}

export const ddRouter = createRouter({
  list: ddQuery
    .input(z.object({ dealId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertDealAccess(input.dealId, ctx.user.id, ctx.user.organizationId ?? null);
      return listFor(input.dealId);
    }),

  // Seeds the 12 standard items. Idempotent: the (deal_id, item) unique
  // constraint plus onConflictDoNothing means re-clicking is harmless.
  seed: ddQuery
    .input(z.object({ dealId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const deal = await assertDealAccess(input.dealId, ctx.user.id, orgId);
      const db = getDb();
      await db
        .insert(ddItems)
        .values(
          DD_CHECKLIST_ITEMS.map((item) => ({
            dealId: deal.id,
            item,
            workstream: workstreamFor(item),
            isStandard: true,
            createdBy: ctx.user.id,
            organizationId: orgId,
          })),
        )
        .onConflictDoNothing();
      logActivity(ctx.user, {
        type: "deal",
        action: "Diligence checklist started",
        detail: deal.name,
        dealId: deal.id,
      });
      return listFor(deal.id);
    }),

  addItem: ddQuery
    .input(
      z.object({
        dealId: z.number(),
        item: z.string().trim().min(2).max(300),
        workstream: z.enum(DD_WORKSTREAMS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const deal = await assertDealAccess(input.dealId, ctx.user.id, orgId);
      const db = getDb();
      const [row] = await db
        .insert(ddItems)
        .values({
          dealId: deal.id,
          item: input.item,
          workstream: input.workstream,
          isStandard: false,
          createdBy: ctx.user.id,
          organizationId: orgId,
        })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        throw new TRPCError({ code: "CONFLICT", message: "That item is already tracked on this deal." });
      }
      return row;
    }),

  // Any human edit marks the item manually_set, which permanently protects its
  // status from AI imports (contracts/dd-merge.ts rule 1).
  updateItem: ddQuery
    .input(
      z.object({
        id: z.number(),
        status: z.enum(DD_STATUSES).optional(),
        assigneeId: z.string().uuid().nullish(),
        note: z.string().trim().max(2000).nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { row, deal } = await assertItemAccess(
        input.id,
        ctx.user.id,
        ctx.user.organizationId ?? null,
      );
      const patch: Record<string, unknown> = {};
      if (input.status !== undefined) {
        patch.status = input.status;
        patch.manuallySet = true;
      }
      if (input.assigneeId !== undefined) {
        if (input.assigneeId) await assertAssignable(input.assigneeId, ctx.user.id, ctx.user.organizationId ?? null);
        patch.assigneeId = input.assigneeId || null;
      }
      if (input.note !== undefined) patch.note = input.note || null;
      if (Object.keys(patch).length === 0) return row;

      const db = getDb();
      const [updated] = await db
        .update(ddItems)
        .set(patch)
        .where(eq(ddItems.id, input.id))
        .returning();
      // An `issue` is the one status worth surfacing in the deal's history.
      if (input.status === "issue") {
        logActivity(ctx.user, {
          type: "deal",
          action: "Diligence issue flagged",
          detail: `${deal.name} — ${row.item}`,
          dealId: deal.id,
        });
      }
      return updated;
    }),

  deleteItem: ddQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { row } = await assertItemAccess(input.id, ctx.user.id, ctx.user.organizationId ?? null);
      if (row.isStandard) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Standard checklist items can't be deleted — set them to N/A instead.",
        });
      }
      await getDb().delete(ddItems).where(eq(ddItems.id, input.id));
      return { success: true };
    }),

  // Merge a dd_checklist analysis into the tracker. Seeds first if the tracker is
  // empty, so "import" always has somewhere to land. All writes in one transaction.
  importAnalysis: ddQuery
    .input(z.object({ dealId: z.number(), analysisId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const deal = await assertDealAccess(input.dealId, ctx.user.id, orgId);
      const db = getDb();

      // The analysis must be a dd_checklist AND belong to a document of THIS deal
      // — otherwise a caller could pull another deal's analysis into this tracker.
      const [analysis] = await db
        .select({
          id: documentAnalyses.id,
          kind: documentAnalyses.kind,
          result: documentAnalyses.result,
          dealId: documents.dealId,
        })
        .from(documentAnalyses)
        .innerJoin(documents, eq(documents.id, documentAnalyses.documentId))
        .where(eq(documentAnalyses.id, input.analysisId))
        .limit(1);
      if (!analysis) throw new TRPCError({ code: "NOT_FOUND", message: "Analysis not found." });
      if (analysis.kind !== "dd_checklist") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That analysis is not a DD checklist." });
      }
      if (analysis.dealId !== deal.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "That analysis belongs to a different deal." });
      }

      const parsed = z
        .object({
          items: z.array(
            z.object({
              item: z.string(),
              status: z.string(),
              note: z.string().optional(),
            }),
          ),
        })
        .safeParse(analysis.result);
      if (!parsed.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That analysis has no readable checklist items." });
      }

      const summary = await db.transaction(async (tx) => {
        let current = await tx
          .select()
          .from(ddItems)
          .where(eq(ddItems.dealId, deal.id));
        if (current.length === 0) {
          await tx
            .insert(ddItems)
            .values(
              DD_CHECKLIST_ITEMS.map((item) => ({
                dealId: deal.id,
                item,
                workstream: workstreamFor(item),
                isStandard: true,
                createdBy: ctx.user.id,
                organizationId: orgId,
              })),
            )
            .onConflictDoNothing();
          current = await tx.select().from(ddItems).where(eq(ddItems.dealId, deal.id));
        }

        const tracker: DdTrackerItem[] = current.map((r) => ({
          id: r.id,
          item: r.item,
          status: r.status,
          note: r.note,
          manuallySet: r.manuallySet,
        }));
        const merged = mergeDdAnalysis(tracker, parsed.data.items, todayIso());

        for (const p of merged.patches) {
          await tx
            .update(ddItems)
            .set({
              ...(p.status ? { status: p.status } : {}),
              ...(p.note !== undefined ? { note: p.note } : {}),
              sourceAnalysisId: analysis.id,
            })
            .where(and(eq(ddItems.id, p.id), inArray(ddItems.dealId, [deal.id])));
        }
        return merged;
      });

      logActivity(ctx.user, {
        type: "ai",
        action: "DD analysis imported",
        detail: `${deal.name} — ${summary.filled} filled, ${summary.skippedManual} kept manual`,
        dealId: deal.id,
      });
      return {
        filled: summary.filled,
        skippedManual: summary.skippedManual,
        unmatched: summary.unmatched,
        items: await listFor(deal.id),
      };
    }),
});
