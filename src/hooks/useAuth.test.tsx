// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { useAuth } from "./useAuth";
import { A_USER, TrpcStub, createHarness } from "@/test/trpc-harness";
import { genomeStore } from "@/lib/tab-stores";


// CHARACTERIZATION TESTS for the sticky-auth hook.
//
// Written against the implementation as it stood BEFORE the Phase 15.22
// restructure and required to pass unchanged after it. That is the only thing
// that makes the restructure safe: the ref-write-during-render this removes is
// load-bearing, and the failure mode if it is got wrong — every user silently
// logged out on a network blip — is one no unit test in this repo could see.
//
// The rules being pinned come from the hook's own docblock and from
// technical-debt's "deliberate workarounds" entry:
//   1. a background refetch FAILURE must never flip an established session out
//   2. only an explicit 401/403 is "authoritatively unauthenticated"
//   3. isLoading is the FIRST fetch only — never a background one
//   4. logout forgets the user
// Plus the Phase 15.14 bound: an unresolved cold start gives up, but never on
// someone whose session already resolved.

/**
 * useAuth sets `retry: 1` on its own query, and react-query's first backoff is
 * ~1s — so an ERROR takes about a second longer to surface than a success, and
 * waitFor's 1000ms default expires first. Raised rather than stubbed out,
 * because the retry is part of the behaviour these tests exist to protect.
 */
const SETTLES = { timeout: 4000 } as const;

function mount(stub: TrpcStub) {
  const { Wrapper, queryClient } = createHarness(stub);
  const view = renderHook(() => useAuth(), { wrapper: Wrapper });
  return { ...view, queryClient };
}

beforeEach(() => {
  vi.useRealTimers();
});
afterEach(() => {
  cleanup();
});

describe("resolving a session", () => {
  it("reports the user once auth.me answers", async () => {
    const stub = new TrpcStub().on("auth.me", { ok: A_USER });
    const { result } = mount(stub);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user?.email).toBe("member@ansyra.dev");
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isAuthoritativelyUnauthenticated).toBe(false);
    expect(result.current.isUnresolved).toBe(false);
  });

  it("is loading only until the FIRST answer", async () => {
    const stub = new TrpcStub().on("auth.me", { ok: A_USER });
    const { result } = mount(stub);
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });
});

describe("THE STICKY RULE — a failed refetch must not log anyone out", () => {
  it("keeps the user through a transient 500 on refetch", async () => {
    // The exact regression the remembered value exists to prevent: a network
    // hiccup or a cold-start on the pooler must not unmount the Dashboard.
    const stub = new TrpcStub().on(
      "auth.me",
      { ok: A_USER },
      { error: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } },
    );
    const { result } = mount(stub);
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.user?.email, "the user survives the failure").toBe(
      "member@ansyra.dev",
    );
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isAuthoritativelyUnauthenticated).toBe(false);
  });

  it("does NOT show a loading state during a background refetch", async () => {
    // Otherwise the Dashboard flips into its LoadingScreen every few minutes.
    const stub = new TrpcStub().on("auth.me", { ok: A_USER });
    const { result } = mount(stub);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let sawLoading = false;
    await act(async () => {
      const p = result.current.refresh();
      if (result.current.isLoading) sawLoading = true;
      await p;
    });
    expect(sawLoading).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });
});

