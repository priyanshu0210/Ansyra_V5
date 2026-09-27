// ─────────────────────────────────────────────────────────────────────────────
// Access-request pipeline (Phase 7). Public intake from the landing page →
// admin review → approval provisions an invited member with exactly the granted
// features. Replaces the old leads.submitLead path for access requests.
// ─────────────────────────────────────────────────────────────────────────────
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery, adminPermQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { accessRequests } from "@db/schema";
import { FEATURE_KEYS } from "@contracts/constants";
import { enforceRateLimit, getClientIp } from "./lib/rate-limit";
import { requestOrigin } from "./lib/http";
import { provisionUser } from "./lib/provision";
import { logActivity } from "./lib/activity";
import { notifyAdmins } from "./lib/notify";

const FeatureKeySchema = z.enum(FEATURE_KEYS);

export const accessRouter = createRouter({
  // Public individual submission. Rate-limited per IP + honeypot; reason must be
  // substantive (≥30 chars). Organization requests use a contact card, not this.
  submit: publicQuery
    .input(
      z.object({
        name: z.string().min(1).max(255),
        email: z.string().email(),
        reason: z.string().min(30, "Please tell us a little more (at least 30 characters).").max(2000),
        requestedFeatures: z.array(FeatureKeySchema).default([]),
        website: z.string().optional(), // honeypot
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.website) return { success: true }; // bot — silently drop
      await enforceRateLimit("access", getClientIp(ctx.req, ctx.remoteAddress), 5, 60 * 60_000, "Too many requests — try again later.");

      await getDb().insert(accessRequests).values({
        requestType: "individual",
        name: input.name,
        email: input.email,
        // Company, role and phone are no longer collected. The columns remain
        // (nullable) so historical requests keep their data; new ones simply do
        // not gather it. Asking for less is the only privacy control here that
        // needs no policy language to be effective.
        company: null,
        role: null,
        phone: null,
        reason: input.reason,
        requestedFeatures: input.requestedFeatures,
      });
      notifyAdmins(
        "manage_access_requests",
        "Ansyra: new access request",
        `${input.name} (${input.email}) requested access.\n\nReason: ${input.reason}\n\nReview it in the dashboard under Access Requests.`,
      );
      return { success: true };
    }),

  list: adminPermQuery("manage_access_requests")
    .input(z.object({ status: z.enum(["pending", "approved", "declined"]).optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db.select().from(accessRequests).orderBy(desc(accessRequests.createdAt));
      return input?.status ? rows.filter((r) => r.status === input.status) : rows;
    }),

  // Approve → provision an invited member with exactly the (possibly edited)
  // feature set, then stamp the request. One mutation, transactional intent.
  approve: adminPermQuery("manage_access_requests")
    .input(
      z.object({
        id: z.number(),
        features: z.array(FeatureKeySchema).default([]),
        sendInvite: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      // Claim the request FIRST, atomically: the predicate on status means two
      // admins approving at once cannot both provision, and a failure after
      // this point is reverted below rather than leaving a provisioned user
      // behind a request that still says "pending".
      const [claimed] = await db
        .update(accessRequests)
        .set({ status: "approved", decidedBy: ctx.user.id, decidedAt: new Date() })
        .where(and(eq(accessRequests.id, input.id), eq(accessRequests.status, "pending")))
        .returning();
      if (!claimed) {
        const [existing] = await db.select({ id: accessRequests.id }).from(accessRequests).where(eq(accessRequests.id, input.id)).limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found." });
        throw new TRPCError({ code: "BAD_REQUEST", message: "This request has already been decided." });
      }

      let result;
      try {
        result = await provisionUser({
          name: claimed.name,
          email: claimed.email,
          role: "other", // access-request "role" is a free-text job title, not our enum
          // NEVER derived from the requester-supplied company text: organisation
          // membership is the tenant boundary and a self-reported name must not
          // be able to join an existing firm. An approved requester starts with
          // no organisation and sees only their own rows; an admin can place
          // them into a firm deliberately afterwards.
          organizationId: null,
          organizationName: null,
          isAdmin: false,
          sendInvite: input.sendInvite,
          features: input.features,
          origin: requestOrigin(ctx.req),
          grantedBy: ctx.user.id,
        });
      } catch (err) {
        await db
          .update(accessRequests)
          .set({ status: "pending", decidedBy: null, decidedAt: null })
          .where(eq(accessRequests.id, input.id))
          .catch(() => undefined);
        throw err;
      }

      await db
        .update(accessRequests)
        .set({ createdUserId: result.userId })
        .where(eq(accessRequests.id, input.id));

      logActivity(ctx.user, {
        type: "admin",
        action: "Access request approved",
        detail: `${claimed.email} · ${input.features.length} feature(s)`,
      });
      return result;
    }),

  decline: adminPermQuery("manage_access_requests")
    .input(z.object({ id: z.number(), note: z.string().max(1000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [req] = await db.select().from(accessRequests).where(eq(accessRequests.id, input.id)).limit(1);
      if (!req) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found." });
      if (req.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This request has already been decided." });
      }
      await db
        .update(accessRequests)
        .set({
          status: "declined",
          decidedBy: ctx.user.id,
          decidedAt: new Date(),
          decisionNote: input.note || null,
        })
        .where(eq(accessRequests.id, input.id));
      logActivity(ctx.user, { type: "admin", action: "Access request declined", detail: req.email });
      return { success: true };
    }),
});
