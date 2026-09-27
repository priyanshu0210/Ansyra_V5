// ─────────────────────────────────────────────────────────────────────────────
// Scenario reads (Phase 15.13) — two scoped selects, then one pure projection.
//
// This module FETCHES; every judgement lives in contracts/scenarios.ts. It adds
// no table and writes nothing: scenarios are a view over scenario_analyses.result,
// so there is no row here to insert, update or backfill.
//
// Drizzle builder, not raw SQL, and the reason is sharper here than usual.
// `assumptions` is one of the camelCase-column tables: its columns are
// "dealId" and "createdBy" (db/schema.ts), while scenario_analyses uses
// deal_id / created_by. A hand-written predicate mixing the two produces
// `assumptions.created_by` — which type-checks perfectly and fails at RUNTIME
// with 42703. ownerScope reads the column names off the schema, so the trap
// cannot occur through it. This is the same hazard failure-patterns.ts had to
// document a dedicated wiring assertion for.
// ─────────────────────────────────────────────────────────────────────────────

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./connection";
import { ownerScope } from "../lib/scope";
import { projectScenarios, type Scenario } from "@contracts/scenarios";
import { assumptions, scenarioAnalyses } from "@db/schema";

/**
 * Every scenario on a deal, newest run first.
 *
 * The caller must already have proved deal access (assertDealAccess), the same
 * contract loadDecisionHealth and resolveEvidence work under.
 *
 * Assumptions are fetched purely to resolve driver names to ids. An empty list
 * is not an error: the projection simply leaves every `assumptionId` null, and
 * `unmatchedDrivers` reports it honestly rather than the UI implying the
 * scenario depends on nothing.
 */
export async function loadScenarios(
  dealId: number,
  userId: string,
  orgId: string | null,
): Promise<Scenario[]> {
  const db = getDb();

  const [snapshots, assumptionRows] = await Promise.all([
    db
      .select({
        id: scenarioAnalyses.id,
        dealId: scenarioAnalyses.dealId,
        result: scenarioAnalyses.result,
        assumptionCount: scenarioAnalyses.assumptionCount,
        model: scenarioAnalyses.model,
        createdBy: scenarioAnalyses.createdBy,
        createdAt: scenarioAnalyses.createdAt,
      })
      .from(scenarioAnalyses)
      .where(
        and(
          eq(scenarioAnalyses.dealId, dealId),
          ownerScope(scenarioAnalyses, userId, orgId),
        ),
      )
      .orderBy(desc(scenarioAnalyses.id)),
    db
      .select({ id: assumptions.id, assumption: assumptions.assumption })
      .from(assumptions)
      .where(and(eq(assumptions.dealId, dealId), ownerScope(assumptions, userId, orgId))),
  ]);

  return projectScenarios(snapshots, assumptionRows);
}
