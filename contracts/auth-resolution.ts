// ─────────────────────────────────────────────────────────────────────────────
// When to stop waiting for `auth.me` (Phase 15.14).
//
// The session gate had no lower bound on patience. If the `auth.me` query never
// SETTLED — no data, no error — `useAuth` reported `isLoading: true` forever and
// every guarded page sat on its loading screen indefinitely. Reproduced live on
// an unauthenticated `/dashboard`: the server answered a clean 401, but the
// client query wedged at `status: "pending" / fetchStatus: "paused"` and never
// recorded the error, so the redirect that reads "authoritatively
// unauthenticated" never had anything to fire on.
//
// ROOT CAUSE of that wedge, read out of query-core 5.101.2 (retryer.ts) and
// then proven live:
//
//   const canContinue = () =>
//     focusManager.isFocused() && (networkMode === "always" || onlineManager.isOnline()) && canRun()
//   ...
//   sleep(delay).then(() => canContinue() ? undefined : pause())
//
// and `focusManager.isFocused()` is `document.visibilityState !== "hidden"`.
//
// So: auth.me 401s → retry is scheduled → after the backoff the document is
// HIDDEN → `pause()` → `fetchStatus: "paused"`, parked until a visibilitychange
// resumes it. That is deliberate, correct library behaviour, and it self-heals
// the moment the tab is looked at — verified by calling `focusManager.setFocused(true)`
// on a wedged query and watching it go straight to `error / UNAUTHORIZED`.
//
// Which is exactly why the timeout below is measured in VISIBLE time only. A
// user who cmd-clicks the dashboard into a background tab must come back to
// their dashboard, not to a login screen this timer sent them to while they
// were not looking. Spending patience on a hidden tab would convert a paused
// retry — a thing the library is handling correctly — into a spurious logout.
//
// The escape hatch here is deliberately about NOT KNOWING, and is kept separate
// from the server having said no:
//
//   rejected   — auth.me returned 401/403. A fact. Route to login.
//   unresolved — auth.me never answered at all. Not a fact about the session,
//                only about our patience. Route to login so the user can act,
//                but never treat it as proof they are logged out.
//
// THE STICKY-AUTH RULE SURVIVES THIS, and that is the whole point of the
// `hasRememberedUser` clause: a user whose session has already resolved once is
// NEVER given up on, no matter how long a later refetch stalls. Timing out on
// them would be exactly the "transient failure logs everyone out" regression
// the sticky ref exists to prevent. This only fires on a cold start that never
// completed — where there is no session to protect and the alternative is an
// infinite spinner.
//
// Pure. Unit-tested in contracts/auth-resolution.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How long to wait for a first answer before routing to login.
 *
 * Sized against the query's own behaviour rather than a feel: `auth.me` retries
 * once on a NETWORK failure (see `shouldRetryQuery`), so a genuinely
 * slow-but-working cold start is two round trips plus a backoff. It was eight
 * seconds; it is now twenty, because the production host may have spun the
 * service down and a cold boot re-runs the deployment gates (an Auth settings
 * fetch, a TLS-verified database connection and two catalogue queries) before
 * the first request is answered. Bouncing a returning user to /login because
 * the server was still waking up is exactly the spurious redirect this timer
 * exists to avoid — twenty seconds is still far short of "this page is broken".
 *
 * Unaffected by the retry narrowing below: the path this timer is sized for is
 * the one that still retries. An authoritative rejection settles on the first
 * answer and never reaches the clock at all.
 */
export const AUTH_SETTLE_TIMEOUT_MS = 20_000;

