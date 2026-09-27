// ─────────────────────────────────────────────────────────────────────────────
// Non-tRPC file downloads (Phase 15.2 — deferred CSV export). tRPC is awkward for
// binary/file responses, so this is a plain Hono handler mounted in boot.ts. It
// reuses authenticateRequest (the same session resolution the tRPC context uses)
// and enforces the SAME scoping + feature gate as the economics router — a
// download must never be a way around access control.
// ─────────────────────────────────────────────────────────────────────────────

import type { Hono, Env } from "hono";
import { sql } from "drizzle-orm";
import { authenticateRequest } from "./auth/verify";
import { getDb } from "./queries/connection";
import { pipelineCsvFilename, toCsvWithBom, type CsvCell } from "./lib/csv";
import { userFeatures } from "@db/schema";
import { eq, and } from "drizzle-orm";

async function hasFeature(userId: string, key: string): Promise<boolean> {
  const rows = await getDb()
    .select({ k: userFeatures.featureKey })
    .from(userFeatures)
    .where(and(eq(userFeatures.userId, userId), eq(userFeatures.featureKey, key)))
    .limit(1);
  return rows.length > 0;
}

export function registerExportRoutes<E extends Env>(app: Hono<E>): void {
  // GET /api/export/pipeline.csv — the caller's scoped deals joined with their
  // economics. Same gate as the Economics feature; same scopeFilter as everywhere.
  app.get("/api/export/pipeline.csv", async (c) => {
    let user;
    try {
      user = await authenticateRequest(c.req.raw.headers, c.res.headers);
    } catch {
      /* fall through to 401 */
    }
    if (!user) return c.json({ error: "Authentication required" }, 401);
    if (user.mustChangePassword) return c.json({ error: "Change your temporary password first" }, 403);
    if (user.userKind !== "member") return c.json({ error: "Members only" }, 403);
    if (!(await hasFeature(user.id, "economics"))) {
      return c.json({ error: "Deal Economics not enabled for this account" }, 403);
    }

    const orgId = user.organizationId ?? null;
    // Scoped exactly like deals.list + the comps read model: own rows or org's,
    // demo rows excluded (an export is a record, not a sandbox).
    const scope = orgId
      ? sql`(d."createdBy" = ${user.id} OR d.organization_id = ${orgId}) AND d.is_demo = false`
      : sql`d."createdBy" = ${user.id} AND d.is_demo = false`;

    const res = await getDb().execute(sql`
      SELECT d.name, d."targetCompany" AS target, d.stage, d.status, d.industry,
             d.value AS value_display,
             e.currency, e.enterprise_value, e.equity_value, e.net_debt,
             e.target_ebitda, e.target_revenue, e.ev_ebitda, e.ev_revenue,
             e.irr_estimate, e.moic_estimate
      FROM deals d
      LEFT JOIN deal_economics e ON e.deal_id = d.id
      WHERE ${scope}
      ORDER BY d."createdAt"
      LIMIT 5000
    `);

    const headers = [
      "Deal", "Target", "Stage", "Status", "Industry", "Value",
      "Currency", "Enterprise value (M)", "Equity value (M)", "Net debt (M)",
      "EBITDA (M)", "Revenue (M)", "EV/EBITDA", "EV/Revenue",
      "Est. IRR", "Est. MOIC",
    ];
    const num = (v: unknown): CsvCell => (v == null ? "" : Number(v));
    const rows: CsvCell[][] = (res.rows as Record<string, unknown>[]).map((r) => [
      r.name as string,
      r.target as string,
      r.stage as string,
      r.status as string,
      (r.industry as string) ?? "",
      (r.value_display as string) ?? "",
      (r.currency as string) ?? "",
      num(r.enterprise_value),
      num(r.equity_value),
      num(r.net_debt),
      num(r.target_ebitda),
      num(r.target_revenue),
      num(r.ev_ebitda),
      num(r.ev_revenue),
      r.irr_estimate == null ? "" : `${(Number(r.irr_estimate) * 100).toFixed(1)}%`,
      r.moic_estimate == null ? "" : `${Number(r.moic_estimate)}x`,
    ]);

    return new Response(toCsvWithBom(headers, rows), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${pipelineCsvFilename()}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
