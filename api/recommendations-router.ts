import { decisionReadiness } from "@contracts/decision-readiness";
import { stageOrdinal } from "@contracts/stages";
// ─────────────────────────────────────────────────────────────────────────────
// Recommendations (Phase 15.8) — the decision engine's record layer. A
// recommendation is a conclusion someone reached about this deal at this stage:
// the claim, the reasoning, the analyses it rests on, what argues against it,
// and how sure they were. Accepted ones gate stage advancement (the check lives
// in decisions.record, the predicate in contracts/recommendation-gate.ts) and
// feed the IC memo.
//
// Append-only in spirit, like `decisions`: a draft can be edited freely, but an
// accepted recommendation is never rewritten — it is superseded, and the chain
// stays auditable. `update` enforces that rather than documenting it.
//
// The AI drafter is NOT here — it lives in ai-router.ts with every other model
// call, per the single-AI-entry rule.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, featureQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { ownerScope } from "./lib/scope";
import { logActivity } from "./lib/activity";
import { assertDealAccess } from "./deals-router";
import { DEAL_STAGES } from "@contracts/stages";
import {
  COUNTERARGUMENT_WEIGHTS,
  EVIDENCE_KINDS,
  RECOMMENDATION_STATUSES,
  acceptBlockedMessage,
  canAccept,
  dedupeEvidence,
  type EvidenceKind,
  type RecommendationEvidence,
} from "@contracts/recommendations";
import {
  OUTCOME_HORIZONS,
  OUTCOME_TYPES,
  OUTCOME_TYPE_LABELS,
  canRecordOutcome,
  outcomeBlockedMessage,
} from "@contracts/outcomes";
import {
  SCENARIO_LINK_CASES,
  SCENARIO_RELATIONS,
  linkStaleness,
} from "@contracts/scenario-links";
import { loadCloseAnchor } from "./queries/outcomes-owed";
import { loadDecisionHealth } from "./queries/decision-health";
import {
  assumptions,
  culturalScores,
  dealEconomics,
  documentAnalyses,
  documents,
  icMemos,
  recommendationOutcomes,
  recommendationScenarios,
  recommendations,
  regulatoryAnalyses,
  scenarioAnalyses,
  synergyPlans,
} from "@db/schema";

const recQuery = featureQuery("recommendations");

async function assertRecAccess(id: number, userId: string, orgId: string | null) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(recommendations)
    .where(eq(recommendations.id, id))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Recommendation not found." });
  const deal = await assertDealAccess(row.dealId, userId, orgId);
  return { row, deal };
}

// ─── Input fragments ─────────────────────────────────────────────────────────

const EvidenceSchema = z
  .array(
    z.object({
      kind: z.enum(EVIDENCE_KINDS),
      id: z.number().int().positive(),
      label: z.string().trim().max(200).optional(),
    }),
  )
  .max(30);

const CounterargumentSchema = z
  .array(
    z.object({
      point: z.string().trim().min(3).max(500),
      weight: z.enum(COUNTERARGUMENT_WEIGHTS),
      response: z.string().trim().max(1000).nullish(),
    }),
  )
  .max(20);

const ClaimSchema = z.string().trim().min(10, "A claim needs to be a sentence someone could argue with.").max(1000);
const RationaleSchema = z.string().trim().min(20, "Give at least a sentence of reasoning.");
const ConfidenceSchema = z.number().int().min(0).max(100);

// ─── Evidence resolution ─────────────────────────────────────────────────────

export interface ResolvedEvidence extends RecommendationEvidence {
  /** One line describing the cited analysis as it stands NOW. */
  summary: string;
  /** True when the cited row is gone, or was never reachable from this deal. */
  missing: boolean;
}

const clip = (s: unknown, n = 160) => JSON.stringify(s ?? {}).slice(0, n);

/**
 * Resolve an evidence list into live one-liners.
 *
 * One query per referenced KIND, never one per ref — at most 8 round-trips no
 * matter how long the citation list is, and typically two or three. Every query
 * additionally filters on this deal and on ownerScope: `assertDealAccess` has
 * already proved the caller may see the deal, but a hand-crafted
 * supportingEvidence array could otherwise cite another deal's analysis by id
 * and have this resolver read it out.
 *
 * Unresolvable refs are kept and marked `missing`, not dropped. A citation that
 * silently disappears is worse than one that says its source is gone.
 */
