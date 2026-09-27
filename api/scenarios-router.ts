// ─────────────────────────────────────────────────────────────────────────────
// Scenarios (Phase 15.13) — the boundary over the projection in
// contracts/scenarios.ts. Read-only, and that is a design statement, not a gap.
//
// There is deliberately NO create/update here. A scenario is a case OF an
// immutable scenario_analyses snapshot; "creating" one means running the
// analysis, which is `ai.scenarioAnalysis` and already exists. A parallel
// hand-authored scenario row would fork the domain into two kinds of scenario
// that compare surfaces would then have to reconcile — exactly the domain
// expansion this phase was scoped to avoid.
//
// Gated on the existing `scenarios` key, the same key ai.scenarioAnalysis and
// ai.listScenarioAnalyses use. No new feature key.
//
// Recommendation links are NOT resolved here. They live behind the
// `recommendations` grant and are already served by
// recommendations.listScenarioLinks, which ScenarioCards has consumed since
// 15.9 with a client-side `enabled: hasFeature(user, "recommendations")` guard.
// Reusing it keeps claim text behind its own gate and adds no authorization
// surface; the compare view composes the two client-side with
// recommendationsInPlay().
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, featureQuery } from "./middleware";
import { assertDealAccess } from "./deals-router";
import { loadScenarios } from "./queries/scenarios";
import { parseScenarioId } from "@contracts/scenarios";

const scenarioQuery = featureQuery("scenarios");

export const scenariosRouter = createRouter({
  /** Every case on the deal, newest run first, drivers resolved to assumptions. */
  listByDeal: scenarioQuery
    .input(z.object({ dealId: z.number() }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      await assertDealAccess(input.dealId, ctx.user.id, orgId);
      return loadScenarios(input.dealId, ctx.user.id, orgId);
    }),

  /**
   * One case, by its `${snapshotId}:${caseName}` id.
   *
   * dealId is required alongside the id rather than derived from it: access is
   * proved against the deal, and letting a caller hand over only a scenario id
   * would mean trusting a client-supplied id to select the row that decides
   * whether they may read it.
   */
  getById: scenarioQuery
    .input(z.object({ dealId: z.number(), scenarioId: z.string() }))
    .query(async ({ ctx, input }) => {
      const parsed = parseScenarioId(input.scenarioId);
      if (!parsed) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Not a scenario id." });
      }
      const orgId = ctx.user.organizationId ?? null;
      await assertDealAccess(input.dealId, ctx.user.id, orgId);
      const found = (await loadScenarios(input.dealId, ctx.user.id, orgId)).find(
        (s) => s.id === input.scenarioId,
      );
      if (!found) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That scenario is not on this deal." });
      }
      return found;
    }),
});
