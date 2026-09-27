// ─────────────────────────────────────────────────────────────────────────────
// Failure patterns (Phase 15.10) — a read model over
// recommendations ⋈ recommendation_outcomes ⋈ deals. No new tables, no view, no
// AI. Raw SQL for the same reason comps-router.ts is: the grouping needs
// jsonb_array_elements, and doing it in JS means fetching every outcome row on
// every deal the caller can see.
//
// THE MOAT RULE (inherited verbatim from comps-router.ts): a caller's pattern
// universe is exactly their own rows plus their organization's. Never cross-org
// — the whole value of these patterns is that they are the firm's OWN mistakes.
// Demo rows are always excluded so a sample portfolio cannot invent a failure
// pattern out of fixture data.
//
// A query module rather than a router, so ai-router's drafter can read it
// directly without going through a feature-gated procedure (see patterns-router
// for why the procedure is gated on `analytics` while the drafter is not).
//
// The high-signal rule is deliberately NOT restated here. This returns
// rec_status and outcome_type as group keys, and contracts/outcomes.ts's
// isHighSignal decides — exactly as its docblock asks.
// ─────────────────────────────────────────────────────────────────────────────

import { sql } from "drizzle-orm";
import { getDb } from "./connection";
import {
  CONFIDENCE_HIGH_MIN,
  CONFIDENCE_MEDIUM_MIN,
  EVIDENCE_KINDS,
} from "@contracts/recommendations";
import type { PatternCell } from "@contracts/failure-patterns";

// Two scope predicates, deliberately NOT one shared helper: `deals.createdBy` is
// declared uuid("createdBy") — quoted camelCase in SQL — while
// recommendations.createdBy is uuid("created_by"), snake_case. A shared helper
// would hide a difference that is real, and copying comps-router's scopeSql onto
// `r` yields r."createdBy", which fails at RUNTIME, not compile time.
// Interpolated via drizzle's sql template (parameterised — not string-concat).

/** Deal-side scope, plus the demo exclusion. Column is quoted camelCase. */
function dealScopeSql(userId: string, orgId: string | null) {
  return orgId
    ? sql`(d."createdBy" = ${userId} OR d.organization_id = ${orgId}) AND d.is_demo = false`
    : sql`d."createdBy" = ${userId} AND d.is_demo = false`;
}

/** Recommendation-side scope. Column is snake_case. */
function recScopeSql(userId: string, orgId: string | null) {
  return orgId
    ? sql`(r.created_by = ${userId} OR r.organization_id = ${orgId})`
    : sql`r.created_by = ${userId}`;
}

/** The evidence kinds a cluster may be keyed on, as a SQL list. */
const KIND_LIST = sql.join(
  EVIDENCE_KINDS.map((k) => sql`${k}`),
  sql`, `,
);

const toCount = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * One row per (evidence kind × stage × confidence band × horizon × rec status ×
 * outcome type), with a count and up to three example recommendation ids.
 *
 * The grain is (outcome × distinct evidence kind), NOT per recommendation. The
 * ledger is append-only with many reads per conclusion, and counting
 * recommendations would collapse a trajectory — wrong at thirty days, right at
 * six months — into a single row, destroying exactly the signal 15.9 exists to
 * preserve.
 */
export async function loadPatternCells(
  userId: string,
  orgId: string | null,
): Promise<PatternCell[]> {
  const db = getDb();
  const where = sql.join(
    [dealScopeSql(userId, orgId), recScopeSql(userId, orgId)],
    sql` AND `,
  );

  const res = await db.execute(sql`
    WITH cited AS (
      SELECT DISTINCT
             o.id                               AS outcome_id,
             r.id                               AS rec_id,
             r.stage                            AS stage,
             r.status                           AS rec_status,
             CASE WHEN r.confidence >= ${CONFIDENCE_HIGH_MIN}   THEN 'high'
                  WHEN r.confidence >= ${CONFIDENCE_MEDIUM_MIN} THEN 'medium'
                  ELSE 'low' END                AS band,
             ev ->> 'kind'                      AS kind,
             o.outcome_type                     AS outcome_type,
             COALESCE(o.horizon, 'unspecified') AS horizon
      FROM recommendation_outcomes o
      JOIN recommendations r ON r.id = o.recommendation_id
      JOIN deals d           ON d.id = r.deal_id
      -- CROSS JOIN, not LEFT JOIN: a recommendation citing nothing belongs to no
      -- cluster and should drop out rather than form a phantom NULL-kind
      -- pattern. jsonb_typeof guards the unnest because jsonb_array_elements
      -- RAISES on a scalar, and a Postgres error is not recoverable per-row —
      -- one malformed row would 500 the whole Analytics tab.
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(r.supporting_evidence) = 'array'
             THEN r.supporting_evidence
             ELSE '[]'::jsonb END
      ) AS ev
      WHERE ${where}
        AND ev ->> 'kind' IN (${KIND_LIST})
    )
    SELECT kind,
           stage,
           band,
           horizon,
           rec_status,
           outcome_type,
           count(*)                          AS n,
           -- Postgres has no LIMIT inside an aggregate; slicing after the fact
           -- is the idiom, and DISTINCT makes it deterministic (ascending id).
           (array_agg(DISTINCT rec_id))[1:3] AS example_rec_ids
    FROM cited
    GROUP BY kind, stage, band, horizon, rec_status, outcome_type
    ORDER BY count(*) DESC
    LIMIT 5000
  `);

  return (res.rows as Record<string, unknown>[]).map((c) => ({
    kind: String(c.kind),
    stage: String(c.stage),
    band: String(c.band) as PatternCell["band"],
    horizon: String(c.horizon) as PatternCell["horizon"],
    recStatus: String(c.rec_status),
    outcomeType: String(c.outcome_type),
    n: toCount(c.n),
    exampleRecommendationIds: ((c.example_rec_ids as unknown[]) ?? []).map((x) =>
      Number(x),
    ),
  }));
}
