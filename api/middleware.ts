import { requestFeatures } from "./lib/request-feature-cache";
import { ErrorMessages, type FeatureKey, type AdminPermission } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { TrpcContext } from "./context";
import { assertAccountReady, assertMutationOrigin } from "./lib/request-security";
import { env } from "./lib/env";
import { captureServerException } from "./lib/sentry";
import { enforceRateLimit } from "./lib/rate-limit";
import { getDb } from "./queries/connection";
import { userFeatures } from "@db/schema";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // Unexpected (non-TRPCError) failures go to error reporting when enabled.
    if (error.code === "INTERNAL_SERVER_ERROR") {
      captureServerException(error.cause ?? error);
    }
    if (!env.isProduction) return shape;
    // Never leak stack traces or internal error text in prod responses.
    // Copy-then-delete rather than a destructured omit, which needs a binding
    // that is by definition never read.
    const dataWithoutStack = { ...(shape.data as Record<string, unknown>) };
    delete dataWithoutStack.stack;
    const isUnexpected = error.code === "INTERNAL_SERVER_ERROR";
    return {
      ...shape,
      message: isUnexpected ? "Something went wrong." : shape.message,
      data: dataWithoutStack,
    };
  },
});

export const createRouter = t.router;
const securedProcedure = t.procedure.use(async ({ ctx, type, path, next }) => {
  if (type === "mutation") assertMutationOrigin(ctx.req, env.siteUrl, env.isProduction);
  assertAccountReady(ctx.user, path);
  return next();
});
export const publicQuery = securedProcedure;

// ── Base auth ────────────────────────────────────────────────────────────────
const requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: ErrorMessages.unauthenticated });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// ── Role helpers ─────────────────────────────────────────────────────────────
function isAdminKind(kind: string): boolean {
  return kind === "admin" || kind === "main_admin";
}

// Members are the only kind allowed to touch product features. Admins (of any
// kind) are blocked by owner decision — they run a separate member account for
// deal work.
const requireMember = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: ErrorMessages.unauthenticated });
  }
  if (ctx.user.userKind !== "member") {
    throw new TRPCError({ code: "FORBIDDEN", message: ErrorMessages.adminNoProduct });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

async function loadUserFeatures(userId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ k: userFeatures.featureKey })
    .from(userFeatures)
    .where(eq(userFeatures.userId, userId));
  return new Set(rows.map(row => row.k));
}

// Gate a product route behind a specific feature grant. Assumes requireMember
// ran first (so ctx.user is a member); still guards defensively.
function requireFeature(key: FeatureKey) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: ErrorMessages.unauthenticated });
    }
    const grants = opts.type === "query"
      ? await requestFeatures(ctx.req, ctx.user.id, () => loadUserFeatures(ctx.user!.id))
      : await loadUserFeatures(ctx.user.id);
    if (!grants.has(key)) {
      throw new TRPCError({ code: "FORBIDDEN", message: ErrorMessages.featureLocked });
    }
    return next();
  });
}

// ── Admin ────────────────────────────────────────────────────────────────────
const requireAdmin = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: ErrorMessages.unauthenticated });
  }
  if (!isAdminKind(ctx.user.userKind)) {
    throw new TRPCError({ code: "FORBIDDEN", message: ErrorMessages.insufficientRole });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// A specific admin capability. main_admin implicitly has every permission; a
// plain admin needs the checklist flag set true in users.admin_permissions.
function requirePerm(perm: AdminPermission) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: ErrorMessages.unauthenticated });
    }
    if (ctx.user.userKind !== "main_admin" &&
        (perm === "manage_access_requests" || !ctx.user.adminPermissions?.[perm])) {
      throw new TRPCError({ code: "FORBIDDEN", message: ErrorMessages.insufficientRole });
    }
    return next();
  });
}

// ── AI rate limiting ─────────────────────────────────────────────────────────
// Protects the (free-tier) AI quota from a runaway client or an abusive user.
const AI_LIMIT = env.aiUserMinuteLimit; // calls
const AI_WINDOW_MS = 60_000; // per minute

// Identical AI requests that are still running are refused rather than run
// twice: a double-click on "Stress-test" before the first answer lands would
// otherwise spend two model calls and persist two rows. Keyed on the caller,
// the procedure and the exact input; per-process, which is the topology here.
const inflightAI = new Set<string>();

const rateLimitAI = t.middleware(async (opts) => {
  const { ctx, next, path } = opts;
  const key = ctx.user?.id ?? "anon";
  const raw = await opts.getRawInput();
  const dedupeKey = createHash("sha256").update(`${key}:${path}:${JSON.stringify(raw ?? null)}`).digest("hex");
  if (inflightAI.has(dedupeKey)) {
    throw new TRPCError({ code: "CONFLICT", message: "That analysis is already running. Wait for it to finish before starting it again." });
  }
  inflightAI.add(dedupeKey);
  try {
    await enforceRateLimit("ai", key, AI_LIMIT, AI_WINDOW_MS, "AI rate limit reached — try again in a minute.");
    await enforceRateLimit("ai-user-day", key, env.aiUserDayLimit, 86_400_000, "Your included AI request allowance is used for this 24-hour window. Existing records remain available.");
    await enforceRateLimit("ai-platform-minute", "platform", env.aiPlatformMinuteLimit, AI_WINDOW_MS, "AI analysis is busy across the workspace. Please try again shortly.");
    await enforceRateLimit("ai-platform-day", "platform", env.aiPlatformDayLimit, 86_400_000, "The portfolio's shared live-AI allowance is used for this 24-hour window. Existing records remain available.");
    return await next();
  } finally {
    inflightAI.delete(dedupeKey);
  }
});

// ── Procedure tiers ──────────────────────────────────────────────────────────
// Any authenticated user regardless of kind — for identity/session routes
// (me, logout, changePassword) that admins also need.
export const authedQuery = securedProcedure.use(requireAuth);

// Member-only, no specific feature (e.g. the cross-cutting copilot).
export const memberQuery = securedProcedure.use(requireMember);
export const aiMemberQuery = securedProcedure.use(requireMember).use(rateLimitAI);

// Member + a specific feature grant. `aiFeatureQuery` adds the AI rate limit.
export const featureQuery = (key: FeatureKey) =>
  securedProcedure.use(requireMember).use(requireFeature(key));
export const aiFeatureQuery = (key: FeatureKey) =>
  securedProcedure.use(requireMember).use(requireFeature(key)).use(rateLimitAI);

// Admin console. `adminPermQuery` additionally checks a specific capability.
export const adminQuery = securedProcedure.use(requireAdmin);
export const adminPermQuery = (perm: AdminPermission) =>
  securedProcedure.use(requireAdmin).use(requirePerm(perm));
