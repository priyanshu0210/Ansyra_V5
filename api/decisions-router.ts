import { decisionReadiness } from "@contracts/decision-readiness";
// ─────────────────────────────────────────────────────────────────────────────
// Decision Log (Phase 15.1) — captures the reasoning behind every stage
// transition and IS the enforcement point for the stage-gate. A forward stage
// move flows through `record`, which inserts the decision AND moves the deal in
// one transaction, so the gate in deals.update can never be bypassed.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, featureQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { ownerScope } from "./lib/scope";
import { logActivity } from "./lib/activity";
import { assertDealAccess } from "./deals-router";
import { DEAL_STAGES, isForwardStageMove } from "@contracts/stages";

import { assumptions, decisions, deals, recommendations, DECISION_TYPES } from "@db/schema";

const decisionsQuery = featureQuery("decisions");

const OutcomeSchema = z
  .object({
    votesFor: z.number().int().min(0).optional(),
    votesAgainst: z.number().int().min(0).optional(),
    abstain: z.number().int().min(0).optional(),
    conditions: z.array(z.string().min(1)).max(20).optional(),
  })
  .optional();

export const decisionsRouter = createRouter({
  list: decisionsQuery
    .input(z.object({ dealId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertDealAccess(input.dealId, ctx.user.id, ctx.user.organizationId ?? null);
      const db = getDb();
      return db
        .select()
        .from(decisions)
        .where(eq(decisions.dealId, input.dealId))
        .orderBy(desc(decisions.createdAt));
    }),

  record: decisionsQuery
    .input(
      z.object({
        dealId: z.number(),
        decisionType: z.enum(DECISION_TYPES),
        // The stage this decision moves the deal to. Omit for a decision that
        // records reasoning without a move (e.g. a "hold").
        toStage: z.enum(DEAL_STAGES).optional(),
        rationale: z.string().trim().min(20, "Give at least a sentence of rationale."),
        outcome: OutcomeSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const deal = await assertDealAccess(input.dealId, ctx.user.id, orgId);
      const fromStage = deal.stage;
      const db = getDb();

      const row = await db.transaction(async (tx) => {
        if (input.toStage && isForwardStageMove(fromStage, input.toStage)) {
          const ledger = await tx.select().from(assumptions).where(and(eq(assumptions.dealId, deal.id), ownerScope(assumptions, ctx.user.id, orgId)));
          const recs = await tx.select().from(recommendations).where(and(eq(recommendations.dealId, deal.id), ownerScope(recommendations, ctx.user.id, orgId)));
          const readiness = decisionReadiness(recs, ledger, fromStage, input.toStage);
          if (readiness.kind === "blocked" || readiness.kind === "unknown") throw new TRPCError({ code: "BAD_REQUEST", message: readiness.message });
        }

        const [inserted] = await tx
          .insert(decisions)
          .values({
            dealId: deal.id,
            decisionType: input.decisionType,
            fromStage,
            toStage: input.toStage ?? null,
            rationale: input.rationale,
            outcome: input.outcome ?? null,
            decidedBy: ctx.user.id,
            organizationId: orgId,
          })
          .returning();

        // Apply the deal-state consequences of the decision in the same tx.
        const patch: Partial<{ stage: typeof deal.stage; status: typeof deal.status }> = {};
        if (input.toStage && input.toStage !== fromStage) patch.stage = input.toStage;
        if (input.decisionType === "kill" || input.decisionType === "pass") patch.status = "cancelled";
        if (Object.keys(patch).length > 0) {
          await tx.update(deals).set(patch).where(eq(deals.id, deal.id));
        }
        return inserted;
      });

      logActivity(ctx.user, {
        type: "deal",
        action: `Decision: ${input.decisionType.replace(/_/g, " ")}`,
        detail: `${deal.name}${input.toStage && input.toStage !== fromStage ? ` — ${fromStage} → ${input.toStage}` : ""}`,
        dealId: deal.id,
      });
      return row;
    }),
});
