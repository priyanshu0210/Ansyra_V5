import { z } from "zod";
import { and, count, desc, eq, getTableColumns, ilike, inArray, lt, lte, ne, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, featureQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { logActivity } from "./lib/activity";
import { parseDealValue } from "@contracts/value";
import { isForwardStageMove } from "@contracts/stages";
import { deals, documents, targets } from "@db/schema";
import { removeObjects } from "./lib/storage";

const DOCUMENTS_BUCKET = "deal-documents";

// Column widths from the migrations. Over-long input used to reach Postgres and
// surface as "Something went wrong."; it is now a validation error.
const DealName = z.string().trim().min(1).max(255);
const TargetCompany = z.string().trim().min(1).max(255);
const DealValue = z.string().trim().max(50);
const Industry = z.string().trim().max(100);

/** Storage paths of every document on these deals — read BEFORE the rows
 *  cascade away, so the objects can be removed afterwards. */
async function documentPathsFor(dealIds: number[]): Promise<string[]> {
  if (dealIds.length === 0) return [];
  const rows = await getDb().select({ path: documents.path }).from(documents).where(inArray(documents.dealId, dealIds));
  return rows.map((r) => r.path);
}

// Numeric mirror of the display value (Phase 11.1) — computed server-side so
// the parse logic lives in one place (contracts/value.ts).
function valueColumns(value: string | undefined | null) {
  if (value === undefined) return {};
  const parsed = parseDealValue(value);
  return {
    valueAmount: parsed ? String(parsed.amount) : null,
    valueCurrency: parsed ? parsed.currency : null,
  };
}

// Every deal route requires the "pipeline" feature grant (and member kind).
const pipelineQuery = featureQuery("pipeline");

const StageSchema = z.enum([
  "sourcing", "evaluation", "diligence", "negotiation", "closing", "integration",
]);
const StatusSchema = z.enum(["active", "on_hold", "completed", "cancelled"]);
const PIPELINE_PAGE_SIZE = 20;
const PIPELINE_STAGES = StageSchema.options;
const PipelineFilterSchema = z.object({
  query: z.string().max(120).default(""),
  industry: z.string().max(100).nullable().optional(),
  stage: StageSchema.optional(),
});
const PageCursorSchema = z.object({
  createdAt: z.date(),
  id: z.number().int().positive(),
});

type PipelineFilter = z.infer<typeof PipelineFilterSchema>;

// Build a where-clause that limits access to rows the caller owns (by createdBy)
// or shares by organization (when they belong to one).
function scopeFilter(userId: string, organizationId: string | null) {
  if (organizationId) {
    return or(
      eq(deals.createdBy, userId),
      eq(deals.organizationId, organizationId),
    )!;
  }
  return eq(deals.createdBy, userId);
}

function activePipelineFilter(userId: string, organizationId: string | null, input: PipelineFilter) {
  const query = input.query.trim();
  return and(
    scopeFilter(userId, organizationId),
    ne(deals.status, "cancelled"),
    input.industry ? eq(deals.industry, input.industry) : undefined,
    input.stage ? eq(deals.stage, input.stage) : undefined,
    query
      ? or(
          ilike(deals.name, `%${query}%`),
          ilike(deals.targetCompany, `%${query}%`),
          ilike(deals.industry, `%${query}%`),
        )
      : undefined,
  );
}

function beforeCursor(cursor: z.infer<typeof PageCursorSchema> | undefined) {
  if (!cursor) return undefined;
  return or(
    lt(deals.createdAt, cursor.createdAt),
    and(eq(deals.createdAt, cursor.createdAt), lt(deals.id, cursor.id)),
  );
}

export async function assertDealAccess(id: number, userId: string, orgId: string | null) {
  const db = getDb();
  const [row] = await db.select().from(deals).where(eq(deals.id, id)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Deal not found." });
  const mine = row.createdBy === userId;
  const shared = !!(orgId && row.organizationId === orgId);
  if (!mine && !shared) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You cannot access this deal." });
  }
  return row;
}

export const dealsRouter = createRouter({
  // Single deal, with access enforcement — direct URLs to deals you don't
  // own/share return FORBIDDEN, unknown ids return NOT_FOUND.
  get: pipelineQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) =>
      assertDealAccess(input.id, ctx.user.id, ctx.user.organizationId ?? null),
    ),

  list: pipelineQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select()
      .from(deals)
      .where(scopeFilter(ctx.user.id, ctx.user.organizationId ?? null))
      .orderBy(deals.createdAt);
  }),

  // Bounded board read for the pipeline. The previous UI hid rows after the
  // first twenty but still downloaded every deal in the organization. This
  // returns only one server page per visible stage plus the counts needed to
  // describe the full result set.
  pipelineBoard: pipelineQuery
    .input(PipelineFilterSchema)
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const orgId = ctx.user.organizationId ?? null;
      const scope = scopeFilter(ctx.user.id, orgId);
      const filtered = activePipelineFilter(ctx.user.id, orgId, input);
      const ranked = db
        .select({
          ...getTableColumns(deals),
          stageRow: sql<number>`row_number() over (partition by ${deals.stage} order by ${deals.createdAt} desc, ${deals.id} desc)`.as("stage_row"),
          stageTotal: sql<number>`count(*) over (partition by ${deals.stage})`.as("stage_total"),
        })
        .from(deals)
        .where(filtered)
        .as("ranked_pipeline_deals");

      const [rankedRows, metaRows] = await Promise.all([
        db.select().from(ranked).where(lte(ranked.stageRow, PIPELINE_PAGE_SIZE)),
        db.select({
          activeTotal: sql<number>`count(*) filter (where ${deals.status} <> 'cancelled')`,
          archivedTotal: sql<number>`count(*) filter (where ${deals.status} = 'cancelled')`,
          demoTotal: sql<number>`count(*) filter (where ${deals.isDemo} = true)`,
          industries: sql<string[]>`coalesce(array_agg(distinct ${deals.industry}) filter (where ${deals.status} <> 'cancelled' and ${deals.industry} is not null), '{}')`,
        }).from(deals).where(scope),
      ]);

      const itemsByStage = new Map<string, typeof deals.$inferSelect[]>();
      const countByStage = new Map<string, number>();
      for (const row of rankedRows) {
        const { stageRow, stageTotal, ...item } = row;
        void stageRow;
        const list = itemsByStage.get(item.stage) ?? [];
        list.push(item);
        itemsByStage.set(item.stage, list);
        countByStage.set(item.stage, Number(stageTotal));
      }
      const meta = metaRows[0];
      return {
        stages: PIPELINE_STAGES.map((stage) => ({
          stage,
          total: countByStage.get(stage) ?? 0,
          items: itemsByStage.get(stage) ?? [],
        })),
        activeTotal: Number(meta?.activeTotal ?? 0),
        filteredTotal: [...countByStage.values()].reduce((sum, total) => sum + total, 0),
        archivedTotal: Number(meta?.archivedTotal ?? 0),
        industries: [...(meta?.industries ?? [])].sort((a, b) => a.localeCompare(b)),
        hasDemo: Number(meta?.demoTotal ?? 0) > 0,
      };
    }),

  pipelineStagePage: pipelineQuery
    .input(PipelineFilterSchema.extend({
      stage: StageSchema,
      cursor: PageCursorSchema.optional(),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(50).default(PIPELINE_PAGE_SIZE),
    }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const where = and(
        activePipelineFilter(ctx.user.id, ctx.user.organizationId ?? null, input),
        beforeCursor(input.cursor),
      );
      const items = await db.select().from(deals)
        .where(where)
        .orderBy(desc(deals.createdAt), desc(deals.id))
        .limit(input.limit)
        .offset(input.cursor ? 0 : input.offset);
      const last = items.at(-1);
      return {
        items,
        nextOffset: input.offset + items.length,
        nextCursor: last ? { createdAt: last.createdAt, id: last.id } : null,
      };
    }),

  archivedPage: pipelineQuery
    .input(z.object({
      cursor: PageCursorSchema.optional(),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(50).default(PIPELINE_PAGE_SIZE),
    }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const totalWhere = and(scopeFilter(ctx.user.id, ctx.user.organizationId ?? null), eq(deals.status, "cancelled"));
      const where = and(totalWhere, beforeCursor(input.cursor));
      const [items, totalRows] = await Promise.all([
        db.select().from(deals).where(where).orderBy(desc(deals.createdAt), desc(deals.id)).limit(input.limit).offset(input.cursor ? 0 : input.offset),
        db.select({ total: count() }).from(deals).where(totalWhere),
      ]);
      const last = items.at(-1);
      return {
        items,
        total: totalRows[0]?.total ?? 0,
        nextOffset: input.offset + items.length,
        nextCursor: last ? { createdAt: last.createdAt, id: last.id } : null,
      };
    }),

  create: pipelineQuery
    .input(
      z.object({
        name: DealName,
        targetCompany: TargetCompany,
        stage: StageSchema.optional(),
        value: DealValue.optional(),
        industry: Industry.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [deal] = await db.insert(deals).values({
        name: input.name,
        targetCompany: input.targetCompany,
        stage: input.stage || "sourcing",
        value: input.value,
        ...valueColumns(input.value),
        industry: input.industry,
        createdBy: ctx.user.id,
        organizationId: ctx.user.organizationId ?? null,
      }).returning();
      logActivity(ctx.user, {
        type: "deal",
        action: "Deal created",
        detail: `${deal.name} — ${deal.targetCompany}`,
        dealId: deal.id,
      });
      return deal;
    }),

  update: pipelineQuery
    .input(
      z.object({
        id: z.number(),
        name: DealName.optional(),
        targetCompany: TargetCompany.optional(),
        stage: StageSchema.optional(),
        value: DealValue.optional(),
        industry: Industry.optional(),
        status: StatusSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const before = await assertDealAccess(input.id, ctx.user.id, ctx.user.organizationId ?? null);
      // Stage-gate (Phase 15.1): advancing a deal to a LATER stage requires a
      // recorded decision — that path goes through decisions.record, which moves
      // the stage in the same transaction. Reject a bare forward move here so the
      // gate can't be bypassed by calling deals.update directly. Backward moves,
      // same-stage, and non-stage edits are unaffected.
      if (input.stage && isForwardStageMove(before.stage, input.stage)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "DECISION_REQUIRED: record a decision to advance this deal to a later stage.",
        });
      }
      const db = getDb();
      const { id, ...updateData } = input;
      await db
        .update(deals)
        .set({ ...updateData, ...valueColumns(input.value) })
        .where(and(eq(deals.id, id), scopeFilter(ctx.user.id, ctx.user.organizationId ?? null)));
      if (input.stage && input.stage !== before.stage) {
        logActivity(ctx.user, {
          type: "deal",
          action: "Stage updated",
          detail: `${before.name} → ${input.stage}`,
          dealId: id,
        });
      } else {
        logActivity(ctx.user, {
          type: "deal",
          action: "Deal updated",
          detail: before.name,
          dealId: id,
        });
      }
      return { success: true };
    }),

  delete: pipelineQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const before = await assertDealAccess(input.id, ctx.user.id, ctx.user.organizationId ?? null);
      const db = getDb();
      // The rows cascade; the Storage objects do not. Collect their paths first
      // so a deleted deal does not leave its documents in the bucket for ever.
      const paths = await documentPathsFor([input.id]);
      await db
        .delete(deals)
        .where(and(eq(deals.id, input.id), scopeFilter(ctx.user.id, ctx.user.organizationId ?? null)));
      await removeObjects(DOCUMENTS_BUCKET, paths);
      logActivity(ctx.user, {
        type: "deal",
        action: "Deal deleted",
        detail: before.name,
      });
      return { success: true };
    }),

  // ── Sample portfolio (Phase 11.7) ──────────────────────────────────────────
  // Seeds a small demo portfolio (tagged is_demo) so a new member's empty
  // pipeline is explorable. Scoped to the caller; bulk-removable.
  loadSamples: pipelineQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    const own = { createdBy: ctx.user.id, organizationId: ctx.user.organizationId ?? null, isDemo: true };
    const demoDeals = [
      { name: "Project Meridian", targetCompany: "Meridian Logistics", stage: "sourcing", value: "$45M", industry: "Supply Chain & Logistics" },
      { name: "Project Atlas", targetCompany: "Atlas HealthData", stage: "evaluation", value: "$120M", industry: "Healthcare & Life Sciences" },
      { name: "Project Forge", targetCompany: "Forge Automation", stage: "diligence", value: "$85M", industry: "Industrials & Manufacturing" },
      { name: "Project Lumen", targetCompany: "Lumen Grid Systems", stage: "negotiation", value: "€60M", industry: "Clean Energy" },
      { name: "Project Cipher", targetCompany: "Cipher Trust Labs", stage: "closing", value: "$95M", industry: "Cybersecurity" },
      { name: "Project Harbor", targetCompany: "Harbor Fintech", stage: "integration", value: "£38M", industry: "Financial Services" },
    ] as const;
    const demoTargets = [
      { name: "Northwave Software", sector: "Technology & Software", ebitda: "$6M", revenue: "$28M", fitScore: 84, description: "Vertical SaaS for freight brokers; 92% gross retention.", status: "screened" },
      { name: "Bluepeak Diagnostics", sector: "Healthcare & Life Sciences", ebitda: "$11M", revenue: "$52M", fitScore: 78, description: "Regional lab network with hospital contracts.", status: "new" },
      { name: "Ironline Components", sector: "Industrials & Manufacturing", ebitda: "$9M", revenue: "$61M", fitScore: 71, description: "Precision parts; auto + aero split.", status: "contacted" },
      { name: "Solstice Storage", sector: "Clean Energy", ebitda: "$4M", revenue: "$19M", fitScore: 66, description: "Battery-storage integrator, project backlog 2x revenue.", status: "new" },
      { name: "Quill & Ledger", sector: "Business Services", ebitda: "$7M", revenue: "$33M", fitScore: 74, description: "Outsourced CFO services for mid-market PE portcos.", status: "offer" },
    ] as const;

    const insertedDeals = await db
      .insert(deals)
      .values(demoDeals.map((d) => ({ ...d, ...valueColumns(d.value), ...own })))
      .returning({ id: deals.id });
    await db.insert(targets).values(demoTargets.map((t) => ({ ...t, ...own })));

    logActivity(ctx.user, {
      type: "deal",
      action: "Sample portfolio loaded",
      detail: `${demoDeals.length} deals · ${demoTargets.length} targets`,
    });
    return { deals: insertedDeals.length, targets: demoTargets.length };
  }),

  removeSamples: pipelineQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    // Own demo rows only — never org-shared ones someone else seeded.
    const demoIds = (
      await db.select({ id: deals.id }).from(deals).where(and(eq(deals.createdBy, ctx.user.id), eq(deals.isDemo, true)))
    ).map((d) => d.id);
    const paths = await documentPathsFor(demoIds);
    await db.delete(deals).where(and(eq(deals.createdBy, ctx.user.id), eq(deals.isDemo, true)));
    await db.delete(targets).where(and(eq(targets.createdBy, ctx.user.id), eq(targets.isDemo, true)));
    await removeObjects(DOCUMENTS_BUCKET, paths);
    logActivity(ctx.user, { type: "deal", action: "Sample portfolio removed" });
    return { success: true };
  }),
});
