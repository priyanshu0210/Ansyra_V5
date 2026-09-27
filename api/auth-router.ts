import { isAvatarPath } from "./lib/upload-path";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { buildSessionSetCookie, readSessionFromHeaders } from "./auth/verify";
import { adminClient, anonClient } from "./lib/supabase-clients";
import { enforceRateLimit, getClientIp } from "./lib/rate-limit";
import { revokeSessionsWithPassword } from "./lib/revoke-sessions";
import { verifiedSessionId } from "./lib/active-session";
import { requestOrigin } from "./lib/http";
import { getDb } from "./queries/connection";
import {
  users,
  userFeatures,
  deals,
  targets,
  assumptions,
  culturalScores,
  regulatoryAnalyses,
  synergyPlans,
  activityLog,
} from "@db/schema";
import { assertImageUpload, assertStoredObject, imageExtFor, createUpload, publicUrl } from "./lib/storage";
import { createRouter, authedQuery, publicQuery } from "./middleware";

// Exchange a verified OTP for a clean, guaranteed-valid session by signing in
// with the just-set password (reuses the proven login path rather than trusting
// the transient verifyOtp session, which an admin password update can revoke).
async function issueSessionCookie(
  ctx: { req: Request; resHeaders: Headers },
  email: string,
  password: string,
): Promise<string> {
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Password was set but sign-in failed — try logging in.",
    });
  }
  ctx.resHeaders.append(
    "set-cookie",
    buildSessionSetCookie(ctx.req.headers, {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at ?? null,
    }),
  );
  return data.user.id;
}