async function resolveEvidence(
  refs: readonly RecommendationEvidence[],
  dealId: number,
  userId: string,
  orgId: string | null,
): Promise<ResolvedEvidence[]> {
  if (refs.length === 0) return [];
  const db = getDb();

  const byKind = new Map<EvidenceKind, number[]>();
  for (const r of refs) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r.id]);
  const ids = (k: EvidenceKind) => byKind.get(k) ?? [];
  const want = (k: EvidenceKind) => ids(k).length > 0;

  // document_analyses carries no deal_id — it is reachable only through the
  // deal's own documents, so that is how we scope it.
  const docIds = want("document_analysis")
    ? (
        await db
          .select({ id: documents.id })
          .from(documents)
          .where(and(eq(documents.dealId, dealId), ownerScope(documents, userId, orgId)))
      ).map((d) => d.id)
    : [];

  const [assumptionRows, econRows, culturalRows, regulatoryRows, synergyRows, scenarioRows, docAnalysisRows, memoRows] =
    await Promise.all([
      want("assumption")
        ? db
            .select({ id: assumptions.id, assumption: assumptions.assumption, result: assumptions.result })
            .from(assumptions)
            .where(and(inArray(assumptions.id, ids("assumption")), eq(assumptions.dealId, dealId), ownerScope(assumptions, userId, orgId)))
        : [],
      want("economics")
        ? db
            .select()
            .from(dealEconomics)
            .where(and(inArray(dealEconomics.id, ids("economics")), eq(dealEconomics.dealId, dealId), ownerScope(dealEconomics, userId, orgId)))
        : [],
      want("cultural")
        ? db
            .select({ id: culturalScores.id, acquirer: culturalScores.acquirer, target: culturalScores.target, result: culturalScores.result })
            .from(culturalScores)
            .where(and(inArray(culturalScores.id, ids("cultural")), eq(culturalScores.dealId, dealId), ownerScope(culturalScores, userId, orgId)))
        : [],
      want("regulatory")
        ? db
            .select({ id: regulatoryAnalyses.id, target: regulatoryAnalyses.target, geography: regulatoryAnalyses.geography, result: regulatoryAnalyses.result })
            .from(regulatoryAnalyses)
            .where(and(inArray(regulatoryAnalyses.id, ids("regulatory")), eq(regulatoryAnalyses.dealId, dealId), ownerScope(regulatoryAnalyses, userId, orgId)))
        : [],
      want("synergy")
        ? db
            .select({ id: synergyPlans.id, categories: synergyPlans.categories })
            .from(synergyPlans)
            .where(and(inArray(synergyPlans.id, ids("synergy")), eq(synergyPlans.dealId, dealId), ownerScope(synergyPlans, userId, orgId)))
        : [],
      want("scenario")
        ? db
            .select({ id: scenarioAnalyses.id, result: scenarioAnalyses.result, assumptionCount: scenarioAnalyses.assumptionCount })
            .from(scenarioAnalyses)
            .where(and(inArray(scenarioAnalyses.id, ids("scenario")), eq(scenarioAnalyses.dealId, dealId), ownerScope(scenarioAnalyses, userId, orgId)))
        : [],
      want("document_analysis") && docIds.length
        ? db
            .select({ id: documentAnalyses.id, kind: documentAnalyses.kind, documentId: documentAnalyses.documentId, result: documentAnalyses.result })
            .from(documentAnalyses)
            .where(and(inArray(documentAnalyses.id, ids("document_analysis")), inArray(documentAnalyses.documentId, docIds), ownerScope(documentAnalyses, userId, orgId)))
        : [],
      want("ic_memo")
        ? db
            .select({ id: icMemos.id, result: icMemos.result })
            .from(icMemos)
            .where(and(inArray(icMemos.id, ids("ic_memo")), eq(icMemos.dealId, dealId), ownerScope(icMemos, userId, orgId)))
        : [],
    ]);

  const index = <T extends { id: number }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
  const assumptionById = index(assumptionRows);
  const econById = index(econRows);
  const culturalById = index(culturalRows);
  const regulatoryById = index(regulatoryRows);
  const synergyById = index(synergyRows);
  const scenarioById = index(scenarioRows);
  const docAnalysisById = index(docAnalysisRows);
  const memoById = index(memoRows);

  // Server presentation, deliberately kept local: the phrasing mirrors the IC
  // memo's source blocks so a citation reads the same wherever it surfaces.
  function summarise(ref: RecommendationEvidence): string | undefined {
    switch (ref.kind) {
      case "assumption": {
        const a = assumptionById.get(ref.id);
        return a && `"${a.assumption}" — optimism ${a.result?.optimismScore ?? "?"}/100, ${a.result?.confidence ?? "?"} confidence`;
      }
      case "economics": {
        const e = econById.get(ref.id);
        return e && `EV ${e.enterpriseValue ?? "?"}M ${e.currency} · EV/EBITDA ${e.evEbitda ?? "n.m."}x · EV/Revenue ${e.evRevenue ?? "n.m."}x`;
      }
      case "cultural": {
        const c = culturalById.get(ref.id);
        return c && `${c.acquirer} × ${c.target} — ${clip(c.result)}`;
      }
      case "regulatory": {
        const r = regulatoryById.get(ref.id);
        return r && `${r.target} (${r.geography}) — ${clip(r.result)}`;
      }
      case "synergy": {
        const s = synergyById.get(ref.id);
        return s && `${(s.categories ?? []).length} synergy categories — ${(s.categories ?? []).map((c) => c.category).join(", ")}`;
      }
      case "scenario": {
        const s = scenarioById.get(ref.id);
        return (
          s &&
          `${(s.result?.cases ?? []).map((c) => `${c.name} (illustrative; likelihood not estimated)`).join(" · ")} (from ${s.assumptionCount} assumptions)`
        );
      }
      case "document_analysis": {
        const d = docAnalysisById.get(ref.id);
        return d && `${d.kind.replace(/_/g, " ")} — ${clip(d.result)}`;
      }
      case "ic_memo": {
        const m = memoById.get(ref.id);
        return m && `IC memo — ${m.result?.recommendation?.verdict ?? "no verdict"}: ${m.result?.thesis ?? ""}`.slice(0, 200);
      }
    }
  }

  return refs.map((ref) => {
    const summary = summarise(ref);
    return summary
      ? { ...ref, summary, missing: false }
      : { ...ref, summary: ref.label ?? "Source no longer available", missing: true };
  });
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const recommendationsRouter = createRouter({
  // Every recommendation's citations, resolved ONCE for the deal: the union of
  // references is resolved in at most eight queries and handed back per row,
  // instead of eight queries per recommendation.
  packEvidence: recQuery.input(z.object({ dealId: z.number() })).query(async ({ ctx, input }) => {
    const orgId = ctx.user.organizationId ?? null;
    await assertDealAccess(input.dealId, ctx.user.id, orgId);
    const rows = await getDb().select().from(recommendations).where(and(eq(recommendations.dealId, input.dealId), ownerScope(recommendations, ctx.user.id, orgId)));
    const union = new Map<string, RecommendationEvidence>();
    for (const r of rows) for (const ref of r.supportingEvidence) {
      const k = `${ref.kind}:${ref.id}`;
      if (!union.has(k)) union.set(k, ref);
    }
    const resolved = await resolveEvidence([...union.values()], input.dealId, ctx.user.id, orgId);
    const byKey = new Map(resolved.map((e) => [`${e.kind}:${e.id}`, e]));
    return Object.fromEntries(
      rows.map((r) => [
        r.id,
        r.supportingEvidence.map((ref): ResolvedEvidence => {
          const hit = byKey.get(`${ref.kind}:${ref.id}`);
          return hit && !hit.missing
            ? { ...ref, summary: hit.summary, missing: false }
            : { ...ref, summary: ref.label ?? "Source no longer available", missing: true };
        }),
      ]),
    );
  }),

  readiness: recQuery.input(z.object({ dealId: z.number(), toStage: z.enum(DEAL_STAGES).optional() })).query(async ({ ctx, input }) => {
    const orgId = ctx.user.organizationId ?? null;
    const deal = await assertDealAccess(input.dealId, ctx.user.id, orgId);
    const [recs, ledger] = await Promise.all([
      getDb().select().from(recommendations).where(and(eq(recommendations.dealId, deal.id), ownerScope(recommendations, ctx.user.id, orgId))),
      getDb().select().from(assumptions).where(and(eq(assumptions.dealId, deal.id), ownerScope(assumptions, ctx.user.id, orgId))),
    ]);
    return decisionReadiness(recs, ledger, deal.stage, input.toStage ?? DEAL_STAGES[stageOrdinal(deal.stage) + 1]);
  }),

  list: recQuery
    .input(
      z.object({
        dealId: z.number(),
        stage: z.enum(DEAL_STAGES).optional(),
        status: z.enum(RECOMMENDATION_STATUSES).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      await assertDealAccess(input.dealId, ctx.user.id, orgId);
      return getDb()
        .select()
        .from(recommendations)
        .where(
          and(
            eq(recommendations.dealId, input.dealId),
            ownerScope(recommendations, ctx.user.id, orgId),
            input.stage ? eq(recommendations.stage, input.stage) : undefined,
            input.status ? eq(recommendations.status, input.status) : undefined,
          ),
        )
        .orderBy(desc(recommendations.createdAt));
    }),

  get: recQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const { row, deal } = await assertRecAccess(input.id, ctx.user.id, orgId);
      const evidence = await resolveEvidence(row.supportingEvidence, deal.id, ctx.user.id, orgId);
      return { ...row, evidence };
    }),

  create: recQuery
    .input(
      z.object({
        dealId: z.number(),
        stage: z.enum(DEAL_STAGES),
        claim: ClaimSchema,
        rationale: RationaleSchema,
        supportingEvidence: EvidenceSchema.default([]),
        counterarguments: CounterargumentSchema.default([]),
        confidence: ConfidenceSchema.default(50),
        expiresAt: z.date().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const deal = await assertDealAccess(input.dealId, ctx.user.id, orgId);
      const [row] = await getDb()
        .insert(recommendations)
        .values({
          dealId: deal.id,
          stage: input.stage,
          claim: input.claim,
          rationale: input.rationale,
          supportingEvidence: dedupeEvidence(input.supportingEvidence),
          counterarguments: input.counterarguments,
          confidence: input.confidence,
          owner: "human",
          status: "draft",
          expiresAt: input.expiresAt ?? null,
          createdBy: ctx.user.id,
          organizationId: orgId,
        })
        .returning();
      logActivity(ctx.user, {
        type: "deal",
        action: "Recommendation drafted",
        detail: `${deal.name} — ${input.claim.slice(0, 80)}`,
        dealId: deal.id,
      });
      return row;
    }),

  // Drafts only. An accepted recommendation is superseded, never rewritten —
  // otherwise the record of what the firm concluded, and when, is editable
  // history. stage / owner / dealId are fixed at creation.
  update: recQuery
    .input(
      z.object({
        id: z.number(),
        claim: ClaimSchema.optional(),
        rationale: RationaleSchema.optional(),
        supportingEvidence: EvidenceSchema.optional(),
        counterarguments: CounterargumentSchema.optional(),
        confidence: ConfidenceSchema.optional(),
        expiresAt: z.date().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const { row, deal } = await assertRecAccess(input.id, ctx.user.id, orgId);
      if (row.status !== "draft") {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This recommendation has already been decided. Supersede it with a new one so the change stays on the record.",
        });
      }
      const [updated] = await getDb()
        .update(recommendations)
        .set({
          claim: input.claim ?? row.claim,
          rationale: input.rationale ?? row.rationale,
          supportingEvidence: input.supportingEvidence
            ? dedupeEvidence(input.supportingEvidence)
            : row.supportingEvidence,
          counterarguments: input.counterarguments ?? row.counterarguments,
          confidence: input.confidence ?? row.confidence,
          expiresAt: input.expiresAt === undefined ? row.expiresAt : input.expiresAt,
        })
        .where(eq(recommendations.id, row.id))
        .returning();
      logActivity(ctx.user, {
        type: "deal",
        action: "Recommendation edited",
        detail: `${deal.name} — ${updated.claim.slice(0, 80)}`,
        dealId: deal.id,
      });
      return updated;
    }),

  accept: recQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const { row, deal } = await assertRecAccess(input.id, ctx.user.id, orgId);
      if (row.status !== "draft") {
        throw new TRPCError({ code: "CONFLICT", message: "Only a draft recommendation can be accepted." });
      }
      // The integrity rule, enforced server-side even though the button is also
      // disabled: a fatal objection nobody answered is not a judgement call.
      if (!canAccept(row.counterarguments)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: acceptBlockedMessage(row.counterarguments) });
      }
      const evidence = await resolveEvidence(row.supportingEvidence, deal.id, ctx.user.id, orgId);
      if (evidence.length === 0 || evidence.some((e) => e.missing)) throw new TRPCError({ code: "BAD_REQUEST", message: "Attach at least one available source and resolve missing references before accepting this recommendation." });
      const [updated] = await getDb()
        .update(recommendations)
        .set({ status: "accepted", decidedBy: ctx.user.id, decidedAt: new Date() })
        .where(eq(recommendations.id, row.id))
        .returning();
      logActivity(ctx.user, {
        type: "deal",
        action: "Recommendation accepted",
        detail: `${deal.name} (${row.stage}) — ${row.claim.slice(0, 80)}`,
        dealId: deal.id,
      });
      return updated;
    }),

  reject: recQuery
    .input(z.object({ id: z.number(), note: z.string().trim().min(10).max(1000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const { row, deal } = await assertRecAccess(input.id, ctx.user.id, orgId);
      if (row.status !== "draft") {
        throw new TRPCError({ code: "CONFLICT", message: "Only a draft recommendation can be rejected." });
      }
      const [updated] = await getDb()
        .update(recommendations)
        .set({ status: "rejected", decidedBy: ctx.user.id, decidedAt: new Date() })
        .where(eq(recommendations.id, row.id))
        .returning();
      // The note is an event, not state. If a rejection reason ever needs to be
      // first-class it gets its own column, rather than overloading one here.
      logActivity(ctx.user, {
        type: "deal",
        action: "Recommendation rejected",
        detail: `${deal.name} — ${row.claim.slice(0, 60)}${input.note ? ` | ${input.note}` : ""}`,
        dealId: deal.id,
      });
      return updated;
    }),

  // Replace an accepted recommendation with a revised one. Both writes in one
  // transaction, and that matters for the stage gate: done separately, there is
  // a window where the deal has zero live recommendations and a concurrent
  // decisions.record would be refused a move it should have been allowed.
  supersede: recQuery
    .input(
      z.object({
        id: z.number(),
        claim: ClaimSchema,
        rationale: RationaleSchema,
        supportingEvidence: EvidenceSchema.default([]),
        counterarguments: CounterargumentSchema.default([]),
        confidence: ConfidenceSchema.default(50),
        expiresAt: z.date().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const { row, deal } = await assertRecAccess(input.id, ctx.user.id, orgId);
      if (row.status !== "accepted") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Only an accepted recommendation is superseded. A draft can simply be edited.",
        });
      }
      if (!canAccept(input.counterarguments)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: acceptBlockedMessage(input.counterarguments) });
      }

      const evidence = await resolveEvidence(input.supportingEvidence, deal.id, ctx.user.id, orgId);
      if (evidence.length === 0 || evidence.some((e) => e.missing)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Attach at least one available source and resolve missing references before accepting the replacement recommendation." });
      }
      const db = getDb();
      const inserted = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(recommendations)
          .values({
            dealId: row.dealId,
            // Inherited, not re-supplied: the replacement answers the same
            // question at the same point in the deal.
            stage: row.stage,
            claim: input.claim,
            rationale: input.rationale,
            supportingEvidence: dedupeEvidence(input.supportingEvidence),
            counterarguments: input.counterarguments,
            confidence: input.confidence,
            owner: "human",
            status: "accepted",
            expiresAt: input.expiresAt ?? null,
            supersedesId: row.id,
            decidedBy: ctx.user.id,
            decidedAt: new Date(),
            createdBy: ctx.user.id,
            organizationId: orgId,
          })
          .returning();
        await tx
          .update(recommendations)
          .set({ status: "superseded" })
          .where(eq(recommendations.id, row.id));
        return created;
      });

      logActivity(ctx.user, {
        type: "deal",
        action: "Recommendation superseded",
        detail: `${deal.name} (${row.stage}) — ${input.claim.slice(0, 80)}`,
        dealId: deal.id,
      });
      return inserted;
    }),

  // ── Outcome ledger (Phase 15.9) ───────────────────────────────────────────
  // What actually happened. Append-only by design: there is no updateOutcome and
  // no deleteOutcome, and their absence is the feature. A read that turns out
  // wrong is answered with another read — a later entry does not erase an
  // earlier one, it dates it, and the trajectory is what the learning layer
  // reads. A genuinely garbage row is an admin DB operation, deliberately not a
  // product affordance.

  listOutcomes: recQuery
    .input(z.object({ dealId: z.number(), recommendationId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      await assertDealAccess(input.dealId, ctx.user.id, orgId);
      // One query for the whole panel — a card never queries for itself.
      return getDb()
        .select()
        .from(recommendationOutcomes)
        .where(
          and(
            eq(recommendationOutcomes.dealId, input.dealId),
            ownerScope(recommendationOutcomes, ctx.user.id, orgId),
            input.recommendationId
              ? eq(recommendationOutcomes.recommendationId, input.recommendationId)
              : undefined,
          ),
        )
        .orderBy(asc(recommendationOutcomes.recordedAt));
    }),

  // The close anchor for this deal's post-close reads (Phase 15.11).
  //
  // Deliberately TINY — the anchor and nothing else. Recommendations.tsx already
  // holds the recommendations and their outcomes, so returning rows it has
  // would create a second source of truth for what is on screen. The schedule
  // itself is computed client-side from contracts/outcome-schedule.ts.
  //
  // Resolved here rather than in the client because milestones-router gates
  // every procedure on featureQuery("timeline"): a client-side fetch would 403
  // the dossier for anyone holding `recommendations` without `timeline`. Same
  // move listScenarioLinks makes for staleness.
  outcomeSchedule: recQuery
    .input(z.object({ dealId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertDealAccess(input.dealId, ctx.user.id, ctx.user.organizationId ?? null);
      return loadCloseAnchor(input.dealId);
    }),

  // Decision health (Phase 15.12) — a read-only fold of the gate, the fatal
  // objections, the read schedule and any matched failure pattern.
  //
  // A .query that enforces nothing. The gate is reached transitively through
  // contracts/decision-health, never imported here: outcomes-owed.wiring.test.ts
  // asserts this router does not import @contracts/recommendation-gate, because
  // decisions-router.ts is the sole enforcement point.
  decisionHealth: recQuery
    .input(z.object({ dealId: z.number() }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const deal = await assertDealAccess(input.dealId, ctx.user.id, orgId);
      return loadDecisionHealth(input.dealId, deal.stage, ctx.user.id, orgId);
    }),

  recordOutcome: recQuery
    .input(
      z.object({
        recommendationId: z.number(),
        outcomeType: z.enum(OUTCOME_TYPES),
        outcomeSummary: z
          .string()
          .trim()
          .min(10, "Say what happened, and how you know.")
          .max(2000),
        horizon: z.enum(OUTCOME_HORIZONS).optional(),
        recordedAt: z.date().optional(),
        metricLinks: EvidenceSchema.default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const { row, deal } = await assertRecAccess(input.recommendationId, ctx.user.id, orgId);
      // The shared predicate, so the button and the server cannot disagree —
      // exactly how canAccept is used above. Nobody has claimed a draft, so
      // there is nothing for it to have been right or wrong about.
      if (!canRecordOutcome(row.status)) {
        throw new TRPCError({ code: "CONFLICT", message: outcomeBlockedMessage() });
      }
      const [created] = await getDb()
        .insert(recommendationOutcomes)
        .values({
          recommendationId: row.id,
          // Server-derived, never client-supplied.
          dealId: row.dealId,
          outcomeType: input.outcomeType,
          outcomeSummary: input.outcomeSummary,
          horizon: input.horizon ?? null,
          metricLinks: dedupeEvidence(input.metricLinks),
          recordedAt: input.recordedAt ?? new Date(),
          createdBy: ctx.user.id,
          organizationId: orgId,
        })
        .returning();
      logActivity(ctx.user, {
        type: "deal",
        action: "Outcome recorded",
        detail: `${deal.name} — ${OUTCOME_TYPE_LABELS[input.outcomeType]}: ${input.outcomeSummary.slice(0, 60)}`,
        dealId: row.dealId,
      });
      return created;
    }),

  // ── Scenario links (Phase 15.9) ───────────────────────────────────────────
  // Which range a claim was drawn against. Unlike outcomes, links ARE deletable:
  // a link is metadata about a citation and a wrong one is noise, where an
  // outcome is a dated claim about reality.

  listScenarioLinks: recQuery
    .input(z.object({ dealId: z.number() }))
    .query(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      await assertDealAccess(input.dealId, ctx.user.id, orgId);
      const db = getDb();

      const [links, snapshots] = await Promise.all([
        db
          .select({
            id: recommendationScenarios.id,
            recommendationId: recommendationScenarios.recommendationId,
            scenarioAnalysisId: recommendationScenarios.scenarioAnalysisId,
            caseName: recommendationScenarios.caseName,
            relation: recommendationScenarios.relation,
            note: recommendationScenarios.note,
            createdAt: recommendationScenarios.createdAt,
            // Joined so neither surface needs a second query: the card shows the
            // snapshot, ScenarioCards shows the claim.
            claim: recommendations.claim,
            recStatus: recommendations.status,
            recStage: recommendations.stage,
            snapshotCreatedAt: scenarioAnalyses.createdAt,
            snapshotAssumptionCount: scenarioAnalyses.assumptionCount,
          })
          .from(recommendationScenarios)
          .innerJoin(recommendations, eq(recommendations.id, recommendationScenarios.recommendationId))
          .innerJoin(scenarioAnalyses, eq(scenarioAnalyses.id, recommendationScenarios.scenarioAnalysisId))
          .where(
            and(
              eq(recommendationScenarios.dealId, input.dealId),
              ownerScope(recommendationScenarios, ctx.user.id, orgId),
            ),
          )
          .orderBy(desc(recommendationScenarios.createdAt)),
        db
          .select({ id: scenarioAnalyses.id })
          .from(scenarioAnalyses)
          .where(
            and(
              eq(scenarioAnalyses.dealId, input.dealId),
              ownerScope(scenarioAnalyses, ctx.user.id, orgId),
            ),
          ),
      ]);

      // Staleness is computed HERE, not in the client, and that is what lets a
      // member holding `recommendations` but not `scenarios` see the full
      // picture without ever calling a scenarios-gated procedure.
      return links.map((l) => ({ ...l, staleness: linkStaleness(l.scenarioAnalysisId, snapshots) }));
    }),

  linkScenario: recQuery
    .input(
      z.object({
        recommendationId: z.number(),
        scenarioAnalysisId: z.number(),
        caseName: z.enum(SCENARIO_LINK_CASES).default("all"),
        relation: z.enum(SCENARIO_RELATIONS),
        note: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const { row, deal } = await assertRecAccess(input.recommendationId, ctx.user.id, orgId);
      const db = getDb();

      // assertDealAccess proves the caller may see the DEAL, not that a
      // client-supplied snapshot id belongs to it. Same defence resolveEvidence
      // documents — without it a link could cite another deal's scenario run.
      const [snapshot] = await db
        .select({ id: scenarioAnalyses.id })
        .from(scenarioAnalyses)
        .where(
          and(
            eq(scenarioAnalyses.id, input.scenarioAnalysisId),
            eq(scenarioAnalyses.dealId, row.dealId),
            ownerScope(scenarioAnalyses, ctx.user.id, orgId),
          ),
        )
        .limit(1);
      if (!snapshot) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That scenario run is not on this deal.",
        });
      }

      const [created] = await db
        .insert(recommendationScenarios)
        .values({
          recommendationId: row.id,
          scenarioAnalysisId: snapshot.id,
          dealId: row.dealId,
          caseName: input.caseName,
          relation: input.relation,
          note: input.note ?? null,
          createdBy: ctx.user.id,
          organizationId: orgId,
        })
        // A double-click is not an error; the unique index makes it a no-op.
        .onConflictDoNothing()
        .returning();
      logActivity(ctx.user, {
        type: "deal",
        action: "Scenario linked",
        detail: `${deal.name} — ${input.caseName}/${input.relation} on "${row.claim.slice(0, 50)}"`,
        dealId: row.dealId,
      });
      return created ?? null;
    }),

  unlinkScenario: recQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const db = getDb();
      const [link] = await db
        .select()
        .from(recommendationScenarios)
        .where(eq(recommendationScenarios.id, input.id))
        .limit(1);
      if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Link not found." });
      // Access proven through the parent recommendation, which proves the deal.
      const { deal } = await assertRecAccess(link.recommendationId, ctx.user.id, orgId);
      await db.delete(recommendationScenarios).where(eq(recommendationScenarios.id, link.id));
      logActivity(ctx.user, {
        type: "deal",
        action: "Scenario unlinked",
        detail: deal.name,
        dealId: link.dealId,
      });
      return { success: true };
    }),
});
