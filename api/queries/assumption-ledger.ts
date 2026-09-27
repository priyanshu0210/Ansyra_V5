// ─────────────────────────────────────────────────────────────────────────────
// Assumption ledger reads (Phase 15.15) — four scoped selects, then one pure fold.
//
// This module FETCHES; every judgement lives in contracts/assumption-ledger.ts.
//
// Drizzle builder, and here the reason is at its sharpest in the whole repo.
// `assumptions` is a camelCase-column table ("dealId", "createdBy") while the
// brand-new `assumption_outcomes` is snake_case, and this module reads BOTH in
// one function. A hand-written predicate would produce assumptions.created_by
// or assumption_outcomes."createdBy" — each type-checks perfectly and dies at
// RUNTIME with 42703. ownerScope reads the names off the schema, so the mixed
// casing cannot bite. Do not "tidy" these into raw SQL.
// ─────────────────────────────────────────────────────────────────────────────

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./connection";
import { ownerScope } from "../lib/scope";
import { loadCloseAnchor } from "./outcomes-owed";
import {
  projectAssumptionLedger,
  summariseLedger,
  type AssumptionLedgerSummary,
  type LedgerAssumption,
} from "@contracts/assumption-ledger";
import { assumptionOutcomes, assumptions, recommendations } from "@db/schema";

export interface DealAssumptionLedger {
  rows: LedgerAssumption[];
  summary: AssumptionLedgerSummary;
}

/**
 * One deal's assumption ledger.
 *
 * The caller must already have proved deal access (assertDealAccess), the same
 * contract loadDecisionHealth and loadScenarios work under.
 *
 * Recommendations are read here rather than by the client because the reverse
 * index — which recommendations cite this assumption — is computed from
 * `supporting_evidence`, and a client-side fold would need the whole
 * recommendation list on a surface that is not `recommendations`-gated.
 * Only the four fields the projection actually reads are selected, so no claim
 * text leaks beyond what the panel renders.
 *
 * `loadCloseAnchor` is reused so `post_close` resolves through the one
 * definition of the multi-milestone rule, and — as in 15.11 — server-side,
 * because milestones are `timeline`-gated and this surface is not.
 */
export async function loadAssumptionLedger(
  dealId: number,
  userId: string,
  orgId: string | null,
  today?: string,
): Promise<DealAssumptionLedger> {
  const db = getDb();

  const [assumptionRows, outcomeRows, recRows, anchor] = await Promise.all([
    db
      .select({
        id: assumptions.id,
        dealId: assumptions.dealId,
        assumption: assumptions.assumption,
        category: assumptions.category,
        reviewer: assumptions.reviewer,
        reviewerNote: assumptions.reviewerNote,
        result: assumptions.result,
        createdAt: assumptions.createdAt,
        createdBy: assumptions.createdBy,
      })
      .from(assumptions)
      .where(and(eq(assumptions.dealId, dealId), ownerScope(assumptions, userId, orgId)))
      .orderBy(desc(assumptions.id)),
    db
      .select({
        id: assumptionOutcomes.id,
        assumptionId: assumptionOutcomes.assumptionId,
        outcomeType: assumptionOutcomes.outcomeType,
        outcomeSummary: assumptionOutcomes.outcomeSummary,
        horizon: assumptionOutcomes.horizon,
        recommendationOutcomeId: assumptionOutcomes.recommendationOutcomeId,
        recordedAt: assumptionOutcomes.recordedAt,
      })
      .from(assumptionOutcomes)
      .where(
        and(
          eq(assumptionOutcomes.dealId, dealId),
          ownerScope(assumptionOutcomes, userId, orgId),
        ),
      )
      .orderBy(assumptionOutcomes.recordedAt),
    db
      .select({
        id: recommendations.id,
        claim: recommendations.claim,
        status: recommendations.status,
        stage: recommendations.stage,
        decidedAt: recommendations.decidedAt,
        supportingEvidence: recommendations.supportingEvidence,
      })
      .from(recommendations)
      .where(and(eq(recommendations.dealId, dealId), ownerScope(recommendations, userId, orgId))),
    loadCloseAnchor(dealId),
  ]);

  const rows = projectAssumptionLedger({
    assumptions: assumptionRows,
    outcomes: outcomeRows,
    recommendations: recRows,
    closeDate: anchor?.closeDate ?? null,
    today,
  });

  return { rows, summary: summariseLedger(rows) };
}
