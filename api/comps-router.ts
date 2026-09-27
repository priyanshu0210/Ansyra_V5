// ─────────────────────────────────────────────────────────────────────────────
// Comps Engine (Phase 15.4) — precedent transactions from the firm's OWN deals.
// A read model over deals ⋈ deal_economics: no new tables, no AI. Percentiles are
// computed in Postgres (percentile_cont) rather than fetched-and-sorted in JS.
//
// THE MOAT RULE: a caller's comps universe is exactly their scopeFilter deal set
// — own rows plus their organization's. Never cross-org: the value of these comps
// is that they carry the firm's own judgement and outcomes. Demo rows are always
// excluded so a sample portfolio can't pollute real benchmarks.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { sql } from "drizzle-orm";
import { createRouter, featureQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { assertDealAccess } from "./deals-router";

const compsQuery = featureQuery("comps");

/** Sample size below which stats are shown but flagged as unreliable. */
const LOW_SAMPLE = 3;

export interface CompRow {
  dealId: number;
  name: string;
  targetCompany: string;
  industry: string | null;
  stage: string;
  status: string;
  currency: string;
  enterpriseValue: number | null;
  evEbitda: number | null;
  evRevenue: number | null;
  realizedIrr: number | null;
  realizedMoic: number | null;
  closedAt: string | null;
}

export interface CompStats {
  currency: string;
  n: number;
  evEbitda: { median: number | null; q1: number | null; q3: number | null; n: number };
  evRevenue: { median: number | null; q1: number | null; q3: number | null; n: number };
  lowSample: boolean;
}

const toNum = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

// Caller-scoped, demo-excluded base predicate shared by every query below.
// Interpolated via drizzle's sql template (parameterised — not string-concat).
function scopeSql(userId: string, orgId: string | null) {
  return orgId
    ? sql`(d."createdBy" = ${userId} OR d.organization_id = ${orgId}) AND d.is_demo = false`
    : sql`d."createdBy" = ${userId} AND d.is_demo = false`;
}

export const compsRouter = createRouter({
  // Precedent rows + per-currency stats. Currencies are NEVER blended: the app
  // has no FX table, so mixing them would invent numbers (same rule Analytics
  // adopted in Phase 11.1).
  query: compsQuery
    .input(
      z
        .object({
          sector: z.string().max(100).optional(),
          evMin: z.number().finite().optional(),
          evMax: z.number().finite().optional(),
          closedOnly: z.boolean().default(false),
        })
        .default({ closedOnly: false }),
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const scope = scopeSql(ctx.user.id, ctx.user.organizationId ?? null);
      const filters = [scope];
      if (input.sector) filters.push(sql`d.industry = ${input.sector}`);
      if (input.evMin != null) filters.push(sql`e.enterprise_value >= ${String(input.evMin)}`);
      if (input.evMax != null) filters.push(sql`e.enterprise_value <= ${String(input.evMax)}`);
      // "Closed" = the deal reached an end state, i.e. a real precedent.
      if (input.closedOnly) filters.push(sql`d.status = 'completed'`);
      const where = sql.join(filters, sql` AND `);

      const rowsRes = await db.execute(sql`
        SELECT d.id            AS deal_id,
               d.name          AS name,
               d."targetCompany" AS target_company,
               d.industry      AS industry,
               d.stage         AS stage,
               d.status        AS status,
               e.currency      AS currency,
               e.enterprise_value AS enterprise_value,
               e.ev_ebitda     AS ev_ebitda,
               e.ev_revenue    AS ev_revenue,
               e.realized ->> 'realizedIrr'  AS realized_irr,
               e.realized ->> 'realizedMoic' AS realized_moic,
               e.realized ->> 'exitDate'     AS closed_at
        FROM deal_economics e
        JOIN deals d ON d.id = e.deal_id
        WHERE ${where}
        ORDER BY e.ev_ebitda NULLS LAST, d.name
        LIMIT 1000
      `);

      // percentile_cont ignores NULLs, so a deal with n.m. EBITDA is excluded
      // from the EV/EBITDA stats but still counted in EV/Revenue.
      const statsRes = await db.execute(sql`
        SELECT e.currency AS currency,
               count(*)                                   AS n,
               count(e.ev_ebitda)                         AS n_ebitda,
               count(e.ev_revenue)                        AS n_revenue,
               percentile_cont(0.5)  WITHIN GROUP (ORDER BY e.ev_ebitda)  AS ebitda_median,
               percentile_cont(0.25) WITHIN GROUP (ORDER BY e.ev_ebitda)  AS ebitda_q1,
               percentile_cont(0.75) WITHIN GROUP (ORDER BY e.ev_ebitda)  AS ebitda_q3,
               percentile_cont(0.5)  WITHIN GROUP (ORDER BY e.ev_revenue) AS revenue_median,
               percentile_cont(0.25) WITHIN GROUP (ORDER BY e.ev_revenue) AS revenue_q1,
               percentile_cont(0.75) WITHIN GROUP (ORDER BY e.ev_revenue) AS revenue_q3
        FROM deal_economics e
        JOIN deals d ON d.id = e.deal_id
        WHERE ${where}
        GROUP BY e.currency
        ORDER BY count(*) DESC
      `);

      const rows: CompRow[] = (rowsRes.rows as Record<string, unknown>[]).map((r) => ({
        dealId: Number(r.deal_id),
        name: String(r.name),
        targetCompany: String(r.target_company),
        industry: (r.industry as string | null) ?? null,
        stage: String(r.stage),
        status: String(r.status),
        currency: String(r.currency ?? "USD"),
        enterpriseValue: toNum(r.enterprise_value),
        evEbitda: toNum(r.ev_ebitda),
        evRevenue: toNum(r.ev_revenue),
        realizedIrr: toNum(r.realized_irr),
        realizedMoic: toNum(r.realized_moic),
        closedAt: (r.closed_at as string | null) ?? null,
      }));

      const stats: CompStats[] = (statsRes.rows as Record<string, unknown>[]).map((s) => ({
        currency: String(s.currency ?? "USD"),
        n: Number(s.n),
        evEbitda: {
          median: toNum(s.ebitda_median),
          q1: toNum(s.ebitda_q1),
          q3: toNum(s.ebitda_q3),
          n: Number(s.n_ebitda),
        },
        evRevenue: {
          median: toNum(s.revenue_median),
          q1: toNum(s.revenue_q1),
          q3: toNum(s.revenue_q3),
          n: Number(s.n_revenue),
        },
        lowSample: Number(s.n) < LOW_SAMPLE,
      }));

      return { rows, stats };
    }),

  // This deal's entry multiple against the firm's precedents in the same sector.
  // Falls back to all sectors when the sector sample is too thin to mean anything.
  benchmark: compsQuery
    .input(z.object({ dealId: z.number() }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const deal = await assertDealAccess(input.dealId, ctx.user.id, orgId);
      const db = getDb();
      const scope = scopeSql(ctx.user.id, orgId);

      // The subject deal's own multiple (may be absent if economics aren't entered).
      const selfRes = await db.execute(sql`
        SELECT e.ev_ebitda AS ev_ebitda, e.currency AS currency
        FROM deal_economics e WHERE e.deal_id = ${deal.id} LIMIT 1
      `);
      const selfRow = (selfRes.rows as Record<string, unknown>[])[0];
      const evEbitda = toNum(selfRow?.ev_ebitda);
      const currency = String(selfRow?.currency ?? "USD");

      // Peers: same currency, excluding this deal itself.
      async function peerStats(sameSector: boolean) {
        const extra = sameSector
          ? sql` AND d.industry IS NOT DISTINCT FROM ${deal.industry ?? null}`
          : sql``;
        const res = await db.execute(sql`
          SELECT count(e.ev_ebitda) AS n,
                 percentile_cont(0.5)  WITHIN GROUP (ORDER BY e.ev_ebitda) AS median,
                 percentile_cont(0.25) WITHIN GROUP (ORDER BY e.ev_ebitda) AS q1,
                 percentile_cont(0.75) WITHIN GROUP (ORDER BY e.ev_ebitda) AS q3
          FROM deal_economics e
          JOIN deals d ON d.id = e.deal_id
          WHERE ${scope} AND d.id <> ${deal.id} AND e.currency = ${currency}
                AND e.ev_ebitda IS NOT NULL${extra}
        `);
        const r = (res.rows as Record<string, unknown>[])[0] ?? {};
        return { n: Number(r.n ?? 0), median: toNum(r.median), q1: toNum(r.q1), q3: toNum(r.q3) };
      }

      let basis: "sector" | "all" = "sector";
      let peers = await peerStats(true);
      if (peers.n < LOW_SAMPLE) {
        const all = await peerStats(false);
        // Only widen if it actually helps.
        if (all.n > peers.n) {
          peers = all;
          basis = "all";
        }
      }

      const deltaPct =
        evEbitda != null && peers.median != null && peers.median !== 0
          ? Math.round(((evEbitda - peers.median) / peers.median) * 1000) / 10
          : null;

      return {
        dealId: deal.id,
        sector: deal.industry ?? null,
        currency,
        evEbitda,
        basis,
        peers,
        deltaPct,
        lowSample: peers.n < LOW_SAMPLE,
      };
    }),
});
