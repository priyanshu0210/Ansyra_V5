import { readAllowance } from "./lib/rate-limit";
import { env } from "./lib/env";
import { verifyDocumentResult } from "./lib/document-evidence";
// ─────────────────────────────────────────────────────────────────────────────
// Ansyra AI router — Assumption Ledger, Cultural Compatibility, Regulatory
// Radar, Synergy Reality Engine, Deal Genome search, and the context-aware
// copilot. Every mutation calls api/lib/ai.ts::callAI — never a provider
// directly — and PERSISTS its result in the same request, so a client
// remount/refresh can never lose an analysis. History is served by the
// list/get procedures below, scoped by user/org like deals and targets.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { SynergyAnalysisSchema } from "@contracts/synergy-data";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, featureQuery, aiFeatureQuery, aiMemberQuery, memberQuery } from "./middleware";
import { callAI, AI_PROVIDER, AI_MODEL, assertLiveAiPermitted } from "./lib/ai";
import { malformedAiOutput } from "./lib/ai-errors";
import { getDb } from "./queries/connection";
import { ownerScope } from "./lib/scope";
import { logActivity } from "./lib/activity";
import { assertDealAccess } from "./deals-router";
import { ASSUMPTION_CATEGORIES, coerceCategory } from "@contracts/assumption-ledger";
import { blockingAssumptions } from "@contracts/assumption-gate";
import {
  assumptionHintBlock,
  foldAssumptionFindings,
  relevantFindings,
} from "@contracts/assumption-learning";
import { loadAssumptionCells } from "./queries/assumption-learning";
import { assertDocumentAccess } from "./documents-router";
import { downloadObject } from "./lib/storage";
import { extractText } from "./lib/extract";
import { DD_CHECKLIST_ITEMS } from "@contracts/constants";
import { DEAL_STAGES } from "@contracts/stages";
import { foldPatterns, patternHintBlock, relevantPatterns } from "@contracts/failure-patterns";
import { loadPatternCells } from "./queries/failure-patterns";
import {
  confidenceBand,
  dedupeEvidence,
  type Counterargument,
  type CounterargumentWeight,
  type EvidenceKind,
  type RecommendationEvidence,
} from "@contracts/recommendations";
import {
  QUARTER_RE,
  categoryTotals,
  hasDuplicateQuarters,
  phasingSummaryLine,
  sortPeriods,
} from "@contracts/synergy";
import {
  assumptions,
  culturalScores,
  regulatoryAnalyses,
  synergyPlans,
  documentAnalyses,
  documents,
  decisions,
  icMemos,
  dealEconomics,
  scenarioAnalyses,
  recommendations,
  chatMessages,
  deals as dealsTable,
  ANALYSIS_KINDS,
  type AnalysisKind,
  type AssumptionResult,
  type IcMemoResult,
  type ScenarioResult,
  type SynergyCategory,
} from "@db/schema";

type ScopedTable =
  | typeof assumptions
  | typeof culturalScores
  | typeof regulatoryAnalyses;

// Scope filter for the AI-history tables. Delegates to the one definition of
// the ownership rule (api/lib/scope.ts) rather than restating it: this list is
// what feeds the client's assumption-gate banner, and decisions.record enforces
// the gate over the same rows. Those two reading differently is the bug this
// alias exists to make impossible.
const scoped = (table: ScopedTable, userId: string, orgId: string | null) =>
  ownerScope(table, userId, orgId);

// Optional quarterly phasing (Phase 15.6). When periods are supplied they are
// AUTHORITATIVE: the server recomputes planned/actual as their sums (see
// derivePhasedCategories) so the client can't persist totals that disagree with
// the phasing. No periods = unphased, exactly as before 15.6.
const SynergyPeriodSchema = z.object({
  quarter: z.string().regex(QUARTER_RE, "Use a YYYY-Qn quarter, e.g. 2026-Q3."),
  planned: z.number(),
  actual: z.number(),
});

const SynergyCategorySchema = z.object({
  category: z.string(),
  planned: z.number(),
  actual: z.number(),
  periods: z.array(SynergyPeriodSchema).max(40).optional(),
});

/** Reject duplicate quarters, then derive each category's totals from its periods. */
function derivePhasedCategories(categories: z.infer<typeof SynergyCategorySchema>[]): SynergyCategory[] {
  return categories.map((c) => {
    const periods = c.periods ?? [];
    if (periods.length > 0 && hasDuplicateQuarters(periods)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `"${c.category}" has the same quarter twice — merge those rows.`,
      });
    }
    const totals = categoryTotals({ ...c, periods });
    return {
      category: c.category,
      planned: totals.planned,
      actual: totals.actual,
      ...(periods.length > 0 ? { periods: sortPeriods(periods) } : {}),
    };
  });
}

// Per-feature tiers. The *AiQuery variants also apply the AI rate limit; the
// plain ones gate history reads/deletes. copilot is member-only (no feature).
const assumptionsQuery = featureQuery("assumptions");
const assumptionsAiQuery = aiFeatureQuery("assumptions");
const culturalQuery = featureQuery("cultural");
const culturalAiQuery = aiFeatureQuery("cultural");
const regulatoryQuery = featureQuery("regulatory");
const regulatoryAiQuery = aiFeatureQuery("regulatory");
const synergyQuery = featureQuery("synergy");
const synergyAiQuery = aiFeatureQuery("synergy");
const genomeAiQuery = aiFeatureQuery("genome");
const documentsQuery = featureQuery("documents");
const documentsAiQuery = aiFeatureQuery("documents");
const decisionsQuery = featureQuery("decisions");
const decisionsAiQuery = aiFeatureQuery("decisions");
const scenariosQuery = featureQuery("scenarios");
const scenariosAiQuery = aiFeatureQuery("scenarios");
const recommendationsAiQuery = aiFeatureQuery("recommendations");

