// ─────────────────────────────────────────────────────────────────────────────
// Assumption ledger (Phase 15.15) — the boundary over the projection in
// contracts/assumption-ledger.ts.
//
// Gated on the EXISTING `assumptions` key, the same one ai.stressTestAssumption
// and ai.listAssumptions use. No new feature key.
//
// There is deliberately NO updateOutcome and NO deleteOutcome. The ledger is
// append-only in the same way recommendation_outcomes is: correcting a read
// means recording another, because the trajectory — wrong at 30 days, right at
// 6 months — is the whole signal. A wiring test asserts these paths never
// appear, so the discipline is enforced rather than merely documented.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { createRouter, featureQuery } from "./middleware";
import { assertDealAccess } from "./deals-router";
import { getDb } from "./queries/connection";
import { ownerScope } from "./lib/scope";
import { loadAssumptionLedger } from "./queries/assumption-ledger";
import { logActivity } from "./lib/activity";
import { ASSUMPTION_CATEGORIES } from "@contracts/assumption-ledger";
import { OUTCOME_TYPES, OUTCOME_HORIZONS } from "@contracts/outcomes";
import { assumptionOutcomes, assumptions, recommendationOutcomes } from "@db/schema";

const assumptionQuery = featureQuery("assumptions");

/**
 * Prove the assumption is on this deal, not merely that the caller can see the
 * deal. Deal access is not proof that a client-supplied id belongs to it — the
 * same defence resolveEvidence and linkScenario document.
 */
async function assertAssumptionOnDeal(
  assumptionId: number,
  dealId: number,
  userId: string,
  orgId: string | null,
) {
  const [row] = await getDb()
    .select({ id: assumptions.id })
    .from(assumptions)
    .where(
      and(
        eq(assumptions.id, assumptionId),
        eq(assumptions.dealId, dealId),
        ownerScope(assumptions, userId, orgId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "That assumption is not on this deal." });
  }
  return row;
}

export const assumptionsRouter = createRouter({
  /** The deal's ledger: assumptions, who cites them, their reads, what is owed. */
  ledger: assumptionQuery
    .input(z.object({ dealId: z.number() }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      await assertDealAccess(input.dealId, ctx.user.id, orgId);
      return loadAssumptionLedger(input.dealId, ctx.user.id, orgId);
    }),

  /**
   * Append one read. There is no path that edits or removes one.
   *
   * `recommendationOutcomeId` is optional and EXPLICIT: the filer says this read
   * follows from a recommendation outcome. Nothing infers it, and nothing
   * mutates the assumption because a recommendation outcome landed.
   */
  recordOutcome: assumptionQuery
    .input(
      z.object({
        dealId: z.number(),
        assumptionId: z.number(),
        outcomeType: z.enum(OUTCOME_TYPES),
        outcomeSummary: z.string().trim().min(1).max(2000),
        horizon: z.enum(OUTCOME_HORIZONS).nullish(),
        recommendationOutcomeId: z.number().nullish(),
        recordedAt: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const deal = await assertDealAccess(input.dealId, ctx.user.id, orgId);
      await assertAssumptionOnDeal(input.assumptionId, input.dealId, ctx.user.id, orgId);

      // Same belt-and-braces as the assumption check: a linked recommendation
      // outcome must be on this deal and visible to this caller, or the pointer
      // would be a way to confirm the existence of someone else's row.
      if (input.recommendationOutcomeId != null) {
        const [linked] = await getDb()
          .select({ id: recommendationOutcomes.id })
          .from(recommendationOutcomes)
          .where(
            and(
              eq(recommendationOutcomes.id, input.recommendationOutcomeId),
              eq(recommendationOutcomes.dealId, input.dealId),
              ownerScope(recommendationOutcomes, ctx.user.id, orgId),
            ),
          )
          .limit(1);
        if (!linked) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "That recommendation outcome is not on this deal.",
          });
        }
      }

      const [row] = await getDb()
        .insert(assumptionOutcomes)
        .values({
          assumptionId: input.assumptionId,
          dealId: input.dealId,
          outcomeType: input.outcomeType,
          outcomeSummary: input.outcomeSummary,
          horizon: input.horizon ?? null,
          recommendationOutcomeId: input.recommendationOutcomeId ?? null,
          recordedAt: input.recordedAt ?? new Date(),
          createdBy: ctx.user.id,
          organizationId: orgId,
        })
        .returning();

      logActivity(ctx.user, {
        type: "deal",
        action: "Assumption read recorded",
        detail: `${deal.name} · ${input.outcomeType}${input.horizon ? ` at ${input.horizon}` : ""}`,
        dealId: input.dealId,
      });

      return row;
    }),

  /**
   * Correct the AI's classification.
   *
   * The category is set by the drafter on every stress test, which is the right
   * default (zero friction) but is a guess. This is the human's override, and it
   * is the only mutable field this router touches — the assumption's statement,
   * its stress-test result and its reads all stay as they were written.
   */
  setCategory: assumptionQuery
    .input(
      z.object({
        dealId: z.number(),
        assumptionId: z.number(),
        category: z.enum(ASSUMPTION_CATEGORIES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      await assertDealAccess(input.dealId, ctx.user.id, orgId);
      await assertAssumptionOnDeal(input.assumptionId, input.dealId, ctx.user.id, orgId);

      const [row] = await getDb()
        .update(assumptions)
        .set({ category: input.category })
        .where(
          and(
            eq(assumptions.id, input.assumptionId),
            ownerScope(assumptions, ctx.user.id, orgId),
          ),
        )
        .returning({ id: assumptions.id, category: assumptions.category });

      return row;
    }),
});
