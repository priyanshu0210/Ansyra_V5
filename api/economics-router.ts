// ─────────────────────────────────────────────────────────────────────────────
// Deal Economics (Phase 15.2) — structured deal financials + the multiples an
// analyst asks for first. NO AI: every derived number comes from the pure,
// unit-tested functions in contracts/economics.ts, recomputed SERVER-SIDE on
// every save so a client can never persist its own arithmetic.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { eq } from "drizzle-orm";
import { createRouter, featureQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { logActivity } from "./lib/activity";
import { assertDealAccess } from "./deals-router";
import { computeMultiples, deriveEv, quickIrrMoic } from "@contracts/economics";
import { dealEconomics } from "@db/schema";

const economicsQuery = featureQuery("economics");

// numeric columns come back from pg as strings — normalize for the client so
// the dossier gets real numbers (and `null` stays `null`).
function toNum(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function shape(row: typeof dealEconomics.$inferSelect) {
  return {
    ...row,
    enterpriseValue: toNum(row.enterpriseValue),
    equityValue: toNum(row.equityValue),
    netDebt: toNum(row.netDebt),
    targetEbitda: toNum(row.targetEbitda),
    targetRevenue: toNum(row.targetRevenue),
    evEbitda: toNum(row.evEbitda),
    evRevenue: toNum(row.evRevenue),
    irrEstimate: toNum(row.irrEstimate),
    moicEstimate: toNum(row.moicEstimate),
  };
}

const SourcesUsesSchema = z
  .array(
    z.object({
      label: z.string().trim().min(1).max(120),
      side: z.enum(["source", "use"]),
      amount: z.number().finite(),
    }),
  )
  .max(40)
  .optional();

const RealizedSchema = z
  .object({
    exitDate: z.string().max(32).optional(),
    exitEv: z.number().finite().optional(),
    realizedIrr: z.number().finite().optional(),
    realizedMoic: z.number().finite().optional(),
  })
  .optional();

export const economicsRouter = createRouter({
  get: economicsQuery
    .input(z.object({ dealId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertDealAccess(input.dealId, ctx.user.id, ctx.user.organizationId ?? null);
      const db = getDb();
      const [row] = await db
        .select()
        .from(dealEconomics)
        .where(eq(dealEconomics.dealId, input.dealId))
        .limit(1);
      return row ? shape(row) : null;
    }),

  save: economicsQuery
    .input(
      z.object({
        dealId: z.number(),
        currency: z.string().length(3).default("USD"),
        enterpriseValue: z.number().finite().nullish(),
        equityValue: z.number().finite().nullish(),
        netDebt: z.number().finite().nullish(),
        targetEbitda: z.number().finite().nullish(),
        targetRevenue: z.number().finite().nullish(),
        peInputs: z
          .object({
            equityPct: z.number().finite().optional(),
            holdYears: z.number().finite().optional(),
            exitMultiple: z.number().finite().optional(),
          })
          .optional(),
        sourcesUses: SourcesUsesSchema,
        realized: RealizedSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.user.organizationId ?? null;
      const deal = await assertDealAccess(input.dealId, ctx.user.id, orgId);

      // EV is either given directly or derived from equity + net debt. We never
      // solve backwards from EV to equity (see the blueprint's edge cases).
      const ev = input.enterpriseValue ?? deriveEv({
        equityValue: input.equityValue,
        netDebt: input.netDebt,
      });
      const { evEbitda, evRevenue } = computeMultiples({
        ev,
        ebitda: input.targetEbitda,
        revenue: input.targetRevenue,
      });
      const { irr, moic } = quickIrrMoic({
        ev,
        ebitda: input.targetEbitda,
        equityPct: input.peInputs?.equityPct,
        holdYears: input.peInputs?.holdYears,
        exitMultiple: input.peInputs?.exitMultiple,
      });

      const str = (n: number | null | undefined) => (n == null ? null : String(n));
      const values = {
        dealId: deal.id,
        currency: input.currency.toUpperCase(),
        enterpriseValue: str(ev),
        equityValue: str(input.equityValue),
        netDebt: str(input.netDebt),
        targetEbitda: str(input.targetEbitda),
        targetRevenue: str(input.targetRevenue),
        evEbitda: str(evEbitda),
        evRevenue: str(evRevenue),
        peInputs: input.peInputs ?? null,
        irrEstimate: str(irr),
        moicEstimate: str(moic),
        sourcesUses: input.sourcesUses ?? null,
        realized: input.realized ?? null,
        createdBy: ctx.user.id,
        organizationId: orgId,
      };

      const db = getDb();
      const [row] = await db
        .insert(dealEconomics)
        .values(values)
        .onConflictDoUpdate({
          target: dealEconomics.dealId,
          // Never overwrite the original creator on an update.
          set: { ...values, createdBy: undefined, updatedAt: new Date() },
        })
        .returning();

      logActivity(ctx.user, {
        type: "deal",
        action: "Economics saved",
        detail: `${deal.name}${evEbitda != null ? ` · ${evEbitda}× EBITDA` : ""}`,
        dealId: deal.id,
      });
      return shape(row);
    }),
});
