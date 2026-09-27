import { revokeSessionsWithPassword } from "./lib/revoke-sessions";
// ─────────────────────────────────────────────────────────────────────────────
// Admin router — user provisioning + RBAC administration.
// There is no public signup: admins create every account. Access is tiered by
// user_kind (main_admin/admin) and the admin_permissions checklist — see
// middleware.ts (adminQuery / adminPermQuery). main_admin implicitly has all
// permissions; only main_admin may create/edit admins or set permissions.
// ─────────────────────────────────────────────────────────────────────────────
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { createRouter, adminQuery, adminPermQuery } from "./middleware";
import { requestOrigin } from "./lib/http";
import { getDb } from "./queries/connection";
import {
  users,
  organizations,
  userFeatures,
  deals,
  targets,
  decisions,
  documents,
  activityLog,
  USER_ROLES,
} from "@db/schema";
import { FEATURE_KEYS, ADMIN_PERMISSION_KEYS } from "@contracts/constants";
import type { User } from "@db/schema";
import { logActivity } from "./lib/activity";
import { provisionUser, generateTempPassword } from "./lib/provision";
import { adminClient } from "./lib/supabase-clients";

const RoleSchema = z.enum(USER_ROLES);
const FeatureKeySchema = z.enum(FEATURE_KEYS);

// A ban long enough to be permanent for practical purposes; Go durations cap
// out near 292 years and GoTrue accepts hours.
const PERMANENT_BAN = "876000h";

/** Rows this user authored that would be orphaned or blocked by a hard delete. */
async function authoredRowCounts(userId: string) {
  const db = getDb();
  const [[d], [t], [dec], [doc]] = await Promise.all([
    db.select({ n: count() }).from(deals).where(eq(deals.createdBy, userId)),
    db.select({ n: count() }).from(targets).where(eq(targets.createdBy, userId)),
    db.select({ n: count() }).from(decisions).where(eq(decisions.decidedBy, userId)),
    db.select({ n: count() }).from(documents).where(eq(documents.createdBy, userId)),
  ]);
  return { deals: d.n, targets: t.n, decisions: dec.n, documents: doc.n };
}

/** Deactivated accounts are frozen: reactivate first, then change them. */
function requireActive(target: { deactivatedAt: Date | null }) {
  if (target.deactivatedAt) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This account is deactivated. Reactivate it before changing it." });
  }
}

function requireMainAdmin(kind: string) {
  if (kind !== "main_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the main administrator can manage admins.",
    });
  }
}

// Company admins never inherit platform scope, including when unassigned.
function adminUserScope(actor: User) {
  if (actor.userKind === "main_admin") return undefined;
  return actor.organizationId
    ? and(eq(users.organizationId, actor.organizationId), ne(users.userKind, "main_admin"))
    : sql`false`;
}

async function scopedUser(actor: User, userId: string) {
  const [target] = await getDb().select().from(users)
    .where(and(eq(users.id, userId), adminUserScope(actor))).limit(1);
  if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
  return target;
}

// Grant exactly `keys` to a user (replace any existing grants).
async function replaceUserFeatures(userId: string, keys: string[], grantedBy: string) {
  const db = getDb();
  await db.delete(userFeatures).where(eq(userFeatures.userId, userId));
  if (keys.length > 0) {
    await db
      .insert(userFeatures)
      .values(keys.map((feature_key) => ({ userId, featureKey: feature_key, grantedBy })))
      .onConflictDoNothing();
  }
}

