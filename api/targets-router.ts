import { z } from "zod";
import { and, desc, eq, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, featureQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { logActivity } from "./lib/activity";
import { callAIResearch } from "./lib/ai";
import { malformedAiOutput } from "./lib/ai-errors";
import { enforceRateLimit } from "./lib/rate-limit";
import { parseDealValue } from "@contracts/value";
import { targets, discoveryRuns, type DiscoveryCandidate } from "@db/schema";

// Numeric mirrors of the display strings (Phase 15.2 — deferred item), computed
// server-side so target financials can aggregate. Mirrors deals-router's
// valueColumns exactly. Both EBITDA and revenue share one fin_currency; if they
// disagree, revenue's currency wins (revenue is the size metric that matters for
// bucketing). NULL amount when unparseable — the string stays the fallback.
function financialColumns(ebitda: string | undefined | null, revenue: string | undefined | null) {
  const cols: Record<string, string | null> = {};
  if (ebitda !== undefined) {
    const p = parseDealValue(ebitda);
    cols.ebitdaAmount = p ? String(p.amount) : null;
    if (p) cols.finCurrency = p.currency;
  }
  if (revenue !== undefined) {
    const p = parseDealValue(revenue);
    cols.revenueAmount = p ? String(p.amount) : null;
    if (p) cols.finCurrency = p.currency; // revenue currency wins
  }
  return cols;
}

// Every target route requires the "targets" feature grant (and member kind).
const targetsQuery = featureQuery("targets");
// AI Discovery is a separately-granted feature (off by default).
const discoveryQuery = featureQuery("target_discovery");

const SIZE_BUCKETS = ["micro", "small", "lower_mid", "mid", "large"] as const;
const SIZE_BUCKET_DESC: Record<(typeof SIZE_BUCKETS)[number], string> = {
  micro: "micro (< $5M revenue)",
  small: "small ($5–25M revenue)",
  lower_mid: "lower mid-market ($25–100M revenue)",
  mid: "mid-market ($100–500M revenue)",
  large: "large (> $500M revenue)",
};

const StatusSchema = z.enum(["new", "screened", "contacted", "offer", "declined", "acquired"]);
// Column widths from the migrations; fitScore is an integer 0-100 column.
const TargetName = z.string().trim().min(1).max(255);
const Sector = z.string().trim().min(1).max(100);
const Money = z.string().trim().max(50);
const Description = z.string().max(5000);
const FitScore = z.number().int().min(0).max(100);
const HttpsUrlSchema = z.string().url().max(2_048).transform((raw, ctx) => {
  const url = new URL(raw);
  if (url.protocol !== "https:") {
    ctx.addIssue({ code: "custom", message: "Only HTTPS links are allowed." });
    return z.NEVER;
  }
  url.username = "";
  url.password = "";
  return url.toString();
});
const DiscoveryCandidateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  hq: z.string().trim().min(1).max(200),
  website: HttpsUrlSchema.optional(),
  estRevenue: z.string().trim().min(1).max(100),
  estEbitda: z.string().trim().max(100).optional(),
  employees: z.string().trim().max(100).optional(),
  description: z.string().trim().min(1).max(2_000),
  whyFit: z.string().trim().min(1).max(2_000),
  fitScore: z.coerce.number().finite().min(0).max(100),
  fitRationale: z.string().trim().min(1).max(1_000),
  risks: z.array(z.string().trim().min(1).max(500)).max(8),
  confidence: z.enum(["High", "Medium", "Low"]),
  sources: z.array(z.object({
    title: z.string().trim().min(1).max(300),
    url: HttpsUrlSchema,
  })).max(10),
});
const DiscoveryResponseSchema = z.object({
  candidates: z.array(DiscoveryCandidateSchema).min(1).max(10),
});

function scopeFilter(userId: string, organizationId: string | null) {
  if (organizationId) {
    return or(
      eq(targets.createdBy, userId),
      eq(targets.organizationId, organizationId),
    )!;
  }
  return eq(targets.createdBy, userId);
}

