import { decisionReadiness } from "@contracts/decision-readiness";
import { DEAL_STAGES, stageOrdinal } from "@contracts/stages";
// ─────────────────────────────────────────────────────────────────────────────
// Decision health (Phase 15.12) — the four reads behind one card.
//
// This module FETCHES and folds; every judgement lives in
// contracts/decision-health.ts, which in turn reads the shipped predicates
// rather than restating them.
//
// LAYERING IS LOAD-BEARING HERE. api/outcomes-owed.wiring.test.ts asserts that
// recommendations-router.ts does not import @contracts/recommendation-gate —
// "Owed is a memory. The gate is a rule." The gate is reached transitively:
// contracts/decision-health imports gateState, this module imports
// contracts/decision-health, and the router imports only loadDecisionHealth.
// Do NOT "simplify" by lifting gateState into the router; that turns a shipped
// test red and puts gate logic in a file whose job is not enforcement.
// decisions-router.ts remains the sole enforcement point.
//
// Drizzle builder, not raw SQL, for the reason outcomes-owed.ts gives: the
// deals."createdBy" vs recommendations.created_by trap — which survives tsc and
// only dies in production — cannot occur through ownerScope, because it reads
// the column names off the schema.
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq } from "drizzle-orm";
import { getDb } from "./connection";
import { ownerScope } from "../lib/scope";
import { loadCloseAnchor } from "./outcomes-owed";
import { loadPatternCells } from "./failure-patterns";
import { foldPatterns } from "@contracts/failure-patterns";
import { buildDecisionHealth, type DecisionHealth } from "@contracts/decision-health";
import { assumptions, recommendationOutcomes, recommendations } from "@db/schema";

/**
 * Everything the card needs for one deal.
 *
 * The caller must already have proved deal access (assertDealAccess), exactly as
 * resolveEvidence is called after assertRecAccess.
 *
 * No isDemo filter, deliberately: 15.10 and 15.11 exclude demo deals from
 * FIRM-WIDE aggregates so fixture data cannot invent work or invent a pattern.
 * This is a single deal the caller has already opened, and filtering it would
 * blank the card on a demo deal for no benefit. The pattern universe stays clean
 * regardless, because loadPatternCells applies the exclusion internally.
 */
export async function loadDecisionHealth(
  dealId: number,
  stage: string,
  userId: string,
  orgId: string | null,
): Promise<DecisionHealth> {
  const db = getDb();

  const [rows, outcomes, anchor, patternCells, ledger] = await Promise.all([
    // Mirrors `list`, so the card and the panel below it see the same rows.
    db
      .select({
        id: recommendations.id,
        stage: recommendations.stage,
        status: recommendations.status,
        confidence: recommendations.confidence,
        expiresAt: recommendations.expiresAt,
        decidedAt: recommendations.decidedAt,
        supportingEvidence: recommendations.supportingEvidence,
        counterarguments: recommendations.counterarguments,
      })
      .from(recommendations)
      .where(
        and(eq(recommendations.dealId, dealId), ownerScope(recommendations, userId, orgId)),
      ),
    // Mirrors `listOutcomes`.
    db
      .select({
        id: recommendationOutcomes.id,
        recommendationId: recommendationOutcomes.recommendationId,
        horizon: recommendationOutcomes.horizon,
        outcomeType: recommendationOutcomes.outcomeType,
      })
      .from(recommendationOutcomes)
      .where(
        and(
          eq(recommendationOutcomes.dealId, dealId),
          ownerScope(recommendationOutcomes, userId, orgId),
        ),
      ),
    // Reused, so pickCloseDate keeps one definition of the multi-milestone rule
    // — and so the timeline gate is never crossed from the client.
    loadCloseAnchor(dealId),
    // Server-internal, exactly as the AI drafter reads it. That module's header
    // says it exists as a query module precisely so callers can read it without
    // a feature gate. This is what makes patternsMatched TRUTHFUL for a
    // recommendations-only member: a client-side patterns.list (gated on
    // `analytics`) would silently yield [], indistinguishable from "no patterns".
    loadPatternCells(userId, orgId),
    db.select().from(assumptions).where(and(eq(assumptions.dealId, dealId), ownerScope(assumptions, userId, orgId))),
  ]);

  const health = buildDecisionHealth({
    dealId,
    stage,
    recommendations: rows,
    outcomes,
    patterns: foldPatterns(patternCells),
    closeDate: anchor.closeDate,
  });
  const readiness = decisionReadiness(rows, ledger, stage, DEAL_STAGES[stageOrdinal(stage) + 1]);
  return { ...health, gateStatus: readiness.kind === "blocked" || readiness.kind === "unknown" ? "blocked" : readiness.kind === "not_gated" ? "ungated" : "clear" };

}
