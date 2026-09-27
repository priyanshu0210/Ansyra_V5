// ─────────────────────────────────────────────────────────────────────────────
// Outcomes owed (Phase 15.11) — a read model over
// recommendations ⋈ recommendation_outcomes ⋈ deals ⋈ deal_milestones.
// No new table, no view, no migration, no AI.
//
// THE MOAT RULE (inherited from comps-router.ts and failure-patterns.ts): a
// caller's queue is exactly their own rows plus their organization's. Never
// cross-org. Demo rows are always excluded so a sample portfolio cannot invent
// work for anyone.
//
// DRIZZLE BUILDER, NOT RAW SQL — and the departure from failure-patterns.ts is
// deliberate. That file's own comment justifies raw SQL because the grouping
// needs jsonb_array_elements; there is no jsonb here, no lateral, and no
// aggregate JS cannot do. The stronger reason is safety: the entire
// deals."createdBy" vs recommendations.created_by trap — which survives tsc and
// every unit test, and only dies in production — CANNOT occur through the
// builder, because ownerScope reads the column names off the schema. Choosing
// raw SQL here would re-adopt a known hazard to gain nothing.
//
// This module returns TRANSPORT ROWS and judges nothing. No date arithmetic, no
// horizon literal, no now(). The schedule has exactly one definition and it
// lives in contracts/outcome-schedule.ts; a wiring test asserts the absence.
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "./connection";
import { ownerScope } from "../lib/scope";
import { pickCloseDate, type CloseAnchor, type OwedRow } from "@contracts/outcome-schedule";
import { deals, dealMilestones, recommendationOutcomes, recommendations } from "@db/schema";

/**
 * Every decided recommendation the caller can see, with the horizons already
 * logged against it and its deal's close anchor.
 *
 * Three bounded queries stitched in JS rather than one join: joining outcomes to
 * recommendations would multiply each recommendation by its reads, and the
 * ledger is append-only with many reads per conclusion.
 */
export async function loadOwedRows(
  userId: string,
  orgId: string | null,
): Promise<OwedRow[]> {
  const db = getDb();

  // 1. Decided recommendations on non-demo deals the caller can see.
  //    The status filter here is a PERFORMANCE filter that mirrors
  //    scheduledHorizons — it is not a second definition of who owes. That
  //    judgement still belongs to contracts/outcome-schedule.ts.
  const recs = await db
    .select({
      recommendationId: recommendations.id,
      dealId: recommendations.dealId,
      dealName: deals.name,
      status: recommendations.status,
      decidedAt: recommendations.decidedAt,
      stage: recommendations.stage,
    })
    .from(recommendations)
    .innerJoin(deals, eq(deals.id, recommendations.dealId))
    .where(
      and(
        ownerScope(deals, userId, orgId),
        ownerScope(recommendations, userId, orgId),
        eq(deals.isDemo, false),
        inArray(recommendations.status, ["accepted", "rejected"]),
        isNotNull(recommendations.decidedAt),
      ),
    );

  if (recs.length === 0) return [];

  const recIds = recs.map((r) => r.recommendationId);
  const dealIds = [...new Set(recs.map((r) => r.dealId))];

  // 2. Which horizons already have a read, and whether the claim went moot.
  const outcomes = await db
    .select({
      recommendationId: recommendationOutcomes.recommendationId,
      horizon: recommendationOutcomes.horizon,
      outcomeType: recommendationOutcomes.outcomeType,
    })
    .from(recommendationOutcomes)
    .where(
      and(
        inArray(recommendationOutcomes.recommendationId, recIds),
        ownerScope(recommendationOutcomes, userId, orgId),
      ),
    );

  const loggedByRec = new Map<number, Set<string>>();
  const mootByRec = new Set<number>();
  for (const o of outcomes) {
    if (o.horizon) {
      const set = loggedByRec.get(o.recommendationId) ?? new Set<string>();
      set.add(o.horizon);
      loggedByRec.set(o.recommendationId, set);
    }
    if (o.outcomeType === "moot") mootByRec.add(o.recommendationId);
  }

  // 3. The close anchor. NO ownerScope on milestones — deliberately, and
  //    matching milestonesRouter.list, which scopes by deal access alone. A
  //    closing date is a property of the DEAL, not of the colleague who typed
  //    it; scoping it would give two members of one firm different anchors for
  //    the same deal, and therefore different due dates.
  const milestones = await db
    .select({
      id: dealMilestones.id,
      dealId: dealMilestones.dealId,
      dueDate: dealMilestones.dueDate,
      completed: dealMilestones.completed,
    })
    .from(dealMilestones)
    .where(and(inArray(dealMilestones.dealId, dealIds), eq(dealMilestones.kind, "closing")));

  const anchorByDeal = new Map<number, CloseAnchor | null>();
  for (const dealId of dealIds) {
    // A deal may carry several `closing` rows — deal_milestones has no unique
    // constraint. pickCloseDate owns which one wins.
    anchorByDeal.set(dealId, pickCloseDate(milestones.filter((m) => m.dealId === dealId)));
  }

  return recs.map((r) => {
    const anchor = anchorByDeal.get(r.dealId) ?? null;
    return {
      recommendationId: r.recommendationId,
      dealId: r.dealId,
      dealName: r.dealName,
      status: r.status,
      decidedAt: r.decidedAt as Date,
      stage: r.stage,
      loggedHorizons: [...(loggedByRec.get(r.recommendationId) ?? [])],
      hasMoot: mootByRec.has(r.recommendationId),
      closeDate: anchor?.closeDate ?? null,
      closeSource: anchor?.closeSource ?? null,
    };
  });
}

/**
 * One deal's close anchor, for the dossier.
 *
 * The caller must already have proved deal access (assertDealAccess), exactly as
 * resolveEvidence is called after assertRecAccess. Resolving this SERVER-side is
 * the whole point: api/milestones-router.ts gates every procedure on
 * featureQuery("timeline"), so a client-side fetch would silently 403 the
 * dossier for every member holding `recommendations` without `timeline`. Same
 * move listScenarioLinks makes for staleness.
 */
export async function loadCloseAnchor(dealId: number): Promise<{
  closeDate: string | null;
  closeSource: "closed" | "planned" | null;
}> {
  const rows = await getDb()
    .select({
      id: dealMilestones.id,
      dueDate: dealMilestones.dueDate,
      completed: dealMilestones.completed,
    })
    .from(dealMilestones)
    .where(and(eq(dealMilestones.dealId, dealId), eq(dealMilestones.kind, "closing")));

  const anchor = pickCloseDate(rows);
  return { closeDate: anchor?.closeDate ?? null, closeSource: anchor?.closeSource ?? null };
}
