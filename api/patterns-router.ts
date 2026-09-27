// ─────────────────────────────────────────────────────────────────────────────
// Failure patterns (Phase 15.10) — the firm's own recorded misfires, clustered.
// The SQL lives in api/queries/failure-patterns.ts so the AI drafter can read it
// directly without going through this procedure; the judgement lives in
// contracts/failure-patterns.ts. This file is only the boundary.
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, inArray } from "drizzle-orm";
import { createRouter, featureQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { loadPatternCells } from "./queries/failure-patterns";
import { loadAssumptionCells } from "./queries/assumption-learning";
import { loadBenchmarkCells } from "./queries/forecast-benchmark";
import { loadOwedRows } from "./queries/outcomes-owed";
import { ownerScope } from "./lib/scope";
import { foldPatterns } from "@contracts/failure-patterns";
import { foldAssumptionFindings } from "@contracts/assumption-learning";
import { benchmarkHeadline, foldBenchmark } from "@contracts/forecast-actual";
import { foldOwed } from "@contracts/outcome-schedule";
import { todayIso } from "@contracts/milestones";
import { deals, recommendations } from "@db/schema";

// Gated on `analytics`, NOT `recommendations`. The panel lives in the Analytics
// tab, and a member holding `analytics` alone must be able to open that tab
// without a 403. Safe because the payload carries NO claim text, NO rationale
// and NO counterarguments — only counts, derived axes, recommendation ids, and
// deal names the caller already sees listed in Analytics.
//
// The cost, accepted: a member with `recommendations` but not `analytics` gets
// no per-card advisory. That degrades exactly the way the scenario-snapshot
// picker already does in Recommendations.tsx — no 403, no dead affordance, just
// nothing. The alternative was new multi-key authorization middleware, which is
// new surface in the most security-sensitive file in the repo to buy one
// advisory line for a rare grant combination.
const patternQuery = featureQuery("analytics");

export const patternsRouter = createRouter({
  list: patternQuery.query(async ({ ctx }) => {
    const orgId = ctx.user.organizationId ?? null;
    const patterns = foldPatterns(await loadPatternCells(ctx.user.id, orgId));

    // The aggregate returns recommendation ids; the cards need somewhere to send
    // a reader. Re-scoped with ownerScope even though the ids came out of an
    // already-scoped aggregate — the same belt-and-braces posture resolveEvidence
    // documents, and cheap.
    const ids = [...new Set(patterns.flatMap((p) => p.exampleRecommendationIds))];
    const examples = ids.length
      ? await getDb()
          .select({
            recommendationId: recommendations.id,
            dealId: recommendations.dealId,
            dealName: deals.name,
            stage: recommendations.stage,
          })
          .from(recommendations)
          .innerJoin(deals, eq(deals.id, recommendations.dealId))
          .where(
            and(
              inArray(recommendations.id, ids),
              ownerScope(recommendations, ctx.user.id, orgId),
            ),
          )
      : [];

    return { patterns, examples };
  }),

  // The firm's outcome queue (Phase 15.11) — which decided recommendations are
  // owed a read, and at which horizon.
  //
  // Folded HERE rather than in the client so the whole surface reads ONE clock:
  // the headline count and the per-deal lines cannot disagree across a midnight.
  // Same reason listScenarioLinks computes staleness server-side.
  //
  // Payload is counts, deal names and ids — no claim, no rationale, no
  // counterarguments. That omission is what makes the `analytics` gate
  // defensible, exactly as for `list` above.
  outcomesOwed: patternQuery.query(async ({ ctx }) => {
    const rows = await loadOwedRows(ctx.user.id, ctx.user.organizationId ?? null);
    return foldOwed(rows, todayIso());
  }),

  /**
   * Which CATEGORIES of assumption keep turning out wrong (Phase 15.15).
   *
   * Sibling of `list`, one layer down the engine: that asks whether our wrong
   * conclusions are shaped alike, this asks which of our claims about the world
   * keep breaking regardless of what we concluded from them.
   *
   * Same gate and same reasoning as `list`: the payload is counts and category
   * labels only — no statement text, no deal names, no ids. Nothing here
   * identifies which assumption on which deal, so it is safe behind `analytics`
   * without widening what an analytics-only member can read.
   */
  assumptionFindings: patternQuery.query(async ({ ctx }) => {
    const cells = await loadAssumptionCells(ctx.user.id, ctx.user.organizationId ?? null);
    return foldAssumptionFindings(cells);
  }),

  /**
   * Which scenario case class has been closest to what happened (Phase 15.20).
   *
   * Same gate and same reasoning as the two folds beside it: the payload is
   * counts, rates and case labels only — no deal names, no ids, no claim or
   * assumption text. Nothing here identifies which scenario on which deal.
   */
  scenarioBenchmark: patternQuery.query(async ({ ctx }) => {
    const findings = foldBenchmark(
      await loadBenchmarkCells(ctx.user.id, ctx.user.organizationId ?? null),
    );
    return { findings, headline: benchmarkHeadline(findings) };
  }),
});
