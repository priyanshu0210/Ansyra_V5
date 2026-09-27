import { describe, it, expect } from "vitest";
import {
  AUTH_SETTLE_TIMEOUT_MS,
  AUTHORITATIVE_AUTH_CODES,
  QUERY_RETRY_LIMIT,
  isAuthoritativeRejection,
  shouldArmGiveUpTimer,
  shouldGiveUpWaiting,
  shouldRetryQuery,
} from "./auth-resolution";

describe("shouldGiveUpWaiting", () => {
  it("waits while the clock is still running", () => {
    expect(
      shouldGiveUpWaiting({ settled: false, hasRememberedUser: false, timerElapsed: false }),
    ).toBe(false);
  });

  it("gives up on a cold start that never answered", () => {
    // The reproduced bug: auth.me wedged unsettled, so the app sat on its
    // loading screen with nothing to route on.
    expect(
      shouldGiveUpWaiting({ settled: false, hasRememberedUser: false, timerElapsed: true }),
    ).toBe(true);
  });

  it("has no opinion once the query settles", () => {
    // Settled means we have an answer — data or error. Whatever it says, this
    // predicate must not also be voting.
    for (const timerElapsed of [false, true]) {
      for (const hasRememberedUser of [false, true]) {
        expect(
          shouldGiveUpWaiting({ settled: true, hasRememberedUser, timerElapsed }),
          `settled must win (timerElapsed=${timerElapsed}, remembered=${hasRememberedUser})`,
        ).toBe(false);
      }
    }
  });

  it("NEVER gives up on a user whose session already resolved", () => {
    // The sticky-auth guarantee, stated as a test. A stalled refetch mid-session
    // must not log anyone out — that is precisely the regression the remembered
    // ref exists to prevent, and a timeout is the easiest way to reintroduce it.
    expect(
      shouldGiveUpWaiting({ settled: false, hasRememberedUser: true, timerElapsed: true }),
    ).toBe(false);
  });

  it("is a real bound, not a disabled one", () => {
    // A zero or absurd timeout would make this either trigger-happy or useless.
    expect(AUTH_SETTLE_TIMEOUT_MS).toBeGreaterThanOrEqual(3_000);
    expect(AUTH_SETTLE_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});

describe("shouldArmGiveUpTimer", () => {
  it("runs the clock while the page is visible and unsettled", () => {
    expect(shouldArmGiveUpTimer({ settled: false, documentHidden: false })).toBe(true);
  });

  it("NEVER runs the clock on a hidden tab", () => {
    // query-core parks a retry whenever focusManager.isFocused() is false —
    // that is `document.visibilityState === "hidden"` — and resumes it on the
    // next visibilitychange. Counting down against that would send a
    // background tab to login and greet the returning user with a sign-in form
    // instead of the dashboard they opened. Proven live: setFocused(true) took
    // a wedged query straight to error/UNAUTHORIZED.
    expect(shouldArmGiveUpTimer({ settled: false, documentHidden: true })).toBe(false);
  });

  it("stops once the query settles, visible or not", () => {
    for (const documentHidden of [false, true]) {
      expect(shouldArmGiveUpTimer({ settled: true, documentHidden })).toBe(false);
    }
  });
});

describe("shouldRetryQuery", () => {
  it("retries once when we simply did not get an answer", () => {
    // A dropped connection, a cold pooler, a 500. `undefined` is the code for
    // everything that never reached tRPC's error shape at all.
    //
    // ZERO, not one: query-core calls `retry(failureCount, error)` and
    // increments failureCount AFTER the check, so the first failure asks with
    // 0. Writing this test with 1 is how you ship a policy that retries nothing
    // while reading as if it retries once.
    expect(shouldRetryQuery(0, undefined)).toBe(true);
  });

  it("gives up after that one retry", () => {
    expect(shouldRetryQuery(QUERY_RETRY_LIMIT, undefined)).toBe(false);
    expect(shouldRetryQuery(5, undefined)).toBe(false);
  });

  it("is exactly equivalent to the numeric `retry: 1` it replaces", () => {
    // The equivalence that makes this a narrowing rather than a behaviour
    // change for everything that is not an auth rejection.
    for (const failureCount of [0, 1, 2, 3]) {
      expect(shouldRetryQuery(failureCount, undefined), `n=${failureCount}`).toBe(
        failureCount < QUERY_RETRY_LIMIT,
      );
    }
  });

  it("NEVER retries a 401 — the landing's two-request bug, as a test", () => {
    // `auth.me` is called on every anonymous landing visit to decide whether one
    // nav link reads "Dashboard" or "Request Access", and for an anonymous
    // visitor it 401s. A blanket retry made that two 401s per visit, on 100% of
    // first-time traffic, and the second could not have answered differently:
    // same origin, same absent cookie, same verdict.
    expect(shouldRetryQuery(0, "UNAUTHORIZED")).toBe(false);
  });

  it("NEVER retries a 403", () => {
    // authenticateRequest throws FORBIDDEN for a malformed session cookie.
    // Equally final, and equally pointless to ask twice.
    expect(shouldRetryQuery(0, "FORBIDDEN")).toBe(false);
  });

  it("refuses an authoritative rejection at every failure count", () => {
    // Guards the ordering inside the predicate: the code check must come BEFORE
    // the counter, or failureCount 0 would sneak a retry past it.
    for (const code of AUTHORITATIVE_AUTH_CODES) {
      for (const failureCount of [0, 1, 2, 99]) {
        expect(shouldRetryQuery(failureCount, code), `${code} @ ${failureCount}`).toBe(false);
      }
    }
  });

  it("still retries error codes that are not a verdict on the session", () => {
    // The distinction is authority, not severity. INTERNAL_SERVER_ERROR and
    // TIMEOUT may genuinely differ on a second ask; a rejection cannot.
    for (const code of ["INTERNAL_SERVER_ERROR", "TIMEOUT", "TOO_MANY_REQUESTS", "BAD_REQUEST"]) {
      expect(shouldRetryQuery(0, code), code).toBe(true);
    }
  });
});

describe("isAuthoritativeRejection", () => {
  it("is the same list useAuth calls an explicit auth failure", () => {
    // If these two ever disagree, the app reaches a state where the session is
    // reported as rejected while the query is still asking about it.
    expect(AUTHORITATIVE_AUTH_CODES).toEqual(["UNAUTHORIZED", "FORBIDDEN"]);
  });

  it("treats a missing code as not-a-rejection", () => {
    // A network error has no code, and must retry rather than be read as a
    // logout.
    expect(isAuthoritativeRejection(undefined)).toBe(false);
    expect(isAuthoritativeRejection(null)).toBe(false);
    expect(isAuthoritativeRejection("")).toBe(false);
  });
});
