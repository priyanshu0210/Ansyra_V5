import * as cookie from "cookie";
import { anonClient } from "../lib/supabase-clients";
import { assertActiveSession } from "../lib/active-session";
import { env } from "../lib/env";
import { Errors } from "@contracts/errors";
import { decodeSession, encodeSession, type SessionPayload } from "../lib/session";
import { getSessionCookieOptions } from "../lib/cookies";
import { findUserById } from "../queries/users";
import type { User } from "@db/schema";

// 30 days — session persists across browser restarts until explicit logout.
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// Concurrent requests carrying a just-expired access token will each try to
// refresh. Supabase invalidates a refresh_token on first use, so the second
// call would legitimately fail — and useAuth on the client would flip to
// "unauthenticated" for a network race, wiping local UI state.
// Dedupe: any refreshes with the same refresh_token share one in-flight promise.
interface RefreshResult {
  access_token: string;
  refresh_token: string;
  expires_at: number | null;
  user_id: string;
}
const inflightRefreshes = new Map<string, Promise<RefreshResult>>();
// Also remember completed refreshes for a short window so late arrivals hit
// the cache instead of the real refresh_token (which is now invalidated).
const recentRefreshes = new Map<string, { at: number; result: RefreshResult }>();
const REFRESH_CACHE_MS = 30_000;

export function getSupabaseCookieName(): string {
  const ref =
    env.supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? "";
  return `sb-${ref}-auth-token`;
}

export function readSessionFromHeaders(headers: Headers): SessionPayload | null {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const raw = cookies[getSupabaseCookieName()];
  return raw ? decodeSession(raw) : null;
}

// Build a Set-Cookie value for the session; used by both signup/login mutations
// and by the auto-refresh path in authenticateRequest().
export function buildSessionSetCookie(
  headers: Headers,
  payload: { access_token: string; refresh_token: string; expires_at?: number | null } | null,
): string {
  const opts = getSessionCookieOptions(headers);
  const cookieName = getSupabaseCookieName();
  if (payload === null) {
    return cookie.serialize(cookieName, "", {
      httpOnly: opts.httpOnly,
      path: opts.path,
      sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
      secure: opts.secure,
      maxAge: 0,
    });
  }
  return cookie.serialize(cookieName, encodeSession(payload), {
    httpOnly: opts.httpOnly,
    path: opts.path,
    sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
    secure: opts.secure,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function authenticateRequest(
  headers: Headers,
  resHeaders?: Headers,
): Promise<User> {
  const session = readSessionFromHeaders(headers);
  if (!session) throw Errors.forbidden("Invalid authentication token.");

  // Token verification and refresh need only the public key; the service-role
  // client is reserved for auth.admin.* calls (api/lib/supabase-clients.ts).
  const supabase = anonClient();

  // Try the current access token first
  let authUserId: string | null = null;
  let verifiedAccessToken = session.access_token;

  const first = await supabase.auth.getUser(session.access_token);
  if (!first.error && first.data.user) {
    authUserId = first.data.user.id;
  } else {
    // Access token expired / invalid — refresh, but dedupe concurrent attempts
    // so a burst of parallel requests doesn't invalidate each other's refresh.
    const rt = session.refresh_token;

    // Short-window cache: hand out the recently-refreshed session to any
    // request that arrives within the cache window with the SAME (now-used)
    // refresh_token.
    const cached = recentRefreshes.get(rt);
    let refreshed: RefreshResult;
    if (cached && Date.now() - cached.at < REFRESH_CACHE_MS) {
      refreshed = cached.result;
    } else {
      let inflight = inflightRefreshes.get(rt);
      if (!inflight) {
        inflight = (async (): Promise<RefreshResult> => {
          // Clean up the in-flight entry inside this function (try/finally) so
          // there is exactly ONE promise with ONE consumer (`await inflight`
          // below). A separate `inflight.finally(...)` chain would be a second,
          // uncaught consumer — when the refresh rejects (an expired/already-
          // rotated refresh token during a concurrent burst), that floating
          // chain re-rejects and crashes the whole process.
          try {
            const r = await supabase.auth.refreshSession({ refresh_token: rt });
            if (r.error || !r.data.session || !r.data.user) {
              throw new Error(r.error?.message || "refresh_failed");
            }
            const out: RefreshResult = {
              access_token: r.data.session.access_token,
              refresh_token: r.data.session.refresh_token,
              expires_at: r.data.session.expires_at ?? null,
              user_id: r.data.user.id,
            };
            recentRefreshes.set(rt, { at: Date.now(), result: out });
            // Best-effort cache eviction
            for (const [k, v] of recentRefreshes) {
              if (Date.now() - v.at > REFRESH_CACHE_MS * 4) recentRefreshes.delete(k);
            }
            return out;
          } finally {
            inflightRefreshes.delete(rt);
          }
        })();
        inflightRefreshes.set(rt, inflight);
      }
      try {
        refreshed = await inflight;
      } catch {
        throw Errors.forbidden("Invalid authentication token.");
      }
    }

    authUserId = refreshed.user_id;
    verifiedAccessToken = refreshed.access_token;

    if (resHeaders) {
      resHeaders.append(
        "set-cookie",
        buildSessionSetCookie(headers, {
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          expires_at: refreshed.expires_at,
        }),
      );
    }
  }

  await assertActiveSession(verifiedAccessToken, authUserId);
  const existing = await findUserById(authUserId);
  if (existing) {
    // Deactivated by an administrator (admin.removeUser on an account that
    // authored records). Sign-in is banned at GoTrue and sessions were revoked,
    // but this check is the one that cannot be raced by a token minted earlier.
    if (existing.deactivatedAt) throw Errors.forbidden("This account has been deactivated.");
    return existing;
  }

  // Supabase authentication and Ansyra authorization are deliberately
  // separate. Only an administrator provisioning flow may create public.users
  // rows and assign organization/role. user_metadata is editable by the user
  // and must never enroll an identity into a tenant.
  throw Errors.forbidden("This account has not been provisioned for Ansyra.");
}