async function assertTargetAccess(id: number, userId: string, orgId: string | null) {
  const db = getDb();
  const [row] = await db.select().from(targets).where(eq(targets.id, id)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Target not found." });
  const mine = row.createdBy === userId;
  const shared = !!(orgId && row.organizationId === orgId);
  if (!mine && !shared) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You cannot access this target." });
  }
  return row;
}

export const targetsRouter = createRouter({
  list: targetsQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select()
      .from(targets)
      .where(scopeFilter(ctx.user.id, ctx.user.organizationId ?? null))
      .orderBy(targets.createdAt);
  }),

  create: targetsQuery
    .input(
      z.object({
        name: TargetName,
        sector: Sector,
        ebitda: Money.optional(),
        revenue: Money.optional(),
        fitScore: FitScore.optional(),
        description: Description.optional(),
        status: StatusSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [target] = await db.insert(targets).values({
        name: input.name,
        sector: input.sector,
        ebitda: input.ebitda,
        revenue: input.revenue,
        ...financialColumns(input.ebitda, input.revenue),
        fitScore: input.fitScore || 0,
        description: input.description,
        status: input.status || "new",
        createdBy: ctx.user.id,
        organizationId: ctx.user.organizationId ?? null,
      }).returning();
      logActivity(ctx.user, {
        type: "target",
        action: "Target added",
        detail: `${target.name} — ${target.sector}`,
        targetId: target.id,
      });
      return target;
    }),

  update: targetsQuery
    .input(
      z.object({
        id: z.number(),
        name: TargetName.optional(),
        sector: Sector.optional(),
        ebitda: Money.optional(),
        revenue: Money.optional(),
        fitScore: FitScore.optional(),
        description: Description.optional(),
        status: StatusSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const before = await assertTargetAccess(input.id, ctx.user.id, ctx.user.organizationId ?? null);
      const db = getDb();
      const { id, ...updateData } = input;
      await db
        .update(targets)
        .set({ ...updateData, ...financialColumns(input.ebitda, input.revenue) })
        .where(and(eq(targets.id, id), scopeFilter(ctx.user.id, ctx.user.organizationId ?? null)));
      logActivity(ctx.user, {
        type: "target",
        action: "Target updated",
        detail: before.name,
        targetId: id,
      });
      return { success: true };
    }),

  delete: targetsQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const before = await assertTargetAccess(input.id, ctx.user.id, ctx.user.organizationId ?? null);
      const db = getDb();
      await db
        .delete(targets)
        .where(and(eq(targets.id, input.id), scopeFilter(ctx.user.id, ctx.user.organizationId ?? null)));
      logActivity(ctx.user, {
        type: "target",
        action: "Target removed",
        detail: before.name,
      });
      return { success: true };
    }),

  // ── AI Target Discovery (Phase 9) ──────────────────────────────────────────
  // Web-grounded research: describe a thesis, get real candidate companies with
  // fit scores, estimates, and cited sources. Grounded calls are slow and
  // quota-bound, so a dedicated tight limiter sits on top of the feature gate.
  discover: discoveryQuery
    .input(
      z.object({
        industries: z.array(z.string().min(1)).min(1).max(6),
        geography: z.string().min(1).max(120),
        sizeBuckets: z.array(z.enum(SIZE_BUCKETS)).min(1),
        mustHaves: z.string().max(1000).optional(),
        dealBreakers: z.string().max(1000).optional(),
        count: z.union([z.literal(5), z.literal(10)]).default(5),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await enforceRateLimit(
        "discovery",
        ctx.user.id,
        5,
        60 * 60_000,
        "Discovery is limited to 5 runs per hour — try again later.",
      );

      const system = `You are Ansyra's Target Discovery, an M&A deal-sourcing researcher. You use live web search to find REAL, currently-operating companies matching an acquisition thesis. Rules: every financial figure is an estimate — prefix with "est." and never invent precision; if you cannot verify a company or figure from search results, set confidence to "Low"; cite the sources you used per candidate. Output STRICT JSON only. No preamble. No markdown fences.`;

      const prompt = `Find ${input.count} real acquisition candidates matching this thesis:
- Industries: ${input.industries.join(", ")}
- Geography: ${input.geography}
- Size: ${input.sizeBuckets.map((b) => SIZE_BUCKET_DESC[b]).join("; ")}
${input.mustHaves ? `- Must-haves: ${input.mustHaves}\n` : ""}${input.dealBreakers ? `- Deal-breakers (exclude companies matching these): ${input.dealBreakers}\n` : ""}
Research the live market. Only include companies you found evidence of via search. Rank by fit (best first).

Return JSON in this exact shape:
{
  "candidates": [
    {
      "name": "<company legal/trading name>",
      "hq": "<city, country>",
      "website": "<url or omit>",
      "estRevenue": "<e.g. 'est. $30M' — always prefixed est.>",
      "estEbitda": "<'est. ...' or omit if unknown>",
      "employees": "<'est. 100-200' or omit>",
      "description": "<1-2 sentences: what the company does>",
      "whyFit": "<1-2 sentences: why it matches THIS thesis>",
      "fitScore": <0-100 integer>,
      "fitRationale": "<one sentence justifying the score>",
      "risks": ["<2-4 short risks>"],
      "confidence": "High" | "Medium" | "Low",
      "sources": [{ "title": "<source name>", "url": "<url>" }]
    }
  ]
}`;

      const { data, text, sources } = await callAIResearch<{ candidates: DiscoveryCandidate[] }>(
        prompt,
        { system, json: true, maxTokens: 8000 },
      );
      if (!data?.candidates || !Array.isArray(data.candidates) || data.candidates.length === 0) {
        // The raw model text is deliberately NOT included: it would travel to
        // error monitoring, and nothing here needs it to explain the failure.
        void text;
        throw malformedAiOutput("Live research returned no usable candidates. Nothing was saved; please try again.");
      }

      const safeGroundingSources = sources.flatMap((source) => {
        const parsed = HttpsUrlSchema.safeParse(source.url);
        return parsed.success
          ? [{ title: source.title.slice(0, 300) || "Source", url: parsed.data }]
          : [];
      });
      const parsed = DiscoveryResponseSchema.safeParse({
        candidates: data.candidates.map((candidate) => ({
          ...candidate,
          sources:
            Array.isArray(candidate.sources) && candidate.sources.length > 0
              ? candidate.sources
              : safeGroundingSources.slice(0, 3),
        })),
      });
      if (!parsed.success) {
        throw malformedAiOutput("Live research returned malformed candidate data. Nothing was saved; please try again.");
      }
      const results: DiscoveryCandidate[] = parsed.data.candidates.map((candidate) => ({
        ...candidate,
        fitScore: Math.round(candidate.fitScore),
      }));

      const db = getDb();
      const [row] = await db
        .insert(discoveryRuns)
        .values({
          input,
          results,
          createdBy: ctx.user.id,
          organizationId: ctx.user.organizationId ?? null,
        })
        .returning();

      logActivity(ctx.user, {
        type: "ai",
        action: "Target discovery run",
        detail: `${input.industries.join(", ")} · ${input.geography} · ${results.length} candidates`,
      });
      return row;
    }),

  listDiscoveryRuns: discoveryQuery.query(async ({ ctx }) => {
    const db = getDb();
    const orgId = ctx.user.organizationId ?? null;
    const scope = orgId
      ? or(eq(discoveryRuns.createdBy, ctx.user.id), eq(discoveryRuns.organizationId, orgId))!
      : eq(discoveryRuns.createdBy, ctx.user.id);
    return db
      .select()
      .from(discoveryRuns)
      .where(scope)
      .orderBy(desc(discoveryRuns.createdAt))
      .limit(20);
  }),
});
