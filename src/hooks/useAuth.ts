import { trpc } from "@/providers/trpc";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { LOGIN_PATH } from "@/const";
import {
  AUTH_SETTLE_TIMEOUT_MS,
  isAuthoritativeRejection,
  shouldArmGiveUpTimer,
  shouldGiveUpWaiting,
} from "@contracts/auth-resolution";
import { retryQuery } from "@/providers/query-retry";
import { notifyBrowserSignOut } from "@/lib/idle-session";
import { resetTabStores } from "@/lib/tab-stores";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../api/router";

export type AuthUser = inferRouterOutputs<AppRouter>["auth"]["me"];

/**
 * Sticky auth hook.
 * Once a real, successful `auth.me` has ever resolved for this mount, we treat
 * the user as authenticated until an explicit logout — a network hiccup, a
 * transient 500 or a cold start on the pooler MUST NOT flip us to
 * "unauthenticated" and unmount the Dashboard. Two mechanisms deliver that and
 * they are worth telling apart: query-core's own retention of `query.data`
 * covers the failed refetch, and `rememberedUser` below covers the case
 * query-core cannot — see the comment on the ref for which is which.
 *
 * The "authoritatively unauthenticated" state is only reached when the query
 * returns 401/403 — a real auth rejection, not a network error. (`auth.me` is
 * an `authedQuery`: it throws UNAUTHORIZED rather than resolving with an
 * undefined user, so there is no successful-but-empty answer to handle.)
 */