export const aiRouter = createRouter({
  usageStatus: memberQuery.query(async ({ ctx }) => {
    const [personal, shared] = await Promise.all([readAllowance("ai-user-day", ctx.user.id, env.aiUserDayLimit), readAllowance("ai-platform-day", "platform", env.aiPlatformDayLimit)]);
    return { personal, shared, provider: AI_PROVIDER, model: AI_MODEL };
  }),

  // ── Assumption Ledger ──────────────────────────────────────────────────
  stressTestAssumption: assumptionsAiQuery
    .input(
      z.object({
        dealId: z.number(),
        assumption: z.string().min(4),
        reviewer: z.string().max(255).optional(),
        context: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const deal = await assertDealAccess(input.dealId, ctx.user.id, orgId);

      // No portfolio context is passed on this route, so the prompt must not
      // tell the model it has "10 years of comparable transactions" in hand —
      // that instruction is what makes it fabricate confident `comparables`.
      // When Phase 16 wires retrieval in (copy dealGenomeSearch), restore the
      // stronger framing along with the actual corpus.
      const system = `You are Ansyra's Assumption Ledger. You stress-test M&A assumptions using the supplied assumption and context. You are precise, sceptical, and unafraid to challenge confirmation bias. You have no retrieved precedents. Return no comparable references; distinguish supplied evidence from hypotheses and name missing information. You output STRICT JSON only. No preamble. No markdown fences.`;
      const prompt = `Deal: ${deal.name}
Target: ${deal.targetCompany}
Assumption: "${input.assumption}"
${input.context ? `Context: ${input.context}\n` : ""}
Return JSON in this exact shape:
{
  "optimismScore": <0-100 integer, higher = more optimistic/risky>,
  "confidence": "High" | "Medium" | "Low",
  "reasoning": "<2-3 sentences distinguishing supplied context, inference, and missing evidence>",
  "recommendation": "<one concrete action the team should take>",
  "comparables": ["<leave this array empty: no precedents retrieved>"],
  "category": ${JSON.stringify(ASSUMPTION_CATEGORIES.join(" | "))}
}
Pick the single category this assumption is mostly about. Use "other" rather
than forcing a poor fit — a mis-filed assumption corrupts cross-deal learning,
and a human can correct it afterwards.`;
      const { data, text } = await callAI<AssumptionResult>(prompt, {
        system,
        json: true,
        maxTokens: 800,
      });
      if (!data) throw malformedAiOutput();
      void text;

      const db = getDb();
      const [row] = await db
        .insert(assumptions)
        .values({
          dealId: deal.id,
          assumption: input.assumption,
          reviewer: input.reviewer || null,
          // Coerced through the closed vocabulary rather than trusted: the model
          // returns a string, and an unrecognised one must land on "other" (and
          // be correctable in the ledger) instead of writing junk to the axis
          // cross-deal learning folds on.
          category: coerceCategory((data as { category?: unknown }).category),
          result: z.object({ optimismScore: z.number().int().min(0).max(100), confidence: z.enum(["High", "Medium", "Low"]), reasoning: z.string().min(1), recommendation: z.string().min(1), comparables: z.array(z.string()).optional().transform(() => []) }).parse(data),
          createdBy: ctx.user.id,
          organizationId: orgId,
        })
        .returning();

      logActivity(ctx.user, {
        type: "ai",
        action: "Assumption stress-tested",
        detail: `${deal.name} · optimism ${data.optimismScore}/100`,
        dealId: deal.id,
      });
      return row;
    }),

  listAssumptions: assumptionsQuery
    .input(z.object({ dealId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const scope = scoped(assumptions, ctx.user.id, ctx.user.organizationId ?? null);
      const where = input?.dealId
        ? and(scope, eq(assumptions.dealId, input.dealId))!
        : scope;
      // Newest 500: each row carries its full stress-test jsonb, and the
      // unfiltered read was the one unbounded payload on the busiest page.
      return db.select().from(assumptions).where(where).orderBy(desc(assumptions.createdAt)).limit(500);
    }),

  /**
   * How many assumptions are blocking each deal — folded HERE, not on the
   * client (Phase D3).
   *
   * `NeedsYou` on the dashboard home needs one integer per deal. It was getting
   * it by calling `listAssumptions` with no dealId, which ships EVERY row the
   * caller can see, each carrying its full `result` jsonb — the whole
   * stress-test payload of challenges and evidence — so the busiest route in
   * the app downloaded an unbounded blob to compute a count.
   *
   * Same reasoning as `patterns.outcomesOwed`, which is the other half of that
   * panel and has always folded server-side.
   *
   * THE PREDICATE IS STILL THE CONTRACT'S. Only the score is read out of the
   * jsonb, so the row stays small, but the decision about what blocks is made
   * by `blockingAssumptions` — the same function `decisions.record` gates on.
   * Restating "score > 80 and no note" as a WHERE clause here is exactly the
   * drift contracts/assumption-gate.ts exists to prevent.
   */
  blockingByDeal: assumptionsQuery.query(async ({ ctx }) => {
    const db = getDb();
    const scope = scoped(assumptions, ctx.user.id, ctx.user.organizationId ?? null);
    const rows = await db
      .select({
        dealId: assumptions.dealId,
        dealName: dealsTable.name,
        assumption: assumptions.assumption,
        reviewerNote: assumptions.reviewerNote,
        // `->>` (text), not `->`(jsonb) with a `::numeric` cast. The cast
        // version reads fine and can throw at runtime: casting a jsonb STRING
        // to numeric is an error in Postgres, so one row written `"85"` rather
        // than `85` would fail the whole query. Extracting text and converting
        // in JS cannot fail on the database side, and `mapWith` is avoided for
        // the same class of reason — it maps SQL NULL through `Number`, which
        // yields 0, and a missing score is not a score of zero.
        optimismScore: sql<string | null>`${assumptions.result} ->> 'optimismScore'`,
        reviewHistory: sql<import("@contracts/assumption-gate").AssumptionReview[] | null>`${assumptions.result} -> 'reviewHistory'`,
      })
      .from(assumptions)
      .innerJoin(dealsTable, eq(dealsTable.id, assumptions.dealId))
      .where(scope);

    const byDeal = new Map<number, { dealId: number; dealName: string; count: number }>();
    for (const r of rows) {
      // A row with no score, or an unparseable one, carries `result: null` —
      // which is what the contract already treats as "not a blocker", because
      // the gate exists to force an answer to a challenge that was made, not to
      // punish a row the AI never scored.
      const score = r.optimismScore === null ? NaN : Number(r.optimismScore);
      const blocks = blockingAssumptions([
        {
          assumption: r.assumption,
          reviewerNote: r.reviewerNote,
          result: Number.isFinite(score) ? { optimismScore: score, reviewHistory: r.reviewHistory ?? [] } : null,
        },
      ]);
      if (blocks.length === 0) continue;
      const prev = byDeal.get(r.dealId);
      if (prev) prev.count += 1;
      else byDeal.set(r.dealId, { dealId: r.dealId, dealName: r.dealName, count: 1 });
    }
    return [...byDeal.values()].sort((a, b) => b.count - a.count);
  }),

  addReviewerNote: assumptionsQuery
    .input(z.object({ id: z.number(), reviewerNote: z.string().trim().min(10).max(4000),
      outcome: z.enum(["answered", "resolved", "risk_accepted"]), evidence: z.string().trim().min(3).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const scope = scoped(assumptions, ctx.user.id, ctx.user.organizationId ?? null);
      const row = await db.transaction(async (tx) => {
        const [current] = await tx.select().from(assumptions)
          .where(and(eq(assumptions.id, input.id), scope)).for("update");
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Assumption not found." });
        if (!current.result) throw new TRPCError({ code: "BAD_REQUEST", message: "This assumption has no assessment to review." });
        const review = { outcome: input.outcome, reason: input.reviewerNote, evidence: input.evidence,
          reviewedBy: ctx.user.id, reviewedAt: new Date().toISOString() };
        const [updated] = await tx.update(assumptions).set({ reviewerNote: input.reviewerNote,
          result: { ...current.result, reviewHistory: [...(current.result.reviewHistory ?? []), review] },
          updatedAt: new Date() }).where(and(eq(assumptions.id, input.id), scope)).returning();
        return updated;
      });
      logActivity(ctx.user, { type: "deal", action: "Assumption reviewed", detail: input.outcome.replaceAll("_", " "), dealId: row.dealId });
      return row;
    }),

  deleteAssumption: assumptionsQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const scope = scoped(assumptions, ctx.user.id, ctx.user.organizationId ?? null);
      await db.delete(assumptions).where(and(eq(assumptions.id, input.id), scope));
      return { success: true };
    }),

  // ── Cultural Compatibility ─────────────────────────────────────────────
  culturalCompatibility: culturalAiQuery
    .input(
      z.object({
        acquirer: z.string().min(1),
        target: z.string().min(1),
        sector: z.string().optional(),
        dealId: z.number().nullish(),
        evidenceContext: z.string().max(12000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      if (input.dealId) await assertDealAccess(input.dealId, ctx.user.id, orgId);

      // This route has no web access and no documents: it gets three strings.
      // Telling the model it "reads Glassdoor patterns" invites it to narrate
      // sources it never opened, which is exactly what the public copy used to
      // promise. Phase 16 can switch this to callAIResearch and restore it.
      const system = `Prepare people and integration diligence questions using only the supplied context. Company names and general knowledge are not verified evidence. Do not score cultural fit, estimate legal probabilities or timelines, invent precedents, or assert filing obligations. Clearly distinguish questions from findings. Return strict JSON.`;
      const prompt = `Parties: ${input.acquirer} and ${input.target}. Sector: ${input.sector ?? "unspecified"}.
${ "geography" in input ? `Geography: ${input.geography}` : "" }
Supplied context: ${input.evidenceContext || "None. No source documents or current authority guidance supplied."}
Return {"summary":"brief scope statement", "questions":["3-8 questions for human review"], "missingEvidence":["facts and sources still needed"]}. Do not invent sources.`;
      const { data, text } = await callAI<Record<string, unknown>>(prompt, {
        system,
        json: true,
        maxTokens: 900,
      });
      if (!data) throw malformedAiOutput();
      void text;

      const db = getDb();
      const [row] = await db
        .insert(culturalScores)
        .values({
          acquirer: input.acquirer,
          target: input.target,
          sector: input.sector || null,
          dealId: input.dealId ?? null,
          result: { ...z.object({ summary: z.string().min(1), questions: z.array(z.string().min(1)).min(1).max(12), missingEvidence: z.array(z.string()).max(20) }).parse(data), reviewKind: "questions", suppliedContext: input.evidenceContext ?? "", acquirer: input.acquirer },
          createdBy: ctx.user.id,
          organizationId: orgId,
        })
        .returning();

      logActivity(ctx.user, {
        type: "ai",
        action: "People review prepared",
        detail: `${input.acquirer} × ${input.target} — questions for review`,
        dealId: input.dealId ?? undefined,
      });
      return row;
    }),

  listCulturalScores: culturalQuery.input(z.object({ dealId: z.number() }).optional()).query(async ({ ctx, input }) => {
    if (input?.dealId !== undefined) await assertDealAccess(input.dealId, ctx.user.id, ctx.user.organizationId ?? null);
    const db = getDb();
    return db
      .select()
      .from(culturalScores)
      .where(and(scoped(culturalScores, ctx.user.id, ctx.user.organizationId ?? null), input?.dealId !== undefined ? eq(culturalScores.dealId, input.dealId) : undefined))
      .orderBy(desc(culturalScores.createdAt))
      .limit(500);
  }),

  deleteCulturalScore: culturalQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const scope = scoped(culturalScores, ctx.user.id, ctx.user.organizationId ?? null);
      await db.delete(culturalScores).where(and(eq(culturalScores.id, input.id), scope));
      return { success: true };
    }),

  // ── Regulatory Radar ───────────────────────────────────────────────────
  regulatoryRadar: regulatoryAiQuery
    .input(
      z.object({
        acquirer: z.string().min(1),
        target: z.string().min(1),
        sector: z.string().min(1),
        geography: z.string().min(1),
        combinedMarketShare: z.string().optional(),
        dealId: z.number().nullish(),
        evidenceContext: z.string().max(12000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      if (input.dealId) await assertDealAccess(input.dealId, ctx.user.id, orgId);

      const system = `Prepare regulatory diligence questions using only the supplied context. Company names and general knowledge are not verified evidence. Do not score cultural fit, estimate legal probabilities or timelines, invent precedents, or assert filing obligations. Clearly distinguish questions from findings. Return strict JSON.`;
      const prompt = `Parties: ${input.acquirer} and ${input.target}. Sector: ${input.sector ?? "unspecified"}.
${ "geography" in input ? `Geography: ${input.geography}` : "" }
User-supplied combined market share (unverified, market definition still required): ${input.combinedMarketShare || "Not supplied"}
Supplied context: ${input.evidenceContext || "None. No source documents or current authority guidance supplied."}
Return {"summary":"brief scope statement", "questions":["3-8 questions for human review"], "missingEvidence":["facts and sources still needed"]}. Do not invent sources.`;
      const { data, text } = await callAI<Record<string, unknown>>(prompt, {
        system,
        json: true,
        maxTokens: 1000,
      });
      if (!data) throw malformedAiOutput();
      void text;

      const db = getDb();
      const [row] = await db
        .insert(regulatoryAnalyses)
        .values({
          target: input.target,
          sector: input.sector,
          geography: input.geography,
          combinedMarketShare: input.combinedMarketShare || null,
          dealId: input.dealId ?? null,
          result: { ...z.object({ summary: z.string().min(1), questions: z.array(z.string().min(1)).min(1).max(12), missingEvidence: z.array(z.string()).max(20) }).parse(data), reviewKind: "questions", suppliedContext: input.evidenceContext ?? "", acquirer: input.acquirer },
          createdBy: ctx.user.id,
          organizationId: orgId,
        })
        .returning();

      logActivity(ctx.user, {
        type: "ai",
        action: "Regulatory analysis run",
        detail: `${input.target} · ${input.geography} — questions for review`,
        dealId: input.dealId ?? undefined,
      });
      return row;
    }),

  listRegulatoryAnalyses: regulatoryQuery.input(z.object({ dealId: z.number() }).optional()).query(async ({ ctx, input }) => {
    if (input?.dealId !== undefined) await assertDealAccess(input.dealId, ctx.user.id, ctx.user.organizationId ?? null);
    const db = getDb();
    return db
      .select()
      .from(regulatoryAnalyses)
      .where(and(scoped(regulatoryAnalyses, ctx.user.id, ctx.user.organizationId ?? null), input?.dealId !== undefined ? eq(regulatoryAnalyses.dealId, input.dealId) : undefined))
      .orderBy(desc(regulatoryAnalyses.createdAt))
      .limit(500);
  }),

  deleteRegulatoryAnalysis: regulatoryQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const scope = scoped(regulatoryAnalyses, ctx.user.id, ctx.user.organizationId ?? null);
      await db.delete(regulatoryAnalyses).where(and(eq(regulatoryAnalyses.id, input.id), scope));
      return { success: true };
    }),

  // ── Synergy Reality Engine ─────────────────────────────────────────────
  // One plan per deal: categories (planned/actual) + the latest AI analysis.
  getSynergyPlan: synergyQuery
    .input(z.object({ dealId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertDealAccess(input.dealId, ctx.user.id, ctx.user.organizationId ?? null);
      const db = getDb();
      const [row] = await db
        .select()
        .from(synergyPlans)
        .where(eq(synergyPlans.dealId, input.dealId))
        .limit(1);
      return row ?? null;
    }),

  saveSynergyPlan: synergyQuery
    .input(z.object({ dealId: z.number(), categories: z.array(SynergyCategorySchema) }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      await assertDealAccess(input.dealId, ctx.user.id, orgId);
      const categories = derivePhasedCategories(input.categories);
      const db = getDb();
      const [row] = await db
        .insert(synergyPlans)
        .values({
          dealId: input.dealId,
          categories,
          createdBy: ctx.user.id,
          organizationId: orgId,
        })
        .onConflictDoUpdate({
          target: synergyPlans.dealId,
          set: { categories, analysis: null, updatedAt: new Date() },
        })
        .returning();
      return row;
    }),

  synergyAnalysis: synergyAiQuery
    .input(z.object({ dealId: z.number(), categories: z.array(SynergyCategorySchema) }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const deal = await assertDealAccess(input.dealId, ctx.user.id, orgId);

      const categories = derivePhasedCategories(input.categories);
      const anyPhased = categories.some((c) => (c.periods?.length ?? 0) > 0);

      const system = `You are Ansyra's Synergy Reality Engine. You explain planned-vs-actual synergy variance in plain language and recommend a corrective action for each. Every figure you are given is already computed — NEVER recompute or re-sum totals, and never invent a quarter that isn't listed. When quarterly detail is present, say WHEN a category slipped, not just whether. Output STRICT JSON only.`;
      const prompt = `Deal: ${deal.name}
Synergy categories (all in USD millions; figures are server-computed${anyPhased ? "; quarterly detail and the weakest quarter are given where the category is phased" : ""}):
${categories.map((c) => `- ${phasingSummaryLine(c)}`).join("\n")}

Return JSON in this exact shape:
{
  "analyses": [
    {
      "category": "<matches input>",
      "variancePct": <signed integer, actual vs planned>,
      "verdict": "On Track" | "At Risk" | "Behind" | "Ahead",
      "explanation": "<2-3 sentences why>",
      "action": "<one concrete corrective action>"
    }
  ],
  "portfolioSummary": "<1-2 sentence overall read>"
}`;
      const { data, text } = await callAI<Record<string, unknown>>(prompt, {
        system,
        json: true,
        maxTokens: 1200,
      });
      if (!data) throw malformedAiOutput();
      void text;
      const validated = SynergyAnalysisSchema.safeParse(data);
      if (!validated.success) throw malformedAiOutput();

      const db = getDb();
      const [row] = await db
        .insert(synergyPlans)
        .values({
          dealId: deal.id,
          categories,
          analysis: validated.data,
          createdBy: ctx.user.id,
          organizationId: orgId,
        })
        .onConflictDoUpdate({
          target: synergyPlans.dealId,
          set: {
            categories,
            analysis: validated.data,
            updatedAt: new Date(),
          },
        })
        .returning();

      logActivity(ctx.user, {
        type: "ai",
        action: "Synergy variance analysed",
        detail: `${deal.name} · ${input.categories.length} categories`,
        dealId: deal.id,
      });
      return row;
    }),

  // ── Deal Genome search ─────────────────────────────────────────────────
  // The corpus is assembled SERVER-SIDE from the caller's scoped deals plus
  // their persisted assumption history — the client only sends the question.
  // pgvector RAG can replace the prompt-stuffing here without changing the
  // shape of this route.
  dealGenomeSearch: genomeAiQuery
    .input(z.object({ query: z.string().min(2) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const orgId = ctx.user.organizationId ?? null;
      const dealScope = orgId
        ? or(eq(dealsTable.createdBy, ctx.user.id), eq(dealsTable.organizationId, orgId))!
        : eq(dealsTable.createdBy, ctx.user.id);
      const dealRows = await db.select().from(dealsTable).where(dealScope).limit(40);
      const assumptionRows = await db
        .select()
        .from(assumptions)
        .where(scoped(assumptions, ctx.user.id, orgId))
        .orderBy(desc(assumptions.createdAt))
        .limit(80);
      // Economics (Phase 15.2/15.4) so the Genome can answer pricing questions
      // ("what multiples have we paid?") with real figures rather than guesses.
      const economicsRows = dealRows.length
        ? await db
            .select()
            .from(dealEconomics)
            .where(inArray(dealEconomics.dealId, dealRows.map((d) => d.id)))
        : [];
      const econByDeal = new Map(economicsRows.map((e) => [e.dealId, e]));

      const byDeal = new Map<number, typeof assumptionRows>();
      for (const a of assumptionRows) {
        const list = byDeal.get(a.dealId) ?? [];
        list.push(a);
        byDeal.set(a.dealId, list);
      }

      const system = `You are Ansyra's Deal Genome. You answer natural-language questions about a portfolio of M&A deals by reasoning over the supplied deal records and their stress-tested assumptions. This is a bounded extract of at most 40 deals, up to three selected assumptions per deal, and saved economics, not a search of the full dossier. Documents, IC memos and decision narratives are not included. If something is absent, say it is not in the supplied extract and direct the user to the deal dossier; never claim it is absent from the complete record. When results are found, cite them by name and use only the supplied numeric deal IDs. Output STRICT JSON only.`;
      const corpusBlock = dealRows
        .map((d) => {
          const as = byDeal.get(d.id) ?? [];
          const assumptionNotes = as
            .slice(0, 3)
            .map((a) => `"${a.assumption}" (optimism ${a.result?.optimismScore ?? "?"}/100)`)
            .join("; ");
          const e = econByDeal.get(d.id);
          const econNote = e
            ? ` | economics: EV ${e.enterpriseValue ?? "?"}M ${e.currency}${e.evEbitda ? `, ${e.evEbitda}x EBITDA` : ""}${e.evRevenue ? `, ${e.evRevenue}x revenue` : ""}${e.realized?.realizedMoic ? `, realized ${e.realized.realizedMoic}x MOIC` : ""}`
            : "";
          return `- id=${d.id} | ${d.name} | target=${d.targetCompany} | stage=${d.stage} | industry=${d.industry ?? "?"} | value=${d.value ?? "?"} | status=${d.status}${econNote}${assumptionNotes ? ` | assumptions: ${assumptionNotes}` : ""}`;
        })
        .join("\n");
      const prompt = `Query: "${input.query}"

Portfolio:
${corpusBlock || "(no deals in portfolio)"}

Return JSON in this exact shape:
{
  "answer": "<synthesised natural-language answer, 2-4 sentences>",
  "matches": [
    { "id": <original id>, "name": "<deal name>", "reason": "<why it matches>" }
  ]
}`;
      const { data, text } = await callAI<Record<string, unknown>>(prompt, {
        system,
        json: true,
        maxTokens: 1200,
      });
      if (!data) throw malformedAiOutput();
      void text;
      return data;
    }),

  // ── Context-aware copilot — different system prompt per dashboard page ──
  copilot: aiMemberQuery
    .input(
      z.object({
        message: z.string().min(1),
        surface: z
          .enum([
            "pipeline",
            "genome",
            "assumptions",
            "cultural",
            "regulatory",
            "synergy",
            "general",
          ])
          .default("general"),
        context: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const systems: Record<string, string> = {
        pipeline:
          "You are Ansyra's Deal Pipeline copilot. Concise, senior M&A advisor voice. Reference deals by name when the user asks.",
        genome:
          "You are Ansyra's Deal Genome copilot. You answer questions about historical deals — thesis, assumptions, outcomes — using the context provided.",
        assumptions:
          "You are Ansyra's Assumption Ledger copilot. You challenge assumptions using the details the user supplies.",
        cultural:
          "You are Ansyra's Cultural Compatibility copilot. Focus on leadership fit, retention risk, and integration friction.",
        regulatory:
          "You are Ansyra's Regulatory Radar copilot. Antitrust, competition authorities, structural remedies.",
        synergy:
          "You are Ansyra's Synergy Reality Engine copilot. Post-close performance, run-rate tracking, corrective action.",
        general:
          "You are Ansyra, an M&A intelligence copilot. Precise, senior-advisor voice. No filler.",
      };
      const copilotSystem = `${systems[input.surface] ?? systems.general} You receive only the user message and supplied recent chat context, not the dashboard database, documents, or live web results. Never claim to have read, searched, updated, or verified those sources. Ask for relevant details or direct the user to the dedicated tool. Distinguish general guidance and hypotheses from supplied facts; do not invent citations, current legal requirements, or approval probabilities. You cannot approve or execute deal decisions.`;
      const prompt = input.context
        ? `Context:\n${input.context}\n\nQuestion: ${input.message}`
        : input.message;
      const { text } = await callAI<unknown>(prompt, {
        system: copilotSystem,
        maxTokens: 900,
        temperature: 0.5,
      });
      // Persist the exchange (Phase 11.6) — sessionId is the surface, so each
      // tab keeps its own thread. Same-request rule: saved before returning.
      await getDb().insert(chatMessages).values([
        { userId: ctx.user.id, role: "user", content: input.message, sessionId: input.surface },
        { userId: ctx.user.id, role: "assistant", content: text, sessionId: input.surface },
      ]);
      return { response: text };
    }),

  // Last 50 copilot messages for this user+surface, oldest first.
  copilotHistory: memberQuery
    .input(z.object({ surface: z.string().max(40).default("general") }))
    .query(async ({ ctx, input }) => {
      // Order by id, not createdAt — the user+assistant pair is inserted in one
      // statement and shares a timestamp, which made createdAt ordering flip.
      const rows = await getDb()
        .select()
        .from(chatMessages)
        .where(and(eq(chatMessages.userId, ctx.user.id), eq(chatMessages.sessionId, input.surface)))
        .orderBy(desc(chatMessages.id))
        .limit(50);
      return rows.reverse();
    }),

  clearCopilot: memberQuery
    .input(z.object({ surface: z.string().max(40).default("general") }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .delete(chatMessages)
        .where(and(eq(chatMessages.userId, ctx.user.id), eq(chatMessages.sessionId, input.surface)));
      return { success: true };
    }),

  // ── Document Intelligence (Phase 10) ─────────────────────────────────────
  // Extracts the document's text server-side and runs one of four strict-JSON
  // analyses. Result persists to document_analyses in the same request.
  analyzeDocument: documentsAiQuery
    .input(z.object({ documentId: z.number(), kind: z.enum(ANALYSIS_KINDS) }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const doc = await assertDocumentAccess(input.documentId, ctx.user.id, orgId);

      // The FULL document text leaves the tenant on this route. The
      // data-processing acknowledgement that gates every live call in
      // production lives in api/lib/ai.ts::resolveProvider, so it is checked
      // here before the (expensive) download happens rather than after.
      if (AI_PROVIDER !== "mock") assertLiveAiPermitted();

      const buffer = await downloadObject("deal-documents", doc.path, 20 * 1024 * 1024);
      const extracted = await extractText(buffer, doc.mime);
      const { text: docText, truncated } = extracted;

      const system = `You are Ansyra's Document Intelligence (${input.kind}), an M&A diligence analyst reviewing a deal document. Ground every statement in the supplied text — never invent facts, figures, or clauses. Your output is an analytical aid, not legal advice. Output STRICT JSON only. No preamble. No markdown fences.`;

      const shapes: Record<AnalysisKind, string> = {
        summary: `{
  "headline": "<one sentence>",
  "keyPoints": ["<3-6 bullets>"],
  "summary": "<1-page prose, 4-8 sentences>"
}`,
        red_flags: `{
  "flags": [
    {
      "clause": "<short label>",
      "quote": "<VERBATIM excerpt copied character-for-character from the document, max 300 chars>",
      "severity": "High" | "Medium" | "Low",
      "concern": "<1-2 sentences why this is a concern>"
    }
  ]
}
RULE: every "quote" MUST be copied verbatim from the document text. If no exact quote supports a flag, omit that flag entirely.`,
        key_terms: `{
  "parties": ["<name — role>"],
  "effectiveDate": "<date or null>",
  "consideration": "<amount/structure or null>",
  "conditions": ["<closing conditions>"],
  "indemnities": "<summary or null>",
  "changeOfControl": "<summary or null>",
  "nonCompete": "<summary or null>"
}
RULE: any field genuinely absent from the document = null. Never fabricate.`,
        dd_checklist: `{
  "items": [
    { "item": "<exactly one of the checklist entries below, verbatim>", "status": "present" | "missing" | "unclear", "note": "<1 sentence>" }
  ]
}
Checklist (return one row PER entry, in this exact order, item text verbatim):
${DD_CHECKLIST_ITEMS.map((i) => `- ${i}`).join("\n")}`,
      };

      const prompt = `Document: "${doc.name}"${truncated ? " (long document — text truncated at 150k characters; note this in your output where relevant)" : ""}

--- DOCUMENT TEXT START ---
${docText}
--- DOCUMENT TEXT END ---

Analyze the document text above. Return JSON in this exact shape:
${shapes[input.kind]}`;

      const { data, text } = await callAI<Record<string, unknown>>(prompt, {
        system,
        json: true,
        maxTokens: 4000,
        temperature: 0.3,
      });
      if (!data) throw malformedAiOutput();
      void text;

      const db = getDb();
      const [row] = await db
        .insert(documentAnalyses)
        .values({
          documentId: doc.id,
          kind: input.kind,
          result: verifyDocumentResult(input.kind, data, extracted, buffer, doc.id),
          model: `${AI_PROVIDER}/${AI_MODEL}`,
          createdBy: ctx.user.id,
          organizationId: orgId,
        })
        .returning();

      logActivity(ctx.user, {
        type: "ai",
        action: "Document analyzed",
        detail: `${doc.name} · ${input.kind.replace("_", " ")}`,
        dealId: doc.dealId,
      });
      return row;
    }),

  listAnalyses: documentsQuery
    .input(z.object({ documentId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertDocumentAccess(input.documentId, ctx.user.id, ctx.user.organizationId ?? null);
      return getDb()
        .select()
        .from(documentAnalyses)
        .where(eq(documentAnalyses.documentId, input.documentId))
        .orderBy(desc(documentAnalyses.createdAt));
    }),

  // ── Decision Log: AI-assembled Investment Committee memo (Phase 15.1) ──────
  // Composes deal + assumptions + cultural + regulatory + synergy + document
  // key-terms + decision history into a committee-ready memo. Persists the memo
  // in the same request (absolute rule 4). Absent sources become openItems —
  // the prompt forbids fabricating what isn't on file.
  generateIcMemo: decisionsAiQuery
    .input(z.object({ dealId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const deal = await assertDealAccess(input.dealId, ctx.user.id, orgId);
      const db = getDb();

      const [assumptionRows, culturalRows, regulatoryRows, synergyRow, decisionRows, docRows, economicsRow, recommendationRows] =
        await Promise.all([
          db.select().from(assumptions).where(and(eq(assumptions.dealId, deal.id), scoped(assumptions, ctx.user.id, orgId))).orderBy(desc(assumptions.createdAt)).limit(10),
          db.select().from(culturalScores).where(eq(culturalScores.dealId, deal.id)).orderBy(desc(culturalScores.createdAt)).limit(2),
          db.select().from(regulatoryAnalyses).where(eq(regulatoryAnalyses.dealId, deal.id)).orderBy(desc(regulatoryAnalyses.createdAt)).limit(2),
          db.select().from(synergyPlans).where(eq(synergyPlans.dealId, deal.id)).limit(1),
          db.select().from(decisions).where(eq(decisions.dealId, deal.id)).orderBy(desc(decisions.createdAt)).limit(10),
          db.select({ id: documents.id }).from(documents).where(eq(documents.dealId, deal.id)),
          db.select().from(dealEconomics).where(eq(dealEconomics.dealId, deal.id)).limit(1),
          // Phase 15.8 — the deal's standing conclusions. Scoped like the panel
          // that shows them, so the memo cites what the reader can actually see.
          db.select().from(recommendations)
            .where(and(eq(recommendations.dealId, deal.id), eq(recommendations.status, "accepted"), ownerScope(recommendations, ctx.user.id, orgId)))
            .orderBy(desc(recommendations.createdAt)).limit(8),
        ]);

      let keyTermsRows: { result: Record<string, unknown>; createdAt: Date }[] = [];
      if (docRows.length) {
        keyTermsRows = await db
          .select({ result: documentAnalyses.result, createdAt: documentAnalyses.createdAt })
          .from(documentAnalyses)
          .where(and(inArray(documentAnalyses.documentId, docRows.map((r) => r.id)), eq(documentAnalyses.kind, "key_terms")))
          .orderBy(desc(documentAnalyses.createdAt))
          .limit(3);
      }

      const day = (dt: Date) => new Date(dt).toISOString().slice(0, 10);
      const block = (label: string, items: string[]) => `${label}:\n${items.length ? items.join("\n") : "  (none on file)"}`;
      const sections = [
        `Deal: ${deal.name} | target=${deal.targetCompany} | stage=${deal.stage} | status=${deal.status} | value=${deal.value ?? "?"} | industry=${deal.industry ?? "?"}`,
        block("Assumptions (stress-tested)", assumptionRows.map((a) => `  - [${day(a.createdAt)}] "${a.assumption}" → optimism ${a.result?.optimismScore ?? "?"}/100, ${a.result?.confidence ?? "?"} confidence. ${a.result?.recommendation ?? ""}`)),
        block("Cultural compatibility", culturalRows.map((c) => `  - [${day(c.createdAt)}] ${c.acquirer} × ${c.target}: ${JSON.stringify(c.result).slice(0, 400)}`)),
        block("Regulatory analysis", regulatoryRows.map((r) => `  - [${day(r.createdAt)}] ${r.target} (${r.geography}): ${JSON.stringify(r.result).slice(0, 400)}`)),
        block("Synergy plan", synergyRow.length ? [`  - [${day(synergyRow[0].createdAt)}] ${JSON.stringify(synergyRow[0].categories).slice(0, 400)}${synergyRow[0].analysis ? ` | analysis: ${JSON.stringify(synergyRow[0].analysis).slice(0, 300)}` : ""}`] : []),
        block("Deal economics (server-computed — use these figures verbatim, never recompute)", economicsRow.length
          ? [`  - EV ${economicsRow[0].enterpriseValue ?? "?"}M ${economicsRow[0].currency} | equity ${economicsRow[0].equityValue ?? "?"}M | net debt ${economicsRow[0].netDebt ?? "?"}M | EBITDA ${economicsRow[0].targetEbitda ?? "?"}M | revenue ${economicsRow[0].targetRevenue ?? "?"}M | EV/EBITDA ${economicsRow[0].evEbitda ?? "n.m."}x | EV/Revenue ${economicsRow[0].evRevenue ?? "n.m."}x${economicsRow[0].moicEstimate ? ` | est. MOIC ${economicsRow[0].moicEstimate}x` : ""}${economicsRow[0].irrEstimate ? ` | est. IRR ${(Number(economicsRow[0].irrEstimate) * 100).toFixed(1)}%` : ""}`]
          : []),
        block("Document key terms", keyTermsRows.map((k) => `  - [${day(k.createdAt)}] ${JSON.stringify(k.result).slice(0, 400)}`)),
        block("Decision history", decisionRows.map((dec) => `  - [${day(dec.createdAt)}] ${dec.decisionType}${dec.toStage ? ` (${dec.fromStage}→${dec.toStage})` : ""}: ${dec.rationale}`)),
        block("Accepted recommendations (the firm's standing conclusions — cite these, do not re-derive them)", recommendationRows.map((r) =>
          `  - [${day(r.createdAt)}] (${r.stage}, ${confidenceBand(r.confidence)} confidence ${r.confidence}/100, ${r.owner}) "${r.claim}" — ${r.rationale}` +
          (r.counterarguments.length ? ` | against: ${r.counterarguments.map((c) => `${c.point} (${c.weight}${c.response?.trim() ? ", answered" : ", UNANSWERED"})`).join("; ")}` : ""))),
      ];

      const system = `You are Ansyra's Investment Committee memo generator. Compose a committee-ready memo STRICTLY from the deal data supplied — never invent facts. If a source is absent (e.g. no cultural score), do NOT fabricate one; name what is missing in "openItems". Where an accepted recommendation already answers a question, cite it rather than re-deriving it, and let its unanswered counterarguments inform "risks" and "openItems". Senior M&A advisor voice: precise, sceptical, no filler. Output STRICT JSON only, no markdown fences.`;
      const prompt = `${sections.join("\n\n")}

Compose the IC memo. Return JSON in this exact shape:
{
  "thesis": "<the investment thesis in 1-2 sentences>",
  "dealSummary": "<2-3 sentence situation summary>",
  "valuation": { "summary": "<what is known about price/value; say 'not yet provided' if absent>", "keyMultiples": "<multiples if derivable, else 'n/a'>" },
  "risks": [ { "source": "assumptions|cultural|regulatory|synergy|documents|other", "risk": "<specific risk>", "severity": "high|medium|low" } ],
  "openItems": ["<missing analyses or unanswered questions the IC should require>"],
  "decisionHistory": "<1-2 sentence narrative of decisions so far, or 'no decisions recorded yet'>",
  "recommendation": { "verdict": "proceed|proceed_with_conditions|hold|decline", "conditions": ["<condition>"], "reasoning": "<why>" }
}`;

      let result = await callAI<IcMemoResult>(prompt, { system, json: true, maxTokens: 2500 });
      if (!result.data) {
        // One retry — heavy structured memos occasionally trip JSON parsing.
        result = await callAI<IcMemoResult>(prompt, { system, json: true, maxTokens: 2500 });
      }
      if (!result.data) throw malformedAiOutput();

      const [row] = await db
        .insert(icMemos)
        .values({
          dealId: deal.id,
          result: result.data,
          // Server-written provenance, not model output — which is why it is its
          // own column and not a key inside `result`.
          recommendationIds: recommendationRows.map((r) => r.id),
          model: `${AI_PROVIDER}:${AI_MODEL}`,
          createdBy: ctx.user.id,
          organizationId: orgId,
        })
        .returning();
      logActivity(ctx.user, {
        type: "ai",
        action: "IC memo generated",
        detail: `${deal.name} — ${result.data.recommendation?.verdict ?? "memo"}`,
        dealId: deal.id,
      });
      return row;
    }),

  // ── Scenario analysis (Phase 15.6) ────────────────────────────────────────
  // Composes the deal's stress-tested assumptions into base/upside/downside
  // cases. Requires >= 2 tested assumptions: one data point is not a range.
  scenarioAnalysis: scenariosAiQuery
    .input(z.object({ dealId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const deal = await assertDealAccess(input.dealId, ctx.user.id, orgId);
      const db = getDb();

      // Owner-scoped, like every other read of `assumptions` in this router
      // (Phase 15.18). This was the one that was not, and it had two visible
      // consequences rather than being merely untidy:
      //
      //   - ScenarioCards shows `testedCount` from ai.listAssumptions, which IS
      //     scoped. The panel could say "3 stress-tested assumptions" over a
      //     scenario the server had actually composed from five.
      //   - 15.13 resolves each driver name against the SCOPED assumption list,
      //     so a driver quoting an unscoped row resolved to null and rendered
      //     as "Not in the assumption ledger" — a gap in the ledger that was
      //     really a gap in this where-clause.
      //
      // The `tested.length < 2` guard below now counts what the caller can
      // actually see, which is the number the error message is about.
      const tested = (
        await db
          .select()
          .from(assumptions)
          .where(and(eq(assumptions.dealId, deal.id), scoped(assumptions, ctx.user.id, orgId)))
          .orderBy(desc(assumptions.createdAt))
          .limit(10)
      ).filter((a) => !!a.result);
      if (tested.length < 2) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Stress-test at least two assumptions first — scenarios need a range to work from.",
        });
      }

      const [econRow] = await db
        .select()
        .from(dealEconomics)
        .where(eq(dealEconomics.dealId, deal.id))
        .limit(1);
      const [synergyRow] = await db
        .select()
        .from(synergyPlans)
        .where(eq(synergyPlans.dealId, deal.id))
        .limit(1);

      // Phase 15.17 — the firm's own assumption record, narrowed to the
      // categories these drivers actually come from. Read server-internally for
      // the same reason the drafter does: patterns.assumptionFindings is gated
      // on `analytics`, and generating a scenario must not require a second grant.
      const scenarioFindings = relevantFindings(
        foldAssumptionFindings(await loadAssumptionCells(ctx.user.id, orgId)),
        tested.map((a) => coerceCategory(a.category)),
      );

      const system = `You are Ansyra's scenario analyst. You compose a deal's stress-tested assumptions into three coherent cases — base, upside, downside — the way a partner frames a deal for an investment committee. Use ONLY the assumptions supplied: every driver you cite must quote one of them. Never invent an assumption, a number, or a probability you cannot justify from the inputs. Where a driver rests on a category of assumption the firm's own record shows repeatedly failing, that history is an INPUT to the weighting: give the downside case the probability that record implies, do not let the base case assume such a driver simply holds without saying why this time differs, and put the signal that would show it breaking again into watchItems. Weight the range with it — do not assert that it breaks. Output STRICT JSON only.`;
      const prompt = `Deal: ${deal.name} (${deal.targetCompany}) | stage=${deal.stage} | industry=${deal.industry ?? "?"}
${econRow ? `Economics: EV ${econRow.enterpriseValue ?? "?"}M ${econRow.currency}, EV/EBITDA ${econRow.evEbitda ?? "n.m."}x\n` : ""}${synergyRow ? `Synergies: ${(synergyRow.categories ?? []).map((c) => phasingSummaryLine(c)).join(" | ")}\n` : ""}
Stress-tested assumptions:
${tested.map((a) => `- "${a.assumption}" → optimism ${a.result?.optimismScore ?? "?"}/100, ${a.result?.confidence ?? "?"} confidence. ${a.result?.reasoning ?? ""}`).join("\n")}

${assumptionHintBlock(scenarioFindings)}

Return JSON in this exact shape (exactly three cases, in this order):
{
  "cases": [
    {
      "name": "base" | "upside" | "downside",
      "narrative": "<2-3 sentences describing this case>",
      "drivers": [ { "assumption": "<quote one supplied assumption verbatim>", "direction": "holds" | "breaks" | "exceeds" } ],
      "thesisImpact": "<what this case means for the investment thesis>",
      "keyMetricDelta": "<qualitative unless economics were supplied>"
    }
  ],
  "summary": "<1-2 sentence overall read>",
  "watchItems": ["<the signals that would tell you which case is playing out>"]
}`;

      let out = await callAI<ScenarioResult>(prompt, { system, json: true, maxTokens: 2000 });
      if (!out.data) out = await callAI<ScenarioResult>(prompt, { system, json: true, maxTokens: 2000 });
      if (!out.data) throw malformedAiOutput();

      const validated = z.object({ cases: z.array(z.object({ name: z.enum(["base", "upside", "downside"]), narrative: z.string(), drivers: z.array(z.object({ assumption: z.string(), direction: z.enum(["holds", "breaks", "exceeds"]) })), thesisImpact: z.string(), keyMetricDelta: z.string().optional() })).length(3), summary: z.string(), watchItems: z.array(z.string()) }).parse(out.data);
      if (new Set(validated.cases.map((c) => c.name)).size !== 3 || validated.cases.some((c) => c.drivers.some((d) => !tested.some((a) => a.assumption === d.assumption)))) throw new TRPCError({ code: "BAD_GATEWAY", message: "Scenario drivers could not be verified against the supplied assumptions. No run was saved." });
      // Kept for old database readers only; zero is not a probability estimate.
      const normalised: ScenarioResult = { ...validated, probabilityBasis: "not_estimated", cases: validated.cases.map((c) => ({ ...c, probabilityPct: 0 })) };

      const [row] = await db
        .insert(scenarioAnalyses)
        .values({
          dealId: deal.id,
          result: normalised,
          assumptionCount: tested.length,
          model: `${AI_PROVIDER}:${AI_MODEL}`,
          createdBy: ctx.user.id,
          organizationId: orgId,
        })
        .returning();
      logActivity(ctx.user, {
        type: "ai",
        action: "Scenarios generated",
        detail: `${deal.name} — ${tested.length} assumptions`,
        dealId: deal.id,
      });
      return row;
    }),

  listScenarioAnalyses: scenariosQuery
    .input(z.object({ dealId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertDealAccess(input.dealId, ctx.user.id, ctx.user.organizationId ?? null);
      return getDb()
        .select()
        .from(scenarioAnalyses)
        .where(eq(scenarioAnalyses.dealId, input.dealId))
        .orderBy(desc(scenarioAnalyses.createdAt));
    }),

  deleteScenarioAnalysis: scenariosQuery
    .input(z.object({ id: z.number(), dealId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await assertDealAccess(input.dealId, ctx.user.id, ctx.user.organizationId ?? null);
      await getDb()
        .delete(scenarioAnalyses)
        .where(and(eq(scenarioAnalyses.id, input.id), eq(scenarioAnalyses.dealId, input.dealId)));
      return { success: true };
    }),

  listIcMemos: decisionsQuery
    .input(z.object({ dealId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertDealAccess(input.dealId, ctx.user.id, ctx.user.organizationId ?? null);
      return getDb()
        .select()
        .from(icMemos)
        .where(eq(icMemos.dealId, input.dealId))
        .orderBy(desc(icMemos.createdAt));
    }),

  // ── Recommendation drafting (Phase 15.8) ──────────────────────────────────
  // Turns everything already analysed on a deal into explicit, sourced,
  // falsifiable recommendations. The drafts land as owner="ai", status="draft":
  // the model can propose a conclusion, it can never be the one who reached it.
  // Only a human accept satisfies the stage gate — that is the whole point of
  // the owner column.
  draftRecommendations: recommendationsAiQuery
    .input(z.object({ dealId: z.number(), stage: z.enum(DEAL_STAGES).optional() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const deal = await assertDealAccess(input.dealId, ctx.user.id, orgId);
      const stage = input.stage ?? deal.stage;
      const db = getDb();

      const [assumptionRows, culturalRows, regulatoryRows, synergyRow, economicsRow, scenarioRow, memoRow, docRows, acceptedRows] =
        await Promise.all([
          db.select().from(assumptions).where(and(eq(assumptions.dealId, deal.id), scoped(assumptions, ctx.user.id, orgId))).orderBy(desc(assumptions.createdAt)).limit(10),
          db.select().from(culturalScores).where(and(eq(culturalScores.dealId, deal.id), scoped(culturalScores, ctx.user.id, orgId))).orderBy(desc(culturalScores.createdAt)).limit(2),
          db.select().from(regulatoryAnalyses).where(and(eq(regulatoryAnalyses.dealId, deal.id), scoped(regulatoryAnalyses, ctx.user.id, orgId))).orderBy(desc(regulatoryAnalyses.createdAt)).limit(2),
          db.select().from(synergyPlans).where(eq(synergyPlans.dealId, deal.id)).limit(1),
          db.select().from(dealEconomics).where(eq(dealEconomics.dealId, deal.id)).limit(1),
          db.select().from(scenarioAnalyses).where(eq(scenarioAnalyses.dealId, deal.id)).orderBy(desc(scenarioAnalyses.createdAt)).limit(1),
          db.select().from(icMemos).where(eq(icMemos.dealId, deal.id)).orderBy(desc(icMemos.createdAt)).limit(1),
          db.select({ id: documents.id }).from(documents).where(eq(documents.dealId, deal.id)),
          db.select().from(recommendations).where(and(eq(recommendations.dealId, deal.id), eq(recommendations.status, "accepted"), ownerScope(recommendations, ctx.user.id, orgId))).orderBy(desc(recommendations.createdAt)).limit(8),
        ]);

      let keyTermsRows: { id: number; result: Record<string, unknown> }[] = [];
      if (docRows.length) {
        keyTermsRows = await db
          .select({ id: documentAnalyses.id, result: documentAnalyses.result })
          .from(documentAnalyses)
          .where(and(inArray(documentAnalyses.documentId, docRows.map((r) => r.id)), eq(documentAnalyses.kind, "key_terms")))
          .orderBy(desc(documentAnalyses.createdAt))
          .limit(3);
      }

      // The firm's own recorded misfires (Phase 15.10) — cross-deal, and read
      // directly rather than through patterns.list, which is gated on
      // `analytics`: drafting must not require a second grant. Same caller
      // scope, so the moat rule and the demo exclusion come along for free.
      // A separate await rather than a tenth element on the positional
      // Promise.all above; one extra round-trip on a call that already makes an
      // AI request measured in seconds.
      const patterns = relevantPatterns(
        foldPatterns(await loadPatternCells(ctx.user.id, orgId)),
        stage,
      );

      // Phase 15.16 — the same move one layer down: which CATEGORIES of
      // assumption this firm keeps getting wrong. Read server-internally like
      // the patterns above, because patterns.assumptionFindings is gated on
      // `analytics` and drafting must not require a second grant.
      //
      // Narrowed to the categories this deal actually relies on. A finding about
      // financing assumptions is noise on a deal that has none, and noise in a
      // prompt is not free — it dilutes the block the model is meant to weigh
      // and invites it to invent an angle to match.
      const assumptionFindings = relevantFindings(
        foldAssumptionFindings(await loadAssumptionCells(ctx.user.id, orgId)),
        assumptionRows.map((a) => coerceCategory(a.category)),
      );

      // The set of citations the model is allowed to make. Assembled while
      // building the prompt so the two can never drift: anything not offered
      // here is filtered out of the response below.
      const citable = new Set<string>();
      const offer = (kind: EvidenceKind, id: number, line: string) => {
        citable.add(`${kind}:${id}`);
        return `  - [id=${id}] ${line}`;
      };

      const block = (label: string, items: string[]) =>
        `${label}:\n${items.length ? items.join("\n") : "  (none on file)"}`;

      const sections = [
        `Deal: ${deal.name} | target=${deal.targetCompany} | stage=${stage} | status=${deal.status} | value=${deal.value ?? "?"} | industry=${deal.industry ?? "?"}`,
        block(`Assumptions — cite as {"kind":"assumption","id":<id>}`, assumptionRows.map((a) =>
          offer("assumption", a.id, `"${a.assumption}" → optimism ${a.result?.optimismScore ?? "not scored"}/100, ${a.result?.confidence ?? "?"} confidence. ${a.result?.reasoning ?? ""}`.slice(0, 500)))),
        block(`Deal economics — cite as {"kind":"economics","id":<id>}`, economicsRow.map((e) =>
          offer("economics", e.id, `EV ${e.enterpriseValue ?? "?"}M ${e.currency} | equity ${e.equityValue ?? "?"}M | net debt ${e.netDebt ?? "?"}M | EBITDA ${e.targetEbitda ?? "?"}M | EV/EBITDA ${e.evEbitda ?? "n.m."}x | EV/Revenue ${e.evRevenue ?? "n.m."}x`))),
        block(`Cultural compatibility — cite as {"kind":"cultural","id":<id>}`, culturalRows.map((c) =>
          offer("cultural", c.id, `${c.acquirer} × ${c.target}: ${JSON.stringify(c.result).slice(0, 400)}`))),
        block(`Regulatory analysis — cite as {"kind":"regulatory","id":<id>}`, regulatoryRows.map((r) =>
          offer("regulatory", r.id, `${r.target} (${r.geography}): ${JSON.stringify(r.result).slice(0, 400)}`))),
        block(`Synergy plan — cite as {"kind":"synergy","id":<id>}`, synergyRow.map((s) =>
          offer("synergy", s.id, `${(s.categories ?? []).map((c) => phasingSummaryLine(c)).join(" | ")}`))),
        block(`Scenarios — cite as {"kind":"scenario","id":<id>}`, scenarioRow.map((s) =>
          offer("scenario", s.id, `${(s.result?.cases ?? []).map((c) => `${c.name} (illustrative scenario): ${c.thesisImpact}`).join(" | ")}`.slice(0, 500)))),
        block(`Document key terms — cite as {"kind":"document_analysis","id":<id>}`, keyTermsRows.map((k) =>
          offer("document_analysis", k.id, JSON.stringify(k.result).slice(0, 400)))),
        block(`IC memo — cite as {"kind":"ic_memo","id":<id>}`, memoRow.map((m) =>
          offer("ic_memo", m.id, `verdict ${m.result?.recommendation?.verdict ?? "?"}: ${m.result?.thesis ?? ""}`.slice(0, 400)))),
        block("Recommendations ALREADY accepted on this deal (do not restate these — build on them or argue with them)",
          acceptedRows.map((r) => `  - (${r.stage}, ${r.confidence}/100) "${r.claim}"`)),
        // Phase 15.10 — the firm's own recorded misfires, cross-deal. Built by
        // patternHintBlock rather than the local block() so the prompt is
        // assertable in a unit test; the two produce the identical shape, and
        // the label is deliberately NOT of the form `cite as {"kind":…}` so it
        // cannot inject a phantom citation offer into ai-mock's scanner.
        patternHintBlock(patterns),
        // Phase 15.16 — and where the CLAIMS underneath those conclusions have
        // failed. Same no-citable-shape constraint on the label.
        assumptionHintBlock(assumptionFindings),
      ];

      const system = `You are Ansyra's Recommendation Engine. You turn a deal's existing analyses into explicit, falsifiable recommendations a partner could act on or argue with. EVERY recommendation must cite at least one supplied analysis by its exact id — a claim you cannot source is not a recommendation, so omit it rather than inventing support. EVERY recommendation must carry at least one genuine counterargument; "no counterarguments" is never an acceptable answer, and an objection you dismiss in the same breath is not one. Confidence is an integer 0-100 reflecting how well the EVIDENCE supports the claim, not how much you like it. Where the firm's own outcome ledger records a pattern of claims like yours failing, say so in a counterargument and price it into the confidence rather than ignoring it. The same applies one level down: where the firm's assumption ledger records a CATEGORY of assumption repeatedly failing, a claim resting on an assumption of that category must name that history in a counterargument and carry a lower confidence for it — a recorded miss is evidence, not a mood. Senior M&A advisor voice: precise, sceptical, no filler. Output STRICT JSON only, no markdown fences.`;

      const prompt = `${sections.join("\n\n")}

Draft the recommendations for the ${stage} stage. Return JSON in this exact shape (2-4 recommendations, most consequential first):
{
  "recommendations": [
    {
      "claim": "<one sentence a partner could act on or argue with>",
      "rationale": "<2-4 sentences; reference the evidence you cite>",
      "supportingEvidence": [ { "kind": "assumption|economics|cultural|regulatory|synergy|scenario|document_analysis|ic_memo", "id": <an id supplied above>, "label": "<short quote or figure>" } ],
      "counterarguments": [ { "point": "<the strongest case against>", "weight": "minor|material|fatal", "response": "<your answer, or omit the field entirely if you have none>" } ],
      "confidence": <integer 0-100>
    }
  ]
}

Where a recommendation you are about to draft falls inside one of the firm's recorded failure patterns above — same stage, same confidence band, resting on the same kind of evidence — do two things: lower its confidence to reflect that history, and add the pattern itself as an explicit counterargument, stated as the firm's own recorded experience rather than as a general caution. A pattern marked low sample is a reason to be careful, not a reason to abandon a well-sourced claim.`;

      interface DraftedRecommendation {
        claim?: string;
        rationale?: string;
        supportingEvidence?: RecommendationEvidence[];
        counterarguments?: Counterargument[];
        confidence?: number;
      }
      interface RecommendationDraftResult {
        recommendations?: DraftedRecommendation[];
      }

      let out = await callAI<RecommendationDraftResult>(prompt, { system, json: true, maxTokens: 2500 });
      if (!out.data) {
        // One retry — a multi-recommendation payload occasionally trips parsing.
        out = await callAI<RecommendationDraftResult>(prompt, { system, json: true, maxTokens: 2500 });
      }
      if (!out.data) throw malformedAiOutput();

      // Citations are filtered against what was actually offered, not trusted.
      // The model will occasionally cite a plausible id it was never given, and
      // an unsourceable citation in a record whose premise is sourcing is worse
      // than no citation at all. Same instinct as renormalising scenario
      // probabilities rather than printing the model's arithmetic.
      const drafted = (out.data.recommendations ?? []).slice(0, 4).map((r) => ({
        dealId: deal.id,
        stage,
        claim: String(r.claim ?? "").trim().slice(0, 1000),
        rationale: String(r.rationale ?? "").trim(),
        supportingEvidence: dedupeEvidence(
          (r.supportingEvidence ?? []).filter((e) => citable.has(`${e.kind}:${e.id}`)),
        ),
        counterarguments: (r.counterarguments ?? [])
          .filter((c) => typeof c?.point === "string" && c.point.trim().length > 0)
          .slice(0, 20)
          .map((c) => ({
            point: c.point.trim().slice(0, 500),
            weight: (["minor", "material", "fatal"] as CounterargumentWeight[]).includes(c.weight)
              ? c.weight
              : ("material" as CounterargumentWeight),
            response: c.response?.trim() || null,
          })),
        confidence: Math.max(0, Math.min(100, Math.round(Number(r.confidence) || 50))),
        owner: "ai" as const,
        status: "draft" as const,
        model: `${AI_PROVIDER}:${AI_MODEL}`,
        createdBy: ctx.user.id,
        organizationId: orgId,
      }));

      const kept = drafted.filter(
        (r) => r.claim.length >= 10 && r.rationale.length >= 20 && r.supportingEvidence.length > 0,
      );
      if (kept.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "The model produced no recommendation it could source to an analysis on this deal. Run some analyses first — assumptions, economics or scenarios give it something to reason from.",
        });
      }

      const rows = await db.insert(recommendations).values(kept).returning();
      logActivity(ctx.user, {
        type: "ai",
        action: "Recommendations drafted",
        detail: `${deal.name} (${stage}) — ${rows.length} draft${rows.length === 1 ? "" : "s"}, top confidence ${confidenceBand(rows[0].confidence)}`,
        dealId: deal.id,
      });
      return rows;
    }),
});
