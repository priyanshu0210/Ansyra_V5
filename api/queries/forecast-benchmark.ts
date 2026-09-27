// ─────────────────────────────────────────────────────────────────────────────
// Cross-deal scenario accuracy (Phase 15.20) — which case class has been
// closest to what actually happened.
//
// A query module rather than a router method, the same posture as
// failure-patterns.ts and assumption-learning.ts, so a future AI caller can
// read it without needing the `analytics` grant.
//
// THE MOAT RULE, verbatim from its siblings: caller-scoped, never cross-org,
// demo deals always excluded — a fixture deal must not be able to invent a
// track record the firm never had.
//
// The scoring cannot be done in SQL: the forecast lives in
// scenario_analyses.result.cases[].drivers[].assumption as free text, and
// resolving it to an assumption id is contracts/scenarios.ts::projectScenarios,
// which is deliberately exact-match TypeScript rather than anything a jsonb
// operator could express. So this fetches three scoped sets and folds in TS —
// the same division of labour PatternCell established, with the projection
// standing in for the GROUP BY.
//
// THREE queries for the whole portfolio, not three per deal. The projection is
// still per-deal — driver names resolve only against THAT deal's assumptions —
// which is why the rows are grouped by deal_id in memory before projecting,
// rather than joined across deals in SQL where one deal's assumption text
// could resolve another deal's driver.
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "./connection";
import { ownerScope } from "../lib/scope";
import { projectScenarios } from "@contracts/scenarios";
import { scoreScenario, type BenchmarkCell } from "@contracts/forecast-actual";
import { assumptionOutcomes, assumptions, deals, scenarioAnalyses } from "@db/schema";

function groupBy<T>(rows: T[], key: (row: T) => number): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k) ?? [];
    list.push(row);
    out.set(k, list);
  }
  return out;
}

/**
 * One cell per (scenario case) across every non-demo deal this caller can see.
 *
 * Deals are the outer scope because every other read hangs off them, and
 * because `is_demo` lives there. Everything inside is scoped again on its own
 * table — a colleague's assumption reads on a deal you can see are not yours to
 * count, which is the same rule assumption-learning.ts applies.
 */
export async function loadBenchmarkCells(
  userId: string,
  orgId: string | null,
): Promise<BenchmarkCell[]> {
  const db = getDb();

  const dealRows = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(ownerScope(deals, userId, orgId), eq(deals.isDemo, false)));

  if (dealRows.length === 0) return [];
  const dealIds = dealRows.map((d) => d.id);

  const [snapshots, assumptionRows, outcomeRows] = await Promise.all([
    db
      .select({
        id: scenarioAnalyses.id,
        dealId: scenarioAnalyses.dealId,
        result: scenarioAnalyses.result,
        createdAt: scenarioAnalyses.createdAt,
      })
      .from(scenarioAnalyses)
      .where(and(inArray(scenarioAnalyses.dealId, dealIds), ownerScope(scenarioAnalyses, userId, orgId))),
    db
      .select({ id: assumptions.id, dealId: assumptions.dealId, assumption: assumptions.assumption })
      .from(assumptions)
      .where(and(inArray(assumptions.dealId, dealIds), ownerScope(assumptions, userId, orgId))),
    db
      .select({
        dealId: assumptionOutcomes.dealId,
        assumptionId: assumptionOutcomes.assumptionId,
        outcomeType: assumptionOutcomes.outcomeType,
        recordedAt: assumptionOutcomes.recordedAt,
      })
      .from(assumptionOutcomes)
      .where(and(inArray(assumptionOutcomes.dealId, dealIds), ownerScope(assumptionOutcomes, userId, orgId))),
  ]);

  const snapshotsByDeal = groupBy(snapshots, (s) => s.dealId);
  const assumptionsByDeal = groupBy(assumptionRows, (a) => a.dealId);
  const outcomesByDeal = groupBy(outcomeRows, (o) => o.dealId);

  const cells: BenchmarkCell[] = [];
  for (const id of dealIds) {
    const dealSnapshots = snapshotsByDeal.get(id) ?? [];
    const dealOutcomes = outcomesByDeal.get(id) ?? [];
    if (dealSnapshots.length === 0 || dealOutcomes.length === 0) continue;

    for (const scenario of projectScenarios(dealSnapshots, assumptionsByDeal.get(id) ?? [])) {
      const a = scoreScenario(scenario, dealOutcomes);
      // A case nothing could be judged on is not a data point. foldBenchmark
      // drops these too; skipping here keeps the scenario COUNT honest, since
      // that count is a floor and must mean "scenarios that said something".
      if (a.judgeable === 0) continue;
      cells.push({
        caseName: a.caseName,
        judged: a.judgeable,
        matched: a.matched,
        tooOptimistic: a.tooOptimistic,
        tooPessimistic: a.tooPessimistic,
      });
    }
  }

  return cells;
}