export const authRouter = createRouter({
  // Returns the user row plus their granted feature keys. userKind and
  // adminPermissions come from the user row (added in Phase 7); the sidebar
  // and route guards read all three.
  me: authedQuery.query(async ({ ctx }) => {
    const rows = await getDb()
      .select({ key: userFeatures.featureKey })
      .from(userFeatures)
      .where(eq(userFeatures.userId, ctx.user.id));
    const session = readSessionFromHeaders(new Headers({ cookie: ctx.resHeaders.get("set-cookie") ?? ctx.req.headers.get("cookie") ?? "" }));
    return { ...ctx.user, features: rows.map((r) => r.key),
      browserSessionId: session ? verifiedSessionId(session.access_token, ctx.user.id) : null };
  }),

  logout: authedQuery.input(z.object({ scope: z.enum(["local", "others", "global"]).default("local") }).optional()).mutation(async ({ ctx, input }) => {
    const scope = input?.scope ?? "local";
    // Authentication may have refreshed the token for this request already.
    const session = readSessionFromHeaders(new Headers({ cookie: ctx.resHeaders.get("set-cookie") ?? ctx.req.headers.get("cookie") ?? "" }));
    if (session) {
      const { error } = await adminClient().auth.admin.signOut(session.access_token, scope);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Sign-out could not be completed. Please try again." });
    }
    if (scope !== "others") ctx.resHeaders.append("set-cookie", buildSessionSetCookie(ctx.req.headers, null));
    return { success: true };
  }),

  // Public login — server-side sign in so we can set the httpOnly session
  // cookie the tRPC context reads. Client never touches raw tokens.
  login: publicQuery
    .input(
      z.object({
        email: z.string().email().max(254),
        password: z.string().min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const key = getClientIp(ctx.req, ctx.remoteAddress);
      await enforceRateLimit("login", key, 5, 60_000, "Too many login attempts — try again in a minute.");

      await enforceRateLimit("login-account", input.email.trim().toLowerCase(), 10, 60_000, "Too many login attempts — try again in a minute.");
      const { data, error } = await anonClient().auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      if (error || !data.session || !data.user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password.",
        });
      }
      ctx.resHeaders.append(
        "set-cookie",
        buildSessionSetCookie(ctx.req.headers, {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at ?? null,
        }),
      );
      return { userId: data.user.id };
    }),

  // Public sign-up intentionally removed — Ansyra is a company tool and every
  // account is provisioned by an admin (see admin-router.ts). The login page
  // tells prospective users to contact their administrator.

  // ── Forgot password ────────────────────────────────────────────────────────
  // Public. Always returns success (never reveals whether an email exists) and
  // is rate-limited to blunt enumeration + email-bombing. Sends the Supabase
  // recovery email; the link lands on /reset-password/confirm carrying a
  // token_hash (see the email-template note in the Phase 6 dashboard checklist).
  requestPasswordReset: publicQuery
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const key = getClientIp(ctx.req, ctx.remoteAddress);
      await enforceRateLimit("password-reset", key, 3, 60 * 60_000, "Too many reset requests — try again later.");

      const supabase = anonClient();
      await supabase.auth.resetPasswordForEmail(input.email, {
        redirectTo: `${requestOrigin(ctx.req)}/reset-password/confirm`,
      });
      // Intentionally ignore the result — success is always reported.
      return { success: true };
    }),

  // Consume a recovery token_hash, set the new password, and log the user in.
  confirmPasswordReset: publicQuery
    .input(
      z.object({
        tokenHash: z.string().min(1).max(2048),
        newPassword: z.string().min(12).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await enforceRateLimit("auth-token", getClientIp(ctx.req, ctx.remoteAddress), 10, 60_000, "Too many verification attempts. Please try again shortly.");
      const admin = adminClient();
      const { data: otp, error: otpErr } = await anonClient().auth.verifyOtp({
        type: "recovery",
        token_hash: input.tokenHash,
      });
      if (otpErr || !otp.user?.email) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This reset link is invalid or has expired — request a new one.",
        });
      }
      const { error: updErr } = await admin.auth.admin.updateUserById(otp.user.id, {
        password: input.newPassword,
      });
      if (updErr) {
        throw new TRPCError({ code: "BAD_REQUEST", message: updErr.message });
      }
      // A self-service reset clears any forced-change flag.
      await getDb()
        .update(users)
        .set({ mustChangePassword: false })
        .where(eq(users.id, otp.user.id));

      await revokeSessionsWithPassword(otp.user.email, input.newPassword);
      const userId = await issueSessionCookie(ctx, otp.user.email, input.newPassword);
      return { userId };
    }),

  // Consume an invite token_hash, set name + password, and log the user in.
  confirmInvite: publicQuery
    .input(
      z.object({
        tokenHash: z.string().min(1).max(2048),
        name: z.string().min(1).max(200),
        newPassword: z.string().min(12).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await enforceRateLimit("auth-token", getClientIp(ctx.req, ctx.remoteAddress), 10, 60_000, "Too many verification attempts. Please try again shortly.");
      const admin = adminClient();
      const { data: otp, error: otpErr } = await anonClient().auth.verifyOtp({
        type: "invite",
        token_hash: input.tokenHash,
      });
      if (otpErr || !otp.user?.email) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This invite link is invalid or has expired — ask your admin to resend it.",
        });
      }
      const { error: updErr } = await admin.auth.admin.updateUserById(otp.user.id, {
        password: input.newPassword,
        user_metadata: { ...(otp.user.user_metadata ?? {}), name: input.name },
      });
      if (updErr) {
        throw new TRPCError({ code: "BAD_REQUEST", message: updErr.message });
      }
      await getDb()
        .update(users)
        .set({ name: input.name, mustChangePassword: false })
        .where(eq(users.id, otp.user.id));

      await revokeSessionsWithPassword(otp.user.email, input.newPassword);
      const userId = await issueSessionCookie(ctx, otp.user.email, input.newPassword);
      return { userId };
    }),

  // Authenticated password change (e.g. after receiving a temporary password).
  // Clears the forced-change flag so the dashboard stops redirecting.
  changePassword: authedQuery
    .input(z.object({ newPassword: z.string().min(12).max(200), currentPassword: z.string().min(1).max(200).optional() }))
    .mutation(async ({ ctx, input }) => {
      await enforceRateLimit("password-change", ctx.user.id, 5, 60_000);
      if (!ctx.user.email) throw new TRPCError({ code: "BAD_REQUEST", message: "This account has no email address." });
      const admin = adminClient();
      if (!ctx.user.mustChangePassword) {
        if (!input.currentPassword) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter your current password to confirm this change." });
        const verified = await anonClient().auth.signInWithPassword({ email: ctx.user.email, password: input.currentPassword });
        if (verified.error || verified.data.user?.id !== ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Your current password is incorrect." });
        }
        // This verification session is temporary; it must not be left behind.
        if (verified.data.session) await admin.auth.admin.signOut(verified.data.session.access_token, "local");
      }
      const { error } = await admin.auth.admin.updateUserById(ctx.user.id, { password: input.newPassword });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: "The password could not be changed. Please try again." });
      await revokeSessionsWithPassword(ctx.user.email, input.newPassword);
      await getDb().update(users).set({ mustChangePassword: false }).where(eq(users.id, ctx.user.id));
      await issueSessionCookie(ctx, ctx.user.email, input.newPassword);
      return { success: true };
    }),

  // ── Profile (Phase 8) ────────────────────────────────────────────────────
  // Own-row only: the filter is always id = ctx.user.id; a target id is never
  // accepted from input. Members and admins both use this.
  updateProfile: authedQuery
    .input(
      z.object({
        name: z.string().min(1).max(200).optional(),
        title: z.string().max(120).optional(),
        phone: z.string().max(50).optional(),
        firm: z.string().max(255).optional(),
        location: z.string().max(120).optional(),
        timezone: z.string().max(64).optional(),
        bio: z.string().max(2000).optional(),
        preferences: z
          .object({
            default_currency: z.enum(["USD", "EUR", "GBP", "INR", "JPY"]).optional(),
            date_format: z.string().max(32).optional(),
            email_notifications: z.boolean().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = {};
      for (const k of ["name", "title", "phone", "firm", "location", "timezone", "bio"] as const) {
        if (input[k] !== undefined) patch[k] = input[k];
      }
      if (input.preferences) {
        patch.preferences = { ...(ctx.user.preferences ?? {}), ...input.preferences };
      }
      if (Object.keys(patch).length === 0) return { success: true };
      await getDb().update(users).set(patch).where(eq(users.id, ctx.user.id));
      return { success: true };
    }),

  // Two-step avatar upload: request a signed URL (validated), client PUTs the
  // file to it, then confirm to store the public URL. avatars is public-read.
  requestAvatarUpload: authedQuery
    .input(z.object({ mime: z.string(), size: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      assertImageUpload(input.mime, input.size, 2 * 1024 * 1024);
      const ext = imageExtFor(input.mime);
      const path = `${ctx.user.id}.${ext}`;
      const { token, uploadUrl } = await createUpload("avatars", path, { upsert: true });
      return { bucket: "avatars", path, token, uploadUrl };
    }),

  confirmAvatar: authedQuery
    .input(z.object({ path: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // The path must be the caller's own object.
      if (!isAvatarPath(input.path, ctx.user.id)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "That isn't your upload." });
      }
      await assertStoredObject("avatars", input.path, {
        allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
        maxBytes: 2 * 1024 * 1024,
      });
      // Cache-bust so a replaced avatar isn't served stale from the CDN.
      const url = `${publicUrl("avatars", input.path)}?v=${Date.now()}`;
      await getDb().update(users).set({ avatarUrl: url }).where(eq(users.id, ctx.user.id));
      return { avatarUrl: url };
    }),

  // ── Data rights (Phase 8.6) ──────────────────────────────────────────────
  // Export everything the app holds about the caller — their own rows only,
  // scoped exactly as elsewhere. Never includes other users' data or secrets.
  exportMyData: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const uid = ctx.user.id;
    const profile = ctx.user;
    const [dealRows, targetRows, assumptionRows, culturalRows, regulatoryRows, synergyRows, activityRows] =
      await Promise.all([
        db.select().from(deals).where(eq(deals.createdBy, uid)),
        db.select().from(targets).where(eq(targets.createdBy, uid)),
        db.select().from(assumptions).where(eq(assumptions.createdBy, uid)),
        db.select().from(culturalScores).where(eq(culturalScores.createdBy, uid)),
        db.select().from(regulatoryAnalyses).where(eq(regulatoryAnalyses.createdBy, uid)),
        db.select().from(synergyPlans).where(eq(synergyPlans.createdBy, uid)),
        db
          .select()
          .from(activityLog)
          .where(eq(activityLog.userId, uid))
          .orderBy(desc(activityLog.createdAt)),
      ]);

    return {
      exportedAt: new Date().toISOString(),
      profile,
      deals: dealRows,
      targets: targetRows,
      assumptions: assumptionRows,
      culturalScores: culturalRows,
      regulatoryAnalyses: regulatoryRows,
      synergyPlans: synergyRows,
      activity: activityRows,
    };
  }),

  // Soft account-deletion request: records intent + notifies admins. A user can
  // never hard-delete themselves (avoids orphaned org data); admins do that.
  requestAccountDeletion: authedQuery.mutation(async ({ ctx }) => {
    if (ctx.user.userKind === "main_admin") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "The main administrator account can't be deleted.",
      });
    }
    if (!ctx.user.deletionRequestedAt) {
      await getDb()
        .update(users)
        .set({ deletionRequestedAt: new Date() })
        .where(eq(users.id, ctx.user.id));
    }
    return { success: true };
  }),
});