export function useAuth() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const rememberedUser = useRef<AuthUser | null>(null);

  const query = trpc.auth.me.useQuery(undefined, {
    // 5 minutes fresh + no window-focus refetch keeps this call from firing
    // unless there's a real reason to.
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Restated rather than inherited, because this query sets its own options
    // and an omitted `retry` here would silently fall back to the default — the
    // exact drift that left the landing firing two 401s per anonymous visit.
    // A 401 is the answer, not a failure to get one; see
    // `explicitAuthFailure` below, which reads the same two codes.
    retry: retryQuery,
  });

  // A "real" unauthenticated state = the server explicitly said 401/403.
  // Computed FIRST, because it overrules everything below it.
  // The same two codes the retry policy treats as final, read from the same
  // list — a session this hook calls "rejected" and a query the retry policy
  // keeps asking about would be a contradiction, not a difference of opinion.
  const explicitAuthFailure =
    !!query.error && isAuthoritativeRejection(query.error.data?.code);

  // Keep the last known good user so a destroyed cache entry can't wipe it.
  //
  // WHAT THIS REF IS FOR — precisely, because the obvious answer is the wrong
  // one. A failed background refetch does NOT need it: query-core retains
  // `query.data` across a failed refetch by itself, and the sticky-refetch
  // tests in useAuth.test.tsx pass with this line deleted. What leaves nothing
  // to retain is the cache ENTRY being destroyed under a live session —
  // `queryClient.clear()`, which Login, Welcome and ResetPasswordConfirm each
  // call before entering the dashboard. The wipe is inert until any unrelated
  // re-render makes the observer rebuild its query; from that render on this
  // ref holds the only surviving copy of the session, and if the refetch that
  // follows fails non-authoritatively it is the only thing standing between the
  // user and a spurious login screen. Two tests cover exactly that and are the
  // only ones in the file that fail without it.
  //
  // The four react-hooks/refs holds below are one decision, not four. The rule
  // shipped with eslint-plugin-react-hooks v7 (React Compiler); this code
  // predates it. Moving the stickiness off the ref is still a real change to
  // session behaviour in the one file where a regression logs every user out,
  // but it is now a change with a test that would catch it. Held deliberately,
  // tracked in the technical-debt skill, and suppressed per-line so a NEW ref
  // misuse in this file is still reported.
  //
  // A 401 ENDS the session, including the copy of it in this ref and the one
  // query-core is still holding.
  //
  // `isAuthenticated` already excluded an explicit failure, but `user` did not,
  // and the two disagreeing is how `logout` came to not forget the user:
  // logout's onSuccess nulls the ref, its `invalidate` refetches, the refetch
  // 401s — and query-core RETAINS `query.data` across an error, so the very
  // next render both handed the stale user back to callers and wrote it into
  // the ref that had just been cleared. The hook's own docblock says logout
  // forgets the user; until this line it did not, and the test that claimed to
  // prove it was passing on an artifact (see useAuth.test.tsx).
  if (query.data && !explicitAuthFailure) {
    // eslint-disable-next-line react-hooks/refs
    rememberedUser.current = query.data;
  }
  const effectiveUser = explicitAuthFailure
    ? null
    : // eslint-disable-next-line react-hooks/refs
      (query.data ?? rememberedUser.current);

  // First-load only — while we're waiting on the initial call, don't route.
  const settled = query.isFetched;

  // Bound the wait. Without this the hook reports isLoading forever whenever the
  // query never settles at all, and every guarded page sits on a spinner with no
  // way out — see contracts/auth-resolution.ts for the reproduction and the
  // query-core mechanism behind it.
  //
  // The clock runs in VISIBLE time only. query-core parks a retry while the
  // document is hidden and resumes it on the next visibilitychange, so counting
  // down against a background tab would turn correct library behaviour into a
  // spurious redirect — the user cmd-clicks the dashboard, looks away, and comes
  // back to a login form. Re-armed on every visibilitychange, which also means a
  // returning user gets a full patience window rather than a stale one.
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      if (!shouldArmGiveUpTimer({ settled, documentHidden: document.hidden })) return;
      timer = setTimeout(() => setWaitedTooLong(true), AUTH_SETTLE_TIMEOUT_MS);
    };
    arm();
    document.addEventListener("visibilitychange", arm);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", arm);
    };
  }, [settled]);

  // "We never got an answer" — NOT "the server said no". Kept apart from
  // explicitAuthFailure so a stall is never recorded as proof of logout, and
  // gated on having no remembered user so sticky auth still wins outright.
  const isUnresolved = shouldGiveUpWaiting({
    settled,
    // eslint-disable-next-line react-hooks/refs
    hasRememberedUser: !!effectiveUser,
    timerElapsed: waitedTooLong,
  });

  // Flagged transitively: `effectiveUser` carries the ref value read above.
  const isAuthenticated =
    // eslint-disable-next-line react-hooks/refs
    !explicitAuthFailure && !isUnresolved && (!!effectiveUser || (!settled && !query.error));

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      notifyBrowserSignOut(rememberedUser.current?.browserSessionId);
      resetTabStores();
      rememberedUser.current = null;
      await utils.invalidate();
      navigate(LOGIN_PATH, { replace: true });
    },
    onError: async (error) => {
      if (!isAuthoritativeRejection(error.data?.code)) {
        toast.error("Sign-out could not be completed. Please try again.");
        return;
      }
      resetTabStores();
      rememberedUser.current = null;
      await utils.invalidate();
      navigate(LOGIN_PATH, { replace: true });
    },
  });

  const logout = useCallback(() => logoutMutation.mutate(), [logoutMutation]);

  // Same transitive read: `effectiveUser` is closed over by the memo.
  // eslint-disable-next-line react-hooks/refs
  return useMemo(
    () => ({
      user: effectiveUser ?? null,
      isAuthenticated,
      // "isLoading" is only true on the very first fetch — background refetches
      // do NOT show a loading state to callers, so the Dashboard doesn't flip
      // into its LoadingScreen every few minutes.
      isLoading: !settled && !query.error && !isUnresolved,
      isAuthoritativelyUnauthenticated: explicitAuthFailure,
      /** The auth check never answered and there is no session to fall back on.
       *  Callers should route to login, exactly as for an explicit rejection —
       *  but this is our patience running out, not the server's verdict. */
      isUnresolved,
      error: query.error,
      logout,
      refresh: query.refetch,
    }),
    [effectiveUser, isAuthenticated, settled, query.error, explicitAuthFailure, isUnresolved, logout, query.refetch],
  );
}
