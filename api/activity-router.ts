import { z } from "zod";
import { and, desc, eq, ne, or } from "drizzle-orm";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { activityLog } from "@db/schema";

export const activityRouter = createRouter({
  // Kind-aware feed:
  //  - members see their own (or org) product activity (deal/target/ai), never
  //    admin rows;
  //  - a plain admin sees only the admin-type rows they generated;
  //  - main_admin sees every admin-type row.
  list: authedQuery
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(30),
          dealId: z.number().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const db = getDb();

      if (ctx.user.userKind === "member") {
        const orgId = ctx.user.organizationId ?? null;
        const owned = orgId
          ? or(eq(activityLog.userId, ctx.user.id), eq(activityLog.organizationId, orgId))!
          : eq(activityLog.userId, ctx.user.id);
        // Members never see admin-type rows.
        const scope = and(owned, ne(activityLog.type, "admin"))!;
        const where = input?.dealId ? and(scope, eq(activityLog.dealId, input.dealId))! : scope;
        return db
          .select()
          .from(activityLog)
          .where(where)
          .orderBy(desc(activityLog.createdAt))
          .limit(input?.limit ?? 30);
      }

      // Admin / main_admin: admin-type rows only.
      const adminScope =
        ctx.user.userKind === "main_admin"
          ? eq(activityLog.type, "admin")
          : and(eq(activityLog.type, "admin"), eq(activityLog.userId, ctx.user.id))!;
      return db
        .select()
        .from(activityLog)
        .where(adminScope)
        .orderBy(desc(activityLog.createdAt))
        .limit(input?.limit ?? 30);
    }),
});
