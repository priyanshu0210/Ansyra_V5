// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

// REGRESSION TESTS for the blank page.
//
// The app shipped with no error boundary at all, and every route except the
// landing sits under a `lazy()` import. A lazy import that rejects throws during
// render, so a single missing chunk unmounted the whole tree: `#root` measured
// 0 children and 0 bytes, and /login was simply not there. Reproduced by
// removing one built chunk while the server stayed up — which is exactly what a
// deploy does to a tab that was already open.
//
// What these pin is the property that was missing, not the markup: after a
// throw, SOMETHING renders, and it tells the reader how to recover.

const CHUNK_MESSAGE = "Failed to fetch dynamically imported module: /assets/DataLayout-abc123.js";

function Boom({ message }: { message: string }): never {
  throw new Error(message);
}

describe("RouteErrorBoundary", () => {
  beforeEach(() => {
    // The boundary reloads on a FIRST chunk failure, and jsdom's
    // `location.reload` is not implemented — it warns instead of navigating.
    // Stubbed so the auto-recovery path can be asserted rather than avoided.
    vi.stubGlobal("location", { ...window.location, reload: vi.fn() });
    window.sessionStorage.clear();
    // Errors caught by a boundary are still reported to the console by React,
    // which would otherwise fill the run with expected noise.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders its children when nothing throws", () => {
    render(
      <RouteErrorBoundary>
        <p>the login form</p>
      </RouteErrorBoundary>,
    );
    expect(screen.getByText("the login form")).toBeTruthy();
  });

  // THE BUG ITSELF. Before the boundary existed this left an empty document.
  it("renders a recovery surface instead of nothing when a chunk fails to load", () => {
    // Marked as already-reloaded, so the boundary shows its message rather than
    // taking the automatic path — the state a reader ends up in when reloading
    // did not help.
    window.sessionStorage.setItem("ansyra:chunk-reload", String(Date.now()));

    const { container } = render(
      <RouteErrorBoundary>
        <Boom message={CHUNK_MESSAGE} />
      </RouteErrorBoundary>,
    );

    // The property that matters: the tree is not empty.
    expect(container.innerHTML.length).toBeGreaterThan(0);
    expect(screen.getByRole("alert")).toBeTruthy();
    // And there is a way out, not just an apology.
    expect(screen.getByRole("button", { name: /reload/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /sign in/i }).getAttribute("href")).toBe("/login");
  });

  it("reloads once on a first chunk failure, and records that it tried", () => {
    render(
      <RouteErrorBoundary>
        <Boom message={CHUNK_MESSAGE} />
      </RouteErrorBoundary>,
    );

    expect(window.location.reload).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem("ansyra:chunk-reload")).toBeTruthy();
  });

  // The loop guard. Without it, a chunk that stays missing — the server is
  // genuinely down, rather than a deploy having moved it — reloads forever.
  it("does not reload again once it has already tried", () => {
    window.sessionStorage.setItem("ansyra:chunk-reload", String(Date.now()));

    render(
      <RouteErrorBoundary>
        <Boom message={CHUNK_MESSAGE} />
      </RouteErrorBoundary>,
    );

    expect(window.location.reload).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  // An ordinary component error is not a stale deploy, so reloading is not
  // presumed to fix it and the copy does not claim it will.
  it("does not reload for a non-chunk error", () => {
    render(
      <RouteErrorBoundary>
        <Boom message="Cannot read properties of undefined (reading 'map')" />
      </RouteErrorBoundary>,
    );

    expect(window.location.reload).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByText(/Ansyra was updated/i)).toBeNull();
  });

  // Each engine words this differently and there is no error code to key on, so
  // the detection is a regex over prose (src/lib/chunk-error.ts, shared with
  // LazyBoundary) — which makes it worth pinning.
  it("recognises the chunk-failure wording of every engine", () => {
    const wordings = [
      "Failed to fetch dynamically imported module: /assets/x.js", // Chrome / Vite
      "error loading dynamically imported module", // Firefox
      "Importing a module script failed.", // Safari
    ];

    for (const message of wordings) {
      window.sessionStorage.clear();
      const { unmount } = render(
        <RouteErrorBoundary>
          <Boom message={message} />
        </RouteErrorBoundary>,
      );
      expect(
        window.sessionStorage.getItem("ansyra:chunk-reload"),
        `not detected as a chunk failure: ${message}`,
      ).toBeTruthy();
      unmount();
    }
  });
});