export const adminRouter = createRouter({
  // Summary list — identity, kind, org, activity counts. No row-level content.
  listUserSummaries: adminPermQuery("view_user_summaries").query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        userKind: users.userKind,
        adminPermissions: users.adminPermissions,
        mustChangePassword: users.mustChangePassword,
        organizationId: users.organizationId,
        organizationName: organizations.name,
        deactivatedAt: users.deactivatedAt,
        createdAt: users.createdAt,
        lastSignInAt: users.lastSignInAt,
      })
      .from(users)
      .leftJoin(organizations, eq(users.organizationId, organizations.id))
      .where(adminUserScope(ctx.user))
      .orderBy(asc(users.createdAt));

    if (!rows.length) return [];
    const userIds = rows.map((row) => row.id);
    const [featRows, dealCounts, targetCounts, aiCounts] = await Promise.all([
      db.select({ uid: userFeatures.userId, key: userFeatures.featureKey }).from(userFeatures).where(inArray(userFeatures.userId, userIds)),
      db.select({ uid: deals.createdBy, n: count() }).from(deals).where(inArray(deals.createdBy, userIds)).groupBy(deals.createdBy),
      db.select({ uid: targets.createdBy, n: count() }).from(targets).where(inArray(targets.createdBy, userIds)).groupBy(targets.createdBy),
      db
        .select({ uid: activityLog.userId, n: count() })
        .from(activityLog)
        .where(and(eq(activityLog.type, "ai"), inArray(activityLog.userId, userIds)))
        .groupBy(activityLog.userId),
    ]);

    const featMap = new Map<string, string[]>();
    for (const r of featRows) {
      if (!r.uid) continue;
      const arr = featMap.get(r.uid) ?? [];
      arr.push(r.key);
      featMap.set(r.uid, arr);
    }
    const toMap = (list: { uid: string | null; n: number }[]) => {
      const m = new Map<string, number>();
      for (const r of list) if (r.uid) m.set(r.uid, r.n);
      return m;
    };
    const dealMap = toMap(dealCounts);
    const targetMap = toMap(targetCounts);
    const aiMap = toMap(aiCounts);

    return rows.map((u) => ({
      ...u,
      features: featMap.get(u.id) ?? [],
      dealCount: dealMap.get(u.id) ?? 0,
      targetCount: targetMap.get(u.id) ?? 0,
      aiRunCount: aiMap.get(u.id) ?? 0,
    }));
  }),

  // Full detail incl. deal/target names. Default: only main_admin holds
  // view_user_details, so plain admins can't read others' deal content.
  getUserDetail: adminPermQuery("view_user_details")
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const user = await scopedUser(ctx.user, input.userId);
      const db = getDb();
      const [featRows, dealRows, targetRows] = await Promise.all([
        db
          .select({ key: userFeatures.featureKey })
          .from(userFeatures)
          .where(eq(userFeatures.userId, input.userId)),
        db
          .select({ id: deals.id, name: deals.name, stage: deals.stage })
          .from(deals)
          .where(eq(deals.createdBy, input.userId))
          .orderBy(asc(deals.createdAt)),
        db
          .select({ id: targets.id, name: targets.name, sector: targets.sector })
          .from(targets)
          .where(eq(targets.createdBy, input.userId))
          .orderBy(asc(targets.createdAt)),
      ]);
      return {
        user,
        features: featRows.map((r) => r.key),
        deals: dealRows,
        targets: targetRows,
      };
    }),

  listOrganizations: adminQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db.select().from(organizations).where(ctx.user.userKind === "main_admin"
      ? undefined
      : ctx.user.organizationId ? eq(organizations.id, ctx.user.organizationId) : sql`false`).orderBy(asc(organizations.name));
  }),

  createUser: adminQuery
    .input(
      z.object({
        name: z.string().min(1).max(200),
        email: z.string().email(),
        password: z.string().min(12).max(200).optional(),
        role: RoleSchema,
        // Exactly one of: join an existing organisation by id, or create a new
        // one by name. A name is never matched against existing organisations —
        // that would let a typo (or a guess) join another firm's tenant.
        organizationId: z.string().uuid().optional().nullable(),
        organizationName: z.string().trim().min(1).max(200).optional().nullable(),
        isAdmin: z.boolean().default(false),
        sendInvite: z.boolean().default(true),
        features: z.array(FeatureKeySchema).default([]),
      })
      .refine((v) => !(v.organizationId && v.organizationName), {
        message: "Choose an existing organisation or name a new one, not both.",
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Creating an admin is a main_admin-only action; creating members needs
      // manage_users (main_admin bypasses via the permission check below).
      if (input.isAdmin) requireMainAdmin(ctx.user.userKind);
      if (
        ctx.user.userKind !== "main_admin" &&
        !ctx.user.adminPermissions?.manage_users
      ) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can't create users." });
      }

      if (ctx.user.userKind !== "main_admin") {
        if (!ctx.user.organizationId || input.organizationName ||
            (input.organizationId && input.organizationId !== ctx.user.organizationId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You can create members only in your own company." });
        }
      }
      const result = await provisionUser({
        name: input.name,
        email: input.email,
        role: input.role,
        organizationId: ctx.user.userKind === "main_admin" ? input.organizationId ?? null : ctx.user.organizationId,
        organizationName: input.organizationName ?? null,
        isAdmin: input.isAdmin,
        sendInvite: input.sendInvite,
        password: input.password,
        features: input.isAdmin ? [] : input.features,
        origin: requestOrigin(ctx.req),
        grantedBy: ctx.user.id,
      });

      logActivity(ctx.user, {
        type: "admin",
        action: input.isAdmin ? "Admin created" : "Member created",
        detail: input.email,
      });
      return result;
    }),

  // Promote/demote between member and admin. main_admin only.
  setUserKind: adminQuery
    .input(z.object({ userId: z.string().uuid(), kind: z.enum(["admin", "member"]) }))
    .mutation(async ({ ctx, input }) => {
      requireMainAdmin(ctx.user.userKind);
      const db = getDb();
      const target = await scopedUser(ctx.user, input.userId);
      requireActive(target);
      if (target.userKind === "main_admin") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The main administrator cannot be changed." });
      }
      await db
        .update(users)
        .set({
          userKind: input.kind,
          isAdmin: input.kind === "admin",
          // Demoting an admin clears their permission checklist.
          ...(input.kind === "member" ? { adminPermissions: {} } : {}),
        })
        .where(eq(users.id, input.userId));
      logActivity(ctx.user, {
        type: "admin",
        action: input.kind === "admin" ? "Promoted to admin" : "Demoted to member",
        detail: target.email ?? input.userId,
      });
      return { success: true };
    }),

  // Set a member's feature grants. Requires manage_features.
  setUserFeatures: adminPermQuery("manage_features")
    .input(z.object({ userId: z.string().uuid(), features: z.array(FeatureKeySchema) }))
    .mutation(async ({ ctx, input }) => {
      const target = await scopedUser(ctx.user, input.userId);
      requireActive(target);
      if (target.userKind !== "member") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only members hold product features.",
        });
      }
      await replaceUserFeatures(input.userId, input.features, ctx.user.id);
      logActivity(ctx.user, {
        type: "admin",
        action: "Features updated",
        detail: `${target.email} · ${input.features.length} feature(s)`,
      });
      return { success: true };
    }),

  // Set a plain admin's permission checklist. main_admin only. Accepts a
  // partial map; unknown keys are ignored and only known flags are stored.
  setAdminPermissions: adminQuery
    .input(
      z.object({
        userId: z.string().uuid(),
        permissions: z.record(z.string(), z.boolean()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireMainAdmin(ctx.user.userKind);
      const db = getDb();
      const target = await scopedUser(ctx.user, input.userId);
      if (target.userKind !== "admin") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Permissions apply to admin accounts only.",
        });
      }
      requireActive(target);
      const clean: Record<string, boolean> = {};
      for (const k of ADMIN_PERMISSION_KEYS) {
        if (typeof input.permissions[k] === "boolean") clean[k] = input.permissions[k];
      }
      await db
        .update(users)
        .set({ adminPermissions: clean })
        .where(eq(users.id, input.userId));
      logActivity(ctx.user, {
        type: "admin",
        action: "Admin permissions updated",
        detail: target.email ?? input.userId,
      });
      return { success: true };
    }),

  resetPassword: adminPermQuery("manage_users")
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const target = await scopedUser(ctx.user, input.userId);
      requireActive(target);
      if (target.userKind !== "member" && ctx.user.userKind !== "main_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the main administrator can reset an administrator's password.",
        });
      }
      const admin = adminClient();
      const temporaryPassword = generateTempPassword();
      const { error } = await admin.auth.admin.updateUserById(input.userId, {
        password: temporaryPassword,
      });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      await db
        .update(users)
        .set({ mustChangePassword: true })
        .where(eq(users.id, input.userId));
      if (target.email) await revokeSessionsWithPassword(target.email, temporaryPassword);
      logActivity(ctx.user, { type: "admin", action: "Password reset", detail: target.email ?? input.userId });
      return { temporaryPassword };
    }),

  // Offboarding. An account that authored nothing is hard-deleted. An account
  // that recorded decisions, created deals/targets or uploaded documents is
  // DEACTIVATED instead: sign-in is banned at GoTrue, every session is revoked,
  // feature grants are removed and `deactivated_at` is set (authenticateRequest
  // refuses the account from then on). The rows it authored stay attributed and
  // reachable by the organisation — decisions are an audit record and carry a
  // FOREIGN KEY to users, so a hard delete would be refused by the database
  // anyway; this turns that refusal into a deliberate, reversible outcome.
  removeUser: adminPermQuery("manage_users")
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot delete your own account." });
      }
      const db = getDb();
      const target = await scopedUser(ctx.user, input.userId);
      if (target.userKind === "main_admin") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The main administrator cannot be deleted." });
      }
      if (target.userKind === "admin") requireMainAdmin(ctx.user.userKind);
      const admin = adminClient();
      const authored = await authoredRowCounts(input.userId);
      const total = authored.deals + authored.targets + authored.decisions + authored.documents;

      if (total > 0) {
        // Order matters across two systems. The application flag goes first:
        // once `deactivated_at` is set, authenticateRequest refuses the account
        // whatever GoTrue does, so every later step can fail and the account is
        // still closed. Sessions are revoked next so open tabs stop immediately,
        // and the identity-provider ban last — if it fails, the admin is told and
        // a retry re-runs the (idempotent) sequence.
        await db.transaction(async (tx) => {
          await tx.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, input.userId));
          await tx.delete(userFeatures).where(eq(userFeatures.userId, input.userId));
        });
        await db.execute(sql`delete from auth.sessions where user_id = ${input.userId}::uuid`);
        const { error } = await admin.auth.admin.updateUserById(input.userId, { ban_duration: PERMANENT_BAN });
        if (error) {
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message: "The account is deactivated in Ansyra and its sessions are revoked, but sign-in could not be blocked at the identity provider. Retry to complete the block.",
          });
        }
        logActivity(ctx.user, {
          type: "admin",
          action: "User deactivated",
          detail: `${target.email ?? input.userId} · ${authored.deals} deal(s), ${authored.decisions} decision(s) retained`,
        });
        return { success: true, mode: "deactivated" as const, retained: authored };
      }

      const { error } = await admin.auth.admin.deleteUser(input.userId);
      if (error && !/not.*found/i.test(error.message)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The account could not be deleted. Nothing was changed." });
      }
      await db.delete(users).where(eq(users.id, input.userId));
      logActivity(ctx.user, { type: "admin", action: "User deleted", detail: target.email ?? input.userId });
      return { success: true, mode: "deleted" as const, retained: authored };
    }),

  reactivateUser: adminPermQuery("manage_users")
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const target = await scopedUser(ctx.user, input.userId);
      if (!target.deactivatedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "This account is already active." });
      if (target.userKind !== "member") requireMainAdmin(ctx.user.userKind);
      const { error } = await adminClient().auth.admin.updateUserById(input.userId, { ban_duration: "none" });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: "Sign-in could not be re-enabled for this account." });
      await db.update(users).set({ deactivatedAt: null }).where(eq(users.id, input.userId));
      logActivity(ctx.user, { type: "admin", action: "User reactivated", detail: target.email ?? input.userId });
      return { success: true };
    }),
});