// ─────────────────────────────────────────────────────────────────────────────
// WHETHER TO ASK AGAIN AFTER A FAILURE.
//
// Every query in the app ran with `retry: 1`, which is right for the failure it
// was written for — a dropped connection, a cold pooler, a transient 500 — and
// wrong for the commonest failure the app actually produces. `auth.me` is
// called on EVERY anonymous landing visit to decide whether one nav link reads
// "Dashboard" or "Request Access", and for an anonymous visitor it 401s. With a
// blanket retry that is two 401s per visit, on 100% of first-time traffic.
//
// Retrying an authoritative rejection cannot succeed. Nothing about the request
// changes between the two attempts — same origin, same absent cookie, same
// verdict — so the second call is guaranteed to receive the first call's answer
// again. It is not a second chance, it is an echo, and it costs a round trip
// plus a backoff before the CTA is allowed to resolve.
//
// So the retry narrows to what a retry is FOR: not knowing. A 401/403 is the
// server having answered. Anything else — a network error, a 500, a timeout —
// still gets its one retry, because those genuinely may differ on a second ask.
//
// This mirrors the distinction `useAuth` already draws between
// `explicitAuthFailure` and `isUnresolved`, and the one this file's header
// draws between "rejected" and "unresolved". The same two codes are
// authoritative in all three places, which is why they are named here once.
//
// CONSIDERED AND DECLINED: not asking at all. The landing could skip the query
// outright if it could see that no session exists — but the session cookie is
// `HttpOnly` by design, so the client cannot read it, and the only way to give
// it a readable signal is a second, non-HttpOnly "hint" cookie set alongside
// the real one. That buys the last request at the cost of a state that can
// disagree with the session it describes, and it disagrees WRONGLY in the
// direction that matters: every session minted before such a cookie shipped
// carries no hint, so every already-signed-in reader would be shown "Request
// Access" on the landing until they signed in again. One expected 401 for an
// anonymous visitor is a normal auth probe; a signed-in user told to request
// access is a bug. Revisit only with a migration story for live sessions.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * tRPC error codes that mean THE SERVER ANSWERED AND THE ANSWER IS NO.
 *
 * Kept as the single list so `useAuth`'s `explicitAuthFailure` and the retry
 * policy cannot drift into disagreeing about what counts as a verdict.
 */
export const AUTHORITATIVE_AUTH_CODES = ["UNAUTHORIZED", "FORBIDDEN"] as const;

/**
 * Did the server reject us, as opposed to failing to answer?
 *
 * Takes `unknown` rather than `string | undefined` on purpose. The two callers
 * reach the code by different routes and NEITHER can promise a string:
 * `useAuth` reads `query.error.data?.code`, which tRPC types as `unknown`, and
 * the retry adapter digs it out of an error that may be a `TypeError` with no
 * `data` at all. Narrowing here keeps the check in one place instead of making
 * each caller cast — and a cast is exactly how a non-string code would get
 * waved through as a rejection.
 */
export function isAuthoritativeRejection(errorCode: unknown): boolean {
  return (
    typeof errorCode === "string" &&
    (AUTHORITATIVE_AUTH_CODES as readonly string[]).includes(errorCode)
  );
}

/** One retry, for failures that might actually differ on a second ask. */
export const QUERY_RETRY_LIMIT = 1;

/**
 * Should a failed query be attempted again?
 *
 * @param failureCount query-core's own counter, and note that it is **0 on the
 *                     first failure** — retryer.js checks `retry(failureCount,
 *                     error)` and increments afterwards. So `failureCount <
 *                     QUERY_RETRY_LIMIT` is exactly equivalent to the numeric
 *                     `retry: QUERY_RETRY_LIMIT` it replaces. Reading it as
 *                     1-based silently halves the retries and the tests are the
 *                     only thing that catches it.
 * @param errorCode    the tRPC error code, or undefined for anything without
 *                     one (a network error, an HTML error page, an abort).
 */
export function shouldRetryQuery(failureCount: number, errorCode: unknown): boolean {
  if (isAuthoritativeRejection(errorCode)) return false;
  return failureCount < QUERY_RETRY_LIMIT;
}

export interface AuthWaitInput {
  /** The query produced data OR an error — we have an answer either way. */
  settled: boolean;
  /** A previous `auth.me` has resolved during this session. */
  hasRememberedUser: boolean;
  /** AUTH_SETTLE_TIMEOUT_MS has elapsed without settling. */
  timerElapsed: boolean;
}

/**
 * Should the app stop waiting and send an unresolved visitor to login?
 *
 * Three guards, in the order that matters:
 *   1. Settled — we have an answer; this predicate has no opinion.
 *   2. Remembered user — sticky auth wins, always. Never time out a session
 *      that has already resolved once.
 *   3. Otherwise, only once the clock has actually run out.
 */
export function shouldGiveUpWaiting(input: AuthWaitInput): boolean {
  if (input.settled) return false;
  if (input.hasRememberedUser) return false;
  return input.timerElapsed;
}

/**
 * Should the give-up clock be running right now?
 *
 * Only while the document is VISIBLE. query-core parks a retry whenever
 * `focusManager.isFocused()` is false — i.e. `document.visibilityState ===
 * "hidden"` — and resumes it on the next visibilitychange. Counting down
 * against a paused-by-design retry would send a background tab to login and
 * greet the returning user with a sign-in form instead of their dashboard.
 *
 * The consequence, stated so nobody "simplifies" it away: the eight seconds are
 * eight seconds of someone actually looking at the page.
 */
export function shouldArmGiveUpTimer(input: {
  settled: boolean;
  documentHidden: boolean;
}): boolean {
  if (input.settled) return false;
  if (input.documentHidden) return false;
  return true;
}
