// ─────────────────────────────────────────────────────────────────────────────
// A REAL session cookie, obtained by logging in the way a browser does.
//
// The tRPC caller harness fabricates `ctx.user` directly, which is right for
// testing procedures — it isolates the thing under test from the login flow.
// But the CSV export is a plain Hono route that calls `authenticateRequest`
// itself, so it needs the genuine article: a signed Supabase session in the
// cookie the app actually issues.
//
// This logs in through the real `auth.login` procedure and lifts the Set-Cookie
// header off the response, so what the export route receives is byte-for-byte
// what a browser would send.
// ─────────────────────────────────────────────────────────────────────────────
import { appRouter } from "../../api/router";
import { passwordFor } from "@fixtures/thornevale/credentials";
import { SEED_USERS } from "@fixtures/thornevale/ids";

const cache = new Map<string, string>();

/**
 * The `Cookie` header value for a seeded account.
 *
 * Cached per email: the login limiter is 5 attempts per minute per IP+email and
 * a suite that logs in on every assertion trips it, then fails with a timeout
 * that looks nothing like a rate limit.
 */
export async function sessionCookieFor(email: string): Promise<string> {
  const hit = cache.get(email);
  if (hit) return hit;

  const user = SEED_USERS.find((u) => u.email === email);
  if (!user) throw new Error(`No seeded user "${email}"`);

  const resHeaders = new Headers();
  const caller = appRouter.createCaller({
    req: new Request("http://localhost:3000/api/trpc"),
    resHeaders,
    user: undefined,
  });
  await caller.auth.login({ email, password: passwordFor(user) });

  const setCookie = resHeaders.get("set-cookie");
  if (!setCookie) throw new Error(`auth.login issued no session cookie for ${email}`);

  // `Set-Cookie` carries attributes (Path, HttpOnly, SameSite…); a `Cookie`
  // request header carries only the name=value pair.
  const cookie = setCookie.split(";")[0];
  cache.set(email, cookie);
  return cookie;
}
