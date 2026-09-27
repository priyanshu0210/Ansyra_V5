// ─────────────────────────────────────────────────────────────────────────────
// A real tRPC caller, against the real database, as a real seeded user.
//
// This is the piece the repo has never had. Until now every "api" test read the
// router SOURCE with readFileSync and asserted regexes against it — which can
// prove a call site EXISTS but never that it is CORRECT. `ownerScope`, the one
// definition of the multi-tenancy read rule, was covered only by
// `expect(source).toMatch(/ownerScope\(/)`.
//
// `appRouter.createCaller(ctx)` runs the genuine article: every middleware
// (member kind, feature grant, rate limit), every `assertDealAccess`, every
// query, against Postgres. No HTTP, no cookie forging, no mocking.
//
// The context shape is exactly what api/context.ts builds — a Request, response
// headers, and an optional user row — so nothing here is a stand-in for the
// real thing.
// ─────────────────────────────────────────────────────────────────────────────
import { appRouter } from "../../api/router";
import type { TrpcContext } from "../../api/context";
import { getDb } from "../../api/queries/connection";
import { users, type User } from "@db/schema";
import { eq } from "drizzle-orm";

export type Caller = ReturnType<typeof appRouter.createCaller>;

function contextFor(user: User | undefined): TrpcContext {
  return {
    // The routers only ever read headers off this; a plain Request is enough
    // and keeps the harness free of an HTTP server.
    req: new Request("http://localhost:3000/api/trpc"),
    resHeaders: new Headers(),
    user,
  };
}

const cache = new Map<string, User>();

/** Load a seeded user by email. Cached — every test file resolves the same
 *  three or four users and each lookup is a round trip to Supabase. */
export async function userByEmail(email: string): Promise<User> {
  const hit = cache.get(email);
  if (hit) return hit;
  const [row] = await getDb().select().from(users).where(eq(users.email, email)).limit(1);
  if (!row) {
    throw new Error(
      `No user "${email}". Run \`npm run seed:thornevale\` before the DB-backed suites.`,
    );
  }
  cache.set(email, row);
  return row;
}

/** A caller acting as the given seeded user. */
export async function callerFor(email: string): Promise<Caller> {
  return appRouter.createCaller(contextFor(await userByEmail(email)));
}

/** A caller with no session at all — for proving the UNAUTHORIZED wall. */
export function anonCaller(): Caller {
  return appRouter.createCaller(contextFor(undefined));
}

/**
 * Run `fn` and return the TRPCError code it threw, or "NO_ERROR".
 *
 * Returning the code rather than asserting inside a helper keeps the assertion
 * in the test where it can be read, and avoids the failure mode where a helper
 * that expects a throw quietly passes because nothing threw at all.
 */
export async function errorCodeFrom(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "NO_ERROR";
  } catch (e) {
    const code = (e as { code?: string })?.code;
    return typeof code === "string" ? code : `UNEXPECTED:${(e as Error).message}`;
  }
}

/** The message of the TRPCError `fn` threw, or "" if it did not throw. */
export async function errorMessageFrom(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "";
  } catch (e) {
    return (e as Error).message ?? "";
  }
}
