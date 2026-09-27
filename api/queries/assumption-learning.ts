// ─────────────────────────────────────────────────────────────────────────────
// Cross-deal assumption learning (Phase 15.15) — the aggregate behind
// contracts/assumption-learning.ts::foldAssumptionFindings.
//
// A query module rather than a router method, the same posture as
// failure-patterns.ts, so a future AI drafter can read the firm's assumption
// history directly without needing the `analytics` grant.
//
// THE MOAT RULE (verbatim from failure-patterns.ts): caller-scoped, never
// cross-org, demo deals always excluded. A firm's own recorded history is the
// asset; leaking it across orgs would destroy the only thing that cannot be
// copied, and letting sample-portfolio rows into it would invent a history the
// firm never had.
//
// Drizzle builder, not raw SQL. failure-patterns.ts justifies raw SQL because
// its grouping needs jsonb_array_elements over supporting_evidence; there is no
// jsonb here — category and horizon are plain columns — so the builder wins,
// and with it immunity to the assumptions."dealId" / assumption_outcomes.deal_id
// casing trap that this module would otherwise be exposed to on both sides.
// ─────────────────────────────────────────────────────────────────────────────

import { and, count, eq } from "drizzle-orm";
import { getDb } from "./connection";
import { ownerScope } from "../lib/scope";
import type { AssumptionCell } from "@contracts/assumption-learning";
import { assumptionOutcomes, assumptions, deals } from "@db/schema";

/**
 * One row per (category, horizon, outcome_type) across every deal this caller
 * can see.
 *
 * The grain is the READ, not the assumption: an assumption read at 30 days and
 * again at 6 months contributes to two cells, which is correct — those are two
 * separate observations about the world and collapsing them would destroy the
 * trajectory the ledger exists to keep.
 *
 * `is_demo = false` is the fixture exclusion. Note it sits on `deals`, which is
 * why the join exists at all: assumption_outcomes carries deal_id but not the
 * demo flag.
 */
export async function loadAssumptionCells(
  userId: string,
  orgId: string | null,
): Promise<AssumptionCell[]> {
  const rows = await getDb()
    .select({
      category: assumptions.category,
      horizon: assumptionOutcomes.horizon,
      outcomeType: assumptionOutcomes.outcomeType,
      n: count(),
    })
    .from(assumptionOutcomes)
    .innerJoin(assumptions, eq(assumptions.id, assumptionOutcomes.assumptionId))
    .innerJoin(deals, eq(deals.id, assumptionOutcomes.dealId))
    .where(
      and(
        // Scoped on the OUTCOME, which is the row being counted. Scoping only
        // the deal would count a colleague's reads on a deal you can see.
        ownerScope(assumptionOutcomes, userId, orgId),
        eq(deals.isDemo, false),
      ),
    )
    .groupBy(assumptions.category, assumptionOutcomes.horizon, assumptionOutcomes.outcomeType);

  return rows.map((r) => ({
    // NULL category means a pre-15.15 row. Mapped to "other" here rather than
    // dropped, so the fold's own "other never makes a claim" rule is the single
    // place that decision lives.
    category: r.category ?? "other",
    horizon: r.horizon ?? null,
    outcomeType: r.outcomeType,
    n: Number(r.n),
  }));
}