describe("only an explicit rejection is authoritative", () => {
  it("a cold 401 is authoritatively unauthenticated", async () => {
    const stub = new TrpcStub().on("auth.me", {
      error: { code: "UNAUTHORIZED", httpStatus: 401 },
    });
    const { result } = mount(stub);

    await waitFor(
      () => expect(result.current.isAuthoritativelyUnauthenticated).toBe(true),
      SETTLES,
    );
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("a cold 403 is too", async () => {
    const stub = new TrpcStub().on("auth.me", {
      error: { code: "FORBIDDEN", httpStatus: 403 },
    });
    const { result } = mount(stub);
    await waitFor(
      () => expect(result.current.isAuthoritativelyUnauthenticated).toBe(true),
      SETTLES,
    );
  });

  it("a 500 is NOT — that is a broken server, not a rejected session", async () => {
    const stub = new TrpcStub().on("auth.me", {
      error: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
    });
    const { result } = mount(stub);

    await waitFor(() => expect(result.current.error).toBeTruthy(), SETTLES);
    expect(result.current.isAuthoritativelyUnauthenticated).toBe(false);
  });

  it("a 401 on REFETCH still logs out an established session", async () => {
    // The deliberate asymmetry with the 500 above: the server has now said the
    // session is gone, which is a fact rather than a hiccup.
    const stub = new TrpcStub().on(
      "auth.me",
      { ok: A_USER },
      { error: { code: "UNAUTHORIZED", httpStatus: 401 } },
    );
    const { result } = mount(stub);
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await act(async () => {
      await result.current.refresh().catch(() => {});
    });
    await waitFor(
      () => expect(result.current.isAuthoritativelyUnauthenticated).toBe(true),
      SETTLES,
    );
    expect(result.current.isAuthenticated).toBe(false);
    // `user`, not just the flag. query-core retains `query.data` across the
    // error, so without an explicit override the rejected session is still
    // handed to every caller that reads `user` — which is how `logout` came to
    // not forget the user. Fails against the hook as it stood before 2026-08-13.
    expect(result.current.user, "a rejected session is not a user").toBeNull();
  });
});

describe("WHAT THE REMEMBERED VALUE ACTUALLY BUYS", () => {
  // The docblock's stated reason — "a failed background refetch must not flip
  // us out" — is NOT it: react-query keeps `query.data` across a failed refetch
  // on its own, which is why the two STICKY RULE tests above pass with the
  // remembered value deleted. The ref only becomes load-bearing when the cache
  // ENTRY ITSELF is destroyed under a live session, because then there is no
  // `query.data` left to retain. `queryClient.clear()` is exactly that, and it
  // is a call this app makes — Login, Welcome and ResetPasswordConfirm all wipe
  // the cache before entering the dashboard.
  //
  // The first two tests below fail with `?? rememberedUser.current` removed and
  // nothing else in this file does — verified by deleting it and re-running.
  // The third is the counterweight: it passes either way, and it is here so the
  // pair above can never be "fixed" by making the remembered value outrank a
  // real rejection.
  it("survives the cache entry being destroyed, then a refetch that fails", async () => {
    const stub = new TrpcStub().on(
      "auth.me",
      { ok: A_USER },
      { error: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } },
    );
    const { result, rerender, queryClient } = mount(stub);
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await act(async () => {
      queryClient.clear();
    });
    // The wipe alone is inert — the observer holds the destroyed query object
    // until something makes it rebuild. ANY unrelated re-render is that nudge,
    // which is what makes this reachable rather than theoretical: the component
    // that cleared the cache does not have to be the one that re-renders.
    await act(async () => {
      rerender();
    });
    await waitFor(() => expect(result.current.error).toBeTruthy(), SETTLES);

    expect(result.current.user?.email, "the remembered user is all that is left").toBe(
      "member@ansyra.dev",
    );
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isAuthoritativelyUnauthenticated).toBe(false);
  });

  it("does not blink to signed-out on the way through the wipe", async () => {
    // Every render is recorded, not just the settled one: a single frame of
    // `user: null` is enough for a caller reading `user.email` to throw, and
    // `waitFor` on the end state would never see it.
    const seen: Array<string | null> = [];
    const stub = new TrpcStub().on(
      "auth.me",
      { ok: A_USER },
      { error: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } },
    );
    const { Wrapper, queryClient } = createHarness(stub);
    const { result, rerender } = renderHook(
      () => {
        const auth = useAuth();
        seen.push(auth.user?.email ?? null);
        return auth;
      },
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.user).not.toBeNull());
    const firstResolved = seen.length - 1;

    await act(async () => {
      queryClient.clear();
    });
    await act(async () => {
      rerender();
    });
    await waitFor(() => expect(result.current.error).toBeTruthy(), SETTLES);

    expect(seen.slice(firstResolved)).not.toContain(null);
  });

  it("still yields to a 401 after the wipe — remembering is not authority", async () => {
    const stub = new TrpcStub().on(
      "auth.me",
      { ok: A_USER },
      { error: { code: "UNAUTHORIZED", httpStatus: 401 } },
    );
    const { result, rerender, queryClient } = mount(stub);
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await act(async () => {
      queryClient.clear();
    });
    await act(async () => {
      rerender();
    });

    await waitFor(
      () => expect(result.current.isAuthoritativelyUnauthenticated).toBe(true),
      SETTLES,
    );
    expect(result.current.isAuthenticated).toBe(false);
  });
});

describe("logout forgets the user", () => {
  it("clears the session so a later render cannot resurrect it", async () => {
    genomeStore.set({ query: "Private company question", answer: "Prior account answer", matches: [{ id: 42, name: "Private deal", reason: "Prior account" }] });
    const stub = new TrpcStub()
      // After logout the SERVER rejects too. Without the second reply the
      // invalidate that follows logout refetches a still-valid session and the
      // user legitimately comes back — the stub, not the hook, would be wrong.
      .on("auth.me", { ok: A_USER }, { error: { code: "UNAUTHORIZED", httpStatus: 401 } })
      .on("auth.logout", { ok: { success: true } });
    const { result } = mount(stub);
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await act(async () => {
      result.current.logout();
    });

    await waitFor(() => expect(result.current.user).toBeNull(), SETTLES);
    await waitFor(() => expect(result.current.isAuthenticated).toBe(false), SETTLES);
    expect(genomeStore.get()).toEqual({ query: "", answer: null, matches: [] });
  });
});

describe("the Phase 15.14 bound", () => {
  it("never gives up on a session that already resolved", async () => {
    // The clause that stops the timeout reintroducing the very regression the
    // stickiness exists to prevent.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const stub = new TrpcStub().on("auth.me", { ok: A_USER });
    const { result } = mount(stub);
    await waitFor(() => expect(result.current.user).not.toBeNull());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(result.current.isUnresolved).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
    vi.useRealTimers();
  });
});
